use super::common::{excel_cache_dir, EXCEL_UNIQUE};
use super::grid::wrap_text_height;
use super::models::*;
use base64::Engine;
use rust_xlsxwriter::{
    Color, Format, FormatAlign, FormatBorder, Image, Workbook, Worksheet, XlsxError,
};
use std::path::Path;
use std::sync::atomic::Ordering;

pub fn generate_excel_cover_workbook(payload: &CoverPayload, req: &ExcelCompileRequest) -> Result<Vec<u8>, XlsxError> {
    let mut workbook = Workbook::new();
    let img_dir = excel_cache_dir().map_err(XlsxError::CustomError)?;
    let ws = workbook.add_worksheet();
    write_excel_cover_sheet(ws, payload, "Front Page", None, &img_dir)?;
    super::print_settings::save_with_print_settings(workbook, req)
}

/// Shared Front Page renderer. Project Excel calls this exact writer and only
/// replaces the estimated-cost value with its live General Abstract formula.
pub(crate) fn write_excel_cover_sheet(
    ws: &mut Worksheet,
    payload: &CoverPayload,
    sheet_name: &str,
    estimated_cost_formula: Option<&str>,
    image_dir: &Path,
) -> Result<(), XlsxError> {
    let green = Color::RGB(0x155D45);
    let wine = Color::RGB(0x722F37);
    let ink = Color::RGB(0x18231F);
    let muted = Color::RGB(0x56615D);
    let cost_fill = Color::RGB(0xF3F0E8);

    ws.set_name(sheet_name)?;
    ws.set_paper_size(9); // A4
    ws.set_portrait();
    ws.set_margins(0.4724, 0.4724, 0.4724, 0.4724, 0.1968, 0.1968);
    ws.set_print_fit_to_pages(1, 1);
    ws.set_print_center_horizontally(true);
    ws.set_column_width(0, 30.0)?;
    ws.set_column_width(1, 80.0)?;

    let center = |size: f64| {
        Format::new()
            .set_font_name("Times New Roman")
            .set_font_size(size)
            .set_font_color(ink)
            .set_align(FormatAlign::Center)
            .set_align(FormatAlign::VerticalCenter)
    };
    let govt = center(11.0).set_bold().set_font_color(green);
    let subhead = center(11.0).set_bold().set_font_color(wine);
    let eyebrow = center(9.0).set_bold().set_font_color(muted);
    let work = center(19.0).set_bold().set_text_wrap();
    let cost_label = center(9.0)
        .set_bold()
        .set_font_color(muted)
        .set_background_color(cost_fill);
    let cost_value = center(22.0).set_bold().set_background_color(cost_fill);
    let label_fmt = Format::new()
        .set_font_name("Times New Roman")
        .set_font_size(9.0)
        .set_bold()
        .set_font_color(muted)
        .set_align(FormatAlign::VerticalCenter)
        .set_border_bottom(FormatBorder::Thin);
    let value_fmt = Format::new()
        .set_font_name("Times New Roman")
        .set_font_size(11.0)
        .set_font_color(ink)
        .set_align(FormatAlign::VerticalCenter)
        .set_border_bottom(FormatBorder::Thin);
    let foot = center(9.0).set_font_color(muted);
    let foot_small = center(8.0).set_font_color(muted);

    ws.merge_range(0, 0, 0, 1, "GOVERNMENT OF TELANGANA", &govt)?;
    ws.set_row_height(1, 108.0)?;
    if let Some(encoded) = payload
        .emblem_base64
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    {
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(encoded.trim())
            .map_err(|e| XlsxError::CustomError(format!("cover emblem decode failed: {e}")))?;
        let n = EXCEL_UNIQUE.fetch_add(1, Ordering::Relaxed);
        let path = image_dir.join(format!("cover-emblem-{n}.png"));
        std::fs::write(&path, bytes)
            .map_err(|e| XlsxError::CustomError(format!("cover emblem write failed: {e}")))?;
        let image = Image::new(&path)
            .map_err(|e| XlsxError::CustomError(format!("cover emblem load failed: {e:?}")))?;
        // Two cover columns are about 770px wide; the 144px emblem is centred.
        ws.insert_image_with_offset(1, 0, &image, 313, 0)?;
    }
    ws.merge_range(2, 0, 2, 1, "DETAILED ESTIMATE", &subhead)?;
    ws.set_row_height(3, 8.0)?;
    ws.merge_range(4, 0, 4, 1, "NAME OF WORK", &eyebrow)?;
    ws.merge_range(5, 0, 5, 1, &payload.work_name, &work)?;
    ws.set_row_height(5, wrap_text_height(&payload.work_name, 110.0, 19.0, 36.0))?;
    ws.set_row_height(6, 8.0)?;
    ws.merge_range(7, 0, 7, 1, "ESTIMATED COST", &cost_label)?;
    ws.merge_range(8, 0, 8, 1, "", &cost_value)?;
    if let Some(formula) = estimated_cost_formula {
        ws.write_formula_with_format(8, 0, formula, &cost_value)?;
    } else {
        ws.write_string_with_format(8, 0, &payload.estimated_cost, &cost_value)?;
    }
    ws.set_row_height(8, 30.0)?;
    ws.set_row_height(9, 10.0)?;
    // Village/mandal/district rows are omitted entirely when the payload carries
    // no place (components in different locations): no blank rows. SSR YEAR stays.
    let mut info_rows: Vec<(&str, &str)> = Vec::new();
    for (label, value) in [
        ("VILLAGE", payload.village.as_str()),
        ("MANDAL", payload.mandal.as_str()),
        ("DISTRICT", payload.district.as_str()),
    ] {
        if !value.trim().is_empty() {
            info_rows.push((label, value));
        }
    }
    info_rows.push(("SSR YEAR", payload.ssr_year.as_str()));
    for (i, (label, value)) in info_rows.iter().enumerate() {
        let r = 10 + i as u32;
        ws.write_string_with_format(r, 0, *label, &label_fmt)?;
        ws.write_string_with_format(r, 1, *value, &value_fmt)?;
        ws.set_row_height(r, 20.0)?;
    }
    let foot_row = 10 + info_rows.len() as u32;
    ws.set_row_height(foot_row, 60.0)?;
    ws.merge_range(
        foot_row + 1,
        0,
        foot_row + 1,
        1,
        "ENGINEERING ESTIMATE",
        &foot,
    )?;
    ws.merge_range(
        foot_row + 2,
        0,
        foot_row + 2,
        1,
        "Prepared through E-Estimate",
        &foot_small,
    )?;
    ws.set_print_area(0, 0, foot_row + 2, 1)?;
    Ok(())
}
