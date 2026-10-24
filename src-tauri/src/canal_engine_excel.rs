use estimate_core::canal_engine::*;
use rust_xlsxwriter::{Color, Format, FormatAlign, FormatBorder, Workbook, XlsxError};

fn write_fml(
    ws: &mut rust_xlsxwriter::Worksheet,
    r: u32,
    c: u16,
    fml: &str,
    fmt: &Format,
) -> Result<(), XlsxError> {
    ws.write_formula_with_format(r, c, fml, fmt)?;
    Ok(())
}

pub fn generate_canal_cutting_excel_bytes(
    input: &CanalCuttingInput,
    calc: &CanalCuttingCalculationResponse,
) -> Result<Vec<u8>, XlsxError> {
    let mut workbook = Workbook::new();
    let ws = workbook.add_worksheet();
    ws.set_name("Canal Cutting")?;

    // Color Palette
    let ink = Color::RGB(0x0F172A);
    let header_bg = Color::RGB(0x1E3A5F);
    let subheader_bg = Color::RGB(0x334E68);
    let tier_bg = Color::RGB(0x2A4365);
    let reach_bg = Color::RGB(0xF1F5F9);
    let total_bg = Color::RGB(0xE2E8F0);
    let white = Color::RGB(0xFFFFFF);
    let border_color = Color::RGB(0xCBD5E1);

    // Formats
    let title_fmt = Format::new()
        .set_font_name("Segoe UI")
        .set_font_size(14)
        .set_bold()
        .set_font_color(ink)
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter);

    let subtitle_fmt = Format::new()
        .set_font_name("Segoe UI")
        .set_font_size(11)
        .set_bold()
        .set_font_color(Color::RGB(0x475569))
        .set_align(FormatAlign::Center);

    let param_label_fmt = Format::new()
        .set_font_name("Segoe UI")
        .set_font_size(10)
        .set_bold()
        .set_font_color(ink)
        .set_background_color(reach_bg)
        .set_border(FormatBorder::Thin)
        .set_border_color(border_color);

    let param_val_fmt = Format::new()
        .set_font_name("Segoe UI")
        .set_font_size(10)
        .set_font_color(ink)
        .set_border(FormatBorder::Thin)
        .set_border_color(border_color)
        .set_align(FormatAlign::Right)
        .set_num_format("0.00");

    let tbl_hdr_fmt = Format::new()
        .set_font_name("Segoe UI")
        .set_font_size(10)
        .set_bold()
        .set_font_color(white)
        .set_background_color(header_bg)
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter)
        .set_text_wrap()
        .set_border(FormatBorder::Thin)
        .set_border_color(border_color);

    let tier_hdr_fmt = Format::new()
        .set_font_name("Segoe UI")
        .set_font_size(10)
        .set_bold()
        .set_font_color(white)
        .set_background_color(tier_bg)
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter)
        .set_border(FormatBorder::Thin)
        .set_border_color(border_color);

    let sub_hdr_fmt = Format::new()
        .set_font_name("Segoe UI")
        .set_font_size(9)
        .set_bold()
        .set_font_color(white)
        .set_background_color(subheader_bg)
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter)
        .set_border(FormatBorder::Thin)
        .set_border_color(border_color);

    let reach_band_fmt = Format::new()
        .set_font_name("Segoe UI")
        .set_font_size(10)
        .set_bold()
        .set_font_color(Color::RGB(0x1E40AF))
        .set_background_color(Color::RGB(0xDBEAFE))
        .set_border(FormatBorder::Thin)
        .set_border_color(border_color)
        .set_align(FormatAlign::Left);

    let cell_center = Format::new()
        .set_font_name("Segoe UI")
        .set_font_size(9)
        .set_align(FormatAlign::Center)
        .set_border(FormatBorder::Thin)
        .set_border_color(border_color);

    let cell_num2 = Format::new()
        .set_font_name("Segoe UI")
        .set_font_size(9)
        .set_align(FormatAlign::Right)
        .set_border(FormatBorder::Thin)
        .set_border_color(border_color)
        .set_num_format("0.00");

    let cell_num3 = Format::new()
        .set_font_name("Segoe UI")
        .set_font_size(9)
        .set_align(FormatAlign::Right)
        .set_border(FormatBorder::Thin)
        .set_border_color(border_color)
        .set_num_format("0.000");

    let total_fmt = Format::new()
        .set_font_name("Segoe UI")
        .set_font_size(10)
        .set_bold()
        .set_font_color(ink)
        .set_background_color(total_bg)
        .set_align(FormatAlign::Right)
        .set_border(FormatBorder::Thin)
        .set_border_color(border_color)
        .set_num_format("#,##0.00");

    let max_tiers = calc.max_tiers_count.max(2);

    // Dynamic columns configuration:
    // Fixed Station Cols: 0..5 (S.No, Chainage, dx, GL, CBL, Cut Depth) -> 6 cols
    // Per Tier:
    //   4 strata (Hard Rock, F&F, HDR, All Soils) x 4 subcols (Top W, Bot W, Depth, Area) = 16 cols
    //   + 1 Tier Area col + 1 Shelf col = 18 cols per Tier
    // Summary Cols at end:
    //   Total Area, Mean Area, Total Volume, Soil Vol, HDR Vol, F&F Vol, HR Vol -> 7 cols
    let tier_cols_count: u16 = 18;
    let total_cols: u16 = 6 + (max_tiers as u16 * tier_cols_count) + 7;

    // Set base column widths
    ws.set_column_width(0, 6.0)?;  // S.No
    ws.set_column_width(1, 13.0)?; // Chainage
    ws.set_column_width(2, 10.0)?; // dx
    ws.set_column_width(3, 11.0)?; // GL
    ws.set_column_width(4, 11.0)?; // CBL
    ws.set_column_width(5, 11.0)?; // Cut Depth

    for t in 0..max_tiers {
        let base_c = 6 + (t as u16 * tier_cols_count);
        for offset in 0..tier_cols_count {
            ws.set_column_width(base_c + offset, 10.5)?;
        }
    }

    let summary_base_col = 6 + (max_tiers as u16 * tier_cols_count);
    ws.set_column_width(summary_base_col, 13.0)?;     // Total Area
    ws.set_column_width(summary_base_col + 1, 12.0)?; // Mean Area
    ws.set_column_width(summary_base_col + 2, 14.0)?; // Volume
    ws.set_column_width(summary_base_col + 3, 13.0)?; // Soil Vol
    ws.set_column_width(summary_base_col + 4, 13.0)?; // HDR Vol
    ws.set_column_width(summary_base_col + 5, 13.0)?; // F&F Vol
    ws.set_column_width(summary_base_col + 6, 13.0)?; // HR Vol

    // 1. Title Block
    ws.merge_range(
        0, 0, 0, total_cols.saturating_sub(1),
        "STATEMENT SHOWING THE EARTH WORK EXCAVATION OF CANAL (FULL CUTTING)",
        &title_fmt,
    )?;
    ws.set_row_height(0, 28.0)?;

    ws.merge_range(
        1, 0, 1, total_cols.saturating_sub(1),
        "Cross-Sectional Trapezoidal Layer Breakdown with Bottom-Up Strata Slicing and Dynamic Bench Tiers",
        &subtitle_fmt,
    )?;
    ws.set_row_height(1, 20.0)?;

    // 2. Canal Hydraulic & Geometric Parameters
    let tbl_h = input.full_supply_depth + input.free_board;
    ws.write_string_with_format(3, 1, "Bed Width (B):", &param_label_fmt)?;
    ws.write_number_with_format(3, 2, input.bed_width, &param_val_fmt)?;

    ws.write_string_with_format(3, 4, "Full Supply Depth (FSD):", &param_label_fmt)?;
    ws.write_number_with_format(3, 5, input.full_supply_depth, &param_val_fmt)?;

    ws.write_string_with_format(3, 7, "Free Board (FB):", &param_label_fmt)?;
    ws.write_number_with_format(3, 8, input.free_board, &param_val_fmt)?;

    ws.write_string_with_format(3, 10, "TBL Height above Bed:", &param_label_fmt)?;
    ws.write_number_with_format(3, 11, tbl_h, &param_val_fmt)?;

    ws.write_string_with_format(4, 1, "Inner Side Slope:", &param_label_fmt)?;
    ws.write_string_with_format(4, 2, &format!("{:.2} : 1", input.side_slope), &param_label_fmt)?;

    ws.write_string_with_format(4, 4, "Base Cut Slope above TBL:", &param_label_fmt)?;
    ws.write_string_with_format(4, 5, &format!("{:.2} : 1", input.berm_config.manual_base_slope), &param_label_fmt)?;

    ws.write_string_with_format(4, 7, "Bed Slope (Longitudinal):", &param_label_fmt)?;
    ws.write_number_with_format(4, 8, input.bed_slope, &param_val_fmt)?;

    ws.write_string_with_format(4, 10, "Start Bed Level (CBL0):", &param_label_fmt)?;
    ws.write_number_with_format(4, 11, input.bed_level_at_start, &param_val_fmt)?;

    // 3. Abstract of Cutting Reaches Block
    let mut row: u32 = 6;
    ws.merge_range(row, 0, row, 11, "ABSTRACT OF CUTTING REACHES", &sub_hdr_fmt)?;
    row += 1;

    let reach_headers = [
        "S.No", "Reach Description", "From Ch (m)", "To Ch (m)", "Length (m)",
        "Berms", "Berm RLs", "Total Vol (m³)", "Soil Vol (m³)", "HDR Vol (m³)", "F&F Vol (m³)", "HR Vol (m³)",
    ];
    for (c, h) in reach_headers.iter().enumerate() {
        ws.write_string_with_format(row, c as u16, *h, &sub_hdr_fmt)?;
    }
    row += 1;

    let reach_start_row = row + 1;
    for r in &calc.reaches {
        ws.write_number_with_format(row, 0, r.reach_index as f64, &cell_center)?;
        ws.write_string_with_format(row, 1, &r.reach_name, &cell_center)?;
        ws.write_number_with_format(row, 2, r.from_chainage, &cell_num2)?;
        ws.write_number_with_format(row, 3, r.to_chainage, &cell_num2)?;
        write_fml(ws, row, 4, &format!("=D{}-C{}", row + 1, row + 1), &cell_num2)?;
        ws.write_number_with_format(row, 5, r.berm_count as f64, &cell_center)?;
        let rls = r.active_berm_elevations.iter().map(|e| format!("{:.2}m", e)).collect::<Vec<_>>().join(", ");
        ws.write_string_with_format(row, 6, if rls.is_empty() { "-" } else { &rls }, &cell_center)?;
        ws.write_number_with_format(row, 7, r.total_volume_m3, &cell_num2)?;
        ws.write_number_with_format(row, 8, r.soil_volume_m3, &cell_num2)?;
        ws.write_number_with_format(row, 9, r.hdr_volume_m3, &cell_num2)?;
        ws.write_number_with_format(row, 10, r.ff_volume_m3, &cell_num2)?;
        ws.write_number_with_format(row, 11, r.hr_volume_m3, &cell_num2)?;
        row += 1;
    }
    let reach_end_row = row;

    // Reach Totals Row
    ws.merge_range(row, 0, row, 3, "TOTAL REACHES VOLUME", &total_fmt)?;
    write_fml(ws, row, 4, &format!("=SUM(E{}:E{})", reach_start_row, reach_end_row), &total_fmt)?;
    ws.write_string_with_format(row, 5, "-", &cell_center)?;
    ws.write_string_with_format(row, 6, "-", &cell_center)?;
    write_fml(ws, row, 7, &format!("=SUM(H{}:H{})", reach_start_row, reach_end_row), &total_fmt)?;
    write_fml(ws, row, 8, &format!("=SUM(I{}:I{})", reach_start_row, reach_end_row), &total_fmt)?;
    write_fml(ws, row, 9, &format!("=SUM(J{}:J{})", reach_start_row, reach_end_row), &total_fmt)?;
    write_fml(ws, row, 10, &format!("=SUM(K{}:K{})", reach_start_row, reach_end_row), &total_fmt)?;
    write_fml(ws, row, 11, &format!("=SUM(L{}:L{})", reach_start_row, reach_end_row), &total_fmt)?;
    row += 2;

    // 4. Section-by-Section Measurement Table Headers (3 header rows for multi-tier strata)
    let h_row0 = row;
    let h_row1 = row + 1;
    let h_row2 = row + 2;

    // Station Columns
    ws.merge_range(h_row0, 0, h_row2, 0, "S.No", &tbl_hdr_fmt)?;
    ws.merge_range(h_row0, 1, h_row2, 1, "Chainage (m)", &tbl_hdr_fmt)?;
    ws.merge_range(h_row0, 2, h_row2, 2, "Distance Δx (m)", &tbl_hdr_fmt)?;
    ws.merge_range(h_row0, 3, h_row2, 3, "Ground Level (GL)", &tbl_hdr_fmt)?;
    ws.merge_range(h_row0, 4, h_row2, 4, "Bed Level (CBL)", &tbl_hdr_fmt)?;
    ws.merge_range(h_row0, 5, h_row2, 5, "Total Cut Depth (m)", &tbl_hdr_fmt)?;

    // Dynamic Tier Headers
    for t in 0..max_tiers {
        let base_c = 6 + (t as u16 * tier_cols_count);
        let tier_name = if t == 0 {
            "TRAPEZOID 1: CANAL PRISM (CBL to TBL / Berm 1)".to_string()
        } else if t == 1 {
            "TRAPEZOID 2: BENCH TIER (Berm 1 to Berm 2 / GL)".to_string()
        } else {
            format!("TRAPEZOID {}: DEEP BENCH TIER", t + 1)
        };

        // Top Tier Banner
        ws.merge_range(h_row0, base_c, h_row0, base_c + tier_cols_count - 1, &tier_name, &tier_hdr_fmt)?;

        // Strata Banners (Hard Rock, F&F Rock, HDR, All Soils)
        let strata_names = ["Hard Rock", "F&F Rock", "HDR", "All Soils"];
        for (s_idx, s_name) in strata_names.iter().enumerate() {
            let sc = base_c + (s_idx as u16 * 4);
            ws.merge_range(h_row1, sc, h_row1, sc + 3, *s_name, &sub_hdr_fmt)?;
            ws.write_string_with_format(h_row2, sc, "Top W", &sub_hdr_fmt)?;
            ws.write_string_with_format(h_row2, sc + 1, "Bot W", &sub_hdr_fmt)?;
            ws.write_string_with_format(h_row2, sc + 2, "Depth", &sub_hdr_fmt)?;
            ws.write_string_with_format(h_row2, sc + 3, "Area", &sub_hdr_fmt)?;
        }

        ws.merge_range(h_row1, base_c + 16, h_row2, base_c + 16, "Tier Area", &tbl_hdr_fmt)?;
        ws.merge_range(h_row1, base_c + 17, h_row2, base_c + 17, "Shelf (m)", &tbl_hdr_fmt)?;
    }

    // Summary Headers at end
    ws.merge_range(h_row0, summary_base_col, h_row2, summary_base_col, "Total Area (m²)", &tbl_hdr_fmt)?;
    ws.merge_range(h_row0, summary_base_col + 1, h_row2, summary_base_col + 1, "Mean Area (m²)", &tbl_hdr_fmt)?;
    ws.merge_range(h_row0, summary_base_col + 2, h_row2, summary_base_col + 2, "Total Volume (m³)", &tbl_hdr_fmt)?;
    ws.merge_range(h_row0, summary_base_col + 3, h_row1, summary_base_col + 6, "Excavation Strata Classification (m³)", &tbl_hdr_fmt)?;
    ws.write_string_with_format(h_row2, summary_base_col + 3, "Soil", &sub_hdr_fmt)?;
    ws.write_string_with_format(h_row2, summary_base_col + 4, "HDR", &sub_hdr_fmt)?;
    ws.write_string_with_format(h_row2, summary_base_col + 5, "F&F", &sub_hdr_fmt)?;
    ws.write_string_with_format(h_row2, summary_base_col + 6, "HR", &sub_hdr_fmt)?;

    ws.set_row_height(h_row0, 22.0)?;
    ws.set_row_height(h_row1, 20.0)?;
    ws.set_row_height(h_row2, 20.0)?;
    row += 3;

    // 5. Data Rows Grouped by Reach
    let section_start_row = row + 1;
    let mut sno = 1;

    for reach in &calc.reaches {
        ws.merge_range(
            row, 0, row, total_cols.saturating_sub(1),
            &format!("=== {} (Ch {:.1} m to Ch {:.1} m | Length: {:.1} m) ===", reach.reach_name, reach.from_chainage, reach.to_chainage, reach.length_m),
            &reach_band_fmt,
        )?;
        ws.set_row_height(row, 19.0)?;
        row += 1;

        for &sec_idx in &reach.section_indices {
            let sec = &calc.sections[sec_idx];
            let excel_r = row + 1; // 1-indexed Excel row

            ws.write_number_with_format(row, 0, sno as f64, &cell_center)?;
            ws.write_number_with_format(row, 1, sec.chainage, &cell_num2)?;

            if sno == 1 {
                ws.write_number_with_format(row, 2, 0.0, &cell_num2)?;
            } else {
                write_fml(ws, row, 2, &format!("=(B{}-B{})", excel_r, excel_r - 1), &cell_num2)?;
            }

            ws.write_number_with_format(row, 3, sec.ground_level, &cell_num2)?;
            ws.write_number_with_format(row, 4, sec.bed_level, &cell_num2)?;
            write_fml(ws, row, 5, &format!("=MAX(0, D{}-E{})", excel_r, excel_r), &cell_num2)?;

            // Write each Trapezoid Tier
            for t in 0..max_tiers {
                let base_c = 6 + (t as u16 * tier_cols_count);
                if let Some(tier) = sec.tiers.get(t) {
                    let strata_order = ["Hard Rock", "F&F Rock", "HDR", "All Soils"];
                    for (s_idx, s_name) in strata_order.iter().enumerate() {
                        let sc = base_c + (s_idx as u16 * 4);
                        if let Some(slice) = tier.strata_slices.iter().find(|s| s.stratum_name == *s_name) {
                            ws.write_number_with_format(row, sc, slice.top_width, &cell_num2)?;
                            ws.write_number_with_format(row, sc + 1, slice.bottom_width, &cell_num2)?;
                            ws.write_number_with_format(row, sc + 2, slice.depth, &cell_num3)?;
                            ws.write_number_with_format(row, sc + 3, slice.area, &cell_num3)?;
                        } else {
                            ws.write_number_with_format(row, sc, 0.0, &cell_num2)?;
                            ws.write_number_with_format(row, sc + 1, 0.0, &cell_num2)?;
                            ws.write_number_with_format(row, sc + 2, 0.0, &cell_num3)?;
                            ws.write_number_with_format(row, sc + 3, 0.0, &cell_num3)?;
                        }
                    }

                    ws.write_number_with_format(row, base_c + 16, tier.total_tier_area, &cell_num3)?;
                    ws.write_number_with_format(row, base_c + 17, tier.left_shelf_width, &cell_num2)?;
                } else {
                    for offset in 0..tier_cols_count {
                        ws.write_number_with_format(row, base_c + offset, 0.0, &cell_num2)?;
                    }
                }
            }

            // Summary Columns at end
            let total_area_c = summary_base_col;
            let mean_area_c = summary_base_col + 1;
            let vol_c = summary_base_col + 2;

            // Total Area formula: sum of Tier Areas across all tiers
            let mut tier_area_cells = Vec::new();
            for t in 0..max_tiers {
                let tier_area_col_num = 6 + (t as u16 * tier_cols_count) + 16;
                let col_letter = openpyxl_col_letter(tier_area_col_num + 1);
                tier_area_cells.push(format!("{}{}", col_letter, excel_r));
            }
            write_fml(ws, row, total_area_c, &format!("=SUM({})", tier_area_cells.join(",")), &cell_num3)?;

            let total_area_letter = openpyxl_col_letter(total_area_c + 1);
            let mean_area_letter = openpyxl_col_letter(mean_area_c + 1);
            let vol_letter = openpyxl_col_letter(vol_c + 1);

            if sno == 1 {
                write_fml(ws, row, mean_area_c, &format!("={}{}", total_area_letter, excel_r), &cell_num3)?;
                ws.write_number_with_format(row, vol_c, 0.0, &cell_num2)?;
                ws.write_number_with_format(row, vol_c + 1, 0.0, &cell_num2)?;
                ws.write_number_with_format(row, vol_c + 2, 0.0, &cell_num2)?;
                ws.write_number_with_format(row, vol_c + 3, 0.0, &cell_num2)?;
                ws.write_number_with_format(row, vol_c + 4, 0.0, &cell_num2)?;
            } else {
                write_fml(
                    ws, row, mean_area_c,
                    &format!("=({}{}+{}{})/2", total_area_letter, excel_r - 1, total_area_letter, excel_r),
                    &cell_num3,
                )?;
                write_fml(
                    ws, row, vol_c,
                    &format!("=({}{}*C{})", mean_area_letter, excel_r, excel_r),
                    &cell_num2,
                )?;

                let soil_ratio = (sec.strata_areas.soil_area / sec.total_cut_area.max(1e-6)).clamp(0.0, 1.0);
                let hdr_ratio = (sec.strata_areas.hdr_area / sec.total_cut_area.max(1e-6)).clamp(0.0, 1.0);
                let ff_ratio = (sec.strata_areas.ff_area / sec.total_cut_area.max(1e-6)).clamp(0.0, 1.0);
                let hr_ratio = (sec.strata_areas.hr_area / sec.total_cut_area.max(1e-6)).clamp(0.0, 1.0);

                write_fml(ws, row, vol_c + 1, &format!("=({}{}*{:.4})", vol_letter, excel_r, soil_ratio), &cell_num2)?;
                write_fml(ws, row, vol_c + 2, &format!("=({}{}*{:.4})", vol_letter, excel_r, hdr_ratio), &cell_num2)?;
                write_fml(ws, row, vol_c + 3, &format!("=({}{}*{:.4})", vol_letter, excel_r, ff_ratio), &cell_num2)?;
                write_fml(ws, row, vol_c + 4, &format!("=({}{}*{:.4})", vol_letter, excel_r, hr_ratio), &cell_num2)?;
            }

            sno += 1;
            row += 1;
        }
    }
    let section_end_row = row;

    // Grand Totals Row
    ws.merge_range(row, 0, row, summary_base_col + 1, "GRAND TOTAL CANAL EXCAVATION VOLUME", &total_fmt)?;
    let vol_letter = openpyxl_col_letter(vol_c_pos(summary_base_col));
    let s_letter = openpyxl_col_letter(vol_c_pos(summary_base_col) + 1);
    let h_letter = openpyxl_col_letter(vol_c_pos(summary_base_col) + 2);
    let f_letter = openpyxl_col_letter(vol_c_pos(summary_base_col) + 3);
    let r_letter = openpyxl_col_letter(vol_c_pos(summary_base_col) + 4);

    write_fml(ws, row, summary_base_col + 2, &format!("=SUM({}{}:{}{})", vol_letter, section_start_row, vol_letter, section_end_row), &total_fmt)?;
    write_fml(ws, row, summary_base_col + 3, &format!("=SUM({}{}:{}{})", s_letter, section_start_row, s_letter, section_end_row), &total_fmt)?;
    write_fml(ws, row, summary_base_col + 4, &format!("=SUM({}{}:{}{})", h_letter, section_start_row, h_letter, section_end_row), &total_fmt)?;
    write_fml(ws, row, summary_base_col + 5, &format!("=SUM({}{}:{}{})", f_letter, section_start_row, f_letter, section_end_row), &total_fmt)?;
    write_fml(ws, row, summary_base_col + 6, &format!("=SUM({}{}:{}{})", r_letter, section_start_row, r_letter, section_end_row), &total_fmt)?;
    ws.set_row_height(row, 24.0)?;

    workbook.save_to_buffer()
}

fn vol_c_pos(summary_base_col: u16) -> u16 {
    summary_base_col + 3
}

/// Convert 1-based column index to Excel column string (e.g. 1 -> "A", 27 -> "AA")
fn openpyxl_col_letter(mut col: u16) -> String {
    let mut s = String::new();
    while col > 0 {
        let rem = ((col - 1) % 26) as u8;
        s.push((b'A' + rem) as char);
        col = (col - 1) / 26;
    }
    s.chars().rev().collect()
}
