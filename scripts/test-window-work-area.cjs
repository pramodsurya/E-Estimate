// The frameless main window must never open or maximize behind the Windows
// taskbar. Tauri's maximize() alone sizes a decorations:false window to the
// full monitor, so both the maximize toggle and startup must clamp the bounds
// to the monitor work area afterwards (keeping the OS maximized flag intact).

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8')

const windowCmds = read('src-tauri/src/window_cmds.rs')
const lib = read('src-tauri/src/lib.rs')

// --- Maximize toggle still uses the real OS maximize flag ------------------
{
  const toggle = windowCmds.match(/pub fn window_toggle_maximize[\s\S]*?\n\}/)
  assert.ok(toggle, 'window_toggle_maximize must exist in window_cmds.rs')
  const body = toggle[0]
  assert.ok(body.includes('window.maximize()'), 'toggle must call window.maximize() first')
  assert.ok(body.includes('window.unmaximize()'), 'toggle must still unmaximize when maximized')
  assert.ok(
    body.includes('clamp_to_work_area(&window)'),
    'toggle must clamp to the work area after maximizing'
  )
  assert.ok(
    body.indexOf('window.maximize()') < body.indexOf('clamp_to_work_area'),
    'maximize() must run before the clamp so the OS maximized flag stays correct'
  )
}

// --- The clamp itself targets the monitor work area, Windows only ----------
{
  const clamp = windowCmds.match(/pub fn clamp_to_work_area[\s\S]*?\n\}/)
  assert.ok(clamp, 'clamp_to_work_area must exist in window_cmds.rs')
  const body = clamp[0]
  assert.ok(
    body.includes('cfg(target_os = "windows")'),
    'the clamp must be gated to Windows'
  )
  assert.ok(body.includes('current_monitor'), 'the clamp must use the current monitor')
  assert.ok(body.includes('work_area()'), 'the clamp must read the monitor work area')
  assert.ok(body.includes('set_position'), 'the clamp must correct the window position')
  assert.ok(body.includes('set_size'), 'the clamp must correct the window size')
}

// --- Startup corrects a session restored maximized --------------------------
{
  assert.ok(
    lib.includes('clamp_to_work_area'),
    'lib.rs setup must clamp the main window when it starts maximized'
  )
  assert.ok(
    lib.includes('get_webview_window("main")'),
    'lib.rs setup must look up the main window'
  )
  assert.ok(
    lib.includes('is_maximized'),
    'lib.rs setup must only clamp when the window starts maximized'
  )
}

console.log('test-window-work-area: ok')
