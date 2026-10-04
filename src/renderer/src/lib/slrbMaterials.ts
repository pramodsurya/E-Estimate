/** Reviewed catalogue candidates from the SLRB source audit. These are codes,
 * never prices; selection still requires the live master and scope review. */
export const SLRB_MATERIAL_CANDIDATES:Record<string,{code:string;note:string}>={
  'deck.M20':{code:'IRR-CCDW-2-25',note:'M20 deck/kerb; includes formwork and scaffolding, excludes reinforcement.'},
  'kerb.M20':{code:'IRR-CCDW-2-25',note:'M20 deck/kerb; check distinct kerb volume. Formwork included.'},
  'footing.M20':{code:'IRR-CCDW-2-10',note:'General M20 structural concrete, 20 mm aggregate. Check footing scope; formwork included.'},
  'pier.M20':{code:'IRR-CCDW-2-10',note:'General M20 structural concrete; formwork included. Reinforcement billed separately.'},
  'cap.M20':{code:'IRR-CCDW-2-10',note:'General M20 structural concrete; check cap detail and inclusions.'},
  'approach.M20':{code:'IRR-CCDW-2-10',note:'Candidate only: confirm the approved approach-slab analysis and project scope.'},
  'abutment.M15':{code:'IRR-CCDW-2-11',note:'M15 concrete, 20 mm aggregate; not stone masonry. Formwork included.'},
  'wall.M15':{code:'IRR-CCDW-2-11',note:'M15 concrete, 20 mm aggregate. Check wall profile; formwork included.'},
  'bedding.M15':{code:'IRR-CCDW-2-3',note:'M15 foundation filling, 40 mm aggregate. Confirm the specified grade and bedding scope.'},
  'bedding.M10':{code:'IRR-CCDW-2-5',note:'M10 foundation filling, 40 mm aggregate. Use only for a matching detail.'},
  excavation:{code:'IRR-CCDW-1-2',note:'Soil excavation up to 3 m depth; includes specified shoring and backfilling. Deeper/rock work needs another analysis.'},
  steel:{code:'IRR-CCDW-2-1',note:'Fabrication and placing in KG. Recipe supply wastage is already included; do not add 5% to BBS mass.'},
  fill:{code:'IRR-CCDW-7-1',note:'Specified rubble/boulder and sand behind walls; confirm separate physical scope from excavation backfill.'},
  'wearing.M20':{code:'IRR-CCDW-2-29',note:'M20 wearing only; source M25 work needs the built-in M25 DATA or another reviewed analysis. Check included asphalt joint work.'}
}
