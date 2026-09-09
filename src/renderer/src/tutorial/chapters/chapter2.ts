import type { TutorialChapter } from '../types'

/** Chapter 2 — where materials travel from, and what that carriage costs. */
const chapter2: TutorialChapter = {
  id: 'ch2',
  number: 2,
  title: 'Lead and Seigniorage',
  blurb: 'Where each material travels from, and what that carriage adds to every rate.',
  minutes: 5,
  steps: [
    {
      id: 'lead-sidebar',
      actionLabel: 'the Lead icon in the activity bar',
      rail: 'Lead',
      eyebrow: 'CHAPTER 2',
      title: 'Materials get their travel cost here',
      body:
        'Every natural material — earth, sand, stone — carries a lead charge based on how far it travels to ' +
        'site. This is where you record that once, and every item using the material picks it up.',
      primary: 'Open the Lead Dashboard',
      screen: 'the activity bar on the far left',
      target: { selector: '[data-tour="activity-lead"]', placement: 'right' }
    },
    {
      id: 'lead-sync',
      rail: 'Sync',
      section: 'sand',
      title: 'Sync compiles every material',
      body:
        'Sync scans the whole project for anything that needs a lead — earth, sand, stone, aggregate — and ' +
        'lists it below, even before any Material exists.',
      primary: 'Synced',
      screen: 'the Lead Dashboard',
      target: { text: 'Sync', within: '.dash-actions', placement: 'bottom' }
    },
    {
      id: 'lead-panel',
      rail: 'Lead panel',
      section: 'sand',
      actionLabel: 'Lead at the bottom of the sidebar',
      title: 'The compiled materials are listed down here',
      body:
        'Sync found what needs a lead, but the list lives in the panel at the bottom left — the same place ' +
        'Seigniorage and Data sit. Press Lead there and the materials appear.',
      primary: 'Opened it',
      screen: 'the bottom-left panel',
      target: { selector: '[data-tour="panel-tab-lead"]', placement: 'top', pad: 3 }
    },
    {
      // The step that used to be missing. Everything after this one talks about
      // controls that only exist on a material's own page, so nothing may move
      // until a material is actually open.
      id: 'open-sand',
      rail: 'Open Sand',
      section: 'sand',
      actionLabel: 'the Sand row',
      title: 'Open Sand from the list',
      body:
        'Each row is a material the estimate consumes, and until one has both a point and a route it carries ' +
        'no lead at all. Click Sand — everything from here happens on its own page.',
      primary: 'Opened Sand',
      screen: 'the Lead panel, bottom left',
      target: { selector: '[data-tour-material="sand"]', placement: 'right' }
    },
    {
      id: 'open-point-dialog',
      rail: 'New point',
      section: 'sand',
      actionLabel: 'Create Point',
      title: 'A point is where the sand comes from',
      body:
        'A sand reach, a quarry, a borrow area — a place on the map the material is hauled from. Press Create ' +
        'Point above the map to open the dialog.',
      primary: 'Opened it',
      screen: 'the Sand material page',
      target: { selector: '[data-tour="lead-point-open"]', placement: 'left' }
    },
    {
      id: 'create-point',
      rail: 'The point',
      section: 'sand',
      actionLabel: 'Create Point in the dialog',
      title: 'Fill it in, then Create Point',
      body:
        'It is all one dialog. Give it a short code (SR-1) and a name you will recognise (“Sand reach, left ' +
        'bank”), leave the role as the starting point, then click the spot on the map: the coordinates fill ' +
        'themselves in, and there is no separate pick button to press first. Create Point saves it. This card ' +
        'waits for a new point — closing the dialog, or points already on the chart, do not count.',
      primary: 'Create Point',
      screen: 'the Create Point dialog',
      target: { selector: '[data-tour="lead-point-create"]', placement: 'top' }
    },
    {
      id: 'create-variant',
      rail: 'Material',
      section: 'sand',
      actionLabel: 'Create Lead',
      title: 'A Material is the route itself',
      body:
        'The point marks where the material is; a Material is the trip from there to the work. Open Create Lead.',
      primary: 'Opened it',
      screen: 'the Sand material page',
      target: { text: 'Create Lead', placement: 'bottom' }
    },
    {
      id: 'variant-name',
      rail: 'Name',
      section: 'sand',
      title: 'Start with the name',
      body:
        'Optional — with a start and an end chosen the app names it for you — but a name of your own reads ' +
        'better on the lead chart than “SR-1 → Work site”. Route colour underneath is cosmetic; it decides how ' +
        'this route is drawn on the printed map.',
      primary: 'Next — the starting point',
      screen: 'the Create Lead dialog',
      target: { selector: '[data-tour="variant-name"]', placement: 'bottom' }
    },
    {
      id: 'variant-start',
      rail: 'Start',
      section: 'sand',
      title: 'Now where the material comes from',
      body:
        'Open Starting and choose SR-1 — the sand reach you just created. It reads “No starting point / manual ' +
        'only” until you do, and that is the reason the point had to exist before the route could.',
      primary: 'Picked it',
      screen: 'the Create Lead dialog',
      target: { selector: '[data-tour="variant-start"]', placement: 'bottom' }
    },
    {
      id: 'variant-end',
      rail: 'End',
      section: 'sand',
      title: 'Then where it is going',
      body:
        'Scroll past Intermediate stops to Ending and choose the work site. Start and end together are what the ' +
        'router needs — leave either as “manual only” and no route can be measured.',
      primary: 'Picked it',
      screen: 'the Create Lead dialog',
      target: { selector: '[data-tour="variant-end"]', placement: 'top' }
    },
    {
      id: 'variant-route',
      rail: 'The route',
      section: 'sand',
      title: 'The route drew itself',
      body:
        'With both ends chosen the road route appears on the map and the distance is measured along it — not as a ' +
        'straight line. That measured distance is what the lead charge is based on, and nothing here is typed by ' +
        'hand.',
      primary: 'Next — save it',
      screen: 'the Create Lead dialog',
      target: { selector: '[data-tour="variant-map"]', placement: 'left', pad: 2 }
    },
    {
      id: 'variant-save',
      rail: 'Save',
      section: 'sand',
      actionLabel: 'Create Lead',
      title: 'Save the Material',
      body:
        'It joins the material, and every item using Sand can now pick the charge up. Cancelling closes the ' +
        'dialog too — this card waits for the Material, not for the dialog.',
      primary: 'Saved',
      screen: 'the Create Lead dialog',
      target: { selector: '[data-tour="variant-save"]', placement: 'top' }
    },
    {
      id: 'apply-usages',
      rail: 'Usages',
      section: 'sand',
      title: 'Tick where this route applies',
      body:
        'A saved Material charges nothing until it is linked to work. One material can reach the site by more than ' +
        'one route, so check the items this route serves and press Apply Checked — only those items pick the ' +
        'charge up.',
      primary: 'Applied',
      screen: 'the Sand material page',
      target: { text: 'Apply Checked', placement: 'top' }
    },
    {
      id: 'stone',
      rail: 'Stone',
      eyebrow: 'ASSIGNMENT',
      assignment: true,
      title: 'Same three moves, no more hand-holding',
      body:
        'Press Back, open Rough stone from the same list, and give it what you gave Sand: Create Point for the ' +
        'quarry, Create Lead from it to site, then tick its usages and Apply Checked. This card moves on when ' +
        'a stone route is actually applied — not before.',
      primary: 'Got it — set it aside',
      screen: 'the Lead panel, bottom left'
    },
    {
      // After the assignment the reader is standing on a material page, not the
      // dashboard the print steps talk about. Send them back before pointing at
      // controls that are not on their screen.
      id: 'back-to-lead',
      rail: 'Dashboard',
      section: 'paper',
      actionLabel: 'Back',
      title: 'Back to the Lead Dashboard',
      body: 'The printed chart covers every material at once, and it lives on the dashboard rather than here.',
      primary: 'Back',
      screen: 'the material page',
      target: { selector: '[data-tour="lead-back"]', placement: 'bottom' }
    },
    {
      id: 'lead-print-preview',
      rail: 'Preview',
      section: 'paper',
      title: 'Check both routes on paper',
      body:
        'Print Preview shows the chart, the rate calculations, and a route map — scroll down to see the map. ' +
        'This is what the sanction file actually gets.',
      primary: 'Opened it',
      screen: 'the Lead Dashboard',
      target: { text: 'Print Preview', within: '.dash-actions', placement: 'bottom' }
    },
    {
      id: 'map-layout',
      rail: 'Map layout',
      section: 'paper',
      title: 'Reshape the printed map if you need to',
      body:
        'Landscape suits a wide route; a compact one reads better tall. Map Print Studio controls its own ' +
        'separate page, including paper, orientation, map size, labels and legend.',
      primary: 'Opened it',
      screen: 'the Lead Dashboard',
      target: { text: 'Map Print Studio', within: '.dash-actions', placement: 'bottom' }
    },
    {
      id: 'map-resize',
      rail: 'Resize',
      section: 'paper',
      title: 'Set the map box dimensions',
      body:
        'Choose Fill page or enter a fixed height in millimetres. The preview and the saved map PDF use the ' +
        'same dimensions, and closing saves the layout with the project.',
      primary: 'Sized and closed',
      screen: 'the Map Print Studio screen'
    },
    {
      id: 'lead-print-view',
      rail: 'Print view',
      section: 'paper',
      title: 'Edit the Lead statement in Typst',
      body:
        'Open Print Studio opens the Typst source and compiled Lead Statement. The route map remains a separate ' +
        'map-only page under Map Print Studio.',
      primary: 'Checked it',
      screen: 'the Lead Dashboard',
      target: { text: 'Open Print Studio', within: '.dash-actions', placement: 'bottom' }
    },
    {
      // Seigniorage is its own dashboard, reached from the bottom panel. The
      // chapter used to jump straight to "press Sync" while the reader was still
      // looking at Lead.
      id: 'open-seigniorage',
      rail: 'Open',
      section: 'royalty',
      actionLabel: 'Seigniorage at the bottom of the sidebar',
      title: 'Seigniorage has its own dashboard',
      body:
        'Same bottom-left panel, first tab. Press Seigniorage and the royalty dashboard replaces the Lead one on ' +
        'the right.',
      primary: 'Opened it',
      screen: 'the bottom-left panel',
      target: { selector: '[data-tour="panel-tab-seigniorage"]', placement: 'top', pad: 3 }
    },
    {
      id: 'seigniorage',
      rail: 'Sync',
      section: 'royalty',
      title: 'Seigniorage reads the leads you just set',
      body:
        'The government royalty on earth, sand and stone is charged per cum extracted — it needs to know the ' +
        'quantities and the leads to compute correctly. Sync it now that both are in place.',
      primary: 'Synced',
      screen: 'the Seigniorage dashboard',
      target: { text: 'Sync', within: '.dash-actions', placement: 'bottom' }
    },
    {
      id: 'seigniorage-print',
      rail: 'Statement',
      section: 'royalty',
      title: 'Check the statement before it is filed',
      body:
        'This is the Statement of Seigniorage Charges exactly as it will print — the same discipline as every ' +
        'other total in this app: sync, then look at the real output.',
      primary: 'Finish chapter 2',
      screen: 'the Seigniorage dashboard',
      target: { text: 'Open Print Studio', within: '.dash-actions', placement: 'bottom' }
    }
  ],
  complete: {
    title: 'Materials now travel from somewhere.',
    checklist: [
      'Sand opened from the Lead panel, given a point, a route, and applied usages',
      'The same done for Stone, unassisted — and verified, not taken on trust',
      'The printed lead chart and map checked, then Seigniorage synced and read'
    ]
  }
}

export default chapter2
