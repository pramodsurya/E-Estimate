use super::super::models::ExcelCompileRequest;
use rust_xlsxwriter::{Format, FormatAlign, FormatBorder, Worksheet, XlsxError};

/// DATA PDF's every-page mode maps to an Excel print footer. Its end-of-subject
/// mode instead appends visible sign-off rows to the last DATA worksheet.
pub(super) fn apply_data_signature(
    ws: &mut Worksheet,
    row: &mut u32,
    req: &ExcelCompileRequest,
    last_data_sheet: bool,
    first_col: u16,
    last_col: u16,
) -> Result<(), XlsxError> {
    let Some(settings) = req.data_signature.as_ref() else { return Ok(()); };
    let signatures: Vec<_> = settings.rows.iter()
        .filter(|signature| !signature.designation.trim().is_empty() || !signature.office.trim().is_empty())
        .collect();
    if signatures.is_empty() { return Ok(()); }

    if settings.placement == "every_page" {
        let text = signatures.iter().map(|signature| {
            let designation = signature.designation.trim();
            let office = signature.office.trim();
            if office.is_empty() { designation.to_string() }
            else { format!("{designation} - {office}") }
        }).collect::<Vec<_>>().join("  |  ").replace('&', "&&");
        let footer = format!("&C{text}\n&RPage &P of &N");
        if footer.chars().count() > 255 {
            return Err(XlsxError::CustomError(
                "DATA signatures are too long for Excel's every-page footer; shorten them or use End of this subject".to_string()
            ));
        }
        ws.set_footer(footer);
        return Ok(());
    }
    if !last_data_sheet { return Ok(()); }

    let font = Format::new()
        .set_font_name("Trebuchet MS")
        .set_font_size(9.0)
        .set_bold()
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter)
        .set_text_wrap()
        .set_border_top(FormatBorder::Thin);
    let width = (last_col - first_col + 1) as usize;
    let per_row = width.min(3);
    *row += 2;
    for group in signatures.chunks(per_row) {
        ws.set_row_height(*row, 38.0)?;
        for (index, signature) in group.iter().enumerate() {
            let c1 = first_col + (index * width / group.len()) as u16;
            let c2 = first_col + (((index + 1) * width / group.len()) - 1) as u16;
            let text = [signature.designation.trim(), signature.office.trim()]
                .into_iter().filter(|text| !text.is_empty()).collect::<Vec<_>>().join("\n");
            if c1 == c2 { ws.write_string_with_format(*row, c1, &text, &font)?; }
            else { ws.merge_range(*row, c1, *row, c2, &text, &font)?; }
        }
        *row += 2;
    }
    Ok(())
}
