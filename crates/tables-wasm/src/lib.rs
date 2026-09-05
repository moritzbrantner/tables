//! Thin WebAssembly bindings for `tables-core` kernels.
//!
//! This crate owns no table semantics. It translates typed JavaScript inputs
//! into the pure Rust core and returns compact numeric results.

use js_sys::{Float64Array, Uint8Array};
use serde::Deserialize;
use tables_core::query::{
    TableFilter, TableFilterOperator, TableFilterValue, TableIndex as CoreTableIndex, TableNulls,
    TableQuery, TableSearch, TableSort, TableSortDirection,
};
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
#[wasm_bindgen]
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

    /// Returns whether this layout has no items.
    #[wasm_bindgen(getter, js_name = isEmpty)]
    pub fn is_empty(&self) -> bool {
        self.inner.is_empty()
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

/// Direct browser index for Rust-owned table filtering, search, and sorting.
#[wasm_bindgen]
pub struct WasmTableIndex {
    inner: CoreTableIndex,
}

#[wasm_bindgen]
impl WasmTableIndex {
    /// Creates an empty table index.
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            inner: CoreTableIndex::new(),
        }
    }

    /// Adds a numeric or timestamp column and returns its column index.
    #[wasm_bindgen(js_name = addNumericColumn)]
    pub fn add_numeric_column(&mut self, values: Float64Array, validity: Uint8Array) -> usize {
        self.inner
            .add_numeric_column(values.to_vec(), validity.to_vec())
    }

    /// Adds a boolean column and returns its column index.
    #[wasm_bindgen(js_name = addBooleanColumn)]
    pub fn add_boolean_column(&mut self, values: Uint8Array, validity: Uint8Array) -> usize {
        self.inner
            .add_boolean_column(values.to_vec(), validity.to_vec())
    }

    /// Adds a string-like column and returns its column index.
    #[wasm_bindgen(js_name = addStringColumn)]
    pub fn add_string_column(&mut self, values: JsValue) -> Result<usize, JsValue> {
        let values: Vec<Option<String>> =
            serde_wasm_bindgen::from_value(values).map_err(into_js_error)?;
        let validity = values
            .iter()
            .map(|value| u8::from(value.is_some()))
            .collect::<Vec<_>>();
        let values = values
            .into_iter()
            .map(|value| value.unwrap_or_default())
            .collect::<Vec<_>>();

        Ok(self.inner.add_string_column(values, validity))
    }

    /// Executes one direct table query and returns packed source-index evidence.
    ///
    /// The first `u32` is the filtered row count. Remaining values are source
    /// row indices in final sorted/windowed order.
    #[wasm_bindgen]
    pub fn query(&self, query: JsValue) -> Result<Box<[u32]>, JsValue> {
        let query: WasmTableQuery = serde_wasm_bindgen::from_value(query).map_err(into_js_error)?;
        let result = self.inner.query(&query.into_core());
        let mut packed = Vec::with_capacity(result.row_indices.len().saturating_add(1));
        packed.push(result.filtered_row_count.min(u32::MAX as usize) as u32);
        packed.extend(result.row_indices);
        Ok(packed.into_boxed_slice())
    }
}

