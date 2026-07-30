# Bund Stability and Seepage Simulation Plan

**Status:** Deferred — planning complete, implementation not started  
**Application:** E-Estimate  
**Prepared:** 26 July 2026  
**Primary reference:** IS 7894:1975 stability cases, subject to the department's current approved amendments and engineering review

## 1. Final Product Decision

Add a separate **Simulation** tab inside the existing Bund component.

The tab will simulate the Bund section already produced by the template. It will not:

- ask the engineer to redraw the Bund;
- reproduce the XSLOPE user interface;
- redesign the Bund automatically;
- add berms, flatten slopes, change quantities, or modify the estimate;
- derive soil strength from SSR item codes; or
- change BOQ values after a failed analysis.

The engineer will enter the soil and foundation properties obtained from their investigation. The application will transfer the current Bund geometry to a headless XSLOPE calculation service, run the selected stability cases, and display the calculated factor of safety and engineering diagrams.

## 2. Intended Workflow

```text
Existing Bund template and levels
            |
            v
Open Stability & Seepage Simulation tab
            |
            v
Select the Bund chainage/section to analyse
            |
            v
Enter embankment and foundation soil properties
            |
            v
Confirm water levels and case-specific loading data
            |
            v
Run one case or Run All Applicable Cases
            |
            v
Headless XSLOPE seepage and slope-stability analysis
            |
            v
FS summary + pass/fail + critical slip circle + phreatic/seepage diagram
```

The estimate remains unchanged regardless of the simulation result.

## 3. Scope of the First Release

### Included

- Import the selected cross-section from the existing Bund template.
- Allow analysis at any Bund chainage.
- Suggest the highest/steepest section as the initial critical-section candidate.
- Support homogeneous Bund fill and one or more foundation layers.
- Include optional template-generated filter, chimney filter, drainage blanket, and rock-toe zones when they exist.
- Accept user-entered mechanical and hydraulic properties.
- Run all six IS 7894 loading-condition families.
- Search multiple trial slip circles automatically.
- Report the critical slip surface with the lowest factor of safety.
- Display upstream and downstream results separately.
- Display pore-pressure/phreatic information used by the stability calculation.
- Save inputs, results, engine version, method, date, and source reference in the project file.
- Re-run an old simulation after inputs or Bund geometry change.

### Excluded

- Automatic design correction or optimization.
- Automatic BOQ or cost changes.
- Automatic acceptance of assumed soil properties.
- Replacement of soil investigation or geotechnical approval.
- Three-dimensional stability analysis.
- Foundation settlement, liquefaction, piping, erosion, breach, and deformation analysis.
- Finite-element stress/deformation analysis unless introduced as a later module.

## 4. Six IS 7894 Case Families

The six code cases are **case families**. Some families require separate upstream and downstream calculations, so **Run All** will execute more than six solver jobs.

| Case | Loading condition | Critical slope/run | Minimum desired FS |
|---|---|---|---:|
| I | Construction condition, with or without partial pool | Upstream and downstream | 1.0 |
| II | Reservoir partial pool | Upstream | 1.3 |
| III-A | Sudden drawdown: maximum head water to minimum, with tail water at maximum | Upstream | 1.3 |
| III-B | Sudden drawdown: maximum tail water to minimum, with reservoir full | Downstream | 1.3 |
| IV | Steady seepage with reservoir full | Downstream | 1.5 |
| V | Steady seepage with sustained rainfall | Downstream | 1.3 |
| VI-A | Earthquake during steady-seepage condition | Downstream | 1.0 |
| VI-B | Earthquake with reservoir full | Upstream | 1.0 |

The thresholds must be configuration data rather than scattered hard-coded UI values. Each stored result must record the standard/revision and threshold used for that run.

### Case I — End of Construction

- Analyse both slopes.
- Represent construction pore pressure by the approved method.
- Permit total-stress or effective-stress inputs according to the laboratory data and adopted procedure.
- If rapid first filling is applicable, construction pore pressures must not be assumed dissipated.

### Case II — Partial Pool

- Analyse the upstream slope.
- Default trial levels should include approximately one-third and two-thirds of the full reservoir head.
- Permit the engineer to add or replace intermediate reservoir levels.
- Report the governing partial-pool level.

