use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "kebab-case")]
pub enum CutBermMode {
    #[default]
    Programmatic,
    Manual,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ManualCutBerm {
    pub id: String,
    pub height_above_bed: f64,
    pub width: f64,
    pub slope: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CutBermConfig {
    pub enabled: bool,
    #[serde(default)]
    pub mode: CutBermMode,
    #[serde(default = "default_first_berm_at_tbl")]
    pub first_berm_at_tbl: bool,
    #[serde(default = "default_interval_m")]
    pub interval_m: f64,
    #[serde(default = "default_min_top_clearance")]
    pub min_top_clearance_m: f64,
    #[serde(default = "default_width")]
    pub width: f64,
    #[serde(default = "default_manual_base_slope")]
    pub manual_base_slope: f64,
    #[serde(default)]
    pub manual_berms: Vec<ManualCutBerm>,
}

fn default_first_berm_at_tbl() -> bool {
    true
}
fn default_interval_m() -> f64 {
    6.0
}
fn default_min_top_clearance() -> f64 {
    7.5
}
fn default_width() -> f64 {
    2.0
}
fn default_manual_base_slope() -> f64 {
    1.5
}

impl Default for CutBermConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            mode: CutBermMode::Manual,
            first_berm_at_tbl: true,
            interval_m: 6.0,
            min_top_clearance_m: 7.5,
            width: 2.0,
            manual_base_slope: 1.5,
            manual_berms: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StrataSlopeConfig {
    #[serde(default = "default_soil_slope")]
    pub all_soils_slope: f64,
    #[serde(default = "default_hdr_slope")]
    pub hdr_slope: f64,
    #[serde(default = "default_ff_slope")]
    pub ff_slope: f64,
    #[serde(default = "default_hr_slope")]
    pub hr_slope: f64,
}

fn default_soil_slope() -> f64 {
    1.5
}
fn default_hdr_slope() -> f64 {
    0.75
}
fn default_ff_slope() -> f64 {
    0.5
}
fn default_hr_slope() -> f64 {
    0.25
}

impl Default for StrataSlopeConfig {
    fn default() -> Self {
        Self {
            all_soils_slope: 1.5,
            hdr_slope: 0.75,
            ff_slope: 0.5,
            hr_slope: 0.25,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ServiceRoadInput {
    pub id: String,
    pub from_chainage: f64,
    pub to_chainage: f64,
    #[serde(default = "default_side")]
    pub side: String,
    #[serde(default = "default_height_mode")]
    pub height_mode: String,
    #[serde(default)]
    pub height_above_bed: f64,
    #[serde(default)]
    pub width: f64,
    #[serde(default)]
    pub shoulder_width: f64,
}

fn default_side() -> String {
    "left".into()
}
fn default_height_mode() -> String {
    "tbl".into()
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SectionInput {
    pub id: String,
    pub chainage: f64,
    #[serde(default)]
    pub ground_level: f64,
    #[serde(default)]
    pub bed_level: Option<f64>,
    // Explicit stratum depths (m) if entered from soil classification / ERM
    #[serde(default)]
    pub soil_depth: Option<f64>,
    #[serde(default)]
    pub hdr_depth: Option<f64>,
    #[serde(default)]
    pub ff_depth: Option<f64>,
    #[serde(default)]
    pub hr_depth: Option<f64>,
    // Percentage fallbacks
    #[serde(default)]
    pub soil_pct: Option<f64>,
    #[serde(default)]
    pub hdr_pct: Option<f64>,
    #[serde(default)]
    pub ff_pct: Option<f64>,
    #[serde(default)]
    pub hr_pct: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CanalCuttingInput {
    pub bed_width: f64,
    pub full_supply_depth: f64,
    pub free_board: f64,
    pub side_slope: f64, // inner slope (H : 1V)
    pub bed_slope: f64,  // longitudinal slope (e.g. 0.00025 = 1 in 4000)
    pub bed_level_at_start: f64,
    pub berm_config: CutBermConfig,
    #[serde(default)]
    pub strata_slopes: StrataSlopeConfig,
    #[serde(default)]
    pub service_roads: Vec<ServiceRoadInput>,
    pub sections: Vec<SectionInput>,
}

/// A slice of a specific stratum within a Trapezoid Tier
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StratumSlice {
    pub stratum_name: String, // "Hard Rock", "F&F Rock", "HDR", "All Soils"
    pub bottom_rl: f64,
    pub top_rl: f64,
    pub depth: f64,
    pub bottom_width: f64,
    pub top_width: f64,
    pub slope: f64,
    pub area: f64,
}

/// A complete Trapezoid Tier (e.g. Tier 1: Bed to TBL, Tier 2: TBL to Berm 1, etc.)
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TrapezoidTier {
    pub tier_index: usize, // 1-based index (1, 2, 3...)
    pub tier_name: String,
    pub bottom_rl: f64,
    pub top_rl: f64,
    pub total_depth: f64,
    pub starting_bottom_width: f64,
    pub ending_top_width: f64,
    pub strata_slices: Vec<StratumSlice>,
    pub total_tier_area: f64,
    pub left_shelf_width: f64,
    pub right_shelf_width: f64,
    pub has_berm: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ActiveBerm {
    pub index: usize,
    pub height_above_bed: f64,
    pub rl: f64,
    pub shelf_width: f64,
    #[serde(default)]
    pub left_shelf_width: f64,
    #[serde(default)]
    pub right_shelf_width: f64,
    pub slope_after: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StrataBreakdown {
    pub soil_area: f64,
    pub hdr_area: f64,
    pub ff_area: f64,
    pub hr_area: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SectionCutResult {
    pub section_id: String,
    pub chainage: f64,
    pub ground_level: f64,
    pub bed_level: f64,
    pub tbl_level: f64,
    pub cut_depth: f64, // GL - Bed
    pub cut_depth_above_tbl: f64, // GL - TBL
    pub active_berms: Vec<ActiveBerm>,
    pub discarded_berms: Vec<ManualCutBerm>,
    pub tiers: Vec<TrapezoidTier>,
    pub total_cut_area: f64,
    pub strata_areas: StrataBreakdown,
    pub diagram_svg: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CuttingReach {
    pub reach_index: usize,
    pub reach_name: String,
    pub from_chainage: f64,
    pub to_chainage: f64,
    pub length_m: f64,
    pub berm_count: usize,
    pub active_berm_elevations: Vec<f64>,
    pub section_count: usize,
    pub section_indices: Vec<usize>,
    pub total_volume_m3: f64,
    pub soil_volume_m3: f64,
    pub hdr_volume_m3: f64,
    pub ff_volume_m3: f64,
    pub hr_volume_m3: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CanalCuttingCalculationResponse {
    pub tbl_height: f64, // FSD + FB
    pub max_tiers_count: usize,
    pub reaches: Vec<CuttingReach>,
    pub sections: Vec<SectionCutResult>,
    pub total_cutting_volume_m3: f64,
    pub total_soil_volume_m3: f64,
    pub total_hdr_volume_m3: f64,
    pub total_ff_volume_m3: f64,
    pub total_hr_volume_m3: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CanalBankSideConfig {
    #[serde(default = "default_left_crest_width")]
    pub top_width: f64,
    #[serde(default = "default_inner_slope")]
    pub inner_slope: f64,
    #[serde(default = "default_outer_slope")]
    pub outer_slope: f64,
    #[serde(default)]
    pub berm_interval_m: Option<f64>,
    #[serde(default)]
    pub berm_width: Option<f64>,
}

pub fn default_left_crest_width() -> f64 {
    5.0
}
pub fn default_right_crest_width() -> f64 {
    8.0
}
pub fn default_inner_slope() -> f64 {
    1.5
}
pub fn default_outer_slope() -> f64 {
    2.0
}
pub fn default_stripping_depth() -> f64 {
    0.15
}

pub fn default_left_bank() -> CanalBankSideConfig {
    CanalBankSideConfig {
        top_width: default_left_crest_width(),
        inner_slope: default_inner_slope(),
        outer_slope: default_outer_slope(),
        berm_interval_m: None,
        berm_width: None,
    }
}

pub fn default_right_bank() -> CanalBankSideConfig {
    CanalBankSideConfig {
        top_width: default_right_crest_width(),
        inner_slope: default_inner_slope(),
        outer_slope: default_outer_slope(),
        berm_interval_m: None,
        berm_width: None,
    }
}

impl Default for CanalBankSideConfig {
    fn default() -> Self {
        Self {
            top_width: 5.0,
            inner_slope: 1.5,
            outer_slope: 2.0,
            berm_interval_m: None,
            berm_width: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CanalBankBermStepInput {
    #[serde(default)]
    pub id: String,
    pub drop_height: f64,
    pub shelf_width: f64,
    pub slope_after_berm: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CanalBankTierInput {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub min_fill_height: f64,
    #[serde(default = "default_max_fill_height")]
    pub max_fill_height: f64,
    #[serde(default = "default_crest_width")]
    pub crest_width: f64,
    #[serde(default = "default_base_slope")]
    pub base_slope: f64,
    #[serde(default = "default_inner_slope")]
    pub inner_slope: f64,
    #[serde(default = "default_section_type")]
    pub section_type: String,
    #[serde(default)]
    pub berms: Vec<CanalBankBermStepInput>,
    #[serde(default)]
    pub hearting_top_width: Option<f64>,
    #[serde(default)]
    pub hearting_side_slope: Option<f64>,
}

fn default_max_fill_height() -> f64 {
    9999.0
}
fn default_crest_width() -> f64 {
    5.0
}
fn default_base_slope() -> f64 {
    2.0
}
fn default_section_type() -> String {
    "homogeneous".into()
}
fn default_compaction_95() -> u32 {
    95
}
fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CanalBankManualReachInput {
    pub from: f64,
    pub to: f64,
    pub tier_id: String,
    #[serde(default)]
    pub status: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ExcavationBandInput {
    pub label: String,
    pub pct: f64,
    #[serde(default)]
    pub bank_reuse_pct: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BankMaterialAllocationInput {
    #[serde(default)]
    pub id: Option<String>,
    pub zone: String, // "homogeneous", "hearting", "casing"
    pub source: String, // "canal-excavation", "borrow-area", "dump-area"
    #[serde(default)]
    pub percentage: f64,
    #[serde(default = "default_compaction_95")]
    pub compaction: u32,
    #[serde(default = "default_true")]
    pub watering: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SoilAllocationItem {
    pub zone: String,
    pub source: String,
    pub percentage: f64,
    pub volume_m3: f64,
    pub compaction: u32,
    pub watering: bool,
    pub item_code: String,
    pub item_description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct SoilAllocationSummary {
    pub total_fill_volume_m3: f64,
    pub suitable_cut_available_m3: f64,
    pub allocated_from_cut_m3: f64,
    pub allocated_from_borrow_m3: f64,
    pub allocated_from_dump_m3: f64,
    pub items: Vec<SoilAllocationItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CanalEmbankmentInput {
    pub bed_width: f64,
    pub full_supply_depth: f64,
    pub free_board: f64,
    pub bed_slope: f64,
    pub bed_level_at_start: f64,
    #[serde(default = "default_stripping_depth")]
    pub stripping_depth: f64,
    #[serde(default)]
    pub mode: String, // "tiered", "manual", "legacy"
    #[serde(default = "default_true")]
    pub link_symmetrical: bool,
    #[serde(default)]
    pub left_tiers: Vec<CanalBankTierInput>,
    #[serde(default)]
    pub right_tiers: Vec<CanalBankTierInput>,
    #[serde(default)]
    pub left_manual_reaches: Vec<CanalBankManualReachInput>,
    #[serde(default)]
    pub right_manual_reaches: Vec<CanalBankManualReachInput>,
    #[serde(default = "default_left_bank")]
    pub left_bank: CanalBankSideConfig,
    #[serde(default = "default_right_bank")]
    pub right_bank: CanalBankSideConfig,
    #[serde(default)]
    pub excavation_bands: Vec<ExcavationBandInput>,
    #[serde(default)]
    pub material_allocations: Vec<BankMaterialAllocationInput>,
    #[serde(default)]
    pub total_cut_volume: Option<f64>,
    pub sections: Vec<SectionInput>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SectionEmbankmentResult {
    pub section_id: String,
    pub chainage: f64,
    pub ground_level: f64,
    pub bed_level: f64,
    pub tbl_level: f64,
    pub fsl_level: f64,
    pub net_banking_height: f64,
    pub stripping_depth: f64,
    pub gross_banking_height: f64,
    pub left_top_width: f64,
    pub left_bottom_width: f64,
    pub left_bank_area: f64,
    #[serde(default)]
    pub left_tier_name: String,
    pub right_top_width: f64,
    pub right_bottom_width: f64,
    pub right_bank_area: f64,
    #[serde(default)]
    pub right_tier_name: String,
    pub stripping_area: f64,
    pub total_bank_area: f64,
    #[serde(default)]
    pub hearting_area: f64,
    #[serde(default)]
    pub casing_area: f64,
    #[serde(default)]
    pub homogeneous_area: f64,
    pub diagram_svg: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EmbankmentReachResult {
    pub reach_index: usize,
    pub reach_name: String,
    pub from_chainage: f64,
    pub to_chainage: f64,
    pub length: f64,
    pub is_pure_cut: bool,
    pub tier_name: String,
    pub section_count: usize,
    pub left_volume: f64,
    pub right_volume: f64,
    pub total_bank_volume: f64,
    pub stripping_volume: f64,
    pub hearting_volume: f64,
    pub casing_volume: f64,
    pub homogeneous_volume: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CanalEmbankmentCalculationResponse {
    pub tbl_height: f64,
    pub sections: Vec<SectionEmbankmentResult>,
    pub reaches: Vec<EmbankmentReachResult>,
    pub soil_allocation: SoilAllocationSummary,
    pub total_bank_volume: f64,
    pub total_stripping_volume: f64,
    pub total_left_bank_volume: f64,
    pub total_right_bank_volume: f64,
    pub total_hearting_volume: f64,
    pub total_casing_volume: f64,
    pub total_homogeneous_volume: f64,
}
