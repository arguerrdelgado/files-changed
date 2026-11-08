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

  expect(await first.find({ type: 'Text', text: /archivos cambiados/ })).toBeUndefined()
  expect(await old.find({ type: 'Text', text: /archivos cambiados/ })).toBeUndefined()
  expect(await last.find({ type: 'Code' })).toBeUndefined()
  await last.press({ key: 'card:m2:/proj/src/a.ts' })
  expect(await last.find({ type: 'Code' })).toBeDefined()
  await last.unmount()

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount(block('m2', 'Listo.', surface))
    expect((await ui.find({ type: 'Text', text: /archivos cambiados/ }))?.text).toBe('2 archivos cambiados')
    expect(await ui.find({ type: 'Text', text: '+7' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '−2' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'src' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'nuevo' })).toBeDefined()
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

  expect((await last.find({ type: 'Text', text: /archivo/ }))?.text).toBe('1 archivo cambiado')
  expect(await last.find({ type: 'Text', text: '…/y/z' })).toBeDefined()
  expect(await first.find({ type: 'Text', text: /archivo/ })).toBeUndefined()
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
  expect((await again.find({ type: 'Text', text: /archivo/ }))?.text).toBe('1 archivo cambiado')
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

  expect((await one.find({ type: 'Text', text: /archivo/ }))?.text).toBe('1 archivo cambiado')
  expect(await two.find({ type: 'Text', text: /archivo/ })).toBeUndefined()
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
  fakeEngine(on, { git: repo, onBash: () => (hasRun = true) })
  await $.session.start({ cwd: '/proj', surface: 'vscode', isInteractive: true })
  await $.turn.start({ text: 'hola', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', command: "sed -i 's/old/new/' src/a.ts && printf 'uno\\ndos\\n' > new.txt" })
  const last = await $.ui.mount(block('m1'))
  await $.turn.complete(end('t1'))

  expect((await last.find({ type: 'Text', text: /archivos cambiados/ }))?.text).toBe('2 archivos cambiados')
  expect(await last.find({ type: 'Text', text: '+3' })).toBeDefined()
  expect(await last.find({ type: 'Text', text: '−1' })).toBeDefined()
  expect(await last.find({ type: 'Text', text: 'nuevo' })).toBeDefined()
})
