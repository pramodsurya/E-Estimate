pub mod earthwork;
pub mod hydraulics;
pub mod models;

pub use earthwork::*;
pub use hydraulics::*;
pub use models::*;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_canal_hydraulics() {
        let design = CanalDesign {
            bed_level_at_start: 100.0,
            discharge: 12.0,
            bed_width: 4.0,
            full_supply_depth: 1.8,
            free_board: 0.6,
            bed_slope: 5000.0, // 1 in 5000
            side_slope: 1.5,   // 1.5H : 1V
            left_bank_crest_width: 2.5,
            left_bank_outer_slope: 2.0,
            right_bank_crest_width: 2.5,
            right_bank_outer_slope: 2.0,
            berms: Vec::new(),
            service_road_reaches: Vec::new(),
            bank_section_type: "homogeneous".into(),
            hearting_level_offset_from_fsl: 0.0,
            minimum_hearting_height: 0.0,
            hearting_top_width: 0.0,
            hearting_left_slope: 0.0,
            hearting_right_slope: 0.0,
            hearting_trench_enabled: false,
            hearting_trench_width: 0.0,
            hearting_trench_left_slope: 0.0,
            hearting_trench_right_slope: 0.0,
            bank_material_allocations: Vec::new(),
            bill_bank_formation: true,
            bill_bank_compaction: true,
            bill_hearting: false,
            bill_casing: false,
            bill_hearting_trench: false,
            offtake: "".into(),
        };

        // Total depth = 1.8 + 0.6 = 2.4
        let depth = canal_section_depth(&design);
        assert_eq!(depth, 2.4);

        // Top width = 4.0 + 2 * (1.5 * 2.4) = 4.0 + 7.2 = 11.2
        let top_w = canal_top_width(&design);
        assert_eq!(top_w, 11.2);

        // Wetted perimeter = 4.0 + 2 * 1.8 * sqrt(1 + 1.5^2) = 4.0 + 3.6 * 1.8027756 = 4.0 + 6.48999 = 10.49
        let p = canal_wetted_perimeter(&design);
        assert!((p - 10.49).abs() < 1e-2);

        // Q = 12.0 cumecs -> recommended crest width = 3.0 m (for 10 <= Q < 30)
        assert_eq!(recommended_canal_crest_width(design.discharge), 3.0);

        // Q = 12.0 cumecs -> lining thickness = 60 mm (for 5 <= Q < 20)
        assert_eq!(lining_thickness_for_discharge(design.discharge), 60.0);
    }

    #[test]
    fn test_canal_bed_fall() {
        let design = CanalDesign {
            bed_level_at_start: 100.0,
            discharge: 5.0,
            bed_width: 2.0,
            full_supply_depth: 1.0,
            free_board: 0.5,
            bed_slope: 1000.0, // 1m drop every 1000m
            side_slope: 1.5,
            left_bank_crest_width: 2.0,
            left_bank_outer_slope: 1.5,
            right_bank_crest_width: 2.0,
            right_bank_outer_slope: 1.5,
            berms: Vec::new(),
            service_road_reaches: Vec::new(),
            bank_section_type: "homogeneous".into(),
            hearting_level_offset_from_fsl: 0.0,
            minimum_hearting_height: 0.0,
            hearting_top_width: 0.0,
            hearting_left_slope: 0.0,
            hearting_right_slope: 0.0,
            hearting_trench_enabled: false,
            hearting_trench_width: 0.0,
            hearting_trench_left_slope: 0.0,
            hearting_trench_right_slope: 0.0,
            bank_material_allocations: Vec::new(),
            bill_bank_formation: true,
            bill_bank_compaction: false,
            bill_hearting: false,
            bill_casing: false,
            bill_hearting_trench: false,
            offtake: "".into(),
        };

        let data = CanalData {
            configured: true,
            mode: CanalMode::New,
            flow_direction: CanalFlowDirection::StartToEnd,
            length_m: 500.0,
            interval_m: 100.0,
            design,
            sections: Vec::new(),
            lining_reaches: Vec::new(),
        };

        // At ch = 0 -> 100.0
        assert_eq!(canal_bed_level_at(&data, 0.0), Some(100.0));
        // At ch = 500 -> 100.0 - 500/1000 = 99.5
        assert_eq!(canal_bed_level_at(&data, 500.0), Some(99.5));
    }

    #[test]
    fn test_canal_earthwork_and_lining() {
        let design = CanalDesign {
            bed_level_at_start: 100.0,
            discharge: 5.0,
            bed_width: 2.0,
            full_supply_depth: 1.0,
            free_board: 0.5,
            bed_slope: 1000.0,
            side_slope: 1.0,
            left_bank_crest_width: 2.0,
            left_bank_outer_slope: 1.5,
            right_bank_crest_width: 2.0,
            right_bank_outer_slope: 1.5,
            berms: Vec::new(),
            service_road_reaches: Vec::new(),
            bank_section_type: "homogeneous".into(),
            hearting_level_offset_from_fsl: 0.0,
            minimum_hearting_height: 0.0,
            hearting_top_width: 0.0,
            hearting_left_slope: 0.0,
            hearting_right_slope: 0.0,
            hearting_trench_enabled: false,
            hearting_trench_width: 0.0,
            hearting_trench_left_slope: 0.0,
            hearting_trench_right_slope: 0.0,
            bank_material_allocations: Vec::new(),
            bill_bank_formation: true,
            bill_bank_compaction: false,
            bill_hearting: false,
            bill_casing: false,
            bill_hearting_trench: false,
            offtake: "".into(),
        };

        let sections = vec![
            CanalSection {
                id: "c1".into(),
                chainage: 0.0,
                is_manual: None,
                ground_entry_mode: None,
                left_toe_rl: None,
                right_toe_rl: None,
                ground: vec![
                    CanalPoint { offset: -10.0, rl: 101.5 },
                    CanalPoint { offset: 10.0, rl: 101.5 },
                ],
                design_populated: Some(true),
                design_point_offsets: None,
            },
            CanalSection {
                id: "c2".into(),
                chainage: 100.0,
                is_manual: None,
                ground_entry_mode: None,
                left_toe_rl: None,
                right_toe_rl: None,
                ground: vec![
                    CanalPoint { offset: -10.0, rl: 101.4 },
                    CanalPoint { offset: 10.0, rl: 101.4 },
                ],
                design_populated: Some(true),
                design_point_offsets: None,
            },
        ];

        let lining_reaches = vec![CanalLiningReach {
            id: "lr1".into(),
            from_chainage: 0.0,
            to_chainage: 100.0,
            provide: Some(true),
            enabled: Some(true),
            lining_type: Some("cc".into()),
            thickness_mm: Some(60.0),
            panel_length_m: Some(3.5),
            model_wall_interval_m: Some(17.5),
            steps_interval_m: Some(300.0),
            plug_slope_spacing_sqm: Some(40.0),
            plug_bed_spacing_sqm: Some(100.0),
        }];

        let data = CanalData {
            configured: true,
            mode: CanalMode::New,
            flow_direction: CanalFlowDirection::StartToEnd,
            length_m: 100.0,
            interval_m: 100.0,
            design,
            sections,
            lining_reaches,
        };

        let totals = canal_earthwork_totals(&data);
        assert!(totals.total_cutting_volume > 0.0);

        let lining = canal_lining_totals(&data);
        assert_eq!(lining.reaches, 1);
        assert!(lining.lining_bed_area > 0.0);
        assert!(lining.lining_slope_area > 0.0);
    }
}
