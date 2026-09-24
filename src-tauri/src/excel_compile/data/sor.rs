use super::super::grid::wrap_text_height;
use super::super::models::ExcelCompileRequest;
use rust_xlsxwriter::{Color, Format, FormatAlign, FormatBorder, Workbook, XlsxError};
use std::collections::HashMap;

pub(super) fn write_sor_sheet(
    workbook: &mut Workbook,
    req: &ExcelCompileRequest,
    lead_rate_refs: &HashMap<String, String>,
    require_lead_refs: bool,
) -> Result<HashMap<String, String>, XlsxError> {
    let mut data_rate_refs = HashMap::new();
    let sor_header_color = Color::RGB(0xF2F4F7);

    // SHEET 2: SOR Items (If Any)
    // =========================================================================
    if !req.sor.is_empty() {
        let ws_sor = workbook.add_worksheet();
        ws_sor.set_name("SOR Items")?;

        // 1. Column widths: 8.0, 58.0, 14.0, 20.0
        ws_sor.set_column_width(0, 8.0)?;
        ws_sor.set_column_width(1, 58.0)?;
        ws_sor.set_column_width(2, 14.0)?;
        ws_sor.set_column_width(3, 20.0)?;

        // 2. Page Setup
        ws_sor.set_paper_size(9); // A4
        ws_sor.set_portrait();
        ws_sor.set_print_fit_to_pages(1, 0);
        ws_sor.set_margins(0.7874, 0.3937, 0.3937, 0.3937, 0.1968, 0.1968);
        ws_sor.set_print_center_horizontally(true);
        ws_sor.set_repeat_rows(1, 1)?; // Repeat table headers on every page

        let sor_header_text = format!(
            "&RSCHEDULE OF RATES (SOR) - {}",
            req.project_name
                .as_deref()
                .filter(|s| !s.is_empty())
                .unwrap_or("Estimate")
        );
        ws_sor.set_header(&sor_header_text);
        ws_sor.set_footer("&RPage &P of &N");

        let mut sor_r: u32 = 0;

        // Sheet Title
        ws_sor.set_row_height(sor_r, 20.0)?;
        let sor_title_fmt = Format::new()
            .set_font_name("Trebuchet MS")
            .set_font_size(10.5)
            .set_bold()
            .set_align(FormatAlign::Left)
            .set_align(FormatAlign::VerticalCenter);
        ws_sor.merge_range(sor_r, 0, sor_r, 3, "SCHEDULE OF RATES", &sor_title_fmt)?;
        sor_r += 1;

        // Table Header
        ws_sor.set_row_height(sor_r, 18.0)?;
        let sor_h_center = Format::new()
            .set_font_name("Trebuchet MS")
            .set_font_size(10.0)
            .set_bold()
            .set_background_color(sor_header_color)
            .set_border(FormatBorder::Thin)
            .set_align(FormatAlign::Center)
            .set_align(FormatAlign::VerticalCenter);

        let sor_h_left = Format::new()
            .set_font_name("Trebuchet MS")
            .set_font_size(10.0)
            .set_bold()
            .set_background_color(sor_header_color)
            .set_border(FormatBorder::Thin)
            .set_align(FormatAlign::Left)
            .set_align(FormatAlign::VerticalCenter);

        let sor_h_right = Format::new()
            .set_font_name("Trebuchet MS")
            .set_font_size(10.0)
            .set_bold()
            .set_background_color(sor_header_color)
            .set_border(FormatBorder::Thin)
            .set_align(FormatAlign::Right)
            .set_align(FormatAlign::VerticalCenter);

        ws_sor.write_string_with_format(sor_r, 0, "Sl No", &sor_h_center)?;
        ws_sor.write_string_with_format(sor_r, 1, "Description of Item", &sor_h_left)?;
        ws_sor.write_string_with_format(sor_r, 2, "Unit", &sor_h_center)?;
        ws_sor.write_string_with_format(sor_r, 3, "Published Rate in Rs.", &sor_h_right)?;
        sor_r += 1;

        let sor_cell_center = Format::new()
            .set_font_name("Trebuchet MS")
            .set_font_size(10.0)
            .set_border(FormatBorder::Thin)
            .set_align(FormatAlign::Center)
            .set_align(FormatAlign::VerticalCenter);

        let sor_cell_left = Format::new()
            .set_font_name("Trebuchet MS")
            .set_font_size(10.0)
            .set_border(FormatBorder::Thin)
            .set_align(FormatAlign::Left)
            .set_align(FormatAlign::VerticalCenter)
            .set_text_wrap();

        let sor_cell_right_num = Format::new()
            .set_font_name("Trebuchet MS")
            .set_font_size(10.0)
            .set_num_format("#,##0.00")
            .set_border(FormatBorder::Thin)
            .set_align(FormatAlign::Right)
            .set_align(FormatAlign::VerticalCenter);

        let sor_cell_right_str = Format::new()
            .set_font_name("Trebuchet MS")
            .set_font_size(10.0)
            .set_border(FormatBorder::Thin)
            .set_align(FormatAlign::Right)
            .set_align(FormatAlign::VerticalCenter);

        for item in &req.sor {
            // Description wraps in col B (58.0 chars).
            ws_sor.set_row_height(sor_r, wrap_text_height(&item.description, 58.0, 10.0, 16.5))?;
            ws_sor.write_number_with_format(sor_r, 0, item.sl as f64, &sor_cell_center)?;
            ws_sor.write_string_with_format(sor_r, 1, &item.description, &sor_cell_left)?;
            ws_sor.write_string_with_format(sor_r, 2, &item.unit, &sor_cell_center)?;

            let mut linked_parts: Vec<String> = Vec::new();
            for link in &item.lead_links {
                if let Some(rate_ref) = lead_rate_refs.get(&link.lead_key) {
                    let quantity = link.quantity.unwrap_or(0.0);
                    let output = item.output_qty.unwrap_or(1.0);
                    linked_parts.push(format!("{quantity}*{rate_ref}/{output}"));
                } else if require_lead_refs && !link.lead_key.trim().is_empty() {
                    return Err(XlsxError::CustomError(format!(
                        "SOR lead key '{}' has no exported Lead Statement rate cell",
                        link.lead_key
                    )));
                }
            }
            if !linked_parts.is_empty() && item.base_rate.is_some() {
                let formula = format!(
                    "={}+SUM({})",
                    item.base_rate.unwrap_or(0.0),
                    linked_parts.join(",")
                );
                ws_sor.write_formula_with_format(
                    sor_r,
                    3,
                    formula.as_str(),
                    &sor_cell_right_num,
                )?;
            } else if let Some(rate_num) = item.rate {
                ws_sor.write_number_with_format(sor_r, 3, rate_num, &sor_cell_right_num)?;
            } else {
                let r_text = item.rate_text.as_deref().unwrap_or("Rate not published");
                ws_sor.write_string_with_format(sor_r, 3, r_text, &sor_cell_right_str)?;
            }
            let data_key = if item.excel_key.trim().is_empty() {
                format!("sor:{}", item.sl)
            } else {
                item.excel_key.clone()
            };
            data_rate_refs.insert(data_key, format!("'SOR Items'!$D${}", sor_r + 1));
            sor_r += 1;
        }

        super::signature::apply_data_signature(ws_sor, &mut sor_r, req, true, 0, 3)?;
        if sor_r > 0 {
            ws_sor.set_print_area(0, 0, sor_r - 1, 3)?;
        }
    }

    Ok(data_rate_refs)
}
