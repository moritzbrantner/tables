//! Deterministic work limits. Wall-clock timings deliberately do not gate tests.
use std::alloc::{GlobalAlloc, Layout, System};
use std::cell::Cell;
use std::hint::black_box;

use tables_core::query::{
    TableFilter, TableFilterOperator, TableFilterValue, TableIndex, TableNulls, TableQuery,
    TableSearch, TableSort, TableSortDirection,
};

#[derive(Clone, Copy, Debug, Default)]
struct Allocations {
    calls: usize,
    bytes: usize,
}

thread_local! {
    // Thread-local measurement excludes the parallel test harness and other tests.
    static COUNTERS: Cell<Option<Allocations>> = const { Cell::new(None) };
}

struct CountingAllocator;

fn record(bytes: usize) {
    let _ = COUNTERS.try_with(|slot| {
        if let Some(mut counters) = slot.get() {
            counters.calls += 1;
            counters.bytes += bytes;
            slot.set(Some(counters));
        }
    });
}

// SAFETY: every allocation operation is forwarded unchanged to System. The
// thread-local counters neither allocate nor dereference the forwarded pointer.
unsafe impl GlobalAlloc for CountingAllocator {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        record(layout.size());
        // SAFETY: the caller supplies the GlobalAlloc layout contract.
        unsafe { System.alloc(layout) }
    }

    unsafe fn alloc_zeroed(&self, layout: Layout) -> *mut u8 {
        record(layout.size());
        // SAFETY: the caller supplies the GlobalAlloc layout contract.
        unsafe { System.alloc_zeroed(layout) }
    }

    unsafe fn dealloc(&self, pointer: *mut u8, layout: Layout) {
        // SAFETY: this pointer and layout originated from the forwarded allocator.
        unsafe { System.dealloc(pointer, layout) }
    }

    unsafe fn realloc(&self, pointer: *mut u8, layout: Layout, new_size: usize) -> *mut u8 {
        record(new_size);
        // SAFETY: the caller supplies the GlobalAlloc reallocation contract.
        unsafe { System.realloc(pointer, layout, new_size) }
    }
}

#[global_allocator]
static ALLOCATOR: CountingAllocator = CountingAllocator;

fn measure<T>(operation: impl FnOnce() -> T) -> (T, Allocations) {
    struct Reset;
    impl Drop for Reset {
        fn drop(&mut self) {
            COUNTERS.set(None);
        }
    }
    COUNTERS.set(Some(Allocations::default()));
    let reset = Reset;
    let result = black_box(operation());
    let counters = COUNTERS
        .replace(None)
        .expect("allocation measurement is enabled");
    drop(reset);
    (result, counters)
}

fn fixture(size: usize) -> TableIndex {
    let mut index = TableIndex::new();
    index.add_numeric_column((0..size).map(|row| row as f64).collect(), vec![]);
    index.add_boolean_column((0..size).map(|row| (row % 2) as u8).collect(), vec![]);
    index.add_string_column(
        (0..size)
            .map(|row| format!("Account {}", row % 2_000))
            .collect(),
        vec![],
    );
    index
}

fn search(text: &str, columns: Vec<usize>) -> TableQuery {
    TableQuery {
        search: Some(TableSearch {
            query: text.into(),
            column_indices: columns,
            case_sensitive: false,
        }),
        ..TableQuery::default()
    }
}

#[test]
fn allocation_meter_detects_real_allocations() {
    let (buffer, allocations) = measure(|| vec![black_box(7_u8); black_box(4_096)]);
    assert_eq!(buffer.len(), 4_096);
    assert!(allocations.calls >= 1);
    assert!(allocations.bytes >= 4_096);
}

#[test]
fn string_column_build_does_not_allocate_lowercase_shadow_values() {
    for size in [1_000, 10_000, 100_000] {
        let values = (0..size)
            .map(|row| format!("Account {}", row % 2_000))
            .collect::<Vec<_>>();
        let validity = vec![1; size];
        let (index, allocations) = measure(|| {
            let mut index = TableIndex::new();
            index.add_string_column(values, validity);
            index
        });
        assert_eq!(index.row_count(), size);
        // Column-vector storage is bounded. A per-row lowercase shadow would
        // add O(N) String allocations and bytes here.
        assert!(allocations.calls <= 2, "{size} rows: {allocations:?}");
        assert!(allocations.bytes <= 2_048, "{size} rows: {allocations:?}");
    }
}

