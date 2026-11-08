import { describe, expect, test } from 'claude-code/testing'

import { BashWindows } from '../src/core/bash-windows'
import { addChange, addChanges, fileCount, hasChanges, mergeChanges, NO_CHANGES, totals } from '../src/core/changes'
import { changeFromHunks, changesFromDiff } from '../src/core/diff'
import { displayPath } from '../src/core/paths'
import { ReplyTracker } from '../src/core/reply-tracker'
import { serial } from '../src/core/serial'
import { labelsFor } from '../src/ui/labels'
import type { FileStatus } from '../types'

const change = (path: string, added: number, removed: number, status: FileStatus = 'modified', patch = 'p') => ({
  path,
  added,
  removed,
  status,
  isBinary: false,
  patch,
})

describe('changes', () => {
  test('changes to the same file add up into one row, in first-seen order', async () => {
    const files = addChanges([], [change('/a', 1, 0, 'added', 'p1'), change('/b', 2, 1), change('/a', 3, 2, 'modified', 'p2')])

    expect(files).toEqual([change('/a', 4, 2, 'added', 'p1\np2'), change('/b', 2, 1)])
  })

  test('a file deleted after any change is deleted; deleted then created again is modified', async () => {
    expect(addChanges([], [change('/a', 1, 0, 'added'), change('/a', 0, 1, 'deleted')])[0]?.status).toBe('deleted')
    expect(addChanges([], [change('/a', 0, 1, 'deleted'), change('/a', 2, 0, 'added')])[0]?.status).toBe('modified')
  })

  test('two parts of a reply merge, unlisted files included', async () => {
    const merged = mergeChanges({ files: [change('/a', 1, 0)], unlisted: 2 }, { files: [change('/a', 1, 1)], unlisted: 3 })

    expect(merged).toEqual({ files: [change('/a', 2, 1, 'modified', 'p\np')], unlisted: 5 })
    expect(fileCount(merged)).toBe(6)
    expect(hasChanges(NO_CHANGES)).toBe(false)
    expect(hasChanges({ files: [], unlisted: 1 })).toBe(true)
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
    const result = changeFromHunks('/p/a.ts', [{ oldStart: 1, oldLines: 2, newStart: 1, newLines: 2, lines: [' x', '-old', '+new'] }], 'modified')

    expect(result).toEqual({
      path: '/p/a.ts',
      added: 1,
      removed: 1,
      status: 'modified',
      isBinary: false,
      patch: '--- a//p/a.ts\n+++ b//p/a.ts\n@@ -1,2 +1,2 @@\n x\n-old\n+new',
    })
  })

  test('a patch with no hunks has nothing to show', async () => {
    expect(changeFromHunks('/p/a.ts', [], 'added')).toEqual(change('/p/a.ts', 0, 0, 'added', ''))
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

    expect(files.map(f => [f.path, f.added, f.removed, f.status])).toEqual([
      ['/repo/src/a.ts', 1, 1, 'modified'],
      ['/repo/n.txt', 1, 0, 'added'],
      ['/repo/gone.txt', 0, 1, 'deleted'],
    ])
    expect(files[0]?.patch).toBe('--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,2 +1,2 @@\n ctx\n-old\n+new')
  })

  test('a binary file is listed with no lines, whatever its name holds', async () => {
    const diff = [
      'diff --git a/i.png b/i.png',
      'Binary files a/i.png and b/i.png differ',
      'diff --git a/new.png b/new.png',
      'new file mode 100644',
      'Binary files /dev/null and b/new.png differ',
      'diff --git a/x and y.bin b/x and y.bin',
      'deleted file mode 100644',
      'Binary files a/x and y.bin and /dev/null differ',
      'diff --git a/a and b.bin b/a and b.bin',
      'Binary files a/a and b.bin and b/a and b.bin differ',
      '',
    ].join('\n')

    expect(changesFromDiff(diff, '/repo').map(f => [f.path, f.status, f.isBinary, f.added, f.patch])).toEqual([
      ['/repo/i.png', 'modified', true, 0, ''],
      ['/repo/new.png', 'added', true, 0, ''],
      ['/repo/x and y.bin', 'deleted', true, 0, ''],
      ['/repo/a and b.bin', 'modified', true, 0, ''],
    ])
  })
})

