use super::models::*;
use base64::Engine;
use rust_xlsxwriter::{
    Color, Format, FormatAlign, FormatBorder, FormatUnderline, Image, XlsxError,
};
use std::sync::atomic::{AtomicU64, Ordering};

// ============================================================================
// Component statement workbook. Ports the Typst component algorithm
// (buildComponentRenderData): "Abstract" sheet with the same rows (direct
// items plus S-prefixed sub-component roll-ups), then the stacked
// "Detailed_<name>" sheet (or legacy per-item sheets). Rate-analysis lines
// are not repeated.
// ============================================================================

fn grid_rgb(raw: &Option<String>, fallback: u32) -> Color {
    match raw {
        Some(text) => u32::from_str_radix(text, 16)
            .map(Color::RGB)
            .unwrap_or(Color::RGB(fallback)),
        None => Color::RGB(fallback),
    }
}

fn grid_border_style(raw: &Option<String>) -> Option<FormatBorder> {
    // Tokens from detailGrid mapBorderSide, which follows the installed
    // Univer BorderStyleTypes 1:1 (1 THIN .. 13 THICK).
    match raw.as_deref() {
        Some("thin") => Some(FormatBorder::Thin),
        Some("hair") => Some(FormatBorder::Hair),
        Some("dotted") => Some(FormatBorder::Dotted),
        Some("dashed") => Some(FormatBorder::Dashed),
        Some("dashDot") => Some(FormatBorder::DashDot),
        Some("dashDotDot") => Some(FormatBorder::DashDotDot),
        Some("double") => Some(FormatBorder::Double),
        Some("medium") => Some(FormatBorder::Medium),
        Some("mediumDashed") => Some(FormatBorder::MediumDashed),
        Some("mediumDashDot") => Some(FormatBorder::MediumDashDot),
        Some("mediumDashDotDot") => Some(FormatBorder::MediumDashDotDot),
        Some("slantDashDot") => Some(FormatBorder::SlantDashDot),
        Some("thick") => Some(FormatBorder::Thick),
        _ => None,
    }
}

/// Cell format from a grid font spec. `base_size` applies when the spec omits one;
/// callers pass 11.0 (Univer DEFAULT_STYLES: Arial 11).
fn grid_format(spec: &GridFontPayload, base_size: f64) -> Format {
    let mut fmt = Format::new()
        .set_font_name(spec.font_name.as_deref().unwrap_or("Arial"))
        .set_font_size(spec.size.unwrap_or(base_size));
    if spec.bold.unwrap_or(false) {
        fmt = fmt.set_bold();
    }
    if spec.italic.unwrap_or(false) {
        fmt = fmt.set_italic();
    }
    if spec.underline.unwrap_or(false) {
        fmt = fmt.set_underline(FormatUnderline::Single);
    }
    if spec.strike.unwrap_or(false) {
        fmt = fmt.set_font_strikethrough();
    }
    if spec.color.is_some() {
        fmt = fmt.set_font_color(grid_rgb(&spec.color, 0x1F2933));
    }
    if spec.bg.is_some() {
        fmt = fmt.set_background_color(grid_rgb(&spec.bg, 0xFFFFFF));
    }
    match spec.align.as_deref() {
        Some("center") => {
            fmt = fmt.set_align(FormatAlign::Center);
        }
        Some("right") => {
            fmt = fmt.set_align(FormatAlign::Right);
        }
        Some("left") => {
            fmt = fmt.set_align(FormatAlign::Left);
        }
        Some("justify") => {
            fmt = fmt.set_align(FormatAlign::Justify);
        }
        _ => {}
    }
    // Univer vt only: TOP (1), MIDDLE (2), BOTTOM (3). Unspecified stays at
    // the Excel default — never forced to vertical centre.
    match spec.valign.as_deref() {
        Some("top") => {
            fmt = fmt.set_align(FormatAlign::Top);
        }
        Some("middle") => {
            fmt = fmt.set_align(FormatAlign::VerticalCenter);
        }
        Some("bottom") => {
            fmt = fmt.set_align(FormatAlign::Bottom);
        }
        _ => {}
    }
    if spec.wrap.unwrap_or(false) {
        fmt = fmt.set_text_wrap();
    }
    // Writer-level stacked text (Excel 255) wins over an angle; the Univer
    // mapping never sends it — tr.v === 1 arrives as rotation -90, matching
    // Univer's canvas-rotated continuous string. Angles clamp to Excel's range.
    if spec.vertical_text.unwrap_or(false) {
        fmt = fmt.set_rotation(270);
    } else if let Some(angle) = spec.rotation {
        fmt = fmt.set_rotation(angle.clamp(-90, 90));
    }
    // Univer td only: 1 = left-to-right, 2 = right-to-left. Unspecified keeps
    // Excel's context-dependent default.
    match spec.reading_order {
        Some(1) => {
            fmt = fmt.set_reading_direction(1);
        }
        Some(2) => {
            fmt = fmt.set_reading_direction(2);
        }
        _ => {}
    }
    fmt
}

