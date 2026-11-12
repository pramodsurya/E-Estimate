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

fn numeric_cell(sheet: &str, address: &str) -> f64 {
    let cell = sheet.split_once(&format!("<c r=\"{address}\" ")).unwrap().1.split("</c>").next().unwrap();
    cell.split_once("<v>").unwrap().1.split("</v>").next().unwrap().parse().unwrap()
}

fn blank_cell(sheet: &str, address: &str) -> bool {
    let Some((_, rest)) = sheet.split_once(&format!("<c r=\"{address}\" ")) else { return true; };
    let cell = rest.split("<c ").next().unwrap().split("</c>").next().unwrap();
    !cell.contains("<v>") && !cell.contains("<f>")
}

fn text_cell(bytes: &[u8], sheet: &str, address: &str) -> String {
    let id = numeric_cell(sheet, address) as usize;
    xml(bytes, "xl/sharedStrings.xml").split("<si>").skip(id + 1).next().unwrap()
        .split("</si>").next().unwrap().to_string()
}

fn schedule_chainages(sheet: &str) -> Vec<f64> {
    sheet.split("<row ").skip(1).filter_map(|row| {
        let index: u32 = row.split_once("r=\"")?.1.split('"').next()?.parse().ok()?;
        (index >= 6).then_some(index)
    }).map_while(|index| {
        let cell = sheet.split_once(&format!("<c r=\"A{index}\" "))?.1.split("</c>").next()?;
        if cell.contains("t=\"s\"") { return None; }
        cell.split_once("<v>")?.1.split("</v>").next()?.parse().ok()
    }).collect()
}

fn grouped_fixture(spans: &[(f64, f64, &str, &str)]) -> BankExportInput {
    let mut input = fixture();
    input.length_m = spans.last().unwrap().1;
    input.intervals = spans.iter().enumerate().map(|(i, &(from, to, left, right))| {
        let mut start = sample(from, &format!("reach-{i}"));
        let mut end = sample(to, &format!("reach-{i}"));
        for sample in [&mut start, &mut end] {
            for (bank, kind) in sample.banks.iter_mut().zip([left, right]) {
                if kind == "cut" { bank.status = "cut".into(); }
                else { bank.construction = if kind == "protected" { "zoned" } else { kind }.into(); }
                if kind == "protected" { bank.slopes = json!({"kind":"grass"}); }
            }
        }
        BankExportInterval { from, to, start, end }
    }).collect();
    input
}

fn column(mut index: u16) -> String {
    let mut result = String::new();
    loop {
        result.insert(0, (b'A' + (index % 26) as u8) as char);
        if index < 26 { return result; }
        index = index / 26 - 1;
    }
}

fn item_columns(bytes: &[u8], label: &str) -> (u16, u16) {
    let strings = xml(bytes, "xl/sharedStrings.xml");
    let id = strings.split("<si>").skip(1).position(|entry| entry.split("</si>").next().unwrap().contains(label)).unwrap();
    let sheet = xml(bytes, "xl/worksheets/sheet1.xml");
    let address = sheet.split("<c ").skip(1).find_map(|entry| {
        let cell = entry.split("</c>").next().unwrap();
        let address = cell.split_once("r=\"")?.1.split('"').next()?;
        (address.trim_start_matches(|c: char| c.is_ascii_alphabetic()) == "4"
            && cell.contains(&format!("<v>{id}</v>")) && cell.contains("t=\"s\""))
            .then_some(address.to_string())
    }).unwrap();
    let range = sheet.split("<mergeCell ref=\"").skip(1).find(|range| range.starts_with(&format!("{address}:"))).unwrap().split('"').next().unwrap();
    let parse = |cell: &str| -> u16 {
        cell.bytes().take_while(u8::is_ascii_alphabetic).fold(0_u16, |total,c| total*26 + u16::from(c-b'A'+1))-1
    };
    let (first,last) = range.split_once(':').unwrap();
    (parse(first),parse(last))
}

