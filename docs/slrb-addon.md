# Single Lane Road Bridge addon

SLRB is a general bridge component with nine chapters, ordinary generated estimate items and component/project PDF and Excel integration. It follows the Bund/Guide Wall lifecycle: saved inputs → a pure measurement model → host-owned item updates → normal catalogue/native rate analysis → shared output values.

Choose **SLRB — Single Lane Road Bridge** when adding a Component or Sub-component. Place its crossing on the existing location page, then open **Detailed** in the tree or **Open SLRB chapters** in the component dashboard. The saved point belongs to the host; the addon does not ask for another location.

## Chapters

1. Start & references — source/revision, purpose, source-review state, historical source conflicts.
2. Crossing & height — automatic parent context, saved location, support-height endpoints.
3. Layout & spans — actual panels, clear openings, widths, ordered A1/P1…/A2 supports.
4. Deck & approaches — panel thickness, grade, wearing layer and separate end approaches/backing.
5. Supports & foundations — body/shaft, cap, footing, bedding and excavation as separate solids.
6. Walls & fittings — individual tapered wall profiles, wall footings, concrete rails/kerbs, joints, drains and distinct additional work.
7. Reinforcement & checks — full reviewed BBS, bar marks, count, complete cut length and design-review references.
8. Quantities & estimate — expression lineage, completed-work mapping, unit/grade/scope/inclusion review and project DATA.
9. Review & outputs — targeted outstanding actions, host Sync/PDF/Excel and a downloadable revision snapshot.

Blank dimensions stay pending. Optional members have separate **unknown**, **provided** and **confirmed absent** states. Chapters remain available while independent work is incomplete. The schematic and chapter-specific dimension guides are illustrative, not construction drawings.

## Calculation scope

Version `slrb-measurement/1.0.0` measures adopted straight, square-crossing solid-slab geometry. Supported support solids are rectangular prisms, stadium-plan rounded piers and constant-length trapezoid sections. Walls can have linearly varying endpoint heights with constant top/bottom thicknesses; stepped walls are separate pieces. Excavation uses explicitly entered rectangular boundaries. The steel schedule uses reviewed complete cut lengths/counts and a density of 7,850 kg/m³, with no additional supply-wastage multiplier.

Actual panel length measures concrete. Effective design span is not substituted. Body heights exclude footings and caps, so their separate solids do not overlap. Quantities retain full calculation precision; output formats only round for display.

This release does **not** perform structural sizing or load, bending, bearing, shear, stability or code-compliance checks. The supplied workbooks contain model defects despite reproducing cached formula values. Historical packages load as unreviewed candidates with unresolved conflicts; missing panel lengths and full bar schedules are not inferred from drawing snippets. “Design checks: Review required” remains separate from measurement and pricing status.

## Canal inheritance

An actual Canal parent activates inheritance automatically. The saved location projects onto the parent alignment; crossings more than 10 m away or with distinct nearby reach candidates stay unresolved. A surveyed chainage can be explicitly confirmed; changing location, parent alignment or length invalidates that confirmation.

The resolver exposes the full current Canal data and its active design at the crossing, plus bed/full-supply/bank levels and a parent revision fingerprint. No independently editable Canal copy is stored. The child cannot write into the parent.

For the supported level stack, body height is `road RL − wearing depth − slab depth − bearing/seat stack − cap depth − footing-top RL`. Road level can be an entered RL or a specified offset above inherited bank level. Footing top can be an entered RL or a specified depth below inherited bed level. A common survey datum, confirmed stack and equal adjacent panel depths are required; otherwise the affected height is pending. Footing design depth is not guessed from the water depth.

Parent edits refresh dependent items through the existing history mutation path. Reparenting requires review of the changed height source. Entered manual heights are retained and can be used after the new context is accepted. The latest resolved parent summary/revision is stored for traceability. Standalone/non-Canal bridges use entered member heights and omit hydraulic input/report sections.

## Catalogue and generated items

Catalogue candidates are codes and scope notes, not prices. The project estimating basis is chosen independently of Canal context. A mapping requires reviewed unit, grade, completed-work scope and inclusion notes. Known concrete-grade mismatches, deep excavation against the 3 m item, ingredient/supply-only prices, and duplicate included formwork/backfill are blocked. Separate work needs a documented distinct physical scope.

M25 wearing work references the existing built-in project DATA through `projectDataId`; SLRB does not create another default DATA or substitute the M20 wearing item. Concrete railings require a compatible separate analysis; the GI-pipe assembly is not substituted.

Each generated item uses a stable member/measurement key. Edits update quantities in place, keep manual children, and remove stale generated work whose dimensions or mapping are no longer valid. Missing work remains visible in the chapter model. Component totals are explicitly labelled as known work subtotals. Normal host Sync owns annual/zone/Timely pricing, leads and statutory adjustments.

## Package and outputs

`src/renderer/src/templates/slrb/manifest.json` records package/API/schema versions, point creation, optional Canal dependency, supported configurations, chapter IDs and validation scope. Its `addon.ts` exposes the first-party adapter and lazy frontend. No arbitrary external code or marketplace installer is enabled by this feature.

The shared `buildSlrbOutputModel` feeds the UI, generated items and `slrbReportData`. The addon Typst detail is injected after the normal Component Abstract, keeps manual item details and leaves the host signature block at the end. Excel uses the same numeric measurement rows, with abstract quantity cells linked to those rows; project exports also include the SLRB measurement sheet. Saved custom Component Typst layouts receive the `SLRB` variable and `ee-slrb` input.

`npm run test:slrb` covers geometry, missing/absent states, BBS, catalogue safeguards, stable item identity, M25 DATA linkage, Canal changes/ambiguity/reparenting, persistence, both rendered UI branches, shared Excel/PDF values and real Typst compilation. Existing creation, component, Bund, Guide Wall, Canal, project-file and Timely DATA suites remain applicable. Browser automation and full desktop workbook export require a compatible local desktop environment.
