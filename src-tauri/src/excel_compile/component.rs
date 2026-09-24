use super::common::{excel_cache_dir, write_opt_number, EXCEL_UNIQUE};
use super::grid::{unique_grid_sheet_name, wrap_text_height, write_detail_grid};
use super::models::*;
use super::styles::{MONEY_FMT, QTY_FMT};
use rust_xlsxwriter::{Color, Format, FormatAlign, FormatBorder, Workbook, XlsxError};

fn write_opt_number_or_formula(
    ws: &mut rust_xlsxwriter::Worksheet,
    r: u32,
    c: u16,
    value: Option<f64>,
    formula: Option<&str>,
    fmt: &Format,
) -> Result<(), XlsxError> {
    if let Some(f) = formula {
        ws.write_formula_with_format(r, c, f, fmt)?;
    } else {
        write_opt_number(ws, r, c, value, fmt)?;
    }
    Ok(())
}

fn write_component_signatures_at_end(
    ws: &mut rust_xlsxwriter::Worksheet,
    grid: &DetailGridPayload,
    signatures: &[ComponentSignaturePayload],
    format: &Format,
) -> Result<(), XlsxError> {
    if signatures.is_empty() { return Ok(()); }
    let mut last_row = grid.row_heights.len().saturating_sub(1) as u32;
    for cell in &grid.cells { last_row = last_row.max(cell.r); }
    for merge in &grid.merges { last_row = last_row.max(merge.r2); }
    for image in &grid.images { last_row = last_row.max(image.r); }
    let last_col = grid.col_widths.len().saturating_sub(1) as u16;
    let mut row = last_row + 3;
    for signature in signatures {
        let text = [signature.designation.trim(), signature.office.trim()]
            .into_iter().filter(|value| !value.is_empty()).collect::<Vec<_>>().join(" — ");
        if text.is_empty() { continue; }
        if last_col > 0 { ws.merge_range(row, 0, row, last_col, &text, format)?; }
        else { ws.write_string_with_format(row, 0, &text, format)?; }
        ws.set_row_height(row, 22.0)?;
        row += 1;
    }
    ws.set_print_area(0, 0, row.saturating_sub(1), last_col)?;
    Ok(())
}

