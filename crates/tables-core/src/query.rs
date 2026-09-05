//! Table-owned filtering, search, and stable sorting kernels.

use std::cmp::Ordering;

/// Sort direction.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TableSortDirection {
    /// Ascending order.
    Asc,
    /// Descending order.
    Desc,
}

/// Position of null values during sorting.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TableNulls {
    /// Nulls before non-null values.
    First,
    /// Nulls after non-null values.
    Last,
}

/// Supported table filter operators.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TableFilterOperator {
    /// Inclusive range comparison.
    Between,
    /// Substring comparison.
    Contains,
    /// Suffix comparison.
    EndsWith,
    /// Equality comparison.
    Equals,
    /// Greater-than comparison.
    Gt,
    /// Greater-than-or-equal comparison.
    Gte,
    /// Membership comparison.
    In,
    /// Non-null comparison.
    IsNotNull,
    /// Null comparison.
    IsNull,
    /// Less-than comparison.
    Lt,
    /// Less-than-or-equal comparison.
    Lte,
    /// Inequality comparison.
    NotEquals,
    /// Prefix comparison.
    StartsWith,
}

/// Typed filter value transported to the Rust query kernel.
#[derive(Clone, Debug, PartialEq)]
pub enum TableFilterValue {
    /// No value, used by null checks and equality with null.
    None,
    /// One number or timestamp.
    Number(f64),
    /// Inclusive numeric range.
    NumberRange(f64, f64),
    /// Numeric membership values and whether null is included.
    Numbers {
        /// Numeric candidates.
        values: Vec<f64>,
        /// Whether null is a candidate.
        include_null: bool,
    },
    /// One boolean.
    Boolean(bool),
    /// Boolean membership values and whether null is included.
    Booleans {
        /// Boolean candidates.
        values: Vec<bool>,
        /// Whether null is a candidate.
        include_null: bool,
    },
    /// One string-like stable value.
    String(String),
    /// String membership values and whether null is included.
    Strings {
        /// String candidates.
        values: Vec<String>,
        /// Whether null is a candidate.
        include_null: bool,
    },
}

/// One structured filter in a query.
#[derive(Clone, Debug, PartialEq)]
pub struct TableFilter {
    /// Column index in [`TableIndex`].
    pub column_index: usize,
    /// Filter operator.
    pub operator: TableFilterOperator,
    /// Filter value.
    pub value: TableFilterValue,
    /// Whether string comparisons preserve case.
    pub case_sensitive: bool,
}

/// Global substring search over selected columns.
#[derive(Clone, Debug, PartialEq)]
pub struct TableSearch {
    /// Column indices to search.
    pub column_indices: Vec<usize>,
    /// Search text.
    pub query: String,
    /// Whether matching preserves case.
    pub case_sensitive: bool,
}

/// One stable sort rule.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct TableSort {
    /// Column index in [`TableIndex`].
    pub column_index: usize,
    /// Sort direction.
    pub direction: TableSortDirection,
    /// Null placement.
    pub nulls: TableNulls,
}

/// A complete table query.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct TableQuery {
    /// Structured filters; all must match.
    pub filters: Vec<TableFilter>,
    /// Optional global search.
    pub search: Option<TableSearch>,
    /// Stable multi-column sort rules in priority order.
    pub sort: Vec<TableSort>,
    /// Number of matching rows to skip.
    pub row_offset: usize,
    /// Maximum returned rows. `None` returns all remaining rows.
    pub row_limit: Option<usize>,
}

/// Result of a table query.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TableIndexResult {
    /// Number of rows matching filters/search before windowing.
    pub filtered_row_count: usize,
    /// Source row indices after filtering, sorting, and windowing.
    pub row_indices: Vec<u32>,
}

/// Typed, columnar table index used for Rust-owned query semantics.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct TableIndex {
    columns: Vec<TableColumn>,
    row_count: usize,
}

#[derive(Clone, Debug, PartialEq)]
enum TableColumn {
    Numeric {
        values: Vec<f64>,
        validity: Vec<u8>,
    },
    Boolean {
        values: Vec<u8>,
        validity: Vec<u8>,
    },
    String {
        values: Vec<String>,
        normalized_values: Vec<String>,
        validity: Vec<u8>,
    },
}

impl TableIndex {
    /// Creates an empty index. Columns can be appended in adapter-defined order.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Returns the indexed row count.
    #[must_use]
    pub fn row_count(&self) -> usize {
        self.row_count
    }