fn fixed_work_rows(bytes: &[u8], label: &str) -> (u32, u32) {
    let strings = xml(bytes, "xl/sharedStrings.xml");
    let ids: Vec<_> = strings.split("<si>").skip(1).enumerate().filter_map(|(id,entry)|
        entry.split("</si>").next().unwrap().contains(label).then_some(id)).collect();
    let sheet = xml(bytes, "xl/worksheets/sheet1.xml");
    let title = sheet.split("<c ").skip(1).find_map(|entry| {
        let cell = entry.split("</c>").next()?;
        let address = cell.split_once("r=\"")?.1.split('"').next()?;
        if !address.starts_with('A') || !address[1..].chars().all(|c| c.is_ascii_digit()) || !cell.contains("t=\"s\"") { return None; }
        let id: usize = cell.split_once("<v>")?.1.split("</v>").next()?.parse().ok()?;
        ids.contains(&id).then(|| address[1..].parse::<u32>().unwrap())
    }).unwrap();
    let first = title + 2;
    let mut total = first;
    loop {
        let cell = sheet.split_once(&format!("<c r=\"A{total}\" ")).unwrap().1.split("</c>").next().unwrap();
        if cell.contains("t=\"s\"") {
            assert!(text_cell(bytes, &sheet, &format!("A{total}")).contains("TOTAL"));
            break;
        }
        total += 1;
    }
    (first,total)
}

#[test]
fn exact_profile_area_uses_ground_and_prepared_footprint() {
    let result = build_bank_statement(&fixture()).unwrap();
    assert_eq!(result.groups.len(), 1);
    // Half bed + inner trapezoid + crest rectangle + outer triangle + stripping.
    let one = 1.5 * 1.5 + 3.15 * (1.5 + 3.6) / 2.0 + 3.0 * 3.6 + 5.4 * 3.6 / 2.0 + 13.05 * 0.6;
    near(result.totals["filling"], one * 2.0 * 100.0);
    near(result.totals["stripping"], 13.05 * 0.6 * 2.0 * 100.0);
    assert_eq!(result.rows.len(), 2);
}

#[test]
fn one_group_exports_its_calculation_sheet_and_diagrams_without_an_overview() {
    let bytes = excel::generate_canal_embankment_excel_bytes(&fixture()).unwrap();
    let workbook = xml(&bytes, "xl/workbook.xml");
    assert_eq!(workbook.matches("<sheet ").count(), 2);
    assert!(workbook.contains("name=\"Homogeneous Unprotected\" sheetId=\"1\""));
    assert!(workbook.contains("name=\"Bank Sections\" sheetId=\"2\""));
    assert!(!workbook.contains("Statement of Quantities"));
    let detail = xml(&bytes, "xl/worksheets/sheet1.xml");
    assert!(detail.contains("AVERAGE(K7,L7)"));
    assert!(detail.contains("SUM(O6:O7)"));
    assert!(detail.contains("(M7*N7)*$B7"));
    near(numeric_cell(&detail, "A6"), 0.0);
    near(numeric_cell(&detail, "A7"), 100.0);
    near(numeric_cell(&detail, "I7"), 2.0); // Stripping has its own Nos.
    near(numeric_cell(&detail, "N7"), 2.0); // Filling has its own Nos.
    near(numeric_cell(&detail, "O7"), build_bank_statement(&fixture()).unwrap().totals["filling"]);
    let strings = xml(&bytes, "xl/sharedStrings.xml");
    assert!(strings.contains("<t>Nos.</t>"));
    assert!(strings.contains("R01 / R02"));
    assert!(!strings.contains("<t>Left</t>") && !strings.contains("<t>Right</t>"));
    assert!(detail.contains("xSplit=\"3\" ySplit=\"5\" topLeftCell=\"D6\""));
    assert!(detail.contains("activeCell=\"G6\""));
    assert!(detail.contains("zoomScale=\"90\""));
    // The frozen area must leave space for data at ordinary window sizes.
    let frozen_height: f64 = detail.split("<row ").take(6).skip(1).map(|row| {
        row.split_once("ht=\"").unwrap().1.split('"').next().unwrap().parse::<f64>().unwrap()
    }).sum();
    assert!(frozen_height <= 140.0);
    assert!(xml(&bytes, "xl/worksheets/sheet2.xml").contains("<drawing "));
    assert!(!xml(&bytes, "xl/sharedStrings.xml").contains("REACH SHEET DEFINITIONS"));
}

