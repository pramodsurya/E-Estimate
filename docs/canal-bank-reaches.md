# Shared bank reaches

Bank Design owns the chainage assignments for bank profiles. Each bracket box
contains its reaches, their lengths, editable From/To chainages,
and expandable investigation intervals. The tier boxes use three columns.
Level, unassigned and missing level ranges have separate boxes; cutting reaches
are retained in the shared partition but hidden from Bank Design.
Ranges display as **From Ch Km 0.000 → To Ch Km 3.025**, with a maximum of
three decimal places in kilometres. Lengths use whole metres consistent with
those displayed endpoints. Programmatic edits select existing chainages from
Soil Strata or Sections; manual reaches accept From/To chainages in whole metres.

Programmatic mode derives the initial partition from bank-top RL minus Soil &
Rock Strata Top RL. Chainages entered in either Soil Strata or Sections are
available as reach boundaries. Geological Top RL takes priority; a populated
survey supplies bank ground where Top RL is absent. Each interval belongs to
its starting chainage's tier, and adjoining intervals in that tier form one
reach. A change starts at the next entered station; no threshold crossing
creates an invented chainage. Missing levels remain explicit. Older saved
interpolated boundaries move to the next entered station on load and resolution.
Each bracket box has an Edit heights button. Inputs keep a local draft until
Save heights applies both limits and recalculates once; Cancel discards the draft.
Typing does not update the project or rerender the bank calculations. The selected
Bund Design card uses the same explicit editor. Adjacent brackets share the same
boundary; the upper limit belongs to the following tier. Moving a limit pushes
neighbours if necessary, including added tiers. The first tier starts at zero
and the last remains unbounded. Height limit edits, added tiers and removed
tiers recalculate the automatic reaches and replace saved reach edits.

Editing saves the complete assignment partition. Extending a reach trims or
consumes adjoining bund reaches so the assignments stay exclusive. Shrinking
a shared endpoint extends its neighbour. Reversed ranges and ranges outside
the canal length are rejected. Programmatic bund assignments allow partial
cutting when some measured span within the reach has positive bank height.
Entered interval heights are interpolated to check eligibility without creating
new chainage boundaries. Pure cutting and reaches with no positive height are
rejected; missing levels must be supplied. Errors direct users to Soil Strata
Top RL or Sections Ground RL. Accepted mixed reaches retain their full edited
range through save/load and in every bank chapter. If RL changes make an entire
reach pure cutting, it loses its bund assignment. Physical ground still governs
the actual bank geometry and quantities. Each positive unassigned reach offers
a selector for any configured bund tier.

Manual Reach Design starts with no reaches. The user creates ranges such as
0–2300 m and 3000–6000 m, each with its own independent bund design. Reach cards
select the shared Bund Design editor, which is also available during creation
and editing. Crest width, slopes, berms and zoning belong to the selected reach.
There are no Low/Medium/High groups or level-status cards. Overlapping ranges
are rejected; gaps have no assigned bank design. Older shared manual profiles
become independent copies per reach. Programmatic profiles and manual designs
are stored separately, so switching modes retains both.
The existing fixed-slope/manual-berm design remains available for old projects.

Every outer-bank berm has a Clearance input, defaulting to 2 m in both
programmatic and manual designs, including older saved profiles. The whole
shelf must remain at least that far vertically above natural ground, including
surveyed peaks between its ends. A shelf that fails clearance is omitted and
the preceding slope continues; later shelves keep their scheduled elevations.
Each berm can use its own clearance, including zero. Section previews, bank
quantities, toe batters and the native embankment calculation follow this rule;
stripping depth does not count toward clearance. Road platforms continue to
follow their explicit Roads & Access schedule.

Bank Material Sourcing uses Edit allocations, Save allocations and Cancel.
Source additions/removals, percentages, compaction and watering stay in the
editor's local draft. Save commits all material zones in one project update;
Cancel restores the saved allocations. Draft edits reuse saved geometry totals
without rerendering the bank chapter or recalculating project quantities.
Material source shares are user-controlled in every bank mode, including legacy
fixed-slope designs. The informational board shows Canal Excavation Quantity
and Material Quantity Needed. Allocations can exceed excavation quantity;
availability does not cap shares, automatically choose a source or rebalance
borrow material. Generated estimate items use the saved percentages.

