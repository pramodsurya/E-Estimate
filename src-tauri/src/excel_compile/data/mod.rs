use super::models::ExcelCompileRequest;
use rust_xlsxwriter::{Workbook, XlsxError};
use std::collections::HashMap;

mod morth;
mod individual;
mod sor;
mod ssr;
mod signature;

pub fn generate_excel_data_workbook(req: &ExcelCompileRequest) -> Result<Vec<u8>, XlsxError> {
    let mut workbook = Workbook::new();
    write_excel_data_sheets(&mut workbook, req, &HashMap::new(), false)?;
    super::print_settings::save_with_print_settings(workbook, req)
}

/// Compose the established SSR and SOR DATA sheet writers in any workbook.
/// DATA resource rates reference Individual Items in both standalone and project
/// workbooks. Project export additionally supplies the Lead rate references.
pub(crate) fn write_excel_data_sheets(
    workbook: &mut Workbook,
    req: &ExcelCompileRequest,
    lead_rate_refs: &HashMap<String, String>,
    require_lead_refs: bool,
) -> Result<HashMap<String, String>, XlsxError> {
    let individual_refs = individual::write_individual_items(workbook, req)?;
    if req.individual_only { return Ok(HashMap::new()); }
    let mut refs = if !req.recipes.is_empty() || req.morth.is_empty(){ssr::write_ssr_sheet(workbook, req, lead_rate_refs, require_lead_refs, false, &individual_refs)?}else{HashMap::new()};
    refs.extend(sor::write_sor_sheet(
        workbook,
        req,
        lead_rate_refs,
        require_lead_refs,
    )?);
    refs.extend(morth::write_morth_sheets(workbook, req, lead_rate_refs, require_lead_refs, &individual_refs)?);
    Ok(refs)
}