    /// Appends a numeric or timestamp column and returns its index.
    pub fn add_numeric_column(&mut self, values: Vec<f64>, validity: Vec<u8>) -> usize {
        let column_index = self.columns.len();
        self.row_count = self.row_count.max(values.len());
        self.columns.push(TableColumn::Numeric {
            validity: normalized_validity(validity, values.len()),
            values,
        });
        column_index
    }

    /// Appends a boolean column and returns its index.
    pub fn add_boolean_column(&mut self, values: Vec<u8>, validity: Vec<u8>) -> usize {
        let column_index = self.columns.len();
        self.row_count = self.row_count.max(values.len());
        self.columns.push(TableColumn::Boolean {
            validity: normalized_validity(validity, values.len()),
            values,
        });
        column_index
    }

    /// Appends a string-like column and returns its index.
    pub fn add_string_column(&mut self, values: Vec<String>, validity: Vec<u8>) -> usize {
        let column_index = self.columns.len();
        self.row_count = self.row_count.max(values.len());
        let normalized_values = values.iter().map(|value| value.to_lowercase()).collect();
        self.columns.push(TableColumn::String {
            validity: normalized_validity(validity, values.len()),
            values,
            normalized_values,
        });
        column_index
    }

    /// Executes filtering, search, stable sorting, and windowing in Rust.
    #[must_use]
    pub fn query(&self, query: &TableQuery) -> TableIndexResult {
        if self.row_count == 0 {
            return TableIndexResult {
                filtered_row_count: 0,
                row_indices: Vec::new(),
            };
        }

        let mut rows = Vec::with_capacity(self.row_count);
        for row_index in 0..self.row_count {
            if self.row_matches(query, row_index) {
                rows.push(row_index as u32);
            }
        }

        let filtered_row_count = rows.len();
        if !query.sort.is_empty() {
            rows.sort_by(|left, right| self.compare_rows(*left, *right, &query.sort));
        }

        TableIndexResult {
            filtered_row_count,
            row_indices: window_rows(&rows, query.row_offset, query.row_limit),
        }
    }

    fn row_matches(&self, query: &TableQuery, row_index: usize) -> bool {
        if !query
            .filters
            .iter()
            .all(|filter| self.filter_matches(filter, row_index))
        {
            return false;
        }

        let Some(search) = &query.search else {
            return true;
        };
        if search.query.is_empty() {
            return true;
        }

        let needle = normalize_string(&search.query, search.case_sensitive);
        search.column_indices.iter().any(|column_index| {
            self.search_value(*column_index, row_index, search.case_sensitive)
                .is_some_and(|value| value.contains(&needle))
        })
    }

    fn filter_matches(&self, filter: &TableFilter, row_index: usize) -> bool {
        let Some(column) = self.columns.get(filter.column_index) else {
            return false;
        };

        match column {
            TableColumn::Numeric { values, validity } => {
                numeric_filter_matches(values, validity, filter, row_index)
            }
            TableColumn::Boolean { values, validity } => {
                boolean_filter_matches(values, validity, filter, row_index)
            }
            TableColumn::String {
                values,
                normalized_values,
                validity,
            } => string_filter_matches(values, normalized_values, validity, filter, row_index),
        }
    }

    fn search_value(
        &self,
        column_index: usize,
        row_index: usize,
        case_sensitive: bool,
    ) -> Option<String> {
        match self.columns.get(column_index)? {
            TableColumn::Numeric { values, validity } => {
                numeric_value(values, validity, row_index).map(|value| value.to_string())
            }
            TableColumn::Boolean { values, validity } => {
                boolean_value(values, validity, row_index).map(|value| value.to_string())
            }
            TableColumn::String {
                values,
                normalized_values,
                validity,
            } => string_value(values, normalized_values, validity, row_index, case_sensitive)
                .map(str::to_owned),
        }
    }

    fn compare_rows(&self, left: u32, right: u32, sort: &[TableSort]) -> Ordering {
        for rule in sort {
            let ordering = self.columns.get(rule.column_index).map_or(
                Ordering::Equal,
                |column| compare_column_rows(column, left, right, *rule),
            );
            if ordering != Ordering::Equal {
                return ordering;
            }
        }

        left.cmp(&right)
    }
}

