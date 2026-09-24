//! Small, stable formatting primitives shared by workbook modules.
//!
//! Semantic cell styles remain local to each workbook. Only formats with the
//! same meaning and representation across workbook types belong here.

pub(crate) const MONEY_FMT: &str = "#,##0.00;[Red]-#,##0.00";
pub(crate) const QTY_FMT: &str = "#,##0.000";