### Case III — Sudden Drawdown

- III-A analyses upstream drawdown from maximum to minimum head water with maximum tail water.
- III-B analyses downstream drawdown from maximum to minimum tail water with the reservoir full.
- Store initial level, final level, and drawdown duration/rate.
- The implementation must clearly identify whether it uses:
  - the prescribed IS pore-pressure treatment; or
  - a transient seepage analysis followed by stability checks at multiple time steps.
- A transient result must report the governing time step as well as the governing slip surface.

### Case IV — Steady Seepage

- Reservoir at full level.
- Analyse the downstream slope.
- Generate or solve the steady phreatic/pore-pressure condition through the section.
- Include drain, chimney, horizontal filter, and rock-toe boundaries when present.

### Case V — Steady Seepage with Sustained Rainfall

- Analyse the downstream slope.
- Apply the approved rainfall/saturation assumption.
- Do not silently invent rainfall infiltration or saturation depth.
- Store the adopted rainfall boundary condition with the result.

### Case VI — Earthquake

- VI-A: downstream slope under steady seepage.
- VI-B: upstream slope with the reservoir full.
- Use user-entered or department-approved horizontal and vertical seismic coefficients.
- Store `kh`, `kv`, coefficient source, and the sign convention applied.

## 5. Simulation Tab Layout

### Header

- Bund name.
- Selected chainage.
- Maximum Bund height at the selected section.
- Current geometry revision status.
- Last simulation date and result.
- Buttons:
  - **Run Selected Case**
  - **Run All Applicable Cases**
  - **Cancel Analysis**
  - **Reset Unsaved Inputs**

### Section A — Analysis Section

- Chainage selector populated from existing Bund sections.
- **Suggested critical section** badge for the tallest/steepest section.
- Read-only geometry summary:
  - crest level;
  - ground/foundation level;
  - Bund height;
  - crest width;
  - upstream slope;
  - downstream slope;
  - berms;
  - filters;
  - rock toe; and
  - upstream/downstream toe details.
- Preview of the exact geometry that will be sent to the engine.

The geometry preview must be derived from the same Bund functions used by the quantity engine so the estimate and simulation cannot describe different sections.

### Section B — Material Properties

Provide one editable row per material zone.

| Field | Symbol | Unit | Required |
|---|---|---:|---|
| Material name | — | — | Yes |
| Moist unit weight | `gamma` | kN/m³ | Yes |
| Saturated unit weight | `gamma_sat` | kN/m³ | Yes |
| Effective cohesion | `c_prime` | kPa | For effective-stress analysis |
| Effective friction angle | `phi_prime` | degrees | For effective-stress analysis |
| Undrained shear strength | `cu` | kPa | When total-stress construction analysis is used |
| Horizontal permeability | `kx` | m/s | Seepage cases |
| Vertical permeability | `ky` | m/s | Seepage cases |
| Construction/strength model | — | — | Yes |
| Test/report reference | — | — | Yes for an approved result |
| Remarks | — | — | Optional |

Optional advanced transient-seepage fields:

- saturated water content;
- residual water content;
- unsaturated model parameters;
- specific storage `Ss`;
- specific yield `Sy`;
- hydraulic conductivity function/reference; and
- suction-strength parameters, when intentionally modelled.

Initial material rows:

1. Embankment fill.
2. Foundation layer 1.
3. Additional foundation layers added by the engineer.
4. Filter sand, only when the selected template section contains it.
5. Rock toe/filter aggregate, only when explicitly represented in the analysis model.

### Section C — Foundation Profile

Each foundation layer requires:

- description;
- top and bottom level, or layer depth;
- mechanical and hydraulic material selection;
- confirmation of whether it continues across the entire analysis width; and
- test/report reference.

The SSR excavation code must never be treated as a foundation-soil classification.

### Section D — Water and Loading Conditions

Import available values from the Bund/tank template:

- full tank/reservoir level;
- maximum water level, if stored;
- tail-water level, if stored;
- Bund top level; and
- ground/foundation level.

Allow case-specific entry for:

- partial-pool levels;
- minimum head-water level;
- maximum and minimum tail-water levels;
- drawdown duration or rate;
- rainfall boundary assumption;
- horizontal seismic coefficient `kh`;
- vertical seismic coefficient `kv`; and
- surcharge/loading, if supported later.

