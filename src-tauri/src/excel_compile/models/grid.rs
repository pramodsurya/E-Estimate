use serde::Deserialize;

#[derive(Debug, Deserialize, Clone, Default)]
pub struct GridFontPayload {
    #[serde(default)]
    pub bold: Option<bool>,
    #[serde(default)]
    pub italic: Option<bool>,
    #[serde(default)]
    pub underline: Option<bool>,
    #[serde(default)]
    pub strike: Option<bool>,
    #[serde(default)]
    pub size: Option<f64>,
    #[serde(default, alias = "fontName")]
    pub font_name: Option<String>,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub bg: Option<String>,
    #[serde(default)]
    pub align: Option<String>,
    #[serde(default)]
    pub wrap: Option<bool>,
}

#[derive(Debug, Deserialize, Clone, Default)]
pub struct GridRunPayload {
    #[serde(default)]
    pub text: String,
    #[serde(default)]
    pub style: GridFontPayload,
}

#[derive(Debug, Deserialize, Clone, Default)]
pub struct GridBorderSidePayload {
    #[serde(default)]
    pub style: Option<String>,
    #[serde(default)]
    pub color: Option<String>,
}

#[derive(Debug, Deserialize, Clone, Default)]
pub struct GridBorderPayload {
    #[serde(default)]
    pub top: Option<GridBorderSidePayload>,
    #[serde(default)]
    pub left: Option<GridBorderSidePayload>,
    #[serde(default)]
    pub bottom: Option<GridBorderSidePayload>,
    #[serde(default)]
    pub right: Option<GridBorderSidePayload>,
}

#[derive(Debug, Deserialize, Clone, Default)]
pub struct GridCellPayload {
    #[serde(default)]
    pub r: u32,
    #[serde(default)]
    pub c: u32,
    #[serde(default)]
    pub value: Option<serde_json::Value>,
    #[serde(default)]
    pub formula: Option<String>,
    #[serde(default, alias = "numFmt")]
    pub num_fmt: Option<String>,
    #[serde(default)]
    pub style: GridFontPayload,
    #[serde(default)]
    pub runs: Vec<GridRunPayload>,
    #[serde(default)]
    pub border: Option<GridBorderPayload>,
}

#[derive(Debug, Deserialize, Clone, Default)]
pub struct GridMergePayload {
    #[serde(default)]
    pub r1: u32,
    #[serde(default)]
    pub c1: u32,
    #[serde(default)]
    pub r2: u32,
    #[serde(default)]
    pub c2: u32,
}

#[derive(Debug, Deserialize, Clone, Default)]
pub struct GridImagePayload {
    #[serde(default)]
    pub r: u32,
    #[serde(default)]
    pub c: u32,
    #[serde(default, alias = "dataBase64")]
    pub data: String,
    #[serde(default)]
    pub mime: String,
    #[serde(default, alias = "scaleW")]
    pub scale_w: f64,
    #[serde(default, alias = "scaleH")]
    pub scale_h: f64,
}

#[derive(Debug, Deserialize, Clone, Default)]
pub struct GridMarginsPayload {
    #[serde(default)]
    pub top: f64,
    #[serde(default)]
    pub right: f64,
    #[serde(default)]
    pub bottom: f64,
    #[serde(default)]
    pub left: f64,
}

#[derive(Debug, Deserialize, Clone, Default)]
pub struct GridPageSetupPayload {
    #[serde(default, alias = "paperSize")]
    pub paper_size: String,
    #[serde(default, alias = "marginsMm")]
    pub margins_mm: Option<GridMarginsPayload>,
}

/// Effective Print Studio settings for a complete Excel worksheet. The
/// project request may override these by worksheet name.
#[derive(Debug, Deserialize, Clone, Default)]
pub struct ExcelPrintSettingsPayload {
    #[serde(default, alias = "pageSize")]
    pub page_size: String,
    #[serde(default)]
    pub orientation: String,
    #[serde(default, alias = "marginsMm")]
    pub margins_mm: Option<GridMarginsPayload>,
    #[serde(default, alias = "fontName")]
    pub font_name: String,
    #[serde(default, alias = "fontSizePt")]
    pub font_size_pt: Option<f64>,
}

#[derive(Debug, Deserialize, Clone, Default)]
pub struct DetailGridPayload {
    #[serde(default)]
    pub cells: Vec<GridCellPayload>,
    #[serde(default)]
    pub merges: Vec<GridMergePayload>,
    #[serde(default, alias = "colWidthsChars")]
    pub col_widths: Vec<f64>,
    #[serde(default, alias = "rowHeightsPt")]
    pub row_heights: Vec<Option<f64>>,
    #[serde(default)]
    pub images: Vec<GridImagePayload>,
    /// 0-based grid rows after which Excel inserts a horizontal page break.
    #[serde(default, alias = "rowBreaks")]
    pub row_breaks: Vec<u32>,
    #[serde(default, alias = "pageSetup")]
    pub page_setup: Option<GridPageSetupPayload>,
}