#[test]
fn unequal_banks_use_side_by_side_item_values_on_one_chainage_row() {
    let mut input = fixture();
    let interval = &mut input.intervals[0];
    for sample in [&mut interval.start, &mut interval.end] {
        sample.ground = vec![p(-50.0, 97.0), p(50.0, 99.0)];
    }
    let statement = build_bank_statement(&input).unwrap();
    assert!((statement.rows[0].quantities["filling"] - statement.rows[1].quantities["filling"]).abs() > 1.0);
    let bytes = excel::generate_canal_embankment_excel_bytes(&input).unwrap();
    let detail = xml(&bytes, "xl/worksheets/sheet1.xml");
    let (first,last) = item_columns(&bytes, "Earth filling incl. berms");
    assert_eq!(last-first, 8);
    near(numeric_cell(&detail, "A6"), 0.0);
    near(numeric_cell(&detail, "A7"), 100.0);
    near(numeric_cell(&detail, &format!("{}7",column(first+3))), 1.0);
    near(numeric_cell(&detail, &format!("{}7",column(first+7))), 1.0);
    near(numeric_cell(&detail, &format!("{}7",column(last))), statement.totals["filling"]);
    assert!(detail.contains(&format!("SUM({}6:{}7)",column(last),column(last))));
}

#[test]
fn equal_quantities_with_different_end_sections_keep_the_difference_visible() {
    let mut input = fixture();
    input.intervals[0].start.ground = vec![p(-50.0,97.0),p(50.0,99.0)];
    input.intervals[0].end.ground = vec![p(-50.0,99.0),p(50.0,97.0)];
    let statement = build_bank_statement(&input).unwrap();
    near(statement.rows[0].quantities["filling"],statement.rows[1].quantities["filling"]);
    let bytes = excel::generate_canal_embankment_excel_bytes(&input).unwrap();
    let detail = xml(&bytes,"xl/worksheets/sheet1.xml");
    let (first,last) = item_columns(&bytes,"Earth filling incl. berms");
    assert_eq!(last-first,8);
    assert!((numeric_cell(&detail,&format!("{}7",column(first)))-numeric_cell(&detail,&format!("{}7",column(first+4)))).abs()>1.0);
    near(numeric_cell(&detail,&format!("{}7",column(first+3))),2.0);
    near(numeric_cell(&detail,&format!("{}7",column(first+7))),0.0);
    near(numeric_cell(&detail,&format!("{}7",column(last))),statement.totals["filling"]);
}

#[test]
fn nos_is_per_item_when_only_one_bank_has_toe_work() {
    let mut input = fixture();
    let interval = &mut input.intervals[0];
    for sample in [&mut interval.start, &mut interval.end] {
        sample.banks[0].treatment = json!({"blanket":"none","rockToeProtection":true,"rockToeProtectionSide":"left","rockToeTopWidth":0.5,"rockToeProtectionHeight":1.0,"rockToeInnerSlope":1.0});
    }
    let statement = build_bank_statement(&input).unwrap();
    let bytes = excel::generate_canal_embankment_excel_bytes(&input).unwrap();
    let detail = xml(&bytes, "xl/worksheets/sheet1.xml");
    let (stripping,_) = item_columns(&bytes, "Foundation stripping");
    near(numeric_cell(&detail, &format!("{}7",column(stripping+3))), 2.0);
    let (toe,total) = fixed_work_rows(&bytes, "Rock toe");
    assert_eq!(total,toe+1);
    near(numeric_cell(&detail, &format!("E{toe}")), 1.0);
    near(numeric_cell(&detail, &format!("G{toe}")), 0.0);
    near(numeric_cell(&detail, &format!("I{toe}")), statement.totals["rock_toe"]);
}

