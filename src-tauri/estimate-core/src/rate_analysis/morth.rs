//! MoRTH source-book arithmetic. Missing inputs invalidate the result, never price at zero.
use super::{calculator::round_money, models::*};
use serde_json::{json, Map, Value};
fn num(v: &Value) -> Option<f64> {
    v.as_f64()
        .or_else(|| v.as_str()?.replace(',', "").parse().ok())
        .filter(|x| x.is_finite())
}
fn text(v: &Value) -> &str {
    v.as_str().unwrap_or("")
}
fn list(v: &Value) -> &[Value] {
    v.as_array().map(Vec::as_slice).unwrap_or(&[])
}
fn need(missing: &mut Vec<String>, name: &str) {
    if !missing.iter().any(|s| s == name) {
        missing.push(name.to_string());
    }
}
fn quantity(raw: &Value, params: &Value, missing: &mut Vec<String>, label: &str) -> f64 {
    let expr = &raw["quantity_expression"];
    let quantity = if expr.is_object() {
        let name = text(&expr["parameter"]);
        let input = num(&params[name]);
        if input.is_none() {
            need(missing, &format!("{}: {}", label, name));
            return 0.0;
        }
        if expr["positive"] == true && input.unwrap() <= 0.0 {
            need(missing, &format!("{}: {} must be positive", label, name));
            return 0.0;
        }
        match text(&expr["type"]) {
            "affine" => {
                num(&expr["constant"]).unwrap_or(0.0)
                    + num(&expr["coefficient"]).unwrap_or(0.0) * input.unwrap()
            }
            "parameter" => input.unwrap(),
            _ => {
                need(
                    missing,
                    &format!("{}: unsupported quantity expression", label),
                );
                0.0
            }
        }
    } else {
        match num(&raw["quantity"]) {
            Some(q) => q,
            None => {
                need(missing, &format!("{}: quantity required", label));
                0.0
            }
        }
    };
    quantity * num(&raw["sign"]).unwrap_or(1.0)
}
fn base(
    name: &str,
    totals: &[f64; 3],
    direct: f64,
    eligible: f64,
    allowance: f64,
    missing: &mut Vec<String>,
) -> f64 {
    match name {
        ""|"direct_cost"|"labour_plus_machinery_plus_material_cost"=>direct,
        "direct_cost_including_allowances"|"labour_plus_machinery_plus_materials_plus_percentage_allowances"=>direct+allowance,
        "labour_plus_machinery_cost"=>totals[1]+totals[2],
        "labour_cost"=>totals[2],
        "machinery_cost"=>totals[1],
        "materials_cost"|"material_cost"=>totals[0],
        "filter_material_cost_only"|"pile_shoes_plus_machinery_plus_labour_cost"=>eligible,
        "adopted_civil_work_plus_filter_material_cost"|"foundation_excavation_cost"=>direct,
        "adopted_concrete_cost"=>direct-eligible,
        "labour_plus_machinery_plus_materials_plus_percentage_allowances_excluding_marked_dependencies"=>eligible+allowance,
        _=>{need(missing,&format!("Review calculation basis: {}",name));0.0}
    }
}
fn policy_percent(
    calc: &Value,
    source: &Value,
    params: &Value,
    kind: &str,
    missing: &mut Vec<String>,
) -> f64 {
    if let Some(p) = num(&calc[format!("{}_percent", kind)]) {
        return p;
    }
    let parameter = text(
        &calc[if kind == "contractor_profit" {
            "profit_percent_parameter".to_string()
        } else {
            format!("{}_percent_parameter", kind)
        }],
    );
    if !parameter.is_empty() {
        if let Some(p) = num(&params[parameter]) {
            return p;
        }
        let published_category = text(&source["project_category"]);
        let category = if ["large", "medium", "small"].contains(&published_category) {
            published_category
        } else {
            text(&source["_project_category"])
        };
        if let Some(p) = num(&source["_policies"][parameter][category]) {
            return p;
        }
        need(missing, parameter);
        return 0.0;
    }
    if kind == "overhead" {
        let selector = text(&calc["overhead_selection_parameter"]);
        if !selector.is_empty() {
            let choice = text(&params[selector]);
            if let Some(p) = num(&calc["overhead_percent_by_project_type"][choice]) {
                return p;
            }
            need(missing, selector);
            return 0.0;
        }
        if let Some(p) = num(&calc["overhead_default"]) {
            return p;
        }
    }
    // No implicit SSR 14% and no implicit MoRTH 10%.
    need(missing, &format!("{} percent requires source review", kind));
    0.0
}
pub fn calculate(recipe: &RateAnalysisRecipe) -> RateAnalysisSummary {
    let null = Value::Null;
    let config = recipe.morth.as_ref().unwrap_or(&null);
    let source = &config["source"];
    let params = &config["parameters"];
    let calc = &source["calculation"];
    let mut missing: Vec<String> = list(&config["pending"])
        .iter()
        .filter_map(|x| x.as_str().map(String::from))
        .collect();
    // This is the starting-cost analysis. Source specification/approval notes
    // remain visible for review; only inputs that enter the arithmetic block
    // calculation. Quantity expressions and percentage choices validate below.
    let mut totals = [0.0; 3];
    let mut eligible = 0.0;
    let mut computed = Map::new();
    for (i, section) in ["materials", "machinery", "labour"].iter().enumerate() {
        for (j, raw) in list(&source[*section]).iter().enumerate() {
            let id = format!("{}-{}", section, j);
            let input = &config["inputs"][&id];
            let label = text(&raw["desc"]);
            let quantity = quantity(raw, params, &mut missing, label);
            let mut rate = num(&input["rate"]);
            if input["dependency"].is_object() {
                match serde_json::from_value::<RateAnalysisRecipe>(input["dependency"].clone()) {
                    Ok(dep) => {
                        let result = calculate(&dep);
                        if result.cost_ready == Some(false) {
                            for m in result.missing {
                                need(&mut missing, &format!("{}: {}", label, m));
                            }
                        }
                        // Show the known appendix subtotal even while one of its
                        // rates/quantities is missing; missing propagates to the
                        // parent so the partial value cannot become a ready total.
                        if dep.output_quantity > 0.0 {
                            rate = Some(
                                if raw["price_lookup"]["require_direct_cost_only"] == true {
                                    result.base_cost / dep.output_quantity
                                } else {
                                    result.rate_per_unit
                                } * num(&raw["price_lookup"]["rate_multiplier"]).unwrap_or(1.0),
                            );
                        } else {
                            need(
                                &mut missing,
                                &format!("{}: invalid dependency output quantity", label),
                            );
                        }
                    }
                    Err(_) => need(&mut missing, &format!("{}: invalid dependency", label)),
                }
            }
            if rate.is_none() && quantity != 0.0 {
                need(
                    &mut missing,
                    &format!("{}: choose SOR or enter a manual rate", label),
                );
            }
            let rate = rate.unwrap_or(0.0);
            let amount = round_money(quantity * rate);
            totals[i] += amount;
            let excluded = raw["price_lookup"]["parent_markup_excluded"] == true
                || list(&calc["markup_excluded_resource_keys"])
                    .iter()
                    .any(|x| x == &raw["resource_key"]);
            if !excluded {
                eligible += amount;
            }
            computed.insert(id, json!({"quantity":quantity,"rate":rate,"amount":amount}));
        }
        totals[i] = round_money(totals[i]);
    }
    let direct = round_money(totals.iter().sum());
    let mut allowance = 0.0;
    let mut abstract_rows = vec![
        json!({"id":"materials","label":"A. Cost of materials","amount":totals[0],"formulaKind":"materials"}),
        json!({"id":"machinery","label":"B. Hire charges of machinery","amount":totals[1],"formulaKind":"machinery"}),
        json!({"id":"labour","label":"C. Cost of labour","amount":totals[2],"formulaKind":"labour"}),
        json!({"id":"direct","label":"Direct cost (A + B + C)","amount":direct,"formulaKind":"direct"}),
    ];
    for (index, a) in list(&calc["percentage_allowances"]).iter().enumerate() {
        let condition = text(&a["condition_parameter"]);
        if !condition.is_empty() {
            match params.get(condition).and_then(Value::as_bool) {
                Some(false) => continue,
                Some(true) => {}
                None => {
                    need(&mut missing, condition);
                    continue;
                }
            }
        }
        let basis = base(
            text(&a["base"]),
            &totals,
            direct,
            eligible,
            0.0,
            &mut missing,
        );
        if let Some(maximum) = num(&a["percent"]) {
            let percent = if a["percent_is_maximum"] == true {
                let parameter = format!("{}_percent", condition);
                match num(&params[&parameter]).filter(|p| *p >= 0.0 && *p <= maximum) {
                    Some(p) => p,
                    None => {
                        need(&mut missing, &format!("{} (0–{}%)", parameter, maximum));
                        continue;
                    }
                }
            } else {
                maximum
            };
            let amount = round_money(basis * percent / 100.0);
            allowance += amount;
            abstract_rows.push(json!({"id":format!("allowance-{}", index),"label":a["label"].as_str().or(a["description"].as_str()).or(a["source_note"].as_str().map(|s|s.split(';').next().unwrap_or(s))).unwrap_or("Percentage allowance"),"amount":amount,"percent":percent,"basisAmount":basis,"base":a["base"],"formulaKind":"allowance"}));
        } else {
            need(&mut missing, "Percentage allowance requires source review");
        }
    }
    // Do not silently include alternative components or conditional additions.
    if source
        .get("conditional_adjustments")
        .is_some_and(|v| !v.is_null() && v != &json!([]))
    {
        need(
            &mut missing,
            "Conditional adjustments require source review",
        );
    }
    let overhead_percent = policy_percent(calc, source, params, "overhead", &mut missing);
    let profit_percent = policy_percent(calc, source, params, "contractor_profit", &mut missing);
    let overhead_base = base(
        text(&calc["overhead_base"]),
        &totals,
        direct,
        eligible,
        allowance,
        &mut missing,
    );
    let overhead = round_money(overhead_base * overhead_percent / 100.0);
    let profit_base = if profit_percent == 0.0 {
        0.0
    } else {
        match text(&calc["profit_base"]) {
            "direct_cost_plus_overheads" => direct + overhead,
            "direct_cost_including_allowances_plus_overheads" => direct + allowance + overhead,
            "eligible_direct_cost_plus_overheads" => eligible + allowance + overhead,
            "labour_plus_machinery_plus_overheads" => totals[1] + totals[2] + overhead,
            "filter_material_cost_only" => eligible,
            "pile_shoes_plus_machinery_plus_labour_plus_overhead_cost" => eligible + overhead,
            other => {
                need(&mut missing, &format!("Review profit basis: {}", other));
                0.0
            }
        }
    };
    let profit = round_money(profit_base * profit_percent / 100.0);
    let total = round_money(direct + allowance + overhead + profit);
    abstract_rows.push(json!({"id":"overhead","label":"Overheads","amount":overhead,"percent":overhead_percent,"basisAmount":overhead_base,"base":calc["overhead_base"],"formulaKind":"overhead"}));
    abstract_rows.push(json!({"id":"profit","label":"Contractor profit","amount":profit,"percent":profit_percent,"basisAmount":profit_base,"base":calc["profit_base"],"formulaKind":"profit"}));
    let divisor = num(&source["rate_divisor"])
        .filter(|n| *n > 0.0)
        .unwrap_or_else(|| {
            need(&mut missing, "Rate divisor requires source review");
            1.0
        });
    abstract_rows.push(json!({"id":"total","label":format!("Total cost for {} {}", divisor, recipe.unit.as_deref().unwrap_or("unit")),"amount":total,"formulaKind":"total"}));
    abstract_rows.push(json!({"id":"rate","label":format!("Rate per {}", recipe.unit.as_deref().unwrap_or("unit")),"amount":round_money(total / divisor),"formulaKind":"rate"}));
    RateAnalysisSummary {
        cost_ready: Some(missing.is_empty()),
        missing,
        profit_amount: profit,
        allowance_amount: allowance,
        computed_lines: Some(Value::Object(computed)),
        morth_abstract: Some(Value::Array(abstract_rows)),
        section_totals: RateAnalysisSectionTotals {
            materials: totals[0],
            machinery: totals[1],
            labour: totals[2],
        },
        labour_base_cost: totals[2],
        area_allowance_percent: 0.0,
        area_allowance_amount: 0.0,
        labour_cost_with_area_allowance: totals[2],
        base_cost: direct,
        overhead_amount: overhead,
        total_cost: total,
        rate_per_unit: round_money(total / divisor),
        labour_unit_base: totals[2] / divisor,
        labour_unit_profit: 0.0,
        labour_unit_total: totals[2] / divisor,
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn recipe() -> RateAnalysisRecipe {
        serde_json::from_value(json!({"itemKey":"MORTH:x","itemCode":"x","itemSource":"MORTH","description":"Foundation","outputQuantity":10,"sections":[],"morth":{"source":{"labour":[{"desc":"Mate","quantity":0.14},{"desc":"Mazdoor","quantity":3.5}],"rate_divisor":10,"calculation":{"overhead_selection_parameter":"bridge_project_type","overhead_percent_by_project_type":{"new_or_widening":20,"rehabilitation":30},"contractor_profit_percent":10,"overhead_base":"labour_plus_machinery_plus_materials_plus_percentage_allowances_excluding_marked_dependencies","profit_base":"eligible_direct_cost_plus_overheads"}},"parameters":{"bridge_project_type":"new_or_widening"},"inputs":{"labour-0":{"rate":685},"labour-1":{"rate":635}}}})).unwrap()
    }
    #[test]
    fn bridge_overhead_and_profit_are_separate() {
        let r = calculate(&recipe());
        assert_eq!(r.cost_ready, Some(true));
        assert_eq!(r.base_cost, 2318.4);
        assert_eq!(r.overhead_amount, 463.68);
        assert_eq!(r.profit_amount, 278.21);
        assert_eq!(r.rate_per_unit, 306.03);
    }
    #[test]
    fn missing_rate_never_becomes_a_ready_zero() {
        let mut r = recipe();
        r.morth.as_mut().unwrap()["inputs"]["labour-0"]["rate"] = Value::Null;
        let s = calculate(&r);
        assert_eq!(s.cost_ready, Some(false));
        assert!(!s.missing.is_empty());
    }
    #[test]
    fn shared_road_analysis_uses_selected_project_size() {
        let mut r = recipe();
        let cfg = r.morth.as_mut().unwrap();
        cfg["source"]["project_category"] = Value::Null;
        cfg["source"]["_project_category"] = json!("medium");
        cfg["source"]["_policies"] = json!({"road_works_overheads_by_project_category":{"medium":10},"road_works_contractor_profit":{"medium":10}});
        cfg["source"]["calculation"] = json!({"overhead_base":"direct_cost","profit_base":"direct_cost_plus_overheads","profit_percent_parameter":"road_works_contractor_profit","overhead_percent_parameter":"road_works_overheads_by_project_category"});
        let result = calculate(&r);
        assert_eq!(result.cost_ready, Some(true));
        assert_eq!(result.overhead_amount, 231.84);
        assert_eq!(result.profit_amount, 255.02);
    }
    #[test]
    fn unsupported_basis_is_explicit() {
        let mut r = recipe();
        r.morth.as_mut().unwrap()["source"]["calculation"]["profit_base"] = json!("unknown");
        assert_eq!(calculate(&r).cost_ready, Some(false));
    }
    #[test]
    fn adopted_prices_do_not_require_quote_paperwork() {
        let mut r = recipe();
        r.morth.as_mut().unwrap()["source"]["required_project_parameters"] = json!([
            "approved_manufacturer_assembly_quote",
            "selected_year_zone_effective_date"
        ]);
        assert_eq!(calculate(&r).cost_ready, Some(true));
    }
    #[test]
    fn explicit_positive_quantity_parameter_cannot_be_zero() {
        let mut r = recipe();
        r.morth.as_mut().unwrap()["source"]["labour"][0]["quantity_expression"] =
            json!({"type":"parameter","parameter":"hours","positive":true});
        r.morth.as_mut().unwrap()["parameters"]["hours"] = json!(0);
        assert_eq!(calculate(&r).cost_ready, Some(false));
    }
    #[test]
    fn maximum_allowance_requires_actual_site_percent() {
        let mut r = recipe();
        r.morth.as_mut().unwrap()["source"]["calculation"]["percentage_allowances"] = json!([{"base":"labour_cost","percent":10,"percent_is_maximum":true,"condition_parameter":"pump_required"}]);
        r.morth.as_mut().unwrap()["parameters"]["pump_required"] = json!(true);
        assert_eq!(calculate(&r).cost_ready, Some(false));
        r.morth.as_mut().unwrap()["parameters"]["pump_required_percent"] = json!(5);
        let result = calculate(&r);
        assert_eq!(result.cost_ready, Some(true));
        assert_eq!(result.allowance_amount, 115.92);
    }
    #[test]
    fn source_specification_notes_do_not_hide_starting_cost() {
        let mut r = recipe();
        r.morth.as_mut().unwrap()["source"]["required_project_parameters"] = json!([
            "approved_concrete_job_mix_formula",
            "loader_specification",
            "cement_type"
        ]);
        r.morth.as_mut().unwrap()["source"]["labour"][0]["price_lookup"]
            ["required_project_approvals"] = json!(["material_scope_approved"]);
        assert_eq!(calculate(&r).cost_ready, Some(true));
    }
    #[test]
    fn appendix_direct_cost_flows_to_parent_without_child_markup() {
        let child = recipe();
        let mut parent = recipe();
        let cfg = parent.morth.as_mut().unwrap();
        cfg["source"]["labour"] = json!([]);
        cfg["source"]["materials"] = json!([{"desc":"Appendix concrete","quantity":2,"price_lookup":{"require_direct_cost_only":true}}]);
        cfg["inputs"] = json!({"materials-0":{"dependency":child}});
        let result = calculate(&parent);
        assert_eq!(result.cost_ready, Some(true));
        assert_eq!(result.base_cost, 463.68);
        assert_eq!(
            result.computed_lines.as_ref().unwrap()["materials-0"]["rate"],
            json!(231.84)
        );
    }
    #[test]
    fn incomplete_appendix_keeps_known_rate_and_propagates_missing() {
        let mut child = recipe();
        child.morth.as_mut().unwrap()["inputs"]["labour-0"]["rate"] = Value::Null;
        let mut parent = recipe();
        let cfg = parent.morth.as_mut().unwrap();
        cfg["source"]["labour"] = json!([]);
        cfg["source"]["materials"] = json!([{"desc":"Appendix concrete","quantity":2,"price_lookup":{"require_direct_cost_only":true}}]);
        cfg["inputs"] = json!({"materials-0":{"dependency":child}});
        let result = calculate(&parent);
        assert_eq!(result.cost_ready, Some(false));
        assert!(result.base_cost > 0.0);
        assert!(result
            .missing
            .iter()
            .any(|m| m.contains("Appendix concrete: Mate")));
    }
    #[test]
    fn explicit_zero_quantity_does_not_require_unused_price() {
        let mut r = recipe();
        let cfg = r.morth.as_mut().unwrap();
        cfg["source"]["labour"][0]["quantity"] = json!(0);
        cfg["inputs"]["labour-0"]["rate"] = Value::Null;
        assert_eq!(calculate(&r).cost_ready, Some(true));
    }
}
