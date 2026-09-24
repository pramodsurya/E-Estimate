use super::models::*;
use serde_json::Value;

#[inline]
pub fn round_money(v: f64) -> f64 {
    ((v + f64::EPSILON) * 100.0).round() / 100.0
}

#[inline]
pub fn round_rate(v: f64) -> f64 {
    ((v + f64::EPSILON) * 10.0).round() / 10.0
}

fn field<'a>(value: Option<&'a Value>, key: &str) -> Option<&'a Value> {
    value?.get(key)
}

fn non_null_field<'a>(value: Option<&'a Value>, key: &str) -> Option<&'a Value> {
    field(value, key).filter(|field| !field.is_null())
}

fn truthy(value: Option<&Value>) -> bool {
    match value {
        Some(Value::String(s)) => !s.is_empty(),
        Some(Value::Number(n)) => n.as_f64().is_some_and(|number| number != 0.0),
        Some(Value::Bool(value)) => *value,
        Some(Value::Null) | None => false,
        _ => true,
    }
}

fn number(value: Option<&Value>, fallback: f64) -> f64 {
    match value {
        Some(Value::Number(n)) => n.as_f64().filter(|n| n.is_finite()).unwrap_or(fallback),
        Some(Value::String(s)) if !s.is_empty() => s
            .parse::<f64>()
            .ok()
            .filter(|n| n.is_finite())
            .unwrap_or(fallback),
        _ => fallback,
    }
}

fn amount(value: Option<&Value>) -> f64 {
    number(field(value, "amount"), 0.0)
}

fn rows(value: Option<&Value>) -> &[Value] {
    value
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or(&[])
}

fn text(value: Option<&Value>) -> &str {
    value.and_then(Value::as_str).unwrap_or("")
}

fn output_quantity(recipe: &RateAnalysisRecipe) -> f64 {
    if recipe.output_quantity == 0.0 {
        1.0
    } else {
        recipe.output_quantity
    }
}

pub fn area_allowance_for_labour(labour_base: f64, percent: f64) -> (f64, f64) {
    let amount = round_money(labour_base * percent.max(0.0) / 100.0);
    (amount, round_money(labour_base + amount))
}

fn labour_units(value: Option<&Value>) -> (f64, f64, f64) {
    let labour = rows(value);
    let row_amount = |predicate: &dyn Fn(&str) -> bool, reverse: bool| -> f64 {
        let matching = if reverse {
            labour
                .iter()
                .rev()
                .find(|row| predicate(text(field(Some(row), "label"))))
        } else {
            labour
                .iter()
                .find(|row| predicate(text(field(Some(row), "label"))))
        };
        number(
            field(matching, "amount").or_else(|| field(matching, "value")),
            0.0,
        )
    };
    (
        row_amount(
            &|label| label.to_lowercase().ends_with("labour component/unit qty"),
            false,
        ),
        row_amount(
            &|label| {
                let label = label.to_lowercase();
                label.contains("contractor") || label.contains("overhead")
            },
            false,
        ),
        row_amount(
            &|label| label.to_lowercase().contains("labour component/unit qty"),
            true,
        ),
    )
}

fn summary(
    recipe: &RateAnalysisRecipe,
    section_totals: RateAnalysisSectionTotals,
    labour_base_cost: f64,
    base_cost: f64,
    overhead_amount: f64,
    total_cost: f64,
    rate_per_unit: f64,
    labour_units: (f64, f64, f64),
) -> RateAnalysisSummary {
    let (area_allowance_amount, labour_cost_with_area_allowance) =
        area_allowance_for_labour(labour_base_cost, recipe.area_allowance_percent);
    RateAnalysisSummary {
        section_totals,
        labour_base_cost,
        area_allowance_percent: recipe.area_allowance_percent.max(0.0),
        area_allowance_amount,
        labour_cost_with_area_allowance,
        base_cost,
        overhead_amount,
        total_cost,
        rate_per_unit,
        labour_unit_base: labour_units.0,
        labour_unit_profit: labour_units.1,
        labour_unit_total: labour_units.2,
    }
}

