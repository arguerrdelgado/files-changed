import { describe, expect, test } from 'claude-code/testing'

import { changeFromEditOrWrite } from '../src/adapters/edit-write'
import { fakeEngine, type Git } from './fake-engine'

describe('edit and write', () => {
  const patch = [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 2, lines: ['-a', '+b', '+c'] }]

  test('an edit counts the lines of its patch', async () => {
    const result = {
      filePath: '/p/a.ts',
      oldString: 'a',
      newString: 'b\nc',
      originalFile: 'a',
      structuredPatch: patch,
      userModified: false,
      replaceAll: false,
    }

    expect(changeFromEditOrWrite(result)).toMatchObject({ path: '/p/a.ts', added: 2, removed: 1, isNew: false })
  })

  test('a write that creates a file with no patch counts each line once', async () => {
    const result = { type: 'create' as const, filePath: '/p/n.txt', content: 'a\nb\n', structuredPatch: [], originalFile: null }

    expect(changeFromEditOrWrite(result)).toMatchObject({ added: 2, removed: 0, isNew: true })
  })

  test('a write held for review changed nothing', async () => {
    const result = { type: 'update' as const, filePath: '/p/a.ts', content: 'x', structuredPatch: patch, originalFile: 'a', staged: true }

    expect(changeFromEditOrWrite(result)).toBeUndefined()
  })
})

// The git adapter needs the `$` a hook receives, so these run it through a Bash call.
describe('git', () => {
  const bash = { tool: 'Bash', command: 'make' } as const

  test('outside a git repository only one command runs', async ($, on) => {
    const commands: string[] = []
    fakeEngine(on, { git: args => (commands.push(args), { exitCode: 128, stdout: '' }) })
    await $.session.start({ cwd: '/proj', surface: 'vscode', isInteractive: true })
    await $.tool.call(bash)

    expect(commands).toEqual(['rev-parse --show-toplevel'])
  })

  test('inside one, only the documented commands run, read-only apart from stash create', async ($, on) => {
    const commands: string[] = []
    let hasRun = false
    const repo: Git = args => {
      commands.push(args)
      if (args === 'rev-parse --show-toplevel') return { exitCode: 0, stdout: '/proj\n' }
      if (args === 'stash create') return { exitCode: 0, stdout: hasRun ? 'b2\n' : '' }
      if (args === 'rev-parse HEAD') return { exitCode: 0, stdout: 'h1\n' }
      if (args.startsWith('ls-files')) return { exitCode: 0, stdout: hasRun ? 'n.txt\0' : '' }
      return { exitCode: args.startsWith('diff --no-index') ? 1 : 0, stdout: '' }
    }
    fakeEngine(on, { git: repo, onBash: () => (hasRun = true) })
    await $.session.start({ cwd: '/proj', surface: 'vscode', isInteractive: true })
    await $.tool.call(bash)

    expect(commands).toEqual([
      'rev-parse --show-toplevel',
      'stash create',
      'rev-parse HEAD',
      'ls-files --others --exclude-standard -z',
      'rev-parse --show-toplevel',
      'stash create',
      'ls-files --others --exclude-standard -z',
      'diff --no-renames --no-ext-diff --no-textconv h1 b2',
      'diff --no-index --no-ext-diff --no-textconv -- /dev/null n.txt',
    ])
  })
})