#[test]
fn design_changes_use_one_sided_section_inputs_without_duplicate_chainages() {
    let mut input = fixture();
    input.length_m = 200.0;
    let mut next = BankExportInterval { from:100.0, to:200.0, start:sample(100.0,"B"), end:sample(200.0,"B") };
    for sample in [&mut next.start,&mut next.end] {
        for bank in &mut sample.banks {
            for point in &mut bank.profile {
                if point.offset.abs() >= 7.65 { point.offset += point.offset.signum()*2.0; }
            }
        }
        sample.design = sample.banks[0].profile.iter().rev().copied()
            .chain(sample.banks[1].profile.iter().skip(1).copied()).collect();
    }
    input.intervals.push(next);
    let statement = build_bank_statement(&input).unwrap();
    let bytes = excel::generate_canal_embankment_excel_bytes(&input).unwrap();
    let detail = xml(&bytes,"xl/worksheets/sheet1.xml");
    for (row,ch) in [(6,0.0),(7,100.0),(8,200.0)] { near(numeric_cell(&detail,&format!("A{row}")),ch); }
    assert!((numeric_cell(&detail,"K8")-numeric_cell(&detail,"L7")).abs() > 1.0);
    near(numeric_cell(&detail,"O7"),statement.rows[0].quantities["filling"]+statement.rows[1].quantities["filling"]);
    near(numeric_cell(&detail,"O8"),statement.rows[2].quantities["filling"]+statement.rows[3].quantities["filling"]);
    assert!(detail.contains("AVERAGE(K8,L8)"));
    assert!(detail.contains("SUM(O6:O8)"));
}

#[test]
fn a_single_filling_bank_is_counted_once_on_each_station_row() {
    let mut input = fixture();
    let interval = &mut input.intervals[0];
    for sample in [&mut interval.start,&mut interval.end] { sample.banks[1].status = "cut".into(); }
    let statement = build_bank_statement(&input).unwrap();
    let bytes = excel::generate_canal_embankment_excel_bytes(&input).unwrap();
    let detail = xml(&bytes,"xl/worksheets/sheet1.xml");
    near(numeric_cell(&detail,"A6"),0.0);
    near(numeric_cell(&detail,"A7"),100.0);
    near(numeric_cell(&detail,"I7"),1.0);
    near(numeric_cell(&detail,"N7"),1.0);
    near(numeric_cell(&detail,"O7"),statement.totals["filling"]);
    assert!(detail.contains("SUM(O6:O7)"));
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
        26.1 * 0.25 * 100.0,
    );
    assert_eq!(result.groups.len(), 1);
    assert!(result.groups[0].name.contains("Sand Blanket Provided"));
}

