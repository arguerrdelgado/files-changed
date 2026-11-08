import { expect, test } from 'claude-code/testing'

import { fakeEngine, type Git } from './fake-engine'

const end = (turnId: string, answer = 'Listo.', agentId?: string): any => ({
  answer,
  durationMs: 1,
  isAborted: false,
  reason: 'answer',
  turnId,
  ...(agentId ? { agentId } : {}),
})

const block = (requestId: string, text = 'Listo.', surface = 'vscode') =>
  ({
    plugin: 'files-changed',
    component: 'AssistantMessage',
    requestId,
    surface,
    props: { text, isFirstOfReply: false },
  }) as any

test('the card goes under the last block of the reply, on every surface', async ($, on) => {
  fakeEngine(on)
  await $.session.start({ cwd: '/proj', surface: 'vscode', isInteractive: true })
  const old = await $.ui.mount(block('m0'))
  await $.turn.start({ text: 'hola', turnId: 't1' })
  const first = await $.ui.mount(block('m1', 'Empiezo.'))
  await $.tool.call({ tool: 'Edit', file_path: '/proj/src/a.ts', old_string: 'old', new_string: 'new' })
  await $.tool.call({ tool: 'Edit', file_path: '/proj/src/a.ts', old_string: 'old', new_string: 'new' })
  await $.tool.call({ tool: 'Write', file_path: '/proj/b.md', content: 'a\nb\nc\n' })
  const last = await $.ui.mount(block('m2'))
  await $.turn.complete(end('t1'))

  expect(await first.find({ type: 'Text', text: /files changed/ })).toBeUndefined()
  expect(await old.find({ type: 'Text', text: /files changed/ })).toBeUndefined()
  expect(await last.find({ type: 'Code' })).toBeUndefined()
  await last.press({ key: 'card:m2:/proj/src/a.ts' })
  expect(await last.find({ type: 'Code' })).toBeDefined()
  await last.unmount()

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount(block('m2', 'Listo.', surface))
    expect((await ui.find({ type: 'Text', text: /files changed/ }))?.text).toBe('2 files changed')
    expect(await ui.find({ type: 'Text', text: '+7' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '−2' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'src' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'new' })).toBeDefined()
    await ui.unmount()
  }
})

test('a last block drawn after the reply ends still gets the card', async ($, on) => {
  fakeEngine(on)
  await $.session.start({ cwd: '/proj', surface: 'vscode', isInteractive: true })
  await $.turn.start({ text: 'hola', turnId: 't1' })
  const first = await $.ui.mount(block('m1', 'Empiezo.'))
  await $.tool.call({ tool: 'Write', file_path: '/tmp/x/y/z/b.md', content: 'a\n' })
  await $.turn.complete(end('t1'))
  const last = await $.ui.mount(block('m2'))

  expect((await last.find({ type: 'Text', text: /file/ }))?.text).toBe('1 file changed')
  expect(await last.find({ type: 'Text', text: '/tmp/x/y/z' })).toBeDefined()
  expect(await last.find({ type: 'Text', text: 'Outside the project (1)' })).toBeDefined()
  expect(await first.find({ type: 'Text', text: /file/ })).toBeUndefined()
})

test('the language option turns the card Spanish; files outside the project go under ~', { options: { language: 'es' } }, async ($, on) => {
  fakeEngine(on)
  await $.session.start({ cwd: '/proj', surface: 'vscode', isInteractive: true })
  await $.turn.start({ text: 'hola', turnId: 't1' })
  await $.tool.call({ tool: 'Write', file_path: '/proj/a.md', content: 'a' })
  await $.tool.call({ tool: 'Write', file_path: '/home/me/.claude/memory/m.md', content: 'a' })
  const last = await $.ui.mount(block('m1'))
  await $.turn.complete(end('t1'))

  expect(await last.find({ type: 'Text', text: '2 archivos cambiados' })).toBeDefined()
  expect(await last.find({ type: 'Text', text: 'nuevo' })).toBeDefined()
  expect(await last.find({ type: 'Text', text: 'Fuera del proyecto (1)' })).toBeDefined()
  expect(await last.find({ type: 'Text', text: '~/.claude/memory' })).toBeDefined()
})

