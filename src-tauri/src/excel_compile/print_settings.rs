use super::models::ExcelPrintSettingsPayload;
use rust_xlsxwriter::{Workbook, Worksheet, XlsxError};
use super::models::ExcelCompileRequest;
use std::collections::HashMap;

/// Apply resolved Print Studio page geometry after a writer has laid out its
/// cells. This does not touch formulas, cell styles, print ranges or tab order.
fn apply_sheet_settings(ws: &mut Worksheet, settings: &ExcelPrintSettingsPayload) {
    let paper = match settings.page_size.as_str() {
        "A2" => 66,
        "A3" => 8,
        "Letter" => 1,
        "Legal" => 5,
        _ => 9,
    };
    ws.set_paper_size(paper);
    if settings.orientation == "landscape" {
        ws.set_landscape();
    } else {
        ws.set_portrait();
    }
    if let Some(margins) = &settings.margins_mm {
        let inch = |mm: f64| mm / 25.4;
        ws.set_margins(
            inch(margins.left),
            inch(margins.right),
            inch(margins.top),
            inch(margins.bottom),
            0.1968,
            0.1968,
        );
    }
}

pub(crate) fn apply_workbook_print_settings(
    workbook: &mut Workbook,
    default: Option<&ExcelPrintSettingsPayload>,
    per_sheet: &HashMap<String, ExcelPrintSettingsPayload>,
) {
    for ws in workbook.worksheets_mut() {
        let name = ws.name();
        if let Some(settings) = per_sheet.get(&name).or(default) {
            apply_sheet_settings(ws, settings);
        }
    }
}

pub(crate) fn save_with_print_settings(
    mut workbook: Workbook,
    req: &ExcelCompileRequest,
) -> Result<Vec<u8>, XlsxError> {
    apply_workbook_print_settings(
        &mut workbook,
        req.print_settings.as_ref(),
        &req.sheet_print_settings,
    );
    workbook.save_to_buffer()
}
