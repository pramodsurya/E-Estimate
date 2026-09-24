use super::common::{col_letter, write_opt_number};
use super::grid::wrap_text_height;
use super::models::*;
use rust_xlsxwriter::{Color, Format, FormatAlign, FormatBorder, Workbook, XlsxError};
use std::collections::HashMap;

// ============================================================================
// Seigniorage statement workbook ("Seigniorage Statement" sheet).
// Ports excel-output/seigniorageExcel.ts: title block, KPI cards linked by
// formula to the grand totals, one material-group block each with live
// ROUND/SUM formulas, grand totals, net-payable breakdown, rounded net,
// statutory note and signature block. Columns F/H feed I (`ROUND(F*H,2)`),
// I feeds J/K/L (`ROUND(I*0.30/0.02/permit%,2)`), subtotals SUM their group,
// the grand row SUMs the subtotals.
// ============================================================================

const SEIG_MONEY_FMT: &str = "#,##0.00;[Red]-#,##0.00";
const SEIG_QTY_FMT: &str = "#,##0.000";
const SEIG_ROUND_FMT: &str = "#,##0;[Red]-#,##0";
const SEIG_DEFAULT_PERMIT_BASIS: &str = "G.O.Ms.No.21, dt. 31.03.2022, w.e.f. 01.04.2022";

fn seig_permit_note(row: &SeigniorageRowPayload) -> String {
    if let Some(n) = &row.permit_note {
        return n.clone();
    }
    if row.permit.is_none() {
        return String::new();
    }
    if row.permit_percent == 0.0 {
        return "Exempt".to_string();
    }
    if row.permit_percent.fract() == 0.0 {
        format!("@ {}%", row.permit_percent as i64)
    } else {
        format!("@ {}%", row.permit_percent)
    }
}

pub fn generate_excel_seigniorage_workbook(
    payload: &SeignioragePayload,
    req: &ExcelCompileRequest,
) -> Result<Vec<u8>, XlsxError> {
    let mut workbook = Workbook::new();
    let ws = workbook.add_worksheet();
    write_excel_seigniorage_sheet(ws, payload, "Seigniorage Statement", &[])?;
    super::print_settings::save_with_print_settings(workbook, req)
}

#[derive(Debug, Default)]
pub(crate) struct SeigniorageSheetRefs {
    pub total_seigniorage: String,
    pub total_dmft: String,
    pub total_smet: String,
    pub total_permit: String,
    pub lead_weights: HashMap<String, Vec<String>>,
}

fn excel_sheet_ref(name: &str) -> String {
    format!("'{}'", name.replace('\'', "''"))
}

