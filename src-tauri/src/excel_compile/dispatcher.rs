use super::boq::generate_excel_boq_workbook;
use super::comparative::generate_excel_comparative_workbook;
use super::component::{
    generate_excel_bund_workbook, generate_excel_component_workbook,
    generate_excel_guidewall_workbook,
};
use super::cover::generate_excel_cover_workbook;
use super::data::generate_excel_data_workbook;
use super::lead::generate_excel_lead_workbook;
use super::models::*;
use super::page::generate_excel_page_workbook;
use super::project::generate_excel_project_workbook;
use super::seigniorage::generate_excel_seigniorage_workbook;
use rust_xlsxwriter::XlsxError;

// ============================================================================
// Dispatcher: routes the excel_compile payload to the matching builder.
// ============================================================================

pub fn generate_workbook(req: &ExcelCompileRequest) -> Result<Vec<u8>, String> {
    let run = |result: Result<Vec<u8>, XlsxError>| {
        result.map_err(|e| format!("Excel compilation error: {:?}", e))
    };
    match req.kind {
        ExcelKind::Data => run(generate_excel_data_workbook(req)),
        ExcelKind::Boq => match &req.boq {
            Some(p) => run(generate_excel_boq_workbook(p, req)),
            None => Err(
                "Excel compilation error: kind is 'boq' but no 'boq' payload was provided."
                    .to_string(),
            ),
        },
        ExcelKind::Comparative => match &req.comparative {
            Some(p) => run(generate_excel_comparative_workbook(p, req)),
            None => Err(
                "Excel compilation error: kind is 'comparative' but no 'comparative' payload was provided."
                    .to_string(),
            ),
        },
        ExcelKind::Seigniorage => match &req.seigniorage {
            Some(p) => run(generate_excel_seigniorage_workbook(p, req)),
            None => Err(
                "Excel compilation error: kind is 'seigniorage' but no 'seigniorage' payload was provided."
                    .to_string(),
            ),
        },
        ExcelKind::Lead => match &req.lead {
            Some(p) => run(generate_excel_lead_workbook(p, req)),
            None => Err(
                "Excel compilation error: kind is 'lead' but no 'lead' payload was provided."
                    .to_string(),
            ),
        },
        ExcelKind::Component => match &req.component {
            Some(p) => run(generate_excel_component_workbook(p, req)),
            None => Err(
                "Excel compilation error: kind is 'component' but no 'component' payload was provided."
                    .to_string(),
            ),
        },
        ExcelKind::Cover => match &req.cover {
            Some(p) => run(generate_excel_cover_workbook(p, req)),
            None => Err(
                "Excel compilation error: kind is 'cover' but no 'cover' payload was provided."
                    .to_string(),
            ),
        },
        ExcelKind::Page => match &req.page {
            Some(p) => run(generate_excel_page_workbook(p, req)),
            None => Err(
                "Excel compilation error: kind is 'page' but no 'page' payload was provided."
                    .to_string(),
            ),
        },
        ExcelKind::Bund => match &req.bund {
            Some(p) => run(generate_excel_bund_workbook(p, req)),
            None => Err(
                "Excel compilation error: kind is 'bund' but no 'bund' payload was provided."
                    .to_string(),
            ),
        },
        ExcelKind::Guidewall => match &req.guidewall {
            Some(p) => run(generate_excel_guidewall_workbook(p, req)),
            None => Err(
                "Excel compilation error: kind is 'guidewall' but no 'guidewall' payload was provided."
                    .to_string(),
            ),
        },
        ExcelKind::Project => match &req.project {
            Some(p) => run(generate_excel_project_workbook(p, req)),
            None => Err(
                "Excel compilation error: kind is 'project' but no 'project' payload was provided."
                    .to_string(),
            ),
        },
    }
}
