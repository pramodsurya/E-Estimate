//! Shared, renderer-independent bank statement. Geometry is supplied by the
//! application's section designer; all measurements and reporting policy live here.
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

const EPS: f64 = 1e-8;
pub type Polygon = Vec<Point>;

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Point {
    pub offset: f64,
    pub rl: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BankExportBank {
    #[serde(default)]
    pub profile_id: String,
    pub side: String,
    pub reach_id: String,
    pub profile_name: String,
    #[serde(default)]
    pub design_reference: String,
    pub status: String,
    pub construction: String,
    pub profile: Polygon,
    pub slopes: Value,
    pub berms: Value,
    pub treatment: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BankExportSample {
    #[serde(default)]
    pub validation_errors: Vec<String>,
    pub chainage: f64,
    pub bed_level: f64,
    pub stripping_depth: f64,
    pub ground: Polygon,
    pub design: Polygon,
    pub cores: Vec<Polygon>,
    pub trenches: Vec<Polygon>,
    #[serde(default)]
    pub cns: Vec<Polygon>,
    pub banks: Vec<BankExportBank>,
    #[serde(default)]
    pub foundation_fills: Vec<BankFoundationFill>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BankFoundationFill {
    pub side: String,
    pub kind: String,
    pub points: Polygon,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BankExportInterval {
    pub from: f64,
    pub to: f64,
    pub start: BankExportSample,
    pub end: BankExportSample,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BankExportInput {
    pub version: u32,
    pub mode: String,
    pub work_mode: String,
    pub length_m: f64,
    pub bed_width: f64,
    pub full_supply_depth: f64,
    #[serde(default)]
    pub material_allocations: Vec<super::models::BankMaterialAllocationInput>,
    pub intervals: Vec<BankExportInterval>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BankWork {
    pub key: String,
    pub label: String,
    pub code: String,
    pub block: String,
    pub section_unit: String,
    pub unit: String,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BankMeasurement {
    pub foundation_width: f64,
    pub automatic_filter_length: f64,
    pub blanket_ranges: Vec<(f64, f64)>,
    pub values: BTreeMap<String, f64>,
    pub gross_fill: f64,
    pub deducted_fill: f64,
    pub shapes: Vec<BankShape>,
    pub fill_polygons: Vec<Polygon>,
    pub stripping_polygons: Vec<Polygon>,
    pub slope_segments: Vec<Polygon>,
    pub berm_segments: Vec<Polygon>,
    pub outer_slope_length: f64,
    pub berm_shelf_width: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BankShape {
    pub key: String,
    pub label: String,
    pub points: Polygon,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BankSectionInput {
    pub work_mode: String,
    pub bed_width: f64,
    pub full_supply_depth: f64,
    pub sample: BankExportSample,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BankSectionResult {
    pub design: Polygon,
    pub ground: Polygon,
    pub banks: Vec<BankMeasurement>,
    pub works: Vec<BankWork>,
    pub cutting: f64,
    pub gross_fill: f64,
    pub net_fill: f64,
    pub cut_polygons: Vec<Polygon>,
    pub cut_polygon_areas: Vec<f64>,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BankIntervalQuantities {
    pub from: f64,
    pub to: f64,
    pub side: String,
    pub reach_id: String,
    pub profile_id: String,
    pub quantities: BTreeMap<String, f64>,
    pub gross_fill: f64,
    pub cutting: f64,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BankQuantityResult {
    pub rows: Vec<BankIntervalQuantities>,
    pub works: Vec<BankWork>,
    pub errors: Vec<String>,
}

fn quantities_between(
    a: &BankMeasurement,
    b: &BankMeasurement,
    length: f64,
) -> BTreeMap<String, f64> {
    a.values
        .keys()
        .chain(b.values.keys())
        .map(|key| {
            (
                key.clone(),
                (a.values.get(key).copied().unwrap_or(0.0)
                    + b.values.get(key).copied().unwrap_or(0.0))
                    / 2.0
                    * length,
            )
        })
        .collect()
}
pub fn measure_bank_quantities(input: &BankExportInput) -> Result<BankQuantityResult, String> {
    let mut rows = vec![];
    let mut works = BTreeMap::new();
    let mut errors = vec![];
    for interval in &input.intervals {
        let section = |sample: &BankExportSample| BankSectionInput {
            work_mode: input.work_mode.clone(),
            bed_width: input.bed_width,
            full_supply_depth: input.full_supply_depth,
            sample: sample.clone(),
        };
        let start = measure_bank_section(&section(&interval.start))?;
        let end = measure_bank_section(&section(&interval.end))?;
        errors.extend(start.errors);
        errors.extend(end.errors);
        for work in start.works.into_iter().chain(end.works) {
            works.insert(work.key.clone(), work);
        }
        for (i, bank) in interval.start.banks.iter().enumerate() {
            let length = interval.to - interval.from;
            rows.push(BankIntervalQuantities {
                from: interval.from,
                to: interval.to,
                side: bank.side.clone(),
                reach_id: bank.reach_id.clone(),
                profile_id: bank.profile_id.clone(),
                quantities: quantities_between(&start.banks[i], &end.banks[i], length),
                gross_fill: (start.banks[i].gross_fill + end.banks[i].gross_fill) / 2.0 * length,
                cutting: (start
                    .cut_polygons
                    .iter()
                    .map(|p| polygon_area(&clipped(p, &bank.side)))
                    .sum::<f64>()
                    + end
                        .cut_polygons
                        .iter()
                        .map(|p| polygon_area(&clipped(p, &bank.side)))
                        .sum::<f64>())
                    / 2.0
                    * length,
            });
        }
    }
    errors.sort();
    errors.dedup();
    Ok(BankQuantityResult {
        rows,
        works: works.into_values().collect(),
        errors,
    })
}

/// Geometry and measured quantities are one result. The renderer uses this
/// exact Rust function through WebAssembly; native Excel uses it directly.
pub fn measure_bank_section(input: &BankSectionInput) -> Result<BankSectionResult, String> {
    let sample = &input.sample;
    if sample.ground.len() < 2 || sample.design.len() < 2 {
        return Err("Enter a populated section with surveyed ground.".into());
    }
    let export = BankExportInput {
        version: 1,
        mode: String::new(),
        work_mode: input.work_mode.clone(),
        length_m: 0.0,
        bed_width: input.bed_width,
        full_supply_depth: input.full_supply_depth,
        material_allocations: vec![],
        intervals: vec![],
    };
    let mut registry = BTreeMap::new();
    let mut banks = vec![];
    let mut errors = sample.validation_errors.clone();
    for bank in &sample.banks {
        let measurement = match measure(&export, sample, bank, &mut registry) {
            Ok(m) => m,
            Err(error) => {
                errors.push(error);
                let mut excluded = bank.clone();
                excluded.status = "cut".into();
                measure(&export, sample, &excluded, &mut registry)?
            }
        };
        banks.push(measurement);
    }
    let (_, _, _, cut_polygons) = fill_geometry(sample, input.bed_width / 2.0);
    let gross_fill = banks.iter().map(|m| m.gross_fill).sum();
    if !errors.is_empty() {
        for bank in &mut banks {
            for key in ["filling", "hearting", "casing"] {
                if let Some(value) = bank.values.get_mut(key) {
                    *value = 0.0;
                }
            }
        }
    }
    let net_fill = banks
        .iter()
        .map(|m| {
            ["filling", "hearting", "casing"]
                .iter()
                .map(|key| m.values.get(*key).copied().unwrap_or(0.0))
                .sum::<f64>()
        })
        .sum();
    Ok(BankSectionResult {
        design: sample.design.clone(),
        ground: sample.ground.clone(),
        banks,
        works: registry.into_values().collect(),
        cutting: cut_polygons.iter().map(|p| polygon_area(p)).sum(),
        gross_fill,
        net_fill,
        cut_polygon_areas: cut_polygons.iter().map(|p| polygon_area(p)).collect(),
        cut_polygons,
        errors,
    })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BankStatementRow {
    pub from: f64,
    pub to: f64,
    pub side: String,
    pub reach_id: String,
    pub profile_name: String,
    pub design_variant: usize,
    pub status: String,
    pub group_index: Option<usize>,
    pub start: BankMeasurement,
    pub end: BankMeasurement,
    pub quantities: BTreeMap<String, f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BankStatementGroup {
    pub sheet_name: String,
    pub name: String,
    pub construction: String,
    pub slope_protection: bool,
    pub definition: Vec<String>,
    pub works: Vec<BankWork>,
    pub totals: BTreeMap<String, f64>,
    pub reach_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BankStatement {
    pub groups: Vec<BankStatementGroup>,
    pub rows: Vec<BankStatementRow>,
    pub works: Vec<BankWork>,
    pub totals: BTreeMap<String, f64>,
    pub materials: Vec<BankStatementMaterial>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BankStatementMaterial {
    pub zone: String,
    pub source: String,
    pub percentage: f64,
    pub compaction: u32,
    pub watering: bool,
    pub code: String,
    pub quantity: f64,
}

fn n(v: &Value, key: &str) -> f64 {
    v[key].as_f64().unwrap_or(0.0).max(0.0)
}
fn s<'a>(v: &'a Value, key: &str) -> &'a str {
    v[key].as_str().unwrap_or("")
}
fn b(v: &Value, key: &str) -> bool {
    v[key].as_bool().unwrap_or(false)
}
fn selected(v: &Value, key: &str, side: &str) -> bool {
    s(v, key) == "both" || s(v, key) == side
}
fn p(x: f64, y: f64) -> Point {
    Point { offset: x, rl: y }
}
pub fn polygon_area(poly: &[Point]) -> f64 {
    // Translate the RL origin to avoid loss of accuracy at large survey RLs.
    let origin = poly.first().map_or(0.0, |p| p.rl);
    poly.iter()
        .zip(poly.iter().cycle().skip(1))
        .take(poly.len())
        .map(|(a, c)| a.offset * (c.rl - origin) - c.offset * (a.rl - origin))
        .sum::<f64>()
        .abs()
        / 2.0
}
fn line_at(line: &[Point], x: f64) -> f64 {
    if x <= line[0].offset {
        return line[0].rl;
    }
    for w in line.windows(2) {
        if x <= w[1].offset && w[1].offset - w[0].offset > EPS {
            return w[0].rl + (w[1].rl - w[0].rl) * (x - w[0].offset) / (w[1].offset - w[0].offset);
        }
    }
    line.last().unwrap().rl
}
fn ordered(mut points: Polygon) -> Polygon {
    points.sort_by(|a, b| a.offset.total_cmp(&b.offset));
    points.dedup_by(|a, b| (a.offset - b.offset).abs() < EPS);
    points
}
fn clipped(poly: &[Point], side: &str) -> Polygon {
    let sign = if side == "left" { -1.0 } else { 1.0 };
    let mut out = vec![];
    if poly.is_empty() {
        return out;
    }
    for (a, c) in poly
        .iter()
        .zip(poly.iter().cycle().skip(1))
        .take(poly.len())
    {
        let ai = sign * a.offset >= -EPS;
        let ci = sign * c.offset >= -EPS;
        if ai {
            out.push(*a);
        }
        if ai != ci {
            out.push(p(
                0.0,
                a.rl + (c.rl - a.rl) * (-a.offset) / (c.offset - a.offset),
            ));
        }
    }
    out
}
fn poly_ranges(poly: &[Point], x: f64) -> Vec<(f64, f64)> {
    let mut ys = vec![];
    for (a, c) in poly
        .iter()
        .zip(poly.iter().cycle().skip(1))
        .take(poly.len())
    {
        if x > a.offset.min(c.offset) && x < a.offset.max(c.offset) {
            ys.push(a.rl + (c.rl - a.rl) * (x - a.offset) / (c.offset - a.offset));
        }
    }
    ys.sort_by(f64::total_cmp);
    ys.chunks_exact(2).map(|v| (v[0], v[1])).collect()
}
fn inside(polys: &[Polygon], x: f64, y: f64) -> bool {
    polys.iter().any(|poly| {
        poly_ranges(poly, x)
            .iter()
            .any(|(a, c)| y >= *a - EPS && y <= *c + EPS)
    })
}
/// Exact union/intersection integration, split at every edge vertex and crossing.
/// No raster approximation or double counting of overlapping material polygons.
fn cells(polys: &[Polygon], mut apply: impl FnMut(f64, f64, f64)) {
    let edges: Vec<_> = polys
        .iter()
        .flat_map(|poly| {
            poly.iter()
                .zip(poly.iter().cycle().skip(1))
                .take(poly.len())
        })
        .collect();
    let mut xs: Vec<_> = polys.iter().flatten().map(|p| p.offset).collect();
    for (i, (a, c)) in edges.iter().enumerate() {
        for (d, e) in edges.iter().skip(i + 1) {
            let ux = c.offset - a.offset;
            let uy = c.rl - a.rl;
            let vx = e.offset - d.offset;
            let vy = e.rl - d.rl;
            let det = ux * vy - uy * vx;
            if det.abs() < EPS {
                continue;
            }
            let t = ((d.offset - a.offset) * vy - (d.rl - a.rl) * vx) / det;
            let u = ((d.offset - a.offset) * uy - (d.rl - a.rl) * ux) / det;
            if t > 0.0 && t < 1.0 && u > 0.0 && u < 1.0 {
                xs.push(a.offset + t * ux);
            }
        }
    }
    xs.sort_by(f64::total_cmp);
    xs.dedup_by(|a, c| (*a - *c).abs() < EPS);
    for w in xs.windows(2) {
        let width = w[1] - w[0];
        if width < EPS {
            continue;
        }
        let x = (w[0] + w[1]) / 2.0;
        let mut ys: Vec<_> = polys
            .iter()
            .flat_map(|poly| poly_ranges(poly, x).into_iter().flat_map(|(a, c)| [a, c]))
            .collect();
        ys.sort_by(f64::total_cmp);
        ys.dedup_by(|a, c| (*a - *c).abs() < EPS);
        for z in ys.windows(2) {
            if z[1] - z[0] > EPS {
                apply(x, (z[0] + z[1]) / 2.0, width * (z[1] - z[0]));
            }
        }
    }
}

fn fill_geometry(
    sample: &BankExportSample,
    half_bed: f64,
) -> (Vec<Polygon>, Vec<(f64, f64)>, bool, Vec<Polygon>) {
    let design = ordered(sample.design.clone());
    let ground = ordered(sample.ground.clone());
    let mut xs: Vec<_> = design
        .iter()
        .chain(&ground)
        .map(|p| p.offset)
        .filter(|x| *x >= design[0].offset && *x <= design.last().unwrap().offset)
        .collect();
    xs.extend(
        [-half_bed, 0.0, half_bed]
            .into_iter()
            .filter(|x| *x >= design[0].offset && *x <= design.last().unwrap().offset),
    );
    xs.sort_by(f64::total_cmp);
    xs.dedup_by(|a, c| (*a - *c).abs() < EPS);
    let mut fill = vec![];
    let mut footprints: Vec<(f64, f64)> = vec![];
    let mut cutting = false;
    let mut cut_polygons = vec![];
    for w in xs.windows(2) {
        let mut cuts = vec![w[0], w[1]];
        let da = line_at(&design, w[0]) - line_at(&ground, w[0]);
        let dc = line_at(&design, w[1]) - line_at(&ground, w[1]);
        if da * dc < 0.0 {
            cuts.insert(1, w[0] + (w[1] - w[0]) * da / (da - dc));
        }
        for z in cuts.windows(2) {
            let a = z[0];
            let c = z[1];
            let mid = (a + c) / 2.0;
            let delta = line_at(&design, mid) - line_at(&ground, mid);
            if delta < -EPS {
                cutting = true;
                cut_polygons.push(vec![
                    p(a, line_at(&design, a)),
                    p(c, line_at(&design, c)),
                    p(c, line_at(&ground, c)),
                    p(a, line_at(&ground, a)),
                ]);
            }
            if delta <= EPS {
                continue;
            }
            fill.push(vec![
                p(a, line_at(&ground, a)),
                p(c, line_at(&ground, c)),
                p(c, line_at(&design, c)),
                p(a, line_at(&design, a)),
            ]);
            if mid.abs() >= half_bed - EPS {
                if let Some(last) = footprints.last_mut() {
                    if (last.1 - a).abs() < EPS && (last.0 < 0.0) == (mid < 0.0) {
                        last.1 = c;
                        continue;
                    }
                }
                footprints.push((a, c));
            }
        }
    }
    (fill, footprints, cutting, cut_polygons)
}
fn raised_band(ground: &[Point], from: f64, to: f64, below: f64, thickness: f64) -> Polygon {
    if to - from <= EPS || thickness <= EPS {
        return vec![];
    }
    let mut line = vec![p(from, line_at(ground, from) - below)];
    line.extend(
        ground
            .iter()
            .filter(|p| p.offset > from && p.offset < to)
            .map(|p| Point {
                offset: p.offset,
                rl: p.rl - below,
            }),
    );
    line.push(p(to, line_at(ground, to) - below));
    let upper: Vec<_> = line
        .iter()
        .rev()
        .map(|p| Point {
            offset: p.offset,
            rl: p.rl + thickness,
        })
        .collect();
    line.extend(upper);
    line
}
fn protection_code(v: &Value, repair: bool) -> Result<Option<String>, String> {
    if s(v, "kind") == "none" || s(v, "kind").is_empty() {
        return Ok(None);
    }
    if s(v, "kind") == "grass" {
        return Ok(Some(format!(
            "IRR-CAW-8-{}",
            if b(v, "sand") { 15 } else { 16 }
        )));
    }
    if s(v, "kind") != "stone" {
        return Err("Unknown bank protection specification.".into());
    }
    let t = n(v, "thickness");
    let headers = b(v, "headers");
    let dry = s(v, "bedding") == "dry";
    if !repair && (t - 0.225).abs() < EPS {
        return Err("225 mm stone protection is not available for new canal work.".into());
    }
    let item = if s(v, "stone") == "khandki" && headers {
        if (t - 0.3).abs() < EPS {
            Some(if dry { 11 } else { 13 })
        } else if (t - 0.45).abs() < EPS {
            Some(if dry { 12 } else { 14 })
        } else {
            None
        }
    } else if s(v, "stone") == "rubble" && !dry && (t - 0.3).abs() < EPS {
        Some(if headers { 9 } else { 10 })
    } else if s(v, "stone") == "rubble" && dry {
        if (t - 0.225).abs() < EPS {
            Some(if headers { 2 } else { 4 })
        } else if (t - 0.25).abs() < EPS {
            Some(if headers { 1 } else { 3 })
        } else if (t - 0.3).abs() < EPS {
            Some(if headers { 5 } else { 6 })
        } else if (t - 0.45).abs() < EPS {
            Some(if headers { 7 } else { 8 })
        } else {
            None
        }
    } else {
        None
    };
    item.map(|i|Some(format!("IRR-CAW-8-{i}"))).ok_or_else(||"Select a valid bank protection thickness, stone and bedding specification before export.".into())
}
fn define(
    registry: &mut BTreeMap<String, BankWork>,
    key: &str,
    label: &str,
    code: &str,
    block: &str,
    area: bool,
) {
    registry.entry(key.into()).or_insert_with(|| BankWork {
        key: key.into(),
        label: label.into(),
        code: code.into(),
        block: block.into(),
        section_unit: if area { "m²" } else { "m" }.into(),
        unit: if area { "m³" } else { "m²" }.into(),
    });
}
fn add(
    m: &mut BankMeasurement,
    registry: &mut BTreeMap<String, BankWork>,
    key: &str,
    label: &str,
    code: &str,
    block: &str,
    area: bool,
    value: f64,
) {
    define(registry, key, label, code, block, area);
    *m.values.entry(key.into()).or_default() += value.max(0.0);
}
fn measure(
    input: &BankExportInput,
    sample: &BankExportSample,
    bank: &BankExportBank,
    registry: &mut BTreeMap<String, BankWork>,
) -> Result<BankMeasurement, String> {
    let mut m = BankMeasurement::default();
    let ground = ordered(sample.ground.clone());
    let half = input.bed_width / 2.0;
    let (natural, footprints, cutting, _) = fill_geometry(sample, half);
    let side = &bank.side;
    let t = &bank.treatment;
    let ranges: Vec<_> = footprints
        .iter()
        .copied()
        .filter(|(a, c)| {
            if side == "left" {
                *c <= EPS
            } else {
                *a >= -EPS
            }
        })
        .collect();
    m.foundation_width = ranges.iter().map(|(a, b)| b - a).sum();
    let mut envelope: Vec<_> = natural
        .iter()
        .map(|poly| clipped(poly, side))
        .filter(|p| polygon_area(p) > EPS)
        .collect();
    let strip: Vec<_> = ranges
        .iter()
        .map(|(a, c)| {
            raised_band(
                &ground,
                *a,
                *c,
                sample.stripping_depth,
                sample.stripping_depth,
            )
        })
        .filter(|p| !p.is_empty())
        .collect();
    envelope.extend(strip.clone());
    m.fill_polygons = envelope[..envelope.len() - strip.len()].to_vec();
    m.stripping_polygons = strip.clone();
    let gross: f64 = envelope.iter().map(|p| polygon_area(p)).sum();
    m.gross_fill = gross;
    if bank.status != "fill" {
        if gross > EPS && bank.status != "cut" && bank.status != "level" {
            return Err(format!(
                "{} bank Ch {} m has filling without an assigned Bank Design reach ({}).",
                side, sample.chainage, bank.status
            ));
        }
        return Ok(m);
    }
    if gross <= EPS {
        return Ok(m);
    }
    m.shapes.push(BankShape {
        key: "profile".into(),
        label: "Bank design".into(),
        points: bank.profile.clone(),
    });
    m.shapes.push(BankShape {
        key: "ground".into(),
        label: "Natural ground".into(),
        points: ground.clone(),
    });
    let strip_area: f64 = strip.iter().map(|p| polygon_area(p)).sum();
    add(
        &mut m,
        registry,
        "stripping",
        "Bank foundation stripping",
        "",
        "Earthwork",
        true,
        strip_area,
    );
    let mut material: Vec<Polygon> = vec![];
    for fill in sample
        .foundation_fills
        .iter()
        .filter(|fill| &fill.side == side)
    {
        let key = format!("foundation_{}", fill.kind);
        let code = format!("IRR-CAW-{}", fill.kind);
        add(
            &mut m,
            registry,
            &key,
            "Foundation filling",
            &code,
            "Earthwork",
            true,
            polygon_area(&fill.points),
        );
        material.push(fill.points.clone());
        let mut points = fill.points.clone();
        if !points.is_empty() {
            points.push(points[0]);
            m.shapes.push(BankShape {
                key,
                label: "Foundation filling".into(),
                points,
            });
        }
    }
    let cores: Vec<_> = sample
        .cores
        .iter()
        .map(|poly| clipped(poly, side))
        .filter(|p| polygon_area(p) > EPS)
        .collect();
    for poly in &cores {
        let mut points = poly.clone();
        points.push(poly[0]);
        m.shapes.push(BankShape {
            key: "hearting".into(),
            label: "Impervious hearting".into(),
            points,
        });
    }
    let continuous = !cutting
        && sample.cores.is_empty()
        && sample.banks.iter().all(|bank| {
            bank.status == "fill"
                && bank.construction == "homogeneous"
                && (s(&bank.treatment, "blanket") == "5-4"
                    || s(&bank.treatment, "blanket") == "5-5"
                        && n(&bank.treatment, "blanketThickness") > 0.0)
                && s(&bank.treatment, "blanketWidthMode") == "automatic"
        })
        && footprints.iter().any(|(_, c)| (*c + half).abs() < EPS)
        && footprints.iter().any(|(a, _)| (*a - half).abs() < EPS);
    let blanket_thickness = if s(t, "blanket") == "5-4" {
        0.25
    } else if s(t, "blanket") == "5-5" {
        n(t, "blanketThickness")
    } else {
        0.0
    };
    let mut filter_shapes = vec![];
    for (a, c) in &ranges {
        let (mut from, mut to) = (*a, *c);
        if continuous && s(t, "blanketWidthMode") == "automatic" {
            if side == "left" && (to + half).abs() < EPS {
                to = 0.0;
            }
            if side == "right" && (from - half).abs() < EPS {
                from = 0.0;
            }
        }
        let core_offsets: Vec<_> = cores
            .iter()
            .chain(&sample.trenches)
            .flatten()
            .map(|p| p.offset)
            .filter(|x| if side == "left" { *x < 0.0 } else { *x > 0.0 })
            .collect();
        if !core_offsets.is_empty() {
            if side == "left" {
                to = to.min(core_offsets.iter().copied().fold(f64::INFINITY, f64::min));
            } else {
                from = from.max(
                    core_offsets
                        .iter()
                        .copied()
                        .fold(f64::NEG_INFINITY, f64::max),
                );
            }
        }
        if to > from {
            m.blanket_ranges.push((from, to));
        }
        let mut filter_limit = c - a;
        let mut automatic_filter = filter_limit / 2.0;
        if bank.construction == "zoned" && !core_offsets.is_empty() {
            automatic_filter = if side == "left" {
                core_offsets.iter().copied().fold(f64::INFINITY, f64::min) - a
            } else {
                c - core_offsets
                    .iter()
                    .copied()
                    .fold(f64::NEG_INFINITY, f64::max)
            };
            automatic_filter = automatic_filter.max(0.0).min(filter_limit);
            filter_limit = automatic_filter;
        }
        m.automatic_filter_length += automatic_filter;
        if blanket_thickness > 0.0 && to > from {
            let requested = if s(t, "blanketWidthMode") == "manual" {
                n(
                    t,
                    if side == "left" {
                        "blanketLeftWidth"
                    } else {
                        "blanketRightWidth"
                    },
                )
            } else {
                to - from
            };
            let width = requested.min(to - from);
            let (from, to) = if side == "left" {
                (from, from + width)
            } else {
                (to - width, to)
            };
            let poly = raised_band(&ground, from, to, sample.stripping_depth, blanket_thickness);
            let fixed = s(t, "blanket") == "5-4";
            add(
                &mut m,
                registry,
                if fixed {
                    "blanket_25"
                } else {
                    "blanket_variable"
                },
                if fixed {
                    "Sand blanket, 250 mm"
                } else {
                    "Sand blanket, variable thickness"
                },
                if fixed { "IRR-CAW-5-4" } else { "IRR-CAW-5-5" },
                "Sand Blanket & Filters",
                !fixed,
                if fixed { width } else { polygon_area(&poly) },
            );
            if !poly.is_empty() {
                material.push(poly.clone());
                let mut points = poly;
                points.push(points[0]);
                m.shapes.push(BankShape {
                    key: if fixed {
                        "blanket_25"
                    } else {
                        "blanket_variable"
                    }
                    .into(),
                    label: "Sand blanket".into(),
                    points,
                });
            }
        }
        if b(t, "horizontalFilter") && n(t, "filterThickness") > 0.0 {
            let requested = if s(t, "filterLengthMode") == "manual" {
                n(
                    t,
                    if side == "left" {
                        "filterLeftLength"
                    } else {
                        "filterRightLength"
                    },
                )
            } else {
                automatic_filter
            };
            let width = requested.min(filter_limit);
            let (from, to) = if side == "left" {
                (*a, *a + width)
            } else {
                (*c - width, *c)
            };
            let poly = raised_band(
                &ground,
                from,
                to,
                sample.stripping_depth - blanket_thickness,
                n(t, "filterThickness"),
            );
            add(
                &mut m,
                registry,
                "horizontal_filter",
                "Horizontal graded filter",
                "IRR-CAW-5-7",
                "Sand Blanket & Filters",
                true,
                polygon_area(&poly),
            );
            if !poly.is_empty() {
                material.push(poly.clone());
                filter_shapes.push((from, to, poly.clone()));
                let mut points = poly;
                points.push(points[0]);
                m.shapes.push(BankShape {
                    key: "horizontal_filter".into(),
                    label: "Horizontal filter".into(),
                    points,
                });
            }
        }
    }
    if b(t, "rockToe") && selected(t, "rockToeSide", side) {
        for (from, to, _) in &filter_shapes {
            let inner = if side == "left" { *to } else { *from };
            let width = n(t, "rockToeWidth").min(to - from);
            let base = line_at(&ground, inner) - sample.stripping_depth
                + blanket_thickness
                + n(t, "filterThickness");
            let height = if n(t, "rockToeHeight") > 0.0 {
                n(t, "rockToeHeight")
            } else {
                (sample.bed_level + input.full_supply_depth - base).max(0.0)
            };
            let (a, c) = if side == "left" {
                (inner - width, inner)
            } else {
                (inner, inner + width)
            };
            let poly = vec![
                p(a, base),
                p(c, base),
                p(c, base + height),
                p(a, base + height),
            ];
            add(
                &mut m,
                registry,
                "vertical_filter",
                "Vertical / inclined filter",
                "IRR-CAW-5-10",
                "Sand Blanket & Filters",
                true,
                polygon_area(&poly),
            );
            material.push(poly.clone());
            let mut points = poly;
            points.push(points[0]);
            m.shapes.push(BankShape {
                key: "vertical_filter".into(),
                label: "Vertical filter".into(),
                points,
            });
        }
    }
    // Developed faces and actual horizontal shelves, excluding crests/road tops.
    let top = bank
        .profile
        .iter()
        .map(|p| p.rl)
        .fold(f64::NEG_INFINITY, f64::max);
    let outer_top = bank
        .profile
        .iter()
        .rposition(|p| (p.rl - top).abs() < EPS)
        .unwrap_or(0);
    m.slope_segments = bank.profile[outer_top..]
        .windows(2)
        .filter(|w| w[0].rl - w[1].rl > EPS)
        .map(|w| w.to_vec())
        .collect();
    m.berm_segments = bank.profile[outer_top..]
        .windows(2)
        .filter(|w| (w[0].rl - w[1].rl).abs() < EPS && (w[0].offset - w[1].offset).abs() > EPS)
        .map(|w| w.to_vec())
        .collect();
    m.outer_slope_length = m
        .slope_segments
        .iter()
        .map(|w| (w[1].offset - w[0].offset).hypot(w[1].rl - w[0].rl))
        .sum();
    m.berm_shelf_width = m
        .berm_segments
        .iter()
        .map(|w| (w[1].offset - w[0].offset).abs())
        .sum();
    for (surface, spec) in [("slope", &bank.slopes), ("berm", &bank.berms)] {
        if let Some(code) = protection_code(spec, input.work_mode == "repair")? {
            let segments: Vec<_> = bank.profile[outer_top..]
                .windows(2)
                .filter(|w| {
                    if surface == "slope" {
                        w[0].rl - w[1].rl > EPS
                    } else {
                        (w[0].rl - w[1].rl).abs() < EPS
                    }
                })
                .collect();
            let length = segments
                .iter()
                .map(|w| (w[1].offset - w[0].offset).hypot(w[1].rl - w[0].rl))
                .sum();
            for segment in segments {
                m.shapes.push(BankShape {
                    key: format!("{surface}_protection_{code}"),
                    label: format!(
                        "{} protection ({code})",
                        if surface == "slope" {
                            "Slope"
                        } else {
                            "Berm shelf"
                        }
                    ),
                    points: segment.to_vec(),
                });
            }
            let key = format!("{surface}_protection_{code}");
            add(
                &mut m,
                registry,
                &key,
                if surface == "slope" {
                    "Bank slope protection"
                } else {
                    "Berm shelf protection"
                },
                &code,
                if surface == "slope" {
                    "Bank Slope Protection"
                } else {
                    "Others"
                },
                false,
                length,
            );
        }
    }
    let toe = bank.profile.last().copied().unwrap_or_default();
    let inward = if side == "left" { 1.0 } else { -1.0 };
    let at = |run: f64, rl: f64| p(toe.offset + inward * run, rl);
    if b(t, "toeFilter") && selected(t, "toeFilterSide", side) {
        let width = n(t, "toeFilterWidth");
        let kind = s(t, "toeFilterKind");
        let depth = if kind == "5-7" {
            n(t, "toeFilterDepth")
        } else {
            0.2
        };
        let poly = vec![
            at(0.0, toe.rl - sample.stripping_depth),
            at(width, toe.rl - sample.stripping_depth),
            at(width, toe.rl - sample.stripping_depth - depth),
            at(0.0, toe.rl - sample.stripping_depth - depth),
        ];
        add(
            &mut m,
            registry,
            &format!("toe_filter_{kind}"),
            "Subsurface toe filter",
            &format!("IRR-CAW-{kind}"),
            "Others",
            kind == "5-7",
            if kind == "5-7" { width * depth } else { width },
        );
        material.push(poly.clone());
        let mut points = poly;
        points.push(points[0]);
        m.shapes.push(BankShape {
            key: format!("toe_filter_{kind}"),
            label: "Toe filter".into(),
            points,
        });
    }
    if b(t, "rockToeProtection") && selected(t, "rockToeProtectionSide", side) {
        let height = n(t, "rockToeProtectionHeight");
        let crest = n(t, "rockToeTopWidth");
        let inner = n(t, "rockToeInnerSlope");
        let outer = bank
            .profile
            .windows(2)
            .rev()
            .find(|w| w[0].rl - w[1].rl > EPS)
            .map_or(0.0, |w| {
                (w[1].offset - w[0].offset).abs() / (w[0].rl - w[1].rl)
            });
        let width = crest + height * (inner + outer);
        let poly = vec![
            at(0.0, toe.rl),
            at(width, toe.rl),
            at(height * outer + crest, toe.rl + height),
            at(height * outer, toe.rl + height),
        ];
        add(
            &mut m,
            registry,
            "rock_toe",
            "Rock toe",
            "IRR-CAW-5-6",
            "Others",
            true,
            polygon_area(&poly),
        );
        material.push(poly.clone());
        let mut points = poly;
        points.push(points[0]);
        m.shapes.push(BankShape {
            key: "rock_toe".into(),
            label: "Rock toe".into(),
            points,
        });
        if b(t, "rockToeFilter") && height > 0.0 {
            let face = height.hypot(inner * height);
            let dx = height / face * 0.5;
            let dy = inner * height / face * 0.5;
            let polys = vec![
                vec![
                    at(0.0, toe.rl),
                    at(width, toe.rl),
                    at(width, toe.rl - 1.0),
                    at(0.0, toe.rl - 1.0),
                ],
                vec![
                    at(width, toe.rl),
                    at(height * outer + crest, toe.rl + height),
                    at(height * outer + crest + dx, toe.rl + height + dy),
                    at(width + dx, toe.rl + dy),
                ],
            ];
            add(
                &mut m,
                registry,
                "rock_toe_filter",
                "Rock-toe graded filter",
                "IRR-CAW-5-11",
                "Others",
                true,
                polys.iter().map(|p| polygon_area(p)).sum(),
            );
            for poly in polys {
                material.push(poly.clone());
                let mut points = poly;
                points.push(points[0]);
                m.shapes.push(BankShape {
                    key: "rock_toe_filter".into(),
                    label: "Rock-toe graded filter".into(),
                    points,
                });
            }
        }
    }
    if b(t, "toeDrain") && selected(t, "toeDrainSide", side) {
        let depth = n(t, "toeDrainDepth");
        let width = n(t, "toeDrainBottomWidth");
        let a = depth * n(t, "toeDrainLeftSlope");
        let c = depth * n(t, "toeDrainRightSlope");
        let near = -n(t, "toeDrainBermWidth");
        let level = line_at(&ground, at(near, 0.0).offset);
        let poly = vec![
            at(near, level),
            at(near - a, level - depth),
            at(near - a - width, level - depth),
            at(near - a - width - c, level),
        ];
        add(
            &mut m,
            registry,
            "toe_ditch",
            "Open toe-ditch excavation",
            "IRR-CAW-1-1",
            "Others",
            true,
            polygon_area(&poly),
        );
        let developed = depth.hypot(a) + width + depth.hypot(c);
        if s(t, "toeDrainProtection") == "rubble" {
            add(
                &mut m,
                registry,
                "ditch_rubble",
                "Rubble protection to toe ditch",
                "IRR-CAW-8-4",
                "Others",
                false,
                developed,
            );
        }
        if s(t, "toeDrainProtection") == "concrete" {
            add(
                &mut m,
                registry,
                "ditch_concrete",
                "100 mm concrete lining to toe ditch",
                "IRR-CAW-7-15",
                "Others",
                true,
                developed * 0.1,
            );
        }
        let mut points = poly;
        points.push(points[0]);
        m.shapes.push(BankShape {
            key: "toe_ditch".into(),
            label: format!(
                "Open toe ditch{}",
                match s(t, "toeDrainProtection") {
                    "rubble" => ", rubble protection",
                    "concrete" => ", concrete lining",
                    _ => ", unlined",
                }
            ),
            points,
        });
    }
    let all: Vec<_> = envelope
        .iter()
        .chain(&cores)
        .chain(&material)
        .chain(&sample.cns)
        .cloned()
        .collect();
    let mut hearting = 0.0;
    let mut net = 0.0;
    let mut cns = 0.0;
    cells(&all, |x, y, area| {
        if !inside(&envelope, x, y) {
            return;
        }
        if inside(&sample.cns, x, y) {
            cns += area;
            return;
        }
        if inside(&material, x, y) {
            return;
        }
        net += area;
        if inside(&cores, x, y) {
            hearting += area;
        }
    });
    m.deducted_fill = (gross - net).max(0.0);
    add(
        &mut m,
        registry,
        "cns_replacement",
        "Canal lining / CNS within bank filling",
        "",
        "Deductions",
        true,
        cns,
    );
    if bank.construction == "zoned" {
        add(
            &mut m,
            registry,
            "hearting",
            "Impervious hearting",
            "",
            "Earthwork",
            true,
            hearting,
        );
        add(
            &mut m,
            registry,
            "casing",
            "Casing earth filling, including berms",
            "",
            "Earthwork",
            true,
            (net - hearting).max(0.0),
        );
    } else {
        add(
            &mut m,
            registry,
            "filling",
            "Homogeneous earth filling, including berms",
            "",
            "Earthwork",
            true,
            net,
        );
    }
    let trenches: Vec<_> = sample
        .trenches
        .iter()
        .map(|poly| clipped(poly, side))
        .filter(|p| polygon_area(p) > EPS)
        .collect();
    for (polys, label) in [
        (&trenches, "Cutoff trench"),
        (&sample.cns, "Canal lining / CNS"),
    ] {
        for poly in polys {
            let mut points = clipped(poly, side);
            if polygon_area(&points) <= EPS {
                continue;
            }
            points.push(points[0]);
            m.shapes.push(BankShape {
                key: if label == "Cutoff trench" {
                    "cutoff_filling"
                } else {
                    "cns_replacement"
                }
                .into(),
                label: label.into(),
                points,
            });
        }
    }
    let mut trench = 0.0;
    cells(&trenches, |x, y, area| {
        if inside(&trenches, x, y) {
            trench += area
        }
    });
    if bank.construction == "zoned" {
        add(
            &mut m,
            registry,
            "cutoff_excavation",
            "Cutoff trench excavation",
            "",
            "Earthwork",
            true,
            trench,
        );
        add(
            &mut m,
            registry,
            "cutoff_filling",
            "Cutoff trench hearting",
            "",
            "Earthwork",
            true,
            trench,
        );
    }
    let prepared_ranges = if !cutting && !ranges.is_empty() {
        vec![if side == "left" {
            (
                ranges.iter().map(|r| r.0).fold(f64::INFINITY, f64::min),
                0.0,
            )
        } else {
            (
                0.0,
                ranges.iter().map(|r| r.1).fold(f64::NEG_INFINITY, f64::max),
            )
        }]
    } else {
        ranges
    };
    for (a, c) in prepared_ranges {
        let mut points = vec![p(a, line_at(&ground, a) - sample.stripping_depth)];
        points.extend(
            ground
                .iter()
                .filter(|p| p.offset > a && p.offset < c)
                .map(|p| Point {
                    offset: p.offset,
                    rl: p.rl - sample.stripping_depth,
                }),
        );
        points.push(p(c, line_at(&ground, c) - sample.stripping_depth));
        m.shapes.push(BankShape {
            key: "prepared".into(),
            label: "Prepared level".into(),
            points,
        });
    }
    // Show the survey over this bank and its enabled works. Distant survey
    // endpoints must not flatten the representative diagram's scale.
    let shown: Vec<_> = m
        .shapes
        .iter()
        .filter(|shape| shape.label != "Natural ground")
        .flat_map(|shape| shape.points.iter().map(|p| p.offset))
        .collect();
    let from = shown.iter().copied().fold(f64::INFINITY, f64::min);
    let to = shown.iter().copied().fold(f64::NEG_INFINITY, f64::max);
    if let Some(shape) = m
        .shapes
        .iter_mut()
        .find(|shape| shape.label == "Natural ground")
    {
        shape.points = vec![p(from, line_at(&ground, from))];
        shape.points.extend(
            ground
                .iter()
                .copied()
                .filter(|p| p.offset > from && p.offset < to),
        );
        shape.points.push(p(to, line_at(&ground, to)));
    }
    Ok(m)
}

fn validate(input: &BankExportInput) -> Result<(), String> {
    if input.version != 1 {
        return Err("Unsupported bank statement input version.".into());
    }
    if !input.length_m.is_finite()
        || input.length_m <= 0.0
        || !input.bed_width.is_finite()
        || input.bed_width < 0.0
        || !input.full_supply_depth.is_finite()
        || input.full_supply_depth <= 0.0
    {
        return Err("Check canal length, bed width and supply depth before export.".into());
    }
    let mut cursor = 0.0;
    for interval in &input.intervals {
        if !interval.from.is_finite()
            || !interval.to.is_finite()
            || (interval.from - cursor).abs() > EPS
            || interval.to <= interval.from
        {
            return Err(
                "Bank measurement intervals must cover the canal without gaps or overlaps.".into(),
            );
        }
        for (sample, ch) in [
            (&interval.start, interval.from),
            (&interval.end, interval.to),
        ] {
            if !sample.validation_errors.is_empty() {
                return Err(format!(
                    "Bank section at Ch {ch} m: {}",
                    sample.validation_errors.join(" ")
                ));
            }
            if (sample.chainage - ch).abs() > EPS
                || !sample.bed_level.is_finite()
                || !sample.stripping_depth.is_finite()
                || sample.stripping_depth < 0.0
                || sample.design.len() < 2
                || sample.ground.len() < 2
            {
                return Err(format!("Missing section geometry at Ch {ch} m."));
            }
            if sample.banks.len() != 2
                || !["left", "right"]
                    .iter()
                    .all(|side| sample.banks.iter().filter(|b| b.side == *side).count() == 1)
            {
                return Err(
                    "Each section must contain exactly one left and one right bank.".into(),
                );
            }
            for bank in &sample.banks {
                if !["homogeneous", "zoned"].contains(&bank.construction.as_str())
                    || bank.profile.len() < 2
                {
                    return Err(format!("Invalid {} bank profile at Ch {ch} m.", bank.side));
                }
            }
            if sample
                .ground
                .iter()
                .chain(&sample.design)
                .chain(sample.cores.iter().flatten())
                .chain(sample.trenches.iter().flatten())
                .chain(sample.cns.iter().flatten())
                .chain(sample.banks.iter().flat_map(|b| &b.profile))
                .any(|p| !p.offset.is_finite() || !p.rl.is_finite())
            {
                return Err(format!("Non-finite coordinate at Ch {ch} m."));
            }
        }
        cursor = interval.to;
    }
    if (cursor - input.length_m).abs() > EPS {
        return Err("Surveyed bank sections must cover the full canal length.".into());
    }
    Ok(())
}

/// Only construction and slope-protection presence partition sheets. All
/// blanket/filter/berm/toe/ditch variations are unions of columns in that sheet.
pub fn build_bank_statement(input: &BankExportInput) -> Result<BankStatement, String> {
    validate(input)?;
    let mut registry = BTreeMap::new();
    let mut rows = vec![];
    let mut keys = BTreeSet::new();
    let mut row_keys = vec![];
    let mut variants: BTreeMap<(String, String, String), usize> = BTreeMap::new();
    for interval in &input.intervals {
        for side in ["left", "right"] {
            let a = interval
                .start
                .banks
                .iter()
                .find(|b| b.side == side)
                .unwrap();
            let c = interval.end.banks.iter().find(|b| b.side == side).unwrap();
            if a.reach_id != c.reach_id
                || a.design_reference != c.design_reference
                || a.construction != c.construction
                || a.slopes != c.slopes
                || a.treatment != c.treatment
                || a.berms != c.berms
                || a.status != c.status
            {
                return Err(format!("Split the {side} measurement interval at its design/work boundary (Ch {}–{} m).",interval.from,interval.to));
            }
            let start = measure(input, &interval.start, a, &mut registry)?;
            let end = measure(input, &interval.end, c, &mut registry)?;
            let active = a.status == "fill" && start.gross_fill + end.gross_fill > EPS;
            let key = if active {
                Some((
                    a.construction.clone(),
                    protection_code(&a.slopes, input.work_mode == "repair")?.is_some(),
                ))
            } else {
                None
            };
            if let Some(key) = &key {
                keys.insert(key.clone());
            }
            let quantities = quantities_between(&start, &end, interval.to - interval.from);
            let signature =
                serde_json::to_string(&(&a.design_reference, &a.slopes, &a.berms, &a.treatment))
                    .map_err(|e| e.to_string())?;
            let variant_key = (side.to_string(), a.reach_id.clone(), signature);
            let next_variant = 1 + variants
                .keys()
                .filter(|(bank, reach, _)| bank == side && reach == &a.reach_id)
                .count();
            let design_variant = *variants.entry(variant_key).or_insert(next_variant);
            rows.push(BankStatementRow {
                from: interval.from,
                to: interval.to,
                side: side.into(),
                reach_id: a.reach_id.clone(),
                profile_name: a.profile_name.clone(),
                design_variant,
                status: if active {
                    "fill".into()
                } else if a.status == "fill" {
                    "cut".into()
                } else {
                    a.status.clone()
                },
                group_index: None,
                start,
                end,
                quantities,
            });
            row_keys.push(key);
        }
    }
    let key_list: Vec<_> = keys.into_iter().collect();
    let mut groups = vec![];
    for (index, (construction, protected)) in key_list.iter().enumerate() {
        let family = if construction == "zoned" {
            "Zoned"
        } else {
            "Homogeneous"
        };
        let mut group = BankStatementGroup {
            sheet_name: format!(
                "{family} {}",
                if *protected {
                    "Protected"
                } else {
                    "Unprotected"
                }
            ),
            name: String::new(),
            construction: construction.clone(),
            slope_protection: *protected,
            definition: vec![],
            works: vec![],
            totals: BTreeMap::new(),
            reach_ids: vec![],
        };
        let mut members = BTreeSet::new();
        for (i, row) in rows.iter_mut().enumerate() {
            if row_keys[i].as_ref() == Some(&(construction.clone(), *protected)) {
                row.group_index = Some(index);
                members.insert(format!("{}:{}", row.side, row.reach_id));
                for (key, value) in &row.quantities {
                    *group.totals.entry(key.clone()).or_default() += value;
                }
            }
        }
        group.reach_ids = members.into_iter().collect();
        let filters = ["horizontal_filter", "vertical_filter"]
            .iter()
            .any(|k| group.totals.get(*k).copied().unwrap_or(0.0) > EPS);
        if filters {
            define(
                &mut registry,
                "horizontal_filter",
                "Horizontal graded filter",
                "IRR-CAW-5-7",
                "Sand Blanket & Filters",
                true,
            );
            define(
                &mut registry,
                "vertical_filter",
                "Vertical / inclined filter",
                "IRR-CAW-5-10",
                "Sand Blanket & Filters",
                true,
            );
        }
        group.works = registry
            .values()
            .filter(|work| {
                group.totals.get(&work.key).copied().unwrap_or(0.0) > EPS
                    || (filters
                        && ["horizontal_filter", "vertical_filter"].contains(&work.key.as_str()))
                    || (construction == "homogeneous" && work.key == "filling")
                    || (construction == "zoned"
                        && ["hearting", "casing"].contains(&work.key.as_str()))
            })
            .cloned()
            .collect();
        group.works.sort_by_key(work_order);
        let blanket = group.works.iter().any(|w| w.key.starts_with("blanket_"));
        let others = group.works.iter().any(|w| w.block == "Others");
        group.name=format!("{family} Reaches with Bank Slope Protection {}, Sand Blanket {}, Filters {}, and Others {}",if *protected{"Provided"}else{"Not Provided"},if blanket{"Provided"}else{"Not Provided"},if filters{"Provided"}else{"Not Provided"},if others{"Provided"}else{"Not Provided"});
        group.definition.push(format!(
            "Construction: {family}. Bank slope protection: {}.",
            if *protected {
                "provided"
            } else {
                "not provided"
            }
        ));
        for (title, prefix) in [
            ("Sand blanket", "blanket_"),
            ("Filters", "_filter"),
            ("Others", ""),
        ] {
            let works: Vec<_> = group
                .works
                .iter()
                .filter(|w| {
                    if title == "Others" {
                        w.block == "Others"
                    } else if title == "Filters" {
                        ["horizontal_filter", "vertical_filter"].contains(&w.key.as_str())
                    } else {
                        w.key.starts_with(prefix)
                    }
                })
                .map(|w| {
                    format!(
                        "{}{}{}",
                        w.label,
                        if w.code.is_empty() {
                            String::new()
                        } else {
                            format!(" ({})", w.code)
                        },
                        if group.totals.get(&w.key).copied().unwrap_or(0.0) <= EPS {
                            "; not provided (column retained)"
                        } else {
                            ""
                        }
                    )
                })
                .collect();
            group.definition.push(format!(
                "{title}: {}.",
                if works.is_empty() {
                    "not provided".into()
                } else {
                    format!(
                        "{}; provided in applicable reaches, zero elsewhere",
                        works.join(", ")
                    )
                }
            ));
        }
        groups.push(group);
    }
    let mut totals = BTreeMap::new();
    let used: BTreeSet<_> = groups
        .iter()
        .flat_map(|g| g.works.iter().map(|w| w.key.clone()))
        .collect();
    for group in &groups {
        for (key, value) in &group.totals {
            *totals.entry(key.clone()).or_default() += value;
        }
    }
    let mut works: Vec<_> = registry
        .into_values()
        .filter(|w| used.contains(&w.key))
        .collect();
    works.sort_by_key(work_order);
    let mut materials = vec![];
    for zone in ["homogeneous", "hearting", "casing"] {
        let key = if zone == "homogeneous" {
            "filling"
        } else {
            zone
        };
        let quantity = totals.get(key).copied().unwrap_or(0.0)
            + if zone == "hearting" {
                totals.get("cutoff_filling").copied().unwrap_or(0.0)
            } else {
                0.0
            };
        let allocations: Vec<_> = input
            .material_allocations
            .iter()
            .filter(|a| a.zone == zone)
            .collect();
        if quantity <= EPS || allocations.is_empty() {
            continue;
        }
        if allocations
            .iter()
            .any(|a| !a.percentage.is_finite() || a.percentage < 0.0 || a.percentage > 100.0)
            || (allocations.iter().map(|a| a.percentage).sum::<f64>() - 100.0).abs() > 1e-6
        {
            return Err(format!(
                "Material source shares for {zone} must total 100%."
            ));
        }
        for a in allocations {
            if a.percentage <= 0.0 {
                continue;
            }
            let chapter = match a.source.as_str() {
                "borrow-area" => 2,
                "dump-area" => 3,
                "canal-excavation" => 4,
                _ => return Err(format!("Unknown bank material source: {}", a.source)),
            };
            let number = if zone == "hearting" && a.watering {
                if a.compaction == 98 {
                    1
                } else if a.compaction == 95 {
                    2
                } else {
                    0
                }
            } else if zone != "hearting" {
                let base = if chapter == 2 && zone == "homogeneous" {
                    6
                } else {
                    3
                };
                if a.compaction == 98 && a.watering {
                    base
                } else if a.compaction == 95 && a.watering {
                    base + 1
                } else if a.compaction == 95 {
                    base + 2
                } else {
                    0
                }
            } else {
                0
            };
            if number == 0 {
                return Err(format!(
                    "Invalid material compaction/watering choice for {zone}."
                ));
            }
            materials.push(BankStatementMaterial {
                zone: zone.into(),
                source: a.source.clone(),
                percentage: a.percentage,
                compaction: a.compaction,
                watering: a.watering,
                code: format!("IRR-CAW-{chapter}-{number}"),
                quantity: quantity * a.percentage / 100.0,
            });
        }
    }
    Ok(BankStatement {
        groups,
        rows,
        works,
        totals,
        materials,
    })
}

fn work_order(work: &BankWork) -> (u8, String) {
    let order = match work.key.as_str() {
        "stripping" => 0,
        "filling" => 1,
        "hearting" => 2,
        "casing" => 3,
        "cutoff_excavation" => 4,
        "cutoff_filling" => 5,
        "horizontal_filter" => 21,
        "vertical_filter" => 22,
        "cns_replacement" => 50,
        _ => {
            if work.key.starts_with("slope_") {
                10
            } else if work.key.starts_with("blanket_") {
                20
            } else {
                30
            }
        }
    };
    (order, work.key.clone())
}
