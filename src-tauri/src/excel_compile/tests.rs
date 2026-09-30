use super::*;

#[test]
fn test_excel_print_settings_default_and_named_sheet_override() {
    use std::io::{Cursor, Read};

    let req: ExcelCompileRequest = serde_json::from_value(serde_json::json!({
        "printSettings": {
            "pageSize": "A4", "orientation": "portrait",
            "marginsMm": { "top": 20, "right": 15, "bottom": 20, "left": 25 }
        },
        "sheetPrintSettings": {
            "Local": {
                "pageSize": "A3", "orientation": "landscape",
                "marginsMm": { "top": 10, "right": 11, "bottom": 12, "left": 13 }
            }
        }
    }))
    .expect("renderer settings payload");
    let mut workbook = rust_xlsxwriter::Workbook::new();
    workbook.add_worksheet().set_name("Global").unwrap();
    workbook.add_worksheet().set_name("Local").unwrap();
    let bytes = print_settings::save_with_print_settings(workbook, &req).unwrap();
    let mut zip = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
    let mut global_xml = String::new();
    zip.by_name("xl/worksheets/sheet1.xml")
        .unwrap()
        .read_to_string(&mut global_xml)
        .unwrap();
    assert!(global_xml.contains("paperSize=\"9\""), "{global_xml}");
    assert!(global_xml.contains("orientation=\"portrait\""), "{global_xml}");
    let mut local_xml = String::new();
    zip.by_name("xl/worksheets/sheet2.xml")
        .unwrap()
        .read_to_string(&mut local_xml)
        .unwrap();
    assert!(local_xml.contains("paperSize=\"8\""), "{local_xml}");
    assert!(local_xml.contains("orientation=\"landscape\""), "{local_xml}");
    assert!(local_xml.contains("left=\"0.51181"), "{local_xml}");
}

#[test]
fn test_component_abstract_uses_document_font() {
    use std::io::{Cursor, Read};

    let req: ExcelCompileRequest = serde_json::from_value(serde_json::json!({
        "printSettings": {
            "pageSize": "A3", "orientation": "landscape",
            "fontName": "Georgia", "fontSizePt": 13
        }
    }))
    .unwrap();
    let bytes = generate_excel_component_workbook(&ComponentPayload::default(), &req)
        .expect("component workbook");
    let mut zip = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
    let mut styles_xml = String::new();
    zip.by_name("xl/styles.xml")
        .unwrap()
        .read_to_string(&mut styles_xml)
        .unwrap();
    assert!(styles_xml.contains("<name val=\"Georgia\"/>"), "{styles_xml}");
}

#[test]
fn test_component_signature_follows_detail_sheet() {
    use std::io::{Cursor, Read};

    let component = ComponentPayload {
        signatures: vec![ComponentSignaturePayload {
            designation: "Assistant Engineer".into(),
            office: "Canal Division".into(),
        }],
        detailed_sheet: Some(ComponentDetailSheetPayload {
            name: "Detailed".into(),
            grid: DetailGridPayload {
                cells: vec![GridCellPayload {
                    r: 0, c: 0, value: Some(serde_json::json!("Quantity")),
                    ..Default::default()
                }],
                col_widths: vec![20.0, 20.0],
                ..Default::default()
            },
            landscape: true,
        }),
        ..Default::default()
    };
    let bytes = generate_excel_component_workbook(&component, &ExcelCompileRequest::default())
        .expect("signed component workbook");
    let mut zip = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
    let mut detail_xml = String::new();
    zip.by_name("xl/worksheets/sheet2.xml").unwrap().read_to_string(&mut detail_xml).unwrap();
    assert!(detail_xml.contains("<row r=\"4\""), "{detail_xml}");
    assert!(detail_xml.contains("mergeCell ref=\"A4:B4\""), "{detail_xml}");
    let mut strings = String::new();
    zip.by_name("xl/sharedStrings.xml").unwrap().read_to_string(&mut strings).unwrap();
    assert!(strings.contains("Assistant Engineer"), "{strings}");
}

