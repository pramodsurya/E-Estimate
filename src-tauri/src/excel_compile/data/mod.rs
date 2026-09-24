use super::models::ExcelCompileRequest;
use rust_xlsxwriter::{Workbook, XlsxError};
use std::collections::HashMap;

mod sor;
mod ssr;
mod signature;

pub fn generate_excel_data_workbook(req: &ExcelCompileRequest) -> Result<Vec<u8>, XlsxError> {
    let mut workbook = Workbook::new();
    write_excel_data_sheets(&mut workbook, req, &HashMap::new(), false)?;
    super::print_settings::save_with_print_settings(workbook, req)
}

/// Compose the established SSR and SOR DATA sheet writers in any workbook.
/// Project export supplies Lead cell references; standalone DATA deliberately
/// supplies none and therefore retains its existing absolute numeric values.
pub(crate) fn write_excel_data_sheets(
    workbook: &mut Workbook,
    req: &ExcelCompileRequest,
    lead_rate_refs: &HashMap<String, String>,
    require_lead_refs: bool,
) -> Result<HashMap<String, String>, XlsxError> {
    let mut refs = ssr::write_ssr_sheet(workbook, req, lead_rate_refs, require_lead_refs)?;
    refs.extend(sor::write_sor_sheet(
        workbook,
        req,
        lead_rate_refs,
        require_lead_refs,
    )?);
    Ok(refs)
}
