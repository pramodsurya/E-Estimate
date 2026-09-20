# Canal Chapters

**Status:** Chapter 1 complete. Chapters 2-5 planned.

## Chapter 1 - Design Levels

The canal-level typical section is implemented. It currently includes a full design table with:

- Bed width `B`
- Full supply depth `FSD`
- Freeboard
- Bed slope, expressed as `1 in N`
- Side slope, expressed as `H:1V`
- Design discharge `Q`
- Offtake reference

The dashboard provides live derived readouts for:

- Section depth
- Top width at bank level
- Wetted perimeter at full supply level
- IS 3873 lining thickness guidance: `225 mm`, `350 mm`, or `550 mm` based on discharge

Chapter 1 is currently canal-level design. Per-reach designs will be added with the discontinuous-reach work.

## Chapter 2 - Cross-Sections

The next chapter will add chainage sections from setup, including:

- Cutting and filling profiles
- Berms 1-3
- Banks and service road
- To-scale cross-section drawings

## Chapter 3 - Earthwork

The earthwork chapter will calculate:

- Cutting quantities
- Banking quantities
- Spoil-bank quantities by mean area
- Bund formation-row mathematics
- Excavation-class split
- Hearting and casing fill with compaction

This chapter will write the first generated estimate items.

## Chapter 4 - LA Width

The LA Width chapter will calculate acquisition width at each chainage and populate the LA Widths sheet.

## Chapter 5 - Lining

The lining chapter will be a standalone chapter, similar to bund slope protection. It will cover:

- IS 3873 thickness derived from `Q`
- Bed lining quantities
- Side-slope lining quantities
- Joints
- Porous plugs