impl Default for WasmTableIndex {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WasmTableQuery {
    #[serde(default)]
    filters: Vec<WasmTableFilter>,
    #[serde(default)]
    search: Option<WasmTableSearch>,
    #[serde(default)]
    sort: Vec<WasmTableSort>,
    #[serde(default)]
    row_offset: usize,
    #[serde(default)]
    row_limit: Option<usize>,
}

impl WasmTableQuery {
    fn into_core(self) -> TableQuery {
        TableQuery {
            filters: self
                .filters
                .into_iter()
                .map(WasmTableFilter::into_core)
                .collect(),
            search: self.search.map(WasmTableSearch::into_core),
            sort: self
                .sort
                .into_iter()
                .map(WasmTableSort::into_core)
                .collect(),
            row_offset: self.row_offset,
            row_limit: self.row_limit,
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WasmTableFilter {
    column_index: usize,
    operator: WasmTableFilterOperator,
    value: WasmTableFilterValue,
    #[serde(default)]
    case_sensitive: bool,
}

impl WasmTableFilter {
    fn into_core(self) -> TableFilter {
        TableFilter {
            column_index: self.column_index,
            operator: self.operator.into_core(),
            value: self.value.into_core(),
            case_sensitive: self.case_sensitive,
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
enum WasmTableFilterOperator {
    Between,
    Contains,
    EndsWith,
    Equals,
    Gt,
    Gte,
    In,
    IsNotNull,
    IsNull,
    Lt,
    Lte,
    NotEquals,
    StartsWith,
}

impl WasmTableFilterOperator {
    fn into_core(self) -> TableFilterOperator {
        match self {
            Self::Between => TableFilterOperator::Between,
            Self::Contains => TableFilterOperator::Contains,
            Self::EndsWith => TableFilterOperator::EndsWith,
            Self::Equals => TableFilterOperator::Equals,
            Self::Gt => TableFilterOperator::Gt,
            Self::Gte => TableFilterOperator::Gte,
            Self::In => TableFilterOperator::In,
            Self::IsNotNull => TableFilterOperator::IsNotNull,
            Self::IsNull => TableFilterOperator::IsNull,
            Self::Lt => TableFilterOperator::Lt,
            Self::Lte => TableFilterOperator::Lte,
            Self::NotEquals => TableFilterOperator::NotEquals,
            Self::StartsWith => TableFilterOperator::StartsWith,
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
enum WasmTableFilterValue {
    None,
    Number {
        value: f64,
    },
    NumberRange {
        min: f64,
        max: f64,
    },
    Numbers {
        values: Vec<f64>,
        #[serde(default)]
        include_null: bool,
    },
    Boolean {
        value: bool,
    },
    Booleans {
        values: Vec<bool>,
        #[serde(default)]
        include_null: bool,
    },
    String {
        value: String,
    },
    Strings {
        values: Vec<String>,
        #[serde(default)]
        include_null: bool,
    },
}

impl WasmTableFilterValue {
    fn into_core(self) -> TableFilterValue {
        match self {
            Self::None => TableFilterValue::None,
            Self::Number { value } => TableFilterValue::Number(value),
            Self::NumberRange { min, max } => TableFilterValue::NumberRange(min, max),
            Self::Numbers {
                values,
                include_null,
            } => TableFilterValue::Numbers {
                values,
                include_null,
            },
            Self::Boolean { value } => TableFilterValue::Boolean(value),
            Self::Booleans {
                values,
                include_null,
            } => TableFilterValue::Booleans {
                values,
                include_null,
            },
            Self::String { value } => TableFilterValue::String(value),
            Self::Strings {
                values,
                include_null,
            } => TableFilterValue::Strings {
                values,
                include_null,
            },
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WasmTableSearch {
    column_indices: Vec<usize>,
    query: String,
    #[serde(default)]
    case_sensitive: bool,
}

impl WasmTableSearch {
    fn into_core(self) -> TableSearch {
        TableSearch {
            column_indices: self.column_indices,
            query: self.query,
            case_sensitive: self.case_sensitive,
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WasmTableSort {
    column_index: usize,
    direction: WasmTableSortDirection,
    nulls: WasmTableNulls,
}

impl WasmTableSort {
    fn into_core(self) -> TableSort {
        TableSort {
            column_index: self.column_index,
            direction: self.direction.into_core(),
            nulls: self.nulls.into_core(),
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
enum WasmTableSortDirection {
    Asc,
    Desc,
}

impl WasmTableSortDirection {
    fn into_core(self) -> TableSortDirection {
        match self {
            Self::Asc => TableSortDirection::Asc,
            Self::Desc => TableSortDirection::Desc,
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
enum WasmTableNulls {
    First,
    Last,
}

impl WasmTableNulls {
    fn into_core(self) -> TableNulls {
        match self {
            Self::First => TableNulls::First,
            Self::Last => TableNulls::Last,
        }
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

fn into_js_error(error: impl std::fmt::Display) -> JsValue {
    js_sys::Error::new(&error.to_string()).into()
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

        assert!(!layout.is_empty());
        assert_eq!(layout.len(), 4);
        assert_eq!(layout.total_size(), 280.0);
        assert_eq!(
            layout.virtual_range(1, 70.0, 120.0).as_ref(),
            [0.0, 4.0, 0.0, 0.0, 280.0, 4.0]
        );
    }

    #[test]
    fn query_dto_maps_directly_to_core_contract() {
        let query = WasmTableQuery {
            filters: vec![WasmTableFilter {
                case_sensitive: false,
                column_index: 2,
                operator: WasmTableFilterOperator::Gte,
                value: WasmTableFilterValue::Number { value: 42.0 },
            }],
            search: Some(WasmTableSearch {
                case_sensitive: false,
                column_indices: vec![0, 1],
                query: "core".to_string(),
            }),
            sort: vec![WasmTableSort {
                column_index: 2,
                direction: WasmTableSortDirection::Desc,
                nulls: WasmTableNulls::First,
            }],
            row_limit: None,
            row_offset: 0,
        }
        .into_core();

        assert_eq!(query.filters.len(), 1);
        assert_eq!(
            query.search.as_ref().map(|search| search.query.as_str()),
            Some("core")
        );
        assert_eq!(query.sort.len(), 1);
    }
}
