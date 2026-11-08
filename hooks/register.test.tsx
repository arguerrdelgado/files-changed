import { expect, test } from 'claude-code/testing'

const hunk = (lines: string[]) => ({
  oldStart: 1,
  oldLines: lines.filter(l => !l.startsWith('+')).length,
  newStart: 1,
  newLines: lines.filter(l => !l.startsWith('-')).length,
  lines,
})

type Git = (args: string) => { stdout: string; exitCode: number }

const noRepo: Git = () => ({ stdout: '', exitCode: 128 })

function engine(on: any, git: Git = noRepo, onBash = () => {}) {
  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/proj' }))
  on('turn.start', (_: unknown, e: any) => ({ turnId: e.turnId }))
  on('turn.complete', (_: unknown, e: any) => ({ text: e.answer ?? '' }))
  on('process.run', (_: unknown, e: any) => ({
    value: { ...git(e.argv.slice(3).join(' ')), stderr: '' },
  }))
  on('ui.render', ($: any, e: any) => {
    const { Text } = $.ui.resolve(e)
    return h(Text, null, e.props.text)
  })
  on('tool.call', (_: unknown, e: any) =>
    e.tool === 'Bash'
      ? (onBash(), { result: { stdout: '' } })
      : e.tool === 'Write'
        ? {
            result: {
              type: 'create',
              filePath: e.file_path,
              content: e.content,
              structuredPatch: [],
              originalFile: null,
            },
          }
        : {
            result: {
              filePath: e.file_path,
              structuredPatch: [hunk([' ctx', '-old', '+new1', '+new2'])],
            },
          },
  )
}

const end = (turnId: string, agentId?: string): any => ({
  answer: 'Listo.',
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
  engine(on)
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

test('a last block drawn after the turn ends still gets the card', async ($, on) => {
  engine(on)
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

test('each reply gets its own card and a reply with no changes gets none', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/proj', surface: 'vscode', isInteractive: true })
  await $.turn.start({ text: 'uno', turnId: 't1' })
  await $.tool.call({ tool: 'Write', file_path: '/proj/b.md', content: 'a' })
  const one = await $.ui.mount(block('m1', 'Uno.'))
  await $.turn.complete({ ...end('t1'), answer: 'Uno.' })
  await $.turn.start({ text: 'dos', turnId: 't2' })
  const two = await $.ui.mount(block('m2', 'Dos.'))
  await $.turn.complete({ ...end('t2'), answer: 'Dos.' })
  await $.turn.complete(end('t3', 'agent-1'))

  expect((await one.find({ type: 'Text', text: /archivo/ }))?.text).toBe('1 archivo cambiado')
  expect(await two.find({ type: 'Text', text: /archivo/ })).toBeUndefined()
})

test('changes a Bash command makes in a git repository are counted', async ($, on) => {
  let isAfter = false
  const repo: Git = args => {
    const ok = (stdout: string, exitCode = 0) => ({ exitCode, stdout })
    if (args === 'rev-parse --show-toplevel') return ok('/proj\n')
    if (args === 'stash create') return ok(isAfter ? 'bbb\n' : 'aaa\n')
    if (args.startsWith('ls-files')) return ok(isAfter ? 'new.txt\0' : '')
    if (args.startsWith('diff --no-renames'))
      return ok(
        'diff --git a/src/a.ts b/src/a.ts\nindex 1..2 100644\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,2 +1,2 @@\n ctx\n-old\n+new\n',
      )
    if (args.startsWith('diff --no-index'))
      return ok(
        'diff --git a/new.txt b/new.txt\nnew file mode 100644\n--- /dev/null\n+++ b/new.txt\n@@ -0,0 +1,2 @@\n+uno\n+dos\n',
        1,
      )
    return ok('', 1)
  }
  engine(on, repo, () => (isAfter = true))
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
