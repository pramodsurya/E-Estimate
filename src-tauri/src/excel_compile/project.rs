use super::common::{excel_cache_dir, EXCEL_UNIQUE};
use super::cover::write_excel_cover_sheet;
use super::data::write_excel_data_sheets;
use super::grid::{unique_grid_sheet_name, write_detail_grid};
use super::lead::write_excel_lead_sheet;
use super::models::*;
use super::seigniorage::write_excel_seigniorage_sheet;
use rust_xlsxwriter::{Workbook, XlsxError};

pub fn generate_excel_project_workbook(
    payload: &ProjectPayload,
    req: &ExcelCompileRequest,
) -> Result<Vec<u8>, XlsxError> {
    let mut workbook = Workbook::new();
    let lead = req.lead.as_ref().ok_or_else(|| {
        XlsxError::CustomError("project workbook requires the existing Lead payload".to_string())
    })?;
    let seigniorage = req.seigniorage.as_ref().ok_or_else(|| {
        XlsxError::CustomError(
            "project workbook requires the existing Seigniorage payload".to_string(),
        )
    })?;
    let cover = req.cover.as_ref().ok_or_else(|| {
        XlsxError::CustomError("project workbook requires the existing Cover payload".to_string())
    })?;
    let seig_ws = workbook.add_worksheet();
    let seig_refs = write_excel_seigniorage_sheet(
        seig_ws,
        seigniorage,
        "Seigniorage Statement",
        &payload.seigniorage_links,
    )?;
    let lead_ws = workbook.add_worksheet();
    let lead_rate_refs =
        write_excel_lead_sheet(lead_ws, lead, "Lead Statement", &seig_refs.lead_weights)?;
    let data_rate_refs = write_excel_data_sheets(&mut workbook, req, &lead_rate_refs, true)?;
    let reusable_sheet_count = workbook.worksheets().len();
    let img_dir = excel_cache_dir().map_err(XlsxError::CustomError)?;
    if payload.cover_cost_ref.trim().is_empty() {
        return Err(XlsxError::CustomError(
            "project workbook requires the General Abstract cover cost reference".to_string(),
        ));
    }
    let cover_formula = format!("={}", payload.cover_cost_ref);
    let cover_ws = workbook.add_worksheet();
    write_excel_cover_sheet(
        cover_ws,
        cover,
        "Front Page",
        Some(&cover_formula),
        &img_dir,
    )?;

    let mut taken = std::collections::HashSet::new();
    taken.insert("Front Page".to_string());
    taken.insert("Lead Statement".to_string());
    taken.insert("Seigniorage Statement".to_string());
    taken.insert("SSR Items".to_string());
    if !req.sor.is_empty() {
        taken.insert("SOR Items".to_string());
    }
    for sheet in &payload.sheets {
        let name = unique_grid_sheet_name(&mut taken, &sheet.name);
        if name != sheet.name {
            return Err(XlsxError::CustomError(format!(
                "project sheet '{}' was renamed to '{}'; formula references would be invalid",
                sheet.name, name
            )));
        }
        let mut grid = sheet.grid.clone();
        for link in payload.links.iter().filter(|link| link.sheet == sheet.name) {
            let formula_ref = match link.kind.as_str() {
                "data-rate" => data_rate_refs.get(&link.key),
                "seigniorage" => Some(&seig_refs.total_seigniorage),
                "dmf" => Some(&seig_refs.total_dmft),
                "smet" => Some(&seig_refs.total_smet),
                "permit" => Some(&seig_refs.total_permit),
                other => {
                    return Err(XlsxError::CustomError(format!(
                        "unknown project formula link kind '{other}'"
                    )))
                }
            }
            .ok_or_else(|| {
                XlsxError::CustomError(format!(
                    "project DATA key '{}' has no exported adopted-rate cell",
                    link.key
                ))
            })?;
            let cell = grid
                .cells
                .iter_mut()
                .find(|cell| cell.r == link.r && cell.c == link.c)
                .ok_or_else(|| {
                    XlsxError::CustomError(format!(
                        "project formula link target {}!R{}C{} does not exist",
                        sheet.name, link.r, link.c
                    ))
                })?;
            cell.formula = Some(format!("={formula_ref}"));
            cell.value = None;
        }
        let ws = workbook.add_worksheet();
        ws.set_name(&name)?;
        if sheet.landscape {
            ws.set_landscape();
        } else {
            ws.set_portrait();
        }
        ws.set_print_fit_to_pages(1, 0);
        write_detail_grid(ws, &grid, &img_dir, &EXCEL_UNIQUE)?;
    }
    // Reusable Lead/DATA writers run first so their exact cell addresses can
    // feed the project formula links. Move their worksheets to the end after
    // all project sheets have been written; formulas use names, not indices.
    workbook.worksheets_mut().rotate_left(reusable_sheet_count);
    super::print_settings::save_with_print_settings(workbook, req)
}
