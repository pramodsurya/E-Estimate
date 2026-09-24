use super::models::*;

#[inline]
pub fn round3(v: f64) -> f64 {
    (v * 1000.0).round() / 1000.0
}

/// Total depth of the canal section: Full Supply Depth + Freeboard.
pub fn canal_section_depth(design: &CanalDesign) -> f64 {
    round3(design.full_supply_depth + design.free_board)
}

/// Top width of the canal prism at the bank top level (TBL).
pub fn canal_top_width(design: &CanalDesign) -> f64 {
    let depth = canal_section_depth(design);
    round3(design.bed_width + 2.0 * (design.side_slope * depth))
}

/// Wetted perimeter at Full Supply Level (FSL).
pub fn canal_wetted_perimeter(design: &CanalDesign) -> f64 {
    let d = design.full_supply_depth;
    let s = design.side_slope;
    round3(design.bed_width + 2.0 * d * (1.0 + s * s).sqrt())
}

/// Recommended bank crest width (m) as a function of design discharge Q (cumecs)
/// per Indian Standards (IS 7112 / IS 10430).
pub fn recommended_canal_crest_width(discharge: f64) -> f64 {
    if discharge < 0.5 {
        1.0
    } else if discharge < 1.5 {
        1.5
    } else if discharge < 3.0 {
        2.0
    } else if discharge < 10.0 {
        2.5
    } else if discharge < 30.0 {
        3.0
    } else {
        4.0
    }
}

/// Recommended in-situ CC lining thickness (mm) per IS 3873 based on discharge Q.
pub fn lining_thickness_for_discharge(discharge_cumecs: f64) -> f64 {
    if discharge_cumecs < 5.0 {
        50.0
    } else if discharge_cumecs < 20.0 {
        60.0
    } else if discharge_cumecs < 50.0 {
        75.0
    } else {
        100.0
    }
}

/// Canal coping width (m) based on design discharge Q.
pub fn canal_coping_width_for_discharge(discharge_cumecs: f64) -> f64 {
    if discharge_cumecs < 10.0 {
        0.45
    } else if discharge_cumecs < 50.0 {
        0.60
    } else {
        0.75
    }
}

/// Longitudinal design bed RL at any chainage along the canal.
pub fn canal_bed_level_at(data: &CanalData, chainage: f64) -> Option<f64> {
    let start_rl = data.design.bed_level_at_start;
    let slope = data.design.bed_slope;
    if slope <= 0.0 {
        return Some(start_rl);
    }
    let fall = chainage / slope;
    let rl = match data.flow_direction {
        CanalFlowDirection::StartToEnd => start_rl - fall,
        CanalFlowDirection::EndToStart => start_rl + fall,
    };
    Some(round3(rl))
}
