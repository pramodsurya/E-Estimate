mod boq;
mod command;
mod common;
mod comparative;
mod component;
mod cover;
mod data;
mod dispatcher;
mod grid;
mod lead;
mod models;
mod page;
mod print_settings;
mod project;
mod seigniorage;
mod styles;

pub use boq::generate_excel_boq_workbook;
pub use comparative::generate_excel_comparative_workbook;
pub use component::{
    generate_excel_bund_workbook, generate_excel_component_workbook,
    generate_excel_guidewall_workbook,
};
pub use cover::generate_excel_cover_workbook;
pub use data::generate_excel_data_workbook;
pub use dispatcher::generate_workbook;
pub use lead::generate_excel_lead_workbook;
pub use models::*;
pub use page::generate_excel_page_workbook;
pub use project::generate_excel_project_workbook;
pub use seigniorage::generate_excel_seigniorage_workbook;

#[tauri::command]
pub fn excel_compile(payload: ExcelCompileRequest) -> Result<ExcelCompileResult, String> {
    command::excel_compile(payload)
}

#[cfg(test)]
pub(crate) use grid::wrap_text_height;

#[cfg(test)]
mod tests;