Imported water levels remain editable inside the simulation record without changing the estimate.

### Section E — Analysis Controls

Keep the default interface simple:

- case selection;
- **Run all applicable cases**;
- analysis method;
- number of slices;
- circular slip-surface search quality; and
- optional advanced settings drawer.

Recommended initial methods:

- Ordinary Method of Slices/Fellenius for the requested departmental calculation;
- Bishop Simplified as a comparison method; and
- Spencer or another rigorous method as an optional verification result after benchmarking.

Every reported factor of safety must display the calculation method used. Results from different methods must not be mixed.

### Section F — Results

Show a result card for every executed case/subcase:

- case number and name;
- analysed slope;
- calculated FS;
- minimum required FS;
- margin;
- Pass/Fail/Not evaluated;
- governing chainage;
- governing water level/time step;
- method;
- engine version;
- warnings; and
- run time.

Result diagrams:

- Bund and foundation geometry.
- Material zones with legend.
- Reservoir and tail-water levels.
- Phreatic line or pore-pressure contours.
- Critical slip circle.
- Slice boundaries.
- Circle centre and radius.
- Entry and exit points.
- Direction of movement.
- Optional seepage vectors/contours and calculated discharge.

The diagram should look native to E-Estimate. No XSLOPE workbook or standalone interface should be shown to the user.

## 6. Input Validation

Block execution when:

- the selected Bund section is incomplete or self-intersecting;
- a required material property is missing;
- `gamma_sat < gamma`;
- friction angle is outside `0–50°`;
- a unit weight, strength, permeability, depth, or duration is non-positive where positivity is required;
- foundation layers overlap, have gaps that make the model ambiguous, or have an invalid order;
- initial/final drawdown levels are reversed;
- reservoir or tail-water levels fall outside the model without explicit confirmation;
- earthquake coefficients are missing for Case VI; or
- the selected method cannot use the supplied strength model.

Warn but allow an authorized run when:

- soil values are marked assumed rather than tested;
- permeability is isotropic because only one value was entered;
- only one foundation layer is used;
- a filter/drain shown by the Bund template has no hydraulic material;
- the slip-surface search touches the search boundary;
- numerical convergence is weak; or
- a result changes materially between methods.

Do not manufacture missing properties.

## 7. Persistence Model

Store the simulation data inside the Bund node so it travels with the `.eestimate` project.

Proposed structure:

```ts
interface BundSimulationData {
  schemaVersion: 1
  selectedSectionId: string | null
  materials: BundSimulationMaterial[]
  foundationLayers: BundFoundationLayer[]
  water: BundSimulationWaterInputs
  loading: BundSimulationLoadingInputs
  controls: BundSimulationControls
  sourceReferences: BundSimulationSource[]
  results: BundSimulationRun[]
  geometryFingerprint: string | null
}
```

Each result should include:

```ts
interface BundSimulationRun {
  id: string
  createdAt: string
  caseId: string
  subcaseId: string | null
  sectionId: string
  geometryFingerprint: string
  inputFingerprint: string
  engine: {
    name: 'XSLOPE'
    version: string
    bridgeVersion: string
  }
  method: string
  requiredFs: number
  calculatedFs: number | null
  status: 'pass' | 'fail' | 'error' | 'not-evaluated'
  criticalSurface: BundCriticalSurface | null
  slices: BundAnalysisSlice[]
  porePressure: BundPorePressureResult | null
  warnings: string[]
  diagnostics: Record<string, unknown>
}
```

When Bund geometry changes:

- retain old results for audit;
- mark them **Out of date** by comparing geometry fingerprints; and
- require a new run before showing a current Pass/Fail status.

## 8. Engine Architecture

```text
React Simulation Tab
        |
        | typed request through preload
        v
Electron main-process IPC
        |
        | JSON request, no shell interpolation
        v
Bund analysis sidecar
        |
        | geometry + materials + case settings
        v
XSLOPE calculation and visualization data
        |
        | validated JSON result
        v
Electron IPC -> React diagrams/results
```

### Recommended implementation

