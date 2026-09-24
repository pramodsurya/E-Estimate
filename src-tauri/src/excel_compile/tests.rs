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
