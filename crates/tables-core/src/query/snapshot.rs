//! Explicit query-result lifetime, independent of column/index lifetimes.
use super::{TableIndex, TableQuery};

/// Immutable full query result for repeated window reads.
///
/// Preparation pays filtering/sorting once and retains four bytes per matching
/// source index. Identity queries retain no indices. Window reads do not access
/// the source index, rerun predicates, or sort. Prefer `TableIndex::query` for
/// one-off bounded queries where full-result preparation is not worth retaining.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TableQuerySnapshot {
    row_count: usize,
    indices: Option<Box<[u32]>>,
}

impl TableIndex {
    /// Prepares the complete matching order, ignoring input window bounds.
    /// The snapshot owns its result and remains valid when this index changes
    /// or is dropped. Callers associate it with the original immutable rows.
    #[must_use]
    pub fn prepare_query(&self, query: &TableQuery) -> TableQuerySnapshot {
        let identity = query.filters.is_empty()
            && query
                .search
                .as_ref()
                .is_none_or(|search| search.query.is_empty())
            && query
                .sort
                .iter()
                .all(|rule| self.columns.get(rule.column_index).is_none());
        if identity {
            return TableQuerySnapshot {
                row_count: self.row_count,
                indices: None,
            };
        }
        let full = TableQuery {
            row_offset: 0,
            row_limit: None,
            ..query.clone()
        };
        let result = self.query(&full);
        TableQuerySnapshot {
            row_count: result.filtered_row_count,
            indices: Some(result.row_indices.into_boxed_slice()),
        }
    }
}

impl TableQuerySnapshot {
    /// Total matching rows, independent of a requested page.
    #[must_use]
    pub fn filtered_row_count(&self) -> usize {
        self.row_count
    }

    /// Retained source-index bytes, excluding the small snapshot struct itself.
    #[must_use]
    pub fn retained_index_bytes(&self) -> usize {
        self.indices
            .as_ref()
            .map_or(0, |indices| std::mem::size_of_val(indices.as_ref()))
    }

    /// Allocation-free ordered window iterator. Cost is proportional to the
    /// returned window, independent of source size and offset depth.
    pub fn window_indices(
        &self,
        offset: usize,
        limit: usize,
    ) -> impl ExactSizeIterator<Item = u32> + '_ {
        let start = offset.min(self.row_count);
        let end = start.saturating_add(limit).min(self.row_count);
        (start..end).map(move |position| {
            self.indices
                .as_ref()
                .map_or(position as u32, |indices| indices[position])
        })
    }
}