#[test]
fn bed_stripping_is_refilled_once_and_uses_the_actual_zoned_materials() {
    for zoned in [false, true] {
        for bed_core in [false, true] {
            let mut input = fixture();
            let interval = &mut input.intervals[0];
            for sample in [&mut interval.start, &mut interval.end] {
                for bank in &mut sample.banks {
                    bank.construction = if zoned { "zoned" } else { "homogeneous" }.into();
                }
                if zoned && bed_core {
                    sample.cores = vec![vec![p(-1.5,97.9),p(1.5,97.9),p(1.5,98.5),p(-1.5,98.5)]];
                }
            }
            let measured = build_bank_statement(&input).unwrap();
            let bed_refill = input.bed_width * 0.6 * 100.0;
            let bank_refill = measured.rows.iter().map(|row| row.start.foundation_width * 0.6 * 100.0).sum::<f64>();
            near(measured.totals["stripping"], bank_refill + bed_refill);
            if zoned {
                near(measured.totals["hearting"], if bed_core { bed_refill } else { 0.0 });
                near(measured.totals["hearting"] + measured.totals["casing"], measured.rows.iter().map(|row| row.start.gross_fill * 100.0).sum());
            }
            let interval = &mut input.intervals[0];
            for sample in [&mut interval.start, &mut interval.end] { sample.stripping_depth = 0.0; }
            let unstripped = build_bank_statement(&input).unwrap();
            let key = if zoned { "casing" } else { "filling" };
            let added = measured.totals[key] - unstripped.totals[key]
                + if zoned { measured.totals["hearting"] - unstripped.totals["hearting"] } else { 0.0 };
            near(added, bank_refill + bed_refill);
        }
    }
}

#[test]
fn bed_preparation_clips_at_cutting_boundaries_and_includes_level_bed() {
    for (ground, bed_width) in [
        (vec![p(-50.0,100.0),p(50.0,100.0)], 3.0),
        (vec![p(-50.0,101.0),p(50.0,101.0)], 0.0),
        (vec![p(-50.0,99.5),p(-1.5,99.5),p(1.5,100.5),p(50.0,100.5)], 1.5),
    ] {
        let mut input = fixture();
        let interval = &mut input.intervals[0];
        for sample in [&mut interval.start, &mut interval.end] { sample.ground = ground.clone(); }
        let statement = build_bank_statement(&input).unwrap();
        let bank_width: f64 = statement.rows.iter().map(|row| row.start.foundation_width).sum();
        near(statement.totals["stripping"], (bank_width + bed_width) * 0.6 * 100.0);
    }
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
    assert_eq!(workbook.matches("<sheet ").count(), 5);
    assert!(!workbook.contains("Statement of Quantities"));
    for group in &result.groups {
        assert_eq!(workbook.matches(&format!("name=\"{}\"", group.sheet_name)).count(), 1);
    }
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
    let detail = xml(&bytes, "xl/worksheets/sheet1.xml");
    assert!(detail.contains("AVERAGE(K7,L7)"));
    for (row,ch) in [(6,0.0),(7,100.0),(8,200.0),(9,300.0)] { near(numeric_cell(&detail,&format!("A{row}")),ch); }
    assert!(blank_cell(&detail,"O8"));
    near(numeric_cell(&detail,"O7"),numeric_cell(&detail,"O9"));
    assert!(numeric_cell(&detail,"K9") > 0.0 && blank_cell(&detail,"L8"));
    assert!(xml(&bytes, "xl/sharedStrings.xml").contains("Full cutting / no bank filling"));
    input.mode = "manual".into();
    near(
        build_bank_statement(&input).unwrap().totals["filling"],
        result.totals["filling"],
    );
}

#[test]
fn off_sheet_stretches_show_only_boundaries_and_leave_measurements_blank() {
    let stations = [0.0, 30.0, 60.0, 90.0, 120.0, 240.0, 300.0, 400.0, 500.0];
    let spans: Vec<_> = stations.windows(2).map(|pair| {
        let kind = if pair[0] >= 30.0 && pair[1] <= 400.0 { "zoned" } else { "homogeneous" };
        (pair[0], pair[1], kind, kind)
    }).collect();
    let input = grouped_fixture(&spans);
    let model = build_bank_statement(&input).unwrap();
    let bytes = excel::generate_canal_embankment_excel_bytes(&input).unwrap();
    let sheet = xml(&bytes, "xl/worksheets/sheet1.xml");
    assert_eq!(schedule_chainages(&sheet), [0.0, 30.0, 400.0, 500.0]);
    let reference = "30.000–400.000 m: See sheet Zoned Unprotected";
    assert!(text_cell(&bytes, &sheet, "E7").contains(reference));
    assert!(text_cell(&bytes, &sheet, "E8").contains(reference));
    for c in std::iter::once(1).chain(5..15) {
        assert!(blank_cell(&sheet, &format!("{}8", column(c))));
    }
    near(numeric_cell(&sheet, "B9"), 100.0);
    assert!(sheet.contains("<f>A9-A8</f>"));
    near(numeric_cell(&sheet, "O7") + numeric_cell(&sheet, "O9"), model.groups[0].totals["filling"]);
    assert!(sheet.contains("SUM(O6:O9)"));
    near(numeric_cell(&sheet, "O10"), model.groups[0].totals["filling"]);
    // The other sheet also collapses its leading/trailing excluded ranges.
    let zoned = xml(&bytes, "xl/worksheets/sheet2.xml");
    assert_eq!(schedule_chainages(&zoned), stations);
    assert!(blank_cell(&zoned, "F6") && blank_cell(&zoned, "F7") && blank_cell(&zoned, "F14"));
}

