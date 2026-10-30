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
across both banks and beneath the canal bed as one line. Cutting sections keep
separate bank preparation lines. This reference does not add stripping quantity
beneath the bed. Section drawings show enabled sand blankets, horizontal and
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

There is one **Statement of Quantities**. Reporting sheets are divided in order
by homogeneous/zoned construction, then slope protection provided/not provided.
Different tier names, manual profiles, berms, source choices and disjoint ranges
do not make another group. Sand Blanket & Filters is one optional block; Others
contains toe filters, rock toe, its graded filter, open ditch, ditch protection
and horizontal berm protection. Include a work column when a group measures it
anywhere, put zero on absent rows and omit all-empty optional works. When either
internal filter is measured, retain both horizontal and vertical filter columns.
Different blanket/lining units or protection item codes retain separate work
columns within the same sheet.

Each sheet names and defines its group and records member reach IDs, sides,
design names and From–To chainages. Both banks are assigned independently.
Every sheet follows the full chainage order. Each interval has its own From and
To section rows, average and quantity. An interval belonging to another sheet
has zeros with that sheet's name; full cutting has zeros and no bank group.
One-sided endpoint geometry prevents averaging across a design, road or work
boundary. Missing survey coverage, unresolved bank assignments and invalid core
layouts stop export with the affected location, instead of producing zero fill.

Filling uses the whole drawn profile, including berms, above natural ground
plus stripping beneath the actual bank footprints. Homogeneous sheets have one
Filling work; zoned sheets have Hearting and Casing. Replacement materials are
deducted only where their polygons intersect the bank envelope, once even when
materials overlap. Continuous blanket billing includes its bed extension once;
that extension does not invent bank stripping beneath the bed. CNS replacement
and canal-lining replacement, plus cutoff excavation/filling, remain traceable. Toe-ditch rubble is measured in
square metres and concrete in cubic metres. Material-source shares use the
measured zone totals and the selected source/compaction/watering item, without
an inferred excavation-availability cap.

Measured Section cells are numeric source values. Average, interval quantities,
group totals, the single statement and material allocations use linked Excel
formulas with cached results. Geometry changes require another app export.
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