#[test]
fn test_data_signatures_follow_print_placement() {
    use std::io::{Cursor, Read};

    let mut req: ExcelCompileRequest = serde_json::from_value(serde_json::json!({
        "dataSignature": {
            "placement": "subject_end",
            "rows": [{ "designation": "Assistant Engineer", "office": "Canal Division" }]
        }
    })).unwrap();
    let bytes = generate_excel_data_workbook(&req).expect("signed DATA workbook");
    let mut zip = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
    let mut strings = String::new();
    zip.by_name("xl/sharedStrings.xml").unwrap().read_to_string(&mut strings).unwrap();
    assert!(strings.contains("Assistant Engineer"), "{strings}");
    assert!(strings.contains("Canal Division"), "{strings}");
    let mut sheet = String::new();
    zip.by_name("xl/worksheets/sheet1.xml").unwrap().read_to_string(&mut sheet).unwrap();
    assert!(sheet.contains("<row r=\"3\""), "{sheet}");

    req.sor.push(ExcelSorItem { description: "SOR item".into(), ..Default::default() });
    let bytes = generate_excel_data_workbook(&req).expect("signed SOR workbook");
    let mut zip = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
    let mut ssr_xml = String::new();
    zip.by_name("xl/worksheets/sheet1.xml").unwrap().read_to_string(&mut ssr_xml).unwrap();
    assert!(!ssr_xml.contains("<row r=\"3\""), "signature belongs on the last DATA tab: {ssr_xml}");
    let mut sor_xml = String::new();
    zip.by_name("xl/worksheets/sheet2.xml").unwrap().read_to_string(&mut sor_xml).unwrap();
    assert!(sor_xml.contains("<row r=\"6\""), "{sor_xml}");

    req.data_signature.as_mut().unwrap().placement = "every_page".into();
    let bytes = generate_excel_data_workbook(&req).expect("every-page DATA workbook");
    let mut zip = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
    let mut sheet = String::new();
    zip.by_name("xl/worksheets/sheet1.xml").unwrap().read_to_string(&mut sheet).unwrap();
    assert!(sheet.contains("Assistant Engineer"), "{sheet}");
    assert!(sheet.contains("Page &amp;P of &amp;N"), "{sheet}");
    let mut sor_xml = String::new();
    zip.by_name("xl/worksheets/sheet2.xml").unwrap().read_to_string(&mut sor_xml).unwrap();
    assert!(sor_xml.contains("Assistant Engineer"), "{sor_xml}");
}

#[test]
fn test_excel_compile_basic() {
    let req = ExcelCompileRequest {
        project_name: Some("Test Project".into()),
        sor_year: Some("2026-27".into()),
        sor_zone: Some("zone_3".into()),
        recipes: vec![ExcelRecipe {
            excel_key: "data-1".into(),
            code: "SSR-1.1".into(),
            description: Some("Earth work excavation in ordinary soil".into()),
            unit: Some("cum".into()),
            section_heading: Some("Earthwork".into()),
            document_title: None,
            multi_rate_note: None,
            materials: vec![],
            machinery: vec![],
            labour: vec![CostTableLine {
                sl: Some(serde_json::json!("1")),
                description: Some("Mazdoor".into()),
                unit: Some("day".into()),
                quantity: Some(serde_json::json!(0.5)),
                rate: Some(serde_json::json!(450.0)),
                amount: Some(serde_json::json!(225.0)),
            }],
            totals: Some(Totals {
                output_quantity: Some(1.0),
                material_total: Some(0.0),
                machinery_total: Some(0.0),
                labour_total: Some(225.0),
                overhead_percent: Some(14.0),
                overhead_amount: Some(31.5),
                base_cost: Some(225.0),
                total_cost: Some(256.5),
                rate_per_unit: Some(256.5),
                labour_unit_base: Some(225.0),
                labour_unit_profit: Some(31.5),
                labour_unit_total: Some(256.5),
                area_allowance_percent: Some(0.0),
                area_allowance_amount: Some(0.0),
            }),
            labour_summary_rows: None,
            abstract_rows: None,
            leads: None,
            lead_summary: None,
            optional_addition: None,
            rate_variant: None,
            area_allowance_label: None,
            scope_label: None,
        }],
        sor: vec![ExcelSorItem {
            excel_key: "sor-1".into(),
            sl: 1,
            description: "PCC 1:2:4".into(),
            unit: "cum".into(),
            rate: Some(5400.0),
            base_rate: Some(5400.0),
            output_qty: Some(1.0),
            lead_links: vec![],
            rate_text: None,
        }],
        ..Default::default()
    };

    let res = generate_excel_data_workbook(&req);
    assert!(res.is_ok());
    let bytes = res.unwrap();
    assert!(!bytes.is_empty());
    // Verify ZIP / XLSX magic bytes
    assert_eq!(&bytes[0..2], b"PK");
}