fn numeric_filter_matches(
    values: &[f64],
    validity: &[u8],
    filter: &TableFilter,
    row_index: usize,
) -> bool {
    let actual = numeric_value(values, validity, row_index);
    match filter.operator {
        TableFilterOperator::Equals => match &filter.value {
            TableFilterValue::Number(expected) => actual == Some(*expected),
            TableFilterValue::None => actual.is_none(),
            _ => false,
        },
        TableFilterOperator::NotEquals => match &filter.value {
            TableFilterValue::Number(expected) => actual != Some(*expected),
            TableFilterValue::None => actual.is_some(),
            _ => false,
        },
        TableFilterOperator::Gt => {
            number_pair(actual, &filter.value).is_some_and(|(left, right)| left > right)
        }
        TableFilterOperator::Gte => {
            number_pair(actual, &filter.value).is_some_and(|(left, right)| left >= right)
        }
        TableFilterOperator::Lt => {
            number_pair(actual, &filter.value).is_some_and(|(left, right)| left < right)
        }
        TableFilterOperator::Lte => {
            number_pair(actual, &filter.value).is_some_and(|(left, right)| left <= right)
        }
        TableFilterOperator::Between => match (actual, &filter.value) {
            (Some(actual), TableFilterValue::NumberRange(min, max)) => {
                actual >= *min && actual <= *max
            }
            _ => false,
        },
        TableFilterOperator::In => match (actual, &filter.value) {
            (Some(actual), TableFilterValue::Numbers { values, .. }) => values.contains(&actual),
            (None, TableFilterValue::Numbers { include_null, .. }) => *include_null,
            _ => false,
        },
        TableFilterOperator::IsNull => actual.is_none(),
        TableFilterOperator::IsNotNull => actual.is_some(),
        _ => false,
    }
}

fn boolean_filter_matches(
    values: &[u8],
    validity: &[u8],
    filter: &TableFilter,
    row_index: usize,
) -> bool {
    let actual = boolean_value(values, validity, row_index);
    match filter.operator {
        TableFilterOperator::Equals => match &filter.value {
            TableFilterValue::Boolean(expected) => actual == Some(*expected),
            TableFilterValue::None => actual.is_none(),
            _ => false,
        },
        TableFilterOperator::NotEquals => match &filter.value {
            TableFilterValue::Boolean(expected) => actual != Some(*expected),
            TableFilterValue::None => actual.is_some(),
            _ => false,
        },
        TableFilterOperator::In => match (actual, &filter.value) {
            (Some(actual), TableFilterValue::Booleans { values, .. }) => values.contains(&actual),
            (None, TableFilterValue::Booleans { include_null, .. }) => *include_null,
            _ => false,
        },
        TableFilterOperator::IsNull => actual.is_none(),
        TableFilterOperator::IsNotNull => actual.is_some(),
        _ => false,
    }
}

fn string_filter_matches(
    values: &[String],
    normalized_values: &[String],
    validity: &[u8],
    filter: &TableFilter,
    row_index: usize,
) -> bool {
    let actual = string_value(
        values,
        normalized_values,
        validity,
        row_index,
        filter.case_sensitive,
    );

    match filter.operator {
        TableFilterOperator::IsNull => actual.is_none(),
        TableFilterOperator::IsNotNull => actual.is_some(),
        TableFilterOperator::Contains => string_expected(&filter.value, filter.case_sensitive)
            .is_some_and(|expected| actual.is_some_and(|value| value.contains(&expected))),
        TableFilterOperator::StartsWith => string_expected(&filter.value, filter.case_sensitive)
            .is_some_and(|expected| actual.is_some_and(|value| value.starts_with(&expected))),
        TableFilterOperator::EndsWith => string_expected(&filter.value, filter.case_sensitive)
            .is_some_and(|expected| actual.is_some_and(|value| value.ends_with(&expected))),
        TableFilterOperator::Equals => string_expected(&filter.value, filter.case_sensitive)
            .is_some_and(|expected| actual == Some(expected.as_str())),
        TableFilterOperator::NotEquals => match &filter.value {
            TableFilterValue::None => actual.is_some(),
            _ => string_expected(&filter.value, filter.case_sensitive)
                .is_some_and(|expected| actual != Some(expected.as_str())),
        },
        TableFilterOperator::In => match &filter.value {
            TableFilterValue::Strings {
                values,
                include_null,
            } => match actual {
                None => *include_null,
                Some(actual) => values.iter().any(|candidate| {
                    normalize_string(candidate, filter.case_sensitive) == actual
                }),
            },
            _ => false,
        },
        _ => false,
    }
}

fn compare_column_rows(column: &TableColumn, left: u32, right: u32, sort: TableSort) -> Ordering {
    match column {
        TableColumn::Numeric { values, validity } => compare_optional(
            numeric_value(values, validity, left as usize),
            numeric_value(values, validity, right as usize),
            sort,
            f64::total_cmp,
        ),
        TableColumn::Boolean { values, validity } => compare_optional(
            boolean_value(values, validity, left as usize),
            boolean_value(values, validity, right as usize),
            sort,
            Ord::cmp,
        ),
        TableColumn::String {
            values, validity, ..
        } => compare_optional(
            valid_string(values, validity, left as usize),
            valid_string(values, validity, right as usize),
            sort,
            |left, right| left.cmp(right),
        ),
    }
}

