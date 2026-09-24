use super::hydraulics::*;
use super::models::*;

/// Sort points by offset from centre-line.
pub fn order_canal_points(points: &[CanalPoint]) -> Vec<CanalPoint> {
    let mut sorted = points.to_vec();
    sorted.sort_by(|a, b| a.offset.partial_cmp(&b.offset).unwrap());
    sorted
}

/// Interpolate ground RL at an offset, or return None if out of bounds or empty.
pub fn canal_ground_level_at(points: &[CanalPoint], offset: f64) -> Option<f64> {
    if points.len() < 2 {
        return points.first().map(|p| p.rl);
    }
    let sorted = order_canal_points(points);
    if offset <= sorted[0].offset {
        return Some(sorted[0].rl);
    }
    let last = sorted.last().unwrap();
    if offset >= last.offset {
        return Some(last.rl);
    }
    for i in 1..sorted.len() {
        let a = &sorted[i - 1];
        let b = &sorted[i];
        if offset >= a.offset && offset <= b.offset {
            let t = if (b.offset - a.offset).abs() < 1e-12 {
                0.0
            } else {
                (offset - a.offset) / (b.offset - a.offset)
            };
            return Some(round3(a.rl + (b.rl - a.rl) * t));
        }
    }
    Some(last.rl)
}

/// Build the design trapezoid profile of the canal prism at a given section.
pub fn canal_design_profile(data: &CanalData, section: &CanalSection) -> Vec<CanalPoint> {
    let bed_rl = match canal_bed_level_at(data, section.chainage) {
        Some(rl) => rl,
        None => data.design.bed_level_at_start,
    };
    let depth = canal_section_depth(&data.design);
    let top_rl = bed_rl + depth;
    let half_bed = data.design.bed_width / 2.0;
    let s = data.design.side_slope;
    let half_top = half_bed + s * depth;

    vec![
        CanalPoint {
            offset: -round3(half_top),
            rl: round3(top_rl),
        },
        CanalPoint {
            offset: -round3(half_bed),
            rl: round3(bed_rl),
        },
        CanalPoint {
            offset: round3(half_bed),
            rl: round3(bed_rl),
        },
        CanalPoint {
            offset: round3(half_top),
            rl: round3(top_rl),
        },
    ]
}

/// Calculate cutting area and banking area (sq.m) at a cross-section.
pub fn canal_section_areas(data: &CanalData, section: &CanalSection) -> CanalSectionAreas {
    let bed_rl = match canal_bed_level_at(data, section.chainage) {
        Some(rl) => rl,
        None => data.design.bed_level_at_start,
    };
    let depth = canal_section_depth(&data.design);
    let top_rl = bed_rl + depth;
    let ground_rl = canal_ground_level_at(&section.ground, 0.0).unwrap_or(bed_rl);

    // If ground is above bed: cutting is required
    let cutting = if ground_rl > bed_rl {
        let cut_depth = (ground_rl - bed_rl).min(depth);
        let b = data.design.bed_width;
        let s = data.design.side_slope;
        round3(b * cut_depth + s * cut_depth * cut_depth)
    } else {
        0.0
    };

    // If ground is below top level: banking is required
    let fill_depth = (top_rl - ground_rl).max(0.0);
    let left_banking = if fill_depth > 0.0 {
        let b = data.design.left_bank_crest_width;
        let s1 = data.design.side_slope;
        let s2 = data.design.left_bank_outer_slope;
        round3(b * fill_depth + 0.5 * (s1 + s2) * fill_depth * fill_depth)
    } else {
        0.0
    };

    let right_banking = if fill_depth > 0.0 {
        let b = data.design.right_bank_crest_width;
        let s1 = data.design.side_slope;
        let s2 = data.design.right_bank_outer_slope;
        round3(b * fill_depth + 0.5 * (s1 + s2) * fill_depth * fill_depth)
    } else {
        0.0
    };

    CanalSectionAreas {
        cutting,
        left_banking,
        right_banking,
        total_banking: round3(left_banking + right_banking),
    }
}

