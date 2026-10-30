use super::super::models::*;
use rust_xlsxwriter::{Format, FormatAlign, Formula, Workbook, XlsxError};
use std::collections::HashMap;

pub(super) fn write_individual_items(
    workbook: &mut Workbook,
    req: &ExcelCompileRequest,
) -> Result<HashMap<String, String>, XlsxError> {
    let mut refs = HashMap::new();
    if req.individual_items.is_empty() && !req.individual_only {
        return Ok(refs);
    }
    let ws = workbook.add_worksheet();
    ws.set_name("Individual Items")?;
    ws.set_column_width(0, 7)?
        .set_column_width(1, 12)?
        .set_column_width(2, 15)?
        .set_column_width(3, 45)?
        .set_column_width(4, 12)?
        .set_column_width(5, 18)?
        .set_column_width(6, 45)?
        .set_column_width(7, 50)?;
    ws.set_paper_size(9)
        .set_landscape()
        .set_print_fit_to_pages(1, 0);
    ws.set_freeze_panes(4, 0)?;
    ws.set_repeat_rows(3, 3)?;
    ws.set_footer("&RPage &P of &N");
    let text = Format::new()
        .set_font_name("Trebuchet MS")
        .set_font_size(10)
        .set_text_wrap()
        .set_align(FormatAlign::VerticalCenter);
    let heading = text
        .clone()
        .set_bold()
        .set_font_color("#0b3d5c")
        .set_font_size(16);
    let header = text
        .clone()
        .set_bold()
        .set_font_color("#ffffff")
        .set_background_color("#0b3d5c");
    let rate = text
        .clone()
        .set_num_format("#,##0.00####")
        .set_background_color("#e6f3ff")
        .set_font_color("#075e96");
    ws.merge_range(0, 0, 0, 7, "INDIVIDUAL ITEMS — RESOURCE RATES", &heading)?;
    ws.merge_range(
        1,
        0,
        1,
        7,
        &format!(
            "{} · {} · {}",
            req.project_name.as_deref().unwrap_or("Estimate"),
            req.sor_year.as_deref().unwrap_or(""),
            req.sor_zone.as_deref().unwrap_or("")
        ),
        &text,
    )?;
    ws.merge_range(2,0,2,7,"Edit the blue Rate cells. Linked DATA, appendices and project abstracts recalculate in Excel. Derived rates follow their source rate.",&text)?;
    ws.set_row_height(2, 30)?;
    for (c, label) in [
        "No",
        "Source",
        "Category",
        "Resource",
        "Unit",
        "Rate (Rs.)",
        "Rate source",
        "Used in DATA",
    ]
    .iter()
    .enumerate()
    {
        ws.write_string_with_format(3, c as u16, *label, &header)?;
    }
    for (index, item) in req.individual_items.iter().enumerate() {
        refs.insert(
            item.key.clone(),
            format!("'Individual Items'!$F${}", index + 5),
        );
    }
    for (index, item) in req.individual_items.iter().enumerate() {
        let row = index as u32 + 4;
        ws.set_row_height(row, 45)?;
        ws.write_number_with_format(row, 0, (index + 1) as f64, &text)?;
        let source = text
            .clone()
            .set_bold()
            .set_font_color(if item.owner == "MORTH" {
                "#a95508"
            } else {
                "#827014"
            });
        ws.write_string_with_format(
            row,
            1,
            if item.owner == "MORTH" {
                "MoRTH"
            } else {
                "SSR"
            },
            &source,
        )?;
        ws.write_string_with_format(row, 2, &item.kind, &text)?;
        ws.write_string_with_format(row, 3, &item.description, &text)?;
        ws.write_string_with_format(row, 4, &item.unit, &text)?;
        if let Some(parent) = &item.derived_from {
            let reference = refs.get(parent).ok_or_else(|| {
                XlsxError::CustomError("Individual item has no source rate".into())
            })?;
            ws.write_formula_with_format(
                row,
                5,
                Formula::new(format!("={reference}*{}", item.factor.unwrap_or(1.0)))
                    .set_result(item.rate.unwrap_or(0.0).to_string()),
                &rate,
            )?;
        } else if let Some(value) = item.rate {
            ws.write_number_with_format(row, 5, value, &rate)?;
        } else {
            ws.write_blank(row, 5, &rate)?;
        }
        ws.write_string_with_format(
            row,
            6,
            format!(
                "{}{}",
                if item.local {
                    "Local DATA rate · "
                } else {
                    ""
                },
                item.source
            ),
            &text,
        )?;
        ws.write_string_with_format(row, 7, item.usages.join("\n"), &text)?;
    }
    ws.autofilter(3, 0, req.individual_items.len() as u32 + 3, 7)?;
    Ok(refs)
}

pub(super) fn rate_formula(
    line: &CostTableLine,
    refs: &HashMap<String, String>,
) -> Result<Option<String>, XlsxError> {
    line.individual_key
        .as_ref()
        .map(|key| {
            refs.get(key)
                .map(|reference| format!("={reference}"))
                .ok_or_else(|| {
                    XlsxError::CustomError("DATA resource has no Individual Items rate cell".into())
                })
        })
        .transpose()
}