describe('paths', () => {
  test('a path inside the session folder is shown relative to it', async () => {
    expect(displayPath('/proj/src/ui/card.tsx', '/proj')).toEqual({ name: 'card.tsx', folder: 'src/ui', isOutside: false })
    expect(displayPath('/proj/README.md', '/proj/')).toEqual({ name: 'README.md', folder: '', isOutside: false })
  })

  test('a path outside it is shown under ~ in the home folder, else in full', async () => {
    expect(displayPath('/home/me/.claude/memory/m.md', '/proj', '/home/me')).toEqual({
      name: 'm.md',
      folder: '~/.claude/memory',
      isOutside: true,
    })
    expect(displayPath('/home/me/notes.md', '/proj', '/home/me/')).toEqual({ name: 'notes.md', folder: '~', isOutside: true })
    expect(displayPath('/tmp/a/x.txt', '/proj', '/home/me')).toEqual({ name: 'x.txt', folder: '/tmp/a', isOutside: true })
    expect(displayPath('/projection/x.txt', '/proj')).toEqual({ name: 'x.txt', folder: '/projection', isOutside: true })
  })
})

describe('reply tracker', () => {
  const changes = { files: [change('/a', 1, 0)], unlisted: 0 }

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

    expect(tracker.endTurn('Listo.', NO_CHANGES)).toBeUndefined()
    tracker.blockDrawn('m1', 'Listo.')
    expect(tracker.changesFor('m1', {})).toBeUndefined()
  })

  test('a saved card is found by its block', async () => {
    expect(new ReplyTracker().changesFor('m1', { m1: changes })).toEqual(changes)
  })
})

describe('bash windows', () => {
  const a = change('/r/a.ts', 1, 1)
  const b = change('/r/b.ts', 1, 1)

  test('a window alone diffs from its own first snapshot', async () => {
    const windows = new BashWindows<string>()
    const ticket = windows.open('s0')
    const start = windows.startOf(ticket)

    expect(start?.snapshot).toBe('s0')
    expect(windows.close(ticket, 's1', [a], start?.at ?? 0)).toEqual([a])
  })

  test('the first window to close over a change reports it, and the other skips it', async () => {
    const windows = new BashWindows<string>()
    const outer = windows.open('s0')
    const inner = windows.open('s1')

    expect(windows.startOf(inner)?.snapshot).toBe('s0')
    windows.close(inner, 's2', [a, b], windows.startOf(inner)?.at ?? 0)
    expect(windows.startOf(outer)?.snapshot).toBe('s2')
  })

  test('a later window starts from its own snapshot, not an older closing one', async () => {
    const windows = new BashWindows<string>()
    const first = windows.open('s0')
    windows.close(first, 's1', [], windows.startOf(first)?.at ?? 0)
    const second = windows.open('s2')

    expect(windows.startOf(second)?.snapshot).toBe('s2')
  })

  test('files Edit or Write changed during a window are left to them', async () => {
    const windows = new BashWindows<string>()
    windows.fileWritten('/r/b.ts')
    const ticket = windows.open('s0')
    windows.fileWritten('/r/a.ts')
    const start = windows.startOf(ticket)

    expect(windows.close(ticket, 's1', [a, b], start?.at ?? 0)).toEqual([b])
  })

  test('a cancelled window reports nothing and holds nothing back', async () => {
    const windows = new BashWindows<string>()
    const ticket = windows.open('s0')
    windows.cancel(ticket)

    expect(windows.startOf(ticket)).toBeUndefined()
  })
})

describe('serial', () => {
  test('tasks run one at a time, in order, even when one fails', async () => {
    const inOrder = serial()
    const log: string[] = []
    const slow = inOrder(async () => {
      await Promise.resolve()
      log.push('first')
      throw new Error('no')
    })
    const fast = inOrder(async () => {
      log.push('second')
      return 2
    })

    await slow.catch(() => undefined)
    expect(await fast).toBe(2)
    expect(log).toEqual(['first', 'second'])
  })
})

describe('labels', () => {
  test('English unless the option asks for Spanish', async () => {
    expect(labelsFor(undefined).filesChanged(2)).toBe('2 files changed')
    expect(labelsFor('fr').filesChanged(1)).toBe('1 file changed')
    expect(labelsFor('es').filesChanged(2)).toBe('2 archivos cambiados')
    expect(labelsFor('en').moreFiles(1)).toBe('and 1 more file')
    expect(labelsFor('es').outsideProject(3)).toBe('Fuera del proyecto (3)')
  })
})
