pub mod cut_calculator;
pub mod diagram;
pub mod embankment_calculator;
pub mod models;
pub mod bank_statement;

pub use cut_calculator::{
    calculate_bed_level, calculate_canal_cutting, compute_section_cut,
    evaluate_manual_berms_with_roads, evaluate_programmatic_berms_with_roads,
};
pub use diagram::{generate_cutting_section_svg, generate_embankment_section_svg};
pub use embankment_calculator::{calculate_canal_embankment, compute_section_embankment};
pub use models::*;
