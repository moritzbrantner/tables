use std::hint::black_box;
use std::time::Instant;

use tables_core::query::{TableIndex, TableNulls, TableQuery, TableSort, TableSortDirection};

const SIZES: [usize; 3] = [1_000, 10_000, 100_000];
const SAMPLES: usize = 7;

fn main() {
    for size in SIZES {
        let source = (0..size)
            .map(|row| format!("Account {}", row % 2_000))
            .collect::<Vec<_>>();
        let validity = vec![1; size];
        let iterations = (100_000 / size).clamp(1, 50);

        // Check that deferring lowercase storage does not affect string ordering.
        let mut correctness = TableIndex::new();
        let string_column = correctness.add_string_column(source.clone(), validity.clone());
        let sorted = correctness.query(&TableQuery {
            sort: vec![TableSort {
                column_index: string_column,
                direction: TableSortDirection::Asc,
                nulls: TableNulls::Last,
            }],
            row_limit: Some(32),
            ..TableQuery::default()
        });
        assert_eq!(sorted.filtered_row_count, size);
        assert_eq!(sorted.row_indices.len(), 32.min(size));

        // Both paths clone the same source strings and validity. The explicit
        // reference adds only the eager lowercase shadow work removed from the
        // index constructor; it is a work reference, not historical code.
        let mut candidate = Vec::with_capacity(SAMPLES);
        let mut eager_reference = Vec::with_capacity(SAMPLES);
        for sample in 0..SAMPLES {
            if sample % 2 == 0 {
                candidate.push(measure(iterations, || build(&source, &validity)));
                eager_reference.push(measure(iterations, || {
                    build_with_eager_lowercase_reference(&source, &validity)
                }));
            } else {
                eager_reference.push(measure(iterations, || {
                    build_with_eager_lowercase_reference(&source, &validity)
                }));
                candidate.push(measure(iterations, || build(&source, &validity)));
            }
        }

        let candidate_ns = median(&candidate);
        let eager_ns = median(&eager_reference);
        println!(
            "string-index-build/{size}: lazy={candidate_ns:.3} ns eager-lowercase-work-reference={eager_ns:.3} ns ratio={:.3}",
            candidate_ns / eager_ns
        );
    }
}

fn build(source: &[String], validity: &[u8]) -> usize {
    let mut index = TableIndex::new();
    index.add_string_column(source.to_vec(), validity.to_vec());
    black_box(index.row_count())
}

fn build_with_eager_lowercase_reference(source: &[String], validity: &[u8]) -> usize {
    let values = source.to_vec();
    let normalized = values
        .iter()
        .map(|value| value.to_lowercase())
        .collect::<Vec<_>>();
    black_box(&normalized);
    let mut index = TableIndex::new();
    index.add_string_column(values, validity.to_vec());
    black_box(index.row_count())
}

fn measure(iterations: usize, mut operation: impl FnMut() -> usize) -> f64 {
    let started = Instant::now();
    for _ in 0..iterations {
        black_box(operation());
    }
    started.elapsed().as_nanos() as f64 / iterations as f64
}

fn median(samples: &[f64]) -> f64 {
    let mut ordered = samples.to_vec();
    ordered.sort_unstable_by(f64::total_cmp);
    ordered[ordered.len() / 2]
}