test('a card claimed while drawn survives the next reply', async ($, on) => {
  fakeEngine(on)
  await $.session.start({ cwd: '/proj', surface: 'vscode', isInteractive: true })
  await $.turn.start({ text: 'uno', turnId: 't1' })
  await $.tool.call({ tool: 'Write', file_path: '/proj/b.md', content: 'a' })
  await $.turn.complete(end('t1', 'Uno.'))
  const one = await $.ui.mount(block('m1', 'Uno.'))
  await one.unmount()
  await $.turn.start({ text: 'dos', turnId: 't2' })

  const again = await $.ui.mount(block('m1', 'Uno.'))
  expect((await again.find({ type: 'Text', text: /file/ }))?.text).toBe('1 file changed')
})

test('each reply gets its own card; replies without changes and subagent turns get none', async ($, on) => {
  fakeEngine(on)
  await $.session.start({ cwd: '/proj', surface: 'vscode', isInteractive: true })
  await $.turn.start({ text: 'uno', turnId: 't1' })
  await $.tool.call({ tool: 'Write', file_path: '/proj/b.md', content: 'a' })
  const one = await $.ui.mount(block('m1', 'Uno.'))
  await $.turn.complete(end('t1', 'Uno.'))
  await $.turn.start({ text: 'dos', turnId: 't2' })
  const two = await $.ui.mount(block('m2', 'Dos.'))
  await $.turn.complete(end('t2', 'Dos.'))
  await $.turn.complete(end('t3', 'Dos.', 'agent-1'))

  expect((await one.find({ type: 'Text', text: /file/ }))?.text).toBe('1 file changed')
  expect(await two.find({ type: 'Text', text: /file/ })).toBeUndefined()
})

