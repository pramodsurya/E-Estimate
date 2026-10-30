#[path = "../../src/canal_engine_embankment_excel.rs"]
mod excel;
use estimate_core::canal_engine::bank_statement::*;
use serde_json::json;
use std::io::{Cursor, Read};

fn p(offset: f64, rl: f64) -> Point {
    Point { offset, rl }
}
fn sample(ch: f64, id: &str) -> BankExportSample {
    let right = vec![
        p(0.0, 100.0),
        p(1.5, 100.0),
        p(4.65, 102.1),
        p(7.65, 102.1),
        p(13.05, 98.5),
    ];
    let left: Vec<_> = right
        .iter()
        .map(|p| Point {
            offset: -p.offset,
            rl: p.rl,
        })
        .collect();
    let mut design: Vec<_> = left.iter().rev().copied().collect();
    design.extend(right.iter().skip(1));
    let banks=[("left",left),("right",right)].into_iter().map(|(side,profile)|BankExportBank{
        side:side.into(),reach_id:id.into(),profile_id:id.into(),profile_name:format!("Design {id}"),design_reference:id.into(),status:"fill".into(),construction:"homogeneous".into(),profile,
        slopes:json!({"kind":"none"}),berms:json!({"kind":"none"}),
        treatment:json!({"blanket":"none","blanketWidthMode":"automatic","filterLengthMode":"automatic"}),
    }).collect();
    BankExportSample {
        validation_errors:vec![],
        foundation_fills:vec![],
        chainage: ch,
        bed_level: 100.0,
        stripping_depth: 0.6,
        ground: vec![p(-50.0, 98.5), p(50.0, 98.5)],
        design,
        cores: vec![],
        trenches: vec![],
        cns: vec![],
        banks,
    }
}
fn fixture() -> BankExportInput {
    BankExportInput {
        version: 1,
        mode: "tiered".into(),
        work_mode: "new".into(),
        length_m: 100.0,
        bed_width: 3.0,
        full_supply_depth: 1.5,
        material_allocations: vec![],
        intervals: vec![BankExportInterval {
            from: 0.0,
            to: 100.0,
            start: sample(0.0, "A"),
            end: sample(100.0, "A"),
        }],
    }
}
fn near(a: f64, c: f64) {
    assert!((a - c).abs() < 1e-6, "{a} != {c}");
}
fn xml(bytes: &[u8], file: &str) -> String {
    let mut zip = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
    let mut out = String::new();
    zip.by_name(file).unwrap().read_to_string(&mut out).unwrap();
    out
}

#[test]
fn exact_profile_area_uses_ground_and_prepared_footprint() {
    let result = build_bank_statement(&fixture()).unwrap();
    assert_eq!(result.groups.len(), 1);
    // Half bed + inner trapezoid + crest rectangle + outer triangle + stripping.
    let one = 1.5 * 1.5 + 3.15 * (1.5 + 3.6) / 2.0 + 3.0 * 3.6 + 5.4 * 3.6 / 2.0 + 11.55 * 0.6;
    near(result.totals["filling"], one * 2.0 * 100.0);
    near(result.totals["stripping"], 11.55 * 0.6 * 2.0 * 100.0);
    assert_eq!(result.rows.len(), 2);
}

#[test]
fn continuous_blanket_counts_bed_once_and_deducts_only_actual_displacement() {
    let mut input = fixture();
    let interval = &mut input.intervals[0];
    for sample in [&mut interval.start, &mut interval.end] {
        for bank in &mut sample.banks {
            bank.treatment["blanket"] = json!("5-4");
        }
    }
    let result = build_bank_statement(&input).unwrap();
    near(result.totals["blanket_25"], 26.1 * 100.0);
    let plain = build_bank_statement(&fixture()).unwrap();
    near(
        plain.totals["filling"] - result.totals["filling"],
        23.1 * 0.25 * 100.0,
    );
    assert_eq!(result.groups.len(), 1);
    assert!(result.groups[0].name.contains("Sand Blanket Provided"));
}