/// Earthwork totals (cutting volume and banking volume) across all sections.
pub fn canal_earthwork_totals(data: &CanalData) -> CanalEarthworkTotals {
    if data.sections.len() < 2 {
        return CanalEarthworkTotals {
            excavation: 0.0,
            stripping: 0.0,
            foundation_excavation: 0.0,
            cutoff_trench: 0.0,
            total_cutting_volume: 0.0,
            total_banking_volume: 0.0,
        };
    }
    let mut sorted_sections = data.sections.clone();
    sorted_sections.sort_by(|a, b| a.chainage.partial_cmp(&b.chainage).unwrap());

    let areas: Vec<CanalSectionAreas> = sorted_sections
        .iter()
        .map(|s| canal_section_areas(data, s))
        .collect();

    let mut total_cutting = 0.0;
    let mut total_banking = 0.0;

    for i in 1..sorted_sections.len() {
        let length_m = (sorted_sections[i].chainage - sorted_sections[i - 1].chainage).abs();
        if length_m <= 1e-6 {
            continue;
        }
        let mean_cut = (areas[i - 1].cutting + areas[i].cutting) / 2.0;
        let mean_bank = (areas[i - 1].total_banking + areas[i].total_banking) / 2.0;
        total_cutting += mean_cut * length_m;
        total_banking += mean_bank * length_m;
    }

    CanalEarthworkTotals {
        excavation: round3(total_cutting),
        stripping: 0.0,
        foundation_excavation: 0.0,
        cutoff_trench: 0.0,
        total_cutting_volume: round3(total_cutting),
        total_banking_volume: round3(total_banking),
    }
}

pub const CANAL_LINING_DEFAULT_PANEL_M: f64 = 3.5;
pub const CANAL_LINING_DEFAULT_MODEL_WALL_INTERVAL_M: f64 = 17.5;
pub const CANAL_LINING_DEFAULT_STEPS_INTERVAL_M: f64 = 300.0;
pub const CANAL_LINING_DEFAULT_PLUG_SLOPE_SQM: f64 = 40.0;
pub const CANAL_LINING_DEFAULT_PLUG_BED_SQM: f64 = 100.0;
pub const CANAL_LINING_MODEL_WALL_WIDTH_M: f64 = 0.3;
pub const CANAL_LINING_MODEL_WALL_DEPTH_M: f64 = 0.3;
pub const CANAL_LINING_STEPS_WIDTH_M: f64 = 0.45;
pub const CANAL_LINING_STEPS_DEPTH_M: f64 = 0.15;
pub const CANAL_LINING_SOFFIT_THICKNESS_M: f64 = 0.075;
pub const CANAL_LINING_SLEEPER_ROWS: f64 = 2.0;
pub const CANAL_LINING_SLEEPER_WIDTH_M: f64 = 0.3;
pub const CANAL_LINING_SLEEPER_DEPTH_M: f64 = 0.15;
pub const CANAL_LINING_LONGITUDINAL_PANEL_WIDTH_M: f64 = 3.5;

/// Quantities for one canal lining reach.
pub fn canal_lining_reach_quantities(
    data: &CanalData,
    reach: &CanalLiningReach,
) -> CanalLiningReachQuantities {
    let length = (reach.to_chainage - reach.from_chainage).abs();
    let b = data.design.bed_width;
    let d = data.design.full_supply_depth + data.design.free_board;
    let s = data.design.side_slope.max(0.01);
    let slope_length = (1.0 + s * s).sqrt() * d;

    let bed_area = round3(b * length);
    let slope_area = round3(2.0 * slope_length * length);
    let total_area = round3(bed_area + slope_area);
    let thickness_m = reach.thickness_mm.unwrap_or(75.0) / 1000.0;
    let total_volume = round3(total_area * thickness_m);

    CanalLiningReachQuantities {
        bed_lining_area: bed_area,
        slope_lining_area: slope_area,
        total_lining_area: total_area,
        total_lining_volume: total_volume,
    }
}