fn write_component_sheets(
    workbook: &mut Workbook,
    payload: &ComponentPayload,
    taken: &mut std::collections::HashSet<String>,
    bund_sheets: &[BundSheetPayload],
    req: &ExcelCompileRequest,
) -> Result<(), XlsxError> {
    let font_name = req.print_settings.as_ref()
        .map(|settings| settings.font_name.as_str())
        .filter(|name| !name.is_empty())
        .unwrap_or("Calibri");
    let font_scale = req.print_settings.as_ref()
        .and_then(|settings| settings.font_size_pt)
        .filter(|size| size.is_finite() && *size > 0.0)
        .unwrap_or(11.0).clamp(6.0, 18.0) / 11.0;
    let ink = Color::RGB(0x1F2933);
    let header_fill = Color::RGB(0x1D3A54);
    let total_fill = Color::RGB(0xEFF3F6);
    let muted = Color::RGB(0x5C7080);
    let white = Color::RGB(0xFFFFFF);

    let title_fmt = Format::new()
        .set_font_name(font_name)
        .set_font_size(14.0 * font_scale)
        .set_bold()
        .set_font_color(ink);
    let subtitle_fmt = Format::new()
        .set_font_name(font_name)
        .set_font_size(12.0 * font_scale)
        .set_bold()
        .set_font_color(ink);
    let kind_fmt = Format::new()
        .set_font_name(font_name)
        .set_font_size(10.0 * font_scale)
        .set_italic()
        .set_font_color(muted);
    let header_fmt = Format::new()
        .set_font_name(font_name)
        .set_font_size(10.0 * font_scale)
        .set_bold()
        .set_font_color(white)
        .set_background_color(header_fill)
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter)
        .set_text_wrap()
        .set_border(FormatBorder::Thin);
    let text_center = Format::new()
        .set_font_name(font_name)
        .set_font_size(10.0 * font_scale)
        .set_font_color(ink)
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter)
        .set_border(FormatBorder::Thin);
    let text_left = Format::new()
        .set_font_name(font_name)
        .set_font_size(10.0 * font_scale)
        .set_font_color(ink)
        .set_align(FormatAlign::Left)
        .set_align(FormatAlign::VerticalCenter)
        .set_text_wrap()
        .set_border(FormatBorder::Thin);
    let qty_fmt = Format::new()
        .set_font_name(font_name)
        .set_font_size(10.0 * font_scale)
        .set_font_color(ink)
        .set_num_format(QTY_FMT)
        .set_align(FormatAlign::Right)
        .set_align(FormatAlign::VerticalCenter)
        .set_border(FormatBorder::Thin);
    let money_fmt = Format::new()
        .set_font_name(font_name)
        .set_font_size(10.0 * font_scale)
        .set_font_color(ink)
        .set_num_format(MONEY_FMT)
        .set_align(FormatAlign::Right)
        .set_align(FormatAlign::VerticalCenter)
        .set_border(FormatBorder::Thin);
    let sub_left = Format::new()
        .set_font_name(font_name)
        .set_font_size(10.0 * font_scale)
        .set_bold()
        .set_font_color(ink)
        .set_background_color(total_fill)
        .set_align(FormatAlign::Left)
        .set_align(FormatAlign::VerticalCenter)
        .set_text_wrap()
        .set_border(FormatBorder::Thin);
    let sub_center = Format::new()
        .set_font_name(font_name)
        .set_font_size(10.0 * font_scale)
        .set_bold()
        .set_font_color(ink)
        .set_background_color(total_fill)
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter)
        .set_border(FormatBorder::Thin);
    let sub_money = Format::new()
        .set_font_name(font_name)
        .set_font_size(10.0 * font_scale)
        .set_bold()
        .set_font_color(ink)
        .set_background_color(total_fill)
        .set_num_format(MONEY_FMT)
        .set_align(FormatAlign::Right)
        .set_align(FormatAlign::VerticalCenter)
        .set_border(FormatBorder::Thin);
    let total_right = Format::new()
        .set_font_name(font_name)
        .set_font_size(10.0 * font_scale)
        .set_bold()
        .set_font_color(ink)
        .set_background_color(total_fill)
        .set_align(FormatAlign::Right)
        .set_align(FormatAlign::VerticalCenter)
        .set_border(FormatBorder::Thin)
        .set_border_top(FormatBorder::Medium);
    let total_money = Format::new()
        .set_font_name(font_name)
        .set_font_size(10.0 * font_scale)
        .set_bold()
        .set_font_color(ink)
        .set_background_color(total_fill)
        .set_num_format(MONEY_FMT)
        .set_align(FormatAlign::Right)
        .set_align(FormatAlign::VerticalCenter)
        .set_border(FormatBorder::Thin)
        .set_border_top(FormatBorder::Medium);
    let sig_fmt = Format::new()
        .set_font_name(font_name)
        .set_font_size(10.0 * font_scale)
        .set_italic()
        .set_font_color(muted)
        .set_align(FormatAlign::Right)
        .set_align(FormatAlign::VerticalCenter);

    // ---- Sheet 1: Abstract (mirrors the Typst abstract table). ----
    let ws = workbook.add_worksheet();
    ws.set_name("Abstract")?;
    ws.set_landscape();
    ws.set_print_fit_to_pages(1, 0);

    let widths = [7.0, 20.0, 58.0, 15.0, 10.0, 17.0, 19.0];
    for (i, w) in widths.iter().enumerate() {
        ws.set_column_width(i as u16, *w)?;
    }

    ws.merge_range(0, 0, 0, 6, &payload.project_name, &title_fmt)?;
    ws.set_row_height(0, 22.0)?;
    let statement = if payload.is_subcomponent {
        "Sub-component Statement"
    } else {
        "Component Statement"
    };
    let subtitle = if payload.component_code.trim().is_empty() {
        format!("{} \u{2014} {}", statement, payload.component_name)
    } else {
        format!(
            "{} \u{2014} {} ({})",
            statement, payload.component_name, payload.component_code
        )
    };
    ws.merge_range(1, 0, 1, 6, &subtitle, &subtitle_fmt)?;
    // Proper section heading, mirroring the Typst `Abstract of Estimate`.
    ws.merge_range(2, 0, 2, 6, "Abstract of Estimate", &kind_fmt)?;
    ws.set_row_height(3, 6.0)?;

    let header_at: u32 = 4;
    for (i, h) in [
        "S.No",
        "Code",
        "Description",
        "Quantity",
        "Unit",
        "Rate (Rs.)",
        "Cost (Rs.)",
    ]
    .iter()
    .enumerate()
    {
        ws.write_string_with_format(header_at, i as u16, *h, &header_fmt)?;
    }
    ws.set_row_height(header_at, 30.0)?;
    ws.set_freeze_panes(header_at + 1, 0)?;

    let mut r = header_at + 1;
    for row in &payload.abstract_rows {
        let desc = if !row.description.trim().is_empty() && row.description != row.heading {
            format!("{}\n{}", row.heading, row.description)
        } else {
            row.heading.clone()
        };
        if row.subtotal {
            ws.write_string_with_format(r, 0, &row.sl, &sub_center)?;
            ws.write_string_with_format(r, 1, &row.code, &sub_center)?;
            ws.write_string_with_format(r, 2, &desc, &sub_left)?;
            write_opt_number_or_formula(
                ws,
                r,
                3,
                row.quantity,
                row.qty_formula.as_deref(),
                &sub_money,
            )?;
            ws.write_string_with_format(r, 4, &row.unit, &sub_center)?;
            write_opt_number_or_formula(ws, r, 5, row.rate, None, &sub_money)?;
            write_opt_number_or_formula(
                ws,
                r,
                6,
                row.amount,
                row.amount_formula.as_deref(),
                &sub_money,
            )?;
        } else {
            ws.write_string_with_format(r, 0, &row.sl, &text_center)?;
            ws.write_string_with_format(r, 1, &row.code, &text_center)?;
            ws.write_string_with_format(r, 2, &desc, &text_left)?;
            write_opt_number_or_formula(
                ws,
                r,
                3,
                row.quantity,
                row.qty_formula.as_deref(),
                &qty_fmt,
            )?;
            ws.write_string_with_format(r, 4, &row.unit, &text_center)?;
            write_opt_number_or_formula(ws, r, 5, row.rate, None, &money_fmt)?;
            write_opt_number_or_formula(
                ws,
                r,
                6,
                row.amount,
                row.amount_formula.as_deref(),
                &money_fmt,
            )?;
        }
        // Description wraps in column C (58 chars): grow past the default
        // so heading + description are never clipped.
        ws.set_row_height(r, wrap_text_height(&desc, 58.0, 10.0, 15.0))?;
        r += 1;
    }
    if !payload.abstract_rows.is_empty() {
        ws.autofilter(header_at, 0, r - 1, 6)?;
    }

    ws.write_string_with_format(r, 0, "", &sub_center)?;
    ws.write_string_with_format(r, 1, "", &sub_center)?;
    ws.write_string_with_format(r, 2, "Total Cost", &total_right)?;
    ws.write_blank(r, 3, &sub_center)?;
    ws.write_string_with_format(r, 4, "", &sub_center)?;
    ws.write_blank(r, 5, &sub_center)?;
    // Live total over the Cost column (Excel rows are 1-based; the header
    // sits at Excel row 5). Falls back to the payload value when empty.
    let first_data_excel_row = header_at + 2;
    if payload.abstract_rows.is_empty() {
        write_opt_number(ws, r, 6, payload.total_cost, &total_money)?;
    } else {
        let last_data_excel_row = first_data_excel_row + payload.abstract_rows.len() as u32 - 1;
        ws.write_formula_with_format(
            r,
            6,
            format!("=SUM(G{first_data_excel_row}:G{last_data_excel_row})").as_str(),
            &total_money,
        )?;
    }
    ws.set_row_height(r, 20.0)?;
    r += 1;

    // The PDF signs after details. Only sign the Abstract when there are no
    // subsequent component sheets; otherwise write to the final sheet below.
    let signatures_on_abstract = payload.detailed_sheet.is_none()
        && bund_sheets.is_empty() && payload.detail_sheets.is_empty();
    for sig in payload.signatures.iter().filter(|_| signatures_on_abstract) {
        let line = if sig.office.trim().is_empty() {
            sig.designation.clone()
        } else {
            format!("{} \u{2014} {}", sig.designation, sig.office)
        };
        if line.trim().is_empty() {
            continue;
        }
        ws.merge_range(r, 2, r, 6, &line, &sig_fmt)?;
        ws.set_row_height(r, 16.0)?;
        r += 1;
    }

    ws.set_print_area(0, 0, r.saturating_sub(1), 6)?;

    // ---- Bund template sheets (ports `injectBundLayout`). ----
    // ---- Detail sheets (estimator grids; Typst item detail pages). ----
    taken.insert("Abstract".to_string());
    if !payload.detail_sheets.is_empty()
        || !bund_sheets.is_empty()
        || payload.detailed_sheet.is_some()
    {
        let img_dir = excel_cache_dir().map_err(XlsxError::CustomError)?;
        if let Some(detailed) = payload.detailed_sheet.as_ref() {
            let name = unique_grid_sheet_name(&mut *taken, &detailed.name);
            let sheet = workbook.add_worksheet();
            sheet.set_name(&name)?;
            if detailed.landscape {
                sheet.set_landscape();
            } else {
                sheet.set_portrait();
            }
            sheet.set_print_fit_to_pages(1, 0);
            write_detail_grid(sheet, &detailed.grid, &img_dir, &EXCEL_UNIQUE)?;
        }
        for sheet in bund_sheets {
            let name = unique_grid_sheet_name(&mut *taken, &sheet.name);
            let ws = workbook.add_worksheet();
            ws.set_name(&name)?;
            if sheet.landscape {
                ws.set_landscape();
            } else {
                ws.set_portrait();
            }
            ws.set_print_fit_to_pages(1, 0);
            write_detail_grid(ws, &sheet.grid, &img_dir, &EXCEL_UNIQUE)?;
        }
        // The stacked sheet replaces the per-item sheets; never both.
        if payload.detailed_sheet.is_none() {
            for detail in &payload.detail_sheets {
                let name = unique_grid_sheet_name(&mut *taken, &detail.name);
                let sheet = workbook.add_worksheet();
                sheet.set_name(&name)?;
                if detail.landscape {
                    sheet.set_landscape();
                } else {
                    sheet.set_portrait();
                }
                sheet.set_print_fit_to_pages(1, 0);
                write_detail_grid(sheet, &detail.grid, &img_dir, &EXCEL_UNIQUE)?;
            }
        }
    }

    if !signatures_on_abstract {
        let final_grid = if payload.detailed_sheet.is_none() && !payload.detail_sheets.is_empty() {
            &payload.detail_sheets.last().unwrap().grid
        } else if !bund_sheets.is_empty() {
            &bund_sheets.last().unwrap().grid
        } else {
            &payload.detailed_sheet.as_ref().unwrap().grid
        };
        let final_ws = workbook.worksheets_mut().last_mut().unwrap();
        write_component_signatures_at_end(final_ws, final_grid, &payload.signatures, &sig_fmt)?;
    }

    Ok(())
}

