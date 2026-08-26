import type { TutorialChapter } from '../types'

/** Chapter 3 — the rate buildup behind every item, and where it comes from. */
const chapter3: TutorialChapter = {
  id: 'ch3',
  number: 3,
  title: 'DATA',
  blurb: 'The material, labour and lead makeup behind every rate — and the published prices they read from.',
  minutes: 6,
  steps: [
    {
      id: 'data-activity',
      actionLabel: 'the DATA icon in the activity bar',
      rail: 'DATA',
      eyebrow: 'CHAPTER 3',
      title: 'Every rate buildup lives here',
      body:
        'DATA is the backend behind every item you have added — the material, labour and lead makeup of each ' +
        'rate, and the published Cement/Steel prices they all read from.',
      primary: 'Open the DATA Dashboard',
      screen: 'the activity bar on the far left',
      target: { selector: '[data-tour="activity-data"]', placement: 'right' }
    },
    {
      id: 'data-sync',
      rail: 'Sync',
      section: 'buildup',
      title: 'Sync compiles every DATA row',
      body:
        'This recompiles every item and its scoped edits against the current year, zone and published rates — ' +
        'do it whenever something upstream changed.',
      primary: 'Synced',
      screen: 'the DATA Dashboard',
      target: { text: 'Sync', within: '.dash-actions', placement: 'bottom' }
    },
    {
      // Same shape as the Lead panel in chapter 2: the list is in the bottom-left
      // panel, behind its own tab, and the next card is meaningless without it.
      id: 'data-panel',
      actionLabel: 'Data at the bottom of the sidebar',
      rail: 'Data panel',
      section: 'buildup',
      title: 'Every item is listed down here too',
      body:
        'You do not have to come to this dashboard at all — the Data tab in the bottom-left panel lists the same ' +
        'items, one click from wherever you are. Press it.',
      primary: 'Opened it',
      screen: 'the bottom-left panel',
      target: { selector: '[data-tour="panel-tab-data"]', placement: 'top', pad: 3 }
    },
    {
      id: 'open-data-item',
      actionLabel: 'any item row',
      rail: 'Open one',
      section: 'buildup',
      title: 'Open any item’s DATA',
      body:
        'Click a row. The twisty beside it opens the component usages underneath, where the same DATA can be ' +
        'edited for one component alone — but the row itself opens the shared buildup.',
      primary: 'Opened it',
      screen: 'the Data panel, bottom left',
      target: { selector: '[data-tour="data-item-row"]', placement: 'right' }
    },
    {
      id: 'full-data',
      rail: 'Buildup',
      section: 'buildup',
      title: 'This is the whole buildup',
      body:
        'Material, quantity, rate, amount — everything that makes up the item’s price for this project, ' +
        'editable per component if you ever need to diverge from the published book.',
      primary: 'Scroll down',
      screen: 'the item’s Full DATA'
    },
    {
      id: 'lead-line',
      rail: 'Lead line',
      section: 'buildup',
      title: 'No separate step for this',
      body:
        'The route you applied in Chapter 2 already reached this rate on its own, as its own line. That is the ' +
        'whole point of applying a lead once instead of typing it into every item.',
      primary: 'Next — edit a row',
      screen: 'the item’s Full DATA'
    },
    {
      id: 'unlock',
      rail: 'Edit',
      section: 'buildup',
      title: 'Press Edit to unlock the buildup',
      body:
        'Rows stay published until you press Edit — and editing here only affects this project, never the shared ' +
        'backend book.',
      primary: 'Unlocked it',
      screen: 'the item’s Full DATA',
      target: { selector: '[data-tour="rate-edit"]', placement: 'bottom' }
    },
    {
      id: 'nudge',
      rail: 'Nudge',
      section: 'buildup',
      title: 'Correct a quantity for your site',
      body:
        'The rows are now editable. Change one — say this project uses slightly more sand per cum than the ' +
        'published mix. Nothing is committed while you type.',
      primary: 'Next — save it',
      screen: 'the item’s Full DATA'
    },
    {
      id: 'save-row',
      rail: 'Save',
      section: 'buildup',
      title: 'Save adopts it',
      body: 'The edit becomes this project’s version of the rate. Cancel would throw it away instead.',
      primary: 'Saved',
      screen: 'the item’s Full DATA',
      target: { selector: '[data-tour="rate-save"]', placement: 'bottom' }
    },
    {
      id: 'live',
      rail: 'Live',
      section: 'buildup',
      title: 'The new rate is already live',
      body:
        'Every dependent total — the rate, the item amount, the component cost — updated the moment you saved. ' +
        'Nothing else to press.',
      primary: 'On to Cement/Steel',
      screen: 'the item’s Full DATA'
    },
    {
      // Leaving Full DATA is a real move: while it is open it covers the whole
      // work area, so the sidebar links the next steps use go nowhere visible.
      id: 'close-data',
      rail: 'Back',
      section: 'prices',
      actionLabel: 'Back',
      title: 'Close the buildup first',
      body: 'Full DATA fills the work area. Press Back and the DATA workspace comes forward again.',
      primary: 'Back',
      screen: 'the item’s Full DATA',
      target: { selector: '[data-tour="rate-back"]', placement: 'bottom' }
    },
    {
      id: 'open-rates',
      actionLabel: 'Cement / Steel in the DATA sidebar',
      rail: 'Cement/Steel',
      section: 'prices',
      title: 'Published prices have their own page',
      body:
        'The DATA sidebar has four sections. Cement / Steel is the one that holds the government circular rates ' +
        'every buildup reads from.',
      primary: 'Opened it',
      screen: 'the DATA sidebar',
      target: { selector: '[data-tour="data-section-rates"]', placement: 'right' }
    },
    {
      id: 'circulars',
      rail: 'Circulars',
      section: 'prices',
      title: 'One published price feeds every DATA',
      body:
        'Cement and steel are priced by government circular, not per item. Adopt a month here and every DATA ' +
        'using either material re-prices at once.',
      primary: 'Chosen',
      screen: 'the Cement / Steel rates page',
      target: { selector: '[data-tour="material-circular"]', placement: 'bottom' }
    },
    {
      id: 'selected',
      rail: 'Staged',
      section: 'prices',
      title: 'The rates below are what that circular published',
      body:
        'Nothing has reached the project yet. The footer says “Not applied yet” for exactly this reason — until ' +
        'you press Apply, this is a preview you can discard.',
      primary: 'Next — apply it',
      screen: 'the Cement / Steel rates page'
    },
    {
      id: 'repriced',
      rail: 'Apply',
      section: 'prices',
      title: 'Apply re-prices every item using cement or steel',
      body:
        'Anything with cement or steel in its buildup — all in one move, none touched by hand. Re-run Sync on the ' +
        'DATA, Component and Project dashboards afterwards to fold the new prices into the totals.',
      primary: 'Applied',
      screen: 'the Cement / Steel rates page',
      target: { selector: '[data-tour="material-apply"]', placement: 'top' }
    },
    {
      id: 'open-catalogue',
      actionLabel: 'SOR / SSR DATA in the DATA sidebar',
      rail: 'Catalogue',
      section: 'source',
      title: 'Now the published book itself',
      body:
        'The last section is the official rate book — read-only, identical for every project on this year and ' +
        'zone. Open it.',
      primary: 'Opened it',
      screen: 'the DATA sidebar',
      target: { selector: '[data-tour="data-section-catalogue"]', placement: 'right' }
    },
    {
      id: 'catalogue',
      actionLabel: 'a published table',
      rail: 'A table',
      section: 'source',
      title: 'Pick any published table',
      body:
        'Basic SOR tables on the left, published complex tables — pipes, scaffolding — searchable beneath them. ' +
        'Open one to see the rates it publishes.',
      primary: 'Opened one',
      screen: 'the SOR / SSR DATA catalogue',
      target: { selector: '[data-tour="sor-catalogue"]', placement: 'right' }
    },
    {
      id: 'backend',
      rail: 'Source',
      section: 'source',
      title: 'This is where every rate ultimately comes from',
      body:
        'The exact material and labour buildup published for this code — what Full DATA adopts before any ' +
        'project edits or leads are layered on top.',
      primary: 'Finish chapter 3',
      screen: 'the backend DATA view'
    }
  ],
  complete: {
    title: 'Every rate now traces back to something.',
    checklist: [
      'An item’s Full DATA opened from the bottom panel, its Lead line seen, a row edited and saved',
      'A Cement/Steel circular applied, re-pricing every DATA at once',
      'The read-only published book checked'
    ]
  }
}

export default chapter3
