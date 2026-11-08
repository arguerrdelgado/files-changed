import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'files-changed',
  component: 'Pane',
  requestId: 'files-changed',
  props: {
    title: 'Archivos cambiados',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

const hunk = (lines: string[]) => ({
  oldStart: 1,
  oldLines: lines.filter(l => !l.startsWith('+')).length,
  newStart: 1,
  newLines: lines.filter(l => !l.startsWith('-')).length,
  lines,
})

const prompt = (text: string) =>
  ({ text, wait: false, origin: { kind: 'composer' } }) as const

function engine(on: any) {
  on('command.register', () => ({ value: { command: 'cambios' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/proj' }))
  on('prompt.submit', (_: unknown, e: any) => ({ text: e.text }))
  on('turn.complete', () => ({}))
  on('tool.call', (_: unknown, e: any) =>
    e.tool === 'Write'
      ? {
          result: {
            type: 'create',
            filePath: e.file_path,
            content: e.content,
            structuredPatch: [hunk(['+a', '+b', '+c'])],
            originalFile: null,
          },
        }
      : {
          result: {
            filePath: e.file_path,
            oldString: e.old_string,
            newString: e.new_string,
            originalFile: 'x',
            structuredPatch: [hunk([' ctx', '-old', '+new1', '+new2'])],
            userModified: false,
            replaceAll: false,
          },
        },
  )
}

test('counts and folds changes per file, on every surface', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/proj', surface: 'vscode', isInteractive: true })
  await $.prompt.submit(prompt('hola'))
  await $.tool.call({ tool: 'Edit', file_path: '/proj/src/a.ts', old_string: 'old', new_string: 'new' })
  await $.tool.call({ tool: 'Edit', file_path: '/proj/src/a.ts', old_string: 'old', new_string: 'new' })
  await $.tool.call({ tool: 'Write', file_path: '/proj/b.md', content: 'a\nb\nc' })

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /archivos cambiados/ }))?.text).toBe('2 archivos cambiados')
    expect(await ui.find({ type: 'Text', text: '+7' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '−2' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '+4' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'src' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'nuevo' })).toBeDefined()
    await ui.unmount()
  }
})

test('a new prompt resets the pane', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/proj', surface: 'vscode', isInteractive: true })
  await $.prompt.submit(prompt('uno'))
  await $.tool.call({ tool: 'Write', file_path: '/proj/b.md', content: 'a' })
  await $.prompt.submit(prompt('dos'))

  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  expect((await ui.find({ type: 'Text' }))?.text).toBe('Trabajando…')
  await ui.unmount()
})

test('pressing a file shows its diff', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/proj', surface: 'desktop', isInteractive: true })
  await $.prompt.submit(prompt('x'))
  await $.tool.call({ tool: 'Edit', file_path: '/proj/src/a.ts', old_string: 'old', new_string: 'new' })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Code' })).toBeUndefined()
  await ui.press({ key: 'toggle:/proj/src/a.ts' })
  expect(await ui.find({ type: 'Code' })).toBeDefined()
  await ui.unmount()
})