pub(crate) fn write_excel_seigniorage_sheet(
    ws: &mut rust_xlsxwriter::Worksheet,
    payload: &SeignioragePayload,
    sheet_name: &str,
    project_links: &[ProjectSeigniorageLink],
) -> Result<SeigniorageSheetRefs, XlsxError> {
    let navy = Color::RGB(0x0B3D5C);
    let accent = Color::RGB(0x087E8B);
    let page_header = Color::RGB(0x1D3A54);
    let col_header = Color::RGB(0x007791);
    let group_fill = Color::RGB(0xE6F4F1);
    let subtotal_fill = Color::RGB(0xEDF7F6);
    let grand_fill = Color::RGB(0xD4EBF2);
    let net_fill = Color::RGB(0x0B3D5C);
    let even_fill = Color::RGB(0xF8FAFC);
    let kpi_fill = Color::RGB(0xF0F9FF);
    let dark = Color::RGB(0x0F172A);
    let muted = Color::RGB(0x475569);
    let white = Color::RGB(0xFFFFFF);

    ws.set_name(sheet_name)?;
    ws.set_landscape();
    ws.set_print_fit_to_pages(1, 0);

    let widths = [
        6.0, 18.0, 44.0, 14.0, 10.0, 16.0, 10.0, 14.0, 18.0, 16.0, 14.0, 17.0, 15.0,
    ];
    for (i, w) in widths.iter().enumerate() {
        ws.set_column_width(i as u16, *w)?;
    }

    ws.merge_range(
        0,
        0,
        0,
        12,
        &payload.project_name.to_uppercase(),
        &Format::new()
            .set_font_name("Calibri")
            .set_font_size(15.0)
            .set_bold()
            .set_font_color(navy)
            .set_align(FormatAlign::Center)
            .set_align(FormatAlign::VerticalCenter),
    )?;
    ws.set_row_height(0, 28.0)?;
    ws.merge_range(
        1,
        0,
        1,
        12,
        "SEIGNIORAGE STATEMENT",
        &Format::new()
            .set_font_name("Calibri")
            .set_font_size(13.0)
            .set_bold()
            .set_font_color(page_header)
            .set_align(FormatAlign::Center)
            .set_align(FormatAlign::VerticalCenter),
    )?;
    ws.set_row_height(1, 24.0)?;
    ws.merge_range(
        2,
        0,
        2,
        12,
        &format!("Standard Schedule of Rates: {}", payload.sor_year),
        &Format::new()
            .set_font_name("Calibri")
            .set_font_size(10.0)
            .set_italic()
            .set_font_color(muted)
            .set_align(FormatAlign::Center)
            .set_align(FormatAlign::VerticalCenter),
    )?;
    ws.set_row_height(2, 18.0)?;
    ws.set_row_height(3, 6.0)?;

    // KPI cards (values are patched with formulas once totals are known).
    let kpi_label_fmt = Format::new()
        .set_font_name("Calibri")
        .set_font_size(9.0)
        .set_bold()
        .set_font_color(muted)
        .set_background_color(kpi_fill)
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter)
        .set_border(FormatBorder::Thin);
    let kpi_val_fmt = Format::new()
        .set_font_name("Calibri")
        .set_font_size(11.0)
        .set_bold()
        .set_font_color(navy)
        .set_background_color(kpi_fill)
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter)
        .set_border(FormatBorder::Thin);
    for (s, e, label) in [
        (1u16, 2u16, "TOTAL SEIGNIORAGE"),
        (3, 4, "DMFT (30%)"),
        (5, 6, "SMFT (2%)"),
        (7, 8, "PERMIT FEE"),
        (9, 11, "GRAND TOTAL (ROUNDED)"),
    ] {
        ws.merge_range(4, s, 4, e, label, &kpi_label_fmt)?;
        ws.merge_range(5, s, 5, e, "", &kpi_val_fmt)?;
    }
    ws.set_row_height(4, 18.0)?;
    ws.set_row_height(5, 24.0)?;
    ws.set_row_height(6, 8.0)?;

    // Table header (row 7, 0-based).
    let header_fmt = Format::new()
        .set_font_name("Calibri")
        .set_font_size(10.0)
        .set_bold()
        .set_font_color(white)
        .set_background_color(col_header)
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter)
        .set_text_wrap()
        .set_border(FormatBorder::Thin);
    for (i, h) in [
        "Sl.",
        "Item Code",
        "Description of Item & Mineral",
        "Work Qty",
        "Work Unit",
        "Seigniorage Qty",
        "Unit",
        "Rate (Rs.)",
        "Seigniorage (Rs.)",
        "DMFT 30% (Rs.)",
        "SMFT 2% (Rs.)",
        "Permit Fee (Rs.)",
        "Permit Rate",
    ]
    .iter()
    .enumerate()
    {
        ws.write_string_with_format(7, i as u16, *h, &header_fmt)?;
    }
    ws.set_row_height(7, 32.0)?;
    ws.set_freeze_panes(8, 0)?;
    ws.set_repeat_rows(7, 7)?;

    let body_fmt = Format::new()
        .set_font_name("Calibri")
        .set_font_size(10.0)
        .set_font_color(dark)
        .set_align(FormatAlign::VerticalCenter)
        .set_border(FormatBorder::Thin);
    let money_r = Format::new()
        .set_font_name("Calibri")
        .set_font_size(10.0)
        .set_font_color(dark)
        .set_num_format(SEIG_MONEY_FMT)
        .set_align(FormatAlign::Right)
        .set_align(FormatAlign::VerticalCenter)
        .set_border(FormatBorder::Thin);
    let qty_r = Format::new()
        .set_font_name("Calibri")
        .set_font_size(10.0)
        .set_font_color(dark)
        .set_num_format(SEIG_QTY_FMT)
        .set_align(FormatAlign::Right)
        .set_align(FormatAlign::VerticalCenter)
        .set_border(FormatBorder::Thin);

    let mut r: u32 = 8;
    let mut sl: u32 = 1;
    let mut subtotal_rows: Vec<u32> = Vec::new();
    let mut lead_weights: HashMap<String, Vec<String>> = HashMap::new();

    if payload.groups.iter().all(|g| g.rows.is_empty()) {
        ws.merge_range(
            r,
            0,
            r,
            12,
            "No seigniorage DATA rows available in this project.",
            &Format::new()
                .set_font_name("Calibri")
                .set_font_size(11.0)
                .set_italic()
                .set_font_color(muted)
                .set_align(FormatAlign::Center)
                .set_align(FormatAlign::VerticalCenter),
        )?;
        ws.set_row_height(r, 30.0)?;
        r += 1;
    }

    for group in &payload.groups {
        if group.rows.is_empty() {
            continue;
        }
        let heading = group
            .heading
            .clone()
            .filter(|h| !h.trim().is_empty())
            .unwrap_or_else(|| group.key.clone());
        ws.merge_range(
            r,
            0,
            r,
            12,
            &format!("MATERIAL GROUP: {}", heading.to_uppercase()),
            &Format::new()
                .set_font_name("Calibri")
                .set_font_size(10.5)
                .set_bold()
                .set_font_color(accent)
                .set_background_color(group_fill)
                .set_align(FormatAlign::Left)
                .set_align(FormatAlign::VerticalCenter)
                .set_border(FormatBorder::Thin),
        )?;
        ws.set_row_height(r, 24.0)?;
        r += 1;

        let start_excel = r + 1;
        for (pos_in_group, row) in group.rows.iter().enumerate() {
            let excel = r + 1;
            let even_fill_opt = if pos_in_group % 2 == 1 {
                Some(even_fill)
            } else {
                None
            };
            let mut cell_fmt = body_fmt.clone();
            let mut cell_money = money_r.clone();
            let mut cell_qty = qty_r.clone();
            if let Some(fill) = even_fill_opt {
                cell_fmt = cell_fmt.set_background_color(fill);
                cell_money = cell_money.set_background_color(fill);
                cell_qty = cell_qty.set_background_color(fill);
            }

            ws.write_number_with_format(
                r,
                0,
                sl as f64,
                &cell_fmt.clone().set_align(FormatAlign::Center),
            )?;
            sl += 1;
            ws.write_string_with_format(
                r,
                1,
                &row.item_code,
                &cell_fmt.clone().set_align(FormatAlign::Center),
            )?;
            ws.write_string_with_format(
                r,
                2,
                &row.description,
                &cell_fmt
                    .clone()
                    .set_align(FormatAlign::Left)
                    .set_text_wrap(),
            )?;
            let project_link = project_links.iter().find(|link| link.key == row.key);
            if let Some(formula) = project_link.and_then(|link| link.work_qty_formula.as_ref()) {
                ws.write_formula_with_format(r, 3, formula.as_str(), &cell_qty)?;
            } else {
                write_opt_number(ws, r, 3, row.work_qty, &cell_qty)?;
            }
            ws.write_string_with_format(
                r,
                4,
                &row.work_unit,
                &cell_fmt.clone().set_align(FormatAlign::Center),
            )?;
            if let Some(link) = project_link {
                if link.terms.is_empty() {
                    return Err(XlsxError::CustomError(format!(
                        "project Seigniorage row '{}' has no quantity terms",
                        row.key
                    )));
                }
                let mut refs = Vec::new();
                for (term_index, term) in link.terms.iter().enumerate() {
                    let helper_col = 13 + term_index as u16;
                    ws.write_formula_with_format(r, helper_col, term.formula.as_str(), &cell_qty)?;
                    ws.set_column_hidden(helper_col)?;
                    let cell_ref = format!(
                        "{}!${}${}",
                        excel_sheet_ref(sheet_name),
                        col_letter(helper_col),
                        excel
                    );
                    refs.push(cell_ref.clone());
                    if let Some(variant_id) =
                        term.lead_variant_id.as_ref().filter(|id| !id.is_empty())
                    {
                        lead_weights
                            .entry(variant_id.clone())
                            .or_default()
                            .push(cell_ref);
                    }
                }
                ws.write_formula_with_format(
                    r,
                    5,
                    format!("=ROUND(SUM({}),3)", refs.join(",")).as_str(),
                    &cell_qty,
                )?;
            } else {
                write_opt_number(ws, r, 5, row.seig_qty, &cell_qty)?;
            }
            ws.write_string_with_format(
                r,
                6,
                &row.seig_unit,
                &cell_fmt.clone().set_align(FormatAlign::Center),
            )?;
            write_opt_number(ws, r, 7, row.rate, &cell_money)?;

            let f_col = col_letter(5);
            let h_col = col_letter(7);
            if row.seig_qty.is_some() && row.rate.is_some() {
                ws.write_formula_with_format(
                    r,
                    8,
                    format!("=ROUND({f}{e}*{h}{e},2)", f = f_col, h = h_col, e = excel).as_str(),
                    &cell_money,
                )?;
            } else {
                ws.write_number_with_format(r, 8, row.seigniorage.unwrap_or(0.0), &cell_money)?;
            }
            ws.write_formula_with_format(
                r,
                9,
                format!("=ROUND(I{excel}*0.30,2)", excel = excel).as_str(),
                &cell_money,
            )?;
            ws.write_formula_with_format(
                r,
                10,
                format!("=ROUND(I{excel}*0.02,2)", excel = excel).as_str(),
                &cell_money,
            )?;
            if row.permit_percent > 0.0 {
                let factor = format!("{:.4}", row.permit_percent / 100.0);
                ws.write_formula_with_format(
                    r,
                    11,
                    format!(
                        "=ROUND(I{excel}*{factor},2)",
                        excel = excel,
                        factor = factor
                    )
                    .as_str(),
                    &cell_money,
                )?;
            } else {
                ws.write_number_with_format(r, 11, 0.0, &cell_money)?;
            }
            ws.write_string_with_format(
                r,
                12,
                seig_permit_note(row),
                &cell_fmt.set_align(FormatAlign::Center),
            )?;

            // Material description wraps in col C (44.0 chars).
            ws.set_row_height(r, wrap_text_height(&row.description, 44.0, 10.0, 22.0))?;
            r += 1;
        }
        let end_excel = r; // 0-based r now past last row, so Excel row = r

        let sub_label = group
            .subtotal_label
            .clone()
            .unwrap_or_else(|| format!("Subtotal \u{2014} {}", heading));
        ws.merge_range(
            r,
            0,
            r,
            7,
            &sub_label,
            &Format::new()
                .set_font_name("Calibri")
                .set_font_size(10.0)
                .set_bold()
                .set_font_color(dark)
                .set_background_color(subtotal_fill)
                .set_align(FormatAlign::Right)
                .set_align(FormatAlign::VerticalCenter)
                .set_border_top(FormatBorder::Medium)
                .set_border_bottom(FormatBorder::Thin)
                .set_border_left(FormatBorder::Thin)
                .set_border_right(FormatBorder::Thin),
        )?;
        for (col, letter) in [(8u16, "I"), (9, "J"), (10, "K"), (11, "L")] {
            ws.write_formula_with_format(
                r,
                col,
                format!(
                    "=SUM({l}{s}:{l}{e})",
                    l = letter,
                    s = start_excel,
                    e = end_excel
                )
                .as_str(),
                &Format::new()
                    .set_font_name("Calibri")
                    .set_font_size(10.0)
                    .set_bold()
                    .set_font_color(dark)
                    .set_background_color(subtotal_fill)
                    .set_num_format(SEIG_MONEY_FMT)
                    .set_align(FormatAlign::Right)
                    .set_align(FormatAlign::VerticalCenter)
                    .set_border_top(FormatBorder::Medium)
                    .set_border_bottom(FormatBorder::Thin)
                    .set_border_left(FormatBorder::Thin)
                    .set_border_right(FormatBorder::Thin),
            )?;
        }
        ws.write_string_with_format(
            r,
            12,
            "",
            &Format::new()
                .set_background_color(subtotal_fill)
                .set_border_top(FormatBorder::Medium)
                .set_border_bottom(FormatBorder::Thin)
                .set_border_left(FormatBorder::Thin)
                .set_border_right(FormatBorder::Thin),
        )?;
        ws.set_row_height(r, 22.0)?;
        subtotal_rows.push(r);
        r += 1;
    }

    ws.set_row_height(r, 8.0)?;
    r += 1;

    // Grand total row.
    let grand = r;
    let grand1 = grand + 1;
    ws.merge_range(
        grand,
        0,
        grand,
        7,
        "GRAND TOTAL (ALL MATERIAL GROUPS)",
        &Format::new()
            .set_font_name("Calibri")
            .set_font_size(11.0)
            .set_bold()
            .set_font_color(navy)
            .set_background_color(grand_fill)
            .set_align(FormatAlign::Right)
            .set_align(FormatAlign::VerticalCenter)
            .set_border_top(FormatBorder::Medium)
            .set_border_bottom(FormatBorder::Double)
            .set_border_left(FormatBorder::Thin)
            .set_border_right(FormatBorder::Thin),
    )?;
    let grand_money = Format::new()
        .set_font_name("Calibri")
        .set_font_size(11.0)
        .set_bold()
        .set_font_color(navy)
        .set_background_color(grand_fill)
        .set_num_format(SEIG_MONEY_FMT)
        .set_align(FormatAlign::Right)
        .set_align(FormatAlign::VerticalCenter)
        .set_border_top(FormatBorder::Medium)
        .set_border_bottom(FormatBorder::Double)
        .set_border_left(FormatBorder::Thin)
        .set_border_right(FormatBorder::Thin);
    if subtotal_rows.is_empty() {
        for col in 8u16..=11u16 {
            ws.write_number_with_format(grand, col, 0.0, &grand_money)?;
        }
    } else {
        for (col, letter) in [(8u16, "I"), (9, "J"), (10, "K"), (11, "L")] {
            let refs: Vec<String> = subtotal_rows
                .iter()
                .map(|sr| format!("{}{}", letter, sr + 1))
                .collect();
            ws.write_formula_with_format(
                grand,
                col,
                format!("=SUM({})", refs.join(",")).as_str(),
                &grand_money,
            )?;
        }
    }
    ws.write_string_with_format(
        grand,
        12,
        "",
        &Format::new()
            .set_background_color(grand_fill)
            .set_border_top(FormatBorder::Medium)
            .set_border_bottom(FormatBorder::Double)
            .set_border_left(FormatBorder::Thin)
            .set_border_right(FormatBorder::Thin),
    )?;
    ws.set_row_height(grand, 25.0)?;
    r = grand + 1;
    ws.set_row_height(r, 8.0)?;
    r += 1;

    // Net-payable breakdown box.
    let breakdown: [(String, String, bool); 5] = [
        (
            "Total Seigniorage Fee".to_string(),
            format!("I{grand1}", grand1 = grand1),
            false,
        ),
        (
            "District Mineral Foundation Trust (DMFT 30%)".to_string(),
            format!("J{grand1}", grand1 = grand1),
            false,
        ),
        (
            "State Mineral Exploration Trust (SMFT 2%)".to_string(),
            format!("K{grand1}", grand1 = grand1),
            false,
        ),
        (
            "Mineral Transit Permit Fee".to_string(),
            format!("L{grand1}", grand1 = grand1),
            false,
        ),
        (
            "NET TOTAL SEIGNIORAGE CHARGES".to_string(),
            format!("I{grand1}+J{grand1}+K{grand1}+L{grand1}", grand1 = grand1),
            true,
        ),
    ];
    for (label, formula, bold) in &breakdown {
        let mut lbl = Format::new()
            .set_font_name("Calibri")
            .set_font_size(if *bold { 11.0 } else { 10.0 })
            .set_font_color(if *bold { navy } else { dark })
            .set_align(FormatAlign::Right)
            .set_align(FormatAlign::VerticalCenter)
            .set_border(FormatBorder::Thin);
        let mut val = Format::new()
            .set_font_name("Calibri")
            .set_font_size(if *bold { 11.0 } else { 10.0 })
            .set_font_color(if *bold { navy } else { dark })
            .set_num_format(SEIG_MONEY_FMT)
            .set_align(FormatAlign::Right)
            .set_align(FormatAlign::VerticalCenter)
            .set_border(FormatBorder::Thin);
        if *bold {
            lbl = lbl
                .set_bold()
                .set_background_color(grand_fill)
                .set_border_top(FormatBorder::Medium);
            val = val
                .set_bold()
                .set_background_color(grand_fill)
                .set_border_top(FormatBorder::Medium);
        }
        ws.merge_range(r, 5, r, 7, label, &lbl)?;
        ws.merge_range(r, 8, r, 11, "", &val)?;
        ws.write_formula_with_format(r, 8, format!("={}", formula).as_str(), &val)?;
        ws.set_row_height(r, if *bold { 24.0 } else { 20.0 })?;
        r += 1;
    }
    let net = r - 1;
    let net1 = net + 1;

    // Rounded net total payable.
    ws.merge_range(
        r,
        5,
        r,
        7,
        "ROUNDED NET TOTAL PAYABLE (Rs.)",
        &Format::new()
            .set_font_name("Calibri")
            .set_font_size(11.5)
            .set_bold()
            .set_font_color(white)
            .set_background_color(net_fill)
            .set_align(FormatAlign::Right)
            .set_align(FormatAlign::VerticalCenter)
            .set_border_top(FormatBorder::Medium)
            .set_border_bottom(FormatBorder::Double)
            .set_border_left(FormatBorder::Thin)
            .set_border_right(FormatBorder::Thin),
    )?;
    let round_val = Format::new()
        .set_font_name("Calibri")
        .set_font_size(12.0)
        .set_bold()
        .set_font_color(white)
        .set_background_color(net_fill)
        .set_num_format(SEIG_ROUND_FMT)
        .set_align(FormatAlign::Right)
        .set_align(FormatAlign::VerticalCenter)
        .set_border_top(FormatBorder::Medium)
        .set_border_bottom(FormatBorder::Double)
        .set_border_left(FormatBorder::Thin)
        .set_border_right(FormatBorder::Thin);
    ws.merge_range(r, 8, r, 11, "", &round_val)?;
    ws.write_formula_with_format(
        r,
        8,
        format!("=ROUND(I{net1},0)", net1 = net1).as_str(),
        &round_val,
    )?;
    ws.set_row_height(r, 26.0)?;
    let rounded = r;
    let rounded1 = rounded + 1;
    r += 1;

    // Link the top KPI cards to the grand/rounded rows.
    let kpi_money = Format::new()
        .set_font_name("Calibri")
        .set_font_size(11.0)
        .set_bold()
        .set_font_color(navy)
        .set_background_color(kpi_fill)
        .set_num_format(SEIG_MONEY_FMT)
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter)
        .set_border(FormatBorder::Thin);
    let kpi_round = Format::new()
        .set_font_name("Calibri")
        .set_font_size(11.0)
        .set_bold()
        .set_font_color(Color::RGB(0x007791))
        .set_background_color(kpi_fill)
        .set_num_format(SEIG_ROUND_FMT)
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter)
        .set_border(FormatBorder::Thin);
    ws.write_formula_with_format(
        5,
        1,
        format!("=I{grand1}", grand1 = grand1).as_str(),
        &kpi_money,
    )?;
    ws.write_formula_with_format(
        5,
        3,
        format!("=J{grand1}", grand1 = grand1).as_str(),
        &kpi_money,
    )?;
    ws.write_formula_with_format(
        5,
        5,
        format!("=K{grand1}", grand1 = grand1).as_str(),
        &kpi_money,
    )?;
    ws.write_formula_with_format(
        5,
        7,
        format!("=L{grand1}", grand1 = grand1).as_str(),
        &kpi_money,
    )?;
    ws.write_formula_with_format(
        5,
        9,
        format!("=I{rounded1}", rounded1 = rounded1).as_str(),
        &kpi_round,
    )?;

    ws.set_row_height(r, 12.0)?;
    r += 1;

    let basis = payload
        .permit_basis
        .clone()
        .filter(|b| !b.trim().is_empty())
        .unwrap_or_else(|| SEIG_DEFAULT_PERMIT_BASIS.to_string());
    ws.merge_range(
        r,
        0,
        r,
        12,
        &format!(
            "Note: Transit permit fee is charged in accordance with {}. DMFT @ 30% and SMFT @ 2% are statutory levies computed on basic seigniorage.",
            basis
        ),
        &Format::new()
            .set_font_name("Calibri")
            .set_font_size(9.5)
            .set_italic()
            .set_font_color(muted)
            .set_align(FormatAlign::Left)
            .set_align(FormatAlign::VerticalCenter),
    )?;
    ws.set_row_height(r, 20.0)?;
    r += 1;

    if !payload.signatures.is_empty() {
        ws.set_row_height(r, 18.0)?;
        r += 1;
        let n = payload.signatures.len().min(3);
        let span = (13 - 2) / n as u16;
        let sig_top = r + 2;
        for (idx, sig) in payload.signatures.iter().take(3).enumerate() {
            let start_col = 1 + idx as u16 * span;
            let end_col = start_col + span - 1;
            ws.merge_range(
                sig_top,
                start_col,
                sig_top,
                end_col,
                &sig.designation,
                &Format::new()
                    .set_font_name("Calibri")
                    .set_font_size(10.0)
                    .set_bold()
                    .set_font_color(navy)
                    .set_align(FormatAlign::Center)
                    .set_align(FormatAlign::VerticalCenter)
                    .set_border_top(FormatBorder::Thin),
            )?;
            if !sig.office.trim().is_empty() {
                ws.merge_range(
                    sig_top + 1,
                    start_col,
                    sig_top + 1,
                    end_col,
                    &sig.office,
                    &Format::new()
                        .set_font_name("Calibri")
                        .set_font_size(9.0)
                        .set_font_color(muted)
                        .set_align(FormatAlign::Center)
                        .set_align(FormatAlign::VerticalCenter),
                )?;
            }
        }
        ws.set_row_height(sig_top - 1, 25.0)?;
        ws.set_row_height(sig_top, 20.0)?;
        ws.set_row_height(sig_top + 1, 18.0)?;
        r = sig_top + 3;
    }

    ws.set_landscape();
    ws.set_header("&R&8&\"Calibri\"Generated by E-Estimate");
    ws.set_footer(format!(
        "&L&8&\"Calibri\"{}&R&8&\"Calibri\"Page &P of &N",
        payload.project_name
    ));
    ws.set_print_area(0, 0, r.saturating_sub(1), 12)?;
    let sheet = excel_sheet_ref(sheet_name);
    Ok(SeigniorageSheetRefs {
        total_seigniorage: format!("{sheet}!$I${grand1}"),
        total_dmft: format!("{sheet}!$J${grand1}"),
        total_smet: format!("{sheet}!$K${grand1}"),
        total_permit: format!("{sheet}!$L${grand1}"),
        lead_weights,
    })
}
