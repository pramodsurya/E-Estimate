//! Excel rendering only. Group membership, measurements and quantities come
//! from estimate-core::canal_engine::bank_statement, also usable by Typst.
use estimate_core::canal_engine::bank_statement::*;
use rust_xlsxwriter::{
    Chart, ChartLine, ChartType, Color, Format, FormatAlign, Formula, Workbook, Worksheet,
    XlsxError,
};
use std::collections::BTreeMap;

const HEADER: u32 = 9;
const FIRST: u32 = HEADER + 3;

struct Styles {
    title: Format,
    text: Format,
    note: Format,
    header: Format,
    block: Format,
    number: Format,
    zero: Format,
    total: Format,
}
impl Styles {
    fn new() -> Self {
        let text = Format::new()
            .set_font_name("Arial")
            .set_font_size(10)
            .set_font_color(Color::RGB(0x172A3A))
            .set_align(FormatAlign::VerticalCenter);
        Self {
            title: text.clone().set_bold().set_font_size(14).set_text_wrap(),
            note: text
                .clone()
                .set_font_color(Color::RGB(0x526574))
                .set_text_wrap(),
            header: text
                .clone()
                .set_bold()
                .set_font_color(Color::White)
                .set_background_color(Color::RGB(0x244563))
                .set_text_wrap()
                .set_align(FormatAlign::Center),
            block: text
                .clone()
                .set_bold()
                .set_font_color(Color::White)
                .set_background_color(Color::RGB(0x3E657C))
                .set_align(FormatAlign::Center),
            number: text
                .clone()
                .set_num_format("#,##0.000")
                .set_align(FormatAlign::Right),
            zero: text
                .clone()
                .set_num_format("0.000")
                .set_font_color(Color::RGB(0x75828D))
                .set_background_color(Color::RGB(0xF1F4F6)),
            total: text
                .clone()
                .set_bold()
                .set_num_format("#,##0.000")
                .set_background_color(Color::RGB(0xE2EBF1)),
            text,
        }
    }
}
fn formula(
    ws: &mut Worksheet,
    row: u32,
    col: u16,
    text: String,
    value: f64,
    style: &Format,
) -> Result<(), XlsxError> {
    ws.write_formula_with_format(
        row,
        col,
        Formula::new(text).set_result(value.to_string()),
        style,
    )?;
    Ok(())
}
fn col(mut c: u16) -> String {
    let mut out = String::new();
    loop {
        out.insert(0, (b'A' + (c % 26) as u8) as char);
        if c < 26 {
            break;
        }
        c = c / 26 - 1;
    }
    out
}
fn quoted(name: &str) -> String {
    format!("'{}'", name.replace('\'', "''"))
}
fn base(ws: &mut Worksheet) -> Result<(), XlsxError> {
    ws.set_screen_gridlines(false)
        .set_print_gridlines(false)
        .set_landscape()
        .set_paper_size(8)
        .set_print_scale(85);
    ws.set_default_row_height(20);
    Ok(())
}
fn merged(
    ws: &mut Worksheet,
    row: u32,
    last: u16,
    text: &str,
    style: &Format,
    height: f64,
) -> Result<(), XlsxError> {
    ws.merge_range(row, 0, row, last, text, style)?;
    ws.set_row_height(row, height)?;
    Ok(())
}

pub fn generate_canal_embankment_excel_bytes(input: &BankExportInput) -> Result<Vec<u8>, String> {
    let statement = build_bank_statement(input)?;
    render(input, &statement).map_err(|e| e.to_string())
}