/// Published, edited and SOR recipes have different adoption rules. Never
/// collapse them into a simple sum of detail lines.
pub fn calculate_base_rate_analysis(recipe: &RateAnalysisRecipe) -> RateAnalysisSummary {
    if recipe.item_source.as_deref() == Some("SOR") {
        let base_rate = recipe.published_rate.unwrap_or_else(|| {
            recipe
                .sections
                .iter()
                .flat_map(|section| &section.lines)
                .next()
                .map(|line| line.rate)
                .unwrap_or(0.0)
        });
        let overhead_amount = round_money(base_rate * recipe.overhead_percent / 100.0);
        let rate = round_money(base_rate + overhead_amount);
        let mut result = summary(
            recipe,
            RateAnalysisSectionTotals {
                materials: 0.0,
                machinery: 0.0,
                labour: 0.0,
            },
            0.0,
            base_rate,
            overhead_amount,
            rate,
            rate,
            (0.0, 0.0, 0.0),
        );
        result.area_allowance_percent = 0.0;
        return result;
    }

    if let Some(recalculation) = recipe.recalculation.as_ref() {
        let totals = field(Some(recalculation), "sectionTotals");
        let materials = number(field(totals, "materials"), 0.0);
        let machinery = number(field(totals, "machinery"), 0.0);
        let labour_base = number(field(totals, "labour"), 0.0);
        let subtotal = number(field(Some(recalculation), "subtotal"), 0.0);
        let final_cost = number(field(Some(recalculation), "finalCost"), 0.0);
        let calculated_rate = number(field(Some(recalculation), "calculatedRate"), f64::NAN);
        let labour = non_null_field(Some(recalculation), "labourExtract")
            .or_else(|| non_null_field(recipe.stored_values.as_ref(), "labourExtract"));
        return summary(
            recipe,
            RateAnalysisSectionTotals {
                materials,
                machinery,
                labour: round_money(subtotal - materials - machinery),
            },
            labour_base,
            subtotal,
            round_money(final_cost - subtotal),
            final_cost,
            if calculated_rate.is_finite() {
                calculated_rate
            } else {
                round_money(final_cost / output_quantity(recipe))
            },
            labour_units(labour),
        );
    }

    if let Some(stored) = recipe.stored_values.as_ref() {
        let totals = field(Some(stored), "sectionTotals");
        let materials = number(field(totals, "materials"), 0.0);
        let machinery = number(field(totals, "machinery"), 0.0);
        let labour_base = number(field(totals, "labour"), 0.0);
        let (_, labour) = area_allowance_for_labour(labour_base, recipe.area_allowance_percent);
        let has_allowance = recipe.area_allowance_percent > 0.0;
        let abstract_rows = rows(field(Some(stored), "abstract"));
        let base_cost = if has_allowance {
            round_money(materials + machinery + labour)
        } else {
            amount(abstract_rows.get(3))
        };
        let overhead_amount = if has_allowance {
            round_money(base_cost * recipe.overhead_percent / 100.0)
        } else {
            abstract_rows
                .iter()
                .find(|row| {
                    let label = text(field(Some(row), "label")).to_lowercase();
                    (label.contains("contractor") || label.contains("overhead"))
                        && truthy(field(Some(row), "amount"))
                })
                .map(|row| amount(Some(row)))
                .unwrap_or(0.0)
        };
        let published_block = recipe
            .published_rate_blocks
            .as_deref()
            .unwrap_or(&[])
            .iter()
            .find(|block| field(Some(block), "primary").and_then(Value::as_bool) == Some(true));
        let variant = recipe.data_variant.as_ref();
        let post_rate = field(variant, "postRate").and_then(Value::as_bool) == Some(true);
        let has_addon = optional_addition(recipe).is_some();
        let selected_variant_rate = if !post_rate && !has_addon {
            non_null_field(variant, "rate").or_else(|| non_null_field(published_block, "rate"))
        } else {
            None
        };
        let calculated_base_total = abstract_rows
            .iter()
            .rev()
            .find(|row| {
                text(field(Some(row), "label"))
                    .to_lowercase()
                    .contains("total cost")
            })
            .map(|row| amount(Some(row)))
            .unwrap_or(0.0);
        let total_cost = if has_allowance {
            round_money(base_cost + overhead_amount)
        } else if post_rate || has_addon {
            calculated_base_total
        } else if let Some(rate_value) = selected_variant_rate {
            let rate = number(Some(rate_value), 0.0);
            if variant.is_none() {
                non_null_field(published_block, "totalCost")
                    .map(|value| number(Some(value), 0.0))
                    .unwrap_or_else(|| {
                        round_money(
                            rate * number(
                                field(published_block, "outputQuantity"),
                                output_quantity(recipe),
                            ),
                        )
                    })
            } else {
                round_money(rate * output_quantity(recipe))
            }
        } else {
            calculated_base_total
        };
        let rate_per_unit = if post_rate || has_addon {
            round_money(total_cost / output_quantity(recipe))
        } else if has_allowance {
            round_rate(total_cost / output_quantity(recipe))
        } else if let Some(rate_value) = selected_variant_rate {
            number(Some(rate_value), 0.0)
        } else {
            abstract_rows
                .iter()
                .rev()
                .find(|row| truthy(field(Some(row), "amount")))
                .map(|row| amount(Some(row)))
                .unwrap_or(0.0)
        };
        return summary(
            recipe,
            RateAnalysisSectionTotals {
                materials,
                machinery,
                labour,
            },
            labour_base,
            base_cost,
            overhead_amount,
            total_cost,
            rate_per_unit,
            labour_units(field(Some(stored), "labourExtract")),
        );
    }

    let mut totals = RateAnalysisSectionTotals {
        materials: 0.0,
        machinery: 0.0,
        labour: 0.0,
    };
    for section in &recipe.sections {
        let total = round_money(section.lines.iter().map(|line| line.amount).sum());
        match section.key {
            RateAnalysisSectionKey::Materials => totals.materials = total,
            RateAnalysisSectionKey::Machinery => totals.machinery = total,
            RateAnalysisSectionKey::Labour => totals.labour = total,
        }
    }
    let labour_base = totals.labour;
    let (_, labour) = area_allowance_for_labour(labour_base, recipe.area_allowance_percent);
    totals.labour = labour;
    let base_cost = round_money(totals.materials + totals.machinery + labour);
    let overhead_amount = round_money(base_cost * recipe.overhead_percent / 100.0);
    let total_cost = round_money(base_cost + overhead_amount);
    let unit_base = round_rate(labour / output_quantity(recipe));
    let unit_profit = round_rate(unit_base * recipe.overhead_percent / 100.0);
    summary(
        recipe,
        totals,
        labour_base,
        base_cost,
        overhead_amount,
        total_cost,
        round_rate(total_cost / output_quantity(recipe)),
        (unit_base, unit_profit, round_rate(unit_base + unit_profit)),
    )
}

