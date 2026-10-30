use crate::canal_engine::cut_calculator::calculate_bed_level;
use crate::canal_engine::diagram::generate_embankment_section_svg;
use crate::canal_engine::models::*;

#[derive(Debug, Clone, Copy)]
pub struct BankGeometryResult {
    pub top_width: f64,
    pub bottom_width: f64,
    pub area: f64,
    pub inner_projection: f64,
    pub outer_projection: f64,
}

/// Computes the bank cross-section geometry with exact multi-berm shelf integration
pub fn calculate_bank_geometry(
    crest_width: f64,
    inner_slope: f64,
    base_slope: f64,
    berms: &[CanalBankBermStepInput],
    gross_height: f64,
    stripping_depth: f64,
) -> BankGeometryResult {
    if gross_height <= 0.0001 {
        return BankGeometryResult {
            top_width: crest_width,
            bottom_width: crest_width,
            area: 0.0,
            inner_projection: 0.0,
            outer_projection: 0.0,
        };
    }

    let inner_proj = inner_slope * gross_height;
    let inner_area = 0.5 * inner_slope * gross_height * gross_height;
    let crest_rect_area = crest_width * gross_height;

    let mut remaining_h = gross_height;
    let mut current_outer_slope = base_slope;
    let mut outer_proj = 0.0;
    let mut outer_area = 0.0;
    let mut outer_top_offset = 0.0;
    let mut scheduled_drop = 0.0;

    for b in berms {
        scheduled_drop += b.drop_height.max(0.01);
        let remaining_after_shelf = gross_height - scheduled_drop;
        if remaining_after_shelf <= 0.0001
            || remaining_after_shelf - stripping_depth + 1e-9 < b.clearance.max(0.0)
        {
            continue;
        }
        let slice_h = remaining_h - remaining_after_shelf;
        let outer_bot_offset = outer_top_offset + current_outer_slope * slice_h;
        outer_area += (outer_top_offset + outer_bot_offset) * 0.5 * slice_h;
        outer_proj += current_outer_slope * slice_h;
        remaining_h -= slice_h;

        if remaining_h > 0.0001 {
            outer_proj += b.shelf_width;
            outer_top_offset = outer_bot_offset + b.shelf_width;
            current_outer_slope = b.slope_after_berm;
        }
    }

    if remaining_h > 0.0001 {
        let slice_h = remaining_h;
        let outer_bot_offset = outer_top_offset + current_outer_slope * slice_h;
        outer_area += (outer_top_offset + outer_bot_offset) * 0.5 * slice_h;
        outer_proj += current_outer_slope * slice_h;
    }

    let bottom_width = crest_width + inner_proj + outer_proj;
    let area = crest_rect_area + inner_area + outer_area;

    BankGeometryResult {
        top_width: crest_width,
        bottom_width: (bottom_width * 100.0).round() / 100.0,
        area: (area * 1000.0).round() / 1000.0,
        inner_projection: inner_proj,
        outer_projection: outer_proj,
    }
}

/// Finds the matched tier for a side (left or right) based on height or manual reach
pub fn find_matched_tier<'a>(
    input: &'a CanalEmbankmentInput,
    is_left: bool,
    chainage: f64,
    fill_h: f64,
) -> Option<&'a CanalBankTierInput> {
    let (tiers, manual_reaches) = if is_left {
        (
            &input.left_tiers,
            &input.left_manual_reaches,
        )
    } else {
        if input.link_symmetrical || input.right_tiers.is_empty() {
            (
                &input.left_tiers,
                &input.left_manual_reaches,
            )
        } else {
            (
                &input.right_tiers,
                &input.right_manual_reaches,
            )
        }
    };

    if input.mode == "manual" {
        for r in manual_reaches {
            if chainage >= (r.from - 0.001) && chainage <= (r.to + 0.001) {
                if let Some(t) = tiers.iter().find(|t| t.id == r.tier_id) {
                    return Some(t);
                }
            }
        }
    }

    if !tiers.is_empty() {
        for t in tiers {
            if fill_h >= (t.min_fill_height - 0.001) && fill_h < t.max_fill_height {
                return Some(t);
            }
        }
        return tiers.last();
    }

    None
}