/// Total lining quantities across all enabled lining reaches.
pub fn canal_lining_totals(data: &CanalData) -> CanalLiningTotals {
    let mut reaches = 0usize;
    let mut total_length = 0.0;
    let mut lining_bed_area = 0.0;
    let mut lining_slope_area = 0.0;
    let mut model_wall_volume = 0.0;
    let mut soffit_volume = 0.0;
    let mut steps_volume = 0.0;
    let mut sleepers_volume = 0.0;
    let mut plugs_slope = 0i64;
    let mut plugs_bed = 0i64;
    let mut mastic_longitudinal = 0.0;
    let mut mastic_transverse = 0.0;
    let mut tarfelt_length = 0.0;

    let b = data.design.bed_width;
    let d = data.design.full_supply_depth + data.design.free_board;
    let s = data.design.side_slope.max(0.01);
    let slope_length = (1.0 + s * s).sqrt() * d;
    let perimeter = b + 2.0 * slope_length;
    let slope_width = 2.0 * slope_length;

    for reach in &data.lining_reaches {
        let is_active = reach.provide.unwrap_or_else(|| reach.enabled.unwrap_or(true));
        if !is_active {
            continue;
        }
        let length = (reach.to_chainage - reach.from_chainage).abs();
        if length <= 1e-6 {
            continue;
        }
        reaches += 1;
        total_length += length;

        let panel_length_m = reach.panel_length_m.filter(|&v| v > 0.0).unwrap_or(CANAL_LINING_DEFAULT_PANEL_M);
        let model_wall_interval_m = reach.model_wall_interval_m.filter(|&v| v > 0.0).unwrap_or(CANAL_LINING_DEFAULT_MODEL_WALL_INTERVAL_M);
        let steps_interval_m = reach.steps_interval_m.filter(|&v| v > 0.0).unwrap_or(CANAL_LINING_DEFAULT_STEPS_INTERVAL_M);
        let plug_slope_sqm = reach.plug_slope_spacing_sqm.filter(|&v| v > 0.0).unwrap_or(CANAL_LINING_DEFAULT_PLUG_SLOPE_SQM);
        let plug_bed_sqm = reach.plug_bed_spacing_sqm.filter(|&v| v > 0.0).unwrap_or(CANAL_LINING_DEFAULT_PLUG_BED_SQM);

        let bed_area = round3(b * length);
        let s_area = round3(slope_width * length);
        let model_wall_count = if length > 0.0 { (length / model_wall_interval_m).floor() as i64 + 2 } else { 0 };
        let mw_vol = round3(model_wall_count as f64 * slope_width * CANAL_LINING_MODEL_WALL_WIDTH_M * CANAL_LINING_MODEL_WALL_DEPTH_M);
        let steps_count = if length > 0.0 { (length / steps_interval_m).ceil() as i64 } else { 0 };
        let soffit_vol = round3(steps_count as f64 * slope_length * CANAL_LINING_STEPS_WIDTH_M * CANAL_LINING_SOFFIT_THICKNESS_M);
        let steps_vol = round3(steps_count as f64 * slope_length * CANAL_LINING_STEPS_WIDTH_M * CANAL_LINING_STEPS_DEPTH_M);
        let sleepers_vol = round3(CANAL_LINING_SLEEPER_ROWS * length * CANAL_LINING_SLEEPER_WIDTH_M * CANAL_LINING_SLEEPER_DEPTH_M);
        let p_slope = (2.0 * slope_length * length / plug_slope_sqm).round() as i64;
        let p_bed = (bed_area / plug_bed_sqm).round() as i64;
        let long_joints = if length > 0.0 { 1.0f64.max((perimeter / CANAL_LINING_LONGITUDINAL_PANEL_WIDTH_M).ceil() - 1.0) } else { 0.0 };
        let mastic_long = round3(long_joints * length);
        let mastic_trans = round3(if length > 0.0 { (length / panel_length_m).ceil() * perimeter } else { 0.0 });
        let tarfelt_len = round3(model_wall_count as f64 * perimeter);

        lining_bed_area += bed_area;
        lining_slope_area += s_area;
        model_wall_volume += mw_vol;
        soffit_volume += soffit_vol;
        steps_volume += steps_vol;
        sleepers_volume += sleepers_vol;
        plugs_slope += p_slope;
        plugs_bed += p_bed;
        mastic_longitudinal += mastic_long;
        mastic_transverse += mastic_trans;
        tarfelt_length += tarfelt_len;
    }

    CanalLiningTotals {
        reaches,
        length: round3(total_length),
        lining_bed_area: round3(lining_bed_area),
        lining_slope_area: round3(lining_slope_area),
        model_wall_volume: round3(model_wall_volume),
        soffit_volume: round3(soffit_volume),
        steps_volume: round3(steps_volume),
        sleepers_volume: round3(sleepers_volume),
        plugs_slope,
        plugs_bed,
        mastic_longitudinal: round3(mastic_longitudinal),
        mastic_transverse: round3(mastic_transverse),
        tarfelt_length: round3(tarfelt_length),
    }
}
