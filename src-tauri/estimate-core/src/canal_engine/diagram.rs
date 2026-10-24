use crate::canal_engine::models::*;

/// Generates a standalone, beautiful SVG diagram representing the full cutting cross-section.
pub fn generate_cutting_section_svg(
    input: &CanalCuttingInput,
    sec: &SectionCutResult,
) -> String {
    if sec.cut_depth <= 0.001 {
        return r##"<svg viewBox="0 0 740 360" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
            <rect width="740" height="360" fill="#0f172a" rx="8" />
            <text x="370" y="180" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="14" text-anchor="middle">
                No Excavation / Full Embankment Section (Ground is below canal bed)
            </text>
        </svg>"##.to_string();
    }

    let width = 740.0;
    let height = 440.0;
    let pad_x = 70.0;
    let pad_top = 65.0;
    let pad_bot = 60.0;

    let cbl = sec.bed_level;
    let gl = sec.ground_level;
    let bed_w = input.bed_width;
    let fsd = input.full_supply_depth;
    let fb = input.free_board;
    let tbl_h = fsd + fb;

    // Build the cross-section profile points directly from sec.tiers so that
    // the outer boundary, berm benches, and shaded strata polygons are mathematically 1:1 identical.
    let mut right_points: Vec<(f64, f64)> = Vec::new();
    right_points.push((bed_w / 2.0, cbl));

    let mut left_points: Vec<(f64, f64)> = Vec::new();
    left_points.push((-bed_w / 2.0, cbl));

    if sec.tiers.is_empty() {
        let x_gl = bed_w / 2.0 + input.side_slope * sec.cut_depth;
        right_points.push((x_gl, gl));
        left_points.push((-x_gl, gl));
    } else {
        for tier in &sec.tiers {
            for slice in &tier.strata_slices {
                if slice.depth > 0.0001 {
                    let bx = slice.bottom_width / 2.0;
                    let tx = slice.top_width / 2.0;

                    if let Some(&(last_x, last_y)) = right_points.last() {
                        if (last_x - bx).abs() > 0.001 || (last_y - slice.bottom_rl).abs() > 0.001 {
                            right_points.push((bx, slice.bottom_rl));
                        }
                    } else {
                        right_points.push((bx, slice.bottom_rl));
                    }
                    right_points.push((tx, slice.top_rl));

                    if let Some(&(last_lx, last_ly)) = left_points.last() {
                        if ((-last_lx) - bx).abs() > 0.001 || (last_ly - slice.bottom_rl).abs() > 0.001 {
                            left_points.push((-bx, slice.bottom_rl));
                        }
                    } else {
                        left_points.push((-bx, slice.bottom_rl));
                    }
                    left_points.push((-tx, slice.top_rl));
                }
            }

            // Horizontal berm shelf at the top of this tier
            if tier.right_shelf_width > 0.0001 {
                let last_x = right_points.last().map(|p| p.0).unwrap_or(bed_w / 2.0);
                right_points.push((last_x + tier.right_shelf_width, tier.top_rl));
            }
            if tier.left_shelf_width > 0.0001 {
                let last_lx = left_points.last().map(|p| p.0).unwrap_or(-bed_w / 2.0);
                left_points.push((last_lx - tier.left_shelf_width, tier.top_rl));
            }
        }
    }

    left_points.reverse();

    // Full cut profile from far left ground to far right ground
    let mut cut_profile = Vec::new();
    cut_profile.extend(left_points.clone());
    cut_profile.extend(right_points.clone());

    // Coordinate mapping with generous margins for dimension callouts and berm text
    let max_right_x = right_points.last().map(|p| p.0.abs()).unwrap_or(bed_w / 2.0 + 10.0);
    let max_left_x = left_points.first().map(|p| p.0.abs()).unwrap_or(bed_w / 2.0 + 10.0);
    let max_abs_x = max_right_x.max(max_left_x);
    let tbl_half_w = bed_w / 2.0 + input.side_slope * tbl_h;
    let effective_max_x = max_abs_x.max(tbl_half_w);
    let ground_margin_left = (effective_max_x * 0.15).max(6.0);
    let ground_margin_right = (effective_max_x * 0.35).max(18.0); // extra room for berm labels
    let min_x = -(effective_max_x + ground_margin_left);
    let max_x = effective_max_x + ground_margin_right;
    let min_rl = cbl - 0.5;
    let max_rl = gl.max(cbl + tbl_h) + 0.8;

    let span_x = (max_x - min_x).max(1.0);
    let span_rl = (max_rl - min_rl).max(1.0);

    let to_svg_x = |x: f64| -> f64 {
        pad_x + ((x - min_x) / span_x) * (width - 2.0 * pad_x)
    };

    let to_svg_y = |rl: f64| -> f64 {
        pad_top + ((max_rl - rl) / span_rl) * (height - pad_top - pad_bot)
    };

    // Build SVG polygons and paths
    let mut cut_polygon_pts = String::new();
    for &(x, rl) in &cut_profile {
        cut_polygon_pts.push_str(&format!("{:.1},{:.1} ", to_svg_x(x), to_svg_y(rl)));
    }

    // Water polygon points (Bed to FSL)
    let fsl_rl = cbl + fsd;
    let fsl_half_w = if fsd <= tbl_h {
        bed_w / 2.0 + input.side_slope * fsd
    } else {
        bed_w / 2.0 + input.side_slope * tbl_h
    };
    let water_poly_pts = format!(
        "{:.1},{:.1} {:.1},{:.1} {:.1},{:.1} {:.1},{:.1}",
        to_svg_x(-bed_w / 2.0), to_svg_y(cbl),
        to_svg_x(-fsl_half_w), to_svg_y(fsl_rl),
        to_svg_x(fsl_half_w), to_svg_y(fsl_rl),
        to_svg_x(bed_w / 2.0), to_svg_y(cbl),
    );

    // SVG String Construction
    let mut svg = String::with_capacity(8192);
    svg.push_str(&format!(
        r##"<svg viewBox="0 0 {:.0} {:.0}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style="background:#090d16; border-radius:8px; font-family:'Segoe UI',system-ui,sans-serif;">"##,
        width, height
    ));

    // Defs: Gradients, Hatches, and Markers
    svg.push_str(r##"
    <defs>
        <linearGradient id="waterGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#0284c7" stop-opacity="0.65" />
            <stop offset="100%" stop-color="#0369a1" stop-opacity="0.4" />
        </linearGradient>
        <pattern id="soilHatch" width="8" height="8" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="0" y2="8" stroke="#facc15" stroke-width="0.8" stroke-opacity="0.25" />
        </pattern>
        <pattern id="hdrHatch" width="8" height="8" patternTransform="rotate(-30 0 0)" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="0" y2="8" stroke="#fb923c" stroke-width="0.8" stroke-opacity="0.30" />
        </pattern>
        <pattern id="ffHatch" width="8" height="8" patternTransform="rotate(60 0 0)" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="0" y2="8" stroke="#c084fc" stroke-width="0.8" stroke-opacity="0.30" />
        </pattern>
        <pattern id="hrHatch" width="6" height="6" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="6" y2="6" stroke="#f87171" stroke-width="0.8" stroke-opacity="0.35" />
            <line x1="6" y1="0" x2="0" y2="6" stroke="#f87171" stroke-width="0.8" stroke-opacity="0.35" />
        </pattern>
        <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#94a3b8" />
        </marker>
        <marker id="arrowAmber" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#f59e0b" />
        </marker>
    </defs>
    "##);

    // Title & Info Box at Top Left
    let is_full_cut = sec.cut_depth >= tbl_h - 0.05;
    let cut_type_badge = if is_full_cut { "FULL CUT" } else { "PARTIAL CUT" };
    let cut_badge_color = if is_full_cut { "#059669" } else { "#d97706" };

    svg.push_str(&format!(
        r##"
        <rect x="20" y="16" width="410" height="34" rx="5" fill="#1e293b" fill-opacity="0.85" stroke="#334155" stroke-width="1" />
        <text x="32" y="38" fill="#38bdf8" font-size="13" font-weight="700">CH {:.1} m</text>
        <rect x="110" y="24" width="75" height="18" rx="3" fill="{}" />
        <text x="147" y="37" fill="#ffffff" font-size="9" font-weight="700" text-anchor="middle">{}</text>
        <text x="195" y="38" fill="#94a3b8" font-size="11.5">Cut: <tspan fill="#f59e0b" font-weight="600">{:.2}m</tspan> | Area: <tspan fill="#10b981" font-weight="600">{:.2}m²</tspan> | Berms: <tspan fill="#a855f7" font-weight="600">{}</tspan></text>
        "##,
        sec.chainage, cut_badge_color, cut_type_badge, sec.cut_depth, sec.total_cut_area, sec.active_berms.len()
    ));

    // Strata Legend Box at Top Right
    let leg_x = width - 330.0;
    svg.push_str(&format!(
        r##"
        <g transform="translate({:.0}, 16)">
            <rect x="0" y="0" width="310" height="34" rx="5" fill="#1e293b" fill-opacity="0.85" stroke="#334155" stroke-width="1" />
            <circle cx="16" cy="17" r="5" fill="#facc15" />
            <text x="26" y="21" fill="#e2e8f0" font-size="10" font-weight="600">Soil <tspan fill="#facc15">({:.1}m²)</tspan></text>
            <circle cx="92" cy="17" r="5" fill="#fb923c" />
            <text x="102" y="21" fill="#e2e8f0" font-size="10" font-weight="600">HDR <tspan fill="#fb923c">({:.1}m²)</tspan></text>
            <circle cx="166" cy="17" r="5" fill="#c084fc" />
            <text x="176" y="21" fill="#e2e8f0" font-size="10" font-weight="600">F&amp;F <tspan fill="#c084fc">({:.1}m²)</tspan></text>
            <circle cx="240" cy="17" r="5" fill="#f87171" />
            <text x="250" y="21" fill="#e2e8f0" font-size="10" font-weight="600">HR <tspan fill="#f87171">({:.1}m²)</tspan></text>
        </g>
        "##,
        leg_x,
        sec.strata_areas.soil_area,
        sec.strata_areas.hdr_area,
        sec.strata_areas.ff_area,
        sec.strata_areas.hr_area
    ));

    // Ground Level (GL) Surface Line (extended horizontally across top)
    let gl_y = to_svg_y(gl);
    let gl_x_left = to_svg_x(-max_abs_x - 3.0);
    let gl_x_right = to_svg_x(max_abs_x + 3.0);
    svg.push_str(&format!(
        r##"<line x1="{:.1}" y1="{:.1}" x2="{:.1}" y2="{:.1}" stroke="#10b981" stroke-width="1.8" stroke-dasharray="6 3" />
        <text x="{:.1}" y="{:.1}" fill="#10b981" font-size="11" font-weight="600" text-anchor="start">GL: {:.2} m</text>"##,
        gl_x_left, gl_y, gl_x_right, gl_y, gl_x_right + 6.0, gl_y + 4.0, gl
    ));

    // RENDER EACH INDIVIDUAL GEOLOGICAL STRATUM SLICE WITH ITS OWN DISTINCT COLOR
    for tier in &sec.tiers {
        for slice in &tier.strata_slices {
            if slice.depth > 0.0001 {
                let left_b = to_svg_x(-slice.bottom_width / 2.0);
                let right_b = to_svg_x(slice.bottom_width / 2.0);
                let y_b = to_svg_y(slice.bottom_rl);
                let left_t = to_svg_x(-slice.top_width / 2.0);
                let right_t = to_svg_x(slice.top_width / 2.0);
                let y_t = to_svg_y(slice.top_rl);

                let poly_pts = format!(
                    "{:.1},{:.1} {:.1},{:.1} {:.1},{:.1} {:.1},{:.1}",
                    left_b, y_b, right_b, y_b, right_t, y_t, left_t, y_t
                );

                let (fill_col, stroke_col, hatch_id) = match slice.stratum_name.as_str() {
                    "Hard Rock" => ("rgba(239, 68, 68, 0.40)", "#ef4444", "hrHatch"),
                    "F&F Rock" => ("rgba(192, 132, 252, 0.35)", "#c084fc", "ffHatch"),
                    "HDR" => ("rgba(251, 146, 60, 0.35)", "#fb923c", "hdrHatch"),
                    _ => ("rgba(250, 204, 21, 0.30)", "#facc15", "soilHatch"),
                };

                // Stratum slice polygon with color fill and pattern texture
                svg.push_str(&format!(
                    r##"<polygon points="{}" fill="{}" stroke="{}" stroke-width="0.8" />
                    <polygon points="{}" fill="url(#{})" />"##,
                    poly_pts, fill_col, stroke_col, poly_pts, hatch_id
                ));

                // Stratum boundary interface line (if below GL)
                if (slice.top_rl - gl).abs() > 0.05 {
                    svg.push_str(&format!(
                        r##"<line x1="{:.1}" y1="{:.1}" x2="{:.1}" y2="{:.1}" stroke="rgba(255,255,255,0.25)" stroke-width="0.8" stroke-dasharray="3 3" />"##,
                        left_t, y_t, right_t, y_t
                    ));
                }
            }
        }
    }

    // Outer Cut Profile Perimeter Highlight
    svg.push_str(&format!(
        r##"<polygon points="{}" fill="none" stroke="#f59e0b" stroke-width="2.2" />"##,
        cut_polygon_pts
    ));

    // Water Prism
    svg.push_str(&format!(
        r##"<polygon points="{}" fill="url(#waterGrad)" stroke="#38bdf8" stroke-width="1.2" />"##,
        water_poly_pts
    ));

    // FSL Water Line
    let fsl_y = to_svg_y(fsl_rl);
    svg.push_str(&format!(
        r##"<line x1="{:.1}" y1="{:.1}" x2="{:.1}" y2="{:.1}" stroke="#38bdf8" stroke-width="1.5" />
        <text x="{:.1}" y="{:.1}" fill="#38bdf8" font-size="10" font-weight="600" text-anchor="middle">▼ FSL: {:.2} m (FSD = {:.2} m)</text>"##,
        to_svg_x(-fsl_half_w), fsl_y, to_svg_x(fsl_half_w), fsl_y,
        to_svg_x(0.0), fsl_y - 6.0, fsl_rl, fsd
    ));

    // TBL Reference Level Line (dashed line across)
    let tbl_rl = cbl + tbl_h;
    let tbl_y = to_svg_y(tbl_rl);
    let tbl_half_w = bed_w / 2.0 + input.side_slope * tbl_h;
    svg.push_str(&format!(
        r##"<line x1="{:.1}" y1="{:.1}" x2="{:.1}" y2="{:.1}" stroke="#64748b" stroke-width="1.2" stroke-dasharray="4 4" />
        <text x="{:.1}" y="{:.1}" fill="#94a3b8" font-size="10" text-anchor="start">TBL: {:.2} m (FB = {:.2} m)</text>"##,
        to_svg_x(-tbl_half_w - 2.0), tbl_y, to_svg_x(tbl_half_w + 2.0), tbl_y,
        to_svg_x(tbl_half_w + 4.0), tbl_y + 3.0, tbl_rl, fb
    ));

    // Canal Bed Line & Toe Markers
    let cbl_y = to_svg_y(cbl);
    let bed_x_left = to_svg_x(-bed_w / 2.0);
    let bed_x_right = to_svg_x(bed_w / 2.0);
    svg.push_str(&format!(
        r##"<line x1="{:.1}" y1="{:.1}" x2="{:.1}" y2="{:.1}" stroke="#f8fafc" stroke-width="2.5" />
        <circle cx="{:.1}" cy="{:.1}" r="3.5" fill="#f8fafc" />
        <circle cx="{:.1}" cy="{:.1}" r="3.5" fill="#f8fafc" />
        <text x="{:.1}" y="{:.1}" fill="#f8fafc" font-size="11" font-weight="700" text-anchor="middle">CBL: {:.2} m (Bed Width B = {:.2} m)</text>"##,
        bed_x_left, cbl_y, bed_x_right, cbl_y,
        bed_x_left, cbl_y, bed_x_right, cbl_y,
        to_svg_x(0.0), cbl_y + 16.0, cbl, bed_w
    ));

    // Bed Width Dimension Line
    let dim_bed_y = cbl_y + 26.0;
    svg.push_str(&format!(
        r##"<line x1="{:.1}" y1="{:.1}" x2="{:.1}" y2="{:.1}" stroke="#94a3b8" stroke-width="1" marker-start="url(#arrow)" marker-end="url(#arrow)" />
        <text x="{:.1}" y="{:.1}" fill="#94a3b8" font-size="10" text-anchor="middle">B = {:.2} m</text>"##,
        bed_x_left, dim_bed_y, bed_x_right, dim_bed_y,
        to_svg_x(0.0), dim_bed_y - 4.0, bed_w
    ));

    // Active Berm Shelves Callouts & Dimension Markers
    for berm in &sec.active_berms {
        let b_y = to_svg_y(berm.rl);
        if let Some(pos) = right_points.windows(2).find(|w| (w[0].1 - berm.rl).abs() < 0.05 && (w[1].1 - berm.rl).abs() < 0.05) {
            let x1 = to_svg_x(pos[0].0);
            let x2 = to_svg_x(pos[1].0);
            let shelf_w = pos[1].0 - pos[0].0;

            svg.push_str(&format!(
                r##"<line x1="{:.1}" y1="{:.1}" x2="{:.1}" y2="{:.1}" stroke="#c084fc" stroke-width="3" />
                <circle cx="{:.1}" cy="{:.1}" r="3" fill="#c084fc" />
                <circle cx="{:.1}" cy="{:.1}" r="3" fill="#c084fc" />
                <text x="{:.1}" y="{:.1}" fill="#c084fc" font-size="10" font-weight="700" text-anchor="start">Berm #{}: {:.2} m RL (Shelf {:.2} m, Slope {:.2}:1)</text>"##,
                x1, b_y, x2, b_y,
                x1, b_y, x2, b_y,
                x2 + 8.0, b_y + 3.0, berm.index, berm.rl, shelf_w, berm.slope_after
            ));

            let lx1 = to_svg_x(-pos[0].0);
            let lx2 = to_svg_x(-pos[1].0);
            svg.push_str(&format!(
                r##"<line x1="{:.1}" y1="{:.1}" x2="{:.1}" y2="{:.1}" stroke="#c084fc" stroke-width="3" />
                <circle cx="{:.1}" cy="{:.1}" r="3" fill="#c084fc" />
                <circle cx="{:.1}" cy="{:.1}" r="3" fill="#c084fc" />"##,
                lx1, b_y, lx2, b_y,
                lx1, b_y, lx2, b_y
            ));
        }
    }

    // Cut Depth Vertical Dimension Line (on left side)
    let cut_dim_x = to_svg_x(-max_abs_x - 1.5);
    svg.push_str(&format!(
        r##"<line x1="{:.1}" y1="{:.1}" x2="{:.1}" y2="{:.1}" stroke="#f59e0b" stroke-width="1.2" marker-start="url(#arrowAmber)" marker-end="url(#arrowAmber)" />
        <text x="{:.1}" y="{:.1}" fill="#f59e0b" font-size="10" font-weight="600" text-anchor="middle" transform="rotate(-90 {:.1} {:.1})">Total Cut = {:.2} m</text>"##,
        cut_dim_x, gl_y, cut_dim_x, cbl_y,
        cut_dim_x - 12.0, (gl_y + cbl_y) / 2.0, cut_dim_x - 12.0, (gl_y + cbl_y) / 2.0, sec.cut_depth
    ));

    // Centerline (CL) Marker
    let cl_x = to_svg_x(0.0);
    svg.push_str(&format!(
        r##"<line x1="{:.1}" y1="{:.1}" x2="{:.1}" y2="{:.1}" stroke="#475569" stroke-width="1" stroke-dasharray="5 3 2 3" />
        <text x="{:.1}" y="{:.1}" fill="#64748b" font-size="10" font-weight="700" text-anchor="middle">℄</text>"##,
        cl_x, pad_top - 12.0, cl_x, height - pad_bot + 15.0,
        cl_x, pad_top - 18.0
    ));

    // Trapezoids Legend Box at Bottom Right
    let legend_y = height - pad_bot + 12.0;
    let mode_str = match input.berm_config.mode {
        CutBermMode::Programmatic => "Programmatic Berms",
        CutBermMode::Manual => "Manual Benches",
    };
    svg.push_str(&format!(
        r##"
        <g transform="translate({:.0}, {:.0})">
            <rect x="0" y="0" width="440" height="26" rx="4" fill="#1e293b" fill-opacity="0.9" />
            <text x="12" y="17" fill="#94a3b8" font-size="10">Trapezoids: <tspan fill="#f8fafc">{} tiers</tspan> | Mode: <tspan fill="#a855f7">{}</tspan> | Core Slope: <tspan fill="#38bdf8">{:.2}:1</tspan></text>
        </g>
        "##,
        width - 460.0, legend_y - 20.0, sec.tiers.len(), mode_str, input.side_slope
    ));

    svg.push_str("</svg>");
    svg
}

/// Generates a standalone, beautiful SVG diagram representing the formation of embankment cross-section.
pub fn generate_embankment_section_svg(
    input: &CanalEmbankmentInput,
    sec: &SectionEmbankmentResult,
) -> String {
    if sec.net_banking_height <= 0.001 {
        return r##"<svg viewBox="0 0 760 380" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
            <rect width="760" height="380" fill="#0f172a" rx="8" />
            <text x="380" y="190" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="14" text-anchor="middle">
                No Embankment / Deep Cut Section (Ground Level ≥ T.B.L.)
            </text>
        </svg>"##.to_string();
    }

    let width = 760.0;
    let height = 440.0;
    let pad_x = 75.0;
    let pad_top = 65.0;
    let pad_bot = 65.0;

    let cbl = sec.bed_level;
    let gl = sec.ground_level;
    let tbl = sec.tbl_level;
    let fsl = sec.fsl_level;
    let bed_w = input.bed_width;
    let d_strip = sec.stripping_depth;
    let h_gross = sec.gross_banking_height;
    let h_net = sec.net_banking_height;

    // Geometric coordinates
    let h_inner = tbl - cbl;
    let x_bed_l = -bed_w / 2.0;
    let x_bed_r = bed_w / 2.0;

    let x_canal_lip_l = x_bed_l - input.left_bank.inner_slope * h_inner;
    let x_canal_lip_r = x_bed_r + input.right_bank.inner_slope * h_inner;

    let x_crest_l = x_canal_lip_l - input.left_bank.top_width;
    let x_crest_r = x_canal_lip_r + input.right_bank.top_width;

    // Outer toe coordinates (at stripped ground elevation: GL - d_strip)
    let left_berm_width = if let (Some(interval), Some(bw)) = (
        input.left_bank.berm_interval_m,
        input.left_bank.berm_width,
    ) {
        if interval > 0.0 && h_gross > interval {
            let count = ((h_gross - 0.01) / interval).floor();
            count * bw
        } else {
            0.0
        }
    } else {
        0.0
    };
    let right_berm_width = if let (Some(interval), Some(bw)) = (
        input.right_bank.berm_interval_m,
        input.right_bank.berm_width,
    ) {
        if interval > 0.0 && h_gross > interval {
            let count = ((h_gross - 0.01) / interval).floor();
            count * bw
        } else {
            0.0
        }
    } else {
        0.0
    };

    let x_toe_l = x_crest_l - input.left_bank.outer_slope * h_gross - left_berm_width;
    let x_toe_r = x_crest_r + input.right_bank.outer_slope * h_gross + right_berm_width;

    let stripped_rl = gl - d_strip;

    // Coordinate Bounds
    let x_min = x_toe_l - 4.0;
    let x_max = x_toe_r + 4.0;
    let y_min = cbl.min(stripped_rl) - 0.8;
    let y_max = tbl + 1.2;

    let to_svg_x = |x: f64| -> f64 {
        pad_x + (x - x_min) / (x_max - x_min) * (width - 2.0 * pad_x)
    };
    let to_svg_y = |y: f64| -> f64 {
        height - pad_bot - (y - y_min) / (y_max - y_min) * (height - pad_top - pad_bot)
    };

    let mut svg = String::with_capacity(8192);
    svg.push_str(&format!(
        r##"<svg viewBox="0 0 {:.0} {:.0}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">"##,
        width, height
    ));

    // Defs: Gradients, Hatches, Arrow Markers
    svg.push_str(r##"
    <defs>
        <pattern id="bankSoilHatch" width="10" height="10" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="0" y2="10" stroke="#f59e0b" stroke-width="0.8" stroke-opacity="0.3" />
        </pattern>
        <pattern id="stripHatch" width="8" height="8" patternTransform="rotate(-45 0 0)" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="0" y2="8" stroke="#94a3b8" stroke-width="0.8" stroke-opacity="0.4" />
        </pattern>
        <linearGradient id="waterGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.65" />
            <stop offset="100%" stop-color="#0284c7" stop-opacity="0.85" />
        </linearGradient>
        <marker id="arrowSky" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#38bdf8" />
        </marker>
        <marker id="arrowEmerald" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#10b981" />
        </marker>
        <marker id="arrowAmber" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#f59e0b" />
        </marker>
    </defs>
    "##);

    // Background Canvas
    svg.push_str(&format!(
        r##"<rect width="{:.0}" height="{:.0}" fill="#0f172a" rx="8" />"##,
        width, height
    ));

    // Ground Level (GL) Line and Terrain Base
    let gl_y = to_svg_y(gl);
    let str_y = to_svg_y(stripped_rl);
    let left_x = to_svg_x(x_min);
    let right_x = to_svg_x(x_max);

    // Stripping foundation band beneath banks
    let toe_l_x = to_svg_x(x_toe_l);
    let toe_r_x = to_svg_x(x_toe_r);
    svg.push_str(&format!(
        r##"<rect x="{:.1}" y="{:.1}" width="{:.1}" height="{:.1}" fill="#334155" fill-opacity="0.5" stroke="#475569" stroke-width="0.8" stroke-dasharray="2 2" />
        <rect x="{:.1}" y="{:.1}" width="{:.1}" height="{:.1}" fill="url(#stripHatch)" />"##,
        toe_l_x, gl_y, (toe_r_x - toe_l_x).max(1.0), (str_y - gl_y).max(1.0),
        toe_l_x, gl_y, (toe_r_x - toe_l_x).max(1.0), (str_y - gl_y).max(1.0),
    ));

    // Natural Ground Line (GL)
    svg.push_str(&format!(
        r##"<line x1="{:.1}" y1="{:.1}" x2="{:.1}" y2="{:.1}" stroke="#10b981" stroke-width="1.8" stroke-dasharray="6 3" />
        <g transform="translate({:.1}, {:.1})">
            <rect x="0" y="-12" width="105" height="20" rx="3" fill="#064e3b" stroke="#10b981" stroke-width="1" />
            <text x="52" y="2" fill="#a7f3d0" font-size="10" font-weight="600" text-anchor="middle">G.L. {:.2} m RL</text>
        </g>"##,
        left_x, gl_y, right_x, gl_y,
        right_x - 115.0, gl_y, gl
    ));

    // Left Bank Embankment Polygon
    let cbl_y = to_svg_y(cbl);
    let tbl_y = to_svg_y(tbl);
    let bed_l_x = to_svg_x(x_bed_l);
    let bed_r_x = to_svg_x(x_bed_r);
    let canal_lip_l_x = to_svg_x(x_canal_lip_l);
    let canal_lip_r_x = to_svg_x(x_canal_lip_r);
    let crest_l_x = to_svg_x(x_crest_l);
    let crest_r_x = to_svg_x(x_crest_r);

    // Left Bank fill
    svg.push_str(&format!(
        r##"<polygon points="{:.1},{:.1} {:.1},{:.1} {:.1},{:.1} {:.1},{:.1} {:.1},{:.1}" fill="#b45309" fill-opacity="0.35" stroke="#f59e0b" stroke-width="2" />
        <polygon points="{:.1},{:.1} {:.1},{:.1} {:.1},{:.1} {:.1},{:.1} {:.1},{:.1}" fill="url(#bankSoilHatch)" />"##,
        toe_l_x, str_y,
        crest_l_x, tbl_y,
        canal_lip_l_x, tbl_y,
        bed_l_x, cbl_y,
        toe_l_x, cbl_y.max(str_y),
        toe_l_x, str_y,
        crest_l_x, tbl_y,
        canal_lip_l_x, tbl_y,
        bed_l_x, cbl_y,
        toe_l_x, cbl_y.max(str_y),
    ));

    // Right Bank fill
    svg.push_str(&format!(
        r##"<polygon points="{:.1},{:.1} {:.1},{:.1} {:.1},{:.1} {:.1},{:.1} {:.1},{:.1}" fill="#b45309" fill-opacity="0.35" stroke="#f59e0b" stroke-width="2" />
        <polygon points="{:.1},{:.1} {:.1},{:.1} {:.1},{:.1} {:.1},{:.1} {:.1},{:.1}" fill="url(#bankSoilHatch)" />"##,
        toe_r_x, str_y,
        crest_r_x, tbl_y,
        canal_lip_r_x, tbl_y,
        bed_r_x, cbl_y,
        toe_r_x, cbl_y.max(str_y),
        toe_r_x, str_y,
        crest_r_x, tbl_y,
        canal_lip_r_x, tbl_y,
        bed_r_x, cbl_y,
        toe_r_x, cbl_y.max(str_y),
    ));

    // Canal Water Prism
    let fsl_y = to_svg_y(fsl);
    let water_h = input.full_supply_depth;
    let water_l_x = to_svg_x(x_bed_l - input.left_bank.inner_slope * water_h);
    let water_r_x = to_svg_x(x_bed_r + input.right_bank.inner_slope * water_h);

    svg.push_str(&format!(
        r##"<polygon points="{:.1},{:.1} {:.1},{:.1} {:.1},{:.1} {:.1},{:.1}" fill="url(#waterGrad)" stroke="#38bdf8" stroke-width="1.2" />"##,
        water_l_x, fsl_y,
        water_r_x, fsl_y,
        bed_r_x, cbl_y,
        bed_l_x, cbl_y
    ));

    // Canal Bed Line
    svg.push_str(&format!(
        r##"<line x1="{:.1}" y1="{:.1}" x2="{:.1}" y2="{:.1}" stroke="#cbd5e1" stroke-width="2.5" />
        <g transform="translate({:.1}, {:.1})">
            <rect x="-45" y="4" width="90" height="18" rx="3" fill="#1e293b" stroke="#64748b" stroke-width="1" />
            <text x="0" y="16" fill="#cbd5e1" font-size="9" font-weight="600" text-anchor="middle">C.B.L. {:.2} m</text>
        </g>"##,
        bed_l_x, cbl_y, bed_r_x, cbl_y,
        (bed_l_x + bed_r_x) / 2.0, cbl_y, cbl
    ));

    // FSL Line and Marker
    svg.push_str(&format!(
        r##"<line x1="{:.1}" y1="{:.1}" x2="{:.1}" y2="{:.1}" stroke="#38bdf8" stroke-width="1.2" stroke-dasharray="5 3" />
        <polygon points="{:.1},{:.1} {:.1},{:.1} {:.1},{:.1}" fill="#38bdf8" />
        <text x="{:.1}" y="{:.1}" fill="#38bdf8" font-size="10" font-weight="600">F.S.L. {:.2} m</text>"##,
        water_l_x - 10.0, fsl_y, water_r_x + 10.0, fsl_y,
        (water_l_x + water_r_x) / 2.0, fsl_y,
        (water_l_x + water_r_x) / 2.0 - 5.0, fsl_y - 8.0,
        (water_l_x + water_r_x) / 2.0 + 5.0, fsl_y - 8.0,
        (water_l_x + water_r_x) / 2.0 + 10.0, fsl_y - 2.0, fsl
    ));

    // TBL Line across crests
    svg.push_str(&format!(
        r##"<line x1="{:.1}" y1="{:.1}" x2="{:.1}" y2="{:.1}" stroke="#f59e0b" stroke-width="1.2" stroke-dasharray="4 2" />
        <g transform="translate({:.1}, {:.1})">
            <rect x="0" y="-12" width="105" height="20" rx="3" fill="#78350f" stroke="#f59e0b" stroke-width="1" />
            <text x="52" y="2" fill="#fde68a" font-size="10" font-weight="600" text-anchor="middle">T.B.L. {:.2} m RL</text>
        </g>"##,
        crest_l_x, tbl_y, crest_r_x, tbl_y,
        left_x + 5.0, tbl_y, tbl
    ));

    // Left Crest Dimension (Inspection Path)
    svg.push_str(&format!(
        r##"<line x1="{:.1}" y1="{:.1}" x2="{:.1}" y2="{:.1}" stroke="#fde68a" stroke-width="1.2" marker-start="url(#arrowAmber)" marker-end="url(#arrowAmber)" />
        <text x="{:.1}" y="{:.1}" fill="#fde68a" font-size="10" font-weight="600" text-anchor="middle">Left Bank: {:.2} m (Inspection)</text>"##,
        crest_l_x, tbl_y - 12.0, canal_lip_l_x, tbl_y - 12.0,
        (crest_l_x + canal_lip_l_x) / 2.0, tbl_y - 16.0, input.left_bank.top_width
    ));

    // Right Crest Dimension (Service Road)
    svg.push_str(&format!(
        r##"<line x1="{:.1}" y1="{:.1}" x2="{:.1}" y2="{:.1}" stroke="#fde68a" stroke-width="1.2" marker-start="url(#arrowAmber)" marker-end="url(#arrowAmber)" />
        <text x="{:.1}" y="{:.1}" fill="#fde68a" font-size="10" font-weight="600" text-anchor="middle">Right Bank: {:.2} m (Service Road)</text>"##,
        canal_lip_r_x, tbl_y - 12.0, crest_r_x, tbl_y - 12.0,
        (canal_lip_r_x + crest_r_x) / 2.0, tbl_y - 16.0, input.right_bank.top_width
    ));

    // Bed Width Dimension
    svg.push_str(&format!(
        r##"<line x1="{:.1}" y1="{:.1}" x2="{:.1}" y2="{:.1}" stroke="#cbd5e1" stroke-width="1.2" marker-start="url(#arrowSky)" marker-end="url(#arrowSky)" />
        <text x="{:.1}" y="{:.1}" fill="#cbd5e1" font-size="9" font-weight="600" text-anchor="middle">Bed: {:.2} m</text>"##,
        bed_l_x, cbl_y + 12.0, bed_r_x, cbl_y + 12.0,
        (bed_l_x + bed_r_x) / 2.0, cbl_y + 26.0, bed_w
    ));

    // Centerline
    let cl_x = to_svg_x(0.0);
    svg.push_str(&format!(
        r##"<line x1="{:.1}" y1="{:.1}" x2="{:.1}" y2="{:.1}" stroke="#475569" stroke-width="1" stroke-dasharray="5 3 2 3" />
        <text x="{:.1}" y="{:.1}" fill="#64748b" font-size="10" font-weight="700" text-anchor="middle">℄</text>"##,
        cl_x, pad_top - 15.0, cl_x, height - pad_bot + 15.0,
        cl_x, pad_top - 20.0
    ));

    // Summary Card Header at Top Center
    svg.push_str(&format!(
        r##"
        <g transform="translate({:.0}, 12)">
            <rect x="0" y="0" width="460" height="34" rx="6" fill="#1e293b" fill-opacity="0.95" stroke="#334155" stroke-width="1" />
            <text x="230" y="15" fill="#f8fafc" font-size="11" font-weight="600" text-anchor="middle">FORMATION OF EMBANKMENT · CHAINAGE {:.2} m</text>
            <text x="230" y="27" fill="#94a3b8" font-size="9.5" text-anchor="middle">Net Banking H = {:.2} m | Stripping = {:.2} m | Gross H = {:.2} m</text>
        </g>
        "##,
        (width - 460.0) / 2.0, sec.chainage, h_net, d_strip, h_gross
    ));

    // Summary Badge at Bottom Right
    svg.push_str(&format!(
        r##"
        <g transform="translate({:.0}, {:.0})">
            <rect x="0" y="0" width="460" height="28" rx="4" fill="#1e293b" fill-opacity="0.95" stroke="#475569" stroke-width="0.8" />
            <text x="12" y="18" fill="#94a3b8" font-size="10">Left: <tspan fill="#fde68a" font-weight="600">{:.2} m²</tspan> | Right: <tspan fill="#fde68a" font-weight="600">{:.2} m²</tspan> | Total Bank: <tspan fill="#10b981" font-weight="700">{:.2} m²</tspan> | Stripping: <tspan fill="#38bdf8">{:.2} m²</tspan></text>
        </g>
        "##,
        width - 480.0, height - pad_bot + 24.0, sec.left_bank_area, sec.right_bank_area, sec.total_bank_area, sec.stripping_area
    ));

    svg.push_str("</svg>");
    svg
}
