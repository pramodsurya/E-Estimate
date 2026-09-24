use super::super::common::*;
use super::super::grid::wrap_text_height;
use super::super::models::*;
use rust_xlsxwriter::{Color, Format, FormatAlign, FormatBorder, Workbook, XlsxError};
use std::collections::HashMap;

pub(super) fn write_ssr_sheet(
    workbook: &mut Workbook,
    req: &ExcelCompileRequest,
    lead_rate_refs: &HashMap<String, String>,
    require_lead_refs: bool,
) -> Result<HashMap<String, String>, XlsxError> {
    let mut data_rate_refs = HashMap::new();

    // Constant palette
    let highlight_color = Color::RGB(0xCFEFEB);

    let border_box_bold_center = Format::new()
        .set_font_name("Trebuchet MS")
        .set_font_size(10.0)
        .set_bold()
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter)
        .set_border(FormatBorder::Thin);

    let border_box_bold_right_num = Format::new()
        .set_font_name("Trebuchet MS")
        .set_font_size(10.0)
        .set_bold()
        .set_num_format("0.00")
        .set_align(FormatAlign::Right)
        .set_align(FormatAlign::VerticalCenter)
        .set_border(FormatBorder::Thin);

    // =========================================================================
    // SHEET 1: SSR Items (Rate Analysis Recipes)
    // =========================================================================
    let ws_ssr = workbook.add_worksheet();
    ws_ssr.set_name("SSR Items")?;

    // 1. Column widths: 6.71, 5.57, 42.71, 10.57, 10.57, 10.57, 12.43
    ws_ssr.set_column_width(0, 6.71)?;
    ws_ssr.set_column_width(1, 5.57)?;
    ws_ssr.set_column_width(2, 42.71)?;
    ws_ssr.set_column_width(3, 10.57)?;
    ws_ssr.set_column_width(4, 10.57)?;
    ws_ssr.set_column_width(5, 10.57)?;
    ws_ssr.set_column_width(6, 12.43)?;

    // 2. Page Setup
    ws_ssr.set_paper_size(9); // A4
    ws_ssr.set_portrait();
    ws_ssr.set_print_fit_to_pages(1, 0);
    ws_ssr.set_margins(0.7874, 0.3937, 0.3937, 0.3937, 0.1968, 0.1968);
    ws_ssr.set_print_center_horizontally(true);

    let project_name = req.project_name.as_deref().unwrap_or("STANDARD DATA");
    let ssr_header_text = format!(
        "&R{} - {}",
        if project_name.is_empty() {
            "STANDARD DATA"
        } else {
            project_name
        },
        req.sor_year.as_deref().unwrap_or("2026-27")
    );
    ws_ssr.set_header(&ssr_header_text);
    ws_ssr.set_footer("&RPage &P of &N");

    let mut r: u32 = 0;

    for item_data in &req.recipes {
        let data_key = if item_data.excel_key.trim().is_empty() {
            item_data.code.clone()
        } else {
            item_data.excel_key.clone()
        };
        let mut adopted_rate_row: Option<u32> = None;
        let default_totals = Totals::default();
        let totals = item_data.totals.as_ref().unwrap_or(&default_totals);
        let item_desc = item_data.description.as_deref().unwrap_or("");
        let item_unit = item_data.unit.as_deref().unwrap_or("unit");

        // Section heading if present
        if let Some(heading) = &item_data.section_heading {
            if !heading.trim().is_empty() {
                ws_ssr.set_row_height(r, 15.0)?;
                let head_fmt = Format::new()
                    .set_font_name("Trebuchet MS")
                    .set_font_size(10.0)
                    .set_bold()
                    .set_align(FormatAlign::Left)
                    .set_align(FormatAlign::VerticalCenter);
                let text = format!("{}:", heading.trim().to_uppercase());
                ws_ssr.merge_range(r, 1, r, 6, &text, &head_fmt)?;
                r += 1;
            }
        }

        // Item code
        ws_ssr.set_row_height(r, 15.0)?;
        let code_fmt = Format::new()
            .set_font_name("Trebuchet MS")
            .set_font_size(10.0)
            .set_bold()
            .set_align(FormatAlign::Left)
            .set_align(FormatAlign::VerticalCenter);
        let code_text = if let Some(scope) = &item_data.scope_label {
            if !scope.trim().is_empty() {
                format!("{}  [Scope: {}]", item_data.code, scope.trim())
            } else {
                item_data.code.clone()
            }
        } else {
            item_data.code.clone()
        };
        ws_ssr.write_string_with_format(r, 0, &code_text, &code_fmt)?;
        r += 1;

        // Document title if present
        if let Some(doc_title) = &item_data.document_title {
            if !doc_title.trim().is_empty() {
                ws_ssr.set_row_height(r, 15.0)?;
                let doc_fmt = Format::new()
                    .set_font_name("Trebuchet MS")
                    .set_font_size(10.0)
                    .set_bold()
                    .set_align(FormatAlign::Left)
                    .set_align(FormatAlign::VerticalCenter);
                ws_ssr.merge_range(r, 1, r, 6, doc_title, &doc_fmt)?;
                r += 1;
            }
        }

        // Full description (merged B:G = 5.57+42.71+10.57*3+12.43 chars).
        ws_ssr.set_row_height(
            r,
            wrap_text_height(item_desc, 5.57 + 42.71 + 10.57 * 3.0 + 12.43, 10.0, 16.5),
        )?;
        let desc_fmt = Format::new()
            .set_font_name("Trebuchet MS")
            .set_font_size(10.0)
            .set_align(FormatAlign::Left)
            .set_align(FormatAlign::VerticalCenter)
            .set_text_wrap();
        ws_ssr.merge_range(r, 1, r, 6, item_desc, &desc_fmt)?;
        r += 1;

        // Dual measurement / Multi-rate note (merged B:G, wrapped).
        if let Some(note) = &item_data.multi_rate_note {
            let note_str = format!(
                "{}: {} (Adopted rate Rs. {})",
                note.label,
                note.note,
                note.adopted_rate_text.as_deref().unwrap_or("0.00")
            );
            ws_ssr.set_row_height(
                r,
                wrap_text_height(&note_str, 5.57 + 42.71 + 10.57 * 3.0 + 12.43, 10.0, 15.0),
            )?;
            let note_fmt = Format::new()
                .set_font_name("Trebuchet MS")
                .set_font_size(10.0)
                .set_italic()
                .set_align(FormatAlign::Left)
                .set_align(FormatAlign::VerticalCenter);
            ws_ssr.merge_range(r, 1, r, 6, &note_str, &note_fmt)?;
            r += 1;
        }

        // Rate Analysis Header Bar
        ws_ssr.set_row_height(r, 15.0)?;
        let bar_left = Format::new()
            .set_font_name("Trebuchet MS")
            .set_font_size(10.0)
            .set_align(FormatAlign::Left)
            .set_align(FormatAlign::VerticalCenter);
        let bar_right_bold = Format::new()
            .set_font_name("Trebuchet MS")
            .set_font_size(10.0)
            .set_bold()
            .set_align(FormatAlign::Right)
            .set_align(FormatAlign::VerticalCenter);
        let bar_center = Format::new()
            .set_font_name("Trebuchet MS")
            .set_font_size(10.0)
            .set_align(FormatAlign::Center)
            .set_align(FormatAlign::VerticalCenter);
        let bar_qty_bold = Format::new()
            .set_font_name("Trebuchet MS")
            .set_font_size(10.0)
            .set_bold()
            .set_num_format("0.00")
            .set_align(FormatAlign::Center)
            .set_align(FormatAlign::VerticalCenter);

        ws_ssr.write_string_with_format(r, 0, "Data:", &bar_left)?;
        ws_ssr.write_string_with_format(r, 2, "RATE ANALYSIS", &bar_right_bold)?;
        ws_ssr.write_string_with_format(r, 4, "UNIT :", &bar_center)?;
        let output_qty_cell = format!("$F${}", r + 1);
        ws_ssr.write_number_with_format(
            r,
            5,
            totals.output_quantity.unwrap_or(1.0),
            &bar_qty_bold,
        )?;
        ws_ssr.write_string_with_format(r, 6, item_unit, &bar_left)?;
        r += 1;

        // Render cost tables (A. Materials, B. Machinery, C. Labour)
        let cost_sections = [
            (
                "A",
                "MATERIALS",
                "particulars",
                &item_data.materials,
                "Total cost of Materials",
                totals.material_total.unwrap_or(0.0),
            ),
            (
                "B",
                "MACHINERY",
                "Description",
                &item_data.machinery,
                "Total hire charges of Machinery",
                totals.machinery_total.unwrap_or(0.0),
            ),
            (
                "C",
                "LABOUR",
                "Description",
                &item_data.labour,
                "Total cost of Labour",
                totals.labour_total.unwrap_or(0.0),
            ),
        ];

        for (letter, title, desc_header, lines, subtotal_label, subtotal_val) in cost_sections {
            // Section heading
            ws_ssr.set_row_height(r, 15.0)?;
            let sec_fmt = Format::new()
                .set_font_name("Trebuchet MS")
                .set_font_size(10.0)
                .set_bold()
                .set_align(FormatAlign::Left)
                .set_align(FormatAlign::VerticalCenter);
            ws_ssr.write_string_with_format(r, 1, format!("{}. {}:", letter, title), &sec_fmt)?;
            r += 1;

            // 2-row table headers
            let rh1 = r;
            let rh2 = r + 1;
            ws_ssr.set_row_height(rh1, 15.0)?;
            ws_ssr.set_row_height(rh2, 15.0)?;

            ws_ssr.merge_range(rh1, 1, rh2, 1, "Sl No", &border_box_bold_center)?;
            ws_ssr.merge_range(rh1, 2, rh2, 2, desc_header, &border_box_bold_center)?;
            ws_ssr.merge_range(rh1, 3, rh2, 3, "Unit", &border_box_bold_center)?;
            ws_ssr.merge_range(rh1, 4, rh2, 4, "Quantity", &border_box_bold_center)?;

            ws_ssr.write_string_with_format(rh1, 5, "Rate", &border_box_bold_center)?;
            ws_ssr.write_string_with_format(rh2, 5, "in Rs.", &border_box_bold_center)?;

            ws_ssr.write_string_with_format(rh1, 6, "Amount", &border_box_bold_center)?;
            ws_ssr.write_string_with_format(rh2, 6, "in Rs.", &border_box_bold_center)?;

            r += 2;

            let empty_vec = vec![CostTableLine {
                sl: Some(serde_json::json!("1")),
                description: Some("NIL".into()),
                unit: Some("".into()),
                quantity: Some(serde_json::json!(0.0)),
                rate: Some(serde_json::json!(0.0)),
                amount: Some(serde_json::json!(0.0)),
            }];
            let effective_lines = if lines.is_empty() { &empty_vec } else { lines };

            for (idx, line) in effective_lines.iter().enumerate() {
                let is_last = idx == effective_lines.len() - 1;
                // Description sits in col C (42.71 chars), wrapped.
                ws_ssr.set_row_height(
                    r,
                    wrap_text_height(line.description.as_deref().unwrap_or(""), 42.71, 10.0, 15.0),
                )?;

                let mut sl_fmt = Format::new()
                    .set_font_name("Trebuchet MS")
                    .set_font_size(10.0)
                    .set_align(FormatAlign::Center)
                    .set_align(FormatAlign::VerticalCenter)
                    .set_border_left(FormatBorder::Thin)
                    .set_border_right(FormatBorder::Thin);
                if is_last {
                    sl_fmt = sl_fmt.set_border_bottom(FormatBorder::Thin);
                }

                let mut desc_fmt = Format::new()
                    .set_font_name("Trebuchet MS")
                    .set_font_size(10.0)
                    .set_align(FormatAlign::Left)
                    .set_align(FormatAlign::VerticalCenter)
                    .set_text_wrap();
                if is_last {
                    desc_fmt = desc_fmt.set_border_bottom(FormatBorder::Thin);
                }

                let mut unit_fmt = Format::new()
                    .set_font_name("Trebuchet MS")
                    .set_font_size(10.0)
                    .set_align(FormatAlign::Center)
                    .set_align(FormatAlign::VerticalCenter)
                    .set_border_left(FormatBorder::Thin)
                    .set_border_right(FormatBorder::Thin);
                if is_last {
                    unit_fmt = unit_fmt.set_border_bottom(FormatBorder::Thin);
                }

                let mut qty_fmt = Format::new()
                    .set_font_name("Trebuchet MS")
                    .set_font_size(10.0)
                    .set_num_format("0.00")
                    .set_align(FormatAlign::Center)
                    .set_align(FormatAlign::VerticalCenter)
                    .set_border_right(FormatBorder::Thin);
                if is_last {
                    qty_fmt = qty_fmt.set_border_bottom(FormatBorder::Thin);
                }

                let mut rate_fmt = Format::new()
                    .set_font_name("Trebuchet MS")
                    .set_font_size(10.0)
                    .set_num_format("0.00")
                    .set_align(FormatAlign::Center)
                    .set_align(FormatAlign::VerticalCenter)
                    .set_border_left(FormatBorder::Thin)
                    .set_border_right(FormatBorder::Thin);
                if is_last {
                    rate_fmt = rate_fmt.set_border_bottom(FormatBorder::Thin);
                }

                let mut amt_fmt = Format::new()
                    .set_font_name("Trebuchet MS")
                    .set_font_size(10.0)
                    .set_num_format("0.00")
                    .set_align(FormatAlign::Right)
                    .set_align(FormatAlign::VerticalCenter)
                    .set_border_left(FormatBorder::Thin)
                    .set_border_right(FormatBorder::Thin);
                if is_last {
                    amt_fmt = amt_fmt.set_border_bottom(FormatBorder::Thin);
                }

                let sl_str = val_to_string(&line.sl);
                ws_ssr.write_string_with_format(r, 1, &sl_str, &sl_fmt)?;

                let desc_str = line.description.as_deref().unwrap_or("");
                ws_ssr.write_string_with_format(r, 2, desc_str, &desc_fmt)?;

                let unit_str = line.unit.as_deref().unwrap_or("");
                ws_ssr.write_string_with_format(r, 3, unit_str, &unit_fmt)?;

                let qty_val = val_to_f64(&line.quantity);
                ws_ssr.write_number_with_format(r, 4, qty_val, &qty_fmt)?;

                let rate_val = val_to_f64(&line.rate);
                ws_ssr.write_number_with_format(r, 5, rate_val, &rate_fmt)?;

                let amt_val = val_to_f64(&line.amount);
                ws_ssr.write_number_with_format(r, 6, amt_val, &amt_fmt)?;

                r += 1;
            }

            // Subtotal Row
            ws_ssr.set_row_height(r, 15.0)?;
            let sub_label_fmt = Format::new()
                .set_font_name("Trebuchet MS")
                .set_font_size(10.0)
                .set_align(FormatAlign::Left)
                .set_align(FormatAlign::VerticalCenter)
                .set_border_top(FormatBorder::Thin)
                .set_border_bottom(FormatBorder::Thin);
            ws_ssr.merge_range(r, 1, r, 4, subtotal_label, &sub_label_fmt)?;

            let sub_rs_fmt = Format::new()
                .set_font_name("Trebuchet MS")
                .set_font_size(10.0)
                .set_align(FormatAlign::Center)
                .set_align(FormatAlign::VerticalCenter)
                .set_border_top(FormatBorder::Thin)
                .set_border_bottom(FormatBorder::Thin)
                .set_border_right(FormatBorder::Thin);
            ws_ssr.write_string_with_format(r, 5, "Rs:", &sub_rs_fmt)?;

            ws_ssr.write_number_with_format(r, 6, subtotal_val, &border_box_bold_right_num)?;
            r += 1;

            // Blank line
            ws_ssr.set_row_height(r, 15.0)?;
            r += 1;
        }

        // Labour summary rows directly below Labour table
        if let Some(summary_rows) = &item_data.labour_summary_rows {
            if !summary_rows.is_empty() {
                for lr in summary_rows {
                    ws_ssr.set_row_height(r, 15.0)?;
                    let is_final = lr.kind.as_deref() == Some("final");
                    let mut l_fmt = Format::new()
                        .set_font_name("Trebuchet MS")
                        .set_font_size(10.0)
                        .set_align(FormatAlign::Left)
                        .set_align(FormatAlign::VerticalCenter);
                    if is_final {
                        l_fmt = l_fmt.set_bold();
                    }
                    ws_ssr.merge_range(r, 1, r, 3, &lr.label, &l_fmt)?;

                    if let Some(pct) = &lr.percent {
                        let pct_fmt = Format::new()
                            .set_font_name("Trebuchet MS")
                            .set_font_size(10.0)
                            .set_align(FormatAlign::Center)
                            .set_align(FormatAlign::VerticalCenter);
                        ws_ssr.write_string_with_format(r, 3, pct, &pct_fmt)?;
                    }

                    let mut v_fmt = Format::new()
                        .set_font_name("Trebuchet MS")
                        .set_font_size(10.0)
                        .set_align(FormatAlign::Center)
                        .set_align(FormatAlign::VerticalCenter);
                    if is_final {
                        v_fmt = v_fmt.set_bold();
                    }
                    if let Ok(num_val) = parse_amount_val(&lr.amount) {
                        v_fmt = v_fmt.set_num_format("0.00");
                        ws_ssr.write_number_with_format(r, 4, num_val, &v_fmt)?;
                    } else {
                        let s_val = val_to_string(&Some(lr.amount.clone()));
                        ws_ssr.write_string_with_format(r, 4, &s_val, &v_fmt)?;
                    }
                    r += 1;
                }
            } else {
                render_default_labour_breakdown(&mut *ws_ssr, &mut r, totals)?;
            }
        } else {
            render_default_labour_breakdown(&mut *ws_ssr, &mut r, totals)?;
        }

        // Blank row
        ws_ssr.set_row_height(r, 15.0)?;
        r += 1;

        // ABSTRACT BLOCK
        ws_ssr.set_row_height(r, 15.0)?;
        let abs_head_fmt = Format::new()
            .set_font_name("Trebuchet MS")
            .set_font_size(10.0)
            .set_bold()
            .set_align(FormatAlign::Left)
            .set_align(FormatAlign::VerticalCenter);
        ws_ssr.write_string_with_format(r, 1, "ABSTRACT:", &abs_head_fmt)?;
        r += 1;

        if let Some(abstract_rows) = &item_data.abstract_rows {
            if !abstract_rows.is_empty() {
                for ar in abstract_rows {
                    ws_ssr.set_row_height(r, 15.0)?;
                    if ar.is_caption.unwrap_or(false) {
                        let cap_fmt = Format::new()
                            .set_font_name("Trebuchet MS")
                            .set_font_size(10.0)
                            .set_bold()
                            .set_align(FormatAlign::Left)
                            .set_align(FormatAlign::VerticalCenter);
                        ws_ssr.merge_range(r, 1, r, 6, &ar.label, &cap_fmt)?;
                        r += 1;
                        continue;
                    }

                    let is_bold = ar.is_rate.unwrap_or(false)
                        || ar.is_total_cost.unwrap_or(false)
                        || ar.is_total.unwrap_or(false);

                    let end_col = if ar.basis.is_some() { 2 } else { 4 };
                    let mut l_fmt = Format::new()
                        .set_font_name("Trebuchet MS")
                        .set_font_size(10.0)
                        .set_align(FormatAlign::Left)
                        .set_align(FormatAlign::VerticalCenter);
                    if is_bold {
                        l_fmt = l_fmt.set_bold();
                    }
                    ws_ssr.merge_range(r, 1, r, end_col, &ar.label, &l_fmt)?;

                    if let Some(basis_str) = &ar.basis {
                        let mut b_fmt = Format::new()
                            .set_font_name("Trebuchet MS")
                            .set_font_size(10.0)
                            .set_align(FormatAlign::Center)
                            .set_align(FormatAlign::VerticalCenter);
                        if let Some(pct_clean) = basis_str.strip_suffix('%') {
                            if let Ok(p_num) = pct_clean.trim().parse::<f64>() {
                                b_fmt = b_fmt.set_num_format("0.000%");
                                ws_ssr.write_number_with_format(r, 3, p_num / 100.0, &b_fmt)?;
                            } else {
                                ws_ssr.write_string_with_format(r, 3, basis_str, &b_fmt)?;
                            }
                        } else if let Ok(num_b) = basis_str.trim().parse::<f64>() {
                            b_fmt = b_fmt.set_num_format("0.00");
                            ws_ssr.write_number_with_format(r, 3, num_b, &b_fmt)?;
                        } else {
                            ws_ssr.write_string_with_format(r, 3, basis_str, &b_fmt)?;
                        }
                    }

                    if let Some(qual_str) = &ar.qualifier {
                        let q_fmt = Format::new()
                            .set_font_name("Trebuchet MS")
                            .set_font_size(10.0)
                            .set_align(FormatAlign::Center)
                            .set_align(FormatAlign::VerticalCenter);
                        ws_ssr.write_string_with_format(r, 4, qual_str, &q_fmt)?;
                    }

                    let rs_str = if ar.is_rate.unwrap_or(false) {
                        "Rs."
                    } else {
                        "Rs:"
                    };
                    let rs_fmt = Format::new()
                        .set_font_name("Trebuchet MS")
                        .set_font_size(10.0)
                        .set_align(FormatAlign::Center)
                        .set_align(FormatAlign::VerticalCenter);
                    ws_ssr.write_string_with_format(r, 5, rs_str, &rs_fmt)?;

                    let mut v_fmt = Format::new()
                        .set_font_name("Trebuchet MS")
                        .set_font_size(10.0)
                        .set_align(FormatAlign::Right)
                        .set_align(FormatAlign::VerticalCenter);
                    if is_bold {
                        v_fmt = v_fmt.set_bold();
                    }
                    if ar.is_total.unwrap_or(false) {
                        v_fmt = v_fmt
                            .set_border_top(FormatBorder::Thin)
                            .set_border_bottom(FormatBorder::Thin);
                    }

                    if let Ok(num_val) = parse_amount_val(&ar.amount) {
                        v_fmt = v_fmt.set_num_format("0.00");
                        ws_ssr.write_number_with_format(r, 6, num_val, &v_fmt)?;
                    } else {
                        let s_val = val_to_string(&Some(ar.amount.clone()));
                        ws_ssr.write_string_with_format(r, 6, &s_val, &v_fmt)?;
                    }
                    if ar.is_rate.unwrap_or(false) {
                        adopted_rate_row = Some(r);
                    }
                    r += 1;
                }
            } else {
                render_default_abstract(&mut *ws_ssr, &mut r, totals, item_unit)?;
            }
        } else {
            render_default_abstract(&mut *ws_ssr, &mut r, totals, item_unit)?;
        }

        // PROJECT LEADS BLOCK (if leads attached)
        if let Some(leads) = &item_data.leads {
            if !leads.is_empty() {
                let mut lead_amount_cells: Vec<String> = Vec::new();
                let mut has_live_lead = false;
                ws_ssr.set_row_height(r, 15.0)?;
                r += 1;
                ws_ssr.set_row_height(r, 15.0)?;
                let is_disposal = item_data
                    .lead_summary
                    .as_ref()
                    .and_then(|s| s.disposal_only)
                    .unwrap_or(false);
                let lead_heading = if is_disposal {
                    "DISPOSAL LEAD:"
                } else {
                    "LEAD ADDITIONS:"
                };
                let lead_head_fmt = Format::new()
                    .set_font_name("Trebuchet MS")
                    .set_font_size(10.0)
                    .set_bold()
                    .set_align(FormatAlign::Left)
                    .set_align(FormatAlign::VerticalCenter);
                ws_ssr.write_string_with_format(r, 1, lead_heading, &lead_head_fmt)?;
                r += 1;

                // 2-row lead table headers
                let rlh1 = r;
                let rlh2 = r + 1;
                ws_ssr.set_row_height(rlh1, 15.0)?;
                ws_ssr.set_row_height(rlh2, 15.0)?;

                ws_ssr.merge_range(rlh1, 1, rlh2, 1, "Sl No", &border_box_bold_center)?;
                ws_ssr.merge_range(
                    rlh1,
                    2,
                    rlh2,
                    2,
                    "Material / Lead Details",
                    &border_box_bold_center,
                )?;
                ws_ssr.merge_range(rlh1, 3, rlh2, 3, "Unit", &border_box_bold_center)?;
                ws_ssr.merge_range(rlh1, 4, rlh2, 4, "Quantity", &border_box_bold_center)?;

                ws_ssr.write_string_with_format(rlh1, 5, "Rate", &border_box_bold_center)?;
                ws_ssr.write_string_with_format(rlh2, 5, "in Rs.", &border_box_bold_center)?;

                ws_ssr.write_string_with_format(rlh1, 6, "Amount", &border_box_bold_center)?;
                ws_ssr.write_string_with_format(rlh2, 6, "in Rs.", &border_box_bold_center)?;
                r += 2;

                for (l_idx, ld) in leads.iter().enumerate() {
                    let is_last_lead = l_idx == leads.len() - 1;

                    if let Some(ded) = &ld.deduction {
                        // Label merged B:D (5.57+42.71+10.57 chars).
                        ws_ssr.set_row_height(
                            r,
                            wrap_text_height(&ded.label, 5.57 + 42.71 + 10.57, 10.0, 15.0),
                        )?;
                        let ded_fmt = Format::new()
                            .set_font_name("Trebuchet MS")
                            .set_font_size(10.0)
                            .set_italic()
                            .set_align(FormatAlign::Left)
                            .set_align(FormatAlign::VerticalCenter);
                        ws_ssr.merge_range(r, 1, r, 3, &ded.label, &ded_fmt)?;

                        let net_text = format!(
                            "Net: Rs {}/{}",
                            ded.net_rate_text.as_deref().unwrap_or("0.00"),
                            ded.unit.as_deref().unwrap_or("unit")
                        );
                        let net_fmt = Format::new()
                            .set_font_name("Trebuchet MS")
                            .set_font_size(10.0)
                            .set_align(FormatAlign::Center)
                            .set_align(FormatAlign::VerticalCenter);
                        ws_ssr.write_string_with_format(r, 4, &net_text, &net_fmt)?;
                        r += 1;
                    }

                    let has_formula = ld
                        .lead_formula
                        .as_ref()
                        .is_some_and(|f| !f.trim().is_empty());
                    // Height is set after mat_text is built (below): the
                    // material cell wraps in col C (42.71 chars) and may carry
                    // a multi-line formula note. Floor stays 30 for formula
                    // rows (result unknowable), 15 otherwise.
                    let lead_row_floor = if has_formula { 30.0 } else { 15.0 };

                    let mut sl_fmt = Format::new()
                        .set_font_name("Trebuchet MS")
                        .set_font_size(10.0)
                        .set_align(FormatAlign::Center)
                        .set_align(FormatAlign::VerticalCenter)
                        .set_border_left(FormatBorder::Thin)
                        .set_border_right(FormatBorder::Thin);
                    if is_last_lead {
                        sl_fmt = sl_fmt.set_border_bottom(FormatBorder::Thin);
                    }

                    let mut mat_fmt = Format::new()
                        .set_font_name("Trebuchet MS")
                        .set_font_size(10.0)
                        .set_align(FormatAlign::Left)
                        .set_align(FormatAlign::VerticalCenter)
                        .set_text_wrap();
                    if is_last_lead {
                        mat_fmt = mat_fmt.set_border_bottom(FormatBorder::Thin);
                    }

                    let mut unit_fmt = Format::new()
                        .set_font_name("Trebuchet MS")
                        .set_font_size(10.0)
                        .set_align(FormatAlign::Center)
                        .set_align(FormatAlign::VerticalCenter)
                        .set_border_left(FormatBorder::Thin)
                        .set_border_right(FormatBorder::Thin);
                    if is_last_lead {
                        unit_fmt = unit_fmt.set_border_bottom(FormatBorder::Thin);
                    }

                    let mut qty_fmt = Format::new()
                        .set_font_name("Trebuchet MS")
                        .set_font_size(10.0)
                        .set_num_format("0.00")
                        .set_align(FormatAlign::Center)
                        .set_align(FormatAlign::VerticalCenter)
                        .set_border_right(FormatBorder::Thin);
                    if is_last_lead {
                        qty_fmt = qty_fmt.set_border_bottom(FormatBorder::Thin);
                    }

                    let mut rate_fmt = Format::new()
                        .set_font_name("Trebuchet MS")
                        .set_font_size(10.0)
                        .set_num_format("0.00")
                        .set_align(FormatAlign::Center)
                        .set_align(FormatAlign::VerticalCenter)
                        .set_border_left(FormatBorder::Thin)
                        .set_border_right(FormatBorder::Thin);
                    if is_last_lead {
                        rate_fmt = rate_fmt.set_border_bottom(FormatBorder::Thin);
                    }

                    let mut amt_fmt = Format::new()
                        .set_font_name("Trebuchet MS")
                        .set_font_size(10.0)
                        .set_num_format("0.00")
                        .set_align(FormatAlign::Right)
                        .set_align(FormatAlign::VerticalCenter)
                        .set_border_left(FormatBorder::Thin)
                        .set_border_right(FormatBorder::Thin);
                    if is_last_lead {
                        amt_fmt = amt_fmt.set_border_bottom(FormatBorder::Thin);
                    }

                    let sl_text = format!("{}", l_idx + 1);
                    ws_ssr.write_string_with_format(r, 1, &sl_text, &sl_fmt)?;

                    let mut mat_text = ld.material.clone().unwrap_or_default();
                    if let Some(tag) = &ld.lead_type_tag {
                        if !tag.trim().is_empty() {
                            mat_text = format!("{}  [{}]", mat_text, tag.trim());
                        }
                    }
                    if let Some(dist) = ld.distance_km {
                        let lift_text = if let Some(lift) = ld.lift_m {
                            if lift > 0.0 {
                                format!(", lift {}m", lift)
                            } else {
                                String::new()
                            }
                        } else {
                            String::new()
                        };
                        mat_text = format!("{} [{} km{}]", mat_text, dist, lift_text);
                    }
                    if let Some(formula) = &ld.lead_formula {
                        if !formula.trim().is_empty() {
                            mat_text = format!("{}\nFormula: {}", mat_text, formula.trim());
                        }
                    }
                    ws_ssr.write_string_with_format(r, 2, &mat_text, &mat_fmt)?;
                    ws_ssr.set_row_height(
                        r,
                        wrap_text_height(&mat_text, 42.71, 10.0, lead_row_floor),
                    )?;

                    let unit_str = ld.unit.as_deref().unwrap_or("");
                    ws_ssr.write_string_with_format(r, 3, unit_str, &unit_fmt)?;

                    let qty_val = val_to_f64(&ld.quantity);
                    ws_ssr.write_number_with_format(r, 4, qty_val, &qty_fmt)?;

                    if let Some(rate_ref) = lead_rate_refs.get(&ld.lead_key) {
                        let rate_formula = format!("={rate_ref}");
                        ws_ssr.write_formula_with_format(r, 5, rate_formula.as_str(), &rate_fmt)?;
                        let amount_formula = format!("=ROUND(E{}*F{},2)", r + 1, r + 1);
                        ws_ssr.write_formula_with_format(
                            r,
                            6,
                            amount_formula.as_str(),
                            &amt_fmt,
                        )?;
                        has_live_lead = true;
                    } else {
                        if require_lead_refs && !ld.lead_key.trim().is_empty() {
                            return Err(XlsxError::CustomError(format!(
                                "DATA lead key '{}' has no exported Lead Statement rate cell",
                                ld.lead_key
                            )));
                        }
                        let rate_val = val_to_f64(&ld.rate);
                        ws_ssr.write_number_with_format(r, 5, rate_val, &rate_fmt)?;
                        let amt_val = val_to_f64(&ld.amount);
                        ws_ssr.write_number_with_format(r, 6, amt_val, &amt_fmt)?;
                    }
                    lead_amount_cells.push(format!("G{}", r + 1));
                    r += 1;
                }

                // Lead Totals
                if let Some(lsum) = &item_data.lead_summary {
                    let lead_totals = [
                        (
                            "Base final amount",
                            lsum.base_amount_text.as_deref().unwrap_or("0.00"),
                            false,
                        ),
                        (
                            if is_disposal {
                                "Add Disposal Lead total"
                            } else {
                                "Add Lead/Lift total"
                            },
                            lsum.lead_total_text.as_deref().unwrap_or("0.00"),
                            false,
                        ),
                        (
                            if is_disposal {
                                "Final amount with Disposal Lead"
                            } else {
                                "Final amount with Lead"
                            },
                            lsum.final_amount_text.as_deref().unwrap_or("0.00"),
                            true,
                        ),
                        (
                            if is_disposal {
                                "Rate per unit with Disposal Lead"
                            } else {
                                "Rate per unit with Lead"
                            },
                            lsum.final_rate_text.as_deref().unwrap_or("0.00"),
                            true,
                        ),
                    ];

                    let base_total_row = r;
                    for (lt_index, (lt_label, lt_val_text, highlight)) in
                        lead_totals.into_iter().enumerate()
                    {
                        ws_ssr.set_row_height(r, 15.0)?;
                        let mut label_fmt = Format::new()
                            .set_font_name("Trebuchet MS")
                            .set_font_size(10.0)
                            .set_align(FormatAlign::Left)
                            .set_align(FormatAlign::VerticalCenter);
                        if highlight {
                            label_fmt = label_fmt.set_bold().set_background_color(highlight_color);
                        }
                        ws_ssr.merge_range(r, 1, r, 4, lt_label, &label_fmt)?;

                        let mut rs_fmt = Format::new()
                            .set_font_name("Trebuchet MS")
                            .set_font_size(10.0)
                            .set_align(FormatAlign::Center)
                            .set_align(FormatAlign::VerticalCenter);
                        if highlight {
                            rs_fmt = rs_fmt.set_background_color(highlight_color);
                        }
                        ws_ssr.write_string_with_format(r, 5, "Rs:", &rs_fmt)?;

                        let mut val_fmt = Format::new()
                            .set_font_name("Trebuchet MS")
                            .set_font_size(10.0)
                            .set_align(FormatAlign::Right)
                            .set_align(FormatAlign::VerticalCenter);
                        if highlight {
                            val_fmt = val_fmt
                                .set_bold()
                                .set_background_color(highlight_color)
                                .set_border(FormatBorder::Thin);
                        }

                        val_fmt = val_fmt.set_num_format("0.00");
                        if has_live_lead && lt_index > 0 {
                            let formula = match lt_index {
                                1 => format!("=SUM({})", lead_amount_cells.join(",")),
                                2 => format!("=G{}+G{}", base_total_row + 1, base_total_row + 2),
                                3 => format!("=G{}/{}", base_total_row + 3, output_qty_cell),
                                _ => unreachable!(),
                            };
                            ws_ssr.write_formula_with_format(r, 6, formula.as_str(), &val_fmt)?;
                        } else {
                            let cleaned: String = lt_val_text
                                .chars()
                                .filter(|c| c.is_ascii_digit() || *c == '.' || *c == '-')
                                .collect();
                            if let Ok(num_val) = cleaned.parse::<f64>() {
                                ws_ssr.write_number_with_format(r, 6, num_val, &val_fmt)?;
                            } else {
                                ws_ssr.write_string_with_format(r, 6, lt_val_text, &val_fmt)?;
                            }
                        }
                        if lt_index == 3 {
                            adopted_rate_row = Some(r);
                        }
                        r += 1;
                    }
                }
            }
        }

        // SELECTED OPTIONAL ADDITION (if present)
        if let Some(opt_add) = &item_data.optional_addition {
            ws_ssr.set_row_height(r, 15.0)?;
            r += 1;
            ws_ssr.set_row_height(r, 15.0)?;
            let add_head_fmt = Format::new()
                .set_font_name("Trebuchet MS")
                .set_font_size(10.0)
                .set_bold()
                .set_align(FormatAlign::Left)
                .set_align(FormatAlign::VerticalCenter);
            ws_ssr.write_string_with_format(r, 1, "SELECTED OPTIONAL ADDITION:", &add_head_fmt)?;
            r += 1;

            ws_ssr.set_row_height(r, 15.0)?;
            let desc_label = format!(
                "{} (Calculated from {} {} add-on DATA)",
                opt_add.label,
                opt_add.output_quantity_text.as_deref().unwrap_or("1"),
                opt_add.unit.as_deref().unwrap_or(item_unit)
            );
            ws_ssr.merge_range(r, 1, r, 6, &desc_label, &add_head_fmt)?;
            r += 1;

            let adopted_val_str = format!(
                "Rs. {} / {}",
                opt_add.adopted_rate_text.as_deref().unwrap_or("0.00"),
                item_unit
            );
            let total_cost_text = opt_add.total_cost_text.as_deref().unwrap_or("0.00");
            let base_rate_text = opt_add.base_rate_text.as_deref().unwrap_or("0.00");
            let addon_rate_text = opt_add.addon_rate_text.as_deref().unwrap_or("0.00");
            let addon_totals = [
                ("Total add-on cost", total_cost_text, false),
                ("Calculated base DATA rate", base_rate_text, false),
                ("Selected add-on rate", addon_rate_text, false),
                ("Adopted rate", &adopted_val_str, true),
            ];

            for (at_label, at_val, highlight) in addon_totals {
                ws_ssr.set_row_height(r, 15.0)?;
                let mut label_fmt = Format::new()
                    .set_font_name("Trebuchet MS")
                    .set_font_size(10.0)
                    .set_align(FormatAlign::Left)
                    .set_align(FormatAlign::VerticalCenter);
                if highlight {
                    label_fmt = label_fmt.set_bold().set_background_color(highlight_color);
                }
                ws_ssr.merge_range(r, 1, r, 4, at_label, &label_fmt)?;

                let mut rs_fmt = Format::new()
                    .set_font_name("Trebuchet MS")
                    .set_font_size(10.0)
                    .set_align(FormatAlign::Center)
                    .set_align(FormatAlign::VerticalCenter);
                if highlight {
                    rs_fmt = rs_fmt.set_background_color(highlight_color);
                }
                ws_ssr.write_string_with_format(r, 5, "Rs:", &rs_fmt)?;

                let mut val_fmt = Format::new()
                    .set_font_name("Trebuchet MS")
                    .set_font_size(10.0)
                    .set_align(FormatAlign::Right)
                    .set_align(FormatAlign::VerticalCenter);
                if highlight {
                    val_fmt = val_fmt
                        .set_bold()
                        .set_background_color(highlight_color)
                        .set_border(FormatBorder::Thin);
                }

                let cleaned: String = at_val
                    .chars()
                    .filter(|c| c.is_ascii_digit() || *c == '.' || *c == '-')
                    .collect();
                if let Ok(num_val) = cleaned.parse::<f64>() {
                    val_fmt = val_fmt.set_num_format("0.00");
                    ws_ssr.write_number_with_format(r, 6, num_val, &val_fmt)?;
                } else {
                    ws_ssr.write_string_with_format(r, 6, at_val, &val_fmt)?;
                }
                if highlight {
                    adopted_rate_row = Some(r);
                }
                r += 1;
            }
        }

        // SELECTED RATE VARIANT (if present)
        if let Some(rvar) = &item_data.rate_variant {
            ws_ssr.set_row_height(r, 15.0)?;
            r += 1;
            ws_ssr.set_row_height(r, 15.0)?;
            let var_head_fmt = Format::new()
                .set_font_name("Trebuchet MS")
                .set_font_size(10.0)
                .set_bold()
                .set_align(FormatAlign::Left)
                .set_align(FormatAlign::VerticalCenter);
            ws_ssr.write_string_with_format(r, 1, "SELECTED RATE VARIANT:", &var_head_fmt)?;
            r += 1;

            ws_ssr.set_row_height(r, 15.0)?;
            let reg_fmt = Format::new()
                .set_font_name("Trebuchet MS")
                .set_font_size(10.0)
                .set_align(FormatAlign::Left)
                .set_align(FormatAlign::VerticalCenter);
            let rvar_selected = rvar.selected_label.as_deref().unwrap_or("Variant");
            let rvar_base = rvar.base_label.as_deref().unwrap_or("Base class");
            let rvar_pct = rvar.percent.unwrap_or(0.0);
            let var_sub_label = format!(
                "{} (+{}% adjustment over {})",
                rvar_selected, rvar_pct, rvar_base
            );
            ws_ssr.merge_range(r, 1, r, 6, &var_sub_label, &reg_fmt)?;
            r += 1;

            let base_lbl = format!("Calculated {} base rate", rvar_base);
            let add_lbl = format!("Add {}% for {}", rvar_pct, rvar_selected);
            let adopted_lbl = format!("Adopted {} rate", rvar_selected);
            let adopted_val_str = format!(
                "Rs. {} / {}",
                rvar.adopted_rate_text.as_deref().unwrap_or("0.00"),
                item_unit
            );

            let base_rate_text = rvar.base_rate_text.as_deref().unwrap_or("0.00");
            let addition_text = rvar.addition_text.as_deref().unwrap_or("0.00");
            let variant_rows = [
                (base_lbl, base_rate_text, false),
                (add_lbl, addition_text, false),
                (adopted_lbl, &adopted_val_str, true),
            ];

            for (vt_label, vt_val, highlight) in variant_rows {
                ws_ssr.set_row_height(r, 15.0)?;
                let mut label_fmt = Format::new()
                    .set_font_name("Trebuchet MS")
                    .set_font_size(10.0)
                    .set_align(FormatAlign::Left)
                    .set_align(FormatAlign::VerticalCenter);
                if highlight {
                    label_fmt = label_fmt.set_bold().set_background_color(highlight_color);
                }
                ws_ssr.merge_range(r, 1, r, 4, &vt_label, &label_fmt)?;

                let mut rs_fmt = Format::new()
                    .set_font_name("Trebuchet MS")
                    .set_font_size(10.0)
                    .set_align(FormatAlign::Center)
                    .set_align(FormatAlign::VerticalCenter);
                if highlight {
                    rs_fmt = rs_fmt.set_background_color(highlight_color);
                }
                ws_ssr.write_string_with_format(r, 5, "Rs:", &rs_fmt)?;

                let mut val_fmt = Format::new()
                    .set_font_name("Trebuchet MS")
                    .set_font_size(10.0)
                    .set_align(FormatAlign::Right)
                    .set_align(FormatAlign::VerticalCenter);
                if highlight {
                    val_fmt = val_fmt
                        .set_bold()
                        .set_background_color(highlight_color)
                        .set_border(FormatBorder::Thin);
                }

                let cleaned: String = vt_val
                    .chars()
                    .filter(|c| c.is_ascii_digit() || *c == '.' || *c == '-')
                    .collect();
                if let Ok(num_val) = cleaned.parse::<f64>() {
                    val_fmt = val_fmt.set_num_format("0.00");
                    ws_ssr.write_number_with_format(r, 6, num_val, &val_fmt)?;
                } else {
                    ws_ssr.write_string_with_format(r, 6, vt_val, &val_fmt)?;
                }
                if highlight {
                    adopted_rate_row = Some(r);
                }
                r += 1;
            }
        }

        if let Some(rate_row) = adopted_rate_row {
            data_rate_refs.insert(data_key, format!("'SSR Items'!$G${}", rate_row + 1));
        }

        // Blank rows separation between DATA recipes
        ws_ssr.set_row_height(r, 15.0)?;
        r += 1;
        ws_ssr.set_row_height(r, 15.0)?;
        r += 1;
    }

    super::signature::apply_data_signature(ws_ssr, &mut r, req, req.sor.is_empty(), 1, 6)?;
    if r > 0 {
        ws_ssr.set_print_area(0, 0, r - 1, 6)?;
    }

    // =========================================================================
    Ok(data_rate_refs)
}