#[test]
fn test_renderer_detail_image_bytes_reach_excel_writer() {
    let png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    let page: PagePayload = serde_json::from_value(serde_json::json!({
        "name": "Image detail",
        "landscape": false,
        "grid": {
            "cells": [{"r": 0, "c": 0, "value": "Detail"}],
            "colWidthsChars": [20],
            "images": [{
                "r": 9, "c": 0, "dataBase64": png,
                "mime": "image/png", "scaleW": 1, "scaleH": 1
            }]
        }
    }))
    .expect("renderer image payload");
    assert_eq!(page.grid.images[0].data, png);
    let bytes = generate_excel_page_workbook(&page, &ExcelCompileRequest::default()).expect("image workbook");
    assert_eq!(&bytes[0..2], b"PK");
}

#[test]
fn test_excel_boq_workbook() {
    let req = ExcelCompileRequest {
        kind: ExcelKind::Boq,
        boq: Some(BoqPayload {
            project_name: "Test Project".into(),
            component_name: "Bund".into(),
            is_subcomponent: false,
            rows: vec![BoqRowPayload {
                sl: "1".into(),
                code: "IRR-CAW-1-1".into(),
                heading: "Earth work".into(),
                description: "Excavation in ordinary soil".into(),
                quantity: Some(100.0),
                unit: "cum".into(),
                rate: Some(50.0),
                amount: Some(5000.0),
            }],
            total_cost: Some(5000.0),
        }),
        ..Default::default()
    };
    let bytes = generate_workbook(&req).expect("boq workbook");
    assert!(!bytes.is_empty());
    assert_eq!(&bytes[0..2], b"PK");
}

#[test]
fn test_excel_comparative_workbook() {
    let row = |label: &str, left: Option<f64>, right: Option<f64>| ComparativeRowPayload {
        sl_no: Some(serde_json::json!(1)),
        label: label.into(),
        description: None,
        unit: None,
        quantity: None,
        left_rate: None,
        right_rate: None,
        left,
        right,
        difference: match (left, right) {
            (Some(l), Some(r)) => Some(r - l),
            _ => None,
        },
        percent: Some(25.0),
        kind: "item".into(),
    };
    let req = ExcelCompileRequest {
        kind: ExcelKind::Comparative,
        comparative: Some(ComparativePayload {
            project_name: "Test Project".into(),
            root_name: None,
            left_year: "2024-25".into(),
            right_year: "2025-26".into(),
            whole_estimate: true,
            warnings: vec![],
            abstract_rows: vec![row("Bund", Some(100.0), Some(125.0))],
            components: vec![ComparativeComponentPayload {
                name: "Bund".into(),
                rows: vec![row("Earth work", Some(100.0), None)],
                left_total: Some(100.0),
                right_total: None,
                difference: None,
                percent: None,
            }],
            lead_rows: vec![],
        }),
        ..Default::default()
    };
    let bytes = generate_workbook(&req).expect("comparative workbook");
    assert!(!bytes.is_empty());
    assert_eq!(&bytes[0..2], b"PK");
}

#[test]
fn test_excel_seigniorage_workbook() {
    let req = ExcelCompileRequest {
        kind: ExcelKind::Seigniorage,
        seigniorage: Some(SeignioragePayload {
            project_name: "Test Project".into(),
            sor_year: "2025-26".into(),
            permit_basis: None,
            groups: vec![SeigniorageGroupPayload {
                key: "STONE".into(),
                heading: Some("Stone".into()),
                subtotal_label: None,
                rows: vec![SeigniorageRowPayload {
                    key: "stone-row".into(),
                    item_code: "IRR-A-1".into(),
                    description: "Building stone".into(),
                    work_qty: Some(10.0),
                    work_unit: "cum".into(),
                    seig_qty: Some(10.0),
                    seig_unit: "cum".into(),
                    rate: Some(100.0),
                    seigniorage: Some(1000.0),
                    dmft: Some(300.0),
                    smft: Some(20.0),
                    permit: Some(800.0),
                    permit_percent: 80.0,
                    permit_note: None,
                }],
            }],
            totals: SeigniorageTotalsPayload {
                total_seigniorage: 1000.0,
                total_dmft: 300.0,
                total_smft: 20.0,
                total_permit: 800.0,
                grand_total: 2120.0,
                rounded_grand_total: 2120.0,
            },
            signatures: vec![],
        }),
        ..Default::default()
    };
    let bytes = generate_workbook(&req).expect("seigniorage workbook");
    assert!(!bytes.is_empty());
    assert_eq!(&bytes[0..2], b"PK");
}