fn compare_optional<T>(
    left: Option<T>,
    right: Option<T>,
    sort: TableSort,
    compare: impl Fn(&T, &T) -> Ordering,
) -> Ordering {
    match (left, right) {
        (None, None) => Ordering::Equal,
        (None, Some(_)) => null_order(sort.nulls),
        (Some(_), None) => null_order(sort.nulls).reverse(),
        (Some(left), Some(right)) => match sort.direction {
            TableSortDirection::Asc => compare(&left, &right),
            TableSortDirection::Desc => compare(&left, &right).reverse(),
        },
    }
}

fn number_pair(actual: Option<f64>, expected: &TableFilterValue) -> Option<(f64, f64)> {
    match (actual, expected) {
        (Some(actual), TableFilterValue::Number(expected)) => Some((actual, *expected)),
        _ => None,
    }
}

fn string_expected(value: &TableFilterValue, case_sensitive: bool) -> Option<String> {
    match value {
        TableFilterValue::String(value) => Some(normalize_string(value, case_sensitive)),
        _ => None,
    }
}

fn normalize_string(value: &str, case_sensitive: bool) -> String {
    if case_sensitive {
        value.to_owned()
    } else {
        value.to_lowercase()
    }
}

fn numeric_value(values: &[f64], validity: &[u8], row_index: usize) -> Option<f64> {
    if !is_valid(validity, row_index) {
        return None;
    }

    let value = *values.get(row_index)?;
    value.is_finite().then_some(value)
}

fn boolean_value(values: &[u8], validity: &[u8], row_index: usize) -> Option<bool> {
    if !is_valid(validity, row_index) {
        return None;
    }

    values.get(row_index).map(|value| *value != 0)
}

fn valid_string<'a>(values: &'a [String], validity: &[u8], row_index: usize) -> Option<&'a String> {
    if !is_valid(validity, row_index) {
        return None;
    }

    values.get(row_index)
}

fn string_value<'a>(
    values: &'a [String],
    normalized_values: &'a [String],
    validity: &[u8],
    row_index: usize,
    case_sensitive: bool,
) -> Option<&'a str> {
    if !is_valid(validity, row_index) {
        return None;
    }

    if case_sensitive {
        values.get(row_index).map(String::as_str)
    } else {
        normalized_values.get(row_index).map(String::as_str)
    }
}

fn is_valid(validity: &[u8], row_index: usize) -> bool {
    validity.get(row_index).is_some_and(|value| *value != 0)
}

fn normalized_validity(mut validity: Vec<u8>, value_count: usize) -> Vec<u8> {
    if validity.len() < value_count {
        validity.resize(value_count, 1);
    } else if validity.len() > value_count {
        validity.truncate(value_count);
    }
    validity
}

fn null_order(nulls: TableNulls) -> Ordering {
    match nulls {
        TableNulls::First => Ordering::Less,
        TableNulls::Last => Ordering::Greater,
    }
}