fn optional_addition(recipe: &RateAnalysisRecipe) -> Option<(f64, f64)> {
    let variant = recipe.data_variant.as_ref()?;
    if text(field(Some(variant), "kind")) != "optional_addition" {
        return None;
    }
    let analysis = field(Some(variant), "additionAnalysis")?;
    let mut totals = RateAnalysisSectionTotals {
        materials: 0.0,
        machinery: 0.0,
        labour: 0.0,
    };
    for section in rows(field(Some(analysis), "sections")) {
        let section_total = round_money(
            rows(field(Some(section), "lines"))
                .iter()
                .map(|line| {
                    round_money(
                        number(field(Some(line), "quantity"), 0.0)
                            * number(field(Some(line), "rate"), 0.0),
                    )
                })
                .sum(),
        );
        match text(field(Some(section), "key")) {
            "materials" => totals.materials = section_total,
            "machinery" => totals.machinery = section_total,
            "labour" => totals.labour = section_total,
            _ => {}
        }
    }
    let (_, labour) = area_allowance_for_labour(totals.labour, recipe.area_allowance_percent);
    let subtotal = round_money(totals.materials + totals.machinery + labour);
    let overhead = number(
        field(Some(analysis), "overheadPercent"),
        recipe.overhead_percent,
    );
    let total_cost = round_money(subtotal + round_money(subtotal * overhead / 100.0));
    let quantity = number(field(Some(analysis), "outputQuantity"), 1.0);
    Some((total_cost, if quantity == 0.0 { 1.0 } else { quantity }))
}

pub fn calculate_rate_analysis(recipe: &RateAnalysisRecipe) -> RateAnalysisSummary {
    let mut base = calculate_base_rate_analysis(recipe);
    let addon = optional_addition(recipe);
    let variant = recipe.data_variant.as_ref();
    let post_rate = field(variant, "postRate").and_then(Value::as_bool) == Some(true);
    let configured = number(field(variant, "postRateMultiplier"), f64::NAN);
    let percent = number(field(variant, "addPercent"), f64::NAN);
    let multiplier = if post_rate {
        Some(if configured.is_finite() && configured > 0.0 {
            configured
        } else if percent.is_finite() {
            1.0 + percent / 100.0
        } else {
            1.0
        })
    } else {
        recipe.post_rate_multiplier
    };
    let steps = field(variant, "postRateSteps").map(|value| number(Some(value), f64::NAN));
    let step_percent = number(field(variant, "postRateStepPercent"), f64::NAN);
    let stepwise = if recipe.recalculation.is_some() {
        if post_rate {
            match steps {
                Some(count)
                    if count.is_finite()
                        && count >= 0.0
                        && count.fract() == 0.0
                        && step_percent.is_finite() =>
                {
                    let mut rate = round_money(base.rate_per_unit);
                    for _ in 0..count as usize {
                        rate = round_money(rate + round_money(rate * step_percent / 100.0));
                    }
                    Some(rate)
                }
                _ => None,
            }
        } else {
            None
        }
    } else if steps.is_some() {
        non_null_field(variant, "rate").map(|value| number(Some(value), 0.0))
    } else {
        None
    };
    if addon.is_none() && multiplier.is_none() && stepwise.is_none() {
        return base;
    }
    let mut total_cost = base.total_cost;
    if let Some((addon_total, addon_quantity)) = addon {
        total_cost =
            round_money(total_cost + addon_total * output_quantity(recipe) / addon_quantity);
    }
    if let Some(rate) = stepwise {
        total_cost = round_money(rate * output_quantity(recipe));
    } else if let Some(multiplier) = multiplier {
        total_cost = round_money(total_cost * multiplier);
    }
    base.total_cost = total_cost;
    base.rate_per_unit = round_money(total_cost / output_quantity(recipe));
    base
}

pub fn batch_recalculate_recipes(recipes: &[RateAnalysisRecipe]) -> Vec<RateAnalysisSummary> {
    recipes.iter().map(calculate_rate_analysis).collect()
}
