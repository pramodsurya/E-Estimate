use super::common::write_opt_number;
use super::models::*;
use super::styles::{MONEY_FMT, QTY_FMT};
use rust_xlsxwriter::{Color, Format, FormatAlign, FormatBorder, Workbook, XlsxError};

// ============================================================================
// BOQ workbook (single "BOQ" sheet). Ports boqExcel.ts:
// merged title headers, column widths, header fill, money/quantity formats,
// frozen headings, autofiltered table, bold totals row. A missing quantity,
// rate or cost is a genuinely empty cell, never a zero.
// ============================================================================

pub fn generate_excel_boq_workbook(payload: &BoqPayload, req: &ExcelCompileRequest) -> Result<Vec<u8>, XlsxError> {
    let mut workbook = Workbook::new();
    let ink = Color::RGB(0x1F2933);
    let header_fill = Color::RGB(0x1D3A54);
    let total_fill = Color::RGB(0xEFF3F6);
    let muted = Color::RGB(0x5C7080);
    let white = Color::RGB(0xFFFFFF);

    let ws = workbook.add_worksheet();
    ws.set_name("BOQ")?;
    ws.set_landscape();
    ws.set_print_fit_to_pages(1, 0);

    let widths = [7.0, 20.0, 58.0, 15.0, 10.0, 17.0, 19.0];
    for (i, w) in widths.iter().enumerate() {
        ws.set_column_width(i as u16, *w)?;
    }

    ws.merge_range(
        0,
        0,
        0,
        6,
        &payload.project_name,
        &Format::new()
            .set_font_name("Calibri")
            .set_font_size(14.0)
            .set_bold()
            .set_font_color(ink),
    )?;
    ws.set_row_height(0, 22.0)?;
    ws.merge_range(
        1,
        0,
        1,
        6,
        &format!("Bill of Quantities \u{2014} {}", payload.component_name),
        &Format::new()
            .set_font_name("Calibri")
            .set_font_size(12.0)
            .set_bold()
            .set_font_color(ink),
    )?;
    ws.merge_range(
        2,
        0,
        2,
        6,
        if payload.is_subcomponent {
            "Sub-component BOQ"
        } else {
            "Component BOQ"
        },
        &Format::new()
            .set_font_name("Calibri")
            .set_font_size(10.0)
            .set_italic()
            .set_font_color(muted),
    )?;
    ws.set_row_height(3, 6.0)?;

    let header_at: u32 = 4;
    let header_fmt = Format::new()
        .set_font_name("Calibri")
        .set_font_size(10.0)
        .set_bold()
        .set_font_color(white)
        .set_background_color(header_fill)
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter)
        .set_text_wrap()
        .set_border(FormatBorder::Thin);
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

    let text_center = Format::new()
        .set_font_name("Calibri")
        .set_font_size(10.0)
        .set_font_color(ink)
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter)
        .set_border(FormatBorder::Thin);
    let text_left = Format::new()
        .set_font_name("Calibri")
        .set_font_size(10.0)
        .set_font_color(ink)
        .set_align(FormatAlign::Left)
        .set_align(FormatAlign::VerticalCenter)
        .set_text_wrap()
        .set_border(FormatBorder::Thin);
    let qty_fmt = Format::new()
        .set_font_name("Calibri")
        .set_font_size(10.0)
        .set_font_color(ink)
        .set_num_format(QTY_FMT)
        .set_align(FormatAlign::Right)
        .set_align(FormatAlign::VerticalCenter)
        .set_border(FormatBorder::Thin);
    let money_fmt = Format::new()
        .set_font_name("Calibri")
        .set_font_size(10.0)
        .set_font_color(ink)
        .set_num_format(MONEY_FMT)
        .set_align(FormatAlign::Right)
        .set_align(FormatAlign::VerticalCenter)
        .set_border(FormatBorder::Thin);

    let mut r = header_at + 1;
    for row in &payload.rows {
        let desc = if !row.description.trim().is_empty() && row.description != row.heading {
            format!("{}\n{}", row.heading, row.description)
        } else {
            row.heading.clone()
        };
        ws.write_string_with_format(r, 0, &row.sl, &text_center)?;
        ws.write_string_with_format(r, 1, &row.code, &text_center)?;
        ws.write_string_with_format(r, 2, &desc, &text_left)?;
        write_opt_number(ws, r, 3, row.quantity, &qty_fmt)?;
        ws.write_string_with_format(r, 4, &row.unit, &text_center)?;
        write_opt_number(ws, r, 5, row.rate, &money_fmt)?;
        write_opt_number(ws, r, 6, row.amount, &money_fmt)?;
        r += 1;
    }
    if !payload.rows.is_empty() {
        ws.autofilter(header_at, 0, r - 1, 6)?;
    }

    let total_center = Format::new()
        .set_font_name("Calibri")
        .set_font_size(10.0)
        .set_bold()
        .set_font_color(ink)
        .set_background_color(total_fill)
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter)
        .set_border(FormatBorder::Thin)
        .set_border_top(FormatBorder::Medium);
    let total_right = Format::new()
        .set_font_name("Calibri")
        .set_font_size(10.0)
        .set_bold()
        .set_font_color(ink)
        .set_background_color(total_fill)
        .set_align(FormatAlign::Right)
        .set_align(FormatAlign::VerticalCenter)
        .set_border(FormatBorder::Thin)
        .set_border_top(FormatBorder::Medium);
    let total_money = Format::new()
        .set_font_name("Calibri")
        .set_font_size(10.0)
        .set_bold()
        .set_font_color(ink)
        .set_background_color(total_fill)
        .set_num_format(MONEY_FMT)
        .set_align(FormatAlign::Right)
        .set_align(FormatAlign::VerticalCenter)
        .set_border(FormatBorder::Thin)
        .set_border_top(FormatBorder::Medium);
    ws.write_string_with_format(r, 0, "", &total_center)?;
    ws.write_string_with_format(r, 1, "", &total_center)?;
    ws.write_string_with_format(r, 2, "Total Cost", &total_right)?;
    ws.write_blank(r, 3, &total_center)?;
    ws.write_string_with_format(r, 4, "", &total_center)?;
    ws.write_blank(r, 5, &total_center)?;
    write_opt_number(ws, r, 6, payload.total_cost, &total_money)?;
    ws.set_row_height(r, 20.0)?;

    ws.set_print_area(0, 0, r, 6)?;
    super::print_settings::save_with_print_settings(workbook, req)
}
