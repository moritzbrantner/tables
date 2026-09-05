//! Thin WebAssembly bindings for `tables-core` virtualization kernels.
//!
//! This crate contains no table semantics of its own. It only translates
//! typed browser inputs into the pure Rust core and returns a compact numeric
//! range representation to TypeScript.

use tables_core::{
    FixedVirtualRangeOptions, VariableLayout as CoreVariableLayout, VariableVirtualRangeOptions,
    VirtualRange, fixed_virtual_range,
};
use wasm_bindgen::prelude::*;

const RANGE_FIELD_COUNT: usize = 6;

/// Computes a fixed-size virtual range through the Rust core.
#[wasm_bindgen(js_name = fixedVirtualRange)]
pub fn fixed_virtual_range_wasm(
    count: usize,
    item_size: f64,
    overscan: usize,
    scroll_offset: f64,
    viewport_size: f64,
) -> Box<[f64]> {
    pack_range(fixed_virtual_range(FixedVirtualRangeOptions {
        count,
        item_size,
        overscan,
        scroll_offset,
        viewport_size,
    }))
}

/// Persistent variable-size layout whose prefix offsets are built once.
#[wasm_bindgen(js_name = VariableLayout)]
pub struct WasmVariableLayout {
    inner: CoreVariableLayout,
}

#[wasm_bindgen]
impl WasmVariableLayout {
    /// Builds a reusable variable-size layout from a typed numeric slice.
    #[wasm_bindgen(constructor)]
    pub fn new(item_sizes: &[f64]) -> Self {
        Self {
            inner: CoreVariableLayout::new(item_sizes),
        }
    }

    /// Returns the number of items in this layout.
    #[wasm_bindgen(getter, js_name = length)]
    pub fn len(&self) -> usize {
        self.inner.len()
    }

    /// Returns the total normalized size of the layout.
    #[wasm_bindgen(getter, js_name = totalSize)]
    pub fn total_size(&self) -> f64 {
        self.inner.total_size()
    }

    /// Resolves one viewport range without rebuilding the layout offsets.
    #[wasm_bindgen(js_name = virtualRange)]
    pub fn virtual_range(
        &self,
        overscan: usize,
        scroll_offset: f64,
        viewport_size: f64,
    ) -> Box<[f64]> {
        pack_range(self.inner.virtual_range(VariableVirtualRangeOptions {
            overscan,
            scroll_offset,
            viewport_size,
        }))
    }
}

fn pack_range(range: VirtualRange) -> Box<[f64]> {
    let values = [
        range.start_index as f64,
        range.end_index as f64,
        range.offset_before,
        range.offset_after,
        range.total_size,
        range.visible_count as f64,
    ];

    debug_assert_eq!(values.len(), RANGE_FIELD_COUNT);
    Box::new(values)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn packed_range_preserves_every_core_field() {
        let range = fixed_virtual_range(FixedVirtualRangeOptions {
            count: 100,
            item_size: 20.0,
            overscan: 2,
            scroll_offset: 45.0,
            viewport_size: 100.0,
        });
        let packed = pack_range(range);

        assert_eq!(packed.len(), RANGE_FIELD_COUNT);
        assert_eq!(packed[0], range.start_index as f64);
        assert_eq!(packed[1], range.end_index as f64);
        assert_eq!(packed[2], range.offset_before);
        assert_eq!(packed[3], range.offset_after);
        assert_eq!(packed[4], range.total_size);
        assert_eq!(packed[5], range.visible_count as f64);
    }

    #[test]
    fn persistent_layout_reuses_core_geometry() {
        let layout = WasmVariableLayout::new(&[40.0, 60.0, 100.0, 80.0]);

        assert_eq!(layout.len(), 4);
        assert_eq!(layout.total_size(), 280.0);
        assert_eq!(layout.virtual_range(1, 70.0, 120.0).as_ref(), [0.0, 4.0, 0.0, 0.0, 280.0, 4.0]);
    }
}