#[test]
fn fifty_reaches_split_only_by_construction_then_slope_protection() {
    let mut input = fixture();
    input.length_m = 5000.0;
    input.intervals.clear();
    for i in 0..50 {
        let from = i as f64 * 100.0;
        let to = from + 100.0;
        let id = format!("reach-{i}");
        let mut start = sample(from, &id);
        let mut end = sample(to, &id);
        for sample in [&mut start, &mut end] {
            for bank in &mut sample.banks {
                bank.construction = if i % 2 == 0 { "homogeneous" } else { "zoned" }.into();
                if i % 4 < 2 {
                    bank.slopes = json!({"kind":"grass","sand":true});
                }
                if i % 3 == 0 {
                    bank.treatment["blanket"] = json!("5-5");
                    bank.treatment["blanketThickness"] = json!(0.3);
                }
                if i % 5 == 0 {
                    bank.treatment["horizontalFilter"] = json!(true);
                    bank.treatment["filterThickness"] = json!(0.3);
                }
                if i % 7 == 0 {
                    bank.treatment["rockToeProtection"] = json!(true);
                    bank.treatment["rockToeProtectionSide"] = json!("both");
                    bank.treatment["rockToeTopWidth"] = json!(0.5);
                    bank.treatment["rockToeProtectionHeight"] = json!(1.0);
                    bank.treatment["rockToeInnerSlope"] = json!(1.0);
                }
                if i % 11 == 0 {
                    bank.treatment["toeDrain"] = json!(true);
                    bank.treatment["toeDrainSide"] = json!("both");
                    bank.treatment["toeDrainDepth"] = json!(0.6);
                    bank.treatment["toeDrainBottomWidth"] = json!(0.5);
                    bank.treatment["toeDrainProtection"] =
                        json!(if i % 2 == 0 { "rubble" } else { "concrete" });
                }
            }
        }
        input.intervals.push(BankExportInterval {
            from,
            to,
            start,
            end,
        });
    }
    let result = build_bank_statement(&input).unwrap();
    assert_eq!(result.groups.len(), 4);
    for group in &result.groups {
        assert!(group.works.iter().any(|w| w.key == "horizontal_filter"));
        assert!(group.works.iter().any(|w| w.key == "vertical_filter"));
        near(
            group.totals.get("vertical_filter").copied().unwrap_or(0.0),
            0.0,
        );
    }
    assert_eq!(
        result
            .rows
            .iter()
            .filter(|r| r.group_index.is_some())
            .count(),
        100
    );
    let bytes = excel::generate_canal_embankment_excel_bytes(&input).unwrap();
    let workbook = xml(&bytes, "xl/workbook.xml");
    assert_eq!(workbook.matches("<sheet ").count(), 6);
    assert_eq!(
        workbook.matches("name=\"Statement of Quantities\"").count(),
        1
    );
    let strings = xml(&bytes, "xl/sharedStrings.xml");
    assert!(strings.contains("See sheet Zoned"));
    assert!(strings.contains("Sand Blanket &amp; Filters"));
    assert!(strings.contains("Horizontal graded filter"));
    assert!(strings.contains("Vertical / inclined filter"));
}

#[test]
fn disjoint_reaches_and_full_cut_have_no_cross_gap_averages() {
    let mut input = fixture();
    input.length_m = 300.0;
    input.intervals = vec![(0.0, 100.0, "A"), (100.0, 200.0, "B"), (200.0, 300.0, "C")]
        .into_iter()
        .map(|(from, to, id)| {
            let mut start = sample(from, id);
            let mut end = sample(to, id);
            if id == "B" {
                for sample in [&mut start, &mut end] {
                    sample.ground = vec![p(-50.0, 110.0), p(50.0, 110.0)];
                    for bank in &mut sample.banks {
                        bank.status = "cut".into();
                    }
                }
            }
            BankExportInterval {
                from,
                to,
                start,
                end,
            }
        })
        .collect();
    let result = build_bank_statement(&input).unwrap();
    assert_eq!(result.groups.len(), 1);
    assert_eq!(result.groups[0].reach_ids.len(), 4);
    let plain = build_bank_statement(&fixture()).unwrap();
    near(result.totals["filling"], plain.totals["filling"] * 2.0);
    assert!(result.rows[2..4].iter().all(|r| r.group_index.is_none()));
    let bytes = excel::generate_canal_embankment_excel_bytes(&input).unwrap();
    let detail = xml(&bytes, "xl/worksheets/sheet2.xml");
    assert!(detail.contains("AVERAGE(I13,I14)"));
    assert!(!detail.contains("AVERAGE(I16,I17)"));
    assert!(xml(&bytes, "xl/sharedStrings.xml").contains("Full cutting / no bank filling"));
    input.mode = "manual".into();
    near(
        build_bank_statement(&input).unwrap().totals["filling"],
        result.totals["filling"],
    );
}

#[test]
fn all_cut_creates_only_one_statement_and_invalid_gaps_are_rejected() {
    let mut input = fixture();
    let interval = &mut input.intervals[0];
    for sample in [&mut interval.start, &mut interval.end] {
        sample.ground = vec![p(-50.0, 110.0), p(50.0, 110.0)];
    }
    let result = build_bank_statement(&input).unwrap();
    assert!(result.groups.is_empty());
    let bytes = excel::generate_canal_embankment_excel_bytes(&input).unwrap();
    assert_eq!(xml(&bytes, "xl/workbook.xml").matches("<sheet ").count(), 1);
    let mut input = fixture();
    input.intervals[0].start.banks[0].status = "unassigned".into();
    input.intervals[0].end.banks[0].status = "unassigned".into();
    assert!(build_bank_statement(&input)
        .unwrap_err()
        .contains("without an assigned"));
    input = fixture();
    input.intervals[0].from = 1.0;
    assert!(build_bank_statement(&input)
        .unwrap_err()
        .contains("gaps or overlaps"));
}

