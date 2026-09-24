use super::common::{json_opt_f64, parse_first_number};
use super::grid::wrap_text_height;
use super::models::*;
use rust_xlsxwriter::{Color, Format, FormatAlign, FormatBorder, Workbook, Worksheet, XlsxError};
use std::collections::HashMap;

// ============================================================================
// Lead statement workbook ("Lead Statement" sheet).
// Ports excel-output/leadExcel.ts: title block, A. Summary table, B.
// per-material detail (route, average/weighted audits, slab steps, handling
// and adopted rate), signature block. Missing figures render as an em dash.
// ============================================================================

const LEAD_MONEY_FMT: &str = "#,##0.00;[Red]-#,##0.00";
const LEAD_KM_FMT: &str = "#,##0.00";
const LEAD_QTY_FMT: &str = "#,##0.000";
const LEAD_SPAN: u16 = 7;

struct LeadCell {
    text: String,
    num: Option<f64>,
    fmt: Option<&'static str>,
    bold: bool,
    fill: Option<Color>,
    align: FormatAlign,
}

impl LeadCell {
    fn text(value: &str) -> Self {
        LeadCell {
            text: value.to_string(),
            num: None,
            fmt: None,
            bold: false,
            fill: None,
            align: FormatAlign::Left,
        }
    }
    fn num(value: Option<f64>, fmt: &'static str, align: FormatAlign) -> Self {
        LeadCell {
            text: "\u{2014}".to_string(),
            num: value,
            fmt: Some(fmt),
            bold: false,
            fill: None,
            align,
        }
    }
}

fn lead_title_row(
    ws: &mut rust_xlsxwriter::Worksheet,
    row: u32,
    text: &str,
) -> Result<(), XlsxError> {
    ws.merge_range(
        row,
        0,
        row,
        LEAD_SPAN,
        text,
        &Format::new()
            .set_font_name("Calibri")
            .set_font_size(14.0)
            .set_bold()
            .set_font_color(Color::RGB(0xFFFFFF))
            .set_background_color(Color::RGB(0x0B3D5C))
            .set_align(FormatAlign::Center)
            .set_align(FormatAlign::VerticalCenter),
    )?;
    ws.set_row_height(row, 24.0)?;
    Ok(())
}

fn lead_section_row(
    ws: &mut rust_xlsxwriter::Worksheet,
    row: u32,
    text: &str,
) -> Result<u32, XlsxError> {
    ws.merge_range(
        row,
        0,
        row,
        LEAD_SPAN,
        text,
        &Format::new()
            .set_font_name("Calibri")
            .set_font_size(11.0)
            .set_bold()
            .set_font_color(Color::RGB(0x0F172A))
            .set_background_color(Color::RGB(0xDBEAFE))
            .set_align(FormatAlign::Left)
            .set_align(FormatAlign::VerticalCenter)
            .set_border(FormatBorder::Thin),
    )?;
    ws.set_row_height(row, 20.0)?;
    Ok(row + 1)
}

fn lead_header_row(
    ws: &mut rust_xlsxwriter::Worksheet,
    row: u32,
    headers: &[&str],
) -> Result<u32, XlsxError> {
    for (i, h) in headers.iter().enumerate() {
        ws.write_string_with_format(
            row,
            i as u16,
            *h,
            &Format::new()
                .set_font_name("Calibri")
                .set_font_size(10.0)
                .set_bold()
                .set_font_color(Color::RGB(0xFFFFFF))
                .set_background_color(Color::RGB(0x0369A1))
                .set_align(FormatAlign::Center)
                .set_align(FormatAlign::VerticalCenter)
                .set_text_wrap()
                .set_border(FormatBorder::Thin),
        )?;
    }
    ws.set_row_height(row, 30.0)?;
    Ok(row + 1)
}

