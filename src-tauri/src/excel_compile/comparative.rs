use super::common::{unique_sheet_name, val_to_string};
use super::models::*;
use rust_xlsxwriter::{Color, Format, FormatAlign, FormatBorder, Workbook, XlsxError};

// ============================================================================
// Comparative statement workbook. Ports comparativeExcel.ts:
// "Summary" sheet plus one sheet per component (plus "Lead charges" when
// lead rows exist), merged title block, frozen headings, autofiltered
// tables, bold totals, red qualification notes. Blanks stay blank â€” a row
// that exists in one year only has an empty cell, never a zero.
// ============================================================================

const CMP_MONEY_FMT: &str = "#,##0.00;[Red]-#,##0.00";
const CMP_PCT_FMT: &str = "0.00\"%\";[Red]-0.00\"%\"";
const CMP_QTY_FMT: &str = "#,##0.000";

enum CmpVal {
    Text(String),
    Num(f64, &'static str),
    Blank,
}

fn cmp_money(v: Option<f64>) -> CmpVal {
    match v {
        Some(n) => CmpVal::Num(n, CMP_MONEY_FMT),
        None => CmpVal::Blank,
    }
}

fn cmp_pct(v: Option<f64>) -> CmpVal {
    match v {
        Some(n) => CmpVal::Num(n, CMP_PCT_FMT),
        None => CmpVal::Blank,
    }
}

fn cmp_is_total_row(row: &ComparativeRowPayload) -> bool {
    row.kind == "total" || row.kind == "grand"
}

fn write_cmp_row(
    ws: &mut rust_xlsxwriter::Worksheet,
    row: u32,
    vals: &[CmpVal],
    desc_col: usize,
    total: bool,
) -> Result<(), XlsxError> {
    let ink = Color::RGB(0x1F2933);
    let total_fill = Color::RGB(0xEFF3F6);
    for (i, v) in vals.iter().enumerate() {
        let col = i as u16;
        let mut fmt = Format::new()
            .set_font_name("Calibri")
            .set_font_size(10.0)
            .set_font_color(ink)
            .set_align(FormatAlign::VerticalCenter)
            .set_border(FormatBorder::Thin);
        if total {
            fmt = fmt
                .set_bold()
                .set_background_color(total_fill)
                .set_border_top(FormatBorder::Medium);
        }
        match v {
            CmpVal::Text(s) => {
                if i == desc_col {
                    fmt = fmt.set_align(FormatAlign::Left).set_text_wrap();
                } else {
                    fmt = fmt.set_align(FormatAlign::Center);
                }
                ws.write_string_with_format(row, col, s, &fmt)?;
            }
            CmpVal::Num(n, nf) => {
                fmt = fmt.set_num_format(*nf).set_align(FormatAlign::Right);
                if n.is_finite() {
                    ws.write_number_with_format(row, col, *n, &fmt)?;
                } else {
                    ws.write_blank(row, col, &fmt)?;
                }
            }
            CmpVal::Blank => {
                ws.write_blank(row, col, &fmt)?;
            }
        }
    }
    Ok(())
}

fn cmp_title_block(
    ws: &mut rust_xlsxwriter::Worksheet,
    project: &str,
    heading: &str,
    sub: &str,
    last_col: u16,
) -> Result<(), XlsxError> {
    let ink = Color::RGB(0x1F2933);
    let muted = Color::RGB(0x5C7080);
    ws.merge_range(
        0,
        0,
        0,
        last_col,
        project,
        &Format::new()
            .set_font_name("Calibri")
            .set_font_size(14.0)
            .set_bold()
            .set_font_color(ink)
            .set_align(FormatAlign::VerticalCenter),
    )?;
    ws.set_row_height(0, 22.0)?;
    ws.merge_range(
        1,
        0,
        1,
        last_col,
        heading,
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
        last_col,
        sub,
        &Format::new()
            .set_font_name("Calibri")
            .set_font_size(10.0)
            .set_italic()
            .set_font_color(muted),
    )?;
    ws.set_row_height(3, 6.0)?;
    Ok(())
}

fn cmp_header_row(
    ws: &mut rust_xlsxwriter::Worksheet,
    row: u32,
    headers: &[(String, f64)],
) -> Result<(), XlsxError> {
    let header_fill = Color::RGB(0x1D3A54);
    let white = Color::RGB(0xFFFFFF);
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
    for (i, (h, w)) in headers.iter().enumerate() {
        ws.set_column_width(i as u16, *w)?;
        ws.write_string_with_format(row, i as u16, h, &header_fmt)?;
    }
    ws.set_row_height(row, 30.0)?;
    ws.set_freeze_panes(row + 1, 0)?;
    Ok(())
}

fn write_comparative_summary(
    workbook: &mut Workbook,
    payload: &ComparativePayload,
    project: &str,
    heading: &str,
    sub: &str,
) -> Result<(), XlsxError> {
    let headers = vec![
        ("Sl.".to_string(), 6.0),
        ("Description".to_string(), 52.0),
        (format!("Amount {}", payload.left_year), 18.0),
        (format!("Amount {}", payload.right_year), 18.0),
        ("Difference".to_string(), 18.0),
        ("%".to_string(), 11.0),
    ];
    let last_col = headers.len() as u16 - 1;
    let ws = workbook.add_worksheet();
    ws.set_name("Summary")?;
    ws.set_landscape();
    ws.set_print_fit_to_pages(1, 0);
    cmp_title_block(ws, project, heading, sub, last_col)?;
    let header_at: u32 = 4;
    cmp_header_row(ws, header_at, &headers)?;

    let mut r = header_at + 1;
    for row in &payload.abstract_rows {
        let vals = [
            CmpVal::Text(val_to_string(&row.sl_no)),
            CmpVal::Text(row.label.clone()),
            cmp_money(row.left),
            cmp_money(row.right),
            cmp_money(row.difference),
            cmp_pct(row.percent),
        ];
        write_cmp_row(ws, r, &vals, 1, cmp_is_total_row(row))?;
        r += 1;
    }
    if !payload.abstract_rows.is_empty() {
        ws.autofilter(header_at, 0, r - 1, last_col)?;
    }

    if !payload.warnings.is_empty() {
        let mut at = header_at + payload.abstract_rows.len() as u32 + 3;
        ws.merge_range(
            at,
            0,
            at,
            last_col,
            "Read with these qualifications",
            &Format::new()
                .set_font_name("Calibri")
                .set_font_size(11.0)
                .set_bold()
                .set_font_color(Color::RGB(0x9C2B22)),
        )?;
        at += 1;
        for warning in &payload.warnings {
            let text = match &warning.detail {
                Some(d) if !d.trim().is_empty() => {
                    format!("{} {}", warning.message, d)
                }
                _ => warning.message.clone(),
            };
            ws.merge_range(
                at,
                0,
                at,
                last_col,
                &text,
                &Format::new()
                    .set_font_name("Calibri")
                    .set_font_size(10.0)
                    .set_font_color(Color::RGB(0x7A2018))
                    .set_text_wrap()
                    .set_align(FormatAlign::VerticalCenter),
            )?;
            ws.set_row_height(at, 28.0)?;
            at += 1;
        }
        r = at;
    }

    if r > 0 {
        ws.set_print_area(0, 0, r - 1, last_col)?;
    }
    Ok(())
}

fn write_comparative_component(
    workbook: &mut Workbook,
    payload: &ComparativePayload,
    component: &ComparativeComponentPayload,
    project: &str,
    used: &mut Vec<String>,
) -> Result<(), XlsxError> {
    let headers = vec![
        ("Sl.".to_string(), 6.0),
        ("Description".to_string(), 62.0),
        ("Unit".to_string(), 9.0),
        ("Quantity".to_string(), 14.0),
        (format!("Rate {}", payload.left_year), 15.0),
        (format!("Rate {}", payload.right_year), 15.0),
        (format!("Amount {}", payload.left_year), 18.0),
        (format!("Amount {}", payload.right_year), 18.0),
        ("Difference".to_string(), 18.0),
        ("%".to_string(), 11.0),
    ];
    let last_col = headers.len() as u16 - 1;
    let name = unique_sheet_name(&component.name, used);
    let ws = workbook.add_worksheet();
    ws.set_name(&name)?;
    ws.set_landscape();
    ws.set_print_fit_to_pages(1, 0);
    let sub = format!(
        "Component Abstract \u{00B7} {} compared with {}",
        payload.left_year, payload.right_year
    );
    cmp_title_block(ws, project, &component.name, &sub, last_col)?;
    let header_at: u32 = 4;
    cmp_header_row(ws, header_at, &headers)?;

    let mut r = header_at + 1;
    for row in &component.rows {
        let desc = match &row.description {
            Some(d) if !d.trim().is_empty() => {
                format!("{}\n{}", row.label, d)
            }
            _ => row.label.clone(),
        };
        let vals = [
            CmpVal::Text(val_to_string(&row.sl_no)),
            CmpVal::Text(desc),
            CmpVal::Text(row.unit.clone().unwrap_or_default()),
            match row.quantity {
                Some(n) => CmpVal::Num(n, CMP_QTY_FMT),
                None => CmpVal::Blank,
            },
            cmp_money(row.left_rate),
            cmp_money(row.right_rate),
            cmp_money(row.left),
            cmp_money(row.right),
            cmp_money(row.difference),
            cmp_pct(row.percent),
        ];
        write_cmp_row(ws, r, &vals, 1, false)?;
        r += 1;
    }
    if !component.rows.is_empty() {
        ws.autofilter(header_at, 0, r - 1, last_col)?;
    }

    let total_vals = [
        CmpVal::Text(String::new()),
        CmpVal::Text("COMPONENT TOTAL".to_string()),
        CmpVal::Text(String::new()),
        CmpVal::Blank,
        CmpVal::Blank,
        CmpVal::Blank,
        cmp_money(component.left_total),
        cmp_money(component.right_total),
        cmp_money(component.difference),
        cmp_pct(component.percent),
    ];
    write_cmp_row(ws, r, &total_vals, 1, true)?;
    ws.set_print_area(0, 0, r, last_col)?;
    Ok(())
}

/// Front Page (cover) workbook ("Front Page" sheet). Ports cover.typ:
/// centered government header, work name, estimated-cost box, the four-row
/// location table with bottom rules, engineering footer. A4 portrait, 12mm
/// margins like the Typst page, fit to one page.

pub fn generate_excel_comparative_workbook(
    payload: &ComparativePayload,
    req: &ExcelCompileRequest,
) -> Result<Vec<u8>, XlsxError> {
    let mut workbook = Workbook::new();
    let project = {
        let p = payload.project_name.trim();
        if !p.is_empty() {
            p.to_string()
        } else {
            match &payload.root_name {
                Some(r) if !r.trim().is_empty() => r.trim().to_string(),
                _ => "Estimate".to_string(),
            }
        }
    };
    let heading = if payload.whole_estimate {
        "Comparative Statement \u{2014} General Abstract"
    } else {
        "Comparative Statement \u{2014} Selected Work"
    };
    let mut sub = format!("{} compared with {}", payload.left_year, payload.right_year);
    if !payload.whole_estimate {
        sub.push_str(
            " \u{00B7} part of the estimate only; charges and GST are levied on the whole work and are not shown",
        );
    }

    let mut used = vec!["summary".to_string()];
    write_comparative_summary(&mut workbook, payload, &project, heading, &sub)?;

    if !payload.lead_rows.is_empty() {
        let body: Vec<ComparativeRowPayload> = payload
            .lead_rows
            .iter()
            .filter(|row| row.kind != "total")
            .cloned()
            .collect();
        let last_total = payload
            .lead_rows
            .iter()
            .rev()
            .find(|row| row.kind == "total");
        let lead_component = ComparativeComponentPayload {
            name: "Lead charges".to_string(),
            rows: body,
            left_total: last_total.and_then(|t| t.left).or(Some(0.0)),
            right_total: last_total.and_then(|t| t.right).or(Some(0.0)),
            difference: Some(0.0),
            percent: None,
        };
        write_comparative_component(&mut workbook, payload, &lead_component, &project, &mut used)?;
    }
    for component in &payload.components {
        write_comparative_component(&mut workbook, payload, component, &project, &mut used)?;
    }

    super::print_settings::save_with_print_settings(workbook, req)
}
