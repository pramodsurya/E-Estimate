# ADR: Output Compilation Uses Validated Dashboard Snapshots

## Status

Accepted.

## Decision

Calculation synchronization and output compilation are separate phases.

1. A dashboard Sync acquires source data and compiles calculations in dependency order.
2. The completed `DashboardDataSnapshot` is validated against the current project signatures.
3. Print Studio opens without synchronization and displays stored calculation values. A stale snapshot is identified as a draft.
4. An explicit Sync action updates the snapshot; neither opening nor recompiling Print Studio silently refreshes backend calculation data.

The full Project Sync order is:

```text
Lead -> DATA -> Components -> Seigniorage -> Project
```

## Invariants

- `projectDashboardIsReady(project)` determines whether a full-project preview is current; it does not gate opening Print Studio.
- Domain outputs compare their context, timestamp, and compile signature to label a stale preview.
- A stale output stays open with a visible warning; Sync failure is reported inside the studio.
- The current snapshot freezes backend-derived calculation values, not the entire editable project tree. Until a full source snapshot is introduced, a stale preview is a draft and may combine stored rates with newer local edits.
- Typst compilation may assemble templates, local media, and snapshot-derived presentation data, but it does not own dashboard synchronization.
- Excel may generate live formulas from snapshot-backed source inputs. Validated Excel export can require an explicit Sync when current inputs differ.
- Layout-only changes do not invalidate calculation snapshots.
- Calculation-input changes invalidate the relevant compile signatures.
- Seigniorage carries its own quantity/DATA compile signature; a timestamp alone is not sufficient evidence of freshness.

## Runtime behavior

When Print Studio is opened:

```text
open Print Studio --> compile with stored calculation values
       |
       +-- stale inputs? --> label as draft; do not sync automatically
       |
       +-- user clicks Sync icon --> sync --> validate --> recompile
```

Print Studio serializes preview requests with latest-request-wins semantics. A UI timeout does not release the queue while the native Typst worker is still running. Native Typst CPU work runs on a blocking worker rather than the async command executor.

Bund geometry preparation for Component and Project Print Studio runs in a web worker. The studio remains responsive while that preparation and the subsequent native PDF render proceed, and the preview names the current phase.

## Consequences

- A current snapshot gives Dashboard, PDF, BOQ, and Excel the same calculation state. A stale studio preview is explicitly marked as a draft.
- Opening Print Studio never performs a hidden Project, Component, Lead or Seigniorage resync.
- Sync failures requested inside Print Studio are visible in that studio.
- Old project files without newer compile signatures are marked stale; they are not silently synced on open.