#[test]
fn excluded_ranges_split_at_owner_changes_and_full_cutting() {
    let h = "homogeneous";
    let z = "zoned";
    let p = "protected";
    let c = "cut";
    let input = grouped_fixture(&[
        (0.0,30.0,z,z), (30.0,60.0,z,z), (60.0,90.0,z,z),
        (90.0,120.0,p,p), (120.0,150.0,p,p),
        (150.0,180.0,c,c), (180.0,210.0,c,c),
        (210.0,240.0,h,h), (240.0,270.0,z,c), (270.0,300.0,z,c),
    ]);
    let model = build_bank_statement(&input).unwrap();
    let index = model.groups.iter().position(|g| g.sheet_name == "Homogeneous Unprotected").unwrap();
    let bytes = excel::generate_canal_embankment_excel_bytes(&input).unwrap();
    let sheet = xml(&bytes, &format!("xl/worksheets/sheet{}.xml", index + 1));
    assert_eq!(schedule_chainages(&sheet), [0.0,90.0,150.0,210.0,240.0,300.0]);
    let notes = text_cell(&bytes, &sheet, "E7");
    assert!(notes.contains("0.000–90.000 m: See sheet Zoned Unprotected"));
    assert!(notes.contains("90.000–150.000 m: See sheet Zoned Protected"));
    assert!(text_cell(&bytes, &sheet, "E8").contains("150.000–210.000 m: Full cutting / no bank filling"));
    assert!(text_cell(&bytes, &sheet, "E10").contains("240.000–300.000 m: LB: See sheet Zoned Unprotected; RB: Full cutting / no bank filling"));
    near(numeric_cell(&sheet, "B10"), 30.0);
    near(numeric_cell(&sheet, "O10"), model.groups[index].totals["filling"]);
    for row in [6,7,8,9,11] { assert!(blank_cell(&sheet, &format!("O{row}"))); }
}

#[test]
fn a_measured_bank_keeps_all_its_stations_when_the_other_bank_is_elsewhere() {
    let input = grouped_fixture(&[
        (0.0,30.0,"homogeneous","zoned"),
        (30.0,60.0,"homogeneous","cut"),
        (60.0,90.0,"zoned","homogeneous"),
    ]);
    let model = build_bank_statement(&input).unwrap();
    let bytes = excel::generate_canal_embankment_excel_bytes(&input).unwrap();
    let sheet = xml(&bytes, "xl/worksheets/sheet1.xml");
    assert_eq!(schedule_chainages(&sheet), [0.0,30.0,60.0,90.0]);
    for row in [7,8,9] {
        near(numeric_cell(&sheet, &format!("B{row}")), 30.0);
        near(numeric_cell(&sheet, &format!("N{row}")), 1.0);
    }
    near(numeric_cell(&sheet, "O10"), model.groups[0].totals["filling"]);
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
    let bytes = excel::generate_canal_embankment_excel_bytes(&input).unwrap();
    let detail = xml(&bytes,"xl/worksheets/sheet1.xml");
    for (key,left,right) in [("ditch_rubble",1.0,0.0),("ditch_concrete",0.0,1.0)] {
        let work = result.works.iter().find(|work| work.key==key).unwrap();
        let (first,total) = fixed_work_rows(&bytes,&work.label);
        assert_eq!(total,first+1);
        near(numeric_cell(&detail,&format!("E{first}")),left);
        near(numeric_cell(&detail,&format!("G{first}")),right);
        near(numeric_cell(&detail,&format!("I{first}")),result.totals[key]);
    }
}

