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

pub fn generate_canal_embankment_excel_bytes(
    input: &CanalEmbankmentInput,
    calc: &CanalEmbankmentCalculationResponse,
) -> Result<Vec<u8>, XlsxError> {
    let mut workbook = Workbook::new();

    // Color Palette
    let ink = Color::RGB(0x0F172A);
    let header_bg = Color::RGB(0x1E3A5F);
    let subheader_bg = Color::RGB(0x334E68);
    let bank_bg = Color::RGB(0x2A4365);
    let reach_bg = Color::RGB(0xF1F5F9);
    let total_bg = Color::RGB(0xE2E8F0);
    let white = Color::RGB(0xFFFFFF);
    let border_color = Color::RGB(0xCBD5E1);
    let cut_flag_bg = Color::RGB(0xFEF2F2);
    let cut_flag_ink = Color::RGB(0x991B1B);

    // Formats
    let title_fmt = Format::new()
        .set_font_name("Segoe UI")
        .set_font_size(13)
        .set_bold()
        .set_font_color(ink)
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter);

    let subtitle_fmt = Format::new()
        .set_font_name("Segoe UI")
        .set_font_size(10)
        .set_bold()
        .set_font_color(Color::RGB(0x475569))
        .set_align(FormatAlign::Center);

    let param_label_fmt = Format::new()
        .set_font_name("Segoe UI")
        .set_font_size(9)
        .set_bold()
        .set_font_color(ink)
        .set_background_color(reach_bg)
        .set_border(FormatBorder::Thin)
        .set_border_color(border_color);

    let param_val_fmt = Format::new()
        .set_font_name("Segoe UI")
        .set_font_size(9)
        .set_font_color(ink)
        .set_border(FormatBorder::Thin)
        .set_border_color(border_color)
        .set_align(FormatAlign::Right)
        .set_num_format("0.00");

    let tbl_hdr_fmt = Format::new()
        .set_font_name("Segoe UI")
        .set_font_size(9)
        .set_bold()
        .set_font_color(white)
        .set_background_color(header_bg)
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter)
        .set_text_wrap()
        .set_border(FormatBorder::Thin)
        .set_border_color(border_color);

    let bank_hdr_fmt = Format::new()
        .set_font_name("Segoe UI")
        .set_font_size(9)
        .set_bold()
        .set_font_color(white)
        .set_background_color(bank_bg)
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

    let cell_center = Format::new()
        .set_font_name("Segoe UI")
        .set_font_size(9)
        .set_align(FormatAlign::Center)
        .set_border(FormatBorder::Thin)
        .set_border_color(border_color);

    let cell_left = Format::new()
        .set_font_name("Segoe UI")
        .set_font_size(9)
        .set_align(FormatAlign::Left)
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

    let cut_cell_center = Format::new()
        .set_font_name("Segoe UI")
        .set_font_size(9)
        .set_font_color(cut_flag_ink)
        .set_background_color(cut_flag_bg)
        .set_align(FormatAlign::Center)
        .set_border(FormatBorder::Thin)
        .set_border_color(border_color);

    let total_lbl_fmt = Format::new()
        .set_font_name("Segoe UI")
        .set_font_size(9)
        .set_bold()
        .set_font_color(ink)
        .set_background_color(total_bg)
        .set_border(FormatBorder::Thin)
        .set_border_color(border_color)
        .set_align(FormatAlign::Center);

    let total_val_fmt = Format::new()
        .set_font_name("Segoe UI")
        .set_font_size(9)
        .set_bold()
        .set_font_color(Color::RGB(0x1E3A8A))
        .set_background_color(total_bg)
        .set_border(FormatBorder::Thin)
        .set_border_color(border_color)
        .set_align(FormatAlign::Right)
        .set_num_format("#,##0.00");

    // =========================================================================
    // SHEET 1: ABSTRACT OF REACHES
    // =========================================================================
    let ws_reaches = workbook.add_worksheet();
    ws_reaches.set_name("Abstract of Reaches")?;

    ws_reaches.merge_range(0, 0, 0, 10, "CANAL FORMATION OF EMBANKMENT - ABSTRACT OF REACHES", &title_fmt)?;
    ws_reaches.merge_range(1, 0, 1, 10, "Department of Irrigation & Public Works · Programmatic Reach Aggregation", &subtitle_fmt)?;

    // Parameters
    ws_reaches.write_string_with_format(2, 0, "Bed Width (m)", &param_label_fmt)?;
    ws_reaches.write_number_with_format(2, 1, input.bed_width, &param_val_fmt)?;
    ws_reaches.write_string_with_format(2, 2, "Full Supply Depth (m)", &param_label_fmt)?;
    ws_reaches.write_number_with_format(2, 3, input.full_supply_depth, &param_val_fmt)?;
    ws_reaches.write_string_with_format(2, 4, "Free Board (m)", &param_label_fmt)?;
    ws_reaches.write_number_with_format(2, 5, input.free_board, &param_val_fmt)?;
    ws_reaches.write_string_with_format(2, 6, "Stripping Depth (m)", &param_label_fmt)?;
    ws_reaches.write_number_with_format(2, 7, input.stripping_depth, &param_val_fmt)?;

    // Headers
    let r_hdrs = [
        "Reach No.",
        "From Chainage (m)",
        "To Chainage (m)",
        "Length (m)",
        "Bund Profile / Tier",
        "Sections",
        "Left Bank Vol (cu.m)",
        "Right Bank Vol (cu.m)",
        "Stripping Vol (cu.m)",
        "Total Bank Vol (cu.m)",
        "Status / Remarks",
    ];

    for (c, h) in r_hdrs.iter().enumerate() {
        ws_reaches.write_string_with_format(4, c as u16, *h, &tbl_hdr_fmt)?;
    }

    ws_reaches.set_column_width(0, 10)?;
    ws_reaches.set_column_width(1, 18)?;
    ws_reaches.set_column_width(2, 18)?;
    ws_reaches.set_column_width(3, 14)?;
    ws_reaches.set_column_width(4, 25)?;
    ws_reaches.set_column_width(5, 11)?;
    ws_reaches.set_column_width(6, 18)?;
    ws_reaches.set_column_width(7, 18)?;
    ws_reaches.set_column_width(8, 18)?;
    ws_reaches.set_column_width(9, 20)?;
    ws_reaches.set_column_width(10, 24)?;

    let reach_start_r = 5u32;
    for (idx, rch) in calc.reaches.iter().enumerate() {
        let r = reach_start_r + idx as u32;
        ws_reaches.write_number_with_format(r, 0, rch.reach_index as f64, &cell_center)?;
        ws_reaches.write_number_with_format(r, 1, rch.from_chainage, &cell_num2)?;
        ws_reaches.write_number_with_format(r, 2, rch.to_chainage, &cell_num2)?;
        ws_reaches.write_number_with_format(r, 3, rch.length, &cell_num2)?;
        ws_reaches.write_string_with_format(r, 4, &rch.tier_name, &cell_left)?;
        ws_reaches.write_number_with_format(r, 5, rch.section_count as f64, &cell_center)?;
        ws_reaches.write_number_with_format(r, 6, rch.left_volume, &cell_num2)?;
        ws_reaches.write_number_with_format(r, 7, rch.right_volume, &cell_num2)?;
        ws_reaches.write_number_with_format(r, 8, rch.stripping_volume, &cell_num2)?;
        ws_reaches.write_number_with_format(r, 9, rch.total_bank_volume, &cell_num2)?;

        if rch.is_pure_cut {
            ws_reaches.write_string_with_format(r, 10, "Cutting Reach (0 Bank)", &cut_cell_center)?;
        } else {
            ws_reaches.write_string_with_format(r, 10, "Active Formation", &cell_center)?;
        }
    }

    let reach_total_r = reach_start_r + calc.reaches.len() as u32;
    let r_first_xl = reach_start_r + 1;
    let r_last_xl = reach_total_r;

    ws_reaches.merge_range(reach_total_r, 0, reach_total_r, 2, "GRAND TOTAL", &total_lbl_fmt)?;
    if !calc.reaches.is_empty() {
        write_fml(ws_reaches, reach_total_r, 3, &format!("=SUM(D{r_first_xl}:D{r_last_xl})"), &total_val_fmt)?;
        ws_reaches.write_string_with_format(reach_total_r, 4, "-", &total_lbl_fmt)?;
        ws_reaches.write_string_with_format(reach_total_r, 5, "-", &total_lbl_fmt)?;
        write_fml(ws_reaches, reach_total_r, 6, &format!("=SUM(G{r_first_xl}:G{r_last_xl})"), &total_val_fmt)?;
        write_fml(ws_reaches, reach_total_r, 7, &format!("=SUM(H{r_first_xl}:H{r_last_xl})"), &total_val_fmt)?;
        write_fml(ws_reaches, reach_total_r, 8, &format!("=SUM(I{r_first_xl}:I{r_last_xl})"), &total_val_fmt)?;
        write_fml(ws_reaches, reach_total_r, 9, &format!("=SUM(J{r_first_xl}:J{r_last_xl})"), &total_val_fmt)?;
        ws_reaches.write_string_with_format(reach_total_r, 10, "-", &total_lbl_fmt)?;
    }

    // =========================================================================
    // SHEET 2: DETAILED SECTION-BY-SECTION MEASUREMENTS
    // =========================================================================
    let ws = workbook.add_worksheet();
    ws.set_name("Detailed Measurements")?;

    // Title Row
    ws.merge_range(0, 0, 0, 19, "STATEMENT SHOWING THE FORMATION OF EMBANKMENT OF MAIN CANAL", &title_fmt)?;
    ws.merge_range(1, 0, 1, 19, "Department of Irrigation & Public Works · Native Rust Calculation Engine", &subtitle_fmt)?;

    // Parameters Row (Row 2 & 3: Excel rows 3 & 4)
    ws.write_string_with_format(2, 1, "Bed Width (m)", &param_label_fmt)?;
    ws.write_number_with_format(2, 2, input.bed_width, &param_val_fmt)?;

    ws.write_string_with_format(2, 3, "Full Supply Depth (m)", &param_label_fmt)?;
    ws.write_number_with_format(2, 4, input.full_supply_depth, &param_val_fmt)?;

    ws.write_string_with_format(2, 5, "Free Board (m)", &param_label_fmt)?;
    ws.write_number_with_format(2, 6, input.free_board, &param_val_fmt)?;

    ws.write_string_with_format(2, 7, "Stripping Depth (m)", &param_label_fmt)?;
    ws.write_number_with_format(2, 8, input.stripping_depth, &param_val_fmt)?;

    ws.write_string_with_format(3, 1, "Left Crest (Inspection)", &param_label_fmt)?;
    ws.write_number_with_format(3, 2, input.left_bank.top_width, &param_val_fmt)?;

    ws.write_string_with_format(3, 3, "Right Crest (Service)", &param_label_fmt)?;
    ws.write_number_with_format(3, 4, input.right_bank.top_width, &param_val_fmt)?;

    ws.write_string_with_format(3, 5, "Inner Side Slope", &param_label_fmt)?;
    ws.write_number_with_format(3, 6, input.left_bank.inner_slope, &param_val_fmt)?;

    ws.write_string_with_format(3, 7, "Outer Side Slope", &param_label_fmt)?;
    ws.write_number_with_format(3, 8, input.left_bank.outer_slope, &param_val_fmt)?;

    // Table Headers (Row 5 & 6)
    ws.merge_range(5, 0, 6, 0, "Sl. No.", &tbl_hdr_fmt)?;
    ws.merge_range(5, 1, 6, 1, "Chainage\n(m)", &tbl_hdr_fmt)?;
    ws.merge_range(5, 2, 6, 2, "Length\n(m)", &tbl_hdr_fmt)?;
    ws.merge_range(5, 3, 6, 3, "A.V.G.L.\n(m)", &tbl_hdr_fmt)?;
    ws.merge_range(5, 4, 6, 4, "C.B.L.\n(m)", &tbl_hdr_fmt)?;
    ws.merge_range(5, 5, 6, 5, "T.B.L.\n(m)", &tbl_hdr_fmt)?;

    // Merged Header: TOTAL HEIGHT OF BANKING (Cols 6..=8)
    ws.merge_range(5, 6, 5, 8, "TOTAL HEIGHT OF BANKING in m.", &bank_hdr_fmt)?;
    ws.write_string_with_format(6, 6, "Net Height", &sub_hdr_fmt)?;
    ws.write_string_with_format(6, 7, "Add Stripping", &sub_hdr_fmt)?;
    ws.write_string_with_format(6, 8, "Gross Height", &sub_hdr_fmt)?;

    // Merged Header: LEFT BANK (Cols 9..=11)
    ws.merge_range(5, 9, 5, 11, "LEFT BANK (Inspection Path)", &bank_hdr_fmt)?;
    ws.write_string_with_format(6, 9, "Top Width (m)", &sub_hdr_fmt)?;
    ws.write_string_with_format(6, 10, "Bottom Width (m)", &sub_hdr_fmt)?;
    ws.write_string_with_format(6, 11, "Area (sq.m)", &sub_hdr_fmt)?;

    // Merged Header: RIGHT BANK (Cols 12..=14)
    ws.merge_range(5, 12, 5, 14, "RIGHT BANK (Service Road)", &bank_hdr_fmt)?;
    ws.write_string_with_format(6, 12, "Top Width (m)", &sub_hdr_fmt)?;
    ws.write_string_with_format(6, 13, "Bottom Width (m)", &sub_hdr_fmt)?;
    ws.write_string_with_format(6, 14, "Area (sq.m)", &sub_hdr_fmt)?;

    // Stripping & Bank Area
    ws.merge_range(5, 15, 6, 15, "Stripping Footprint\n(sq.m)", &tbl_hdr_fmt)?;
    ws.merge_range(5, 16, 6, 16, "Total Bank Area\n(sq.m)", &tbl_hdr_fmt)?;
    ws.merge_range(5, 17, 6, 17, "Embankment Vol.\n(cu.m)", &tbl_hdr_fmt)?;
    ws.merge_range(5, 18, 6, 18, "Stripping Vol.\n(cu.m)", &tbl_hdr_fmt)?;
    ws.merge_range(5, 19, 6, 19, "Bund Tier / Status", &tbl_hdr_fmt)?;

    // Set Column Widths
    ws.set_column_width(0, 8)?;   // Sl
    ws.set_column_width(1, 13)?;  // Chainage
    ws.set_column_width(2, 10)?;  // Length
    ws.set_column_width(3, 11)?;  // AVGL
    ws.set_column_width(4, 11)?;  // CBL
    ws.set_column_width(5, 11)?;  // TBL
    ws.set_column_width(6, 11)?;  // Net H
    ws.set_column_width(7, 12)?;  // Add Strip
    ws.set_column_width(8, 12)?;  // Gross H
    ws.set_column_width(9, 13)?;  // Left Top
    ws.set_column_width(10, 15)?; // Left Bot
    ws.set_column_width(11, 13)?; // Left Area
    ws.set_column_width(12, 13)?; // Right Top
    ws.set_column_width(13, 15)?; // Right Bot
    ws.set_column_width(14, 13)?; // Right Area
    ws.set_column_width(15, 16)?; // Strip Area
    ws.set_column_width(16, 16)?; // Total Bank Area
    ws.set_column_width(17, 18)?; // Bank Vol
    ws.set_column_width(18, 16)?; // Strip Vol
    ws.set_column_width(19, 22)?; // Tier / Status

    // Write Data Rows
    let start_row: u32 = 7;
    for (idx, sec) in calc.sections.iter().enumerate() {
        let r = start_row + idx as u32;
        let xl_r = r + 1; // 1-indexed Excel row

        // Sl No
        ws.write_number_with_format(r, 0, (idx + 1) as f64, &cell_center)?;

        // Chainage
        ws.write_number_with_format(r, 1, sec.chainage, &cell_num2)?;

        // Length
        if idx == 0 {
            ws.write_string_with_format(r, 2, "-", &cell_center)?;
        } else {
            let prev_xl_r = xl_r - 1;
            write_fml(ws, r, 2, &format!("=B{xl_r}-B{prev_xl_r}"), &cell_num2)?;
        }

        // AVGL
        ws.write_number_with_format(r, 3, sec.ground_level, &cell_num3)?;

        // CBL
        ws.write_number_with_format(r, 4, sec.bed_level, &cell_num3)?;

        // TBL Formula: =E{xl_r}+$E$3+$G$3 (CBL + FSD + FB)
        write_fml(ws, r, 5, &format!("=E{xl_r}+$E$3+$G$3"), &cell_num3)?;

        // Net Height: =IF(F{xl_r}>D{xl_r}, F{xl_r}-D{xl_r}, 0)
        write_fml(ws, r, 6, &format!("=IF(F{xl_r}>D{xl_r}, F{xl_r}-D{xl_r}, 0)"), &cell_num3)?;

        // Add Stripping: =IF(G{xl_r}>0, $I$3, 0)
        write_fml(ws, r, 7, &format!("=IF(G{xl_r}>0, $I$3, 0)"), &cell_num3)?;

        // Gross Height: =G{xl_r}+H{xl_r}
        write_fml(ws, r, 8, &format!("=G{xl_r}+H{xl_r}"), &cell_num3)?;

        // Left Top Width:
        ws.write_number_with_format(r, 9, sec.left_top_width, &cell_num2)?;

        // Left Bottom Width:
        ws.write_number_with_format(r, 10, sec.left_bottom_width, &cell_num2)?;

        // Left Area:
        ws.write_number_with_format(r, 11, sec.left_bank_area, &cell_num3)?;

        // Right Top Width:
        ws.write_number_with_format(r, 12, sec.right_top_width, &cell_num2)?;

        // Right Bottom Width:
        ws.write_number_with_format(r, 13, sec.right_bottom_width, &cell_num2)?;

        // Right Area:
        ws.write_number_with_format(r, 14, sec.right_bank_area, &cell_num3)?;

        // Stripping Footprint Area: =IF(I{xl_r}>0, (K{xl_r}+N{xl_r})*H{xl_r}, 0)
        write_fml(ws, r, 15, &format!("=IF(I{xl_r}>0, (K{xl_r}+N{xl_r})*H{xl_r}, 0)"), &cell_num3)?;

        // Total Bank Area: =L{xl_r}+O{xl_r}
        write_fml(ws, r, 16, &format!("=L{xl_r}+O{xl_r}"), &cell_num3)?;

        // Volumes (between previous section and current section)
        if idx == 0 {
            ws.write_number_with_format(r, 17, 0.0, &cell_num2)?;
            ws.write_number_with_format(r, 18, 0.0, &cell_num2)?;
        } else {
            let prev_xl_r = xl_r - 1;
            write_fml(ws, r, 17, &format!("=(Q{prev_xl_r}+Q{xl_r})*0.5*C{xl_r}"), &cell_num2)?;
            write_fml(ws, r, 18, &format!("=(P{prev_xl_r}+P{xl_r})*0.5*C{xl_r}"), &cell_num2)?;
        }

        // Tier / Status
        if sec.net_banking_height <= 0.001 {
            ws.write_string_with_format(r, 19, "Pure Cut (0 Bank)", &cut_cell_center)?;
        } else {
            ws.write_string_with_format(r, 19, &sec.left_tier_name, &cell_center)?;
        }
    }

    // Grand Totals Row
    let total_r = start_row + calc.sections.len() as u32;
    let first_xl_r = start_row + 1;
    let last_xl_r = total_r;

    ws.merge_range(total_r, 0, total_r, 16, "GRAND TOTALS", &total_lbl_fmt)?;

    if !calc.sections.is_empty() {
        write_fml(
            ws,
            total_r,
            17,
            &format!("=SUM(R{first_xl_r}:R{last_xl_r})"),
            &total_val_fmt,
        )?;
        write_fml(
            ws,
            total_r,
            18,
            &format!("=SUM(S{first_xl_r}:S{last_xl_r})"),
            &total_val_fmt,
        )?;
        ws.write_string_with_format(total_r, 19, "-", &total_lbl_fmt)?;
    } else {
        ws.write_number_with_format(total_r, 17, 0.0, &total_val_fmt)?;
        ws.write_number_with_format(total_r, 18, 0.0, &total_val_fmt)?;
        ws.write_string_with_format(total_r, 19, "-", &total_lbl_fmt)?;
    }

    // =========================================================================
    // SHEET 3: SOIL ALLOCATION & MASS BALANCE STATEMENT
    // =========================================================================
    let ws_soil = workbook.add_worksheet();
    ws_soil.set_name("Soil Allocation")?;

    ws_soil.merge_range(0, 0, 0, 8, "CANAL EMBANKMENT SOIL ALLOCATION & MASS BALANCE STATEMENT", &title_fmt)?;
    ws_soil.merge_range(1, 0, 1, 8, "Source Allocation: Canal Excavation Reuse vs Approved Borrow Areas", &subtitle_fmt)?;

    // Summary Cards
    let soil_alloc = &calc.soil_allocation;

    ws_soil.write_string_with_format(3, 0, "Total Embankment Fill Required (cu.m)", &param_label_fmt)?;
    ws_soil.write_number_with_format(3, 1, soil_alloc.total_fill_volume_m3, &param_val_fmt)?;

    ws_soil.write_string_with_format(3, 3, "Suitable Cut Soil Available (cu.m)", &param_label_fmt)?;
    ws_soil.write_number_with_format(3, 4, soil_alloc.suitable_cut_available_m3, &param_val_fmt)?;

    ws_soil.write_string_with_format(4, 0, "Allocated from Canal Cut (cu.m)", &param_label_fmt)?;
    ws_soil.write_number_with_format(4, 1, soil_alloc.allocated_from_cut_m3, &param_val_fmt)?;

    ws_soil.write_string_with_format(4, 3, "Allocated from Borrow Area (cu.m)", &param_label_fmt)?;
    ws_soil.write_number_with_format(4, 4, soil_alloc.allocated_from_borrow_m3, &param_val_fmt)?;

    if soil_alloc.allocated_from_dump_m3 > 0.0 {
        ws_soil.write_string_with_format(4, 6, "Allocated from Dump Area (cu.m)", &param_label_fmt)?;
        ws_soil.write_number_with_format(4, 7, soil_alloc.allocated_from_dump_m3, &param_val_fmt)?;
    }

    // Allocation Items Table
    let s_hdrs = [
        "Sl. No.",
        "Embankment Zone",
        "Material Source",
        "Share (%)",
        "Quantity (cu.m)",
        "Compaction",
        "Watering",
        "SSR Item Code",
        "Schedule of Rates Description",
    ];

    for (c, h) in s_hdrs.iter().enumerate() {
        ws_soil.write_string_with_format(6, c as u16, *h, &tbl_hdr_fmt)?;
    }

    ws_soil.set_column_width(0, 8)?;
    ws_soil.set_column_width(1, 18)?;
    ws_soil.set_column_width(2, 22)?;
    ws_soil.set_column_width(3, 12)?;
    ws_soil.set_column_width(4, 18)?;
    ws_soil.set_column_width(5, 15)?;
    ws_soil.set_column_width(6, 14)?;
    ws_soil.set_column_width(7, 18)?;
    ws_soil.set_column_width(8, 45)?;

    let soil_start_r = 7u32;
    for (idx, item) in soil_alloc.items.iter().enumerate() {
        let r = soil_start_r + idx as u32;
        ws_soil.write_number_with_format(r, 0, (idx + 1) as f64, &cell_center)?;
        ws_soil.write_string_with_format(r, 1, &item.zone, &cell_left)?;
        ws_soil.write_string_with_format(r, 2, &item.source, &cell_left)?;
        ws_soil.write_number_with_format(r, 3, item.percentage, &cell_num2)?;
        ws_soil.write_number_with_format(r, 4, item.volume_m3, &cell_num2)?;
        ws_soil.write_string_with_format(r, 5, &format!("Not less than {}%", item.compaction), &cell_center)?;
        ws_soil.write_string_with_format(r, 6, if item.watering { "Included" } else { "Excluded" }, &cell_center)?;
        ws_soil.write_string_with_format(r, 7, &item.item_code, &cell_center)?;
        ws_soil.write_string_with_format(r, 8, &item.item_description, &cell_left)?;
    }

    let soil_total_r = soil_start_r + soil_alloc.items.len() as u32;
    let s_first_xl = soil_start_r + 1;
    let s_last_xl = soil_total_r;

    ws_soil.merge_range(soil_total_r, 0, soil_total_r, 3, "TOTAL ALLOCATED VOLUME", &total_lbl_fmt)?;
    if !soil_alloc.items.is_empty() {
        write_fml(ws_soil, soil_total_r, 4, &format!("=SUM(E{s_first_xl}:E{s_last_xl})"), &total_val_fmt)?;
    } else {
        ws_soil.write_number_with_format(soil_total_r, 4, 0.0, &total_val_fmt)?;
    }
    for col in 5..=8 {
        ws_soil.write_string_with_format(soil_total_r, col, "-", &total_lbl_fmt)?;
    }

    let bytes = workbook.save_to_buffer()?;
    Ok(bytes)
}