pub fn generate_excel_component_workbook(payload: &ComponentPayload, req: &ExcelCompileRequest) -> Result<Vec<u8>, XlsxError> {
    let mut workbook = Workbook::new();
    let mut taken = std::collections::HashSet::new();
    write_component_sheets(&mut workbook, payload, &mut taken, &[], req)?;
    super::print_settings::save_with_print_settings(workbook, req)
}

/// Bund template workbook: the full component sheets with the bund sheets
/// injected between the Items register and the external details. Ports
/// `injectBundLayout` — the bund signature is the component's own, kept at
/// the end of the Abstract sheet.
pub fn generate_excel_bund_workbook(payload: &BundPayload, req: &ExcelCompileRequest) -> Result<Vec<u8>, XlsxError> {
    let mut workbook = Workbook::new();
    let mut taken = std::collections::HashSet::new();
    write_component_sheets(
        &mut workbook,
        &payload.component,
        &mut taken,
        &payload.sheets,
        req,
    )?;
    super::print_settings::save_with_print_settings(workbook, req)
}

/// Guide-wall template workbook: same shape as bund (component sheets with
/// the template sheets injected). Ports `injectGuideWallLayout` — the
/// guide-wall signature is the component's own.
pub fn generate_excel_guidewall_workbook(payload: &GuideWallPayload, req: &ExcelCompileRequest) -> Result<Vec<u8>, XlsxError> {
    let mut workbook = Workbook::new();
    let mut taken = std::collections::HashSet::new();
    write_component_sheets(
        &mut workbook,
        &payload.component,
        &mut taken,
        &payload.sheets,
        req,
    )?;
    super::print_settings::save_with_print_settings(workbook, req)
}
