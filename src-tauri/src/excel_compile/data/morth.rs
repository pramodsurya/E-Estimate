//! Flat MoRTH DATA and a single shared appendix sheet. Native cached results
//! accompany Excel formulas, so a workbook is readable before Excel recalculates.
use super::super::models::*;
use rust_xlsxwriter::{
    Format, FormatAlign, FormatBorder, Formula, Url, Workbook, Worksheet, XlsxError,
};
use std::collections::HashMap;

fn value(v: &Option<serde_json::Value>) -> f64 {
    v.as_ref()
        .and_then(|v| {
            v.as_f64()
                .or_else(|| v.as_str()?.replace(',', "").parse().ok())
        })
        .unwrap_or(0.0)
}
fn cell(row: u32) -> String {
    format!("G{}", row + 1)
}
fn sum(cells: &[String]) -> String {
    if cells.is_empty() {
        "0".into()
    } else {
        format!("SUM({})", cells.join(","))
    }
}
fn basis(
    name: &str,
    sections: &[String],
    direct: &str,
    eligible: &str,
    allowance: &str,
    overhead: &str,
) -> Result<String, XlsxError> {
    let result=match name {
        ""|"direct_cost"|"labour_plus_machinery_plus_material_cost"|"adopted_civil_work_plus_filter_material_cost"|"foundation_excavation_cost"=>direct.into(),
        "direct_cost_including_allowances"|"labour_plus_machinery_plus_materials_plus_percentage_allowances"=>format!("{direct}+{allowance}"),
        "labour_plus_machinery_cost"=>format!("{}+{}",sections[1],sections[2]),
        "labour_cost"=>sections[2].clone(),"machinery_cost"=>sections[1].clone(),"materials_cost"|"material_cost"=>sections[0].clone(),
        "filter_material_cost_only"|"pile_shoes_plus_machinery_plus_labour_cost"=>eligible.into(),
        "adopted_concrete_cost"=>format!("{direct}-({eligible})"),
        "labour_plus_machinery_plus_materials_plus_percentage_allowances_excluding_marked_dependencies"=>format!("{eligible}+{allowance}"),
        "direct_cost_plus_overheads"=>format!("{direct}+{overhead}"),
        "direct_cost_including_allowances_plus_overheads"=>format!("{direct}+{allowance}+{overhead}"),
        "eligible_direct_cost_plus_overheads"=>format!("{eligible}+{allowance}+{overhead}"),
        "labour_plus_machinery_plus_overheads"=>format!("{}+{}+{overhead}",sections[1],sections[2]),
        "pile_shoes_plus_machinery_plus_labour_plus_overhead_cost"=>format!("{eligible}+{overhead}"),
        other=>return Err(XlsxError::CustomError(format!("Unsupported MoRTH Excel calculation basis: {other}"))),
    };
    Ok(result)
}
fn percent_basis(name: &str) -> String {
    name.replace('_', " ")
}
fn cached(
    ws: &mut Worksheet,
    row: u32,
    col: u16,
    formula: String,
    result: f64,
    format: &Format,
) -> Result<(), XlsxError> {
    ws.write_formula_with_format(
        row,
        col,
        Formula::new(formula).set_result(result.to_string()),
        format,
    )?;
    Ok(())
}
pub(super) fn write_morth_sheets(
    workbook: &mut Workbook,
    req: &ExcelCompileRequest,
    lead_refs: &HashMap<String, String>,
    require_lead_refs: bool,
) -> Result<HashMap<String, String>, XlsxError> {
    let mut refs = HashMap::new();
    for (name, recipes, appendix) in [
        ("MoRTH Items", &req.morth, false),
        ("MoRTH Appendix", &req.morth_appendices, true),
    ] {
        if recipes.is_empty() {
            continue;
        }
        let mut names = Vec::<(String, String)>::new();
        {
            let ws = workbook.add_worksheet();
            ws.set_name(name)?;
            ws.set_column_width(0, 6.7)?;
            ws.set_column_width(1, 10.0)?;
            ws.set_column_width(2, 42.7)?;
            ws.set_column_width(3, 12.0)?;
            ws.set_column_width(4, 14.0)?;
            ws.set_column_width(5, 15.0)?;
            ws.set_column_width(6, 18.0)?;
            ws.set_paper_size(9)
                .set_portrait()
                .set_print_fit_to_pages(1, 0)
                .set_print_center_horizontally(true);
            ws.set_margins(0.55, 0.55, 0.6, 0.6, 0.2, 0.2);
            ws.set_header(format!(
                "&C{} — {}",
                req.project_name
                    .as_deref()
                    .unwrap_or("STANDARD DATA")
                    .replace('&', "&&"),
                req.sor_year.as_deref().unwrap_or("")
            ));
            ws.set_footer("&RPage &P of &N");
            let text = Format::new()
                .set_font_name("Trebuchet MS")
                .set_font_size(10.0)
                .set_font_color("#18324a")
                .set_border_color("#b8cad7")
                .set_text_wrap()
                .set_align(FormatAlign::VerticalCenter)
                .set_border(FormatBorder::Thin);
            let number = text
                .clone()
                .set_num_format("#,##0.00")
                .set_align(FormatAlign::Right);
            let quantity = number.clone().set_num_format("0.00##");
            let serial = number.clone().set_num_format("0");
            let pct = number.clone().set_num_format("0.00#\"%\"");
            let bold = text.clone().set_bold();
            let bold_number = number.clone().set_bold();
            let heading = Format::new()
                .set_font_name("Trebuchet MS")
                .set_font_size(11.0)
                .set_font_color("#0b3d5c")
                .set_bold()
                .set_text_wrap();
            let band = bold
                .clone()
                .set_background_color("#0b3d5c")
                .set_font_color("#ffffff");
            let band_number = quantity
                .clone()
                .set_bold()
                .set_background_color("#0b3d5c")
                .set_font_color("#ffffff");
            let band_unit = band.clone().set_align(FormatAlign::Center);
            let abstract_header = band.clone();
            let abstract_total = bold.clone().set_background_color("#e8f2f8");
            let abstract_total_number = bold_number.clone().set_background_color("#e8f2f8");
            let final_total = abstract_total.clone().set_background_color("#e8f5f0");
            let final_number = abstract_total_number
                .clone()
                .set_background_color("#e8f5f0");
            let link = text
                .clone()
                .set_font_color("#315774")
                .set_underline(rust_xlsxwriter::FormatUnderline::Single);
            let mut row = 0;
            let mut breaks = Vec::new();
            ws.merge_range(
                row,
                0,
                row,
                6,
                if appendix {
                    "MoRTH APPENDIX"
                } else {
                    "MoRTH — STANDARD DATA"
                },
                &heading,
            )?;
            row += 2;
            for (index, recipe) in recipes.iter().enumerate() {
                if recipe.morth_abstract.is_empty() {
                    return Err(XlsxError::CustomError(
                        "Refresh MoRTH DATA before exporting its abstract.".into(),
                    ));
                }
                if index > 0 {
                    breaks.push(row)
                }
                let title = format!(
                    "{} {}",
                    if appendix { "Appendix" } else { "MoRTH" },
                    recipe.code
                );
                ws.merge_range(row, 0, row, 6, &title, &heading)?;
                row += 1;
                ws.merge_range(
                    row,
                    0,
                    row,
                    6,
                    recipe.description.as_deref().unwrap_or(""),
                    &heading,
                )?;
                ws.set_row_height(
                    row,
                    if recipe.description.as_deref().unwrap_or("").len() > 90 {
                        32.0
                    } else {
                        18.0
                    },
                )?;
                row += 1;
                if let Some(scope) = recipe.scope_label.as_deref().filter(|s| !s.is_empty()) {
                    ws.merge_range(row, 0, row, 6, scope, &text)?;
                    row += 1
                }
                let totals = recipe.totals.clone().unwrap_or_default();
                let output = totals.output_quantity.unwrap_or(1.0);
                ws.merge_range(
                    row,
                    0,
                    row,
                    3,
                    if appendix {
                        "APPENDIX:          RATE ANALYSIS"
                    } else {
                        "DATA:                 RATE ANALYSIS"
                    },
                    &band,
                )?;
                ws.write_number_with_format(row, 4, output, &band_number)?;
                ws.merge_range(
                    row,
                    5,
                    row,
                    6,
                    recipe.unit.as_deref().unwrap_or("unit"),
                    &band_unit,
                )?;
                let divisor = format!("$E${}", row + 1);
                ws.set_row_height(row, 24.0)?;
                row += 2;
                let mut section_refs = vec!["0".into(); 3];
                let mut eligible = Vec::new();
                for (section, (label, lines)) in [
                    ("A. MATERIALS", &recipe.materials),
                    ("B. MACHINERY", &recipe.machinery),
                    ("C. LABOUR", &recipe.labour),
                ]
                .iter()
                .enumerate()
                {
                    if lines.is_empty() {
                        continue;
                    }
                    let (accent, tint) = match section {
                        0 => ("#087e8b", "#e8f5f0"),
                        1 => ("#0b3d5c", "#e8f2f8"),
                        _ => ("#7451a6", "#f1edfa"),
                    };
                    let section_heading = heading.clone().set_font_color(accent);
                    let section_header = band
                        .clone()
                        .set_background_color(accent)
                        .set_align(FormatAlign::Center);
                    let section_total = bold.clone().set_background_color(tint);
                    let section_total_number = bold_number.clone().set_background_color(tint);
                    ws.merge_range(row, 0, row, 6, *label, &section_heading)?;
                    row += 1;
                    ws.write_string_with_format(row, 0, "Sl No", &section_header)?;
                    ws.merge_range(
                        row,
                        1,
                        row,
                        2,
                        if section == 0 {
                            "Particulars"
                        } else {
                            "Description"
                        },
                        &section_header,
                    )?;
                    for (col, label) in [
                        (3, "Quantity"),
                        (4, "Unit"),
                        (5, "Rate (Rs.)"),
                        (6, "Amount (Rs.)"),
                    ] {
                        ws.write_string_with_format(row, col, label, &section_header)?;
                    }
                    ws.set_row_height(row, 30.0)?;
                    row += 1;
                    let first = row;
                    for (i, line) in lines.iter().enumerate() {
                        let text = if i % 2 == 1 {
                            text.clone().set_background_color("#f8fafc")
                        } else {
                            text.clone()
                        };
                        let number = if i % 2 == 1 {
                            number.clone().set_background_color("#f8fafc")
                        } else {
                            number.clone()
                        };
                        let quantity = if i % 2 == 1 {
                            quantity.clone().set_background_color("#f8fafc")
                        } else {
                            quantity.clone()
                        };
                        let serial = serial
                            .clone()
                            .set_align(FormatAlign::Center)
                            .set_background_color(if i % 2 == 1 { "#f8fafc" } else { "#ffffff" });
                        ws.write_number_with_format(row, 0, (i + 1) as f64, &serial)?;
                        let description = line.description.as_deref().unwrap_or("");
                        ws.merge_range(row, 1, row, 2, description, &text)?;
                        ws.set_row_height(row, if description.len() > 95 { 44.0 } else { 30.0 })?;
                        ws.write_number_with_format(row, 3, value(&line.quantity), &quantity)?;
                        ws.write_string_with_format(
                            row,
                            4,
                            line.unit.as_deref().unwrap_or(""),
                            &text,
                        )?;
                        if let Some(key) = &line.appendix_key {
                            if !key.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
                                return Err(XlsxError::CustomError(
                                    "Invalid appendix reference".into(),
                                ));
                            }
                            let suffix = if line.appendix_direct {
                                "DIRECT"
                            } else {
                                "RATE"
                            };
                            cached(
                                ws,
                                row,
                                5,
                                format!(
                                    "=MORTH_{key}_{suffix}*{}",
                                    line.appendix_multiplier.unwrap_or(1.0)
                                ),
                                value(&line.rate),
                                &number,
                            )?;
                        } else {
                            ws.write_number_with_format(row, 5, value(&line.rate), &number)?;
                        }
                        cached(
                            ws,
                            row,
                            6,
                            format!("=ROUND(D{}*F{},2)", row + 1, row + 1),
                            value(&line.amount),
                            &number,
                        )?;
                        if !line.markup_excluded {
                            eligible.push(cell(row))
                        }
                        row += 1;
                        if let Some(key) = &line.appendix_key {
                            ws.merge_range(row, 1, row, 6, "", &text)?;
                            ws.write_url_with_format(
                                row,
                                1,
                                Url::new(format!("internal:MORTH_{key}_TITLE")).set_text(format!(
                                    "See {}{}",
                                    line.appendix_name.as_deref().unwrap_or("appendix"),
                                    if line.appendix_direct {
                                        " · direct rate"
                                    } else {
                                        ""
                                    }
                                )),
                                &link,
                            )?;
                            row += 1;
                        }
                    }
                    ws.merge_range(
                        row,
                        0,
                        row,
                        5,
                        [
                            "Total cost of Materials",
                            "Total hire charges of Machinery",
                            "Total cost of Labour",
                        ][section],
                        &section_total,
                    )?;
                    let cached_total = match section {
                        0 => totals.material_total,
                        1 => totals.machinery_total,
                        _ => totals.labour_total,
                    }
                    .unwrap_or(0.0);
                    cached(
                        ws,
                        row,
                        6,
                        format!("=SUM(G{}:G{})", first + 1, row),
                        cached_total,
                        &section_total_number,
                    )?;
                    section_refs[section] = cell(row);
                    row += 2;
                }
                ws.merge_range(row, 0, row, 6, "ABSTRACT", &heading)?;
                row += 1;
                ws.merge_range(
                    row,
                    0,
                    row,
                    3,
                    "Description / calculation basis",
                    &abstract_header,
                )?;
                ws.write_string_with_format(row, 4, "Basis (Rs.)", &abstract_header)?;
                ws.write_string_with_format(row, 5, "Percent", &abstract_header)?;
                ws.write_string_with_format(row, 6, "Amount (Rs.)", &abstract_header)?;
                row += 1;
                let mut direct = "0".to_string();
                let mut overhead = "0".to_string();
                let mut profit = "0".to_string();
                let mut total = "0".to_string();
                let mut allowances = Vec::new();
                let eligible = sum(&eligible);
                let mut rate_row = row;
                for ar in &recipe.morth_abstract {
                    let is_total = ["direct", "total", "rate"].contains(&ar.formula_kind.as_str());
                    let total_style = if ar.formula_kind == "rate" {
                        &final_total
                    } else {
                        &abstract_total
                    };
                    let total_number_style = if ar.formula_kind == "rate" {
                        &final_number
                    } else if is_total {
                        &abstract_total_number
                    } else {
                        &number
                    };
                    let allowance = sum(&allowances);
                    let is_percent = ar.percent.is_some();
                    let description = if is_percent {
                        format!(
                            "{}\nOn {}",
                            ar.label,
                            ar.basis_label.clone().unwrap_or_else(|| percent_basis(
                                ar.base.as_deref().unwrap_or("direct_cost")
                            ))
                        )
                    } else {
                        ar.label.clone()
                    };
                    ws.merge_range(
                        row,
                        0,
                        row,
                        if is_percent { 3 } else { 5 },
                        &description,
                        if is_total { total_style } else { &text },
                    )?;
                    if is_percent {
                        ws.set_row_height(row, 36.0)?;
                        ws.write_number_with_format(row, 5, ar.percent.unwrap_or(0.0), &pct)?;
                    }
                    let expression = match ar.formula_kind.as_str() {
                        "materials" => section_refs[0].clone(),
                        "machinery" => section_refs[1].clone(),
                        "labour" => section_refs[2].clone(),
                        "direct" => sum(&section_refs),
                        "allowance" | "overhead" | "profit" => {
                            let b = if ar.formula_kind == "profit" && ar.percent == Some(0.0) {
                                "0".into()
                            } else {
                                basis(
                                    ar.base.as_deref().unwrap_or(""),
                                    &section_refs,
                                    &direct,
                                    &eligible,
                                    if ar.formula_kind == "allowance" {
                                        "0"
                                    } else {
                                        &allowance
                                    },
                                    &overhead,
                                )?
                            };
                            cached(
                                ws,
                                row,
                                4,
                                format!("={b}"),
                                ar.basis_amount.unwrap_or(0.0),
                                &number,
                            )?;
                            format!("ROUND(E{}*F{}/100,2)", row + 1, row + 1)
                        }
                        "total" => format!("ROUND({direct}+{allowance}+{overhead}+{profit},2)"),
                        "rate" => format!("ROUND({total}/{divisor},2)"),
                        other => {
                            return Err(XlsxError::CustomError(format!(
                                "Unknown MoRTH abstract row: {other}"
                            )))
                        }
                    };
                    cached(
                        ws,
                        row,
                        6,
                        format!("={expression}"),
                        ar.amount,
                        total_number_style,
                    )?;
                    match ar.formula_kind.as_str() {
                        "direct" => direct = cell(row),
                        "allowance" => allowances.push(cell(row)),
                        "overhead" => overhead = cell(row),
                        "profit" => profit = cell(row),
                        "total" => total = cell(row),
                        "rate" => rate_row = row,
                        _ => {}
                    }
                    row += 1;
                }
                if appendix {
                    let key = recipe.appendix_key.as_deref().ok_or_else(|| {
                        XlsxError::CustomError("Missing appendix identity".into())
                    })?;
                    ws.merge_range(
                        row,
                        0,
                        row,
                        5,
                        "Direct rate per unit (before allowances and markup)",
                        &text,
                    )?;
                    cached(
                        ws,
                        row,
                        6,
                        format!("={direct}/{divisor}"),
                        totals.base_cost.unwrap_or(0.0) / output,
                        &number,
                    )?;
                    names.push((
                        format!("MORTH_{key}_DIRECT"),
                        format!("='{name}'!$G${}", row + 1),
                    ));
                    names.push((
                        format!("MORTH_{key}_RATE"),
                        format!("='{name}'!$G${}", rate_row + 1),
                    ));
                    names.push((
                        format!("MORTH_{key}_TITLE"),
                        format!("='{name}'!$A${}", breaks.last().copied().unwrap_or(2) + 1),
                    ));
                    row += 1;
                }
                if let Some(leads) = &recipe.leads {
                    if !leads.is_empty() {
                        row += 1;
                        ws.merge_range(row, 0, row, 6, "LEAD ADDITIONS", &heading)?;
                        row += 1;
                        let mut amounts = Vec::new();
                        for lead in leads {
                            ws.merge_range(
                                row,
                                0,
                                row,
                                2,
                                lead.material.as_deref().unwrap_or("Lead"),
                                &text,
                            )?;
                            ws.write_number_with_format(row, 3, value(&lead.quantity), &quantity)?;
                            ws.write_string_with_format(
                                row,
                                4,
                                lead.unit.as_deref().unwrap_or(""),
                                &text,
                            )?;
                            if let Some(reference) = lead_refs.get(&lead.lead_key) {
                                cached(
                                    ws,
                                    row,
                                    5,
                                    format!("={reference}"),
                                    value(&lead.rate),
                                    &number,
                                )?;
                            } else if require_lead_refs {
                                return Err(XlsxError::CustomError(format!(
                                    "Missing MoRTH Lead reference: {}",
                                    lead.lead_key
                                )));
                            } else {
                                ws.write_number_with_format(row, 5, value(&lead.rate), &number)?;
                            }
                            cached(
                                ws,
                                row,
                                6,
                                format!("=ROUND(D{}*F{},2)", row + 1, row + 1),
                                value(&lead.amount),
                                &number,
                            )?;
                            amounts.push(cell(row));
                            row += 1;
                        }
                        ws.merge_range(
                            row,
                            0,
                            row,
                            5,
                            "Adopted rate per unit including Lead",
                            &bold,
                        )?;
                        let lead_total = leads.iter().map(|l| value(&l.amount)).sum::<f64>();
                        cached(
                            ws,
                            row,
                            6,
                            format!("=ROUND(({total}+{})/{divisor},2)", sum(&amounts)),
                            (totals.total_cost.unwrap_or(0.0) + lead_total) / output,
                            &bold_number,
                        )?;
                        rate_row = row;
                        row += 1;
                    }
                }
                let key = if recipe.excel_key.is_empty() {
                    recipe.code.clone()
                } else {
                    recipe.excel_key.clone()
                };
                refs.insert(key, format!("'{name}'!$G${}", rate_row + 1));
            }
            if !breaks.is_empty() {
                ws.set_page_breaks(&breaks)?;
            }
            super::signature::apply_data_signature(
                ws,
                &mut row,
                req,
                appendix || req.morth_appendices.is_empty(),
                0,
                6,
            )?;
            ws.set_print_area(0, 0, row.saturating_sub(1), 6)?;
        }
        for (name, formula) in names {
            workbook.define_name(name, &formula)?;
        }
    }
    Ok(refs)
}
