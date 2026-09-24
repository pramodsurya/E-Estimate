use estimate_core::rate_analysis::{
    calculate_base_rate_analysis, calculate_rate_analysis, RateAnalysisRecipe,
};
use std::io::{self, Read};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut input = String::new();
    io::stdin().read_to_string(&mut input)?;
    let recipe: RateAnalysisRecipe = serde_json::from_str(&input)?;
    let summary = if std::env::args().any(|argument| argument == "--base") {
        calculate_base_rate_analysis(&recipe)
    } else {
        calculate_rate_analysis(&recipe)
    };
    println!("{}", serde_json::to_string(&summary)?);
    Ok(())
}
