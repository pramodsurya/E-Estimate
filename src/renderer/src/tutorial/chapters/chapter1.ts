import type { TutorialChapter } from '../types'

/**
 * Chapter 1 — a whole estimate, end to end.
 *
 * The first item is fully coached; the last two are handed over as
 * assignments, because the pair of moves this app is really about — fix the
 * final number, set the print area — only sticks once you have done it
 * unaided.
 */
const chapter1: TutorialChapter = {
  id: 'ch1',
  number: 1,
  title: 'Your first estimate',
  blurb:
    'Project details, a component, items, measurement sheets, final numbers and print areas.',
  minutes: 10,
  steps: [
    {
      id: 'name',
      rail: 'Name',
      section: 'setup',
      title: 'Name it the way the sanction will',
      body:
        'Use the wording that goes on the front page — the work, then where it is. ' +
        '“Construction of Apron on Tank”, not “apron job”. You can rename it later from File ▸ Edit Project.',
      primary: 'Next — the rate book',
      screen: 'the New Project form',
      target: { selector: '[data-tour="np-name"]', placement: 'bottom' }
    },
    {
      id: 'year',
      rail: 'Year',
      section: 'setup',
      title: 'This is the rate book you are estimating under',
      body:
        'Every item you add is priced from the year picked here. Normally the current book. ' +
        'Change it only if the sanction is being processed under an older year.',
      primary: 'Next — the zone',
      screen: 'the New Project form',
      target: { selector: '[data-tour="np-year"]', placement: 'bottom' }
    },
    {
      id: 'zone',
      rail: 'Zone',
      section: 'setup',
      title: 'Prices differ by zone',
      body:
        'Zone III covers most of the state outside the notified urban belts, and it is the safe default. ' +
        'If your division letter names a zone, use that one.',
      primary: 'Next — the location',
      screen: 'the New Project form',
      target: { selector: '[data-tour="np-zone"]', placement: 'bottom' }
    },
    {
      id: 'location',
      actionLabel: 'the map',
      rail: 'Location',
      section: 'setup',
      title: 'Click the map where the work is',
      body:
        'Search the village, or click the spot directly. The pin decides your area allowance — the percentage ' +
        'added to labour rates for that mandal — so it is read from the map, never typed by you.',
      primary: 'Next — the allowance',
      screen: 'the New Project form',
      target: { selector: '[data-tour="np-map"]', placement: 'top' }
    },
    {
      id: 'allowance',
      rail: 'Allowance',
      section: 'setup',
      title: 'The allowance came from the pin',
      body:
        'An Agency / Tribal mandal carries a higher labour percentage than a plain one. The rule year and ' +
        'G.O. reference are shown with it, which is what a checking officer will ask for.',
      primary: 'Next — create it',
      screen: 'the New Project form',
      target: { selector: '[data-tour="np-allowance"]', placement: 'top' }
    },
    {
      id: 'create',
      rail: 'Create',
      section: 'setup',
      title: 'Create the project',
      body:
        'The required fields are in. E-Estimate will ask where to save the file — pick a folder now and ' +
        'everything after this saves itself.',
      primary: 'Created it',
      screen: 'the New Project form',
      target: { selector: '[data-tour="np-create"]', placement: 'top' }
    },
    {
      id: 'dashboard',
      rail: 'Dashboard',
      section: 'setup',
      title: 'Add the first component',
      body:
        'A component is one part of the work — the apron, the bund, the guide wall. Items and measurement ' +
        'sheets live under components, so nothing gets measured until you make one.',
      primary: 'Next',
      screen: 'the project dashboard',
      target: { text: 'Add Component', within: '.dash-actions', placement: 'bottom' }
    },
    {
      id: 'component',
      rail: 'Component',
      section: 'setup',
      title: 'Name it after the structure',
      body:
        'Type what the part is called — “Apron”. Leave the type on Custom: Bund and Guide Wall are for when ' +
        'you want the app to generate a whole design, and that is a different lesson.',
      primary: 'Next',
      screen: 'the Add Component dialog',
      target: { selector: '[data-tour="add-structure-name"]', placement: 'right' }
    },
    {
      id: 'add-item',
      rail: 'Add item',
      section: 'setup',
      title: 'Now the items you will measure',
      body:
        'Items are entries from the SSR or SOR rate books. Each one you add gets its own measurement sheet ' +
        'under this component, and its rate comes from the book automatically.',
      primary: 'Next',
      screen: 'the component dashboard',
      target: { text: 'Add Item', within: '.dash-actions', placement: 'bottom' }
    },
    {
      id: 'search',
      rail: 'Search',
      section: 'setup',
      title: 'Search words, not codes',
      body:
        'Type what the work is — “excavation”. The list ranks by description, so you do not need to remember ' +
        '1.1.1. Codes are for checking afterwards.',
      primary: 'See the matches',
      screen: 'the Add Item dialog',
      target: { selector: '[data-tour="add-item-search"]', placement: 'bottom' }
    },
    {
      id: 'pick-code',
      rail: 'Pick code',
      section: 'setup',
      actionLabel: 'the + beside the code you want',
      title: 'Tick the one that matches your soil',
      body:
        'Ordinary soil, hard gravel and rock are separate codes at different rates. Read the descriptions, ' +
        'then press the + beside the one you want — the ring is on the first match, but any row will do. ' +
        'It drops into the Selected bar below.',
      primary: 'Added it',
      screen: 'the Add Item dialog',
      target: { selector: '[data-tour="add-item-plus"]', placement: 'right', pad: 4 }
    },
    {
      id: 'confirm-add',
      rail: 'Add them',
      section: 'setup',
      actionLabel: 'Add Items',
      title: 'Nothing is added until you press this',
      body:
        'The Selected bar is a staging area — pick as many codes as you need, from either rate book, and they ' +
        'all arrive together. Each one gets its own measurement sheet under the component.',
      primary: 'Added',
      screen: 'the Add Item dialog',
      target: { selector: '[data-tour="add-item-confirm"]', placement: 'top' }
    },
    {
      id: 'open-sheet',
      rail: 'Open sheet',
      section: 'setup',
      actionLabel: 'the item under your component',
      title: 'Open the item to measure it',
      body:
        'Every item you added has its own measurement sheet. Click the item in the Explorer on the left and ' +
        'its sheet opens here.',
      primary: 'Opened it',
      screen: 'the Explorer',
      target: { selector: '[data-tour="tree-item"]', placement: 'right', pad: 3 }
    },
    {
      id: 'sheet-fill',
      rail: 'The sheet',
      section: 'setup',
      title: 'A specimen is filled in for you',
      body:
        'One line per measurement: what it is, then number, length, breadth and depth — the quantity column ' +
        'multiplies them. I have put a typical apron footing in so there is something to work with. Write ' +
        'whatever you want over it: these are only example figures, and the sheet takes as many lines as you need.',
      primary: 'Understood — carry on',
      screen: 'the item’s measurement sheet',
      target: { selector: '[data-tour="sheet-grid"]', placement: 'right', pad: 2 }
    },
    {
      id: 'pick-final-cell',
      rail: 'Total cell',
      section: 'setup',
      eyebrow: 'THE IMPORTANT ONE',
      title: 'Click the cell holding the total',
      body:
        'A sheet can hold any amount of working — sub-totals, deductions, scratch columns. The app cannot guess ' +
        'which number is the answer, so you point at it. I have selected F4 for you — the Total. Click a ' +
        'different cell if your own figures put the answer somewhere else.',
      primary: 'Selected it',
      screen: 'the item’s measurement sheet',
      target: { selector: '[data-tour="sheet-grid"]', placement: 'right', pad: 2 }
    },
    {
      id: 'fix-final',
      rail: 'Fix №',
      section: 'setup',
      eyebrow: 'THE IMPORTANT ONE',
      actionLabel: 'Fix Final №',
      title: 'Now press Fix Final №',
      body:
        'That single figure is what the abstract, the component cost and the sanction total all read. Once it ' +
        'is fixed it appears as a badge in this toolbar, so you can always see which cell the totals trust.',
      primary: 'Fixed it',
      screen: 'the item’s measurement sheet',
      target: { selector: '[data-tour="sheet-fix-final"]', placement: 'bottom' }
    },
    {
      id: 'to-dashboard',
      rail: 'Dashboard',
      section: 'assignment',
      actionLabel: 'your component in the Explorer',
      title: 'Back to the component to price it',
      body:
        'The sheet is finished, but Sync does not live in here — it belongs to the component that owns this ' +
        'item. Click the component in the Explorer on the left to open its dashboard.',
      primary: 'Opened it',
      screen: 'the Explorer',
      target: { selector: '[data-tour="tree-component"]', placement: 'right', pad: 3 }
    },
    {
      id: 'sync',
      rail: 'Sync',
      section: 'assignment',
      title: 'Sync brings the rates in',
      body:
        'The sheet gave you a quantity; Sync fetches the rate for the current year and zone, applies your area ' +
        'allowance, and fills the dashboard. Do it whenever you have added or changed items.',
      primary: 'Synced',
      screen: 'the component dashboard',
      target: { text: 'Sync', within: '.dash-actions', placement: 'bottom' }
    },
    {
      id: 'assignment-items',
      rail: 'Your turn',
      section: 'assignment',
      eyebrow: 'ASSIGNMENT',
      assignment: true,
      title: 'Add two items on your own',
      body:
        'Add IRR-CCDW-2-5 and IRR-CCDW-2-6 to this component. You have done this once already, so there are no ' +
        'pointers this time — and no need to hurry. The strip at the top keeps the task in view, and notices ' +
        'when both are in.',
      primary: 'Got it — let me work',
      screen: 'this component'
    },
    {
      id: 'open-ccdw-sheet',
      rail: 'CCDW 2-5',
      section: 'settings',
      actionLabel: 'IRR-CCDW-2-5 in the Explorer',
      title: 'Open one of the items you just added',
      body:
        'Two things about this item are worth changing: how it is written, and which way round it prints. Open ' +
        'IRR-CCDW-2-5 and we will do both.',
      primary: 'Opened it',
      screen: 'the Explorer',
      target: { selector: '[data-tour-code="IRR-CCDW-2-5"]', placement: 'right', pad: 3 }
    },
    {
      id: 'open-item-settings',
      rail: 'Settings',
      section: 'settings',
      actionLabel: 'the pencil on that row',
      title: 'The itemâs own settings',
      body:
        'The pencil on the row in the Explorer opens them — how the item is written, and how it prints.',
      primary: 'Opened it',
      screen: 'the Explorer',
      target: {
        selector: '[data-tour-code="IRR-CCDW-2-5"] [data-tour="tree-settings"]',
        placement: 'right',
        pad: 3
      }
    },
    {
      id: 'settings-editor-type',
      rail: 'Document',
      section: 'settings',
      title: 'Some items read better as a write-up',
      body:
        'Concrete items are often described in prose with the measurements inside the text. Switch Editor Type ' +
        'to Document and this item becomes a page you write, still carrying a final number.',
      primary: 'Changed it',
      screen: 'the item settings dialog',
      target: { selector: '[data-tour="settings-editor-type"]', placement: 'bottom' }
    },
    {
      id: 'settings-orientation',
      rail: 'Orientation',
      section: 'settings',
      title: 'Portrait or landscape, per item',
      body:
        'Portrait suits a narrow measurement table — a few columns down a tall page. Landscape is for the wide ' +
        'ones: many columns, a lead chart, a rate analysis that would otherwise be squeezed or split across ' +
        'sheets. It applies to this item alone, so one wide table need not turn the whole estimate sideways. The ' +
        'same setting sits in this item’s Print Layout — change it in either place and both agree.',
      primary: 'Understood — carry on',
      screen: 'the item settings dialog',
      target: { selector: '[data-tour="settings-orientation"]', placement: 'bottom' }
    },
    {
      id: 'settings-save',
      rail: 'Save',
      section: 'settings',
      actionLabel: 'Save',
      title: 'Save the change',
      body: 'The item reopens as a document page, with the same Fix Final № discipline as any sheet.',
      primary: 'Saved',
      screen: 'the item settings dialog',
      target: { selector: '[data-tour="settings-save"]', placement: 'top' }
    },
    {
      id: 'measure-both',
      rail: 'Measure both',
      section: 'settings',
      eyebrow: 'ASSIGNMENT',
      assignment: true,
      title: 'Now measure both of them yourself',
      body:
        'IRR-CCDW-2-5 is a document now, IRR-CCDW-2-6 is still a sheet. Write up the one and fill in the other, ' +
        'then fix a final number on each — that pair of moves is the whole discipline of this app, and it is the ' +
        'same in a document as in a sheet. Neither item counts until it carries a quantity.',
      primary: 'Got it — let me work',
      screen: 'these two items'
    },
    {
      id: 'back-to-component',
      actionLabel: 'the component in the Explorer',
      rail: 'Component',
      section: 'closing',
      title: 'Every item is measured — now bring it together',
      body:
        'Two more items went in since the last sync, so the cost card is stale. Open the component dashboard ' +
        'to see them and refresh it.',
      primary: 'Opened it',
      screen: 'the Explorer',
      target: { selector: '[data-tour="tree-component"]', placement: 'right', pad: 3 }
    },
    {
      id: 'sync-again',
      rail: 'Sync again',
      section: 'closing',
      title: 'Sync picks up everything new',
      body:
        'Sync recomputes rates for every item under this component using the current year, zone and area ' +
        'allowance — including the two you just added.',
      primary: 'Synced',
      screen: 'the component dashboard',
      target: { text: 'Sync', within: '.dash-actions', placement: 'bottom' }
    },
    {
      id: 'print-view',
      rail: 'Print view',
      section: 'closing',
      title: 'This is what actually prints',
      body:
        'View Print View shows the real paginated output for this component — only fixed final numbers and set ' +
        'print areas appear on it. It is the fastest way to catch a forgotten one.',
      primary: 'Opened it',
      screen: 'the component dashboard',
      target: { text: 'View Print View', within: '.dash-actions', placement: 'bottom' }
    },
    {
      id: 'printed',
      rail: 'Printed',
      eyebrow: 'CHAPTER 1',
      title: 'Three items, all accounted for',
      body:
        'Every fixed final number and every print area you set shows up here, nowhere else. If something is ' +
        'missing from a printout, this is always where to look first.',
      primary: 'Finish chapter 1',
      screen: 'the component print view'
    }
  ],
  complete: {
    title: 'You’ve built a real estimate.',
    checklist: [
      'Project details, year, zone and area allowance from the map',
      'A component, three items — two of them added and measured unaided',
      'Final numbers fixed, with print areas set automatically from the sheet',
      'One item written as a document instead of a table'
    ]
  }
}

export default chapter1