fn render(input: &BankExportInput, statement: &BankStatement) -> Result<Vec<u8>, XlsxError> {
    let mut book = Workbook::new();
    let styles = Styles::new();
    book.add_worksheet().set_name("Statement of Quantities")?;
    for group in &statement.groups {
        book.add_worksheet().set_name(&group.sheet_name)?;
    }
    let mut total_refs: BTreeMap<(usize, String), (u32, u16)> = BTreeMap::new();
    let mut arrangements: BTreeMap<(String, String), usize> = BTreeMap::new();
    for row in &statement.rows {
        let count = arrangements
            .entry((row.side.clone(), row.reach_id.clone()))
            .or_default();
        *count = (*count).max(row.design_variant);
    }
    for (index, group) in statement.groups.iter().enumerate() {
        let ws = book.worksheet_from_name(&group.sheet_name)?;
        base(ws)?;
        let last = (4 + 3 * group.works.len()) as u16;
        let intro_last = last.min(10);
        merged(ws, 1, intro_last, &group.name, &styles.title, 46.0)?;
        for (i, line) in group.definition.iter().enumerate() {
            merged(
                ws,
                3 + i as u32,
                intro_last,
                line,
                &styles.note,
                if i == 3 { 54.0 } else { 30.0 },
            )?;
        }
        merged(ws,7,intro_last,"Section values use the complete drawn bank profile, including berms. Net earth filling excludes the materials replacing it. Both filter columns are retained when either filter is measured.",&styles.note,30.0)?;
        merged(ws,8,intro_last,"Each interval has its own From and To samples. Grey rows belong to another sheet or full cutting and contribute zero. Quantities = average section × interval length.",&styles.note,30.0)?;
        let identifiers = [
            "Chainage (m)",
            "Bank",
            "Reach / sheet reference",
            "Length (m)",
            "Bank design",
        ];
        for (c, label) in identifiers.iter().enumerate() {
            ws.merge_range(
                HEADER,
                c as u16,
                HEADER + 2,
                c as u16,
                *label,
                &styles.header,
            )?;
        }
        ws.set_column_width(0, 14)?
            .set_column_width(1, 9)?
            .set_column_width(2, 34)?
            .set_column_width(3, 13)?
            .set_column_width(4, 25)?;
        let mut blocks: Vec<(String, u16, u16)> = vec![];
        for (i, work) in group.works.iter().enumerate() {
            let c = 5 + i as u16 * 3;
            ws.set_column_range_width(c, c + 2, 16)?;
            if let Some(last) = blocks.last_mut() {
                if last.0 == work.block {
                    last.2 = c + 2;
                } else {
                    blocks.push((work.block.clone(), c, c + 2));
                }
            } else {
                blocks.push((work.block.clone(), c, c + 2));
            }
            let label = format!(
                "{}{}",
                work.label,
                if work.code.is_empty() {
                    String::new()
                } else {
                    format!("\n{}", work.code)
                }
            );
            ws.merge_range(HEADER + 1, c, HEADER + 1, c + 2, &label, &styles.header)?;
            for (j, label) in [
                format!("Section ({})", work.section_unit),
                format!("Average ({})", work.section_unit),
                format!("Quantity ({})", work.unit),
            ]
            .iter()
            .enumerate()
            {
                ws.write_string_with_format(HEADER + 2, c + j as u16, label, &styles.header)?;
            }
        }
        for (name, a, c) in blocks {
            ws.merge_range(HEADER, a, HEADER, c, &name, &styles.block)?;
        }
        ws.set_row_height(HEADER, 24)?
            .set_row_height(HEADER + 1, 60)?
            .set_row_height(HEADER + 2, 34)?;
        ws.set_freeze_panes(FIRST, 3)?;
        ws.set_repeat_rows(HEADER, HEADER + 2)?;
        ws.set_repeat_columns(0, 4)?;
        let mut row = FIRST;
        for span in &statement.rows {
            let own = span.group_index == Some(index);
            let reference = if own {
                span.reach_id.clone()
            } else if let Some(owner) = span.group_index {
                format!("See sheet {}", statement.groups[owner].sheet_name)
            } else if span.status == "cut" || span.status == "level" {
                "Full cutting / no bank filling".into()
            } else {
                format!("{} / no bank filling", span.status)
            };
            for (offset, (ch, measurement)) in [(span.from, &span.start), (span.to, &span.end)]
                .into_iter()
                .enumerate()
            {
                let r = row + offset as u32;
                ws.write_number_with_format(r, 0, ch, &styles.number)?;
                ws.write_string_with_format(r, 1, &span.side, &styles.text)?;
                ws.write_string_with_format(r, 2, &reference, &styles.note)?;
                if offset == 0 {
                    ws.write_number_with_format(r, 3, 0.0, &styles.number)?;
                } else {
                    formula(
                        ws,
                        r,
                        3,
                        format!("=A{}-A{}", r + 1, row + 1),
                        span.to - span.from,
                        &styles.number,
                    )?;
                }
                let multiple = arrangements
                    .get(&(span.side.clone(), span.reach_id.clone()))
                    .copied()
                    .unwrap_or(1)
                    > 1;
                let name = if !own {
                    String::new()
                } else if multiple {
                    format!(
                        "{} / arrangement {}",
                        span.profile_name, span.design_variant
                    )
                } else {
                    span.profile_name.clone()
                };
                ws.write_string_with_format(r, 4, &name, &styles.text.clone().set_text_wrap())?;
                if own && multiple {
                    ws.set_row_height(r, 32)?;
                }
                for (i, work) in group.works.iter().enumerate() {
                    let c = 5 + i as u16 * 3;
                    let value = if own {
                        measurement.values.get(&work.key).copied().unwrap_or(0.0)
                    } else {
                        0.0
                    };
                    ws.write_number_with_format(
                        r,
                        c,
                        value,
                        if own { &styles.number } else { &styles.zero },
                    )?;
                    if offset == 0 || !own {
                        ws.write_number_with_format(
                            r,
                            c + 1,
                            0.0,
                            if own { &styles.number } else { &styles.zero },
                        )?;
                        ws.write_number_with_format(
                            r,
                            c + 2,
                            0.0,
                            if own { &styles.number } else { &styles.zero },
                        )?;
                    } else {
                        let start = span.start.values.get(&work.key).copied().unwrap_or(0.0);
                        formula(
                            ws,
                            r,
                            c + 1,
                            format!("=AVERAGE({}{},{}{})", col(c), row + 1, col(c), r + 1),
                            (start + value) / 2.0,
                            &styles.number,
                        )?;
                        formula(
                            ws,
                            r,
                            c + 2,
                            format!("={}{}*$D{}", col(c + 1), r + 1, r + 1),
                            span.quantities.get(&work.key).copied().unwrap_or(0.0),
                            &styles.number,
                        )?;
                    }
                }
            }
            row += 2;
        }
        ws.merge_range(row, 0, row, 4, "GROUP TOTAL", &styles.total)?;
        for (i, work) in group.works.iter().enumerate() {
            let c = 7 + i as u16 * 3;
            formula(
                ws,
                row,
                c,
                format!("=SUM({}{}:{}{})", col(c), FIRST + 1, col(c), row),
                group.totals.get(&work.key).copied().unwrap_or(0.0),
                &styles.total,
            )?;
            total_refs.insert((index, work.key.clone()), (row, c));
        }
        row += 3;
        merged(
            ws,
            row,
            last,
            "MEMBER REACHES AND DESIGN REFERENCES",
            &styles.title,
            26.0,
        )?;
        row += 1;
        for (c, label) in [
            "From Ch (m)",
            "Bank",
            "Reach ID",
            "To Ch (m)",
            "Bank design",
        ]
        .iter()
        .enumerate()
        {
            ws.write_string_with_format(row, c as u16, *label, &styles.header)?;
        }
        row += 1;
        let mut members: Vec<(f64, f64, String, String, String)> = vec![];
        for span in statement
            .rows
            .iter()
            .filter(|r| r.group_index == Some(index))
        {
            if let Some(member) = members.iter_mut().rev().find(|m| {
                m.2 == span.side && m.3 == span.reach_id && (m.1 - span.from).abs() < 1e-8
            }) {
                member.1 = span.to;
            } else {
                members.push((
                    span.from,
                    span.to,
                    span.side.clone(),
                    span.reach_id.clone(),
                    span.profile_name.clone(),
                ));
            }
        }
        for (from, to, side, id, name) in members {
            ws.write_number_with_format(row, 0, from, &styles.number)?;
            ws.write_string_with_format(row, 1, &side, &styles.text)?;
            ws.write_string_with_format(row, 2, &id, &styles.text)?;
            ws.write_number_with_format(row, 3, to, &styles.number)?;
            ws.write_string_with_format(row, 4, &name, &styles.text)?;
            row += 1;
        }
        ws.set_print_area(0, 0, row, last)?;
    }
    {
        let ws = book.worksheet_from_name("Statement of Quantities")?;
        base(ws)?;
        ws.set_tab_color(Color::RGB(0x244563));
        let last = 3 + statement.groups.len() as u16;
        ws.set_column_width(0, 49)?
            .set_column_width(1, 20)?
            .set_column_width(2, 10)?;
        for c in 3..=last {
            ws.set_column_width(c, 24)?;
        }
        merged(
            ws,
            1,
            last,
            "STATEMENT OF QUANTITIES — CANAL BANKS",
            &styles.title,
            30.0,
        )?;
        merged(ws,3,last,&format!("Canal Ch 0.000–{:.3} m. {} Bank Design. Groups are divided by construction, then bank slope protection.",input.length_m,if input.mode=="manual"{"Manual"}else if input.mode=="tiered"{"Programmatic"}else{"Fixed"}),&styles.note,30.0)?;
        merged(ws,4,last,"Sand Blanket & Filters and Others use the union of applicable work columns. Their presence does not split reach sheets. Berm earthwork is included in Filling / Casing.",&styles.note,30.0)?;
        for (c, label) in ["Description of work", "Item / specification", "Unit"]
            .iter()
            .enumerate()
        {
            ws.write_string_with_format(6, c as u16, *label, &styles.header)?;
        }
        for (i, group) in statement.groups.iter().enumerate() {
            ws.write_string_with_format(6, 3 + i as u16, &group.sheet_name, &styles.header)?;
        }
        ws.write_string_with_format(6, last, "TOTAL QUANTITY", &styles.header)?;
        ws.set_row_height(6, 44)?;
        for (i, work) in statement.works.iter().enumerate() {
            let row = 7 + i as u32;
            ws.write_string_with_format(row, 0, &work.label, &styles.text)?;
            ws.write_string_with_format(row, 1, &work.code, &styles.text)?;
            ws.write_string_with_format(row, 2, &work.unit, &styles.text)?;
            for (g, group) in statement.groups.iter().enumerate() {
                if let Some((r, c)) = total_refs.get(&(g, work.key.clone())) {
                    formula(
                        ws,
                        row,
                        3 + g as u16,
                        format!("={}!{}{}", quoted(&group.sheet_name), col(*c), r + 1),
                        group.totals.get(&work.key).copied().unwrap_or(0.0),
                        &styles.number,
                    )?;
                } else {
                    ws.write_number_with_format(row, 3 + g as u16, 0.0, &styles.zero)?;
                }
            }
            if statement.groups.is_empty() {
                ws.write_number_with_format(row, last, 0.0, &styles.total)?;
            } else {
                formula(
                    ws,
                    row,
                    last,
                    format!("=SUM(D{}:{}{})", row + 1, col(last - 1), row + 1),
                    statement.totals.get(&work.key).copied().unwrap_or(0.0),
                    &styles.total,
                )?;
            }
        }
        let mut row = 9 + statement.works.len() as u32;
        if statement.groups.is_empty() {
            merged(
                ws,
                7,
                last,
                "Full cutting throughout. No bank reach sheet is required.",
                &styles.note,
                40.0,
            )?;
            ws.write_string_with_format(8, 0, "Bank formation filling", &styles.text)?;
            ws.write_string_with_format(8, 2, "m³", &styles.text)?;
            ws.write_number_with_format(8, last, 0.0, &styles.total)?;
        }
        merged(
            ws,
            row,
            last,
            "REACH SHEET DEFINITIONS",
            &styles.title,
            26.0,
        )?;
        row += 2;
        for group in &statement.groups {
            merged(
                ws,
                row,
                last,
                &format!("{}: {}", group.sheet_name, group.name),
                &styles.title,
                54.0,
            )?;
            row += 1;
            for line in &group.definition {
                merged(ws, row, last, line, &styles.note, 40.0)?;
                row += 1;
            }
            row += 1;
        }
        if !statement.materials.is_empty() {
            merged(
                ws,
                row,
                last,
                "BANK FILL MATERIAL SOURCES",
                &styles.title,
                28.0,
            )?;
            row += 1;
            for (c, label) in [
                "Zone / material source",
                "Item",
                "Share (%)",
                "Compaction / watering",
                "Quantity (m³)",
            ]
            .iter()
            .enumerate()
            {
                ws.write_string_with_format(row, c as u16, *label, &styles.header)?;
            }
            ws.set_row_height(row, 38)?;
            row += 1;
            for material in &statement.materials {
                ws.write_string_with_format(
                    row,
                    0,
                    format!("{} / {}", material.zone, material.source),
                    &styles.text,
                )?;
                ws.write_string_with_format(row, 1, &material.code, &styles.text)?;
                ws.write_number_with_format(row, 2, material.percentage, &styles.number)?;
                ws.write_string_with_format(
                    row,
                    3,
                    format!(
                        "{}% / {}",
                        material.compaction,
                        if material.watering {
                            "with water"
                        } else {
                            "without water"
                        }
                    ),
                    &styles.note,
                )?;
                let key = if material.zone == "homogeneous" {
                    "filling"
                } else {
                    material.zone.as_str()
                };
                let refs: Vec<_> = statement
                    .works
                    .iter()
                    .enumerate()
                    .filter(|(_, w)| {
                        w.key == key || material.zone == "hearting" && w.key == "cutoff_filling"
                    })
                    .map(|(i, _)| format!("{}{}", col(last), 8 + i))
                    .collect();
                formula(
                    ws,
                    row,
                    4,
                    format!("=({})*C{}/100", refs.join("+"), row + 1),
                    material.quantity,
                    &styles.number,
                )?;
                row += 1;
            }
            row += 2;
        }
        merged(ws,row,last,"Measured section cells contain saved design geometry values. Average, interval quantity, group totals and this statement are linked Excel formulas. Change the design in the app and export again to recalculate its geometry.",&styles.note,45.0)?;
        ws.set_freeze_panes(7, 3)?;
        ws.set_repeat_rows(6, 6)?;
        ws.set_print_area(0, 0, row, last)?;
    }
    if !statement.groups.is_empty() {
        write_sections(&mut book, statement, &styles)?;
    }
    book.save_to_buffer()
}