fn window_rows(rows: &[u32], row_offset: usize, row_limit: Option<usize>) -> Vec<u32> {
    if row_offset >= rows.len() {
        return Vec::new();
    }

    let remaining = &rows[row_offset..];
    match row_limit {
        Some(limit) => remaining.iter().take(limit).copied().collect(),
        None => remaining.to_vec(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn combines_filter_search_and_stable_sort() {
        let mut index = TableIndex::new();
        let segment = index.add_string_column(
            vec!["Enterprise".into(), "SMB".into(), "Enterprise".into()],
            vec![1, 1, 1],
        );
        let city = index.add_string_column(
            vec!["Berlin".into(), "Boston".into(), "Tokyo".into()],
            vec![1, 1, 1],
        );
        let revenue = index.add_numeric_column(vec![42.0, 12.0, 88.0], vec![1, 1, 1]);

        let result = index.query(&TableQuery {
            filters: vec![TableFilter {
                case_sensitive: false,
                column_index: segment,
                operator: TableFilterOperator::Equals,
                value: TableFilterValue::String("enterprise".into()),
            }],
            search: Some(TableSearch {
                case_sensitive: false,
                column_indices: vec![city],
                query: "o".into(),
            }),
            sort: vec![TableSort {
                column_index: revenue,
                direction: TableSortDirection::Desc,
                nulls: TableNulls::First,
            }],
            row_limit: None,
            row_offset: 0,
        });

        assert_eq!(result.filtered_row_count, 1);
        assert_eq!(result.row_indices, vec![2]);
    }

    #[test]
    fn supports_all_typed_filter_families() {
        let mut index = TableIndex::new();
        let numeric = index.add_numeric_column(vec![10.0, 20.0, 30.0], vec![1, 1, 0]);
        let boolean = index.add_boolean_column(vec![1, 0, 1], vec![1, 1, 0]);
        let string = index.add_string_column(
            vec!["Alpha".into(), "Beta".into(), "Gamma".into()],
            vec![1, 1, 0],
        );

        assert_rows(
            &index,
            TableFilter {
                case_sensitive: false,
                column_index: numeric,
                operator: TableFilterOperator::Between,
                value: TableFilterValue::NumberRange(10.0, 20.0),
            },
            &[0, 1],
        );
        assert_rows(
            &index,
            TableFilter {
                case_sensitive: false,
                column_index: boolean,
                operator: TableFilterOperator::Equals,
                value: TableFilterValue::Boolean(false),
            },
            &[1],
        );
        assert_rows(
            &index,
            TableFilter {
                case_sensitive: false,
                column_index: string,
                operator: TableFilterOperator::Contains,
                value: TableFilterValue::String("ph".into()),
            },
            &[0],
        );
        assert_rows(
            &index,
            TableFilter {
                case_sensitive: false,
                column_index: string,
                operator: TableFilterOperator::IsNull,
                value: TableFilterValue::None,
            },
            &[2],
        );
    }

    #[test]
    fn supports_membership_unicode_search_and_multi_sort() {
        let mut index = TableIndex::new();
        let group = index.add_string_column(
            vec!["Zeta".into(), "Äpfel".into(), "Zeta".into(), "ÄPFEL".into()],
            vec![1, 1, 1, 1],
        );
        let score = index.add_numeric_column(vec![2.0, 2.0, 1.0, 1.0], vec![1, 1, 1, 1]);

        let result = index.query(&TableQuery {
            filters: vec![TableFilter {
                case_sensitive: false,
                column_index: group,
                operator: TableFilterOperator::In,
                value: TableFilterValue::Strings {
                    values: vec!["zeta".into(), "äpfel".into()],
                    include_null: false,
                },
            }],
            search: Some(TableSearch {
                case_sensitive: false,
                column_indices: vec![group],
                query: "ä".into(),
            }),
            sort: vec![
                TableSort {
                    column_index: score,
                    direction: TableSortDirection::Asc,
                    nulls: TableNulls::Last,
                },
                TableSort {
                    column_index: group,
                    direction: TableSortDirection::Asc,
                    nulls: TableNulls::Last,
                },
            ],
            row_limit: None,
            row_offset: 0,
        });

        assert_eq!(result.filtered_row_count, 2);
        assert_eq!(result.row_indices, vec![3, 1]);
    }

    #[test]
    fn descending_sort_can_place_nulls_first() {
        let mut index = TableIndex::new();
        let score = index.add_numeric_column(vec![10.0, 0.0, 20.0], vec![1, 0, 1]);
        let result = index.query(&TableQuery {
            sort: vec![TableSort {
                column_index: score,
                direction: TableSortDirection::Desc,
                nulls: TableNulls::First,
            }],
            ..TableQuery::default()
        });

        assert_eq!(result.row_indices, vec![1, 2, 0]);
    }

    #[test]
    fn windows_after_filter_and_sort() {
        let mut index = TableIndex::new();
        let score = index.add_numeric_column(vec![10.0, 30.0, 20.0, 40.0], vec![1; 4]);
        let result = index.query(&TableQuery {
            filters: vec![TableFilter {
                case_sensitive: false,
                column_index: score,
                operator: TableFilterOperator::Gte,
                value: TableFilterValue::Number(20.0),
            }],
            row_limit: Some(2),
            row_offset: 1,
            sort: vec![TableSort {
                column_index: score,
                direction: TableSortDirection::Desc,
                nulls: TableNulls::Last,
            }],
            search: None,
        });

        assert_eq!(result.filtered_row_count, 3);
        assert_eq!(result.row_indices, vec![1, 2]);
    }

    fn assert_rows(index: &TableIndex, filter: TableFilter, expected: &[u32]) {
        let result = index.query(&TableQuery {
            filters: vec![filter],
            ..TableQuery::default()
        });
        assert_eq!(result.row_indices, expected);
    }
}
