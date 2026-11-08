import type { Register } from 'claude-code'

import { changeFromEditOrWrite } from '../src/adapters/edit-write'
import { changesSince, takeSnapshot } from '../src/adapters/git'
import {
  addTurnChanges,
  readCards,
  readOpenRow,
  readTurnChanges,
  resetTurnChanges,
  saveCards,
  toggleOpenRow,
} from '../src/adapters/store'
import { ReplyTracker } from '../src/core/reply-tracker'
import { renderCard } from '../src/ui/card'

/**
 * Wires Claude Code's events to the mod's modules. The hooks are listed in
 * the order a reply goes through them. Subagent turns (`e.agentId`) are not
 * replies: what their tools change counts toward the reply that spawned them.
 */

// A reload starts it over, losing only which block of a reply still being
// drawn gets its card.
const tracker = new ReplyTracker()

export const register: Register = on => {
  // 1. A reply starts: save the cards claimed while drawn, forget the last reply's changes.
  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      await saveCards($, tracker.takeUnsavedCards())
      await resetTurnChanges($)
      tracker.startTurn()
    }

    return next(e)
  })

  // 2. A file is edited or written.
  on('tool.call', { tool: ['Edit', 'Write'] }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError) return ran

    const change = changeFromEditOrWrite(ran.result)
    if (change) await addTurnChanges($, [change])

    return ran
  })

  // 3. A shell command runs: compare the git working tree before and after it.
  //    A command in the background changes files later, out of sight.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (e.run_in_background) return next(e)

    const before = await takeSnapshot($).catch(error => {
      $.ui.log(`files-changed: git snapshot failed: ${String(error)}`, { to: 'debug' })
      return undefined
    })
    const ran = await next(e)
    if (before === undefined || ran.deny !== undefined) return ran

    const changes = await changesSince($, before).catch(error => {
      $.ui.log(`files-changed: git diff failed: ${String(error)}`, { to: 'debug' })
      return []
    })
    if (changes.length > 0) await addTurnChanges($, changes)

    return ran
  })

  // 4. The reply ends: its changes go to the block that ends it.
  on('turn.complete', async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId !== undefined) return ran

    const changes = await readTurnChanges($)
    const blockId = tracker.endTurn(e.answer, changes)
    if (blockId !== undefined) await saveCards($, { [blockId]: changes })

    return ran
  })

  // 5. A message block is drawn: add the card when it has one.
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    tracker.blockDrawn(e.requestId, e.props.text)
    const changes = tracker.changesFor(e.requestId, await readCards($))
    const row = await next(e)
    if (changes === undefined || changes.length === 0) return row

    return renderCard($.ui.resolve(e), row, {
      blockId: e.requestId,
      changes,
      cwd: await $.session.cwd(),
      openRow: await readOpenRow($),
      onToggleRow: key => toggleOpenRow($, key),
    })
  })
}
