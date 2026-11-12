# Drainage and filters save performance

The Save button in `CanalFoundationFilling.tsx` commits the saved treatment
through `CanalDashboardV2` and the Zustand `setCanal` action. That action calls
`syncCanalItems` to update generated estimate quantities before returning.

Geometry inputs and reach selection are prepared in TypeScript
(`canalBankExport.ts`). Bank section areas, deductions and interval quantities
are measured by Rust (`estimate-core/src/canal_engine/bank_statement.rs`),
compiled to WebAssembly and called by `canalBankSection.ts`. These calls run
synchronously in the WebView's UI thread. The drainage save calculation is local;
it does not need a server. The project's disk save is a separate operation.

Previously `canalTierFoundationItems` requested a whole-canal measurement for
each bank reach. Each request used different scope boundaries, even though
those boundaries already existed in the whole-canal schedule. With more than
50 entries, the cache cleared and the other bank repeated the measurements.
Updating the generated item registry also invalidated otherwise identical
quantity results. The synchronous work prevented input handling and painting.

The fix measures one shared schedule, summarizes each reach from its rows, and
reuses that result when scopes use existing interval endpoints. A bounded cache
shares results across equivalent saved snapshots while excluding the generated
item registry. Changed design and survey values still invalidate measurements;
new within-section boundaries get their own measurement. Engineering formulas,
one-sided geometry and the existing per-reach quantity rounding are retained.

Synthetic local reproduction with alternating height tiers at 50 m intervals:

| Sections | Reaches | Whole-canal builds before | Save before | Save after |
| --- | --- | --- | --- | --- |
| 61 | 60 | 122 | 7.1 s | about 0.25 s / one build |
| 121 | 120 | 242 | 25.5 s | not timed in the regression |

Timings are Node/WebAssembly measurements on the development computer, not a
measurement of the user's open project or a guaranteed desktop latency.
The regression checks build counts instead of imposing machine-specific timing
limits, and verifies saved estimate quantities, scope reuse, design edits,
disabled works, migration and genuinely new boundaries:

```powershell
npm run test:canal-drainage
```

Changing implementation language would not address the repeated calls: the
quantity engine is already Rust. If a single calculation on a substantially
larger canal remains expensive, move preparation and measurement into a Web
Worker or a background native task, with an asynchronous save flow. This fix
does not change the current synchronous execution model.