#[test]
fn export_actual_app_fixture_when_requested() {
    let Ok(path) = std::env::var("CANAL_BANK_EXPORT_FIXTURE") else {
        return;
    };
    let input: BankExportInput = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
    let statement = build_bank_statement(&input).unwrap();
    std::fs::write(
        format!("{path}.statement.json"),
        serde_json::to_vec_pretty(&statement).unwrap(),
    )
    .unwrap();
    std::fs::write(
        format!("{path}.xlsx"),
        excel::generate_canal_embankment_excel_bytes(&input).unwrap(),
    )
    .unwrap();
}

#[test]
fn optional_toe_works_share_a_sheet_and_keep_their_measurement_units() {
    let mut input = fixture();
    let interval = &mut input.intervals[0];
    for sample in [&mut interval.start, &mut interval.end] {
        for bank in &mut sample.banks {
            bank.treatment = json!({"blanket":"none","rockToeProtection":true,"rockToeProtectionSide":"both",
            "rockToeTopWidth":0.5,"rockToeProtectionHeight":1.0,"rockToeInnerSlope":1.0,"rockToeFilter":true,
            "toeDrain":true,"toeDrainSide":"both","toeDrainBottomWidth":0.6,"toeDrainDepth":0.6,
            "toeDrainLeftSlope":1,"toeDrainRightSlope":1,"toeDrainBermWidth":0.6,
            "toeDrainProtection":if bank.side=="left"{"rubble"}else{"concrete"}});
        }
    }
    let result = build_bank_statement(&input).unwrap();
    assert_eq!(result.groups.len(), 1);
    near(result.totals["rock_toe"], 350.0);
    near(
        result.totals["rock_toe_filter"],
        (3.0 + 2.0_f64.sqrt() * 0.5) * 200.0,
    );
    near(result.totals["toe_ditch"], 144.0);
    near(
        result.totals["ditch_rubble"],
        (0.6 + 2.0 * 0.6_f64.hypot(0.6)) * 100.0,
    );
    near(
        result.totals["ditch_concrete"],
        (0.6 + 2.0 * 0.6_f64.hypot(0.6)) * 10.0,
    );
    assert_eq!(
        result
            .works
            .iter()
            .find(|w| w.key == "ditch_rubble")
            .unwrap()
            .unit,
        "m²"
    );
    assert_eq!(
        result
            .works
            .iter()
            .find(|w| w.key == "ditch_concrete")
            .unwrap()
            .unit,
        "m³"
    );
    assert!(result.groups[0].works.iter().all(|w| w.key != "blanket_25"));
    assert!(result.rows.iter().all(|r| r.start.deducted_fill > 0.0));
}

#[test]
fn source_shares_use_measured_zone_totals_without_capping_canal_reuse() {
    let mut input = fixture();
    input.material_allocations=serde_json::from_value(json!([
        {"zone":"homogeneous","source":"canal-excavation","percentage":40,"compaction":95,"watering":true},
        {"zone":"homogeneous","source":"borrow-area","percentage":60,"compaction":98,"watering":true}
    ])).unwrap();
    let result = build_bank_statement(&input).unwrap();
    assert_eq!(result.materials.len(), 2);
    near(result.materials[0].quantity, result.totals["filling"] * 0.4);
    assert_eq!(result.materials[0].code, "IRR-CAW-4-4");
    near(result.materials[1].quantity, result.totals["filling"] * 0.6);
    assert_eq!(result.materials[1].code, "IRR-CAW-2-6");
    input.material_allocations[0].percentage = 50.0;
    assert!(build_bank_statement(&input)
        .unwrap_err()
        .contains("must total 100%"));
}

#[test]
fn partial_toe_works_get_a_section_exhibit_without_another_quantity_group() {
    let mut input = fixture();
    input.length_m = 200.0;
    let mut next = BankExportInterval {
        from: 100.0,
        to: 200.0,
        start: sample(100.0, "A"),
        end: sample(200.0, "A"),
    };
    for sample in [&mut next.start, &mut next.end] {
        for bank in &mut sample.banks {
            bank.treatment = json!({"blanket":"none","rockToeProtection":true,"rockToeProtectionSide":"both","rockToeTopWidth":0.5,"rockToeProtectionHeight":1.0,"rockToeInnerSlope":1.0});
        }
    }
    input.intervals.push(next);
    let result = build_bank_statement(&input).unwrap();
    assert_eq!(result.groups.len(), 1);
    assert_ne!(result.rows[0].design_variant, result.rows[2].design_variant);
    assert_eq!(result.rows[0].group_index, result.rows[2].group_index);
    let bytes = excel::generate_canal_embankment_excel_bytes(&input).unwrap();
    let zip = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
    assert_eq!(
        zip.file_names()
            .filter(|name| name.starts_with("xl/charts/chart") && name.ends_with(".xml"))
            .count(),
        4
    );
}
