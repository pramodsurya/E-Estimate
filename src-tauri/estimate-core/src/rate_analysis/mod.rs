pub mod calculator;
pub mod models;

pub use calculator::*;
pub use models::*;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_renderer_recipe_identifiers() {
        let recipe: RateAnalysisRecipe = serde_json::from_value(serde_json::json!({
            "schemaVersion": 1,
            "itemKey": "IRR-CAW-1-1",
            "itemCode": "IRR-CAW-1-1",
            "itemSource": "SSR",
            "description": "Canal work",
            "unit": "cum",
            "outputQuantity": 1,
            "overheadPercent": 14,
            "sections": [{"key": "materials", "lines": [{
                "id": "m1", "description": "Sand", "quantity": 2,
                "rate": 50, "amount": 100
            }]}]
        }))
        .expect("the renderer's DATA recipe must deserialize for export");
        assert_eq!(recipe.id, "IRR-CAW-1-1");
        assert_eq!(recipe.code, "IRR-CAW-1-1");
        assert_eq!(calculate_rate_analysis(&recipe).rate_per_unit, 114.0);
    }

    #[test]
    fn test_rate_analysis_calculation() {
        let recipe = RateAnalysisRecipe {
            id: "r1".into(),
            code: "IRR-DAW-5-6".into(),
            description: "Formation of bund with compaction".into(),
            item_source: Some("SSR".into()),
            unit: Some("cu.m".into()),
            output_quantity: 10.0,
            overhead_percent: 14.0,       // 14% contractor profit & overheads
            area_allowance_percent: 10.0, // 10% area allowance on labour
            sections: vec![
                RateAnalysisSection {
                    key: RateAnalysisSectionKey::Materials,
                    lines: vec![RateAnalysisLine {
                        id: "m1".into(),
                        description: "Water for compaction".into(),
                        unit: Some("KL".into()),
                        quantity: 2.0,
                        rate: 100.0,
                        amount: 200.0,
                        group_id: None,
                        user_added: false,
                    }],
                },
                RateAnalysisSection {
                    key: RateAnalysisSectionKey::Machinery,
                    lines: vec![RateAnalysisLine {
                        id: "eq1".into(),
                        description: "Vibratory Roller".into(),
                        unit: Some("hour".into()),
                        quantity: 1.0,
                        rate: 1500.0,
                        amount: 1500.0,
                        group_id: None,
                        user_added: false,
                    }],
                },
                RateAnalysisSection {
                    key: RateAnalysisSectionKey::Labour,
                    lines: vec![RateAnalysisLine {
                        id: "l1".into(),
                        description: "Mazdoor".into(),
                        unit: Some("day".into()),
                        quantity: 2.0,
                        rate: 500.0,
                        amount: 1000.0,
                        group_id: None,
                        user_added: false,
                    }],
                },
            ],
            published_rate: None,
            recalculation: None,
            stored_values: None,
            published_rate_blocks: None,
            data_variant: None,
            post_rate_multiplier: None,
        };

        let summary = calculate_rate_analysis(&recipe);

        // Materials = 200.0
        assert_eq!(summary.section_totals.materials, 200.0);
        // Machinery = 1500.0
        assert_eq!(summary.section_totals.machinery, 1500.0);
        // Labour base = 1000.0, 10% allowance = 100.0 -> labour with allowance = 1100.0
        assert_eq!(summary.labour_base_cost, 1000.0);
        assert_eq!(summary.area_allowance_amount, 100.0);
        assert_eq!(summary.labour_cost_with_area_allowance, 1100.0);

        // Base cost = 200 + 1500 + 1100 = 2800.0
        assert_eq!(summary.base_cost, 2800.0);

        // Overhead @ 14% = 2800 * 0.14 = 392.0
        assert_eq!(summary.overhead_amount, 392.0);

        // Total cost = 2800 + 392 = 3192.0
        assert_eq!(summary.total_cost, 3192.0);

        // Rate per unit (output qty = 10.0) = 3192.0 / 10.0 = 319.2
        assert_eq!(summary.rate_per_unit, 319.2);
    }
}