#[test]
fn search_allocations_do_not_scale_with_row_count() {
    for size in [1_000, 10_000, 100_000] {
        let index = fixture(size);
        // Lowercase string storage is one-time index-derived state. Prime it
        // outside the hot-query allocation measurement.
        black_box(index.query(&search("account", vec![2])));
        for query in [search("account", vec![0, 1, 2]), search("17", vec![0])] {
            let (result, allocations) = measure(|| index.query(black_box(&query)));
            assert!(result.filtered_row_count > 0);
            assert!(allocations.calls <= 8, "{size} rows: {allocations:?}");
            // One u32 result buffer, plus bounded query preparation/numeric scratch.
            assert!(allocations.bytes <= size * 4 + 2_048, "{allocations:?}");
            println!("search rows={size} allocations={allocations:?}");
        }
    }
}

#[test]
fn unsorted_pages_allocate_for_the_page_not_the_dataset() {
    for size in [1_000, 10_000, 100_000] {
        let index = fixture(size);
        // These are steady-state page-allocation ratchets. First-use string
        // normalization is index preparation and is measured separately.
        black_box(index.query(&search("account", vec![2])));
        for mut query in [TableQuery::default(), search("account", vec![0, 1, 2])] {
            query.row_offset = 200;
            query.row_limit = Some(32);
            let (result, allocations) = measure(|| index.query(black_box(&query)));
            assert_eq!(result.filtered_row_count, size);
            assert_eq!(result.row_indices, (200..232).collect::<Vec<u32>>());
            assert!(allocations.calls <= 6, "{allocations:?}");
            assert!(allocations.bytes <= 2_048, "{size} rows: {allocations:?}");
            assert!(result.row_indices.capacity() <= 32);
            println!("page rows={size} allocations={allocations:?}");
        }
    }
}

#[test]
fn membership_preparation_and_sort_do_not_reintroduce_row_allocations() {
    let size = 100_000;
    let index = fixture(size);
    // Keep this ratchet focused on repeated filter/sort work. The derived
    // lowercase string cache is one-time index preparation.
    black_box(index.query(&search("account", vec![2])));
    let query = TableQuery {
        filters: vec![TableFilter {
            column_index: 2,
            operator: TableFilterOperator::In,
            value: TableFilterValue::Strings {
                values: vec![
                    "ACCOUNT 1".into(),
                    "account 17".into(),
                    "Account 200".into(),
                ],
                include_null: false,
            },
            case_sensitive: false,
        }],
        sort: vec![TableSort {
            column_index: 0,
            direction: TableSortDirection::Desc,
            nulls: TableNulls::Last,
        }],
        row_limit: Some(10),
        ..TableQuery::default()
    };
    let (result, allocations) = measure(|| index.query(black_box(&query)));
    assert_eq!(result.filtered_row_count, 150);
    assert_eq!(result.row_indices.len(), 10);
    assert!(result.row_indices.windows(2).all(|pair| pair[0] > pair[1]));
    assert!(allocations.calls <= 10, "{allocations:?}");
    assert!(allocations.bytes <= size * 4 + 2_048, "{allocations:?}");
}

