use super::common::{excel_cache_dir, EXCEL_UNIQUE};
use super::grid::{unique_grid_sheet_name, write_detail_grid};
use super::models::*;
use rust_xlsxwriter::{Workbook, XlsxError};

/// Introduction / item-sheet page workbook: the pre-composed grid on one
/// portrait sheet. Page setup (A4, margins, header/footer, breaks) comes
/// from `write_detail_grid`; orientation and fit are set here.
pub fn generate_excel_page_workbook(payload: &PagePayload, req: &ExcelCompileRequest) -> Result<Vec<u8>, XlsxError> {
    let mut workbook = Workbook::new();
    let mut taken: std::collections::HashSet<String> = std::collections::HashSet::new();
    let name = unique_grid_sheet_name(&mut taken, &payload.name);
    let ws = workbook.add_worksheet();
    ws.set_name(&name)?;
    if payload.landscape {
        ws.set_landscape();
    } else {
        ws.set_portrait();
    }
    ws.set_print_fit_to_pages(1, 0);
    let img_dir = excel_cache_dir().map_err(XlsxError::CustomError)?;
    write_detail_grid(ws, &payload.grid, &img_dir, &EXCEL_UNIQUE)?;
    super::print_settings::save_with_print_settings(workbook, req)
}
