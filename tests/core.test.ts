import { describe, expect, test } from 'claude-code/testing'

import { addChange, addChanges, totals } from '../src/core/changes'
import { changeFromHunks, changesFromDiff } from '../src/core/diff'
import { displayPath } from '../src/core/paths'
import { ReplyTracker } from '../src/core/reply-tracker'

const change = (path: string, added: number, removed: number, isNew = false, patch = 'p') => ({
  path,
  added,
  removed,
  isNew,
  patch,
})

describe('changes', () => {
  test('changes to the same file add up into one row, in first-seen order', async () => {
    const files = addChanges([], [change('/a', 1, 0, true, 'p1'), change('/b', 2, 1), change('/a', 3, 2, false, 'p2')])

    expect(files).toEqual([change('/a', 4, 2, true, 'p1\np2'), change('/b', 2, 1)])
  })

  test('adding never changes the list it is given', async () => {
    const files = [change('/a', 1, 0)]
    addChange(files, change('/a', 1, 1))

    expect(files).toEqual([change('/a', 1, 0)])
  })

  test('totals sum every file', async () => {
    expect(totals([change('/a', 4, 2), change('/b', 2, 1)])).toEqual({ added: 6, removed: 3 })
    expect(totals([])).toEqual({ added: 0, removed: 0 })
  })
})

describe('diff', () => {
  test('a structured patch counts its lines and becomes a unified diff', async () => {
    const result = changeFromHunks('/p/a.ts', [{ oldStart: 1, oldLines: 2, newStart: 1, newLines: 2, lines: [' x', '-old', '+new'] }], false)

    expect(result).toEqual({
      path: '/p/a.ts',
      added: 1,
      removed: 1,
      isNew: false,
      patch: '--- a//p/a.ts\n+++ b//p/a.ts\n@@ -1,2 +1,2 @@\n x\n-old\n+new',
    })
  })

  test('a patch with no hunks has nothing to show', async () => {
    expect(changeFromHunks('/p/a.ts', [], true)).toEqual(change('/p/a.ts', 0, 0, true, ''))
  })

  test('a git diff splits into files: modified, created and deleted', async () => {
    const diff = [
      'diff --git a/src/a.ts b/src/a.ts',
      'index 1..2 100644',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -1,2 +1,2 @@',
      ' ctx',
      '-old',
      '+new',
      'diff --git a/n.txt b/n.txt',
      'new file mode 100644',
      '--- /dev/null',
      '+++ b/n.txt',
      '@@ -0,0 +1 @@',
      '+uno',
      'diff --git a/gone.txt b/gone.txt',
      'deleted file mode 100644',
      '--- a/gone.txt',
      '+++ /dev/null',
      '@@ -1 +0,0 @@',
      '-adios',
      '',
    ].join('\n')

    const files = changesFromDiff(diff, '/repo')

    expect(files.map(f => [f.path, f.added, f.removed, f.isNew])).toEqual([
      ['/repo/src/a.ts', 1, 1, false],
      ['/repo/n.txt', 1, 0, true],
      ['/repo/gone.txt', 0, 1, false],
    ])
    expect(files[0]?.patch).toBe('--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,2 +1,2 @@\n ctx\n-old\n+new')
  })

  test('a binary file, with no lines to show, is left out', async () => {
    expect(changesFromDiff('diff --git a/i.png b/i.png\nBinary files a/i.png and b/i.png differ\n', '/repo')).toEqual([])
  })
})

describe('paths', () => {
  test('a path inside the session folder is shown relative to it', async () => {
    expect(displayPath('/proj/src/ui/card.tsx', '/proj')).toEqual({ name: 'card.tsx', folder: 'src/ui' })
    expect(displayPath('/proj/README.md', '/proj/')).toEqual({ name: 'README.md', folder: '' })
  })

  test('a long folder outside it keeps its last two parts', async () => {
    expect(displayPath('/tmp/a/b/c/x.txt', '/proj')).toEqual({ name: 'x.txt', folder: '…/b/c' })
    expect(displayPath('/tmp/a/x.txt', '/proj')).toEqual({ name: 'x.txt', folder: '/tmp/a' })
  })
})

describe('reply tracker', () => {
  const changes = [change('/a', 1, 0)]

  test('the card goes on the last block of the reply whose text ends the answer', async () => {
    const tracker = new ReplyTracker()
    tracker.startTurn()
    tracker.blockDrawn('m1', 'Primero.')
    tracker.blockDrawn('m2', 'Listo.')

    expect(tracker.endTurn('Primero.\n\nListo.', changes)).toBe('m2')
  })

  test('a last block drawn after the reply ends claims the card', async () => {
    const tracker = new ReplyTracker()
    tracker.startTurn()
    tracker.blockDrawn('m1', 'Primero.')
    expect(tracker.endTurn('Listo.', changes)).toBeUndefined()

    tracker.blockDrawn('m2', 'Listo.')
    expect(tracker.changesFor('m2', {})).toEqual(changes)
    expect(tracker.takeUnsavedCards()).toEqual({ m2: changes })
    expect(tracker.takeUnsavedCards()).toEqual({})
  })

  test('a block from an earlier reply never takes the card, even with the same text', async () => {
    const tracker = new ReplyTracker()
    tracker.startTurn()
    tracker.blockDrawn('old', 'Listo.')
    tracker.startTurn()
    expect(tracker.endTurn('Listo.', changes)).toBeUndefined()

    tracker.blockDrawn('old', 'Listo.')
    expect(tracker.changesFor('old', {})).toBeUndefined()
  })

  test('blocks drawn before the first reply since loading are never candidates', async () => {
    const tracker = new ReplyTracker()
    tracker.blockDrawn('m0', 'Listo.')
    tracker.startTurn()

    expect(tracker.endTurn('Listo.', changes)).toBeUndefined()
  })

  test('a reply without changes gets no card', async () => {
    const tracker = new ReplyTracker()
    tracker.startTurn()
    tracker.blockDrawn('m1', 'Listo.')

    expect(tracker.endTurn('Listo.', [])).toBeUndefined()
    tracker.blockDrawn('m1', 'Listo.')
    expect(tracker.changesFor('m1', {})).toBeUndefined()
  })

  test('a saved card is found by its block', async () => {
    expect(new ReplyTracker().changesFor('m1', { m1: changes })).toEqual(changes)
  })
})