test('the files a Bash command changes in a git repository are counted', async ($, on) => {
  let hasRun = false
  const repo: Git = args => {
    if (args === 'rev-parse --show-toplevel') return { exitCode: 0, stdout: '/proj\n' }
    if (args === 'stash create') return { exitCode: 0, stdout: hasRun ? 'bbb\n' : 'aaa\n' }
    if (args.startsWith('ls-files')) return { exitCode: 0, stdout: hasRun ? 'new.txt\0' : '' }
    if (args.startsWith('diff --no-renames'))
      return {
        exitCode: 0,
        stdout: 'diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,2 +1,2 @@\n ctx\n-old\n+new\n',
      }
    if (args.startsWith('diff --no-index'))
      return {
        exitCode: 1,
        stdout: 'diff --git a/new.txt b/new.txt\n--- /dev/null\n+++ b/new.txt\n@@ -0,0 +1,2 @@\n+uno\n+dos\n',
      }
    return { exitCode: 1, stdout: '' }
  }
  fakeEngine(on, { git: repo, onBash: () => void (hasRun = true) })
  await $.session.start({ cwd: '/proj', surface: 'vscode', isInteractive: true })
  await $.turn.start({ text: 'hola', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', command: "sed -i 's/old/new/' src/a.ts && printf 'uno\\ndos\\n' > new.txt" })
  const last = await $.ui.mount(block('m1'))
  await $.turn.complete(end('t1'))

  expect((await last.find({ type: 'Text', text: /files changed/ }))?.text).toBe('2 files changed')
  expect(await last.find({ type: 'Text', text: '+3' })).toBeDefined()
  expect(await last.find({ type: 'Text', text: '−1' })).toBeDefined()
  expect(await last.find({ type: 'Text', text: 'new' })).toBeDefined()
})

/**
 * A git repository whose working tree moves through versions: `stash create`
 * answers the current one (`v0`, `v1`, ...) and a diff between two versions
 * lists the files changed in between.
 */
function versionedRepo(sections: Record<number, string>) {
  const repo = { version: 0, git: (() => ({ exitCode: 0, stdout: '' })) as Git }
  repo.git = args => {
    if (args === 'rev-parse --show-toplevel') return { exitCode: 0, stdout: '/proj\n' }
    if (args === 'stash create') return { exitCode: 0, stdout: `v${repo.version}\n` }
    if (args.startsWith('ls-files')) return { exitCode: 0, stdout: '' }
    const range = /^diff --no-renames .* v(\d+) v(\d+)$/.exec(args)
    if (range) {
      const [from, to] = [Number(range[1]), Number(range[2])]
      const changed = Object.entries(sections).filter(([version]) => Number(version) > from && Number(version) <= to)
      return { exitCode: 0, stdout: changed.map(([, section]) => section).join('') }
    }
    return { exitCode: 1, stdout: '' }
  }
  return repo
}

const section = (file: string, lines: string) => `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -1,2 +1,2 @@\n${lines}`

test('a file another agent edits while a Bash command runs is counted once', async ($, on) => {
  const repo = versionedRepo({ 1: section('x.ts', ' ctx\n-old\n+new1\n+new2\n'), 2: section('a.ts', ' ctx\n-old\n+new\n') })
  fakeEngine(on, {
    git: args => repo.git(args),
    onBash: async () => {
      await $.tool.call({ tool: 'Edit', file_path: '/proj/x.ts', old_string: 'old', new_string: 'new' })
      repo.version = 1
      repo.version = 2
    },
  })
  await $.session.start({ cwd: '/proj', surface: 'vscode', isInteractive: true })
  await $.turn.start({ text: 'hola', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', command: 'make' })
  const last = await $.ui.mount(block('m1'))
  await $.turn.complete(end('t1'))

  expect(await last.find({ type: 'Text', text: '+3' })).toBeDefined()
  expect(await last.find({ type: 'Text', text: '−2' })).toBeDefined()
  expect(await last.find({ type: 'Text', text: '+4' })).toBeUndefined()
})

test('two Bash commands that overlap count each change once', async ($, on) => {
  const repo = versionedRepo({ 1: section('a.ts', ' ctx\n-old\n+new\n'), 2: section('b.ts', ' ctx\n-old\n+new\n') })
  fakeEngine(on, {
    git: args => repo.git(args),
    onBash: async command => {
      if (command === 'outer') {
        repo.version = 1
        await $.tool.call({ tool: 'Bash', command: 'inner' })
      } else repo.version = 2
    },
  })
  await $.session.start({ cwd: '/proj', surface: 'vscode', isInteractive: true })
  await $.turn.start({ text: 'hola', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', command: 'outer' })
  const last = await $.ui.mount(block('m1'))
  await $.turn.complete(end('t1'))

  expect(await last.find({ type: 'Text', text: '+2' })).toBeDefined()
  expect(await last.find({ type: 'Text', text: '−2' })).toBeDefined()
  expect(await last.find({ type: 'Text', text: '+3' })).toBeUndefined()
})

test('deleted and binary files are marked, and new files past the limit are counted', async ($, on) => {
  let hasRun = false
  const created = Array.from({ length: 52 }, (_, i) => `f${i}.txt`)
  const repo: Git = args => {
    if (args === 'rev-parse --show-toplevel') return { exitCode: 0, stdout: '/proj\n' }
    if (args === 'stash create') return { exitCode: 0, stdout: hasRun ? 'bbb\n' : 'aaa\n' }
    if (args.startsWith('ls-files')) return { exitCode: 0, stdout: hasRun ? created.join('\0') : '' }
    if (args.startsWith('diff --no-renames'))
      return {
        exitCode: 0,
        stdout: [
          'diff --git a/gone.txt b/gone.txt',
          'deleted file mode 100644',
          '--- a/gone.txt',
          '+++ /dev/null',
          '@@ -1 +0,0 @@',
          '-bye',
          'diff --git a/logo.png b/logo.png',
          'Binary files a/logo.png and b/logo.png differ',
          '',
        ].join('\n'),
      }
    if (args.startsWith('diff --no-index')) {
      const file = args.split(' ').pop()
      return { exitCode: 1, stdout: `diff --git a/${file} b/${file}\n--- /dev/null\n+++ b/${file}\n@@ -0,0 +1 @@\n+x\n` }
    }
    return { exitCode: 1, stdout: '' }
  }
  fakeEngine(on, { git: repo, onBash: () => void (hasRun = true) })
  await $.session.start({ cwd: '/proj', surface: 'vscode', isInteractive: true })
  await $.turn.start({ text: 'hola', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', command: './generate.sh' })
  const last = await $.ui.mount(block('m1'))
  await $.turn.complete(end('t1'))

  expect(await last.find({ type: 'Text', text: '54 files changed' })).toBeDefined()
  expect(await last.find({ type: 'Text', text: 'deleted' })).toBeDefined()
  expect(await last.find({ type: 'Text', text: 'binary' })).toBeDefined()
  expect(await last.find({ type: 'Text', text: 'and 2 more files' })).toBeDefined()
})