#[test]
fn toe_ditch_uses_reference_invert_grade_and_recalculates_sections_and_lining() {
    let mut input = fixture();
    let interval = &mut input.intervals[0];
    for sample in [&mut interval.start, &mut interval.end] {
        for bank in &mut sample.banks {
            bank.treatment = json!({"toeDrain":true,"toeDrainSide":"both","toeDrainBottomWidth":0.6,
                "toeDrainInvertRl":98.0,"toeDrainStartChainage":0.0,"toeDrainSlope":1000.0,
                "toeDrainDepth":99.0,"toeDrainLeftSlope":1.0,"toeDrainRightSlope":2.0,
                "toeDrainBermWidth":0.6,"toeDrainProtection":"rubble"});
        }
    }
    let model = build_bank_statement(&input).unwrap();
    near(model.rows[0].start.values["toe_ditch"], 0.6*0.5 + 1.5*0.5*0.5);
    near(model.rows[0].end.values["toe_ditch"], 0.6*0.6 + 1.5*0.6*0.6);
    near(model.totals["toe_ditch"], (0.675+0.9)/2.0*100.0*2.0);
    let developed = |depth: f64| 0.6 + depth.hypot(depth) + depth.hypot(2.0*depth);
    near(model.totals["ditch_rubble"], (developed(0.5)+developed(0.6))/2.0*200.0);
    let shape = model.rows[0].end.shapes.iter().find(|shape| shape.key == "toe_ditch").unwrap();
    near(shape.points.iter().map(|p| p.rl).fold(f64::INFINITY, f64::min), 97.9);
    let bytes = excel::generate_canal_embankment_excel_bytes(&input).unwrap();
    let (_,quantity) = item_columns(&bytes, "Open toe-ditch excavation");
    let sheet = xml(&bytes, "xl/worksheets/sheet1.xml");
    near(numeric_cell(&sheet, &format!("{}7",column(quantity))), model.totals["toe_ditch"]);
    input.intervals[0].start.banks[0].treatment["toeDrainSlope"] = json!(0.0);
    input.intervals[0].end.banks[0].treatment["toeDrainSlope"] = json!(0.0);
    assert!(excel::generate_canal_embankment_excel_bytes(&input).unwrap_err().contains("positive longitudinal slope"));
}