Linked banks share the left-bank assignments and profile settings. Unlinked
banks use their own lists. Deleted profiles leave their saved ranges unassigned
until the user selects a replacement profile. Surveys still define the actual
ground intersection and physical fill/cutting geometry.

Geometry, hearting, foundations, toe works and bank protection resolve profiles
through the same chainage assignment. Drainage can use these height groups or
its own manual work ranges. Area integration inserts one-sided samples at reach
boundaries, so a profile transition is not averaged across the adjoining reach.
Unassigned bank-fill reaches are excluded from billable bank zones until a
profile is supplied. Saved assignments persist through project migration.

Bank Protection follows Bank Design's active mode. Programmatic mode shows one
card per design type (Low/Medium/High and added tiers), with every assigned
From/To range and the combined length. Saving slope and berm protection applies
once to all reaches of that design, including separated ranges. New or edited
ranges using the same design inherit its settings. Older reach settings supply
the initial group selection until the design is saved. Manual mode keeps
protection on each existing Bank Design reach. Linked banks share the choices;
independent banks retain their own settings. Mode switching and save/load
preserve the programmatic profiles and manual reach choices separately.

The selected design/reach shows actual cross-sections at its entered stations
and boundaries. All programmatic ranges are available in the station selector.
At a shared endpoint the selected bank uses the selected reach's profile;
independent opposite-bank profiles still resolve at the actual chainage.
Edit protection keeps local slope/berm drafts and previews them in the section;
Save applies both once and Cancel restores the saved diagram and settings.
Berm treatment covers horizontal shelves below the crest.
Quantities and generated estimate items retain the exact individual ranges.

Bund Drainage & Filters also follows Bank Design's mode and assignments.
There is no independent mode selector or separate Add/Edit/Remove reach flow.
Programmatic cards apply one blanket/filter selection to all assigned ranges
of a design type. Manual cards list the exact saved Bank Design reaches; their
chainages are edited in Bank Design. Saved work selections follow those reach
identities when boundaries move. Gaps receive no works. Older manual drainage
settings can be recovered by a matching reach identity or exact range.

Blanket, horizontal/chimney filter and subsurface toe-filter edits remain local
until Save. The cross-section previews enabled works and dimension edits;
quantities retain their saved values while typing. Cancel restores the saved
diagram and settings. Both modes' settings survive
switching and project save/load. Drainage never changes the bank geometry.
Rock Toe & Surface Drainage retains its separate chapter mode and work ranges.

On a section without canal cutting, the prepared-level reference continues
across both banks and beneath the canal bed as one line. Stripping and refill
include the bed wherever its design level is at or above natural ground.
Survey/design intersections split mixed sections, so bed areas in cutting
receive no extra stripping or refill. Each calculation side owns its half of
the bed preparation, avoiding duplicate quantities. Fill
hatching uses the Rust measurement polygons, including the refill between
natural ground and prepared level beneath the banks and eligible bed areas. Zoned sections
overlay the actual impervious core on that fill; the remaining filled area is
casing. Core overlap within the added bed refill follows the existing separate/
continuous core rule. Bank footprint widths used for filters and blankets remain
separate from the wider preparation footprint.
Section drawings show enabled sand blankets, horizontal and
chimney filters, graded/geotextile toe filters, rock toes with their filters,
open ditches with their selected lining, and slope/berm protection. Their visible
legend identifies the bank and SSR item. Toe shapes resolve the same saved
reach treatments and actual outer batter as the measured quantities; disabled
works and full-cutting banks do not produce overlays.

Automatic sand blankets also continue beneath the bed on homogeneous sections
without canal cutting when both bank blankets are enabled. Each bank owns half
of the bed extension, so the full bed width is measured once. Matching materials
and thicknesses draw as one polygon. Explicit manual blanket widths, cutting
gaps and impervious core/trench boundaries retain their limits. Drawing and
payable width/volume use the same blanket sections; the earth-fill deduction
counts only the exact material area inside the measured earth envelope.