/// Body formats for merged detail rows: (center, left-wrap, right).
/// Only the merge top-left cells are ever written; interior merged cells are
/// left untouched.
fn lead_detail_fmts(even: bool) -> (Format, Format, Format) {
    let mut center = Format::new()
        .set_font_name("Calibri")
        .set_font_size(10.0)
        .set_font_color(Color::RGB(0x0F172A))
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter)
        .set_text_wrap()
        .set_border(FormatBorder::Thin);
    let mut left = Format::new()
        .set_font_name("Calibri")
        .set_font_size(10.0)
        .set_font_color(Color::RGB(0x0F172A))
        .set_align(FormatAlign::Left)
        .set_align(FormatAlign::VerticalCenter)
        .set_text_wrap()
        .set_border(FormatBorder::Thin);
    let mut right = Format::new()
        .set_font_name("Calibri")
        .set_font_size(10.0)
        .set_font_color(Color::RGB(0x0F172A))
        .set_align(FormatAlign::Right)
        .set_align(FormatAlign::VerticalCenter)
        .set_text_wrap()
        .set_border(FormatBorder::Thin);
    if even {
        let fill = Color::RGB(0xF8FAFC);
        center = center.set_background_color(fill);
        left = left.set_background_color(fill);
        right = right.set_background_color(fill);
    }
    (center, left, right)
}

fn lead_body_row(
    ws: &mut rust_xlsxwriter::Worksheet,
    row: u32,
    cells: &[LeadCell],
    even: bool,
) -> Result<u32, XlsxError> {
    let even_fill = Color::RGB(0xF8FAFC);
    for (i, entry) in cells.iter().enumerate() {
        let col = i as u16;
        let mut fmt = Format::new()
            .set_font_name("Calibri")
            .set_font_size(10.0)
            .set_font_color(Color::RGB(0x0F172A))
            .set_align(entry.align)
            .set_align(FormatAlign::VerticalCenter)
            .set_text_wrap()
            .set_border(FormatBorder::Thin);
        if entry.bold {
            fmt = fmt.set_bold();
        }
        let fill = entry.fill.or(if even { Some(even_fill) } else { None });
        if let Some(fill) = fill {
            fmt = fmt.set_background_color(fill);
        }
        match entry.num {
            Some(n) if n.is_finite() => {
                if let Some(nf) = entry.fmt {
                    fmt = fmt.set_num_format(nf);
                }
                ws.write_number_with_format(row, col, n, &fmt)?;
            }
            _ => {
                ws.write_string_with_format(row, col, &entry.text, &fmt)?;
            }
        }
    }
    ws.set_row_height(row, 18.0)?;
    Ok(row + 1)
}

fn lead_note_row(
    ws: &mut rust_xlsxwriter::Worksheet,
    row: u32,
    label: &str,
    value: &str,
    fill: Color,
) -> Result<u32, XlsxError> {
    ws.merge_range(
        row,
        0,
        row,
        1,
        label,
        &Format::new()
            .set_font_name("Calibri")
            .set_font_size(10.0)
            .set_bold()
            .set_font_color(Color::RGB(0x0F172A))
            .set_background_color(fill)
            .set_align(FormatAlign::VerticalCenter)
            .set_text_wrap()
            .set_border(FormatBorder::Thin),
    )?;
    ws.merge_range(
        row,
        2,
        row,
        LEAD_SPAN,
        value,
        &Format::new()
            .set_font_name("Calibri")
            .set_font_size(10.0)
            .set_font_color(Color::RGB(0x0F172A))
            .set_background_color(fill)
            .set_align(FormatAlign::VerticalCenter)
            .set_text_wrap()
            .set_border(FormatBorder::Thin),
    )?;
    ws.set_row_height(row, 18.0)?;
    Ok(row + 1)
}

fn lead_span_header(
    ws: &mut rust_xlsxwriter::Worksheet,
    row: u32,
    spans: &[(u16, u16, &str)],
) -> Result<u32, XlsxError> {
    for (from, to, _) in spans {
        if *to > *from {
            ws.merge_range(
                row,
                *from,
                row,
                *to,
                "",
                &Format::new()
                    .set_font_name("Calibri")
                    .set_font_size(10.0)
                    .set_bold()
                    .set_font_color(Color::RGB(0xFFFFFF))
                    .set_background_color(Color::RGB(0x0369A1))
                    .set_align(FormatAlign::Center)
                    .set_align(FormatAlign::VerticalCenter)
                    .set_text_wrap()
                    .set_border(FormatBorder::Thin),
            )?;
        }
    }
    for (from, _, text) in spans {
        ws.write_string_with_format(
            row,
            *from,
            *text,
            &Format::new()
                .set_font_name("Calibri")
                .set_font_size(10.0)
                .set_bold()
                .set_font_color(Color::RGB(0xFFFFFF))
                .set_background_color(Color::RGB(0x0369A1))
                .set_align(FormatAlign::Center)
                .set_align(FormatAlign::VerticalCenter)
                .set_text_wrap()
                .set_border(FormatBorder::Thin),
        )?;
    }
    ws.set_row_height(row, 30.0)?;
    Ok(row + 1)
}

