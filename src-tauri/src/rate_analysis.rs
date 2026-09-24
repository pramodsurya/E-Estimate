use estimate_core::rate_analysis::{
    batch_recalculate_recipes, calculate_base_rate_analysis, calculate_rate_analysis,
    RateAnalysisRecipe, RateAnalysisSummary,
};

#[tauri::command]
pub fn rate_analysis_calculate(recipe: RateAnalysisRecipe) -> Result<RateAnalysisSummary, String> {
    Ok(calculate_rate_analysis(&recipe))
}

#[tauri::command]
pub fn rate_analysis_calculate_base(
    recipe: RateAnalysisRecipe,
) -> Result<RateAnalysisSummary, String> {
    Ok(calculate_base_rate_analysis(&recipe))
}

#[tauri::command]
pub fn rate_analysis_batch_calculate(
    recipes: Vec<RateAnalysisRecipe>,
) -> Result<Vec<RateAnalysisSummary>, String> {
    Ok(batch_recalculate_recipes(&recipes))
}
