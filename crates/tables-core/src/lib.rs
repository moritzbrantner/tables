//! Pure, allocation-conscious kernels for table virtualization.
//!
//! This crate deliberately owns only table-specific computation. Rendering,
//! accessibility, controlled state, and DOM event handling stay in the
//! TypeScript/React layer, while filtering and sorting remain owned by
//! `@moritzbrantner/viz-engine`.

#![forbid(unsafe_code)]
#![warn(missing_docs)]

/// A half-open virtualized item range and its surrounding geometry.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct VirtualRange {
    /// Exclusive end index of the rendered range.
    pub end_index: usize,
    /// Size after the rendered range.
    pub offset_after: f64,
    /// Size before the rendered range.
    pub offset_before: f64,
    /// Inclusive start index of the rendered range.
    pub start_index: usize,
    /// Total size of all items.
    pub total_size: f64,
    /// Number of rendered items.
    pub visible_count: usize,
}

/// Input for a fixed-size virtualization query.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct FixedVirtualRangeOptions {
    /// Number of items in the collection.
    pub count: usize,
    /// Size of one item.
    pub item_size: f64,
    /// Number of extra items rendered on each side of the visible range.
    pub overscan: usize,
    /// Current scroll offset.
    pub scroll_offset: f64,
    /// Size of the visible viewport.
    pub viewport_size: f64,
}

/// Input for a variable-size virtualization query against a cached layout.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct VariableVirtualRangeOptions {
    /// Number of extra items rendered on each side of the visible range.
    pub overscan: usize,
    /// Current scroll offset.
    pub scroll_offset: f64,
    /// Size of the visible viewport.
    pub viewport_size: f64,
}

/// Precomputed offsets for a variable-size item collection.
///
/// Construction is O(n). Reusing the layout makes each viewport query O(log n)
/// and allocation-free, avoiding the per-query prefix-array rebuild performed
/// by the current TypeScript convenience implementation.
#[derive(Clone, Debug, PartialEq)]
pub struct VariableLayout {
    offsets: Vec<f64>,
}

impl VariableLayout {
    /// Builds a reusable variable-size layout.
    ///
    /// Negative, non-finite, and NaN sizes are normalized to zero so malformed
    /// geometry cannot corrupt later binary-search queries.
    #[must_use]
    pub fn new(item_sizes: &[f64]) -> Self {
        let mut offsets = Vec::with_capacity(item_sizes.len().saturating_add(1));
        let mut total = 0.0;
        offsets.push(total);

        for &size in item_sizes {
            total += normalized_size(size);
            offsets.push(total);
        }

        Self { offsets }
    }

    /// Returns true when the layout has no items.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// Returns the number of items represented by the layout.
    #[must_use]
    pub fn len(&self) -> usize {
        self.offsets.len().saturating_sub(1)
    }

    /// Returns the cached prefix offsets, including the leading zero and final total.
    #[must_use]
    pub fn offsets(&self) -> &[f64] {
        &self.offsets
    }

    /// Returns the total size of all items.
    #[must_use]
    pub fn total_size(&self) -> f64 {
        self.offsets.last().copied().unwrap_or(0.0)
    }

    /// Resolves the virtual range for the current viewport.
    #[must_use]
    pub fn virtual_range(&self, options: VariableVirtualRangeOptions) -> VirtualRange {
        if self.is_empty() || !is_positive_finite(options.viewport_size) {
            return empty_virtual_range();
        }

        let count = self.len();
        let total_size = self.total_size();
        let safe_offset = normalized_offset(options.scroll_offset, total_size);
        let visible_start = find_index_at_offset(&self.offsets, safe_offset);
        let visible_end = find_index_at_offset(
            &self.offsets,
            safe_offset + options.viewport_size,
        )
        .saturating_add(1)
        .min(count);
        let start_index = visible_start.saturating_sub(options.overscan);
        let end_index = visible_end
            .saturating_add(options.overscan)
            .min(count)
            .max(start_index);

        VirtualRange {
            end_index,
            offset_after: (total_size - self.offsets[end_index]).max(0.0),
            offset_before: self.offsets[start_index],
            start_index,
            total_size,
            visible_count: end_index - start_index,
        }
    }
}