fn grid_apply_border(mut fmt: Format, border: &Option<GridBorderPayload>) -> Format {
    let Some(sides) = border else {
        return fmt;
    };
    if let Some(style) = sides.top.as_ref().and_then(|s| grid_border_style(&s.style)) {
        fmt = fmt.set_border_top(style);
    }
    if let Some(style) = sides
        .left
        .as_ref()
        .and_then(|s| grid_border_style(&s.style))
    {
        fmt = fmt.set_border_left(style);
    }
    if let Some(style) = sides
        .bottom
        .as_ref()
        .and_then(|s| grid_border_style(&s.style))
    {
        fmt = fmt.set_border_bottom(style);
    }
    if let Some(style) = sides
        .right
        .as_ref()
        .and_then(|s| grid_border_style(&s.style))
    {
        fmt = fmt.set_border_right(style);
    }
    fmt
}

/// Row height a wrapped text needs: one line per explicit newline plus
/// wrap overflow at roughly one char per width unit, times a line height
/// derived from the font size. Only ever grows past `floor` — Excel has no
/// autofit API, so this estimates it. Formula results are unknowable here
/// and stay at their floor.
/// Row height for a wrapped-text row: grows past `floor` so long
/// descriptions are never clipped, never shrinks below it. Use this for
/// wrapped rows in the hand-built writers (cover, component abstract, DATA).
/// Detail grids (`write_detail_grid`) instead keep their read heights as-is
/// for a faithful conversion.
pub(crate) fn wrap_text_height(text: &str, width_chars: f64, size_pt: f64, floor: f64) -> f64 {
    if text.trim().is_empty() {
        return floor;
    }
    let capacity = width_chars.max(6.0);
    let mut lines = 0u32;
    for part in text.split('\n') {
        let len = part.chars().count() as f64;
        lines += ((len / capacity).ceil() as u32).max(1);
    }
    (lines as f64 * size_pt.max(8.0) * 1.3).max(floor)
}

fn grid_write_value(
    ws: &mut rust_xlsxwriter::Worksheet,
    cell: &GridCellPayload,
    fmt: &Format,
) -> Result<(), XlsxError> {
    if let Some(formula) = cell.formula.as_deref() {
        ws.write_formula_with_format(cell.r, cell.c as u16, formula, fmt)?;
        return Ok(());
    }
    if !cell.runs.is_empty() {
        let default_fmt = Format::default();
        let formatted_runs: Vec<(Format, String)> = cell
            .runs
            .iter()
            .filter(|r| !r.text.is_empty())
            .map(|r| {
                if r.style.bold == Some(true)
                    || r.style.italic == Some(true)
                    || r.style.underline == Some(true)
                    || r.style.strike == Some(true)
                    || r.style.size.is_some()
                    || r.style.font_name.is_some()
                    || r.style.color.is_some()
                    || r.style.bg.is_some()
                {
                    (grid_format(&r.style, 11.0), r.text.clone())
                } else {
                    (default_fmt.clone(), r.text.clone())
                }
            })
            .collect();

        if !formatted_runs.is_empty() {
            let segments: Vec<(&Format, &str)> = formatted_runs
                .iter()
                .map(|(f, t)| (f, t.as_str()))
                .collect();
            ws.write_rich_string_with_format(cell.r, cell.c as u16, &segments, fmt)?;
            return Ok(());
        }
    }
    match cell.value.as_ref() {
        Some(serde_json::Value::Number(n)) => {
            if let Some(f) = n.as_f64() {
                ws.write_number_with_format(cell.r, cell.c as u16, f, fmt)?;
            }
        }
        Some(serde_json::Value::Bool(b)) => {
            ws.write_boolean(cell.r, cell.c as u16, *b)?;
        }
        Some(serde_json::Value::String(s)) => {
            ws.write_string_with_format(cell.r, cell.c as u16, s, fmt)?;
        }
        _ => {
            ws.write_blank(cell.r, cell.c as u16, fmt)?;
        }
    }
    Ok(())
}