Area integration splits at both geometry and drainage boundaries; one-sided
samples prevent quantities bleeding into gaps or adjoining work ranges.
Bank-fill deductions, section diagrams and generated estimate items resolve
the active drainage mode. Fixed blankets (5-4) and variable blankets (5-5) bill
separately by their square-metre/cubic-metre units. Enabled work quantities use
their actual drawn geometry, including a blanket's permitted bed extension.

Rock Toe & Surface Drainage has the same Automatic/Manual choice, saved in
`bankToeDrainage` independently of internal blankets and filters. Automatic
shows three height tiers (or the extra configured brackets); Manual creates
independent From–To work reaches with rock toe, graded rock-toe filter, open
ditch and ditch-lining choices. The whole reach and its work options save in
one update. Dimension edits stay local; quantities remain saved until Save.
Cancel and invalid reach saves never change the project. Linked banks share
the work ranges, while independent banks retain separate settings. Inactive
automatic/manual settings survive switching and project save/load.

Integration splits at both chapters' work boundaries as well as bank geometry
boundaries. Rock-toe quantities use each section's actual outer batter, even
when a manual work reach crosses different geometry profiles. Ditch excavation,
rubble protection and concrete lining use the exact selected work spans and
generate the corresponding estimate items. Internal drainage gaps and toe-work
gaps are resolved separately; neither chapter overwrites the other's fields.

Validation: `scripts/test-canal-bank-reaches.cjs` covers differing survey and
geological levels, edited boundaries, exact toe-filter/protection reach lengths,
independent manual banks, height changes, unassigned billing, independent
drainage modes, arbitrary work boundaries/gaps, mixed blanket units and save/load.

## Bank Design editing and responsiveness

Selecting a height tier, a reach or a bank side changes only the selected form.
The heading button and the non-control area of each height card select its
design. Bank Design settings remain local drafts until **Save & Calculate**
applies them in one project update, refreshes quick-entry sections and updates
the estimate items. **Cancel changes** discards the draft. Selecting another
tier retains the pending edits. Manual reach forms must finish or cancel their
own draft before the chapter can save. Export is disabled while changes remain
unsaved. Diagrams, measured quantities and the reach abstract display the saved
design until the chapter is saved; another Populate Design click is not needed.

The shared Rust section engine runs as WebAssembly on the renderer thread.
Typing and switching tiers must not invoke it or rebuild the preview. Repeated
interval measurements check the saved-input cache before preparing geometry;
the cache detects design, survey and work-boundary changes, including in-place
edits. Geometry preparation reuses the same road arrangement across intervals
so reach-resolution caches remain useful. Unrelated parent renders retain the
migrated canal object instead of invalidating all calculations.

Validation: `scripts/test-canal-section-workflow.cjs` checks tier selection,
immediate zoning feedback, draft retention/cancel, one atomic save, unchanged
preview geometry while editing, export gating and retry after a failed save.
`scripts/test-canal-bank-export.cjs` checks early cache hits and invalidation.

## Bank Design Excel export

The section engine in `estimate-core::canal_engine::bank_statement` owns both
diagram geometry and measured quantities. Its result contains the bank profile,
fill/cut polygons, every enabled work polygon or developed protection segment,
and the corresponding measured section values. The screen runs that same Rust
code through a small WebAssembly module; native Excel calls it directly. The
renderer adapter supplies saved reach identities, specifications and survey /
design / core coordinates. It supplies no independent measured quantities.

Section diagrams, dimensions, drainage/protection summaries, net bank filling,
generated estimate items and the Bank Design reach abstract consume these
shared results. The old scalar-ground Rust calculator no longer feeds the bank
screen. Rust also owns interval integration and the export's reporting model;
Excel renders that model and its arithmetic formula links. A future Typst
writer can consume the same result.