/// Computes the formation of embankment geometry for a single section
pub fn compute_section_embankment(
    input: &CanalEmbankmentInput,
    sec: &SectionInput,
) -> SectionEmbankmentResult {
    let cbl = sec.bed_level.unwrap_or_else(|| {
        calculate_bed_level(input.bed_level_at_start, input.bed_slope, sec.chainage)
    });

    let tbl_height = input.full_supply_depth + input.free_board;
    let tbl_level = cbl + tbl_height;
    let fsl_level = cbl + input.full_supply_depth;
    let gl = sec.ground_level;

    let net_banking_height = (tbl_level - gl).max(0.0);

    if net_banking_height <= 0.001 {
        let mut res = SectionEmbankmentResult {
            section_id: sec.id.clone(),
            chainage: sec.chainage,
            ground_level: (gl * 1000.0).round() / 1000.0,
            bed_level: (cbl * 1000.0).round() / 1000.0,
            tbl_level: (tbl_level * 1000.0).round() / 1000.0,
            fsl_level: (fsl_level * 1000.0).round() / 1000.0,
            net_banking_height: 0.0,
            stripping_depth: 0.0,
            gross_banking_height: 0.0,
            left_top_width: 0.0,
            left_bottom_width: 0.0,
            left_bank_area: 0.0,
            left_tier_name: "Cutting (0 Bank)".into(),
            right_top_width: 0.0,
            right_bottom_width: 0.0,
            right_bank_area: 0.0,
            right_tier_name: "Cutting (0 Bank)".into(),
            stripping_area: 0.0,
            total_bank_area: 0.0,
            hearting_area: 0.0,
            casing_area: 0.0,
            homogeneous_area: 0.0,
            diagram_svg: String::new(),
        };
        res.diagram_svg = generate_embankment_section_svg(input, &res);
        return res;
    }

    let stripping_depth = input.stripping_depth.max(0.0);
    let gross_banking_height = net_banking_height + stripping_depth;

    // Matched left and right tiers
    let matched_left = find_matched_tier(input, true, sec.chainage, net_banking_height);
    let matched_right = find_matched_tier(input, false, sec.chainage, net_banking_height);

    // Left bank geometry
    let (left_top_w, left_inner_s, left_base_s, left_berms, left_tier_name, left_is_zoned, left_core_w, left_core_s) =
        if let Some(t) = matched_left {
            (
                t.crest_width,
                t.inner_slope,
                t.base_slope,
                t.berms.as_slice(),
                t.name.clone(),
                t.section_type == "zoned",
                t.hearting_top_width.unwrap_or(1.5),
                t.hearting_side_slope.unwrap_or(1.0),
            )
        } else {
            (
                input.left_bank.top_width,
                input.left_bank.inner_slope,
                input.left_bank.outer_slope,
                &[][..],
                "Standard Left Bank".into(),
                false,
                1.5,
                1.0,
            )
        };

    let left_geom = calculate_bank_geometry(
        left_top_w,
        left_inner_s,
        left_base_s,
        left_berms,
        gross_banking_height,
        stripping_depth,
    );

    // Right bank geometry
    let (right_top_w, right_inner_s, right_base_s, right_berms, right_tier_name, right_is_zoned, right_core_w, right_core_s) =
        if let Some(t) = matched_right {
            (
                t.crest_width,
                t.inner_slope,
                t.base_slope,
                t.berms.as_slice(),
                t.name.clone(),
                t.section_type == "zoned",
                t.hearting_top_width.unwrap_or(1.5),
                t.hearting_side_slope.unwrap_or(1.0),
            )
        } else {
            (
                input.right_bank.top_width,
                input.right_bank.inner_slope,
                input.right_bank.outer_slope,
                &[][..],
                "Standard Right Bank".into(),
                false,
                1.5,
                1.0,
            )
        };

    let right_geom = calculate_bank_geometry(
        right_top_w,
        right_inner_s,
        right_base_s,
        right_berms,
        gross_banking_height,
        stripping_depth,
    );

    // Stripping footprint area
    let stripping_area = (left_geom.bottom_width + right_geom.bottom_width) * stripping_depth;
    let total_bank_area = left_geom.area + right_geom.area;

    // Zoning breakdowns
    let hearting_area;
    let casing_area;
    let homogeneous_area;

    if left_is_zoned || right_is_zoned {
        let left_h_area = if left_is_zoned {
            let core_bot = left_core_w + 2.0 * left_core_s * gross_banking_height;
            let c_area = (left_core_w + core_bot) * 0.5 * gross_banking_height;
            c_area.min(left_geom.area)
        } else {
            0.0
        };

        let right_h_area = if right_is_zoned {
            let core_bot = right_core_w + 2.0 * right_core_s * gross_banking_height;
            let c_area = (right_core_w + core_bot) * 0.5 * gross_banking_height;
            c_area.min(right_geom.area)
        } else {
            0.0
        };

        hearting_area = left_h_area + right_h_area;
        let left_casing = if left_is_zoned { left_geom.area - left_h_area } else { 0.0 };
        let right_casing = if right_is_zoned { right_geom.area - right_h_area } else { 0.0 };
        casing_area = left_casing + right_casing;

        let left_homo = if !left_is_zoned { left_geom.area } else { 0.0 };
        let right_homo = if !right_is_zoned { right_geom.area } else { 0.0 };
        homogeneous_area = left_homo + right_homo;
    } else {
        hearting_area = 0.0;
        casing_area = 0.0;
        homogeneous_area = total_bank_area;
    }

    let mut res = SectionEmbankmentResult {
        section_id: sec.id.clone(),
        chainage: sec.chainage,
        ground_level: (gl * 1000.0).round() / 1000.0,
        bed_level: (cbl * 1000.0).round() / 1000.0,
        tbl_level: (tbl_level * 1000.0).round() / 1000.0,
        fsl_level: (fsl_level * 1000.0).round() / 1000.0,
        net_banking_height: (net_banking_height * 1000.0).round() / 1000.0,
        stripping_depth: (stripping_depth * 1000.0).round() / 1000.0,
        gross_banking_height: (gross_banking_height * 1000.0).round() / 1000.0,
        left_top_width: (left_geom.top_width * 100.0).round() / 100.0,
        left_bottom_width: (left_geom.bottom_width * 100.0).round() / 100.0,
        left_bank_area: (left_geom.area * 1000.0).round() / 1000.0,
        left_tier_name,
        right_top_width: (right_geom.top_width * 100.0).round() / 100.0,
        right_bottom_width: (right_geom.bottom_width * 100.0).round() / 100.0,
        right_bank_area: (right_geom.area * 1000.0).round() / 100.0,
        right_tier_name,
        stripping_area: (stripping_area * 1000.0).round() / 100.0,
        total_bank_area: (total_bank_area * 1000.0).round() / 1000.0,
        hearting_area: (hearting_area * 1000.0).round() / 1000.0,
        casing_area: (casing_area * 1000.0).round() / 1000.0,
        homogeneous_area: (homogeneous_area * 1000.0).round() / 1000.0,
        diagram_svg: String::new(),
    };

    res.diagram_svg = generate_embankment_section_svg(input, &res);
    res
}