- Run XSLOPE as a bundled Python sidecar.
- Communicate through JSON on standard input/output or a private local pipe.
- Package the sidecar as a versioned executable for Windows.
- Never expose a command prompt or Python installation to the engineer.
- Do not require Excel templates during normal use.
- Keep the renderer sandboxed; only the main process may launch the sidecar.
- Enforce a per-run timeout and support cancellation.
- Capture engine stderr in diagnostic logs without exposing file paths or sensitive data.

### Proposed engine request

```json
{
  "schemaVersion": 1,
  "runId": "uuid",
  "geometry": {
    "ground": [],
    "embankment": [],
    "materialPolygons": [],
    "drains": []
  },
  "materials": [],
  "water": {},
  "loadingCase": {},
  "search": {
    "surface": "circular",
    "slices": 40,
    "method": "ordinary",
    "quality": "standard"
  }
}
```

### Proposed engine response

```json
{
  "schemaVersion": 1,
  "runId": "uuid",
  "status": "ok",
  "engine": {
    "name": "XSLOPE",
    "version": "x.y.z"
  },
  "factorOfSafety": 1.42,
  "criticalSurface": {
    "type": "circle",
    "center": [0, 0],
    "radius": 0,
    "entry": [0, 0],
    "exit": [0, 0]
  },
  "slices": [],
  "phreaticLine": [],
  "porePressure": {},
  "seepage": {},
  "warnings": [],
  "diagnostics": {}
}
```

Validate the response against a strict schema before saving or rendering it.

## 9. Geometry Mapping

Use the current Bund calculation library as the single geometry source.

For the selected section, produce:

- ground/foundation surface;
- crest;
- upstream slope;
- downstream slope;
- berm shelves and faces;
- foundation base extent;
- material polygons;
- upstream/downstream toe and rock-toe limits;
- filter/drain lines or polygons; and
- upstream and downstream water boundaries.

Geometry must use metres and levels consistently. Apply one documented transformation between application coordinates and engine coordinates. Preserve the reverse transform so engine results can be drawn exactly over the application section.

Do not construct simulation geometry by reading SVG pixels from the existing diagram.

## 10. Seepage-to-Stability Coupling

For steady cases:

1. Generate the finite-element seepage mesh.
2. Apply reservoir, tail-water, drain, and exit-face boundaries.
3. Solve pore pressure.
4. Interpolate pore pressure to the bases of stability slices.
5. Run the selected limit-equilibrium method.
6. Search trial surfaces and retain the minimum valid FS.

For transient drawdown:

1. Establish the initial steady water condition.
2. Apply the head/tail-water time series.
3. Solve transient pore pressure.
4. Run stability at configured time steps.
5. Return the minimum FS across all surfaces and times.

For a simplified first implementation based on prescribed IS pore-pressure assumptions, label the result accordingly. Do not label a prescribed-phreatic analysis as a transient seepage analysis.

## 11. Slip-Surface Search

- Generate trial circles automatically.
- Cover both shallow face failures and deep foundation failures.
- Search upstream and downstream domains separately.
- Reject geometrically invalid circles.
- Refine the search around the lowest-FS candidates.
- Record the search boundary and number of valid surfaces evaluated.
- Warn if the critical circle lies on the edge of the search domain.
- Allow an advanced user to add a specified circle later, but never require manual circles for the normal workflow.

## 12. Files Expected to Change During Implementation

New files should be preferred to reduce risk in the already-developed application.

Likely new files:

```text
src/renderer/src/components/bund/BundSimulationTab.tsx
src/renderer/src/components/bund/BundSimulationInputs.tsx
src/renderer/src/components/bund/BundSimulationResults.tsx
src/renderer/src/components/bund/BundStabilityDiagram.tsx
src/renderer/src/lib/bundSimulation.ts
src/renderer/src/types/bundSimulation.ts
src/main/bundSimulation.ts
analysis/bund_analysis.py
analysis/requirements.txt
analysis/schemas/request.schema.json
analysis/schemas/response.schema.json
scripts/test-bund-simulation.cjs
```

Existing integration points:

```text
src/renderer/src/components/bund/BundDashboard.tsx
src/renderer/src/lib/bund.ts
src/renderer/src/types/project.ts
src/renderer/src/store/useStore.ts
src/preload/index.ts
src/main/ipc.ts
electron-builder.yml
package.json
```