#[test]
fn test_excel_lead_workbook() {
    let req = ExcelCompileRequest {
        kind: ExcelKind::Lead,
        lead: Some(LeadPayload {
            project: "Test Project".into(),
            title: "LEAD STATEMENT & CONVEYANCE CHARGES".into(),
            subtitle: "Sub".into(),
            year: "2025-26".into(),
            zone: "zone_3".into(),
            notes: None,
            rows: vec![LeadSummaryRowPayload {
                key: "lead-1".into(),
                sl: "1".into(),
                name: "Coarse aggregate".into(),
                quarry: "Quarry A".into(),
                class: "METAL".into(),
                lead_km: Some(serde_json::json!("12.50 km")),
                lift_m: None,
                rate: Some(serde_json::json!(150.0)),
                uses: "2".into(),
                tag: None,
            }],
            materials: vec![LeadMaterialPayload {
                key: "lead-1".into(),
                sl: "1".into(),
                name: "Coarse aggregate".into(),
                lead_km_text: "12.50 km".into(),
                tag: None,
                route: "Quarry A".into(),
                rate_unit: "cum".into(),
                lift_m: None,
                charged_lift_m: None,
                rate: Some(serde_json::json!(150.0)),
                avg_lead: None,
                weighted_lead: None,
                weighted_rate_curve: None,
                steps: vec![LeadStepPayload {
                    label: "Cartage".into(),
                    expression: "12.5 km".into(),
                    amount: Some(serde_json::json!(140.0)),
                    amount_value: None,
                }],
                calculation: Some(LeadCalcPayload {
                    lead_rate: Some(140.0),
                    loading_rate: Some(10.0),
                    unloading_rate: None,
                    lift_rate: None,
                }),
            }],
            signature: vec![],
        }),
        ..Default::default()
    };
    let bytes = generate_workbook(&req).expect("lead workbook");
    assert!(!bytes.is_empty());
    assert_eq!(&bytes[0..2], b"PK");
}