/// Helper structure for an interval between adjacent sections
struct IntervalVolume {
    from_ch: f64,
    to_ch: f64,
    length: f64,
    is_pure_cut: bool,
    tier_name: String,
    left_vol: f64,
    right_vol: f64,
    bank_vol: f64,
    strip_vol: f64,
    hearting_vol: f64,
    casing_vol: f64,
    homo_vol: f64,
}

/// Computes the complete canal formation of embankment across all sections and reaches
pub fn calculate_canal_embankment(
    input: &CanalEmbankmentInput,
) -> CanalEmbankmentCalculationResponse {
    let tbl_height = input.full_supply_depth + input.free_board;

    let mut sorted_sections = input.sections.clone();
    sorted_sections.sort_by(|a, b| {
        a.chainage
            .partial_cmp(&b.chainage)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    let mut evaluated_sections: Vec<SectionEmbankmentResult> = Vec::new();
    for sec in &sorted_sections {
        evaluated_sections.push(compute_section_embankment(input, sec));
    }

    // Compute intervals between successive sections
    let mut intervals: Vec<IntervalVolume> = Vec::new();

    for i in 0..evaluated_sections.len().saturating_sub(1) {
        let sec_a = &evaluated_sections[i];
        let sec_b = &evaluated_sections[i + 1];
        let length = (sec_b.chainage - sec_a.chainage).max(0.0);

        let left_vol = (sec_a.left_bank_area + sec_b.left_bank_area) * 0.5 * length;
        let right_vol = (sec_a.right_bank_area + sec_b.right_bank_area) * 0.5 * length;
        let bank_vol = (sec_a.total_bank_area + sec_b.total_bank_area) * 0.5 * length;
        let strip_vol = (sec_a.stripping_area + sec_b.stripping_area) * 0.5 * length;
        let hearting_vol = (sec_a.hearting_area + sec_b.hearting_area) * 0.5 * length;
        let casing_vol = (sec_a.casing_area + sec_b.casing_area) * 0.5 * length;
        let homo_vol = (sec_a.homogeneous_area + sec_b.homogeneous_area) * 0.5 * length;

        let is_pure_cut = sec_a.net_banking_height <= 0.001 && sec_b.net_banking_height <= 0.001;
        let tier_name = if is_pure_cut {
            "Cutting (0 Bank)".to_string()
        } else if sec_a.net_banking_height > 0.001 {
            sec_a.left_tier_name.clone()
        } else {
            sec_b.left_tier_name.clone()
        };

        intervals.push(IntervalVolume {
            from_ch: sec_a.chainage,
            to_ch: sec_b.chainage,
            length,
            is_pure_cut,
            tier_name,
            left_vol,
            right_vol,
            bank_vol,
            strip_vol,
            hearting_vol,
            casing_vol,
            homo_vol,
        });
    }

    // Group contiguous intervals with the same tier_name into reaches
    let mut reaches: Vec<EmbankmentReachResult> = Vec::new();
    let mut total_bank_volume = 0.0;
    let mut total_stripping_volume = 0.0;
    let mut total_left_bank_volume = 0.0;
    let mut total_right_bank_volume = 0.0;
    let mut total_hearting_volume = 0.0;
    let mut total_casing_volume = 0.0;
    let mut total_homogeneous_volume = 0.0;

    let mut current_reach_intervals: Vec<&IntervalVolume> = Vec::new();

    for iv in &intervals {
        total_left_bank_volume += iv.left_vol;
        total_right_bank_volume += iv.right_vol;
        total_bank_volume += iv.bank_vol;
        total_stripping_volume += iv.strip_vol;
        total_hearting_volume += iv.hearting_vol;
        total_casing_volume += iv.casing_vol;
        total_homogeneous_volume += iv.homo_vol;

        if current_reach_intervals.is_empty() {
            current_reach_intervals.push(iv);
        } else {
            let last = current_reach_intervals.last().unwrap();
            if last.tier_name == iv.tier_name && last.is_pure_cut == iv.is_pure_cut {
                current_reach_intervals.push(iv);
            } else {
                // Finalize current reach
                let reach = finalize_reach(&current_reach_intervals, reaches.len() + 1);
                reaches.push(reach);
                current_reach_intervals.clear();
                current_reach_intervals.push(iv);
            }
        }
    }

    if !current_reach_intervals.is_empty() {
        let reach = finalize_reach(&current_reach_intervals, reaches.len() + 1);
        reaches.push(reach);
    }

    // Soil allocation calculations
    let soil_allocation = compute_soil_allocation(
        total_bank_volume,
        total_hearting_volume,
        total_casing_volume,
        total_homogeneous_volume,
        &input.excavation_bands,
        &input.material_allocations,
        input.total_cut_volume,
    );

    CanalEmbankmentCalculationResponse {
        tbl_height: (tbl_height * 1000.0).round() / 1000.0,
        sections: evaluated_sections,
        reaches,
        soil_allocation,
        total_bank_volume: (total_bank_volume * 1000.0).round() / 1000.0,
        total_stripping_volume: (total_stripping_volume * 1000.0).round() / 1000.0,
        total_left_bank_volume: (total_left_bank_volume * 1000.0).round() / 1000.0,
        total_right_bank_volume: (total_right_bank_volume * 1000.0).round() / 1000.0,
        total_hearting_volume: (total_hearting_volume * 1000.0).round() / 1000.0,
        total_casing_volume: (total_casing_volume * 1000.0).round() / 1000.0,
        total_homogeneous_volume: (total_homogeneous_volume * 1000.0).round() / 1000.0,
    }
}

fn finalize_reach(intervals: &[&IntervalVolume], index: usize) -> EmbankmentReachResult {
    let first = intervals.first().unwrap();
    let last = intervals.last().unwrap();
    let from_ch = first.from_ch;
    let to_ch = last.to_ch;
    let length: f64 = intervals.iter().map(|iv| iv.length).sum();

    let left_vol: f64 = intervals.iter().map(|iv| iv.left_vol).sum();
    let right_vol: f64 = intervals.iter().map(|iv| iv.right_vol).sum();
    let total_bank_vol: f64 = intervals.iter().map(|iv| iv.bank_vol).sum();
    let strip_vol: f64 = intervals.iter().map(|iv| iv.strip_vol).sum();
    let hearting_vol: f64 = intervals.iter().map(|iv| iv.hearting_vol).sum();
    let casing_vol: f64 = intervals.iter().map(|iv| iv.casing_vol).sum();
    let homo_vol: f64 = intervals.iter().map(|iv| iv.homo_vol).sum();

    let reach_name = if first.is_pure_cut {
        format!("Reach {}: Ch {:.1}m to {:.1}m (Cutting - 0 Bank)", index, from_ch, to_ch)
    } else {
        format!("Reach {}: Ch {:.1}m to {:.1}m ({})", index, from_ch, to_ch, first.tier_name)
    };

    EmbankmentReachResult {
        reach_index: index,
        reach_name,
        from_chainage: from_ch,
        to_chainage: to_ch,
        length: (length * 100.0).round() / 100.0,
        is_pure_cut: first.is_pure_cut,
        tier_name: first.tier_name.clone(),
        section_count: intervals.len() + 1,
        left_volume: (left_vol * 1000.0).round() / 1000.0,
        right_volume: (right_vol * 1000.0).round() / 1000.0,
        total_bank_volume: (total_bank_vol * 1000.0).round() / 1000.0,
        stripping_volume: (strip_vol * 1000.0).round() / 1000.0,
        hearting_volume: (hearting_vol * 1000.0).round() / 1000.0,
        casing_volume: (casing_vol * 1000.0).round() / 1000.0,
        homogeneous_volume: (homo_vol * 1000.0).round() / 1000.0,
    }
}

/// Resolves soil allocation statement with available suitable cut and borrow sources
fn compute_soil_allocation(
    total_fill_volume: f64,
    total_hearting_volume: f64,
    total_casing_volume: f64,
    total_homogeneous_volume: f64,
    excavation_bands: &[ExcavationBandInput],
    material_allocations: &[BankMaterialAllocationInput],
    total_cut_volume: Option<f64>,
) -> SoilAllocationSummary {
    let cut_vol = total_cut_volume.unwrap_or(0.0);

    // Calculate suitable cut available from excavation bands
    let suitable_cut_available_m3 = if !excavation_bands.is_empty() {
        let mut avail = 0.0;
        for band in excavation_bands {
            let band_cut = cut_vol * (band.pct.max(0.0) / 100.0);
            let band_suitable = band_cut * (band.bank_reuse_pct.max(0.0) / 100.0);
            avail += band_suitable;
        }
        avail
    } else {
        cut_vol
    };

    let mut items: Vec<SoilAllocationItem> = Vec::new();
    let mut allocated_from_cut_m3 = 0.0;
    let mut allocated_from_borrow_m3 = 0.0;
    let mut allocated_from_dump_m3 = 0.0;

    if !material_allocations.is_empty() {
        for alloc in material_allocations {
            let zone_vol = match alloc.zone.as_str() {
                "hearting" => total_hearting_volume,
                "casing" => total_casing_volume,
                _ => {
                    if total_homogeneous_volume > 0.0 {
                        total_homogeneous_volume
                    } else {
                        total_fill_volume
                    }
                }
            };

            let item_vol = zone_vol * (alloc.percentage.max(0.0) / 100.0);

            let (code, desc) = match (alloc.zone.as_str(), alloc.source.as_str()) {
                ("homogeneous", "canal-excavation") => (
                    "IRR-CAW-4-1",
                    "Formation of embankment with canal excavation soil (95% compaction)",
                ),
                ("homogeneous", "borrow-area") => (
                    "IRR-CAW-4-2",
                    "Formation of embankment with approved borrow soil (95% compaction)",
                ),
                ("homogeneous", "dump-area") => (
                    "IRR-CAW-4-3",
                    "Formation of embankment with approved dump soil",
                ),
                ("hearting", "borrow-area") => (
                    "IRR-CAW-4-6",
                    "Impervious hearting core with selected clayey soil (98% compaction)",
                ),
                ("hearting", "canal-excavation") => (
                    "IRR-CAW-4-5",
                    "Impervious hearting core from canal excavation (98% compaction)",
                ),
                ("casing", "canal-excavation") => (
                    "IRR-CAW-4-8",
                    "Casing with excavated soil (95% compaction)",
                ),
                ("casing", "borrow-area") => (
                    "IRR-CAW-4-9",
                    "Casing with borrow area soil (95% compaction)",
                ),
                _ => (
                    "IRR-CAW-4-X",
                    "Bank formation fill material",
                ),
            };

            if alloc.source == "canal-excavation" {
                allocated_from_cut_m3 += item_vol;
            } else if alloc.source == "borrow-area" {
                allocated_from_borrow_m3 += item_vol;
            } else if alloc.source == "dump-area" {
                allocated_from_dump_m3 += item_vol;
            }

            items.push(SoilAllocationItem {
                zone: alloc.zone.clone(),
                source: alloc.source.clone(),
                percentage: alloc.percentage,
                volume_m3: (item_vol * 1000.0).round() / 1000.0,
                compaction: alloc.compaction,
                watering: alloc.watering,
                item_code: code.into(),
                item_description: desc.into(),
            });
        }
    } else {
        // Fallback default allocation: prioritize canal excavation then borrow area
        let from_cut = total_fill_volume.min(suitable_cut_available_m3);
        let from_borrow = (total_fill_volume - from_cut).max(0.0);

        if from_cut > 0.0 {
            allocated_from_cut_m3 += from_cut;
            let pct = if total_fill_volume > 0.0 { (from_cut / total_fill_volume) * 100.0 } else { 0.0 };
            items.push(SoilAllocationItem {
                zone: "homogeneous".into(),
                source: "canal-excavation".into(),
                percentage: (pct * 100.0).round() / 100.0,
                volume_m3: (from_cut * 1000.0).round() / 1000.0,
                compaction: 95,
                watering: true,
                item_code: "IRR-CAW-4-1".into(),
                item_description: "Formation of embankment with canal excavation soil (95% compaction)".into(),
            });
        }

        if from_borrow > 0.0 {
            allocated_from_borrow_m3 += from_borrow;
            let pct = if total_fill_volume > 0.0 { (from_borrow / total_fill_volume) * 100.0 } else { 0.0 };
            items.push(SoilAllocationItem {
                zone: "homogeneous".into(),
                source: "borrow-area".into(),
                percentage: (pct * 100.0).round() / 100.0,
                volume_m3: (from_borrow * 1000.0).round() / 1000.0,
                compaction: 95,
                watering: true,
                item_code: "IRR-CAW-4-2".into(),
                item_description: "Formation of embankment with approved borrow soil (95% compaction)".into(),
            });
        }
    }

    SoilAllocationSummary {
        total_fill_volume_m3: (total_fill_volume * 1000.0).round() / 1000.0,
        suitable_cut_available_m3: (suitable_cut_available_m3 * 1000.0).round() / 1000.0,
        allocated_from_cut_m3: (allocated_from_cut_m3 * 1000.0).round() / 1000.0,
        allocated_from_borrow_m3: (allocated_from_borrow_m3 * 1000.0).round() / 1000.0,
        allocated_from_dump_m3: (allocated_from_dump_m3 * 1000.0).round() / 1000.0,
        items,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn berm(drop: f64, clearance: f64) -> CanalBankBermStepInput {
        CanalBankBermStepInput { id: "shelf".into(), drop_height: drop, shelf_width: 2.0, slope_after_berm: 2.0, clearance }
    }

    #[test]
    fn bank_shelf_clearance_uses_natural_ground_and_keeps_exact_boundary() {
        let shelf = berm(3.0, 2.0);
        let plain = calculate_bank_geometry(3.0, 1.5, 1.5, &[], 5.1, 0.6);
        let omitted = calculate_bank_geometry(3.0, 1.5, 1.5, &[shelf.clone()], 5.1, 0.6);
        assert_eq!(omitted.area, plain.area);
        assert_eq!(omitted.outer_projection, plain.outer_projection);
        let exact = calculate_bank_geometry(3.0, 1.5, 1.5, &[shelf.clone()], 5.6, 0.6);
        assert!((exact.outer_projection - (4.5 + 2.0 + 2.0 * 2.6)).abs() < 1e-9);
        let below = calculate_bank_geometry(3.0, 1.5, 1.5, &[shelf], 5.5999, 0.6);
        assert!((below.outer_projection - 1.5 * 5.5999).abs() < 1e-9);
    }

    #[test]
    fn skipped_shelf_preserves_following_elevation_and_base_slope() {
        let scheduled = calculate_bank_geometry(3.0, 1.5, 1.5, &[berm(1.0, 100.0), berm(1.0, 0.0)], 5.0, 0.0);
        let equivalent = calculate_bank_geometry(3.0, 1.5, 1.5, &[berm(2.0, 0.0)], 5.0, 0.0);
        assert_eq!(scheduled.area, equivalent.area);
        assert_eq!(scheduled.outer_projection, equivalent.outer_projection);
        let old: CanalBankBermStepInput = serde_json::from_str(r#"{"dropHeight":3,"shelfWidth":2,"slopeAfterBerm":2}"#).unwrap();
        assert_eq!(old.clearance, 2.0);
    }

    #[test]
    fn test_section_embankment_calculation() {
        let input = CanalEmbankmentInput {
            bank_schedule: None,
            bed_width: 8.0,
            full_supply_depth: 2.5,
            free_board: 0.75, // TBL = CBL + 3.25m
            bed_slope: 0.0,
            bed_level_at_start: 100.0,
            stripping_depth: 0.15,
            mode: "tiered".into(),
            link_symmetrical: true,
            left_tiers: vec![
                CanalBankTierInput {
                    id: "tier-1".into(),
                    name: "Low Bund (0-3m)".into(),
                    min_fill_height: 0.0,
                    max_fill_height: 3.0,
                    crest_width: 5.0,
                    base_slope: 2.0,
                    inner_slope: 1.5,
                    section_type: "homogeneous".into(),
                    berms: vec![],
                    hearting_top_width: None,
                    hearting_side_slope: None,
                }
            ],
            right_tiers: vec![],
            left_manual_reaches: vec![],
            right_manual_reaches: vec![],
            left_bank: CanalBankSideConfig {
                top_width: 5.0,
                inner_slope: 1.5,
                outer_slope: 2.0,
                berm_interval_m: None,
                berm_width: None,
            },
            right_bank: CanalBankSideConfig {
                top_width: 8.0,
                inner_slope: 1.5,
                outer_slope: 2.0,
                berm_interval_m: None,
                berm_width: None,
            },
            excavation_bands: vec![
                ExcavationBandInput {
                    label: "All Soils".into(),
                    pct: 40.0,
                    bank_reuse_pct: 100.0,
                }
            ],
            material_allocations: vec![],
            total_cut_volume: Some(5000.0),
            sections: vec![
                SectionInput {
                    id: "sec-fill".into(),
                    chainage: 0.0,
                    ground_level: 101.0, // TBL = 103.25 -> net height = 2.25m
                    bed_level: Some(100.0),
                    soil_depth: None,
                    hdr_depth: None,
                    ff_depth: None,
                    hr_depth: None,
                    soil_pct: None,
                    hdr_pct: None,
                    ff_pct: None,
                    hr_pct: None,
                },
                SectionInput {
                    id: "sec-cut".into(),
                    chainage: 25.0,
                    ground_level: 105.0, // GL > TBL (105.0 > 103.25) -> Full Cut, 0 embankment!
                    bed_level: Some(100.0),
                    soil_depth: None,
                    hdr_depth: None,
                    ff_depth: None,
                    hr_depth: None,
                    soil_pct: None,
                    hdr_pct: None,
                    ff_pct: None,
                    hr_pct: None,
                },
            ],
        };

        let res = calculate_canal_embankment(&input);
        assert_eq!(res.sections.len(), 2);

        // Section 1: Fill
        let s1 = &res.sections[0];
        assert_eq!(s1.net_banking_height, 2.25);
        assert_eq!(s1.stripping_depth, 0.15);
        assert_eq!(s1.gross_banking_height, 2.40); // 2.25 + 0.15
        assert_eq!(s1.left_top_width, 5.0);
        // Bottom width = 5.0 + (1.5 + 2.0) * 2.40 = 5.0 + 8.4 = 13.4m
        assert_eq!(s1.left_bottom_width, 13.4);
        assert_eq!(s1.left_bank_area, 22.08);

        // Section 2: Cutting
        let s2 = &res.sections[1];
        assert_eq!(s2.net_banking_height, 0.0);
        assert_eq!(s2.total_bank_area, 0.0);

        // Reaches check:
        // Transition from fill to cut produces an interval
        assert_eq!(res.reaches.len(), 1);
        let r1 = &res.reaches[0];
        assert_eq!(r1.from_chainage, 0.0);
        assert_eq!(r1.to_chainage, 25.0);
        assert_eq!(r1.length, 25.0);
        assert!(!r1.is_pure_cut);
    }
}