fn lead_amount_row(
    ws: &mut rust_xlsxwriter::Worksheet,
    row: u32,
    label: &str,
    amount: Option<f64>,
    bold: bool,
    fill: Option<Color>,
) -> Result<u32, XlsxError> {
    let mut label_fmt = Format::new()
        .set_font_name("Calibri")
        .set_font_size(10.0)
        .set_font_color(Color::RGB(0x0F172A))
        .set_align(FormatAlign::Left)
        .set_align(FormatAlign::VerticalCenter)
        .set_text_wrap()
        .set_border(FormatBorder::Thin);
    let mut amount_fmt = Format::new()
        .set_font_name("Calibri")
        .set_font_size(10.0)
        .set_font_color(Color::RGB(0x0F172A))
        .set_num_format(LEAD_MONEY_FMT)
        .set_align(FormatAlign::Right)
        .set_align(FormatAlign::VerticalCenter)
        .set_text_wrap()
        .set_border(FormatBorder::Thin);
    if bold {
        label_fmt = label_fmt.set_bold();
        amount_fmt = amount_fmt.set_bold();
    }
    if let Some(fill) = fill {
        label_fmt = label_fmt.set_background_color(fill);
        amount_fmt = amount_fmt.set_background_color(fill);
    }
    ws.merge_range(row, 0, row, 5, label, &label_fmt)?;
    ws.merge_range(
        row,
        6,
        row,
        LEAD_SPAN,
        match amount {
            Some(_) => "",
            None => "\u{2014}",
        },
        &amount_fmt,
    )?;
    if let Some(n) = amount {
        if n.is_finite() {
            ws.write_number_with_format(row, 6, n, &amount_fmt)?;
        }
    }
    ws.set_row_height(row, 18.0)?;
    Ok(row + 1)
}

fn lead_step_amount(step: &LeadStepPayload) -> Option<f64> {
    if let Some(n) = json_opt_f64(&step.amount_value) {
        return Some(n);
    }
    match &step.amount {
        Some(serde_json::Value::String(s)) => parse_first_number(s),
        Some(serde_json::Value::Number(n)) => n.as_f64(),
        _ => None,
    }
}

fn lead_display(v: &Option<serde_json::Value>, missing: &str) -> String {
    match v {
        Some(serde_json::Value::String(s)) => {
            if s.trim().is_empty() {
                missing.to_string()
            } else {
                s.clone()
            }
        }
        Some(serde_json::Value::Number(n)) => {
            if let Some(f) = n.as_f64() {
                if f.fract() == 0.0 {
                    format!("{}", f as i64)
                } else {
                    format!("{}", f)
                }
            } else {
                missing.to_string()
            }
        }
        _ => missing.to_string(),
    }
}

pub fn generate_excel_lead_workbook(payload: &LeadPayload, req: &ExcelCompileRequest) -> Result<Vec<u8>, XlsxError> {
    let mut workbook = Workbook::new();
    let ws = workbook.add_worksheet();
    write_excel_lead_sheet(ws, payload, "Lead Statement", &HashMap::new())?;
    super::print_settings::save_with_print_settings(workbook, req)
}

fn excel_sheet_ref(name: &str) -> String {
    format!("'{}'", name.replace('\'', "''"))
}

