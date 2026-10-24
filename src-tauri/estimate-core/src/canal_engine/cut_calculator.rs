use crate::canal_engine::models::*;

/// Computes the canal bed level at a specific chainage
pub fn calculate_bed_level(bed_level_at_start: f64, bed_slope: f64, chainage: f64) -> f64 {
    (bed_level_at_start - chainage * bed_slope * 1e-4).max(0.0)
}

/// Evaluates manual cut berms + service roads for a section
pub fn evaluate_manual_berms_with_roads(
    cut_height: f64,
    tbl_height: f64,
    cbl: f64,
    chainage: f64,
    berm_config: &CutBermConfig,
    service_roads: &[ServiceRoadInput],
) -> (Vec<ActiveBerm>, Vec<ManualCutBerm>) {
    if !berm_config.enabled || cut_height <= tbl_height {
        return (Vec::new(), berm_config.manual_berms.clone());
    }

    let mut sorted_berms = berm_config.manual_berms.clone();
    sorted_berms.sort_by(|a, b| {
        a.height_above_bed
            .partial_cmp(&b.height_above_bed)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    let mut active = Vec::new();
    let mut discarded = Vec::new();
    let mut idx = 1;

    for b in sorted_berms {
        if b.height_above_bed > tbl_height {
            // Dynamic discard rule: if section's cut height <= berm height, discard!
            if cut_height > b.height_above_bed {
                // Check if any service road matches this berm height
                let matching_road = service_roads.iter().find(|r| {
                    chainage >= r.from_chainage
                        && chainage <= r.to_chainage
                        && (r.height_above_bed - b.height_above_bed).abs() < 0.2
                });

                let base_w = b.width.max(0.5);
                let (left_w, right_w) = if let Some(road) = matching_road {
                    let road_platform = road.width + 2.0 * road.shoulder_width.max(0.0);
                    match road.side.to_lowercase().as_str() {
                        "right" => (base_w, base_w.max(road_platform)),
                        "both" => (base_w.max(road_platform), base_w.max(road_platform)),
                        _ => (base_w.max(road_platform), base_w),
                    }
                } else {
                    (base_w, base_w)
                };

                active.push(ActiveBerm {
                    index: idx,
                    height_above_bed: b.height_above_bed,
                    rl: ((cbl + b.height_above_bed) * 100.0).round() / 100.0,
                    shelf_width: left_w.max(right_w),
                    left_shelf_width: left_w,
                    right_shelf_width: right_w,
                    slope_after: b.slope.max(0.05),
                });
                idx += 1;
            } else {
                discarded.push(b);
            }
        }
    }

    (active, discarded)
}

/// Helper function to retrieve the geotechnical safe cut slope at a given RL elevation
pub fn get_stratum_slope_at_elevation(
    rl: f64,
    hr_top: f64,
    ff_top: f64,
    hdr_top: f64,
    strata_slopes: &StrataSlopeConfig,
) -> f64 {
    if rl < hr_top - 1e-4 {
        strata_slopes.hr_slope
    } else if rl < ff_top - 1e-4 {
        strata_slopes.ff_slope
    } else if rl < hdr_top - 1e-4 {
        strata_slopes.hdr_slope
    } else {
        strata_slopes.all_soils_slope
    }
}

/// Evaluates programmatic cut berms + service roads for a section
pub fn evaluate_programmatic_berms_with_roads(
    cut_height: f64,
    tbl_height: f64,
    cbl: f64,
    chainage: f64,
    berm_config: &CutBermConfig,
    strata_slopes: &StrataSlopeConfig,
    service_roads: &[ServiceRoadInput],
    hr_top: f64,
    ff_top: f64,
    hdr_top: f64,
) -> Vec<ActiveBerm> {
    if !berm_config.enabled || cut_height <= tbl_height {
        return Vec::new();
    }

    let interval = berm_config.interval_m.max(1.0);
    let min_clearance = berm_config.min_top_clearance_m.max(0.5);
    let base_width = berm_config.width.max(0.5);

    let mut active = Vec::new();
    let mut idx = 1;

    // Check if first berm at TBL is placed
    // Berm at TBL requires remaining clearance to ground to be >= min_clearance!
    if berm_config.first_berm_at_tbl {
        let remaining_to_gl = cut_height - tbl_height;
        if remaining_to_gl >= min_clearance {
            let matching_road = service_roads.iter().find(|r| {
                chainage >= r.from_chainage
                    && chainage <= r.to_chainage
                    && (r.height_mode == "tbl" || (r.height_above_bed - tbl_height).abs() < 0.2)
            });

            let (left_w, right_w) = if let Some(road) = matching_road {
                let road_platform = road.width + 2.0 * road.shoulder_width.max(0.0);
                match road.side.to_lowercase().as_str() {
                    "right" => (base_width, base_width.max(road_platform)),
                    "both" => (base_width.max(road_platform), base_width.max(road_platform)),
                    _ => (base_width.max(road_platform), base_width),
                }
            } else {
                (base_width, base_width)
            };

            let berm_rl = ((cbl + tbl_height) * 100.0).round() / 100.0;
            let slope_after = get_stratum_slope_at_elevation(berm_rl, hr_top, ff_top, hdr_top, strata_slopes).max(0.05);

            active.push(ActiveBerm {
                index: idx,
                height_above_bed: tbl_height,
                rl: berm_rl,
                shelf_width: left_w.max(right_w),
                left_shelf_width: left_w,
                right_shelf_width: right_w,
                slope_after,
            });
            idx += 1;
        }
    }

    // Subsequent berms at interval
    let mut candidate_h = if berm_config.first_berm_at_tbl {
        tbl_height + interval
    } else {
        interval.max(tbl_height)
    };

    while candidate_h < cut_height {
        let remaining_to_gl = cut_height - candidate_h;
        if remaining_to_gl >= min_clearance {
            let matching_road = service_roads.iter().find(|r| {
                chainage >= r.from_chainage
                    && chainage <= r.to_chainage
                    && (r.height_above_bed - candidate_h).abs() < 0.2
            });

            let (left_w, right_w) = if let Some(road) = matching_road {
                let road_platform = road.width + 2.0 * road.shoulder_width.max(0.0);
                match road.side.to_lowercase().as_str() {
                    "right" => (base_width, base_width.max(road_platform)),
                    "both" => (base_width.max(road_platform), base_width.max(road_platform)),
                    _ => (base_width.max(road_platform), base_width),
                }
            } else {
                (base_width, base_width)
            };

            let berm_rl = ((cbl + candidate_h) * 100.0).round() / 100.0;
            let slope_after = get_stratum_slope_at_elevation(berm_rl, hr_top, ff_top, hdr_top, strata_slopes).max(0.05);

            active.push(ActiveBerm {
                index: idx,
                height_above_bed: (candidate_h * 100.0).round() / 100.0,
                rl: berm_rl,
                shelf_width: left_w.max(right_w),
                left_shelf_width: left_w,
                right_shelf_width: right_w,
                slope_after,
            });
            idx += 1;
        }
        candidate_h += interval;
    }

    active
}

/// Helper struct for geological stratum horizon
struct StratumHorizon {
    name: &'static str,
    bottom_rl: f64,
    top_rl: f64,
}

/// Computes the complete bottom-up trapezoidal tier breakdown with strata slicing
pub fn compute_section_cut(
    input: &CanalCuttingInput,
    sec: &SectionInput,
) -> SectionCutResult {
    let cbl = sec.bed_level.unwrap_or_else(|| {
        calculate_bed_level(input.bed_level_at_start, input.bed_slope, sec.chainage)
    });

    let tbl_height = input.full_supply_depth + input.free_board;
    let tbl_level = cbl + tbl_height;
    let gl = sec.ground_level;
    let cut_depth = (gl - cbl).max(0.0);
    let cut_depth_above_tbl = (gl - tbl_level).max(0.0);

    // If section has no cutting (filling/embankment section)
    if cut_depth <= 0.001 {
        return SectionCutResult {
            section_id: sec.id.clone(),
            chainage: sec.chainage,
            ground_level: gl,
            bed_level: cbl,
            tbl_level,
            cut_depth: 0.0,
            cut_depth_above_tbl: 0.0,
            active_berms: Vec::new(),
            discarded_berms: Vec::new(),
            tiers: Vec::new(),
            total_cut_area: 0.0,
            strata_areas: StrataBreakdown {
                soil_area: 0.0,
                hdr_area: 0.0,
                ff_area: 0.0,
                hr_area: 0.0,
            },
            diagram_svg: String::new(),
        };
    }

    // Build the geological strata horizons from CBL up to GL
    // Strata thicknesses (either entered explicitly or derived from percentages)
    let (soil_t, hdr_t, ff_t, hr_t) = if sec.soil_depth.is_some()
        || sec.hdr_depth.is_some()
        || sec.ff_depth.is_some()
        || sec.hr_depth.is_some()
    {
        (
            sec.soil_depth.unwrap_or(0.0).max(0.0),
            sec.hdr_depth.unwrap_or(0.0).max(0.0),
            sec.ff_depth.unwrap_or(0.0).max(0.0),
            sec.hr_depth.unwrap_or(0.0).max(0.0),
        )
    } else {
        // Derive thicknesses from percentages over total cut depth
        let s_pct = sec.soil_pct.unwrap_or(100.0) / 100.0;
        let h_pct = sec.hdr_pct.unwrap_or(0.0) / 100.0;
        let f_pct = sec.ff_pct.unwrap_or(0.0) / 100.0;
        let r_pct = sec.hr_pct.unwrap_or(0.0) / 100.0;
        let sum_pct = (s_pct + h_pct + f_pct + r_pct).max(1e-6);

        (
            cut_depth * (s_pct / sum_pct),
            cut_depth * (h_pct / sum_pct),
            cut_depth * (f_pct / sum_pct),
            cut_depth * (r_pct / sum_pct),
        )
    };

    // Geological horizons stack from bottom to top:
    // HR is at bottom (from CBL upwards by hr_t)
    // F&F above HR (by ff_t)
    // HDR above F&F (by hdr_t)
    // All Soils above HDR (by soil_t up to GL)
    let hr_bot = cbl;
    let hr_top = hr_bot + hr_t;
    let ff_bot = hr_top;
    let ff_top = ff_bot + ff_t;
    let hdr_bot = ff_top;
    let hdr_top = hdr_bot + hdr_t;
    let soil_bot = hdr_top;
    let soil_top = gl.max(soil_bot + soil_t);

    let horizons = [
        StratumHorizon {
            name: "Hard Rock",
            bottom_rl: hr_bot,
            top_rl: hr_top,
        },
        StratumHorizon {
            name: "F&F Rock",
            bottom_rl: ff_bot,
            top_rl: ff_top,
        },
        StratumHorizon {
            name: "HDR",
            bottom_rl: hdr_bot,
            top_rl: hdr_top,
        },
        StratumHorizon {
            name: "All Soils",
            bottom_rl: soil_bot,
            top_rl: soil_top,
        },
    ];

    // Determine active berms / benches
    let (active_berms, discarded_berms) = if input.berm_config.enabled {
        match input.berm_config.mode {
            CutBermMode::Manual => evaluate_manual_berms_with_roads(
                cut_depth,
                tbl_height,
                cbl,
                sec.chainage,
                &input.berm_config,
                &input.service_roads,
            ),
            CutBermMode::Programmatic => {
                let act = evaluate_programmatic_berms_with_roads(
                    cut_depth,
                    tbl_height,
                    cbl,
                    sec.chainage,
                    &input.berm_config,
                    &input.strata_slopes,
                    &input.service_roads,
                    hr_top,
                    ff_top,
                    hdr_top,
                );
                (act, Vec::new())
            }
        }
    } else {
        (Vec::new(), Vec::new())
    };

    // Determine the vertical Tier Boundaries:
    // Tier 1 is ALWAYS the Canal Core Waterway Prism: CBL to min(TBL, GL) or CBL to Berm 1
    // Tiers are created strictly by CBL, the elevations of active berms, and GL!
    let mut tier_elevations = Vec::new();
    tier_elevations.push(cbl);

    for b in &active_berms {
        if b.rl > cbl + 0.05 && b.rl < gl - 0.05 {
            tier_elevations.push(b.rl);
        }
    }
    tier_elevations.push(gl);
    tier_elevations.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    tier_elevations.dedup_by(|a, b| (*a - *b).abs() < 0.05);

    let mut tiers: Vec<TrapezoidTier> = Vec::new();
    let mut running_bottom_width = input.bed_width;

    for i in 0..(tier_elevations.len() - 1) {
        let t_bot = tier_elevations[i];
        let t_top = tier_elevations[i + 1];
        let t_depth = (t_top - t_bot).max(0.0);
        if t_depth <= 1e-4 {
            continue;
        }

        let tier_idx = tiers.len() + 1;

        let is_full_cut = gl >= tbl_level - 0.05;
        // Tier 1 (i == 0) is ALWAYS the Canal Core Waterway channel prism:
        let is_core_prism = i == 0;

        let tier_name = if tier_elevations.len() == 2 {
            if is_full_cut {
                "Trapezoid 1: Full Cut Prism (Bed to GL)".to_string()
            } else {
                "Trapezoid 1: Partial Cut Prism (Bed to GL)".to_string()
            }
        } else if i == 0 {
            format!("Trapezoid 1: Core Water Prism (Bed to TBL @ {:.2}m RL)", t_top)
        } else if i == tier_elevations.len() - 2 {
            format!("Trapezoid {}: Top Tier (to GL)", tier_idx)
        } else {
            format!("Trapezoid {}: Bench Tier (RL {:.2}m to {:.2}m)", tier_idx, t_bot, t_top)
        };

        // Side slope for this tier:
        // Tier 1 (CBL to min(TBL, GL)) is the canal water channel; it MUST ALWAYS use input.side_slope!
        // Subsequent tiers above TBL use the active berm's slope_after or manual base slope.
        let tier_slope = if is_core_prism {
            input.side_slope
        } else {
            active_berms
                .iter()
                .filter(|b| b.rl <= t_bot + 0.05)
                .last()
                .map(|b| b.slope_after)
                .unwrap_or(input.berm_config.manual_base_slope)
        };

        let tier_start_width = running_bottom_width;
        let mut curr_slice_bottom_w = tier_start_width;
        let mut strata_slices = Vec::new();
        let mut tier_total_area = 0.0;

        // Slice through each geological stratum from bottom to top within this tier
        for h in &horizons {
            let s_bot = t_bot.max(h.bottom_rl);
            let s_top = t_top.min(h.top_rl);
            let s_depth = (s_top - s_bot).max(0.0);

            if s_depth > 1e-4 {
                let slope = if is_core_prism {
                    // Inside canal core waterway prism: MUST follow hydraulic design side slope!
                    input.side_slope
                } else if input.berm_config.mode == CutBermMode::Manual {
                    tier_slope
                } else {
                    // In Programmatic Design above TBL: governed by geotechnical safe strata slopes!
                    match h.name {
                        "Hard Rock" => input.strata_slopes.hr_slope,
                        "F&F Rock" => input.strata_slopes.ff_slope,
                        "HDR" => input.strata_slopes.hdr_slope,
                        _ => input.strata_slopes.all_soils_slope,
                    }
                };

                let slice_top_w = curr_slice_bottom_w + 2.0 * slope * s_depth;
                let slice_mean_w = (curr_slice_bottom_w + slice_top_w) / 2.0;
                let slice_area = slice_mean_w * s_depth;

                tier_total_area += slice_area;

                strata_slices.push(StratumSlice {
                    stratum_name: h.name.to_string(),
                    bottom_rl: (s_bot * 100.0).round() / 100.0,
                    top_rl: (s_top * 100.0).round() / 100.0,
                    depth: (s_depth * 1000.0).round() / 1000.0,
                    bottom_width: (curr_slice_bottom_w * 100.0).round() / 100.0,
                    top_width: (slice_top_w * 100.0).round() / 100.0,
                    slope,
                    area: (slice_area * 1000.0).round() / 1000.0,
                });

                curr_slice_bottom_w = slice_top_w;
            }
        }

        let tier_ending_top_w = curr_slice_bottom_w;

        // Check if there is a berm / bench at t_top
        let matching_berm = active_berms.iter().find(|b| (b.rl - t_top).abs() < 0.05);
        let has_berm = matching_berm.is_some();
        let left_shelf_w = matching_berm.map(|b| b.left_shelf_width).unwrap_or(0.0);
        let right_shelf_w = matching_berm.map(|b| b.right_shelf_width).unwrap_or(0.0);

        tiers.push(TrapezoidTier {
            tier_index: tier_idx,
            tier_name,
            bottom_rl: (t_bot * 100.0).round() / 100.0,
            top_rl: (t_top * 100.0).round() / 100.0,
            total_depth: (t_depth * 1000.0).round() / 1000.0,
            starting_bottom_width: (tier_start_width * 100.0).round() / 100.0,
            ending_top_width: (tier_ending_top_w * 100.0).round() / 100.0,
            strata_slices,
            total_tier_area: (tier_total_area * 1000.0).round() / 1000.0,
            left_shelf_width: left_shelf_w,
            right_shelf_width: right_shelf_w,
            has_berm,
        });

        // Advance running bottom width for the next tier:
        // Top width of this tier + Left Berm shelf + Right Berm shelf!
        running_bottom_width = tier_ending_top_w + left_shelf_w + right_shelf_w;
    }

    let total_cut_area: f64 = tiers.iter().map(|t| t.total_tier_area).sum();

    // Strata totals across all tiers
    let mut soil_area = 0.0;
    let mut hdr_area = 0.0;
    let mut ff_area = 0.0;
    let mut hr_area = 0.0;

    for t in &tiers {
        for s in &t.strata_slices {
            match s.stratum_name.as_str() {
                "All Soils" => soil_area += s.area,
                "HDR" => hdr_area += s.area,
                "F&F Rock" => ff_area += s.area,
                "Hard Rock" => hr_area += s.area,
                _ => {}
            }
        }
    }

    let strata_areas = StrataBreakdown {
        soil_area: (soil_area * 1000.0).round() / 1000.0,
        hdr_area: (hdr_area * 1000.0).round() / 1000.0,
        ff_area: (ff_area * 1000.0).round() / 1000.0,
        hr_area: (hr_area * 1000.0).round() / 1000.0,
    };

    let mut res = SectionCutResult {
        section_id: sec.id.clone(),
        chainage: sec.chainage,
        ground_level: gl,
        bed_level: cbl,
        tbl_level,
        cut_depth: (cut_depth * 100.0).round() / 100.0,
        cut_depth_above_tbl: (cut_depth_above_tbl * 100.0).round() / 100.0,
        active_berms,
        discarded_berms,
        tiers,
        total_cut_area: (total_cut_area * 1000.0).round() / 1000.0,
        strata_areas,
        diagram_svg: String::new(),
    };

    res.diagram_svg = crate::canal_engine::diagram::generate_cutting_section_svg(input, &res);
    res
}

/// Evaluates all sections, groups contiguous sections into Cutting Reaches,
/// and calculates reach volumes.
pub fn calculate_canal_cutting(
    input: &CanalCuttingInput,
) -> CanalCuttingCalculationResponse {
    let tbl_height = input.full_supply_depth + input.free_board;

    let mut section_results = Vec::with_capacity(input.sections.len());
    let mut max_tiers = 0;

    for sec in &input.sections {
        let res = compute_section_cut(input, sec);
        if res.tiers.len() > max_tiers {
            max_tiers = res.tiers.len();
        }
        section_results.push(res);
    }

    // Reach Grouping: For canal cutting, the entire canal is evaluated as one continuous
    // reach from start to end. Strata and trapezoids adapt dynamically per section,
    // while zero-cut spans naturally contribute 0.0 area and volume.
    let mut reaches: Vec<CuttingReach> = Vec::new();
    let n = section_results.len();

    if n > 0 {
        let from_ch = section_results[0].chainage;
        let to_ch = section_results[n - 1].chainage;
        let length_m = (to_ch - from_ch).abs();

        let mut total_vol = 0.0;
        let mut total_soil_vol = 0.0;
        let mut total_hdr_vol = 0.0;
        let mut total_ff_vol = 0.0;
        let mut total_hr_vol = 0.0;

        for k in 1..n {
            let s_prev = &section_results[k - 1];
            let s_curr = &section_results[k];
            let dx = (s_curr.chainage - s_prev.chainage).abs();

            let mean_area = (s_prev.total_cut_area + s_curr.total_cut_area) / 2.0;
            total_vol += mean_area * dx;

            let mean_soil = (s_prev.strata_areas.soil_area + s_curr.strata_areas.soil_area) / 2.0;
            let mean_hdr = (s_prev.strata_areas.hdr_area + s_curr.strata_areas.hdr_area) / 2.0;
            let mean_ff = (s_prev.strata_areas.ff_area + s_curr.strata_areas.ff_area) / 2.0;
            let mean_hr = (s_prev.strata_areas.hr_area + s_curr.strata_areas.hr_area) / 2.0;

            total_soil_vol += mean_soil * dx;
            total_hdr_vol += mean_hdr * dx;
            total_ff_vol += mean_ff * dx;
            total_hr_vol += mean_hr * dx;
        }

        let max_berms = section_results
            .iter()
            .map(|s| s.active_berms.len())
            .max()
            .unwrap_or(0);

        let mut active_berm_elevations: Vec<f64> = section_results
            .iter()
            .flat_map(|s| s.active_berms.iter().map(|b| b.rl))
            .collect();
        active_berm_elevations.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        active_berm_elevations.dedup_by(|a, b| (*a - *b).abs() < 1e-4);

        reaches.push(CuttingReach {
            reach_index: 1,
            reach_name: format!(
                "Canal Earthwork Excavation (Full Reach: Ch {:.1} m to Ch {:.1} m)",
                from_ch, to_ch
            ),
            from_chainage: from_ch,
            to_chainage: to_ch,
            length_m: (length_m * 100.0).round() / 100.0,
            berm_count: max_berms,
            active_berm_elevations,
            section_count: n,
            section_indices: (0..n).collect(),
            total_volume_m3: (total_vol * 100.0).round() / 100.0,
            soil_volume_m3: (total_soil_vol * 100.0).round() / 100.0,
            hdr_volume_m3: (total_hdr_vol * 100.0).round() / 100.0,
            ff_volume_m3: (total_ff_vol * 100.0).round() / 100.0,
            hr_volume_m3: (total_hr_vol * 100.0).round() / 100.0,
        });
    }

    let total_cutting_volume_m3: f64 = reaches.iter().map(|r| r.total_volume_m3).sum();
    let total_soil_volume_m3: f64 = reaches.iter().map(|r| r.soil_volume_m3).sum();
    let total_hdr_volume_m3: f64 = reaches.iter().map(|r| r.hdr_volume_m3).sum();
    let total_ff_volume_m3: f64 = reaches.iter().map(|r| r.ff_volume_m3).sum();
    let total_hr_volume_m3: f64 = reaches.iter().map(|r| r.hr_volume_m3).sum();

    CanalCuttingCalculationResponse {
        tbl_height,
        max_tiers_count: max_tiers,
        reaches,
        sections: section_results,
        total_cutting_volume_m3: (total_cutting_volume_m3 * 100.0).round() / 100.0,
        total_soil_volume_m3: (total_soil_volume_m3 * 100.0).round() / 100.0,
        total_hdr_volume_m3: (total_hdr_volume_m3 * 100.0).round() / 100.0,
        total_ff_volume_m3: (total_ff_volume_m3 * 100.0).round() / 100.0,
        total_hr_volume_m3: (total_hr_volume_m3 * 100.0).round() / 100.0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dynamic_strata_trapezoids_bottom_up() {
        let input = CanalCuttingInput {
            bed_width: 10.0,
            full_supply_depth: 1.5,
            free_board: 0.6, // TBL = 2.1m
            side_slope: 1.5,
            bed_slope: 0.0,
            bed_level_at_start: 100.0,
            berm_config: CutBermConfig {
                enabled: true,
                mode: CutBermMode::Manual,
                manual_base_slope: 1.5,
                manual_berms: vec![ManualCutBerm {
                    id: "b1".into(),
                    height_above_bed: 6.0,
                    width: 2.0,
                    slope: 1.0,
                }],
                ..Default::default()
            },
            strata_slopes: StrataSlopeConfig {
                all_soils_slope: 1.5,
                hdr_slope: 1.0,
                ff_slope: 0.75,
                hr_slope: 0.5,
            },
            service_roads: Vec::new(),
            sections: vec![SectionInput {
                id: "sec-1".into(),
                chainage: 0.0,
                ground_level: 108.0, // Cut depth = 8.0m > 6.0m
                bed_level: Some(100.0),
                soil_depth: Some(2.0),
                hdr_depth: Some(2.0),
                ff_depth: Some(2.0),
                hr_depth: Some(2.0),
                soil_pct: None,
                hdr_pct: None,
                ff_pct: None,
                hr_pct: None,
            }],
        };

        let res = compute_section_cut(&input, &input.sections[0]);
        // Benches: Berm 1 (106.0m), GL (108.0m) -> 2 Tiers (slope unbroken between Bed and Berm 1)!
        assert_eq!(res.tiers.len(), 2);
        assert_eq!(res.tiers[0].starting_bottom_width, 10.0);
        assert_eq!(res.tiers[0].ending_top_width, 28.0);
        assert_eq!(res.tiers[0].total_depth, 6.0);

        // At Berm 1 (top of Tier 1), shelf of 2.0m on each side is added:
        assert!(res.tiers[0].has_berm);
        assert_eq!(res.tiers[0].left_shelf_width, 2.0);
        assert_eq!(
            res.tiers[1].starting_bottom_width,
            res.tiers[0].ending_top_width + 4.0
        );
        assert_eq!(res.tiers[1].starting_bottom_width, 32.0);
        assert_eq!(res.tiers[1].ending_top_width, 36.0);
        assert_eq!(res.tiers[1].total_depth, 2.0);

        assert!(res.total_cut_area > 0.0);
        assert!(res.strata_areas.hr_area > 0.0);
        assert!(res.strata_areas.ff_area > 0.0);
    }

    #[test]
    fn test_service_road_widens_berm_shelf() {
        let input = CanalCuttingInput {
            bed_width: 10.0,
            full_supply_depth: 1.5,
            free_board: 0.6,
            side_slope: 1.5,
            bed_slope: 0.0,
            bed_level_at_start: 100.0,
            berm_config: CutBermConfig {
                enabled: true,
                mode: CutBermMode::Manual,
                manual_berms: vec![ManualCutBerm {
                    id: "b1".into(),
                    height_above_bed: 6.0,
                    width: 2.0, // Berm shelf is 2.0m
                    slope: 1.0,
                }],
                ..Default::default()
            },
            strata_slopes: StrataSlopeConfig::default(),
            service_roads: vec![ServiceRoadInput {
                id: "sr-1".into(),
                from_chainage: 0.0,
                to_chainage: 100.0,
                side: "left".into(),
                height_mode: "bed".into(),
                height_above_bed: 6.0, // lands on Berm 1
                width: 3.5,            // road is 3.5m + 2x0.5m shoulder = 4.5m
                shoulder_width: 0.5,
            }],
            sections: vec![SectionInput {
                id: "s1".into(),
                chainage: 50.0,
                ground_level: 110.0,
                bed_level: Some(100.0),
                soil_depth: None,
                hdr_depth: None,
                ff_depth: None,
                hr_depth: None,
                soil_pct: Some(100.0),
                hdr_pct: None,
                ff_pct: None,
                hr_pct: None,
            }],
        };

        let res = compute_section_cut(&input, &input.sections[0]);
        assert_eq!(res.active_berms.len(), 1);
        // Shelf width expanded to max(2.0, 3.5 + 2*0.5 = 4.5) = 4.5m
        assert_eq!(res.active_berms[0].shelf_width, 4.5);
    }

    #[test]
    fn test_programmatic_soil_wise_slopes() {
        let input = CanalCuttingInput {
            bed_width: 8.0,
            full_supply_depth: 1.5,
            free_board: 0.6, // TBL = 2.10m
            side_slope: 1.5,
            bed_slope: 0.0,
            bed_level_at_start: 100.0,
            berm_config: CutBermConfig {
                enabled: true,
                mode: CutBermMode::Programmatic,
                first_berm_at_tbl: true,
                interval_m: 6.0,
                min_top_clearance_m: 2.0,
                width: 2.0,
                ..Default::default()
            },
            strata_slopes: StrataSlopeConfig {
                all_soils_slope: 1.5,
                hdr_slope: 0.75,
                ff_slope: 0.50,
                hr_slope: 0.25,
            },
            service_roads: Vec::new(),
            sections: vec![SectionInput {
                id: "sec-prog".into(),
                chainage: 0.0,
                ground_level: 108.0, // Cut depth = 8.0m
                bed_level: Some(100.0),
                soil_depth: Some(2.0), // 106.0 to 108.0 (Soil)
                hdr_depth: Some(2.0),  // 104.0 to 106.0 (HDR)
                ff_depth: Some(2.0),   // 102.0 to 104.0 (F&F)
                hr_depth: Some(2.0),   // 100.0 to 102.0 (HR)
                soil_pct: None,
                hdr_pct: None,
                ff_pct: None,
                hr_pct: None,
            }],
        };

        let res = compute_section_cut(&input, &input.sections[0]);
        // Berm 1 at TBL (102.10m RL) is active because 8.0 - 2.1 = 5.9 >= min clearance (2.0)
        assert_eq!(res.active_berms.len(), 1);
        let berm1 = &res.active_berms[0];
        assert_eq!(berm1.rl, 102.10);
        // At 102.10m, stratum is F&F (102.0 to 104.0) -> slope_after is ff_slope (0.50)
        assert_eq!(berm1.slope_after, 0.50);

        // Check tier 2 strata slices (above Berm 1):
        // F&F slice from 102.10 to 104.0 has slope 0.50
        // HDR slice from 104.0 to 106.0 has slope 0.75
        // All Soils slice from 106.0 to 108.0 has slope 1.50
        assert_eq!(res.tiers.len(), 2);
        let tier2 = &res.tiers[1];
        let ff_slice = tier2.strata_slices.iter().find(|s| s.stratum_name == "F&F Rock").unwrap();
        assert_eq!(ff_slice.slope, 0.50);

        let hdr_slice = tier2.strata_slices.iter().find(|s| s.stratum_name == "HDR").unwrap();
        assert_eq!(hdr_slice.slope, 0.75);

        let soil_slice = tier2.strata_slices.iter().find(|s| s.stratum_name == "All Soils").unwrap();
        assert_eq!(soil_slice.slope, 1.50);
    }

    #[test]
    fn test_user_section_ch25_water_prism_protected() {
        // Reproduce CH 25.0m from user image: B = 3.0, FSD = 1.5, FB = 0.6 -> TBL = 2.1m (97.10m RL)
        // CBL = 95.0, GL = 100.0 (Cut depth = 5.0m). Stratum is 100% Hard Rock.
        let input = CanalCuttingInput {
            bed_width: 3.0,
            full_supply_depth: 1.5,
            free_board: 0.6,
            side_slope: 1.5,
            bed_slope: 0.0,
            bed_level_at_start: 95.0,
            berm_config: CutBermConfig {
                enabled: true,
                mode: CutBermMode::Programmatic,
                first_berm_at_tbl: true,
                interval_m: 6.0,
                min_top_clearance_m: 7.5,
                width: 2.0,
                ..Default::default()
            },
            strata_slopes: StrataSlopeConfig {
                all_soils_slope: 1.5,
                hdr_slope: 0.75,
                ff_slope: 0.50,
                hr_slope: 0.25,
            },
            service_roads: Vec::new(),
            sections: vec![SectionInput {
                id: "ch25".into(),
                chainage: 25.0,
                ground_level: 100.0,
                bed_level: Some(95.0),
                soil_depth: None,
                hdr_depth: None,
                ff_depth: None,
                hr_depth: Some(5.0), // 100% Hard rock
                soil_pct: None,
                hdr_pct: None,
                ff_pct: None,
                hr_pct: None,
            }],
        };

        // Case A: min_top_clearance_m = 7.5m. Since cut above TBL (2.9m) < 7.5m, Berm 1 MUST NOT be placed!
        let res_no_berm = compute_section_cut(&input, &input.sections[0]);
        assert_eq!(res_no_berm.active_berms.len(), 0, "No berm should be placed when clearance < 7.5m");
        assert_eq!(res_no_berm.tiers.len(), 1, "Should be single tier Bed to GL when no berm exists");
        let single_tier = &res_no_berm.tiers[0];
        assert_eq!(single_tier.starting_bottom_width, 3.0);
        // Ending top width = 3.0 + 2 * 1.5 * 5.0 = 18.00m
        assert_eq!(single_tier.ending_top_width, 18.0);
        assert_eq!(single_tier.strata_slices[0].slope, 1.5);
        assert_eq!(single_tier.has_berm, false);

        // Case B: min_top_clearance_m = 2.0m. Cut above TBL (2.9m) >= 2.0m, so Berm 1 IS placed at TBL!
        let mut input_with_berm = input.clone();
        input_with_berm.berm_config.min_top_clearance_m = 2.0;

        let res = compute_section_cut(&input_with_berm, &input_with_berm.sections[0]);
        // 1. Berm 1 at TBL (97.10m) must be active!
        assert_eq!(res.active_berms.len(), 1);
        assert_eq!(res.active_berms[0].rl, 97.10);
        assert_eq!(res.active_berms[0].shelf_width, 2.0);
        assert_eq!(res.active_berms[0].slope_after, 0.25);

        // 2. Exactly 2 Tiers: Tier 1 (Bed to TBL) and Tier 2 (TBL to GL)
        assert_eq!(res.tiers.len(), 2);

        // Tier 1 (Canal Waterway Prism):
        let tier1 = &res.tiers[0];
        assert_eq!(tier1.starting_bottom_width, 3.0);
        // Top width at 97.10m: 3.0 + 2 * 1.5 * 2.1 = 9.30m
        assert_eq!(tier1.ending_top_width, 9.30);
        assert_eq!(tier1.strata_slices[0].slope, 1.5); // CANAL SIDE SLOPE!
        assert_eq!(tier1.has_berm, true);
        assert_eq!(tier1.left_shelf_width, 2.0);

        // Tier 2 (Deep Rock Cut above TBL):
        let tier2 = &res.tiers[1];
        // Starting width = 9.30 + 2 * 2.0 (shelf) = 13.30m
        assert_eq!(tier2.starting_bottom_width, 13.30);
        assert_eq!(tier2.strata_slices[0].slope, 0.25); // HARD ROCK SLOPE!
        // Top width at 100.0m: 13.30 + 2 * 0.25 * 2.9 = 14.75m
        assert_eq!(tier2.ending_top_width, 14.75);

        // Water prism at FSL (1.5m depth) has width = 3.0 + 2 * 1.5 * 1.5 = 7.50m
        // Tier 1 top width at 97.1m is 9.30m >= 7.50m! Water never hangs outside!
        assert!(tier1.ending_top_width >= 7.50);
    }
}