Before editing, preserve all existing uncommitted work and make only narrowly scoped changes.

## 13. Testing and Verification

### Unit tests

- Bund geometry-to-engine transformation.
- Coordinate round trip.
- Material polygon closure and non-overlap.
- Water-boundary generation.
- Each loading-case request.
- Threshold selection.
- Input validation.
- Geometry/input fingerprints.
- Old-result invalidation.

### Engine contract tests

- Valid request and response.
- Missing property rejection.
- Engine timeout.
- Cancellation.
- Non-convergence.
- Malformed engine response.
- XSLOPE version mismatch.

### Engineering benchmarks

At least one independently checked example for:

- homogeneous Bund under construction;
- partial pool;
- upstream rapid drawdown;
- downstream tail-water drawdown;
- downstream steady seepage;
- sustained rainfall condition; and
- upstream/downstream pseudo-static earthquake.

Compare:

- calculated FS;
- critical-circle location;
- phreatic line/pore pressures;
- slice forces where available; and
- sensitivity to slice count and search refinement.

The application result should not be called verified until the benchmark tolerance and comparison report are approved by a competent geotechnical engineer.

### Application regression tests

- Existing Bund quantities remain unchanged.
- Existing Bund diagrams remain unchanged.
- Project save/open supports simulations.
- Old projects without simulation data still open normally.
- Print and estimate totals are unaffected.
- Windows development build and packaged installer both find the sidecar.

## 14. Acceptance Criteria

The feature is complete only when:

- the user can open a separate Simulation tab from an existing Bund;
- no drawing is required;
- all required soil/foundation fields have clear units and validation;
- Run All executes every applicable case/subcase;
- each completed run shows calculated and required FS;
- upstream and downstream results are clearly distinguished;
- the critical slip circle and phreatic/pore-pressure condition are visible;
- saved projects preserve inputs and results;
- changes to Bund geometry mark old results out of date;
- the estimate and BOQ are never altered by simulation;
- the packaged Windows application runs without a separate Python installation;
- all automated tests pass; and
- the benchmark comparison is reviewed and accepted.

## 15. Indicative Implementation Schedule

For one experienced developer:

| Work | Effort |
|---|---:|
| Simulation data model, UI shell, and persistence | 3–4 days |
| Headless XSLOPE bridge and Windows packaging | 4–6 days |
| Bund geometry/material translation | 4–5 days |
| Six case families and subcases | 6–8 days |
| Stability and seepage visualizations | 4–6 days |
| Reports, diagnostics, and error handling | 3–4 days |
| Engineering benchmarks and regression testing | 8–10 days |

Expected production-ready duration: **6–8 working weeks**.  
Full transient drawdown/rainfall modelling may extend this to **7–9 weeks**.

## 16. Engineering and Product Rules

1. The simulation is a verification tool, not an automatic designer.
2. The user is responsible for the engineering properties entered.
3. Every material property must retain its unit and source.
4. Assumed and laboratory-tested values must be visibly distinguished.
5. SSR item codes identify construction work; they do not prove soil strength.
6. No result may hide its calculation method, loading case, or required FS.
7. A solver error or non-convergence is not a failed slope; it is an unevaluated result.
8. A Pass/Fail result applies only to the analysed section, geometry, materials, water condition, and method.
9. Old results remain available for audit but become out of date after relevant changes.
10. Final departmental acceptance remains with the competent engineering authority.

## 17. References for Future Implementation

- [CWC Manual for Safety Inspection of Dams — IS 7894 case table](https://cwc.gov.in/sites/default/files/Safety%20inspection%20of%20dams.pdf)
- [CWPRS Technical Memorandum — critical loading conditions](https://www.cwprs.gov.in/storage/pdf-uploads/Technical%20Memorandum%20-%20Rahabiltation%20of%20Dams%20A%20Study%20Based%20Approach.pdf)
- [Telangana technical guidelines for earth dams/bunds](https://irrigation.telangana.gov.in/uploadedFiles/minor_technical_5a.pdf)
- [XSLOPE input template and material properties](https://xslope.org/en/latest/usage/input_template/)
- [XSLOPE seepage overview](https://xslope.org/en/latest/seep/overview/)
- [XSLOPE seepage API](https://xslope.org/en/latest/api/seep/)