/// Computes a virtual range for fixed-size items in O(1) time.
#[must_use]
pub fn fixed_virtual_range(options: FixedVirtualRangeOptions) -> VirtualRange {
    if options.count == 0
        || !is_positive_finite(options.item_size)
        || !is_positive_finite(options.viewport_size)
    {
        return empty_virtual_range();
    }

    let total_size = options.count as f64 * options.item_size;
    let safe_offset = normalized_offset(options.scroll_offset, total_size);
    let visible_start = ((safe_offset / options.item_size).floor() as usize).min(options.count);
    let visible_end = (((safe_offset + options.viewport_size) / options.item_size).ceil() as usize)
        .min(options.count);
    let start_index = visible_start.saturating_sub(options.overscan);
    let end_index = visible_end
        .saturating_add(options.overscan)
        .min(options.count)
        .max(start_index);

    VirtualRange {
        end_index,
        offset_after: (options.count - end_index) as f64 * options.item_size,
        offset_before: start_index as f64 * options.item_size,
        start_index,
        total_size,
        visible_count: end_index - start_index,
    }
}

/// Computes prefix offsets using the same normalization as [`VariableLayout`].
#[must_use]
pub fn offsets(item_sizes: &[f64]) -> Vec<f64> {
    VariableLayout::new(item_sizes).offsets
}

/// Convenience wrapper that builds a layout and immediately performs one query.
///
/// Reuse [`VariableLayout`] directly for scroll-driven workloads so the prefix
/// offsets are not rebuilt on every query.
#[must_use]
pub fn variable_virtual_range(
    item_sizes: &[f64],
    options: VariableVirtualRangeOptions,
) -> VirtualRange {
    VariableLayout::new(item_sizes).virtual_range(options)
}

fn empty_virtual_range() -> VirtualRange {
    VirtualRange {
        end_index: 0,
        offset_after: 0.0,
        offset_before: 0.0,
        start_index: 0,
        total_size: 0.0,
        visible_count: 0,
    }
}

fn find_index_at_offset(offsets: &[f64], offset: f64) -> usize {
    let count = offsets.len().saturating_sub(1);
    if count == 0 {
        return 0;
    }

    let mut low = 0usize;
    let mut high = count - 1;

    while low <= high {
        let mid = low + (high - low) / 2;
        let start = offsets[mid];
        let end = offsets[mid + 1];

        if offset < start {
            if mid == 0 {
                return 0;
            }
            high = mid - 1;
        } else if offset >= end {
            low = mid.saturating_add(1);
        } else {
            return mid;
        }
    }

    low.min(count - 1)
}

fn normalized_offset(offset: f64, total_size: f64) -> f64 {
    if offset.is_nan() || offset <= 0.0 {
        0.0
    } else if offset >= total_size {
        total_size
    } else {
        offset
    }
}

fn normalized_size(size: f64) -> f64 {
    if size.is_finite() && size > 0.0 {
        size
    } else {
        0.0
    }
}