fn render_default_labour_breakdown(
    ws: &mut rust_xlsxwriter::Worksheet,
    r: &mut u32,
    totals: &Totals,
) -> Result<(), XlsxError> {
    let reg_fmt = Format::new()
        .set_font_name("Trebuchet MS")
        .set_font_size(10.0)
        .set_align(FormatAlign::Left)
        .set_align(FormatAlign::VerticalCenter);

    let center_num_fmt = Format::new()
        .set_font_name("Trebuchet MS")
        .set_font_size(10.0)
        .set_num_format("0.00")
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter);

    let center_pct_fmt = Format::new()
        .set_font_name("Trebuchet MS")
        .set_font_size(10.0)
        .set_num_format("0.000%")
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter);

    let center_bold_num_fmt = Format::new()
        .set_font_name("Trebuchet MS")
        .set_font_size(10.0)
        .set_bold()
        .set_num_format("0.00")
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter);

    ws.set_row_height(*r, 15.0)?;
    ws.merge_range(*r, 1, *r, 3, "labour component/unit qty", &reg_fmt)?;
    ws.write_number_with_format(
        *r,
        4,
        totals.labour_unit_base.unwrap_or(0.0),
        &center_num_fmt,
    )?;
    *r += 1;

    ws.set_row_height(*r, 15.0)?;
    ws.merge_range(
        *r,
        1,
        *r,
        2,
        "Add contractor's profit and overhead charges",
        &reg_fmt,
    )?;
    let ovh_pct = totals.overhead_percent.unwrap_or(0.0) / 100.0;
    ws.write_number_with_format(*r, 3, ovh_pct, &center_pct_fmt)?;
    ws.write_number_with_format(
        *r,
        4,
        totals.labour_unit_profit.unwrap_or(0.0),
        &center_num_fmt,
    )?;
    *r += 1;

    ws.set_row_height(*r, 15.0)?;
    ws.merge_range(
        *r,
        1,
        *r,
        3,
        "labour component/unit qty (including contractor's profit)",
        &reg_fmt,
    )?;
    ws.write_number_with_format(
        *r,
        4,
        totals.labour_unit_total.unwrap_or(0.0),
        &center_bold_num_fmt,
    )?;
    *r += 1;

    Ok(())
}