fn weighted_rate_formula(
    distance_ref: &str,
    curve: &LeadWeightedRateCurvePayload,
) -> Option<String> {
    let h100 = curve.head_100m?;
    let h150 = curve.head_150m?;
    let u1 = curve.upto_1km?;
    let u2 = curve.upto_2km?;
    let u3 = curve.upto_3km?;
    let u4 = curve.upto_4km?;
    let u5 = curve.upto_5km?;
    let per = curve.per_km_5_to_30?;
    let beyond = curve.per_km_beyond_30?;
    let charged = format!("CEILING({distance_ref},1)");
    Some(format!(
        "=ROUND(IF({d}<=0.05,0,IF({d}<=0.1,{h100},IF({d}<=0.15,{h150},IF({c}<=1,{u1},IF({c}<=2,{u2},IF({c}<=3,{u3},IF({c}<=4,{u4},IF({c}<=5,{u5},{u5}+MIN({c}-5,25)*{per}+MAX({c}-30,0)*{beyond}))))))))),2)",
        d = distance_ref,
        c = charged
    ))
}

/// Write the established Lead Statement template into an existing worksheet
/// and return stable variant-id -> summary-rate-cell references for DATA.
pub(crate) fn write_excel_lead_sheet(
    ws: &mut Worksheet,
    payload: &LeadPayload,
    sheet_name: &str,
    project_weights: &HashMap<String, Vec<String>>,
) -> Result<HashMap<String, String>, XlsxError> {
    let mut rate_refs = HashMap::new();
    let mut summary_rows = HashMap::new();
    ws.set_name(sheet_name)?;
    ws.set_landscape();
    ws.set_print_fit_to_pages(1, 0);
    for (i, w) in [6.0, 42.0, 38.0, 12.0, 12.0, 10.0, 16.0, 10.0]
        .iter()
        .enumerate()
    {
        ws.set_column_width(i as u16, *w)?;
    }

    let project = if payload.project.trim().is_empty() {
        "Estimate"
    } else {
        payload.project.trim()
    };
    let mut r: u32 = 0;
    lead_title_row(ws, r, project)?;
    r += 1;
    lead_title_row(
        ws,
        r,
        if payload.title.trim().is_empty() {
            "LEAD STATEMENT & CONVEYANCE CHARGES"
        } else {
            payload.title.trim()
        },
    )?;
    r += 1;
    ws.merge_range(
        r,
        0,
        r,
        LEAD_SPAN,
        &format!(
            "{} \u{00B7} {} \u{00B7} {}",
            payload.subtitle, payload.year, payload.zone
        ),
        &Format::new()
            .set_font_name("Calibri")
            .set_font_size(10.0)
            .set_italic()
            .set_font_color(Color::RGB(0x475569))
            .set_align(FormatAlign::Center)
            .set_align(FormatAlign::VerticalCenter),
    )?;
    ws.set_row_height(r, 18.0)?;
    r += 1;
    if let Some(notes) = &payload.notes {
        if !notes.trim().is_empty() {
            ws.merge_range(
                r,
                0,
                r,
                LEAD_SPAN,
                notes,
                &Format::new()
                    .set_font_name("Calibri")
                    .set_font_size(9.0)
                    .set_font_color(Color::RGB(0x475569))
                    .set_align(FormatAlign::Center)
                    .set_align(FormatAlign::VerticalCenter)
                    .set_text_wrap(),
            )?;
            // Notes span the full width (6+42+38+12+12+10+16+10 chars).
            ws.set_row_height(
                r,
                wrap_text_height(
                    notes,
                    6.0 + 42.0 + 38.0 + 12.0 + 12.0 + 10.0 + 16.0 + 10.0,
                    9.0,
                    18.0,
                ),
            )?;
            r += 1;
        }
    }
    r += 1;

    r = lead_section_row(ws, r, "A. Summary")?;
    let summary_header = r;
    r = lead_header_row(
        ws,
        r,
        &[
            "Sl.",
            "Material",
            "Route / Quarry",
            "Class",
            "Lead (km)",
            "Lift (m)",
            "Rate (Rs)",
            "Uses",
        ],
    )?;
    for (i, item) in payload.rows.iter().enumerate() {
        let name = match &item.tag {
            Some(t) if !t.trim().is_empty() => {
                format!("{} [{}]", item.name, t.trim())
            }
            _ => item.name.clone(),
        };
        let mut rate_cell =
            LeadCell::num(json_opt_f64(&item.rate), LEAD_MONEY_FMT, FormatAlign::Right);
        rate_cell.bold = true;
        let cells = [
            LeadCell {
                text: item.sl.clone(),
                num: None,
                fmt: None,
                bold: false,
                fill: None,
                align: FormatAlign::Center,
            },
            LeadCell::text(&name),
            LeadCell::text(&item.quarry),
            LeadCell {
                text: item.class.clone(),
                num: None,
                fmt: None,
                bold: false,
                fill: None,
                align: FormatAlign::Center,
            },
            LeadCell::num(json_opt_f64(&item.lead_km), LEAD_KM_FMT, FormatAlign::Right),
            LeadCell::num(json_opt_f64(&item.lift_m), LEAD_KM_FMT, FormatAlign::Right),
            rate_cell,
            LeadCell {
                text: item.uses.clone(),
                num: None,
                fmt: None,
                bold: false,
                fill: None,
                align: FormatAlign::Center,
            },
        ];
        let rate_row = r;
        r = lead_body_row(ws, r, &cells, i % 2 == 1)?;
        if !item.key.trim().is_empty() {
            summary_rows.insert(item.key.clone(), rate_row);
            rate_refs.insert(
                item.key.clone(),
                format!("{}!$G${}", excel_sheet_ref(sheet_name), rate_row + 1),
            );
        }
    }
    if !payload.rows.is_empty() {
        ws.autofilter(summary_header, 0, r - 1, LEAD_SPAN)?;
    }
    ws.set_freeze_panes(summary_header + 1, 0)?;
    r += 1;

    r = lead_section_row(ws, r, "B. Detailed Lead Rate Calculations")?;
    let avg_fill = Color::RGB(0xF0FDF4);
    let weighted_fill = Color::RGB(0xEFF6FF);
    let total_fill = Color::RGB(0xDBEAFE);
    let note_white = Color::RGB(0xFFFFFF);
    for material in &payload.materials {
        let heading = format!(
            "{}. {} ({}){}",
            material.sl,
            material.name,
            material.lead_km_text,
            match &material.tag {
                Some(t) if !t.trim().is_empty() => format!(" \u{2014} {}", t.trim()),
                _ => String::new(),
            }
        );
        r = lead_section_row(ws, r, &heading)?;
        r = lead_note_row(ws, r, "Route", &material.route, note_white)?;

        if let Some(avg) = &material.avg_lead {
            r = lead_note_row(ws, r, "Sampling Mode", &avg.mode_label, avg_fill)?;
            r = lead_note_row(ws, r, "Component", &avg.component_name, avg_fill)?;
            r = lead_note_row(
                ws,
                r,
                "Total Points",
                &lead_display(&avg.point_count, "\u{2014}"),
                avg_fill,
            )?;
            r = lead_note_row(
                ws,
                r,
                "Adopted Average",
                &format!("{} km", avg.avg_km_text),
                avg_fill,
            )?;
            if !avg.routes.is_empty() {
                r = lead_span_header(
                    ws,
                    r,
                    &[
                        (0, 0, "Pt"),
                        (1, 4, "Chainage along line"),
                        (5, 7, "Route Distance"),
                    ],
                )?;
                for (pi, point) in avg.routes.iter().enumerate() {
                    let chainage = if !point.chainage_text.trim().is_empty() {
                        format!("Ch {} (along line)", point.chainage_text.trim())
                    } else if let Some(m) = point.chainage_m {
                        format!("Ch {} m (along line)", m)
                    } else {
                        "\u{2014}".to_string()
                    };
                    let route_km = if !point.route_km_text.trim().is_empty() {
                        parse_first_number(&point.route_km_text)
                    } else {
                        json_opt_f64(&point.route_km)
                    };
                    let pt_text = lead_display(&point.index, "");
                    let pt_num = json_opt_f64(&point.index);
                    let (pt_fmt, chain_fmt, km_fmt) = lead_detail_fmts(pi % 2 == 1);
                    match pt_num {
                        Some(n) if n.is_finite() => {
                            ws.write_number_with_format(r, 0, n, &pt_fmt)?;
                        }
                        _ => {
                            let t = if pt_text.is_empty() {
                                (pi + 1).to_string()
                            } else {
                                pt_text
                            };
                            ws.write_string_with_format(r, 0, &t, &pt_fmt)?;
                        }
                    }
                    ws.merge_range(r, 1, r, 4, &chainage, &chain_fmt)?;
                    ws.merge_range(r, 5, r, LEAD_SPAN, "", &km_fmt)?;
                    match route_km {
                        Some(n) if n.is_finite() => {
                            ws.write_number_with_format(
                                r,
                                5,
                                n,
                                &km_fmt.clone().set_num_format(LEAD_KM_FMT),
                            )?;
                        }
                        _ => {
                            ws.write_string_with_format(r, 5, "\u{2014}", &km_fmt)?;
                        }
                    }
                    ws.set_row_height(r, 18.0)?;
                    r += 1;
                }
            }
        }

        if let Some(weighted) = &material.weighted_lead {
            r = lead_note_row(ws, r, "Formula", &weighted.formula, weighted_fill)?;
            r = lead_span_header(
                ws,
                r,
                &[
                    (0, 2, "Source Variant"),
                    (3, 4, "Lead (km)"),
                    (5, 5, "Quantity"),
                    (6, 7, "Weight \u{00D7} Lead"),
                ],
            )?;
            for (ei, entry) in weighted.entries.iter().enumerate() {
                let (_, name_fmt, right_fmt) = lead_detail_fmts(ei % 2 == 1);
                ws.merge_range(r, 0, r, 2, &entry.name, &name_fmt)?;
                ws.merge_range(r, 3, r, 4, "", &right_fmt)?;
                match json_opt_f64(&entry.lead_km) {
                    Some(n) if n.is_finite() => {
                        ws.write_number_with_format(
                            r,
                            3,
                            n,
                            &right_fmt.clone().set_num_format(LEAD_KM_FMT),
                        )?;
                    }
                    _ => {
                        ws.write_string_with_format(r, 3, "\u{2014}", &right_fmt)?;
                    }
                }
                if let Some(weight_refs) = project_weights.get(&entry.key) {
                    ws.write_formula_with_format(
                        r,
                        5,
                        format!("=SUM({})", weight_refs.join(",")).as_str(),
                        &right_fmt.clone().set_num_format(LEAD_QTY_FMT),
                    )?;
                } else if project_weights.is_empty() {
                    let qty = format!("{} {}", entry.quantity_text, entry.unit);
                    ws.write_string_with_format(r, 5, &qty, &right_fmt)?;
                } else {
                    return Err(XlsxError::CustomError(format!(
                        "weighted Lead source '{}' has no Seigniorage weight cells",
                        entry.name
                    )));
                }
                ws.merge_range(r, 6, r, LEAD_SPAN, "", &right_fmt)?;
                if project_weights.contains_key(&entry.key) {
                    ws.write_formula_with_format(
                        r,
                        6,
                        format!("=D{}*F{}", r + 1, r + 1).as_str(),
                        &right_fmt.clone().set_num_format(LEAD_MONEY_FMT),
                    )?;
                } else {
                    match json_opt_f64(&entry.product) {
                        Some(n) if n.is_finite() => {
                            ws.write_number_with_format(
                                r,
                                6,
                                n,
                                &right_fmt.clone().set_num_format(LEAD_MONEY_FMT),
                            )?;
                        }
                        _ => {
                            ws.write_string_with_format(r, 6, "\u{2014}", &right_fmt)?;
                        }
                    }
                }
                ws.set_row_height(r, 18.0)?;
                r += 1;
            }
            let entry_start = r - weighted.entries.len() as u32;
            let entry_end = r.saturating_sub(1);
            let merge_border = Format::new().set_border(FormatBorder::Thin);
            ws.merge_range(r, 0, r, 4, "", &merge_border)?;
            ws.merge_range(r, 5, r, LEAD_SPAN, "", &merge_border)?;
            let total_qty_text = format!("Total Quantity (W): {}", weighted.total_quantity_text);
            let weighted_avg_text = format!("Weighted Avg: {} km", weighted.weighted_avg_km_text);
            ws.write_string_with_format(
                r,
                0,
                &total_qty_text,
                &Format::new()
                    .set_font_name("Calibri")
                    .set_font_size(10.0)
                    .set_bold()
                    .set_font_color(Color::RGB(0x0F172A))
                    .set_background_color(total_fill)
                    .set_align(FormatAlign::VerticalCenter)
                    .set_text_wrap()
                    .set_border(FormatBorder::Thin),
            )?;
            ws.write_string_with_format(
                r,
                5,
                &weighted_avg_text,
                &Format::new()
                    .set_font_name("Calibri")
                    .set_font_size(10.0)
                    .set_bold()
                    .set_font_color(Color::RGB(0x0F172A))
                    .set_background_color(total_fill)
                    .set_align(FormatAlign::VerticalCenter)
                    .set_text_wrap()
                    .set_border(FormatBorder::Thin),
            )?;
            if !project_weights.is_empty() && !weighted.entries.is_empty() {
                let weighted_avg_formula = format!(
                    "=IF(SUM(F{}:F{})=0,0,SUM(G{}:G{})/SUM(F{}:F{}))",
                    entry_start + 1,
                    entry_end + 1,
                    entry_start + 1,
                    entry_end + 1,
                    entry_start + 1,
                    entry_end + 1
                );
                ws.write_formula_with_format(
                    r,
                    5,
                    weighted_avg_formula.as_str(),
                    &Format::new()
                        .set_font_name("Calibri")
                        .set_font_size(10.0)
                        .set_bold()
                        .set_background_color(total_fill)
                        .set_num_format(LEAD_KM_FMT)
                        .set_align(FormatAlign::Right)
                        .set_border(FormatBorder::Thin),
                )?;
                if let Some(summary_row) = summary_rows.get(&material.key) {
                    let distance_ref = format!("{}!$F${}", excel_sheet_ref(sheet_name), r + 1);
                    ws.write_formula_with_format(
                        *summary_row,
                        4,
                        format!("={distance_ref}").as_str(),
                        &Format::new()
                            .set_font_name("Calibri")
                            .set_font_size(10.0)
                            .set_num_format(LEAD_KM_FMT)
                            .set_align(FormatAlign::Right)
                            .set_border(FormatBorder::Thin),
                    )?;
                    let curve = material.weighted_rate_curve.as_ref().ok_or_else(|| {
                        XlsxError::CustomError(format!(
                            "weighted Lead '{}' has no synced rate curve for Project Excel",
                            material.name
                        ))
                    })?;
                    let formula = weighted_rate_formula(&distance_ref, curve).ok_or_else(|| {
                        XlsxError::CustomError(format!(
                            "weighted Lead '{}' has an incomplete synced rate curve",
                            material.name
                        ))
                    })?;
                    ws.write_formula_with_format(
                        *summary_row,
                        6,
                        formula.as_str(),
                        &Format::new()
                            .set_font_name("Calibri")
                            .set_font_size(10.0)
                            .set_bold()
                            .set_num_format(LEAD_MONEY_FMT)
                            .set_align(FormatAlign::Right)
                            .set_border(FormatBorder::Thin),
                    )?;
                }
            }
            // Wrapped across cols A:E (6+42+38+12+12) and F:H (10+16+10).
            ws.set_row_height(
                r,
                wrap_text_height(&total_qty_text, 6.0 + 42.0 + 38.0 + 12.0 + 12.0, 10.0, 18.0).max(
                    wrap_text_height(&weighted_avg_text, 10.0 + 16.0 + 10.0, 10.0, 18.0),
                ),
            )?;
            r += 1;
        }

        r = lead_span_header(
            ws,
            r,
            &[
                (0, 3, "Calculation Step / Slab"),
                (4, 5, "Distance / Mode"),
                (6, 7, "Amount (Rs)"),
            ],
        )?;
        for (si, step) in material.steps.iter().enumerate() {
            let label = if step.label.trim().is_empty() {
                "\u{2014}"
            } else {
                step.label.trim()
            };
            let expr = if step.expression.trim().is_empty() {
                "\u{2014}"
            } else {
                step.expression.trim()
            };
            let (expr_fmt, label_fmt, amt_fmt) = lead_detail_fmts(si % 2 == 1);
            ws.merge_range(r, 0, r, 3, label, &label_fmt)?;
            ws.merge_range(r, 4, r, 5, expr, &expr_fmt)?;
            ws.merge_range(r, 6, r, LEAD_SPAN, "", &amt_fmt)?;
            match lead_step_amount(step) {
                Some(n) if n.is_finite() => {
                    ws.write_number_with_format(
                        r,
                        6,
                        n,
                        &amt_fmt.clone().set_num_format(LEAD_MONEY_FMT),
                    )?;
                }
                _ => {
                    ws.write_string_with_format(r, 6, "\u{2014}", &amt_fmt)?;
                }
            }
            // Label wraps across cols A:D (6+42+38+12), expr across E:F (12+10).
            ws.set_row_height(
                r,
                wrap_text_height(label, 6.0 + 42.0 + 38.0 + 12.0, 10.0, 18.0)
                    .max(wrap_text_height(expr, 12.0 + 10.0, 10.0, 18.0)),
            )?;
            r += 1;
        }

        if let Some(calc) = &material.calculation {
            r = lead_amount_row(ws, r, "Material lead rate", calc.lead_rate, false, None)?;
            if calc.loading_rate.unwrap_or(0.0) != 0.0 {
                r = lead_amount_row(
                    ws,
                    r,
                    &format!("Loading ({})", material.rate_unit),
                    calc.loading_rate,
                    false,
                    None,
                )?;
            }
            if calc.unloading_rate.unwrap_or(0.0) != 0.0 {
                r = lead_amount_row(
                    ws,
                    r,
                    &format!("Unloading ({})", material.rate_unit),
                    calc.unloading_rate,
                    false,
                    None,
                )?;
            }
            if calc.lift_rate.unwrap_or(0.0) != 0.0 {
                r = lead_amount_row(
                    ws,
                    r,
                    &format!(
                        "Lift ({} m; chargeable {} m)",
                        lead_display(&material.lift_m, "0"),
                        lead_display(&material.charged_lift_m, "0")
                    ),
                    calc.lift_rate,
                    false,
                    None,
                )?;
            }
            let handling = calc.loading_rate.unwrap_or(0.0)
                + calc.unloading_rate.unwrap_or(0.0)
                + calc.lift_rate.unwrap_or(0.0);
            if handling != 0.0 {
                let adopted = json_opt_f64(&material.rate)
                    .or_else(|| calc.lead_rate.map(|lead| lead + handling));
                r = lead_amount_row(ws, r, "With handling/lift", adopted, true, None)?;
            }
        }
        r = lead_amount_row(
            ws,
            r,
            &format!("Adopted Rate per {}", material.rate_unit),
            json_opt_f64(&material.rate),
            true,
            Some(total_fill),
        )?;
        r += 1;
    }

    if !payload.signature.is_empty() {
        r = lead_section_row(ws, r, "Signature")?;
        for entry in &payload.signature {
            ws.merge_range(
                r,
                0,
                r,
                3,
                &entry.designation,
                &Format::new()
                    .set_font_name("Calibri")
                    .set_font_size(10.0)
                    .set_bold()
                    .set_font_color(Color::RGB(0x0F172A))
                    .set_border(FormatBorder::Thin),
            )?;
            ws.merge_range(
                r,
                4,
                r,
                LEAD_SPAN,
                &entry.office,
                &Format::new()
                    .set_font_name("Calibri")
                    .set_font_size(10.0)
                    .set_font_color(Color::RGB(0x475569))
                    .set_border(FormatBorder::Thin),
            )?;
            ws.set_row_height(r, 30.0)?;
            r += 1;
        }
    }

    ws.set_repeat_rows(summary_header, summary_header)?;
    ws.set_header("&R&8&\"Calibri\"Generated by E-Estimate");
    ws.set_footer(format!(
        "&L&8&\"Calibri\"{}&R&8&\"Calibri\"Page &P of &N",
        project
    ));
    ws.set_print_area(0, 0, r.saturating_sub(1), LEAD_SPAN)?;
    Ok(rate_refs)
}

// ============================================================================
// Dispatcher: routes the excel_compile payload to the matching builder.
// ============================================================================