#[test]
fn toe_ditch_accepts_negative_invert_rl_and_omits_above_ground_excavation() {
    let mut input = fixture();
    let interval = &mut input.intervals[0];
    for sample in [&mut interval.start, &mut interval.end] {
        sample.ground = vec![p(-50.0,-1.5),p(50.0,-1.5)];
        for bank in &mut sample.banks {
            bank.treatment = json!({"toeDrain":true,"toeDrainSide":"both","toeDrainBottomWidth":1.0,
                "toeDrainInvertRl":-2.0,"toeDrainStartChainage":50.0,"toeDrainSlope":1000.0,
                "toeDrainLeftSlope":0.0,"toeDrainRightSlope":0.0});
        }
    }
    let model = build_bank_statement(&input).unwrap();
    near(model.rows[0].start.values["toe_ditch"],0.45);
    near(model.rows[0].end.values["toe_ditch"],0.55);
    for bank in &mut input.intervals[0].start.banks { bank.treatment["toeDrainInvertRl"] = json!(-1.0); }
    for bank in &mut input.intervals[0].end.banks { bank.treatment["toeDrainInvertRl"] = json!(-1.0); }
    let model = build_bank_statement(&input).unwrap();
    assert!(model.rows.iter().all(|row| row.quantities.get("toe_ditch").copied().unwrap_or(0.0) == 0.0));
    assert!(model.rows[0].start.shapes.iter().all(|shape| shape.key != "toe_ditch"));
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
fn material_allocations_stay_with_their_group_and_include_cutoff_hearting() {
    let mut input = fixture();
    let interval = &mut input.intervals[0];
    for sample in [&mut interval.start, &mut interval.end] {
        sample.banks[1].construction = "zoned".into();
        sample.cores = vec![vec![p(5.0, 99.0), p(6.0, 99.0), p(6.0, 102.0), p(5.0, 102.0)]];
        sample.trenches = vec![vec![p(5.0, 97.0), p(6.0, 97.0), p(6.0, 98.5), p(5.0, 98.5)]];
    }
    input.material_allocations = serde_json::from_value(json!([
        {"zone":"homogeneous","source":"canal-excavation","percentage":40,"compaction":95,"watering":true},
        {"zone":"homogeneous","source":"borrow-area","percentage":60,"compaction":98,"watering":true},
        {"zone":"hearting","source":"borrow-area","percentage":100,"compaction":98,"watering":true},
        {"zone":"casing","source":"borrow-area","percentage":100,"compaction":98,"watering":true}
    ])).unwrap();
    let statement = build_bank_statement(&input).unwrap();
    assert_eq!(statement.groups.len(), 2);
    let bytes = excel::generate_canal_embankment_excel_bytes(&input).unwrap();
    let allocations = |sheet: &str| -> Vec<(String, f64)> {
        sheet.split("<c ").filter_map(|cell| {
            let cell = cell.split("</c>").next()?;
            let formula = cell.split_once("<f>")?.1.split("</f>").next()?;
            if !formula.ends_with("/100") { return None; }
            let cached = cell.split_once("<v>")?.1.split("</v>").next()?;
            Some((formula.to_string(), cached.parse().unwrap()))
        }).collect()
    };
    let homogeneous = allocations(&xml(&bytes, "xl/worksheets/sheet1.xml"));
    assert_eq!(homogeneous.len(), 2);
    assert!(homogeneous.iter().all(|(formula, _)| formula.starts_with("($O$8)*D")));
    near(homogeneous[0].1, statement.groups[0].totals["filling"] * 0.4);
    near(homogeneous[1].1, statement.groups[0].totals["filling"] * 0.6);
    let zoned = allocations(&xml(&bytes, "xl/worksheets/sheet2.xml"));
    assert_eq!(zoned.len(), 2);
    assert!(zoned[0].0.starts_with("($O$8+$AD$8)*D"));
    assert!(zoned[1].0.starts_with("($T$8)*D"));
    near(zoned[0].1, 450.0); // 300 m³ above ground plus 150 m³ cutoff trench.
    near(zoned[1].1, statement.groups[1].totals["casing"]);
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
    let (toe,total) = fixed_work_rows(&bytes,"Rock toe");
    assert_eq!(total,toe+1);
    let detail = xml(&bytes,"xl/worksheets/sheet1.xml");
    near(numeric_cell(&detail,"A7"),100.0);
    near(numeric_cell(&detail,"A8"),200.0);
    near(numeric_cell(&detail,&format!("A{toe}")),100.0);
    near(numeric_cell(&detail,&format!("B{toe}")),200.0);
    near(numeric_cell(&detail,&format!("E{toe}")),2.0);
    near(numeric_cell(&detail,&format!("G{toe}")),result.totals["rock_toe"]);
    let zip = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
    assert_eq!(
        zip.file_names()
            .filter(|name| name.starts_with("xl/charts/chart") && name.ends_with(".xml"))
            .count(),
        4
    );
}
