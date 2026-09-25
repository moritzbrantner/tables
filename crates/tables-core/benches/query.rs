use std::fmt::Write;
use std::hint::black_box;
use std::time::Instant;

use tables_core::query::{
    TableFilter, TableFilterOperator, TableFilterValue, TableIndex, TableIndexResult, TableNulls,
    TableQuery, TableSearch, TableSort, TableSortDirection,
};

const SIZES: [usize; 4] = [1_000, 10_000, 50_000, 100_000];
const SAMPLES: usize = 7;

fn main() {
    let mut results = Vec::new();
    for size in SIZES {
        let mut index = TableIndex::new();
        index.add_numeric_column((0..size).map(|row| row as f64).collect(), vec![]);
        index.add_string_column(
            (0..size)
                .map(|row| format!("Account {}", row % 2_000))
                .collect(),
            vec![],
        );
        let sort_values = (0..size)
            .map(|row| ((row * 7_919) % 100_000) as f64)
            .collect::<Vec<_>>();
        index.add_numeric_column(sort_values.clone(), vec![]);
        let sort = vec![TableSort {
            column_index: 2,
            direction: TableSortDirection::Desc,
            nulls: TableNulls::Last,
        }];
        let filter = vec![TableFilter {
            column_index: 2,
            operator: TableFilterOperator::Gte,
            value: TableFilterValue::Number(50_000.0),
            case_sensitive: true,
        }];
        let queries = [
            (
                "identity-page",
                TableQuery {
                    row_offset: 200,
                    row_limit: Some(32),
                    ..TableQuery::default()
                },
            ),
            ("global-text", search("account", vec![0, 1, 2])),
            ("global-numeric", search("17", vec![0, 2])),
            (
                "text-page",
                TableQuery {
                    row_offset: 200,
                    row_limit: Some(32),
                    ..search("account", vec![0, 1, 2])
                },
            ),
            (
                "structured-filter",
                TableQuery {
                    filters: filter.clone(),
                    ..TableQuery::default()
                },
            ),
            (
                "full-sort",
                TableQuery {
                    sort: sort.clone(),
                    ..TableQuery::default()
                },
            ),
            (
                "sorted-page",
                TableQuery {
                    sort: sort.clone(),
                    row_offset: 200,
                    row_limit: Some(32),
                    ..TableQuery::default()
                },
            ),
            (
                "combined-page",
                TableQuery {
                    filters: filter,
                    sort,
                    row_limit: Some(32),
                    ..search("account", vec![0, 1, 2])
                },
            ),
        ];
        let iterations = (100_000 / size).clamp(1, 50);
        for (workload, query) in queries {
            let full_query = TableQuery {
                row_offset: 0,
                row_limit: None,
                ..query.clone()
            };
            let reference = || {
                if workload == "full-sort" {
                    let mut row_indices = (0..size as u32).collect::<Vec<_>>();
                    row_indices.sort_unstable_by(|left, right| {
                        sort_values[*left as usize]
                            .total_cmp(&sort_values[*right as usize])
                            .reverse()
                            .then_with(|| left.cmp(right))
                    });
                    return TableIndexResult {
                        filtered_row_count: size,
                        row_indices,
                    };
                }

                let mut result = index.query(black_box(&full_query));
                result.row_indices = result
                    .row_indices
                    .into_iter()
                    .skip(query.row_offset)
                    .take(query.row_limit.unwrap_or(usize::MAX))
                    .collect();
                result
            };
            let expected = reference();
            assert_eq!(index.query(&query), expected, "{workload}/{size}");
            let mut samples = Vec::new();
            let mut reference_samples = Vec::new();
            black_box(index.query(&query));
            black_box(reference());
            for sample in 0..SAMPLES {
                // Alternate order within the same process to reduce ordering bias.
                if sample % 2 == 0 {
                    samples.push(measure(iterations, || index.query(black_box(&query))));
                    if query.row_limit.is_some() || workload == "full-sort" {
                        reference_samples.push(measure(iterations, reference));
                    }
                } else {
                    if query.row_limit.is_some() || workload == "full-sort" {
                        reference_samples.push(measure(iterations, reference));
                    }
                    samples.push(measure(iterations, || index.query(black_box(&query))));
                }
                assert_eq!(index.query(&query), expected);
            }
            let median_ns = median(&samples);
            let reference_median = if reference_samples.is_empty() {
                "null".into()
            } else {
                format!("{:.3}", median(&reference_samples))
            };
            let checksum =
                expected
                    .row_indices
                    .iter()
                    .enumerate()
                    .fold(0_u64, |sum, (position, row)| {
                        sum.wrapping_add((position as u64 + 1).wrapping_mul(u64::from(*row) + 1))
                    });
            println!(
                "{workload}/{size}: median={median_ns:.3} ns full-materialization-reference={reference_median} ns"
            );
            results.push(format!(
                "{{\"workload\":\"{workload}\",\"size\":{size},\"iterations\":{iterations},\"medianNs\":{median_ns:.3},\"samplesNs\":{samples:?},\"referenceMedianNs\":{reference_median},\"referenceSamplesNs\":{reference_samples:?},\"filteredRowCount\":{},\"checksum\":\"{checksum}\"}}",
                expected.filtered_row_count,
            ));
        }
    }
    let mut report = String::new();
    writeln!(report,
        "{{\"version\":1,\"suite\":\"tables-core-query-v1\",\"arch\":\"{}\",\"os\":\"{}\",\"sampleCount\":{SAMPLES},\"reference\":\"paged workloads use the same kernel with full materialization; full-sort uses a direct f64 total_cmp comparator reference over the identical fixture\",\"results\":[{}]}}",
        std::env::consts::ARCH, std::env::consts::OS, results.join(","),
    ).unwrap();
    // Cargo runs benches from the crate directory, not the workspace root.
    let output = std::env::var_os("TABLES_QUERY_BENCH_OUTPUT")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| {
            std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("../../.artifacts/table-core-query-benchmark.json")
        });
    let path = output.as_path();
    if let Some(parent) = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
    {
        std::fs::create_dir_all(parent).unwrap();
    }
    std::fs::write(path, report).unwrap();
}

fn search(text: &str, columns: Vec<usize>) -> TableQuery {
    TableQuery {
        search: Some(TableSearch {
            column_indices: columns,
            query: text.into(),
            case_sensitive: false,
        }),
        ..TableQuery::default()
    }
}

fn measure(iterations: usize, mut operation: impl FnMut() -> TableIndexResult) -> f64 {
    let start = Instant::now();
    for _ in 0..iterations {
        black_box(operation());
    }
    start.elapsed().as_nanos() as f64 / iterations as f64
}

fn median(samples: &[f64]) -> f64 {
    let mut ordered = samples.to_vec();
    ordered.sort_unstable_by(f64::total_cmp);
    ordered[ordered.len() / 2]
}
