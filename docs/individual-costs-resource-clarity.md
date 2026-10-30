# Individual Costs resource clarity

26 October 2026. The project inventory was treating every SSR detail row as a
resource. Published `NIL` markers and copied blank column-header rows therefore
appeared as editable zero-price resources. Live source inspection confirmed
these in CCDW, CAW and PMW analyses, including blank headers containing `in Rs.`.

The project inventory now excludes empty/NIL/header placeholders without a
numeric contribution or real resource binding, and excludes explicit total rows.
Named zero-rate resources remain. Unnamed rows with a value, quantity or binding
remain visible as `Unnamed material` / `Unnamed machine` / `Unnamed labour
resource` with a missing-description note. A meaningful source name can fill a
blank display name; grouping can adopt a meaningful alias when available.

Resource usage now retains parent DATA code, consuming analysis code, printed
MoRTH appendix reference, source row identity and row label, component path and
local rate-lock status. Up to three DATA codes appear directly in each table row;
the usage disclosure contains every location. Searching includes DATA/appendix
codes and component paths as well as resource names. Multiple rows using the same
resource remain separately traceable without inflating the DATA count.

Filtering is applied to the inventory only. Source recipes, calculations, saved
rate adoption identities and printed source rows are not rewritten. This change
does not need a Supabase migration.

Validation covers placeholder/header exclusion, retained named zero rates,
unnamed contributions and bindings, unchanged input recipes, repeated rows,
nested appendix provenance and existing adoption/isolation/lock behaviour.
Browser checks exercise the real Individual Costs panel using a synchronized
project fixture with placeholders, a shared resource, a zero-rate resource and
an unpriced resource. Renderer TypeScript, targeted ESLint and build pass.