fn render_default_abstract(
    ws: &mut rust_xlsxwriter::Worksheet,
    r: &mut u32,
    totals: &Totals,
    unit: &str,
) -> Result<(), XlsxError> {
    let reg_fmt = Format::new()
        .set_font_name("Trebuchet MS")
        .set_font_size(10.0)
        .set_align(FormatAlign::Left)
        .set_align(FormatAlign::VerticalCenter);

    let bold_fmt = Format::new()
        .set_font_name("Trebuchet MS")
        .set_font_size(10.0)
        .set_bold()
        .set_align(FormatAlign::Left)
        .set_align(FormatAlign::VerticalCenter);

    let rs_fmt = Format::new()
        .set_font_name("Trebuchet MS")
        .set_font_size(10.0)
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter);

    let val_fmt = Format::new()
        .set_font_name("Trebuchet MS")
        .set_font_size(10.0)
        .set_num_format("0.00")
        .set_align(FormatAlign::Right)
        .set_align(FormatAlign::VerticalCenter);

    let val_bold_fmt = Format::new()
        .set_font_name("Trebuchet MS")
        .set_font_size(10.0)
        .set_bold()
        .set_num_format("0.00")
        .set_align(FormatAlign::Right)
        .set_align(FormatAlign::VerticalCenter);

    let val_tb_fmt = Format::new()
        .set_font_name("Trebuchet MS")
        .set_font_size(10.0)
        .set_num_format("0.00")
        .set_border_top(FormatBorder::Thin)
        .set_border_bottom(FormatBorder::Thin)
        .set_align(FormatAlign::Right)
        .set_align(FormatAlign::VerticalCenter);

    let abs_lines = [
        ("A. Cost of Materials", totals.material_total.unwrap_or(0.0)),
        (
            "B. Hire charges of Machinery",
            totals.machinery_total.unwrap_or(0.0),
        ),
        ("C. Cost of Labour", totals.labour_total.unwrap_or(0.0)),
    ];

    for (label, val) in abs_lines {
        ws.set_row_height(*r, 15.0)?;
        ws.merge_range(*r, 1, *r, 4, label, &reg_fmt)?;
        ws.write_string_with_format(*r, 5, "Rs:", &rs_fmt)?;
        ws.write_number_with_format(*r, 6, val, &val_fmt)?;
        *r += 1;
    }

    // Total row
    ws.set_row_height(*r, 15.0)?;
    let center_fmt = Format::new()
        .set_font_name("Trebuchet MS")
        .set_font_size(10.0)
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter);
    ws.write_string_with_format(*r, 4, "Total", &center_fmt)?;
    ws.write_string_with_format(*r, 5, "Rs:", &rs_fmt)?;
    ws.write_number_with_format(*r, 6, totals.base_cost.unwrap_or(0.0), &val_tb_fmt)?;
    *r += 1;

    // Overhead row
    ws.set_row_height(*r, 15.0)?;
    ws.merge_range(
        *r,
        1,
        *r,
        3,
        "D. Add for contractor's profit and overheads on (A+B+C)",
        &reg_fmt,
    )?;
    let center_pct_fmt = Format::new()
        .set_font_name("Trebuchet MS")
        .set_font_size(10.0)
        .set_num_format("0.000%")
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter);
    let ovh_pct = totals.overhead_percent.unwrap_or(0.0) / 100.0;
    ws.write_number_with_format(*r, 4, ovh_pct, &center_pct_fmt)?;
    ws.write_string_with_format(*r, 5, "Rs:", &rs_fmt)?;
    ws.write_number_with_format(*r, 6, totals.overhead_amount.unwrap_or(0.0), &val_fmt)?;
    *r += 1;

    // Area Allowance row if present
    if let Some(allow_amt) = totals.area_allowance_amount {
        if allow_amt > 0.0 {
            ws.set_row_height(*r, 15.0)?;
            let allow_pct = totals.area_allowance_percent.unwrap_or(0.0);
            let label = format!("E. Add Area Allowance (+{:.2}%) on Labour", allow_pct);
            ws.merge_range(*r, 1, *r, 3, &label, &reg_fmt)?;
            ws.write_number_with_format(*r, 4, allow_pct / 100.0, &center_pct_fmt)?;
            ws.write_string_with_format(*r, 5, "Rs:", &rs_fmt)?;
            ws.write_number_with_format(*r, 6, allow_amt, &val_fmt)?;
            *r += 1;
        }
    }

    // Total cost for row
    ws.set_row_height(*r, 15.0)?;
    ws.merge_range(*r, 1, *r, 2, "Total cost for", &reg_fmt)?;
    let center_num_fmt = Format::new()
        .set_font_name("Trebuchet MS")
        .set_font_size(10.0)
        .set_num_format("0.00")
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter);
    ws.write_number_with_format(
        *r,
        3,
        totals.output_quantity.unwrap_or(1.0),
        &center_num_fmt,
    )?;
    ws.write_string_with_format(*r, 4, unit, &center_fmt)?;
    ws.write_string_with_format(*r, 5, "Rs:", &rs_fmt)?;
    ws.write_number_with_format(*r, 6, totals.total_cost.unwrap_or(0.0), &val_bold_fmt)?;
    *r += 1;

    // Rate per Unit row
    ws.set_row_height(*r, 15.0)?;
    let rate_label = format!("Rate per {}", unit);
    ws.merge_range(*r, 1, *r, 2, &rate_label, &bold_fmt)?;
    let calc_expr = format!("(A+B+C+D)/{}", totals.output_quantity.unwrap_or(1.0));
    ws.write_string_with_format(*r, 3, &calc_expr, &center_fmt)?;
    ws.write_string_with_format(*r, 5, "Rs.", &rs_fmt)?;
    ws.write_number_with_format(*r, 6, totals.rate_per_unit.unwrap_or(0.0), &val_bold_fmt)?;
    *r += 1;

    Ok(())
}