#[test]
fn test_excel_project_reuses_lead_and_data_templates() {
    let mut req = ExcelCompileRequest {
        kind: ExcelKind::Project,
        project_name: Some("Linked Project".into()),
        recipes: vec![ExcelRecipe {
            excel_key: "data-1".into(),
            code: "SSR-1".into(),
            description: Some("Linked DATA item".into()),
            unit: Some("cum".into()),
            totals: Some(Totals {
                output_quantity: Some(1.0),
                ..Default::default()
            }),
            abstract_rows: Some(vec![AbstractRow {
                label: "Rate per unit".into(),
                amount: serde_json::json!(140.0),
                is_rate: Some(true),
                ..Default::default()
            }]),
            leads: Some(vec![LeadRow {
                lead_key: "lead-1".into(),
                material: Some("Coarse aggregate".into()),
                unit: Some("cum".into()),
                quantity: Some(serde_json::json!(2.0)),
                rate: Some(serde_json::json!(20.0)),
                amount: Some(serde_json::json!(40.0)),
                ..Default::default()
            }]),
            lead_summary: Some(LeadSummary {
                base_amount_text: Some("100.00".into()),
                lead_total_text: Some("40.00".into()),
                final_amount_text: Some("140.00".into()),
                final_rate_text: Some("140.00".into()),
                disposal_only: Some(false),
            }),
            ..Default::default()
        }],
        lead: Some(LeadPayload {
            project: "Linked Project".into(),
            title: "LEAD STATEMENT & CONVEYANCE CHARGES".into(),
            rows: vec![
                LeadSummaryRowPayload {
                    key: "lead-1".into(),
                    sl: "1".into(),
                    name: "Coarse aggregate source".into(),
                    rate: Some(serde_json::json!(20.0)),
                    ..Default::default()
                },
                LeadSummaryRowPayload {
                    key: "weighted-1".into(),
                    sl: "2".into(),
                    name: "Coarse aggregate weighted".into(),
                    rate: Some(serde_json::json!(20.0)),
                    ..Default::default()
                },
            ],
            materials: vec![LeadMaterialPayload {
                key: "weighted-1".into(),
                name: "Coarse aggregate weighted".into(),
                weighted_lead: Some(LeadWeightedPayload {
                    entries: vec![LeadWeightedEntryPayload {
                        key: "lead-1".into(),
                        name: "Source 1".into(),
                        lead_km: Some(serde_json::json!(5.0)),
                        quantity_text: "10".into(),
                        unit: "cum".into(),
                        product: Some(serde_json::json!(50.0)),
                    }],
                    ..Default::default()
                }),
                weighted_rate_curve: Some(LeadWeightedRateCurvePayload {
                    head_100m: Some(10.0),
                    head_150m: Some(15.0),
                    upto_1km: Some(20.0),
                    upto_2km: Some(30.0),
                    upto_3km: Some(40.0),
                    upto_4km: Some(50.0),
                    upto_5km: Some(60.0),
                    per_km_5_to_30: Some(5.0),
                    per_km_beyond_30: Some(7.0),
                }),
                ..Default::default()
            }],
            ..Default::default()
        }),
        seigniorage: Some(SeignioragePayload {
            project_name: "Linked Project".into(),
            sor_year: "2025-26".into(),
            groups: vec![SeigniorageGroupPayload {
                key: "STONE".into(),
                rows: vec![SeigniorageRowPayload {
                    key: "stone-row".into(),
                    item_code: "SSR-1".into(),
                    description: "Coarse aggregate".into(),
                    work_qty: Some(10.0),
                    seig_qty: Some(10.0),
                    rate: Some(1.0),
                    ..Default::default()
                }],
                ..Default::default()
            }],
            ..Default::default()
        }),
        cover: Some(CoverPayload {
            work_name: "Linked Project".into(),
            estimated_cost: "Rs. 0".into(),
            ..Default::default()
        }),
        project: Some(ProjectPayload {
            sheets: vec![ProjectSheetPayload {
                name: "Abstract_Linked".into(),
                grid: DetailGridPayload {
                    cells: vec![GridCellPayload {
                        r: 0,
                        c: 0,
                        formula: Some("=0".into()),
                        ..Default::default()
                    }],
                    ..Default::default()
                },
                landscape: true,
            }],
            links: vec![ProjectFormulaLink {
                sheet: "Abstract_Linked".into(),
                r: 0,
                c: 0,
                kind: "data-rate".into(),
                key: "data-1".into(),
            }],
            seigniorage_links: vec![ProjectSeigniorageLink {
                key: "stone-row".into(),
                work_qty_formula: Some("='Abstract_Linked'!$A$1".into()),
                terms: vec![ProjectSeigniorageTermLink {
                    formula: "='Abstract_Linked'!$A$1*1".into(),
                    lead_variant_id: Some("lead-1".into()),
                }],
            }],
            cover_cost_ref: "'Abstract_Linked'!A1".into(),
            ..Default::default()
        }),
        ..Default::default()
    };

    let bytes = generate_workbook(&req).expect("linked project workbook");
    assert_eq!(&bytes[0..2], b"PK");
    assert!(bytes.len() > 1_000, "combined workbook should not be empty");

    // Project-owned sheets use the same image grid as standalone Detailed
    // sheets. A renderer dataBase64 image must not deserialize as empty.
    req.project.as_mut().unwrap().sheets[0].grid.images.push(
        serde_json::from_value(serde_json::json!({
            "r": 9, "c": 0,
            "dataBase64": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
            "mime": "image/png", "scaleW": 1, "scaleH": 1
        }))
        .expect("project detail image"),
    );
    let image_bytes = generate_workbook(&req).expect("linked project workbook with image");
    assert_eq!(&image_bytes[0..2], b"PK");

    req.recipes[0].leads.as_mut().expect("lead rows")[0].lead_key = "missing-lead".into();
    let error = generate_workbook(&req).expect_err("missing Lead link must fail");
    assert!(error.contains("missing-lead"));
}

#[test]
fn test_excel_missing_kind_payload_errors() {
    let req = ExcelCompileRequest {
        kind: ExcelKind::Boq,
        ..Default::default()
    };
    assert!(generate_workbook(&req).is_err());
}

#[test]
fn test_wrap_text_height_grows_but_never_shrinks() {
    let close = |got: f64, want: f64| {
        assert!(
            (got - want).abs() < 1e-9,
            "wrap_text_height = {got}, want {want}"
        );
    };
    // Empty text keeps the floor.
    close(wrap_text_height("", 42.0, 10.0, 15.0), 15.0);
    // Short text also keeps the floor (one 10pt line = 13.0 < 15).
    close(wrap_text_height("PCC 1:2:4", 42.0, 10.0, 15.0), 15.0);
    // Long descriptions grow: 100 chars in a 42-char column wrap to
    // 3 lines -> 3 * 10 * 1.3 = 39.0.
    close(wrap_text_height(&"x".repeat(100), 42.0, 10.0, 15.0), 39.0);
    // Explicit newlines count as extra lines.
    close(wrap_text_height("a\nb\nc", 42.0, 10.0, 15.0), 39.0);
}