fn is_positive_finite(value: f64) -> bool {
    value.is_finite() && value > 0.0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fixed_range_matches_known_geometry() {
        let range = fixed_virtual_range(FixedVirtualRangeOptions {
            count: 100,
            item_size: 20.0,
            overscan: 2,
            scroll_offset: 45.0,
            viewport_size: 100.0,
        });

        assert_eq!(range.start_index, 0);
        assert_eq!(range.end_index, 10);
        assert_eq!(range.visible_count, 10);
        assert_eq!(range.offset_before, 0.0);
        assert_eq!(range.offset_after, 1_800.0);
        assert_eq!(range.total_size, 2_000.0);
    }

    #[test]
    fn fixed_range_clamps_out_of_bounds_scroll_offsets() {
        let before = fixed_virtual_range(FixedVirtualRangeOptions {
            count: 10,
            item_size: 10.0,
            overscan: 0,
            scroll_offset: -100.0,
            viewport_size: 20.0,
        });
        let after = fixed_virtual_range(FixedVirtualRangeOptions {
            count: 10,
            item_size: 10.0,
            overscan: 0,
            scroll_offset: 1_000.0,
            viewport_size: 20.0,
        });

        assert_eq!((before.start_index, before.end_index), (0, 2));
        assert_eq!((after.start_index, after.end_index), (10, 10));
    }

    #[test]
    fn invalid_fixed_geometry_returns_empty_range() {
        for options in [
            FixedVirtualRangeOptions {
                count: 0,
                item_size: 20.0,
                overscan: 2,
                scroll_offset: 0.0,
                viewport_size: 100.0,
            },
            FixedVirtualRangeOptions {
                count: 10,
                item_size: 0.0,
                overscan: 2,
                scroll_offset: 0.0,
                viewport_size: 100.0,
            },
            FixedVirtualRangeOptions {
                count: 10,
                item_size: 20.0,
                overscan: 2,
                scroll_offset: 0.0,
                viewport_size: f64::NAN,
            },
        ] {
            assert_eq!(fixed_virtual_range(options), empty_virtual_range());
        }
    }

    #[test]
    fn variable_layout_reuses_offsets_for_queries() {
        let layout = VariableLayout::new(&[10.0, 20.0, 30.0, 40.0]);
        let range = layout.virtual_range(VariableVirtualRangeOptions {
            overscan: 0,
            scroll_offset: 15.0,
            viewport_size: 35.0,
        });

        assert_eq!(layout.offsets(), &[0.0, 10.0, 30.0, 60.0, 100.0]);
        assert_eq!(range.start_index, 1);
        assert_eq!(range.end_index, 3);
        assert_eq!(range.visible_count, 2);
        assert_eq!(range.offset_before, 10.0);
        assert_eq!(range.offset_after, 40.0);
        assert_eq!(range.total_size, 100.0);
    }

    #[test]
    fn malformed_item_sizes_are_normalized_without_breaking_monotonicity() {
        let layout = VariableLayout::new(&[10.0, -4.0, f64::NAN, f64::INFINITY, 5.0]);

        assert_eq!(layout.offsets(), &[0.0, 10.0, 10.0, 10.0, 10.0, 15.0]);
        assert!(layout.offsets().windows(2).all(|pair| pair[0] <= pair[1]));
    }

    #[test]
    fn cached_binary_search_matches_linear_reference_over_deterministic_cases() {
        let mut seed = 0xD1CE_BA5E_F00D_u64;

        for count in 1..=128usize {
            let mut sizes = Vec::with_capacity(count);
            for index in 0..count {
                seed = seed.wrapping_mul(6_364_136_223_846_793_005).wrapping_add(1);
                let generated = ((seed >> 32) % 73) as f64;
                sizes.push(if index % 11 == 0 { 0.0 } else { generated + 1.0 });
            }

            let layout = VariableLayout::new(&sizes);
            let total = layout.total_size();
            let offsets_to_test = [
                -50.0,
                0.0,
                total * 0.25,
                total * 0.5,
                total * 0.9,
                total,
                total + 250.0,
            ];

            for &scroll_offset in &offsets_to_test {
                for &viewport_size in &[1.0, 37.0, 250.0] {
                    for overscan in [0usize, 1, 3, 9] {
                        let options = VariableVirtualRangeOptions {
                            overscan,
                            scroll_offset,
                            viewport_size,
                        };
                        let actual = layout.virtual_range(options);
                        let expected = reference_variable_range(layout.offsets(), options);

                        assert_eq!(actual, expected);
                        assert!(actual.start_index <= actual.end_index);
                        assert!(actual.end_index <= count);
                        assert_eq!(actual.visible_count, actual.end_index - actual.start_index);

                        let rendered_size =
                            layout.offsets()[actual.end_index] - layout.offsets()[actual.start_index];
                        assert_close(
                            actual.offset_before + rendered_size + actual.offset_after,
                            actual.total_size,
                        );
                    }
                }
            }
        }
    }

    #[test]
    fn convenience_variable_query_matches_cached_layout() {
        let sizes = [18.0, 22.0, 31.0, 17.0, 45.0];
        let options = VariableVirtualRangeOptions {
            overscan: 2,
            scroll_offset: 33.0,
            viewport_size: 60.0,
        };

        assert_eq!(
            variable_virtual_range(&sizes, options),
            VariableLayout::new(&sizes).virtual_range(options),
        );
        assert_eq!(offsets(&sizes), VariableLayout::new(&sizes).offsets());
    }

    fn reference_variable_range(
        offsets: &[f64],
        options: VariableVirtualRangeOptions,
    ) -> VirtualRange {
        let count = offsets.len().saturating_sub(1);
        if count == 0 || !is_positive_finite(options.viewport_size) {
            return empty_virtual_range();
        }

        let total_size = offsets[count];
        let safe_offset = normalized_offset(options.scroll_offset, total_size);
        let visible_start = linear_index_at_offset(offsets, safe_offset);
        let visible_end = linear_index_at_offset(offsets, safe_offset + options.viewport_size)
            .saturating_add(1)
            .min(count);
        let start_index = visible_start.saturating_sub(options.overscan);
        let end_index = visible_end
            .saturating_add(options.overscan)
            .min(count)
            .max(start_index);

        VirtualRange {
            end_index,
            offset_after: (total_size - offsets[end_index]).max(0.0),
            offset_before: offsets[start_index],
            start_index,
            total_size,
            visible_count: end_index - start_index,
        }
    }

    fn linear_index_at_offset(offsets: &[f64], offset: f64) -> usize {
        let count = offsets.len().saturating_sub(1);
        for index in 0..count {
            if offset < offsets[index + 1] {
                return index;
            }
        }
        count.saturating_sub(1)
    }

    fn assert_close(left: f64, right: f64) {
        let tolerance = f64::EPSILON * left.abs().max(right.abs()).max(1.0) * 8.0;
        assert!((left - right).abs() <= tolerance, "{left} != {right}");
    }
}
