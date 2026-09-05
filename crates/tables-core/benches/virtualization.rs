use std::hint::black_box;
use std::time::{Duration, Instant};

use tables_core::{
    FixedVirtualRangeOptions, VariableLayout, VariableVirtualRangeOptions, fixed_virtual_range,
};

fn main() {
    println!("tables-core descriptive benchmark; timings are evidence, not thresholds");

    let item_sizes: Vec<f64> = (0..100_000)
        .map(|index| 20.0 + ((index * 17) % 41) as f64)
        .collect();
    let layout = VariableLayout::new(&item_sizes);

    run("fixed-range-query", 1_000_000, |iteration| {
        fixed_virtual_range(FixedVirtualRangeOptions {
            count: 1_000_000,
            item_size: 32.0,
            overscan: 4,
            scroll_offset: ((iteration * 97) % 31_000_000) as f64,
            viewport_size: 768.0,
        })
    });

    run("cached-variable-range-query", 500_000, |iteration| {
        layout.virtual_range(VariableVirtualRangeOptions {
            overscan: 3,
            scroll_offset: ((iteration * 53) as f64) % layout.total_size(),
            viewport_size: 900.0,
        })
    });

    run("variable-layout-build-100k", 100, |_| {
        VariableLayout::new(black_box(&item_sizes))
    });
}

fn run<T>(label: &str, iterations: usize, mut operation: impl FnMut(usize) -> T) {
    for iteration in 0..iterations.min(10_000) {
        black_box(operation(iteration));
    }

    let started = Instant::now();
    for iteration in 0..iterations {
        black_box(operation(iteration));
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