There is one calculation sheet per reach group, followed by **Bank Sections**
for diagrams. There is no separate **Statement of Quantities** overview. A
canal with one reach group therefore exports exactly two worksheets. Reporting
sheets are divided in order
by homogeneous/zoned construction, then slope protection provided/not provided.
Different tier names, manual profiles, berms, source choices and disjoint ranges
do not make another group. Sand Blanket & Filters is one optional block; Others
contains toe filters, rock toe, its graded filter, open ditch, ditch protection
and horizontal berm protection. Omit all-empty optional works. An Others item
whose From and To measurements match within every applicable interval is moved
out of the chainage columns into **OTHER WORKS — RANGE MEASUREMENTS** on the same
sheet. Adjacent intervals combine only while their section, bank applicability,
saved reach and arrangement remain the same. Zero-only ranges are omitted.
Each range has its section, length, item Nos. and formula quantity; separate
bank figures share one row when needed. Each item retains its own total.
Others items whose measurements vary within an interval keep their detailed
chainage columns. The main table also retains the other work blocks. When either
internal filter is measured, retain both horizontal and vertical filter columns.
Different blanket/lining units or protection item codes retain separate item
calculations within the same sheet.

Constant section does not mean constant total quantity: the total still depends
on applicable length and Nos. Berm protection uses actual included shelf widths,
which can change when a shelf is omitted by height/clearance. Rock-toe area is
`height × crest width + height² × (inner slope + actual outer slope) / 2`, so
the last outer bank batter can change it. Open toe ditches use an entered
**invert RL at the first section**, with that section's chainage shown, and a
**longitudinal slope of 1 in N**. Invert RL at chainage Ch is
`first invert RL − (Ch − first chainage) / N`; the positive denominator makes
the ditch fall with increasing chainage. The first chainage is the earliest
applicable tier range or the entered manual reach start, interpolating a survey
section there when necessary. One grade continues across all ranges of a tier;
gaps do not restart it. Each independent bank can have its own grade.

Depth is calculated from the natural-ground RL at the bank-side ditch edge to
the graded invert. It is no longer an editable input. The section area is
`depth × bottom width + depth² × (bank-side slope + land-side slope) / 2`.
An invert at or above ground contributes no excavation or ditch lining there.
The schematic uses the first section's calculated depth and labels natural
ground. Excavation and rubble/concrete protection follow each section's actual
depth; the mean end-area/length rules and Excel formulas remain shared with
the diagram. Variable ditch measurements remain in the chainage table.

Old saved depth-only ditches retain their quantities until edited. Their first
invert level is prefilled from the old depth, and saving requires a finite
invert RL and positive slope. New saves store the reference chainage, invert
RL and slope and clear the old depth parameter. Missing/invalid grades prevent
saving or strict export; negative invert RLs are valid. Editing these controls
keeps project quantities unchanged until Save, and Cancel restores saved values.

Each sheet names and defines its group and records member reach IDs, sides,
design names and From–To chainages. Both banks are assigned independently.
The opening view has two compact title/context rows and three header rows,
followed immediately by the calculations at Excel row 6. Only these five rows
and the first three identifier columns are frozen; their combined height is
134 points so the frozen pane cannot consume an ordinary worksheet viewport.
The workbook opens at 90% zoom. Displayed chainages appear
exactly once in strictly increasing order. Every interval measured on the
current sheet retains its start and end chainages. A measured row covers the interval ending at its chainage;
the initial station has no preceding length or quantity. There are no separate
bank rows or repeated From/To station rows.

**Nos.** (No. of Times) is inside each item, not a global identifier column.
An item normally has From section, To section, Average, Nos. and Quantity.
Only items that differ between banks somewhere in a group expand to show LB
and RB section/average/Nos. sets side by side on the same chainage row. Equal
bank quantities use Nos. = 2 in the first set and zero in the second; differing
end sections remain visible even when their quantities are equal. Unequal
quantities use Nos. = 1 for each bank. Absent works use Nos. = 0. One item may
therefore use 2 while another item on the same row uses 1/1 or 1/0. Each quantity
formula is interval length × sum of (average section × item Nos.).