#[test]
fn every_window_matches_the_full_stable_order() {
    let size = 257;
    let mut index = TableIndex::new();
    let values = (0..size).map(|row| ((row * 7_919) % 31) as f64).collect();
    let validity = (0..size).map(|row| u8::from(row % 11 != 0)).collect();
    index.add_numeric_column(values, validity);
    index.add_boolean_column((0..size).map(|row| (row % 3 != 0) as u8).collect(), vec![]);
    let rule = |direction, nulls| TableSort {
        column_index: 0,
        direction,
        nulls,
    };
    for sort in [
        vec![],
        vec![rule(TableSortDirection::Asc, TableNulls::Last)],
        vec![rule(TableSortDirection::Desc, TableNulls::First)],
        vec![
            TableSort {
                column_index: 99,
                ..rule(TableSortDirection::Asc, TableNulls::Last)
            },
            TableSort {
                column_index: 1,
                ..rule(TableSortDirection::Desc, TableNulls::Last)
            },
            rule(TableSortDirection::Asc, TableNulls::First),
        ],
    ] {
        for filters in [
            vec![],
            vec![TableFilter {
                column_index: 1,
                operator: TableFilterOperator::Equals,
                value: TableFilterValue::Boolean(true),
                case_sensitive: true,
            }],
        ] {
            let mut query = TableQuery {
                sort: sort.clone(),
                filters,
                ..TableQuery::default()
            };
            let full = index.query(&query);
            for offset in [0, 1, 7, size / 2, size - 1, size, size + 1, usize::MAX] {
                for limit in [
                    None,
                    Some(0),
                    Some(1),
                    Some(5),
                    Some(size),
                    Some(usize::MAX),
                ] {
                    query.row_offset = offset;
                    query.row_limit = limit;
                    let actual = index.query(&query);
                    let expected: Vec<_> = full
                        .row_indices
                        .iter()
                        .copied()
                        .skip(offset)
                        .take(limit.unwrap_or(usize::MAX))
                        .collect();
                    assert_eq!(
                        actual.row_indices, expected,
                        "offset={offset} limit={limit:?}"
                    );
                    assert_eq!(actual.filtered_row_count, full.filtered_row_count);
                }
            }
        }
    }
}

#[test]
fn numeric_search_preserves_display_for_extremes_and_nulls() {
    let values = vec![
        0.0,
        -0.0,
        1.25,
        -17.5,
        f64::MAX,
        f64::MIN_POSITIVE,
        f64::from_bits(1),
        f64::NAN,
        f64::INFINITY,
        17.0,
    ];
    let validity = vec![1, 1, 1, 1, 1, 1, 1, 1, 1, 0];
    let mut index = TableIndex::new();
    index.add_numeric_column(values.clone(), validity.clone());
    for needle in [
        "0", "17", "-", ".", "e", "E", "+", "account", "NaN", "inf", "ä",
    ] {
        for case_sensitive in [false, true] {
            let mut query = search(needle, vec![0, 99]);
            query.search.as_mut().unwrap().case_sensitive = case_sensitive;
            let normalized = if case_sensitive {
                needle.into()
            } else {
                needle.to_lowercase()
            };
            let expected: Vec<_> = values
                .iter()
                .enumerate()
                .filter(|(row, value)| validity[*row] != 0 && value.is_finite())
                .filter(|(_, value)| value.to_string().contains(&normalized))
                .map(|(row, _)| row as u32)
                .collect();
            assert_eq!(index.query(&query).row_indices, expected, "needle={needle}");
        }
    }
}

#[test]
fn sorted_edge_pages_do_not_retain_all_source_rows() {
    for size in [1_000, 10_000, 100_000] {
        let index = fixture(size);
        for offset in [0, 200, size - 32] {
            let query = TableQuery {
                sort: vec![TableSort {
                    column_index: 0,
                    direction: TableSortDirection::Desc,
                    nulls: TableNulls::Last,
                }],
                row_offset: offset,
                row_limit: Some(32),
                ..TableQuery::default()
            };
            let (result, allocations) = measure(|| index.query(black_box(&query)));
            let expected = (0..size as u32)
                .rev()
                .skip(offset)
                .take(32)
                .collect::<Vec<_>>();
            assert_eq!(result.row_indices, expected);
            assert_eq!(result.filtered_row_count, size);
            assert!(
                allocations.bytes <= 4_096,
                "{size}/{offset}: {allocations:?}"
            );
            assert!(result.row_indices.capacity() <= 464);
        }
    }
}

#[test]
fn integer_search_matches_f64_display_without_numeric_scratch_allocations() {
    let values = (0..10_000)
        .map(|row| (row * 7_919) as f64 - 30_000_000.0)
        .collect::<Vec<_>>();
    let mut index = TableIndex::new();
    index.add_numeric_column(values.clone(), vec![]);
    for needle in ["0", "17", "-", "91", "+", "e", "."] {
        let query = search(needle, vec![0]);
        let expected = values
            .iter()
            .enumerate()
            .filter(|(_, value)| value.to_string().contains(needle))
            .map(|(row, _)| row as u32)
            .collect::<Vec<_>>();
        let (result, allocations) = measure(|| index.query(black_box(&query)));
        assert_eq!(result.row_indices, expected);
        assert!(allocations.calls <= 3, "{needle}: {allocations:?}");
    }
}