#[test]
fn test_detail_grid_round_trip_wrap_clip_rotation_valign_hidden_merges_numfmt() {
    use std::io::{Cursor, Read};

    // Reopen proof for the workbook.save() snapshot mapping: WRAP (tb=3)
    // wraps, CLIP (tb=2) keeps the default no-wrap overflow, the tr angle and
    // vertical flag land in textRotation, vt lands in vertical alignment,
    // unspecified align/valign stay at the Excel default, hd rows/cols use
    // the zero-size convention, merges precede values, and numFmts pass
    // through verbatim with numerics staying numeric.
    let page: PagePayload = serde_json::from_value(serde_json::json!({
        "name": "RoundTrip",
        "landscape": false,
        "grid": {
            "cells": [
                {"r": 0, "c": 0, "value": "Detail Title"},
                {"r": 1, "c": 0, "value": "wrap text must wrap", "style": {"wrap": true}},
                {"r": 1, "c": 1, "value": "clip text must not wrap"},
                {"r": 1, "c": 2, "value": "rotated 45", "style": {"rotation": 45, "align": "center", "valign": "middle"}},
                {"r": 1, "c": 3, "value": "rotated vertical", "style": {"rotation": -90, "valign": "middle", "readingOrder": 2}},
                {"r": 2, "c": 0, "value": "top aligned", "style": {"valign": "top"}},
                {"r": 2, "c": 1, "value": "bottom aligned", "style": {"valign": "bottom"}},
                {"r": 2, "c": 2, "value": 1234.5, "numFmt": "#,##0.00"},
                {"r": 2, "c": 3, "value": 0.15, "numFmt": "0.00%"},
                {"r": 4, "c": 0, "value": "below hidden row"},
                {"r": 5, "c": 1, "value": "stacked", "style": {"verticalText": true}}
            ],
            "merges": [
                {"r1": 0, "c1": 0, "r2": 0, "c2": 3},
                {"r1": 4, "c1": 0, "r2": 5, "c2": 0}
            ],
            "colWidthsChars": [18, 22, 14, 12, 0],
            "colWidthsPx": [126, 154, 98, 84, 0],
            "rowHeightsPt": [15, 67.5, 15, 0, 15, 15]
        }
    }))
    .expect("round-trip grid payload");

    let bytes = generate_excel_page_workbook(&page, &ExcelCompileRequest::default())
        .expect("round-trip workbook");
    assert_eq!(&bytes[0..2], b"PK");
    // Fresh artifact for visual inspection (src-tauri/target/ is gitignored).
    let artifact_dir =
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("target/ee-export-proof");
    let _ = std::fs::create_dir_all(&artifact_dir);
    let _ = std::fs::write(artifact_dir.join("roundtrip.xlsx"), &bytes);
    let mut zip = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
    let mut sheet = String::new();
    zip.by_name("xl/worksheets/sheet1.xml")
        .unwrap()
        .read_to_string(&mut sheet)
        .unwrap();
    let mut styles = String::new();
    zip.by_name("xl/styles.xml")
        .unwrap()
        .read_to_string(&mut styles)
        .unwrap();
    let mut strings = String::new();
    zip.by_name("xl/sharedStrings.xml")
        .unwrap()
        .read_to_string(&mut strings)
        .unwrap();

    // Style index (`s`) of a cell in the reopened sheet XML; None means the
    // writer left the cell on the Excel default (no `s` attribute).
    fn cell_style(sheet: &str, cell_ref: &str) -> Option<usize> {
        let needle = format!(r#"<c r="{cell_ref}""#);
        let start = sheet.find(&needle)?;
        let rest = &sheet[start..];
        let tag = &rest[..rest.find('>')?];
        let s = tag.find(r#"s=""#)? + 3;
        let end = tag[s..].find('"')?;
        tag[s..s + end].parse().ok()
    }

    // `<alignment .../>` carried by the nth xf in `<cellXfs>`; None when the
    // xf has no alignment child (every alignment property at default).
    fn xf_alignment(styles: &str, index: usize) -> Option<String> {
        let start = styles.find("<cellXfs")?;
        let rest = &styles[start..];
        let block = &rest[..rest.find("</cellXfs>")?];
        let xf = block.split("<xf").nth(index + 1)?;
        let body_end = xf.find("</xf>").or_else(|| xf.find("/>"))?;
        let body = &xf[..body_end];
        let a = body.find("<alignment")?;
        let a_end = a + body[a..].find("/>")?;
        Some(body[a..a_end].to_string())
    }

    // Full `<row ...>` tag for a 1-based row number, if serialized.
    fn row_tag<'a>(sheet: &'a str, r: u32) -> Option<&'a str> {
        let needle = format!(r#"<row r="{r}""#);
        let mut search = sheet;
        loop {
            let pos = search.find(&needle)?;
            let after = &search[pos + needle.len()..];
            if after.starts_with(' ') || after.starts_with('>') {
                let rest = &search[pos..];
                return Some(&rest[..rest.find('>')?]);
            }
            search = &after[1..];
        }
    }

    // `<col .../>` entry covering a 1-based column number, if serialized.
    fn col_tag<'a>(sheet: &'a str, c: u32) -> Option<&'a str> {
        let block_start = sheet.find("<cols>")?;
        let rest = &sheet[block_start..];
        let block = &rest[..rest.find("</cols>")?];
        let mut search = block;
        loop {
            let pos = search.find("<col ")?;
            let tag_rest = &search[pos..];
            let tag = &tag_rest[..tag_rest.find("/>")?];
            let attr = |name: &str| {
                let needle = format!(r#"{name}=""#);
                let s = tag.find(&needle)? + needle.len();
                let e = tag[s..].find('"')?;
                tag[s..s + e].parse::<u32>().ok()
            };
            if attr("min").is_some_and(|min| min <= c)
                && attr("max").is_some_and(|max| c <= max)
            {
                return Some(tag);
            }
            search = &tag_rest[tag.len() + 2..];
        }
    }

    // Merges land in the sheet, and the merge origin text survives because
    // merges are applied before values are written.
    assert!(sheet.contains(r#"mergeCell ref="A1:D1""#), "{sheet}");
    assert!(sheet.contains(r#"mergeCell ref="A5:A6""#), "{sheet}");
    assert!(strings.contains("Detail Title"), "{strings}");

    // WRAP wraps; CLIP (no wrap flag) leaves the default no-wrap overflow.
    let wrap = xf_alignment(&styles, cell_style(&sheet, "A2").expect("wrap cell style"))
        .expect("wrap cell alignment");
    assert!(wrap.contains(r#"wrapText="1""#), "{wrap}");
    let clip = cell_style(&sheet, "B2").and_then(|s| xf_alignment(&styles, s));
    assert!(
        clip.as_deref().map_or(true, |a| !a.contains("wrapText")),
        "clip cell must not wrap: {clip:?}"
    );

    // tr angle and the tr.v vertical flag land in textRotation as continuous
    // angles; vt lands in vertical alignment; td lands in readingOrder.
    let rot = xf_alignment(&styles, cell_style(&sheet, "C2").expect("rotated cell style"))
        .expect("rotated cell alignment");
    assert!(rot.contains(r#"textRotation="45""#), "{rot}");
    assert!(rot.contains(r#"vertical="center""#), "{rot}");
    assert!(rot.contains(r#"horizontal="center""#), "{rot}");
    let vert = xf_alignment(&styles, cell_style(&sheet, "D2").expect("vertical cell style"))
        .expect("vertical cell alignment");
    // Univer tr.v === 1 is a continuous canvas rotation reading top-to-bottom,
    // i.e. Excel -90, which the writer encodes as textRotation="180" (the
    // -rotation + 90 OOXML form) — never stacked 255 text.
    assert!(vert.contains(r#"textRotation="180""#), "{vert}");
    assert!(vert.contains(r#"vertical="center""#), "{vert}");
    assert!(vert.contains(r#"readingOrder="2""#), "{vert}");
    // Writer-level stacked text still encodes as textRotation="255".
    let stacked = xf_alignment(&styles, cell_style(&sheet, "B6").expect("stacked cell style"))
        .expect("stacked cell alignment");
    assert!(stacked.contains(r#"textRotation="255""#), "{stacked}");
    let top = xf_alignment(&styles, cell_style(&sheet, "A3").expect("top cell style"))
        .expect("top cell alignment");
    assert!(top.contains(r#"vertical="top""#), "{top}");
    // Excel's default vertical is bottom, so an explicit bottom writes no
    // vertical attribute.
    let bottom = cell_style(&sheet, "B3").and_then(|s| xf_alignment(&styles, s));
    assert!(
        bottom.as_deref().map_or(true, |a| !a.contains("vertical=")),
        "bottom is the default: {bottom:?}"
    );

    // Unspecified align/valign stay at the Excel default — never forced to
    // centre.
    for cell_ref in ["A1", "B2"] {
        let align = cell_style(&sheet, cell_ref)
            .and_then(|s| xf_alignment(&styles, s))
            .unwrap_or_default();
        assert!(!align.contains(r#"horizontal="center""#), "{cell_ref}: {align}");
        assert!(!align.contains(r#"vertical="center""#), "{cell_ref}: {align}");
    }

    // hd rows/cols use the zero-size convention (height/width 0).
    let hidden_col = col_tag(&sheet, 5).expect("hidden col E entry");
    assert!(
        hidden_col.contains(r#"width="0""#) || hidden_col.contains(r#"hidden="1""#),
        "{hidden_col}"
    );
    let hidden_row = row_tag(&sheet, 4).expect("hidden row 4 entry");
    assert!(
        hidden_row.contains(r#"ht="0""#) || hidden_row.contains(r#"hidden="1""#),
        "{hidden_row}"
    );

    // Detail heights pass through exactly as read: the tall vertical-text
    // header row keeps 67.5pt.
    let tall = row_tag(&sheet, 2).expect("tall row 2 entry");
    assert!(tall.contains("67.5"), "{tall}");

    // numFmts pass through verbatim and numerics stay numeric.
    assert!(styles.contains("#,##0.00"), "{styles}");
    assert!(styles.contains("0.00%"), "{styles}");
    assert!(sheet.contains("<v>1234.5</v>"), "{sheet}");
    assert!(sheet.contains("<v>0.15</v>"), "{sheet}");
}

#[test]
fn test_detail_grid_chars_fallback_narrow_wide_hidden() {
    use std::io::{Cursor, Read};

    // Without the pixel lane the chars fallback applies with no minimum
    // floor: narrow stays narrow, wide stays wide, hidden stays hidden.
    let page: PagePayload = serde_json::from_value(serde_json::json!({
        "name": "Widths",
        "landscape": false,
        "grid": {
            "cells": [
                {"r": 0, "c": 0, "value": "narrow"},
                {"r": 0, "c": 1, "value": "wide"},
                {"r": 0, "c": 2, "value": "hidden"}
            ],
            "colWidthsChars": [2.5, 100, 0],
            "rowHeightsPt": [15]
        }
    }))
    .expect("widths grid payload");

    let bytes = generate_excel_page_workbook(&page, &ExcelCompileRequest::default())
        .expect("widths workbook");
    let mut zip = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
    let mut sheet = String::new();
    zip.by_name("xl/worksheets/sheet1.xml")
        .unwrap()
        .read_to_string(&mut sheet)
        .unwrap();

    fn col_width(sheet: &str, c: u32) -> Option<String> {
        let block = &sheet[sheet.find("<cols>")?..sheet.find("</cols>")?];
        let mut search = block;
        loop {
            let pos = search.find("<col ")?;
            let rest = &search[pos..];
            let tag = &rest[..rest.find("/>")?];
            let attr = |name: &str| {
                let s = tag.find(&format!(r#"{name}=""#))? + name.len() + 2;
                let e = tag[s..].find('"')?;
                Some(tag[s..s + e].to_string())
            };
            if attr("min")?.parse::<u32>().ok()? <= c && c <= attr("max")?.parse::<u32>().ok()? {
                return Some(tag.to_string());
            }
            search = &rest[tag.len() + 2..];
        }
    }

    let narrow = col_width(&sheet, 1).expect("narrow col A entry");
    let wide = col_width(&sheet, 2).expect("wide col B entry");
    let hidden = col_width(&sheet, 3).expect("hidden col C entry");
    let width_of = |tag: &str| {
        tag.split_whitespace()
            .find(|p| p.starts_with("width="))
            .and_then(|p| p.trim_start_matches("width=\"").trim_end_matches('"').parse::<f64>().ok())
    };
    let (nw, ww) = (width_of(&narrow), width_of(&wide));
    assert!(
        matches!((nw, ww), (Some(n), Some(w)) if n > 0.0 && w > n),
        "narrow stays narrow and wide stays wide: {narrow} / {wide}"
    );
    assert!(
        hidden.contains(r#"width="0""#) || hidden.contains(r#"hidden="1""#),
        "{hidden}"
    );
}
