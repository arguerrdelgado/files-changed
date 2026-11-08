import type { EngineInterface } from 'claude-code'

import type { ReplyChanges } from '../../types'
import { BashWindows } from '../core/bash-windows'
import { NO_CHANGES } from '../core/changes'
import { serial } from '../core/serial'
import { changesBetween, takeSnapshot, type Snapshot } from './git'

/**
 * Watches Bash calls for the files they change in the git repository, and
 * keeps each change counted once when calls overlap (see `BashWindows`).
 * A reload starts this over, which only matters for a call running then.
 */
const windows = new BashWindows<Snapshot>()

/** Closing windows one at a time keeps each diff's starting point current. */
const oneAtATime = serial()

/** Edit or Write changed a file: a Bash call open now must not report it again. */
export function noteFileWritten(path: string): void {
  windows.fileWritten(path)
}

/**
 * Runs a Bash call (`run`) between two snapshots of the repository, and
 * returns its result with the changes it made. Outside a git repository, or
 * when git fails, the call still runs and reports no changes; a failure is
 * written to the debug log.
 */
export async function watchBash<R extends { deny?: unknown }>(
  $: EngineInterface,
  run: () => Promise<R>,
): Promise<{ ran: R; changes: ReplyChanges }> {
  const before = await takeSnapshot($).catch(error => logFailure($, 'git snapshot', error))
  if (before === undefined) return { ran: await run(), changes: NO_CHANGES }

  const ticket = windows.open(before)
  let ran: R
  try {
    ran = await run()
  } catch (error) {
    windows.cancel(ticket)
    throw error
  }
  if (ran.deny !== undefined) {
    windows.cancel(ticket)
    return { ran, changes: NO_CHANGES }
  }

  const changes = await oneAtATime(async () => {
    const after = await takeSnapshot($)
    const start = windows.startOf(ticket)
    if (after === undefined || start === undefined) {
      windows.cancel(ticket)
      return NO_CHANGES
    }
    const found = await changesBetween($, start.snapshot, after)

    return { ...found, files: windows.close(ticket, after, found.files, start.at) }
  }).catch(error => {
    windows.cancel(ticket)
    return logFailure($, 'git diff', error) ?? NO_CHANGES
  })

  return { ran, changes }
}

function logFailure($: EngineInterface, what: string, error: unknown): undefined {
  $.ui.log(`files-changed: ${what} failed: ${String(error)}`, { to: 'debug' })

  return undefined
}
