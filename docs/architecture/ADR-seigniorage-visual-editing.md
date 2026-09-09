# Architecture Decision Record (ADR): Seigniorage Visual Editing & Print Studio Integration

**Date**: September 2026  
**Context**: E-Estimate Construction Estimation Software — Seigniorage Statement Module  
**Status**: Approved & Ready for Implementation  

---

## 1. Background & Context

The E-Estimate software calculates statutory Seigniorage charges, cess, DMFT (30%), SMFT (2%), and permit fees for construction materials (gravel, sand, stone, earth, etc.).

For printing and official reports, E-Estimate uses a **Typst**-based engine (Print Studio) that compiles `.typ` markup to PDF via `@myriaddreamin/typst-ts-node-compiler`.

The goal is to allow engineers to:
1. Customize the print wording (item descriptions, document headings, notes) without touching code.
2. Keep all calculations (quantities, rates, percentages, grand totals) synchronized and mathematically accurate.
3. Allow estimators to copy the Typst code, ask an external AI (like ChatGPT or Claude) to restyle it, and paste it back without losing descriptions or breaking when new items are added to the estimate.

---

## 2. Post-Mortem of Prior Approaches & Investigation Findings

### A. The `codemirror-visual-markup` Hallucination
* **What happened**: A previous recommendation suggested using `codemirror-visual-markup` to turn Typst code into a visual WYSIWYG editor inside CodeMirror.
* **The Reality**: Deep investigation of the open-source repository confirmed that `codemirror-visual-markup` was built by TeXlyre specifically for **LaTeX** syntax (`\begin{table}`, `\textbf`, `\section`), **not Typst**. It has zero parser or support for Typst's `#table`, `#grid`, or `#let` variables.

### B. Why Typst WYSIWYG Editors on GitHub Do Not Work Here
* A search across GitHub and the official Typst forums (`typst.app`, `tyx`, `penwright`, `moraya`, `tylina`, `ortic/typst-wysiwyg`) revealed that **no generic visual editor exists for dynamic Typst code with runtime variables**.
* Open-source Typst visual editors only support static academic text. When fed dynamic variables (`#EE_SUMMARY.grand_total` or runtime inputs), they either crash or erase the variables.

### C. The `#ee-group-table` Macro Trap
* To keep rows dynamic while keeping descriptions in the file, the previous implementation created an app-owned macro:
  ```typst
  #ee-group-table(
    EE.groups,
    headers: (...),
    descriptions: (([Item 1], [Item 2]), ([Item 3]), ...)
  )
  ```
* **Why it failed**:
  1. It generated an unreadable wall of nested parentheses and brackets in the source code.
  2. The custom CodeMirror widget (`EeTableWidget`) had `contentEditable = 'false'` hardcoded on description cells and pulled text from background JSON, making descriptions completely uneditable.
  3. The widget had no decorators for `#grid` or `#table` (Statement Total), leaving raw code exposed right beneath the table.

### D. Why Literal Hardcoded Rows in Typst (Solution A) Is a Trap
* If every row is hardcoded into the Typst template (`[1], [Custom Stone], [#EE_R1_QTY]`):
  * An estimator copies the template to ChatGPT to get a fancy custom layout.
  * Next week, the estimator adds Item #7 in E-Estimate.
  * **Item #7 will NOT appear in the document** because ChatGPT's pasted code only has rows 1 to 6.
  * If the software overwrites the file, it wipes out the user's custom design.

---

## 3. The Approved Architecture

### Core Principle: Separation of Content from Design
* **Content (Wording & Text)** is managed visually on the **Seigniorage Dashboard** where the engineer works.
* **Design (Layout, Fonts, Borders)** is managed by the **Typst template** in Print Studio.

---

### Component 1: Dedicated Navigation on Material Pages
* When viewing a specific material filter (e.g. `Sand`, `Gravel`, `Stone`):
  * A prominent button will be displayed at the top:
    `[ ← Back to All Materials (Statement Dashboard) ]`
  * This allows the user to immediately return to the complete statement view that represents the printed document.

---

### Component 2: The Seigniorage Dashboard as the Visual Source of Truth
On the "All Materials (Statement)" view, the dashboard displays the exact document that will be printed:

1. **Document Title**: `SEIGNIORAGE STATEMENT` with an inline edit pencil `[✏️]`.
2. **Subtitle**: `Standard Schedule of Rates: 2024-25` with an inline edit pencil `[✏️]`.
3. **Summary Metric Cards**: 5-column metric bar showing Seigniorage, DMFT 30%, SMFT 2%, Permit fee, and Grand Total.
4. **Statement Table with Editable Descriptions**:
   * Displays the exact print description (e.g. `IRR-DAW-5-3 — Morram / Gravel & Ordinary Earth`).
   * Next to each description: an **Edit pencil `[✏️]`** that allows inline customization of the wording (e.g. `"Casing embankment using approved morram"`).
   * A **Reset button `[↺]`** to restore the default SOR description anytime.
5. **Statement Footer / Permit Basis**: `Permit fee basis: G.O.Ms.No.21, dt. 31.03.2022...` with an edit pencil `[✏️]`.

---

### Component 3: Project Data Persistence (`seignioragePrintOverrides`)
Custom wording is saved directly to the active project object in the store:
```ts
export interface SeignioragePrintOverrides {
  title?: string
  year?: string
  permitBasis?: string
  rowDescriptions?: Record<string, string> // Keyed by row.id
}
```

---

### Component 4: Dynamic Runtime Injection into Standard Typst Variables
When compiling Typst (`buildSeigniorageRenderData`):
1. For every row, if `project.seignioragePrintOverrides?.rowDescriptions?.[row.id]` exists, it supplies that custom text to `#row.description`. Otherwise, it uses the default description.
2. In the Typst template, standard native Typst loop syntax is used:
   ```typst
   #let EE = json(bytes(sys.inputs.at("ee-data")))

   #table(
     columns: (30pt, 1fr, 60pt, 60pt, 50pt, 70pt, 60pt, 60pt, 60pt),
     table.header([*Sl*], [*Description*], [*Total Qty*], [*Seig Qty*], [*Rate*], [*Seigniorage*], [*DMFT 30%*], [*SMFT 2%*], [*Permit fee*]),
     ..for row in EE.rows {
       (
         [#row.sl],
         [#row.description],
         [#row.total_qty],
         [#row.seigniorage_qty],
         [#row.rate],
         [#row.seigniorage],
         [#row.dmft],
         [#row.smft],
         [#row.permit_fee],
       )
     }
   )
   ```

---

### 4. Key Benefits of this Architecture

1. **Zero Template Breakage**:
   The user can copy the Typst code, give it to any AI (ChatGPT/Claude), ask for an Overleaf-style modern design, and paste it back. Custom descriptions and live numbers continue to render perfectly inside the new design.
2. **Zero Row-Count Inconsistency**:
   If a new item is added in E-Estimate next week, it appears on the dashboard and automatically loops into the printed table.
3. **No Brittle CodeMirror Widgets**:
   No nested tuple hacks (`descriptions: (([..]), ...)`), no synthetic `EE_GROUP_TABLE_PRELUDE`, and no failed text syncs.
4. **Immediate WYSIWYG Feedback**:
   Editing on the dashboard gives instant feedback, and opening "Print Preview" or "Print Studio" immediately renders the PDF with the exact edited text.