From and To section cells are direct one-sided measurements for that interval.
They prevent averaging across a design/work change or a cutting gap while
keeping the chainage list unique. A boundary row notes changes after it.
Chainage rows alternate backgrounds and quantity columns are highlighted.
Consecutive intervals belonging entirely to another sheet, or with no bank
filling, collapse to their start and end chainages. Both boundaries show the
range and owning sheet in Remarks, for example `30.000–400.000 m: See sheet
Zoned Unprotected`. Their measurement cells are blank. A boundary already
measuring the preceding interval keeps its quantities and gains the range
reference. Changes of owning sheets retain a shared boundary with both range
references; differences between banks identify each destination. A row stays
detailed whenever either bank belongs to the current sheet, even if some
optional items are absent. Compact R01/R02 references link to the saved reach IDs,
design names and LB/RB identifiers in the member register. Detailed group
definitions and measurement notes are below the schedule
and material allocations, outside the frozen area. Print pages repeat the
three table header rows and identifier columns.
Each measured interval has its own From and To section values, averages and
quantity on one row. Excluded ranges contribute no quantities. Length formulas
resume from the retained end boundary, so they never bridge an excluded gap.
One-sided endpoint geometry prevents averaging across a design, road or work
boundary. Missing survey coverage, unresolved bank assignments and invalid core
layouts stop export with the affected location, instead of producing zero fill.

Filling uses the whole drawn profile, including berms, above natural ground
plus refill of stripping beneath the banks and eligible bed areas. Homogeneous
sheets have one Filling work; zoned sheets have Hearting and Casing. Replacement materials are
deducted only where their polygons intersect the bank envelope, once even when
materials overlap. Continuous blanket billing includes its bed extension once;
the bed preparation is measured once and blanket material replaces that refill.
CNS and canal-lining replacement, plus cutoff excavation/filling, remain
traceable. Toe-ditch rubble is measured in
square metres and concrete in cubic metres. Material-source shares use the
measured zone totals and the selected source/compaction/watering item, without
an inferred excavation-availability cap.

Measured Section cells are numeric source values. Average, interval quantities,
group totals and material allocations use linked Excel formulas with cached
results. Material sources appear below each group's reach schedule and allocate
only that group's quantities, including cutoff filling for hearting. Full
cutting exports one zero-quantity statement without a diagram sheet. Geometry
changes require another app export.
Bank Sections contains native Excel XY diagrams with coordinate tables, one
maximum-area representative for each saved bank reach and work/road arrangement.
Changing an arrangement creates an exhibit within the same reporting group,
so partial toe-work ranges remain visible. It creates no full-cut
exhibit. Large schedules repeat headers/identifiers when printed rather than
shrinking all work columns onto one page.

Validation: `node scripts/test-canal-bank-export.cjs --native` reconciles native
outputs against actual application geometry, including sloping surveys, berms,
blankets, filters, zoning, edited programmatic reaches, manual reaches, roads,
mixed toe works and CNS. `cargo test --manifest-path
src-tauri/estimate-core/Cargo.toml --test bank_excel` also checks independent
analytical areas, the 50-reach/four-group example, full cutting, excluded gaps,
work units, source shares and the generated workbook's formulas and sheets.

The section engine returns the effective dimensions it draws, including the
chimney width capped at the available horizontal filter. Quantity tables use
those dimensions. Net earth filling deducts only the exact union of material
polygons inside the earth envelope; material outside the bank is not deducted.
The diagram distinguishes gross filling from net earth filling and shows each
enabled work's measured section value beside its item and unit. Draft diagrams
show draft section values; reach totals remain saved quantities until Save.

Development requires the Rust `wasm32-unknown-unknown` target (`rustup target add
wasm32-unknown-unknown`). Vite and standalone Node canal tests run
`scripts/build-canal-section-engine.cjs` automatically when Rust sources or the
lockfile change. The generated WebAssembly asset is ignored by Git and bundled
with the renderer. No calculation service or network connection is needed at
runtime. Tests compare the live WebAssembly results with native workbook rows,
including an oversized chimney, material overlap, mixed work ranges and units.
