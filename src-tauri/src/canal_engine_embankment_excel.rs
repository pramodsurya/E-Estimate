//! Excel rendering only. Group membership, measurements and quantities come
//! from estimate-core::canal_engine::bank_statement, also usable by Typst.
use estimate_core::canal_engine::bank_statement::*;
use rust_xlsxwriter::{
    Chart, ChartLine, ChartType, Color, Format, FormatAlign, FormatBorder, Formula, Workbook, Worksheet,
    XlsxError,
};
use std::collections::BTreeMap;

// Only two compact title rows precede the three measurement header rows.
// Freezing explanatory notes as well can consume the entire Excel viewport.
const HEADER: u32 = 2;
const FIRST: u32 = HEADER + 3;

struct Styles {
    title: Format,
    text: Format,
    note: Format,
    header: Format,
    block: Format,
    number: Format,
    quantity: Format,
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
                .set_font_size(9)
                .set_bold()
                .set_font_color(Color::White)
                .set_background_color(Color::RGB(0x244563))
                .set_border_right(FormatBorder::Thin)
                .set_border_right_color(Color::RGB(0x647D91))
                .set_text_wrap()
                .set_align(FormatAlign::Center),
            block: text
                .clone()
                .set_font_size(9)
                .set_bold()
                .set_font_color(Color::White)
                .set_background_color(Color::RGB(0x3E657C))
                .set_text_wrap()
                .set_align(FormatAlign::Center),
            number: text
                .clone()
                .set_num_format("#,##0.000")
                .set_align(FormatAlign::Right),
            quantity: text
                .clone()
                .set_bold()
                .set_font_color(Color::RGB(0x155E57))
                .set_background_color(Color::RGB(0xE7F3F0))
                .set_num_format("#,##0.000")
                .set_border_right(FormatBorder::Thin)
                .set_border_right_color(Color::RGB(0xC8D5DC))
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
fn base(ws: &mut Worksheet) -> Result<(), XlsxError> {
    ws.set_screen_gridlines(false)
        .set_print_gridlines(false)
        .set_landscape()
        .set_paper_size(8)
        .set_zoom(90)
        .set_print_scale(85);
    ws.set_margins(0.3, 0.3, 0.4, 0.4, 0.15, 0.2);
    ws.set_footer("&L&8Canal bank quantities&R&8Page &P of &N");
    ws.set_default_row_height(20);
    Ok(())
}

fn work_heading(work: &BankWork) -> &str {
    match work.key.as_str() {
        "stripping" => "Foundation stripping",
        "filling" => "Earth filling incl. berms",
        "hearting" => "Impervious hearting",
        "casing" => "Casing incl. berms",
        "cutoff_excavation" => "Cutoff excavation",
        "cutoff_filling" => "Cutoff hearting",
        "horizontal_filter" => "Horizontal filter",
        "vertical_filter" => "Vertical / inclined filter",
        "toe_ditch" => "Open toe-ditch excavation",
        "cns_replacement" => "Lining / CNS replacement",
        _ => &work.label,
    }
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

struct ScheduleInterval<'a> {
    banks: [&'a BankStatementRow; 2],
}

#[derive(Clone, Copy, Default)]
struct ItemTerm {
    from: f64,
    to: f64,
    nos: f64,
}

impl ScheduleInterval<'_> {
    fn belongs_to(&self, group: usize) -> bool {
        self.banks.iter().any(|bank| bank.group_index == Some(group))
    }

    fn bank_term(&self, side: usize, group: usize, key: &str, initial: bool) -> ItemTerm {
        let bank = self.banks[side];
        if bank.group_index != Some(group) { return ItemTerm::default(); }
        let from = bank.start.values.get(key).copied().unwrap_or(0.0);
        let to = if initial { from } else { bank.end.values.get(key).copied().unwrap_or(0.0) };
        ItemTerm { from, to, nos: if from != 0.0 || to != 0.0 { 1.0 } else { 0.0 } }
    }

    fn item_differs(&self, group: usize, key: &str) -> bool {
        if !self.banks.iter().all(|bank| bank.group_index == Some(group)) { return false; }
        let a = self.bank_term(0, group, key, false);
        let b = self.bank_term(1, group, key, false);
        (a.from - b.from).abs() > 1e-8 || (a.to - b.to).abs() > 1e-8
    }

    fn terms(&self, group: usize, key: &str, separate: bool, initial: bool) -> [ItemTerm; 2] {
        let a = self.bank_term(0, group, key, initial);
        let b = self.bank_term(1, group, key, initial);
        if a.nos > 0.0 && b.nos > 0.0 && (a.from-b.from).abs() <= 1e-8 && (a.to-b.to).abs() <= 1e-8 {
            [ItemTerm { from: (a.from+b.from)/2.0, to: (a.to+b.to)/2.0, nos: 2.0 }, ItemTerm::default()]
        } else if separate && !initial && a.nos > 0.0 && b.nos > 0.0
            && self.banks[0].quantities.get(key) == self.banks[1].quantities.get(key) {
            // Equal interval quantities can also arise from different end
            // sections. Keep both sets visible, but count the common quantity twice.
            [ItemTerm { nos: 2.0, ..a }, ItemTerm { nos: 0.0, ..b }]
        } else if separate {
            [a, b]
        } else {
            [if a.nos > 0.0 { a } else { b }, ItemTerm::default()]
        }
    }

    fn quantity(&self, group: usize, key: &str) -> f64 {
        self.banks.iter().filter(|bank| bank.group_index == Some(group))
            .map(|bank| bank.quantities.get(key).copied().unwrap_or(0.0)).sum()
    }
}

// Keep measured intervals in full. Stretches measured elsewhere need only their
// two boundaries; a change of owning sheets starts a new reference stretch.
fn display_stations(
    schedule: &[ScheduleInterval<'_>],
    group: usize,
    statement: &BankStatement,
) -> BTreeMap<usize, Vec<String>> {
    let mut stations: BTreeMap<usize, Vec<String>> = BTreeMap::new();
    let mut start = 0;
    while start < schedule.len() {
        let interval = &schedule[start];
        if interval.belongs_to(group) {
            stations.entry(start).or_default();
            stations.entry(start + 1).or_default();
            start += 1;
            continue;
        }
        let owners = interval.banks.map(|bank| bank.group_index);
        let mut end = start + 1;
        while end < schedule.len() && schedule[end].banks.map(|bank| bank.group_index) == owners {
            end += 1;
        }
        let destination = |owner: Option<usize>| match owner {
            Some(index) => format!("See sheet {}", statement.groups[index].sheet_name),
            None => "Full cutting / no bank filling".to_string(),
        };
        let reference = if owners[0] == owners[1] {
            destination(owners[0])
        } else {
            format!("LB: {}; RB: {}", destination(owners[0]), destination(owners[1]))
        };
        let note = format!("{:.3}–{:.3} m: {reference}", interval.banks[0].from, schedule[end - 1].banks[0].to);
        stations.entry(start).or_default().push(note.clone());
        stations.entry(end).or_default().push(note);
        start = end;
    }
    stations
}

struct ItemLayout<'a> {
    work: &'a BankWork,
    first: u16,
    separate: bool,
}

fn fixed_other_work(schedule: &[ScheduleInterval<'_>], group: usize, work: &BankWork) -> bool {
    work.block == "Others" && schedule.iter().all(|interval| interval.banks.iter()
        .filter(|bank| bank.group_index == Some(group)).all(|bank|
            (bank.start.values.get(&work.key).copied().unwrap_or(0.0)
                - bank.end.values.get(&work.key).copied().unwrap_or(0.0)).abs() <= 1e-8))
}

struct FixedSpan {
    first: usize,
    end: usize,
    quantities: [f64; 2],
}

fn fixed_spans(schedule: &[ScheduleInterval<'_>], group: usize, work: &BankWork) -> Vec<FixedSpan> {
    let mut spans: Vec<FixedSpan> = vec![];
    for (i, interval) in schedule.iter().enumerate() {
        let quantities = interval.banks.map(|bank| if bank.group_index == Some(group) {
            bank.quantities.get(&work.key).copied().unwrap_or(0.0)
        } else { 0.0 });
        if quantities.iter().all(|q| *q == 0.0) { continue; }
        if let Some(span) = spans.last_mut() {
            let previous = &schedule[span.end - 1];
            let same = span.end == i && previous.banks.iter().zip(interval.banks).all(|(a,b)| {
                let owned = a.group_index == Some(group);
                owned == (b.group_index == Some(group)) && (!owned ||
                    a.reach_id == b.reach_id && a.design_variant == b.design_variant &&
                    (a.end.values.get(&work.key).copied().unwrap_or(0.0)
                        - b.start.values.get(&work.key).copied().unwrap_or(0.0)).abs() <= 1e-8)
            }) && previous.terms(group, &work.key, true, false).map(|term| term.nos)
                == interval.terms(group, &work.key, true, false).map(|term| term.nos);
            if same {
                span.end = i + 1;
                for (total, quantity) in span.quantities.iter_mut().zip(quantities) { *total += quantity; }
                continue;
            }
        }
        spans.push(FixedSpan { first: i, end: i + 1, quantities });
    }
    spans
}

impl ItemLayout<'_> {
    fn quantity_col(&self) -> u16 { self.first + if self.separate { 8 } else { 4 } }
}

pub fn generate_canal_embankment_excel_bytes(input: &BankExportInput) -> Result<Vec<u8>, String> {
    let statement = build_bank_statement(input)?;
    render(&statement).map_err(|e| e.to_string())
}

fn render(statement: &BankStatement) -> Result<Vec<u8>, XlsxError> {
    let mut book = Workbook::new();
    let styles = Styles::new();
    for group in &statement.groups {
        book.add_worksheet().set_name(&group.sheet_name)?;
    }
    let mut arrangements: BTreeMap<(String, String), usize> = BTreeMap::new();
    let mut reach_refs: BTreeMap<(String, String), String> = BTreeMap::new();
    for row in &statement.rows {
        if row.group_index.is_some() {
            let next = format!("R{:02}", reach_refs.len() + 1);
            reach_refs.entry((row.side.clone(), row.reach_id.clone())).or_insert(next);
        }
        let count = arrangements
            .entry((row.side.clone(), row.reach_id.clone()))
            .or_default();
        *count = (*count).max(row.design_variant);
    }
    // The shared engine emits exactly one left/right pair per contiguous interval.
    // Keep one row per displayed station, shared by both banks.
    let schedule: Vec<_> = statement.rows.chunks_exact(2)
        .map(|banks| ScheduleInterval { banks: [&banks[0], &banks[1]] }).collect();
    for (index, group) in statement.groups.iter().enumerate() {
        let ws = book.worksheet_from_name(&group.sheet_name)?;
        base(ws)?;
        ws.set_tab_color(Color::RGB(0x244563));
        let mut total_refs: BTreeMap<String, (u32, u16)> = BTreeMap::new();
        let (fixed, detailed): (Vec<_>, Vec<_>) = group.works.iter()
            .partition(|work| fixed_other_work(&schedule, index, work));
        let mut next_col = 5;
        let layouts: Vec<_> = detailed.into_iter().map(|work| {
            let separate = schedule.iter().any(|interval| interval.item_differs(index, &work.key));
            let layout = ItemLayout { work, first: next_col, separate };
            next_col = layout.quantity_col() + 1;
            layout
        }).collect();
        let last = next_col - 1;
        let intro_last = last.min(10);
        merged(ws, 0, intro_last, &format!("CANAL BANKS — {}", group.sheet_name),
            &styles.title.clone().set_font_color(Color::White).set_background_color(Color::RGB(0x244563)), 28.0)?;
        let end = statement.rows.iter().map(|row| row.to).fold(0.0, f64::max);
        merged(ws, 1, intro_last, &format!("Ch 0.000–{:.3} km. One row per chainage. Each item measures the interval ending here; Nos. applies to that item only.", end / 1000.0),
            &styles.note.clone().set_font_size(9).set_background_color(Color::RGB(0xEDF2F6)), 22.0)?;
        let identifiers = [
            "Chainage (m)",
            "Length (m)",
            "Ref.",
            "Interval design",
            "Remarks",
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
        ws.set_column_width(0, 13)?
            .set_column_width(1, 11)?
            .set_column_width(2, 16)?
            .set_column_width(3, 22)?
            .set_column_width(4, 26)?;
        let mut blocks: Vec<(String, u16, u16)> = vec![];
        for layout in &layouts {
            let work = layout.work;
            let c = layout.first;
            let quantity_col = layout.quantity_col();
            ws.set_column_range_width(c, quantity_col - 1, 11)?;
            ws.set_column_width(c + 3, 6)?;
            if layout.separate { ws.set_column_width(c + 7, 6)?; }
            ws.set_column_width(quantity_col, 15)?;
            if let Some(last) = blocks.last_mut() {
                if last.0 == work.block {
                    last.2 = quantity_col;
                } else {
                    blocks.push((work.block.clone(), c, quantity_col));
                }
            } else {
                blocks.push((work.block.clone(), c, quantity_col));
            }
            let label = format!(
                "{}{}",
                work_heading(work),
                if work.code.is_empty() {
                    String::new()
                } else {
                    format!("\n{}", work.code)
                }
            );
            ws.merge_range(HEADER + 1, c, HEADER + 1, quantity_col, &label, &styles.header)?;
            let mut labels = vec![];
            for part in 0..if layout.separate { 2 } else { 1 } {
                let side = if !layout.separate { "" } else if part == 0 { " LB" } else { " RB" };
                labels.extend([
                    format!("From{side}\n({})", work.section_unit),
                    format!("To{side}\n({})", work.section_unit),
                    format!("Average{side}\n({})", work.section_unit),
                    if layout.separate { format!("Nos.{side}") } else { "Nos.".into() },
                ]);
            }
            labels.push(format!("Quantity\n({})", work.unit));
            for (j, label) in labels.iter().enumerate() {
                let style = if c + j as u16 == quantity_col {
                    styles.header.clone().set_background_color(Color::RGB(0x21675F))
                } else {
                    styles.header.clone()
                };
                ws.write_string_with_format(HEADER + 2, c + j as u16, label, &style)?;
            }
        }
        for (name, a, c) in blocks {
            ws.merge_range(HEADER, a, HEADER, c, &name, &styles.block)?;
        }
        ws.set_row_height(HEADER, 18)?
            .set_row_height(HEADER + 1, 40)?
            .set_row_height(HEADER + 2, 26)?;
        ws.set_freeze_panes(FIRST, 3)?;
        ws.set_selection(FIRST, 6, FIRST, 6)?;
        ws.set_repeat_rows(HEADER, HEADER + 2)?;
        ws.set_repeat_columns(0, 4)?;
        let mut row = FIRST;
        for (station, references) in display_stations(&schedule, index, statement) {
            let initial = station == 0;
            let interval = &schedule[station.saturating_sub(1)];
            let chainage = if initial { interval.banks[0].from } else { interval.banks[0].to };
            let own_banks: Vec<_> = interval.banks.iter().filter(|bank| bank.group_index == Some(index)).collect();
            let own = !own_banks.is_empty();
            let background = if !own { 0xF1F4F6 } else if station % 2 == 0 { 0xFFFFFF } else { 0xF2F6F9 };
            let number = styles.number.clone().set_background_color(Color::RGB(background))
                .set_border_bottom(FormatBorder::Hair).set_border_bottom_color(Color::RGB(0xD7E1E8));
            let text = styles.text.clone().set_text_wrap().set_background_color(Color::RGB(background))
                .set_border_bottom(FormatBorder::Hair).set_border_bottom_color(Color::RGB(0xD7E1E8));
            let quantity = if own { styles.quantity.clone() } else { styles.zero.clone() };
            ws.write_number_with_format(row, 0, chainage, &number)?;
            if initial || !own {
                ws.write_blank(row, 1, &number)?;
            } else {
                formula(ws, row, 1, format!("=A{}-A{}", row+1, row), interval.banks[0].to-interval.banks[0].from, &number)?;
            }
            let refs: Vec<_> = own_banks.iter().map(|bank| reach_refs[&(bank.side.clone(), bank.reach_id.clone())].clone()).collect();
            ws.write_string_with_format(row, 2, refs.join(" / "), &text)?;
            let designs: Vec<_> = own_banks.iter().map(|bank| {
                let multiple = arrangements.get(&(bank.side.clone(), bank.reach_id.clone())).copied().unwrap_or(1) > 1;
                if multiple { format!("{} / arrangement {}", bank.profile_name, bank.design_variant) } else { bank.profile_name.clone() }
            }).collect();
            let design = if designs.len() == 2 && designs[0] != designs[1] {
                format!("LB: {}\nRB: {}", designs[0], designs[1])
            } else { designs.first().cloned().unwrap_or_default() };
            ws.write_string_with_format(row, 3, &design, &text)?;
            let mut remarks = references;
            if initial && own { remarks.push("Initial section; no preceding interval.".to_string()); }
            if own {
                for bank in interval.banks {
                    if bank.group_index == Some(index) { continue; }
                    let side = if bank.side == "left" { "LB" } else { "RB" };
                    if let Some(owner) = bank.group_index {
                        remarks.push(format!("{side}: See sheet {}", statement.groups[owner].sheet_name));
                    } else if own {
                        remarks.push(format!("{side}: no bank filling"));
                    }
                }
            }
            if own && station > 0 && station < schedule.len() {
                let next = &schedule[station];
                if interval.banks.iter().zip(next.banks).any(|(a,b)| a.reach_id != b.reach_id || a.group_index != b.group_index || a.design_variant != b.design_variant || a.status != b.status) {
                    remarks.push("Design / works change after this chainage.".into());
                }
            }
            let remarks = remarks.join("\n");
            ws.write_string_with_format(row, 4, &remarks, &text)?;
            let remark_lines: usize = remarks.lines().map(|line| line.chars().count().div_ceil(30).max(1)).sum();
            let design_lines: usize = design.lines().map(|line| line.chars().count().div_ceil(22).max(1)).sum();
            let height = 20.0_f64.max((remark_lines*14+4) as f64).max((design_lines*14+4) as f64);
            ws.set_row_height(row, height)?;

            for layout in &layouts {
                if !own {
                    for c in layout.first..=layout.quantity_col() {
                        ws.write_blank(row, c, &number)?;
                    }
                    continue;
                }
                let terms = interval.terms(index, &layout.work.key, layout.separate, initial);
                let mut quantity_terms = vec![];
                for (part, term) in terms.iter().take(if layout.separate { 2 } else { 1 }).enumerate() {
                    let c = layout.first + part as u16*4;
                    let area_style = if term.nos > 0.0 { &number } else { &styles.zero };
                    if initial {
                        ws.write_blank(row, c, area_style)?;
                        ws.write_blank(row, c+2, area_style)?;
                    } else {
                        ws.write_number_with_format(row, c, term.from, area_style)?;
                        formula(ws, row, c+2, format!("=AVERAGE({}{},{}{})", col(c), row+1, col(c+1), row+1), (term.from+term.to)/2.0, area_style)?;
                    }
                    ws.write_number_with_format(row, c+1, term.to, area_style)?;
                    ws.write_number_with_format(row, c+3, term.nos, &text.clone().set_num_format("0").set_align(FormatAlign::Center))?;
                    quantity_terms.push(format!("{}{}*{}{}", col(c+2), row+1, col(c+3), row+1));
                }
                if initial {
                    ws.write_blank(row, layout.quantity_col(), &quantity)?;
                } else {
                    formula(ws, row, layout.quantity_col(), format!("=({})*$B{}", quantity_terms.join("+"), row+1), interval.quantity(index, &layout.work.key), &quantity)?;
                }
            }
            row += 1;
        }
        ws.merge_range(row, 0, row, 4, "GROUP TOTAL", &styles.total)?;
        for layout in &layouts {
            let work = layout.work;
            let c = layout.quantity_col();
            formula(
                ws,
                row,
                c,
                format!("=SUM({}{}:{}{})", col(c), FIRST + 1, col(c), row),
                group.totals.get(&work.key).copied().unwrap_or(0.0),
                &styles.total,
            )?;
            total_refs.insert(work.key.clone(), (row, c));
        }
        row += 3;
        if !fixed.is_empty() {
            merged(ws, row, intro_last, "OTHER WORKS — RANGE MEASUREMENTS", &styles.title, 26.0)?;
            row += 1;
            merged(ws, row, intro_last, "Constant sections are measured once per applicable range. Quantity = section × length × Nos. Sections that vary within an interval remain in the chainage table above.", &styles.note, 32.0)?;
            row += 2;
            for work in fixed {
                let separate = schedule.iter().any(|interval| interval.item_differs(index, &work.key));
                let length_col = if separate { 7 } else { 5 };
                let quantity_col = length_col + 1;
                let title = format!("{}{}", work_heading(work), if work.code.is_empty() { String::new() } else { format!("\n{}", work.code) });
                merged(ws, row, quantity_col + 1, &title, &styles.block, 34.0)?;
                row += 1;
                let mut labels = vec!["From Ch (m)".to_string(), "To Ch (m)".into(), "Ref.".into()];
                if separate {
                    labels.extend([format!("Section LB ({})", work.section_unit), "Nos. LB".into(), format!("Section RB ({})", work.section_unit), "Nos. RB".into()]);
                } else {
                    labels.extend([format!("Section ({})", work.section_unit), "Nos.".into()]);
                }
                labels.push("Length (m)".into());
                for (c,label) in labels.iter().enumerate() { ws.write_string_with_format(row, c as u16, label, &styles.header)?; }
                ws.merge_range(row, quantity_col, row, quantity_col + 1, &format!("Quantity ({})", work.unit), &styles.header)?;
                ws.set_row_height(row, 32.0)?;
                row += 1;
                let first = row;
                for span in fixed_spans(&schedule, index, work) {
                    let interval = &schedule[span.first];
                    let from = interval.banks[0].from;
                    let to = schedule[span.end - 1].banks[0].to;
                    let length = to - from;
                    ws.write_number_with_format(row, 0, from, &styles.number)?;
                    ws.write_number_with_format(row, 1, to, &styles.number)?;
                    let refs: Vec<_> = interval.banks.iter().enumerate().filter(|(side,_)| span.quantities[*side] > 0.0)
                        .map(|(_,bank)| reach_refs[&(bank.side.clone(), bank.reach_id.clone())].clone()).collect();
                    ws.write_string_with_format(row, 2, refs.join(" / "), &styles.text)?;
                    let terms = interval.terms(index, &work.key, separate, false);
                    let total: f64 = span.quantities.iter().sum();
                    let mut quantity_terms = vec![];
                    for (part, term) in terms.iter().take(if separate { 2 } else { 1 }).enumerate() {
                        let c = 3 + part as u16 * 2;
                        // Weighted sections preserve the native quantities even
                        // with roundoff from translated geometry across a range.
                        let quantity = if term.nos == 2.0 || !separate { total } else { span.quantities[part] };
                        let section = if term.nos > 0.0 { quantity / length / term.nos } else { 0.0 };
                        if term.nos > 0.0 { ws.write_number_with_format(row, c, section, &styles.number)?; }
                        else { ws.write_blank(row, c, &styles.number)?; }
                        ws.write_number_with_format(row, c + 1, term.nos, &styles.number.clone().set_num_format("0"))?;
                        quantity_terms.push(format!("{}{}*{}{}", col(c), row+1, col(c+1), row+1));
                    }
                    formula(ws, row, length_col, format!("=B{}-A{}", row+1, row+1), length, &styles.number)?;
                    ws.merge_range(row, quantity_col, row, quantity_col + 1, "", &styles.quantity)?;
                    formula(ws, row, quantity_col, format!("=({})*{}{}", quantity_terms.join("+"), col(length_col), row+1), total, &styles.quantity)?;
                    row += 1;
                }
                ws.merge_range(row, 0, row, quantity_col - 1, "TOTAL", &styles.total)?;
                ws.merge_range(row, quantity_col, row, quantity_col + 1, "", &styles.total)?;
                formula(ws, row, quantity_col, format!("=SUM({}{}:{}{})", col(quantity_col), first+1, col(quantity_col), row),
                    group.totals.get(&work.key).copied().unwrap_or(0.0), &styles.total)?;
                total_refs.insert(work.key.clone(), (row, quantity_col));
                row += 3;
            }
        }
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
            "Bk.",
            "Ref.",
            "To Ch (m)",
            "Bank design",
        ]
        .iter()
        .enumerate()
        {
            ws.write_string_with_format(row, c as u16, *label, &styles.header)?;
        }
        ws.merge_range(row, 5, row, last, "Saved reach ID", &styles.header)?;
        ws.set_row_height(row, 30)?;
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
            ws.write_string_with_format(row, 1, if side == "left" { "LB" } else { "RB" }, &styles.text.clone().set_align(FormatAlign::Center))?;
            ws.write_string_with_format(row, 2, &reach_refs[&(side, id.clone())], &styles.text)?;
            ws.write_number_with_format(row, 3, to, &styles.number)?;
            ws.write_string_with_format(row, 4, &name, &styles.text.clone().set_text_wrap())?;
            ws.merge_range(row, 5, row, last, &id, &styles.text.clone().set_text_wrap())?;
            ws.set_row_height(row, 32)?;
            row += 1;
        }
        let materials: Vec<_> = statement
            .materials
            .iter()
            .filter_map(|material| {
                let key = if material.zone == "homogeneous" {
                    "filling"
                } else {
                    material.zone.as_str()
                };
                let keys: Vec<_> = group
                    .works
                    .iter()
                    .filter(|w| {
                        w.key == key || material.zone == "hearting" && w.key == "cutoff_filling"
                    })
                    .map(|w| w.key.as_str())
                    .collect();
                let quantity: f64 = keys
                    .iter()
                    .map(|key| group.totals.get(*key).copied().unwrap_or(0.0))
                    .sum();
                (quantity > 0.0).then_some((material, keys, quantity))
            })
            .collect();
        if !materials.is_empty() {
            row += 2;
            merged(
                ws,
                row,
                last,
                "BANK FILL MATERIAL SOURCES",
                &styles.title,
                28.0,
            )?;
            row += 1;
            ws.merge_range(row, 0, row, 1, "Zone / material source", &styles.header)?;
            for (c, label) in [
                (2, "Item"),
                (3, "Share (%)"),
                (4, "Compaction / watering"),
            ] {
                ws.write_string_with_format(row, c, label, &styles.header)?;
            }
            ws.merge_range(row, 5, row, 7, "Quantity (m³)", &styles.header)?;
            ws.set_row_height(row, 38)?;
            row += 1;
            for (material, keys, quantity) in materials {
                ws.merge_range(
                    row,
                    0,
                    row,
                    1,
                    &format!("{} / {}", material.zone, material.source),
                    &styles.text.clone().set_text_wrap(),
                )?;
                ws.set_row_height(row, 32)?;
                ws.write_string_with_format(row, 2, &material.code, &styles.text)?;
                ws.write_number_with_format(row, 3, material.percentage, &styles.number)?;
                ws.write_string_with_format(
                    row,
                    4,
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
                let refs: Vec<_> = keys
                    .iter()
                    .map(|key| {
                        let (r, c) = total_refs[*key];
                        format!("${}${}", col(c), r + 1)
                    })
                    .collect();
                ws.merge_range(row, 5, row, 7, "", &styles.number)?;
                formula(
                    ws,
                    row,
                    5,
                    format!("=({})*D{}/100", refs.join("+"), row + 1),
                    quantity * material.percentage / 100.0,
                    &styles.number,
                )?;
                row += 1;
            }
            row += 2;
        }
        row += 2;
        merged(ws, row, intro_last, "GROUP DEFINITION AND MEASUREMENT NOTES", &styles.title.clone().set_font_size(11), 26.0)?;
        row += 1;
        for line in group.definition.iter().map(String::as_str).chain([
            "Each displayed chainage appears once. Measured rows cover the interval ending there; their From and To sections retain the correct geometry on each side of a design or work boundary. Stretches measured on other sheets, or with no bank filling, show only their boundary chainages and range references. Their measurement cells are blank.",
            "Nos. belongs to each item. Equal bank quantities use Nos. = 2 in the first set and zero in the second. If their end sections differ, both sets remain visible. Unequal quantities use separate LB/RB figures with Nos. = 1 each. An absent item has Nos. = 0. Quantity = interval length × sum of (average section × Nos.).",
            "A separate LB/RB set is included only for items that differ somewhere in this group. Equal values on other rows still use Nos. = 2 once, with zero in the second set. Grey boundary rows identify excluded ranges and contribute no quantity. A measured boundary row can also mark the start of an excluded range. Short references map to saved reach IDs above.",
            "Other works with constant end sections are listed by applicable range below the chainage table, with their own Nos. and totals. Changes in section, saved reach, arrangement or applicability split those ranges. Other works whose section changes within an interval retain the full section-by-section calculation above.",
            "Bank filling includes berms and refill of stripping beneath the banks and bed where the bed is in filling or at natural-ground level. Zoned refill follows the hearting core geometry, with casing in the remaining area. Replacement materials are deducted within the measured fill. When either internal filter is measured, both filter columns are retained.",
            "Section cells contain saved design measurements. Average, quantity, totals and material allocations are linked Excel formulas. Change geometry in the app and export again to update section measurements.",
        ]) {
            let height = (line.chars().count().div_ceil(110).max(1) * 14 + 8) as f64;
            merged(ws, row, intro_last, line, &styles.note.clone().set_font_size(9), height)?;
            row += 1;
        }
        ws.set_print_area(0, 0, row, last)?;
    }
    if statement.groups.is_empty() {
        let ws = book.add_worksheet().set_name("Statement of Quantities")?;
        base(ws)?;
        ws.set_column_width(0, 49)?
            .set_column_width(1, 20)?
            .set_column_width(2, 10)?
            .set_column_width(3, 24)?;
        merged(ws,1,3,"STATEMENT OF QUANTITIES — CANAL BANKS",&styles.title,30.0)?;
        merged(ws,3,3,"Full cutting throughout. No bank reach sheet is required.",&styles.note,40.0)?;
        ws.write_string_with_format(5, 0, "Bank formation filling", &styles.text)?;
        ws.write_string_with_format(5, 2, "m³", &styles.text)?;
        ws.write_number_with_format(5, 3, 0.0, &styles.total)?;
        ws.set_print_area(0, 0, 5, 3)?;
    } else {
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
