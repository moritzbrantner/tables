//! Bounded order-statistic windows and allocation-free integer search.
use super::{PreparedQuery, TableIndexResult, TableQuery, window_rows};
use std::cmp::Ordering;
use std::fmt::Write;

/// Retain the smaller useful side of an ordered result. Near the beginning this
/// is offset + limit rows, not all matches. Near the end, a count-only pass lets
/// us retain the suffix instead. Middle/deep windows can still require O(N)
/// space; arbitrary offset pagination is not advertised as O(page size).
pub(super) fn query_window(
    row_count: usize,
    prepared: &PreparedQuery<'_>,
    query: &TableQuery,
    limit: usize,
) -> TableIndexResult {
    let prefix = query.row_offset.saturating_add(limit).min(row_count);
    let mut text = String::new();
    let (reverse, capacity, known_count) = if query.row_offset > row_count / 2 {
        let count = (0..row_count)
            .filter(|row| prepared.row_matches(*row, &mut text))
            .count();
        if query.row_offset >= count {
            return TableIndexResult {
                filtered_row_count: count,
                row_indices: Vec::new(),
            };
        }
        let suffix = count - query.row_offset;
        (suffix < prefix, prefix.min(suffix), Some(count))
    } else {
        (false, prefix, None)
    };
    let compare = |left: u32, right: u32| {
        let order = prepared.compare_rows(left, right);
        if reverse { order.reverse() } else { order }
    };
    // Compact batches instead of maintaining a heap for every matching row.
    // Each reduction is linear in at most 2K indices and keeps the best K.
    let buffer_limit = capacity.saturating_mul(2).min(row_count);
    let mut kept = Vec::with_capacity(buffer_limit);
    let mut cutoff = None;
    let mut count = 0;
    for row in 0..row_count {
        if !prepared.row_matches(row, &mut text) {
            continue;
        }
        count += 1;
        let row = row as u32;
        if cutoff.is_some_and(|worst| compare(row, worst) != Ordering::Less) {
            continue;
        }
        kept.push(row);
        if kept.len() == buffer_limit {
            cutoff = Some(reduce(&mut kept, capacity, &compare));
        }
    }
    debug_assert!(known_count.is_none_or(|expected| expected == count));
    if kept.len() > capacity {
        reduce(&mut kept, capacity, &compare);
    }
    let start = if reverse {
        0
    } else {
        query.row_offset.min(kept.len())
    };
    let end = start.saturating_add(limit).min(kept.len());
    if start == end {
        kept.clear();
    } else {
        if end < kept.len() {
            kept.select_nth_unstable_by(end, |left, right| prepared.compare_rows(*left, *right));
            kept.truncate(end);
        }
        if start > 0 {
            kept.select_nth_unstable_by(start, |left, right| prepared.compare_rows(*left, *right));
        }
        kept = window_rows(kept, start, None);
        kept.sort_unstable_by(|left, right| prepared.compare_rows(*left, *right));
    }
    TableIndexResult {
        filtered_row_count: count,
        row_indices: kept,
    }
}

fn reduce(rows: &mut Vec<u32>, capacity: usize, compare: &impl Fn(u32, u32) -> Ordering) -> u32 {
    rows.select_nth_unstable_by(capacity - 1, |left, right| compare(*left, *right));
    let cutoff = rows[capacity - 1];
    rows.truncate(capacity);
    cutoff
}

pub(super) fn numeric_contains(value: f64, needle: &str, scratch: &mut String) -> bool {
    // Safe integral values have the same decimal display as this integer path.
    // Fractions and large/extreme magnitudes stay on Rust's f64 Display path.
    if value.abs() <= 9_007_199_254_740_991.0 && value == value.trunc() {
        let mut digits = [0_u8; 21];
        let mut start = digits.len();
        let mut number = value.abs() as u64;
        loop {
            start -= 1;
            digits[start] = b'0' + (number % 10) as u8;
            number /= 10;
            if number == 0 {
                break;
            }
        }
        if value.is_sign_negative() {
            start -= 1;
            digits[start] = b'-';
        }
        return needle.is_empty()
            || digits[start..]
                .windows(needle.len())
                .any(|candidate| candidate == needle.as_bytes());
    }
    scratch.clear();
    write!(scratch, "{value}").expect("formatting into String cannot fail");
    scratch.contains(needle)
}
