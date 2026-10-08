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

Bank Protection lists each assigned reach separately in three columns and shows
the shared chainage diagram. Manual reaches retain their exact From/To ranges;
programmatic reaches sharing a height tier can have different protection.
The selected reach shows an actual cross-section at an entered chainage or its
boundary, interpolating surveyed ground only when necessary and labelling it.
At a shared endpoint the selected bank uses that reach's profile; independent
opposite-bank profiles still resolve at the actual chainage. The generic bank
sketch is removed. Edit protection opens local slope and berm drafts; Save
applies both once, and Cancel discards them. Berm treatment measures only
horizontal shelves below the crest, independently of outer sloping faces.
Protection quantities and generated estimate items split at the exact shared
reach boundaries. Existing tier treatments remain as defaults until a reach
receives its own settings. Automatic treatments match exact ranges and profiles
after regeneration; manual treatments follow their saved reach identities.

Bund Drainage & Filters has its own two design options, independent of Bank
Design's geometry mode. Programmatic shows the Low/Medium/High height-tier
cards (including additional saved brackets); saving one tier applies its
blanket/filter settings to all its assigned ranges. When geometry is manual,
the saved programmatic brackets classify drainage using entered Soil Strata
and Sections chainages. Manual lets users create independent whole-metre
From–To drainage reaches, with no height classification. Reaches cannot overlap
on the same bank, extend outside the canal or have reversed/empty ranges.
The manual screen shows canal length and the count of saved drainage reaches.

Blanket, horizontal/chimney filter and subsurface toe-filter edits stay in a
local draft. Creating/editing a manual reach saves its range and works together
in one update. Cancel keeps the previous settings. The cross-section and
measured quantities continue to show saved settings while typing. Both modes'
settings survive switching and project save/load. Drainage scopes never change
the physical bank profiles or assignments. Rock-toe and open-ditch settings
remain with their separate chapter.

Area integration splits at both geometry and drainage boundaries; one-sided
samples prevent quantities bleeding into gaps or adjoining work ranges.
Bank-fill deductions, section diagrams and generated estimate items resolve
the active drainage mode. Fixed blankets (5-4) and variable blankets (5-5) bill
separately by their square-metre/cubic-metre units. Work quantities remain
limited to the physically measured bank footprint.

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
