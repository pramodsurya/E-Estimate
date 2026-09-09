import type { TutorialChapter } from '../types'

/** Chapter 4 — the last mile: the document itself, then the PDF. */
const chapter4: TutorialChapter = {
  id: 'ch4',
  number: 4,
  title: 'Miscellaneous, Front Page, Signatures & Export',
  blurb: 'The last mile: checking the document, then getting it out as a PDF.',
  minutes: 7,
  steps: [
    {
      // Chapter 3 leaves the reader in the DATA workspace. Every control this
      // chapter names is on the project dashboard, so getting there is the
      // first real step rather than an assumption.
      id: 'to-explorer',
      actionLabel: 'the Explorer icon in the activity bar',
      rail: 'Explorer',
      eyebrow: 'CHAPTER 4',
      title: 'Back to the project itself',
      body:
        'Everything left to do — the total, the cover, the signatures, the export — belongs to the project as a ' +
        'whole. Start by bringing the Explorer back.',
      primary: 'Opened it',
      screen: 'the activity bar on the far left',
      target: { selector: '[data-tour="activity-explorer"]', placement: 'right' }
    },
    {
      id: 'to-project',
      actionLabel: 'the project row at the top of the Explorer',
      rail: 'Project',
      title: 'Open the project dashboard',
      body:
        'The top row of the tree is the project. Click it and the dashboard that folds every component together ' +
        'opens on the right.',
      primary: 'Opened it',
      screen: 'the Explorer',
      target: { selector: '[data-tour="tree-title"]', placement: 'right' }
    },
    {
      id: 'sync-project',
      rail: 'Sync',
      section: 'misc',
      title: 'Sync before anything else',
      body:
        'Sync folds every component, the lead you set and the seigniorage figure into one project total — do ' +
        'this any time something upstream changed.',
      primary: 'Synced',
      screen: 'the project dashboard',
      target: { text: 'Sync', within: '.dash-actions', placement: 'bottom' }
    },
    {
      id: 'real-total',
      actionLabel: 'Add Item under Miscellaneous',
      rail: 'Misc',
      section: 'misc',
      title: 'That is the real total',
      body:
        'Items, lead and seigniorage are already in. Now add anything that is not tied to a specific item — ' +
        'contingency, tools, incidentals — as a Miscellaneous charge.',
      primary: 'Add Miscellaneous',
      screen: 'the project dashboard',
      target: { selector: '[data-tour="add-misc"]', placement: 'left' }
    },
    {
      id: 'misc-name',
      rail: 'Name',
      section: 'misc',
      title: 'Name it',
      body: 'A short label is enough — this is what appears on the abstract.',
      primary: 'Named it',
      screen: 'the Add Miscellaneous Item dialog',
      target: { selector: '[data-tour="misc-name"]', placement: 'bottom' }
    },
    {
      id: 'misc-amount',
      rail: 'Amount',
      section: 'misc',
      title: 'And the amount',
      body: 'One lump sum — it lands on the abstract exactly as typed, no rate lookup needed.',
      primary: 'Entered it',
      screen: 'the Add Miscellaneous Item dialog',
      target: { selector: '[data-tour="misc-amount"]', placement: 'bottom' }
    },
    {
      id: 'misc-add',
      rail: 'Add',
      section: 'misc',
      title: 'Add it',
      body:
        'It joins the total immediately and shows on the dashboard as its own line. This card waits for the line, ' +
        'not for the dialog — cancelling adds nothing.',
      primary: 'Added',
      screen: 'the Add Miscellaneous Item dialog',
      target: { selector: '[data-tour="misc-add"]', placement: 'top' }
    },
    {
      id: 'front-page',
      actionLabel: 'Front Page in the Explorer',
      rail: 'Front Page',
      section: 'documents',
      title: 'Now the Front Page and Introduction',
      body: 'Both are plain documents, not forms — open Front Page from the Explorer on the left.',
      primary: 'Opened it',
      screen: 'the Explorer',
      target: { selector: '[data-tour-page="front"]', placement: 'right' }
    },
    {
      id: 'front-page-edit',
      rail: 'Edit cover',
      section: 'documents',
      title: 'You can change anything here',
      body:
        'This is a normal document — title, place, every line is click-and-type, no fields or validation. ' +
        'Change it exactly as you would in a word processor.',
      primary: 'Next — the Introduction',
      screen: 'the Front Page'
    },
    {
      id: 'introduction',
      actionLabel: 'Introduction in the Explorer',
      rail: 'Intro',
      section: 'documents',
      title: 'Open the Introduction',
      body:
        'It sits directly under Front Page in the tree. A starting paragraph is drafted from the project ' +
        'details — edit it freely, or replace it outright. It prints exactly as it looks on screen.',
      primary: 'Opened it',
      screen: 'the Explorer',
      target: { selector: '[data-tour-page="introduction"]', placement: 'right' }
    },
    {
      id: 'back-to-project',
      actionLabel: 'the project row at the top of the Explorer',
      rail: 'Dashboard',
      section: 'signatures',
      title: 'Back to the dashboard for the signatures',
      body: 'The signature block is a project-wide setting, so it lives on the project dashboard.',
      primary: 'Opened it',
      screen: 'the Explorer',
      target: { selector: '[data-tour="tree-title"]', placement: 'right' }
    },
    {
      id: 'signatures',
      rail: 'Signatures',
      section: 'signatures',
      title: 'The Signature / Footer card',
      body:
        'Every estimate needs the sanctioning chain signed off. What you set here is the project default — every ' +
        'component, DATA page and Page below inherits it unless it takes over for itself.',
      primary: 'Found it',
      screen: 'the project dashboard',
      target: { selector: '[data-tour="signature-card"]', placement: 'top' }
    },
    {
      id: 'sign-every-page',
      rail: 'Every page',
      section: 'signatures',
      title: 'Print it on every page',
      body:
        'Tick Enabled, then set Placement to “Every printed page”. Left at “End of this subject” the block only ' +
        'prints once — fine for a short estimate, wrong for a multi-page component.',
      primary: 'Turned it on',
      screen: 'the signature card',
      target: { selector: '[data-tour="signature-placement"]', placement: 'top' }
    },
    {
      id: 'sign-add-row',
      rail: 'Add Row',
      section: 'signatures',
      title: 'Add the first signatory',
      body:
        'Each row is a Designation and Office pair — Assistant Executive Engineer / Sub Division is the usual ' +
        'first. Type into the row after adding it; it saves as you leave each field.',
      primary: 'Added the first',
      screen: 'the signature card',
      target: { selector: '[data-tour="signature-add-row"]', placement: 'top' }
    },
    {
      id: 'sign-two-more',
      rail: 'Two more',
      eyebrow: 'ASSIGNMENT',
      assignment: true,
      title: 'Your turn — two more',
      body:
        'Add the Executive Engineer and the Superintending Engineer that a sanction usually needs. This card ' +
        'moves on when three rows actually exist.',
      primary: 'Got it — set it aside',
      screen: 'the signature card'
    },
    {
      id: 'sync-again',
      rail: 'Sync',
      section: 'export',
      title: 'Sync once more',
      body:
        'The signatures and the miscellaneous charge are new since the last Sync — one more pass folds them ' +
        'into the print output.',
      primary: 'Synced',
      screen: 'the project dashboard',
      target: { text: 'Sync', within: '.dash-actions', placement: 'bottom' }
    },
    {
      // Corrected: Edit Project is a button on the project dashboard, not an
      // entry in the File menu. The old copy sent readers hunting for a menu
      // item that has never existed.
      id: 'edit-project',
      actionLabel: 'Edit Project',
      rail: 'Edit',
      section: 'afterwards',
      title: 'One more thing — changing the year',
      body:
        'If the sanction year changes later, you do not redo any of this. Edit Project sits on the project ' +
        'dashboard and reopens the same details you set at the very start.',
      primary: 'Opened it',
      screen: 'the project dashboard',
      target: { selector: '[data-tour="edit-project"]', placement: 'bottom' }
    },
    {
      id: 'pick-year',
      rail: 'New year',
      section: 'afterwards',
      title: 'Pick the new year',
      body: 'Every rate in the project recalculates against the new book the moment you save.',
      primary: 'Finish chapter 4',
      screen: 'the Edit Project dialog',
      target: { selector: '[data-tour="np-year"]', placement: 'bottom' }
    }
  ],
  complete: {
    title: 'You have completed Basic Estimate Preparation.',
    checklist: [
      'A miscellaneous charge added to the project total',
      'The Front Page and Introduction written as plain documents',
      'A three-deep signature chain set to print on every page',
      'The whole estimate checked in print view and exported as a PDF'
    ],
    body:
      'Setup, a component built by hand, Lead, Seigniorage, DATA, miscellaneous charges, the Front Page and ' +
      'Introduction, signatures, and a checked, exported PDF — the full basic workflow, start to finish. You ' +
      'can bring any chapter back later from Help ▸ Show me how.'
  }
}

export default chapter4
