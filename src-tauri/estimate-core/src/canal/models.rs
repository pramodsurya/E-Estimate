use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "kebab-case")]
pub enum CanalMode {
    #[default]
    New,
    Repair,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "kebab-case")]
pub enum CanalFlowDirection {
    #[default]
    StartToEnd,
    EndToStart,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum CanalBankMaterialSource {
    CanalExcavation,
    DumpArea,
    BorrowArea,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum CanalBankMaterialZone {
    Homogeneous,
    Hearting,
    Casing,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CanalBankMaterialAllocation {
    pub id: String,
    pub zone: CanalBankMaterialZone,
    pub source: CanalBankMaterialSource,
    pub percentage: f64,
    pub compaction: u32,
    pub watering: bool,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum CanalBermFace {
    LeftOuter,
    LeftCanal,
    RightCanal,
    RightOuter,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CanalBerm {
    pub id: String,
    pub face: CanalBermFace,
    pub height_above_bed: f64,
    pub width: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CanalServiceRoadReach {
    pub id: String,
    pub from_chainage: f64,
    pub to_chainage: f64,
    pub side: String,
    pub height_mode: String,
    pub height_above_bed: f64,
    pub width: f64,
    pub shoulder_width: f64,
    pub construction_type: String,
    pub hard_metal_thickness: f64,
    pub hard_metal_code: String,
    pub blindage_code: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CanalDesign {
    pub bed_level_at_start: f64,
    pub discharge: f64,
    pub bed_width: f64,
    pub full_supply_depth: f64,
    pub free_board: f64,
    pub bed_slope: f64,
    pub side_slope: f64,
    pub left_bank_crest_width: f64,
    pub left_bank_outer_slope: f64,
    pub right_bank_crest_width: f64,
    pub right_bank_outer_slope: f64,
    #[serde(default)]
    pub berms: Vec<CanalBerm>,
    #[serde(default)]
    pub service_road_reaches: Vec<CanalServiceRoadReach>,
    #[serde(default)]
    pub bank_section_type: String,
    #[serde(default)]
    pub hearting_level_offset_from_fsl: f64,
    #[serde(default)]
    pub minimum_hearting_height: f64,
    #[serde(default)]
    pub hearting_top_width: f64,
    #[serde(default)]
    pub hearting_left_slope: f64,
    #[serde(default)]
    pub hearting_right_slope: f64,
    #[serde(default)]
    pub hearting_trench_enabled: bool,
    #[serde(default)]
    pub hearting_trench_width: f64,
    #[serde(default)]
    pub hearting_trench_left_slope: f64,
    #[serde(default)]
    pub hearting_trench_right_slope: f64,
    #[serde(default)]
    pub bank_material_allocations: Vec<CanalBankMaterialAllocation>,
    #[serde(default)]
    pub bill_bank_formation: bool,
    #[serde(default)]
    pub bill_bank_compaction: bool,
    #[serde(default)]
    pub bill_hearting: bool,
    #[serde(default)]
    pub bill_casing: bool,
    #[serde(default)]
    pub bill_hearting_trench: bool,
    #[serde(default)]
    pub offtake: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CanalPoint {
    pub offset: f64,
    pub rl: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CanalSection {
    pub id: String,
    pub chainage: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_manual: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ground_entry_mode: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub left_toe_rl: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub right_toe_rl: Option<f64>,
    #[serde(default)]
    pub ground: Vec<CanalPoint>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub design_populated: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub design_point_offsets: Option<Vec<f64>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CanalLiningReach {
    pub id: String,
    pub from_chainage: f64,
    pub to_chainage: f64,
    #[serde(default)]
    pub provide: Option<bool>,
    #[serde(default)]
    pub enabled: Option<bool>,
    #[serde(default)]
    pub lining_type: Option<String>,
    #[serde(default)]
    pub thickness_mm: Option<f64>,
    #[serde(default)]
    pub panel_length_m: Option<f64>,
    #[serde(default)]
    pub model_wall_interval_m: Option<f64>,
    #[serde(default)]
    pub steps_interval_m: Option<f64>,
    #[serde(default)]
    pub plug_slope_spacing_sqm: Option<f64>,
    #[serde(default)]
    pub plug_bed_spacing_sqm: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CanalSectionAreas {
    pub cutting: f64,
    pub left_banking: f64,
    pub right_banking: f64,
    pub total_banking: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CanalEarthworkTotals {
    #[serde(default)]
    pub excavation: f64,
    #[serde(default)]
    pub stripping: f64,
    #[serde(default)]
    pub foundation_excavation: f64,
    #[serde(default)]
    pub cutoff_trench: f64,
    #[serde(default)]
    pub total_cutting_volume: f64,
    #[serde(default)]
    pub total_banking_volume: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CanalLiningReachQuantities {
    pub bed_lining_area: f64,
    pub slope_lining_area: f64,
    pub total_lining_area: f64,
    pub total_lining_volume: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CanalLiningTotals {
    pub reaches: usize,
    pub length: f64,
    pub lining_bed_area: f64,
    pub lining_slope_area: f64,
    pub model_wall_volume: f64,
    pub soffit_volume: f64,
    pub steps_volume: f64,
    pub sleepers_volume: f64,
    pub plugs_slope: i64,
    pub plugs_bed: i64,
    pub mastic_longitudinal: f64,
    pub mastic_transverse: f64,
    pub tarfelt_length: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CanalData {
    pub configured: bool,
    pub mode: CanalMode,
    #[serde(default)]
    pub flow_direction: CanalFlowDirection,
    pub length_m: f64,
    pub interval_m: f64,
    pub design: CanalDesign,
    pub sections: Vec<CanalSection>,
    #[serde(default)]
    pub lining_reaches: Vec<CanalLiningReach>,
}
