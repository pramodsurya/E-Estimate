// Registers an "Insert Chart" button in Univer's native Insert ribbon tab
// (next to the image button), wired to a command that asks the editor — via the
// chart bus — to open the Insert Chart panel.
//
// Univer has no facade helper for custom menus, so we reach the DI injector off
// the facade (`univerAPI._injector`) and register a command + ribbon menu item
// directly. Everything is wrapped defensively: if the internal API ever shifts,
// charts still work through the editor's other entry points.

import { CommandType, ICommandService } from '@univerjs/core'
import { IMenuManagerService, MenuItemType, RibbonInsertGroup, RibbonPosition } from '@univerjs/ui'
import { requestInsert } from './chartBus'

const INSERT_CHART_COMMAND_ID = 'eestimate.operation.insert-chart'
const INSERT_CHART_ICON = 'eestimateInsertChartIcon'

/** Small bar-chart glyph used for the ribbon button. */
function InsertChartIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1.5" y="8.5" width="3" height="5.5" rx="0.5" fill="currentColor" />
      <rect x="6.5" y="5.5" width="3" height="8.5" rx="0.5" fill="currentColor" />
      <rect x="11.5" y="2.5" width="3" height="11.5" rx="0.5" fill="currentColor" />
    </svg>
  )
}

interface Disposable {
  dispose: () => void
}

/**
 * @param univerAPI the FUniver facade instance (typed loosely; we use private
 *   DI access that isn't on the public type surface).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerChartRibbonMenu(univerAPI: any): Disposable {
  const noop: Disposable = { dispose: () => {} }
  const injector = univerAPI?._injector
  if (!injector) return noop

  try {
    const commandService = injector.get(ICommandService)
    const menuManager = injector.get(IMenuManagerService)

    univerAPI.registerComponent(INSERT_CHART_ICON, InsertChartIcon)

    let cmdDisposable: Disposable | undefined
    try {
      cmdDisposable = commandService.registerCommand({
        id: INSERT_CHART_COMMAND_ID,
        type: CommandType.OPERATION,
        handler: () => {
          requestInsert()
          return true
        }
      })
    } catch {
      /* command already registered on this instance */
    }

    menuManager.mergeMenu({
      [RibbonPosition.INSERT]: {
        [RibbonInsertGroup.MEDIA]: {
          [INSERT_CHART_COMMAND_ID]: {
            order: 10,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            menuItemFactory: (): any => ({
              id: INSERT_CHART_COMMAND_ID,
              type: MenuItemType.BUTTON,
              icon: INSERT_CHART_ICON,
              tooltip: 'Insert Chart',
              title: 'Chart'
            })
          }
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    return {
      dispose: () => {
        try {
          cmdDisposable?.dispose()
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    return noop
  }
}