fn grid_image_ext(mime: &str) -> Option<&'static str> {
    match mime {
        "image/png" => Some("png"),
        "image/jpeg" | "image/jpg" => Some("jpg"),
        "image/gif" => Some("gif"),
        "image/bmp" => Some("bmp"),
        _ => None,
    }
}

/// Render one estimator detail grid onto its own worksheet.
pub(crate) fn write_detail_grid(
    ws: &mut rust_xlsxwriter::Worksheet,
    grid: &DetailGridPayload,
    image_dir: &std::path::Path,
    image_counter: &AtomicU64,
) -> Result<(), XlsxError> {
    // Omitted setup retains the historical A4 house default. Standalone
    // drivers can pass the same resolved paper/margins used by Typst.
    let setup = grid.page_setup.as_ref();
    let paper_size = match setup.map(|s| s.paper_size.as_str()) {
        Some("A2") => 66,
        Some("A3") => 8,
        Some("Letter") => 1,
        Some("Legal") => 5,
        _ => 9, // A4
    };
    ws.set_paper_size(paper_size);
    if let Some(margins) = setup.and_then(|s| s.margins_mm.as_ref()) {
        let inch = |mm: f64, fallback: f64| if mm > 0.0 { mm / 25.4 } else { fallback };
        ws.set_margins(
            inch(margins.left, 0.7874),
            inch(margins.right, 0.3937),
            inch(margins.top, 0.3937),
            inch(margins.bottom, 0.3937),
            0.1968,
            0.1968,
        );
    } else {
        ws.set_margins(0.7874, 0.3937, 0.3937, 0.3937, 0.1968, 0.1968);
    }
    ws.set_print_center_horizontally(true);
    ws.set_header("&R&8&\"Calibri\"Generated by E-Estimate");
    ws.set_footer("&R&8&\"Calibri\"Page &P of &N");
    // Grid rows are 0-based "break after r"; Excel breaks above 1-based rows.
    let mut breaks: Vec<u32> = grid
        .row_breaks
        .iter()
        .map(|r| r.saturating_add(2))
        .collect();
    breaks.sort_unstable();
    breaks.dedup();
    if !breaks.is_empty() {
        ws.set_page_breaks(&breaks)?;
    }
    // Column widths: prefer exact source pixels (set_column_width_pixels,
    // no char conversion) when the grid carries them; otherwise the chars
    // fallback with no minimum floor (capped at Excel's 255-char limit).
    // Zero stays hidden on both lanes.
    if let Some(px) = grid.col_widths_px.as_ref() {
        for (i, w) in px.iter().enumerate() {
            let pixels = w.max(0.0).min(1785.0) as u32;
            ws.set_column_width_pixels(i as u16, pixels)?;
        }
    } else {
        for (i, w) in grid.col_widths.iter().enumerate() {
            ws.set_column_width(
                i as u16,
                if *w <= 0.0 {
                    0.0
                } else {
                    w.min(255.0)
                },
            )?;
        }
    }
    for (i, h) in grid.row_heights.iter().enumerate() {
        if let Some(px) = h {
            // Zero height = hidden row; null stays the Excel default.
            ws.set_row_height(i as u32, px.max(0.0))?;
        }
    }
    // Merges go FIRST with a blank value: merge_range overwrites its origin
    // cell, so merging after the writes wipes merged titles/descriptions.
    // All grid values sit at merge origins or on unmerged cells (the
    // renderer skips covered non-origins), and writing to a merge origin
    // keeps the merge — same order as the lead writer uses.
    for m in &grid.merges {
        ws.merge_range(m.r1, m.c1 as u16, m.r2, m.c2 as u16, "", &Format::new())?;
    }
    for cell in &grid.cells {
        let mut fmt = grid_format(&cell.style, 11.0);
        if let Some(pattern) = cell.num_fmt.as_deref() {
            if !pattern.trim().is_empty() {
                fmt = fmt.set_num_format(pattern);
            }
        }
        fmt = grid_apply_border(fmt, &cell.border);
        grid_write_value(ws, cell, &fmt)?;
    }
    // Row heights stay as read: the grid carries the estimator's explicit
    // heights (hidden rows are 0, the rest convert px to pt in the renderer),
    // and null keeps the Excel default. No auto-growth — a faithful
    // conversion never invents heights the source never had.
    for img in &grid.images {
        let ext = grid_image_ext(&img.mime).ok_or_else(|| {
            XlsxError::CustomError(format!("unsupported detail image mime: {}", img.mime))
        })?;
        if img.scale_w.partial_cmp(&0.0) != Some(std::cmp::Ordering::Greater)
            || img.scale_h.partial_cmp(&0.0) != Some(std::cmp::Ordering::Greater)
        {
            return Err(XlsxError::CustomError(format!(
                "detail image at {},{} has a non-positive scale",
                img.r, img.c
            )));
        }
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(img.data.trim())
            .map_err(|e| XlsxError::CustomError(format!("detail image decode failed: {e}")))?;
        if bytes.is_empty() {
            return Err(XlsxError::CustomError(format!(
                "detail image at {},{} is empty",
                img.r, img.c
            )));
        }
        let n = image_counter.fetch_add(1, Ordering::Relaxed);
        let path = image_dir.join(format!("detail-img-{n}.{ext}"));
        std::fs::write(&path, &bytes)
            .map_err(|e| XlsxError::CustomError(format!("detail image write failed: {e}")))?;
        let image = Image::new(&path)
            .map_err(|e| XlsxError::CustomError(format!("detail image load failed: {e:?}")))?
            .set_scale_width(img.scale_w.clamp(0.05, 8.0))
            .set_scale_height(img.scale_h.clamp(0.05, 8.0));
        ws.insert_image(img.r, img.c as u16, &image)?;
    }
    if !grid.cells.is_empty() {
        let max_r = grid.cells.iter().map(|c| c.r).max().unwrap_or(0);
        let max_c = grid.cells.iter().map(|c| c.c).max().unwrap_or(0);
        ws.set_print_area(0, 0, max_r, max_c as u16)?;
    }
    Ok(())
}

/// Excel sheet names: at most 31 chars; duplicates get a numeric suffix.
pub(crate) fn unique_grid_sheet_name(
    taken: &mut std::collections::HashSet<String>,
    raw: &str,
) -> String {
    let base: String = raw
        .chars()
        .filter(|c| !matches!(c, '[' | ']' | ':' | '*' | '?' | '/' | '\\'))
        .collect::<String>()
        .trim()
        .chars()
        .take(31)
        .collect();
    let base = if base.is_empty() {
        "Sheet".to_string()
    } else {
        base
    };
    if taken.insert(base.clone()) {
        return base;
    }
    let mut n = 2u32;
    loop {
        let suffix = format!("_{n}");
        let stem: String = base.chars().take(31 - suffix.len()).collect();
        let name = format!("{stem}{suffix}");
        if taken.insert(name.clone()) {
            return name;
        }
        n += 1;
    }
}
