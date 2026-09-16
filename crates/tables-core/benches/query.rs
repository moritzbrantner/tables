use std::hint::black_box;
use std::time::{Duration, Instant};

use tables_core::query::{
    TableFilter, TableFilterOperator, TableFilterValue, TableIndex, TableNulls, TableQuery,
    TableSearch, TableSort, TableSortDirection,
};

const ROW_COUNT: usize = 50_000;
const ITERATIONS: usize = 100;

fn main() {
    println!("tables-core query benchmark; timings are evidence, not thresholds");

    let mut index = TableIndex::new();
    let stage = index.add_string_column(
        (0..ROW_COUNT)
            .map(|row| ["Discovery", "Proposal", "Review", "Closed"][(row * 7) % 4].into())
            .collect(),
        vec![1; ROW_COUNT],
    );
    let name = index.add_string_column(
        (0..ROW_COUNT)
            .map(|row| format!("Account {}", row % 2_000))
            .collect(),
        vec![1; ROW_COUNT],
    );
    let region = index.add_string_column(
        (0..ROW_COUNT)
            .map(|row| {
                ["Europe", "North America", "Asia Pacific", "Latin America"][row % 4].into()
            })
            .collect(),
        vec![1; ROW_COUNT],
    );
    let value = index.add_numeric_column(
        (0..ROW_COUNT)
            .map(|row| ((row * 7_919) % 100_000) as f64)
            .collect(),
        vec![1; ROW_COUNT],
    );

    let query = TableQuery {
        filters: vec![TableFilter {
            case_sensitive: true,
            column_index: stage,
            operator: TableFilterOperator::Equals,
            value: TableFilterValue::String("Proposal".into()),
        }],
        search: Some(TableSearch {
            case_sensitive: false,
            column_indices: vec![name],
            query: "account".into(),
        }),
        sort: vec![
            TableSort {
                column_index: region,
                direction: TableSortDirection::Asc,
                nulls: TableNulls::Last,
            },
            TableSort {
                column_index: value,
                direction: TableSortDirection::Desc,
                nulls: TableNulls::First,
            },
        ],
        row_limit: None,
        row_offset: 0,
    };

    let expected_count = ROW_COUNT / 4;
    assert_eq!(index.query(&query).filtered_row_count, expected_count);

    run("combined-query-50k", ITERATIONS, || index.query(black_box(&query)));
}

fn run<T>(label: &str, iterations: usize, mut operation: impl FnMut() -> T) {
    for _ in 0..iterations.min(10) {
        black_box(operation());
    }

    let started = Instant::now();
    for _ in 0..iterations {
        black_box(operation());
    }
    let elapsed = started.elapsed();

    println!(
        "{label}: iterations={iterations} elapsed={} ns/op={:.2}",
        format_duration(elapsed),
        elapsed.as_nanos() as f64 / iterations as f64,
    );
}

fn format_duration(duration: Duration) -> String {
    format!("{:.3}s", duration.as_secs_f64())
}