#[test]
fn prepared_pages_have_zero_scan_work_and_page_sized_allocations_at_any_depth() {
    for size in [1_000, 10_000, 100_000] {
        let index = fixture(size);
        let snapshot = index.prepare_query(&TableQuery {
            sort: vec![TableSort {
                column_index: 0,
                direction: TableSortDirection::Desc,
                nulls: TableNulls::Last,
            }],
            // Preparation deliberately ignores the caller's transient page.
            row_offset: 123,
            row_limit: Some(1),
            ..TableQuery::default()
        });
        assert_eq!(snapshot.filtered_row_count(), size);
        assert_eq!(snapshot.retained_index_bytes(), size * 4);
        drop(index); // A page cannot scan/filter/sort an index that no longer exists.
        for offset in [0, size / 2, size - 32, size, usize::MAX] {
            let (count, iterator_allocations) =
                measure(|| snapshot.window_indices(offset, 32).count());
            assert_eq!(iterator_allocations.calls, 0);
            assert_eq!(count, size.saturating_sub(offset).min(32));
            let (page, allocations) =
                measure(|| snapshot.window_indices(offset, 32).collect::<Vec<_>>());
            assert!(allocations.calls <= 1, "{allocations:?}");
            assert!(
                allocations.bytes <= 32 * 4,
                "{size}/{offset}: {allocations:?}"
            );
            let expected: Vec<_> = (0..size as u32).rev().skip(offset).take(32).collect();
            assert_eq!(page, expected);
        }
    }
}

#[test]
fn identity_preparation_does_not_materialize_the_dataset() {
    let index = fixture(100_000);
    let (snapshot, allocations) = measure(|| index.prepare_query(&TableQuery::default()));
    assert_eq!(allocations.calls, 0);
    assert_eq!(snapshot.retained_index_bytes(), 0);
    assert_eq!(snapshot.filtered_row_count(), 100_000);
    assert_eq!(
        snapshot
            .window_indices(99_990, usize::MAX)
            .collect::<Vec<_>>(),
        (99_990..100_000).collect::<Vec<_>>()
    );
}

#[test]
fn prepared_query_preserves_nulls_ties_unicode_and_snapshot_isolation() {
    let mut index = TableIndex::new();
    index.add_string_column(
        vec![
            "Äpfel".into(),
            "Other".into(),
            "ÄPFEL".into(),
            "Äpfel".into(),
            "Äpfel".into(),
        ],
        vec![],
    );
    index.add_numeric_column(vec![0.0, 0.0, -0.0, 7.0, 7.0], vec![1, 1, 1, 0, 1]);
    for direction in [TableSortDirection::Asc, TableSortDirection::Desc] {
        for nulls in [TableNulls::First, TableNulls::Last] {
            let query = TableQuery {
                search: Some(TableSearch {
                    case_sensitive: false,
                    column_indices: vec![0],
                    query: "ÄPF".into(),
                }),
                sort: vec![TableSort {
                    column_index: 1,
                    direction,
                    nulls,
                }],
                ..TableQuery::default()
            };
            let full = index.query(&query);
            let snapshot = index.prepare_query(&query);
            assert_eq!(snapshot.filtered_row_count(), 4);
            assert_eq!(snapshot.retained_index_bytes(), 16);
            for offset in [0, 1, 3, 4, usize::MAX] {
                for limit in [0, 1, 2, usize::MAX] {
                    assert_eq!(
                        snapshot.window_indices(offset, limit).collect::<Vec<_>>(),
                        full.row_indices
                            .iter()
                            .copied()
                            .skip(offset)
                            .take(limit)
                            .collect::<Vec<_>>()
                    );
                }
            }
        }
    }
    let snapshot = index.prepare_query(&TableQuery::default());
    index.add_numeric_column(vec![1.0; 100], vec![]);
    assert_eq!(index.row_count(), 100);
    assert_eq!(snapshot.filtered_row_count(), 5);
    assert_eq!(
        snapshot.window_indices(0, 100).collect::<Vec<_>>(),
        vec![0, 1, 2, 3, 4]
    );
}