/// Native Excel XY diagrams with inspectable coordinates, one per saved bank
/// reach/work arrangement, sampled at its largest measured section.
fn write_sections(
    book: &mut Workbook,
    statement: &BankStatement,
    styles: &Styles,
) -> Result<(), XlsxError> {
    let ws = book.add_worksheet();
    ws.set_name("Bank Sections")?;
    base(ws)?;
    ws.set_column_range_width(0, 10, 12)?
        .set_column_width(0, 32)?;
    let mut exhibits: BTreeMap<
        (usize, String, String, usize),
        (&BankStatementRow, &BankMeasurement, f64),
    > = BTreeMap::new();
    for row in &statement.rows {
        if let Some(group) = row.group_index {
            for (m, ch) in [(&row.start, row.from), (&row.end, row.to)] {
                let key = (
                    group,
                    row.side.clone(),
                    row.reach_id.clone(),
                    row.design_variant,
                );
                if m.gross_fill > exhibits.get(&key).map_or(0.0, |(_, m, _)| m.gross_fill) {
                    exhibits.insert(key, (row, m, ch));
                }
            }
        }
    }
    let mut row = 1;
    let mut breaks = vec![];
    for ((group, side, id, variant), (span, m, ch)) in exhibits {
        if row > 1 {
            breaks.push(row);
        }
        let title = format!(
            "{} bank · {} · {} · Arrangement {} · Ch {:.3} m",
            side, id, span.profile_name, variant, ch
        );
        merged(ws, row, 10, &title, &styles.title, 34.0)?;
        merged(ws,row+1,10,&format!("Sheet: {}. Representative section at maximum measured bank area in this reach. Other section measurements remain in the reach schedule.",statement.groups[group].sheet_name),&styles.note,32.0)?;
        let mut chart = Chart::new(ChartType::ScatterStraight);
        chart.set_width(880).set_height(420);
        chart.title().set_name(&format!(
            "{} bank · {} · Ch {:.3} m",
            side, span.profile_name, ch
        ));
        chart
            .x_axis()
            .set_name("Offset from canal centre (m)")
            .set_num_format("0.0");
        chart.y_axis().set_name("RL (m)").set_num_format("0.00");
        let points: Vec<_> = m.shapes.iter().flat_map(|s| &s.points).collect();
        let min = points.iter().map(|p| p.rl).fold(f64::INFINITY, f64::min);
        let max = points
            .iter()
            .map(|p| p.rl)
            .fold(f64::NEG_INFINITY, f64::max);
        chart
            .y_axis()
            .set_min(min - (max - min).max(1.0) * 0.1)
            .set_max(max + (max - min).max(1.0) * 0.15);
        let xs: Vec<_> = m
            .shapes
            .iter()
            .filter(|s| s.label != "Natural ground")
            .flat_map(|s| s.points.iter().map(|p| p.offset))
            .collect();
        let xmin = xs.iter().copied().fold(f64::INFINITY, f64::min);
        let xmax = xs.iter().copied().fold(f64::NEG_INFINITY, f64::max);
        chart
            .x_axis()
            .set_min(xmin - (xmax - xmin) * 0.05)
            .set_max(xmax + (xmax - xmin) * 0.05);
        let coord_row = row + 25;
        let mut source = coord_row + 1;
        for (c, label) in ["Shape / material", "Offset (m)", "RL (m)"]
            .iter()
            .enumerate()
        {
            ws.write_string_with_format(coord_row, c as u16, *label, &styles.header)?;
        }
        for shape in &m.shapes {
            if shape.points.len() < 2 {
                continue;
            }
            let start = source;
            for point in &shape.points {
                ws.write_string_with_format(
                    source,
                    0,
                    &shape.label,
                    &styles.text.clone().set_text_wrap(),
                )?;
                if shape.label.len() > 30 {
                    ws.set_row_height(source, 32)?;
                }
                ws.write_number_with_format(source, 1, point.offset, &styles.number)?;
                ws.write_number_with_format(source, 2, point.rl, &styles.number)?;
                source += 1;
            }
            let color = match shape.label.as_str() {
                "Bank design" => 0x2682B6,
                "Natural ground" => 0x74828E,
                "Prepared level" => 0xBA8545,
                "Impervious hearting" => 0xBF7644,
                "Sand blanket" => 0x31AD8E,
                "Rock toe" => 0xC39445,
                label if label.starts_with("Open toe ditch") => 0x27A0B4,
                label
                    if label.starts_with("Slope protection")
                        || label.starts_with("Berm shelf protection") =>
                {
                    0x339A5B
                }
                _ => 0x8B68B0,
            };
            chart
                .add_series()
                .set_name(&shape.label)
                .set_categories(("Bank Sections", start, 1, source - 1, 1))
                .set_values(("Bank Sections", start, 2, source - 1, 2))
                .set_format(ChartLine::new().set_color(Color::RGB(color)).set_width(1.5));
        }
        chart.legend().set_hidden();
        ws.insert_chart(row + 3, 0, &chart)?;
        merged(ws,source+1,10,&format!("Gross bank area {:.3} m²; material replacement within bank {:.3} m². Coordinates above also supply the native section measurements.",m.gross_fill,m.deducted_fill),&styles.note,30.0)?;
        row = (source + 4).max(row + 30);
    }
    ws.set_page_breaks(&breaks)?;
    ws.set_print_area(0, 0, row, 10)?;
    Ok(())
}
