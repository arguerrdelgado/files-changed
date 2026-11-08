import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { FileChange, TurnChanges } from '../types'

const PANE = 'files-changed'
const TITLE = 'Archivos cambiados'
const EMPTY: TurnChanges = { files: [], isRunning: false }

const turn = atom({ plugin: 'files-changed', key: 'turn' } as const, EMPTY, {
  shape: 'turn-1',
})
const expanded = atom(
  { plugin: 'files-changed', key: 'expanded' } as const,
  null as string | null,
)

type Hunk = {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: string[]
}

type PatchResult = {
  filePath?: string
  structuredPatch?: Hunk[]
  type?: 'create' | 'update'
  staged?: boolean
}

function summarize(path: string, hunks: Hunk[], isNew: boolean): FileChange {
  let added = 0
  let removed = 0
  const body: string[] = [`--- a/${path}`, `+++ b/${path}`]

  for (const hunk of hunks) {
    body.push(
      `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
    )
    for (const line of hunk.lines) {
      if (line.startsWith('+')) added += 1
      else if (line.startsWith('-')) removed += 1
      body.push(line)
    }
  }

  return { path, added, removed, isNew, patch: hunks.length ? body.join('\n') : '' }
}

// Several edits to one file within a reply fold into a single row.
function merge(files: FileChange[], change: FileChange): FileChange[] {
  const prior = files.find(f => f.path === change.path)
  if (!prior) return [...files, change]

  return files.map(f =>
    f.path === change.path
      ? {
          path: f.path,
          added: f.added + change.added,
          removed: f.removed + change.removed,
          isNew: f.isNew || change.isNew,
          patch: [f.patch, change.patch].filter(Boolean).join('\n'),
        }
      : f,
  )
}

function split(path: string, cwd: string): { name: string; dir: string } {
  const base = cwd.endsWith('/') ? cwd : `${cwd}/`
  const shown = path.startsWith(base) ? path.slice(base.length) : path
  const cut = shown.lastIndexOf('/')

  return cut < 0
    ? { name: shown, dir: '' }
    : { name: shown.slice(cut + 1), dir: shown.slice(0, cut) }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'cambios',
      description: 'Abre el panel de archivos cambiados en la última respuesta',
    })
    void $.ui.open({ id: PANE, title: TITLE })

    return next(e)
  })

  on('command.run', { command: 'cambios' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })

    return { text: 'Panel de archivos cambiados abierto.' }
  })

  on('prompt.submit', async ($, e, next) => {
    await update($, turn, () => ({ files: [], isRunning: true }))
    await update($, expanded, () => null)

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    await update($, turn, t => ({ ...t, isRunning: false }))

    return next(e)
  })

  on('tool.call', { tool: ['Edit', 'Write'] }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError) return ran

    const out = ran.result as PatchResult | undefined
    if (!out?.filePath || out.staged) return ran

    const change = summarize(
      out.filePath,
      out.structuredPatch ?? [],
      out.type === 'create',
    )
    await update($, turn, t => ({ ...t, files: merge(t.files, change) }))

    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Code } = $.ui.resolve(e)
    const { files, isRunning } = await read($, turn)
    const open = await read($, expanded)
    const cwd = await $.session.cwd()

    if (files.length === 0) {
      return (
        <Box flexDirection="column">
          <Text dimColor>
            {isRunning ? 'Trabajando…' : 'Sin cambios en esta respuesta'}
          </Text>
        </Box>
      )
    }

    const added = files.reduce((n, f) => n + f.added, 0)
    const removed = files.reduce((n, f) => n + f.removed, 0)
    const room = Math.max(1, (e.viewport?.rows ?? 24) - 3)
    const shown = files.slice(0, room)
    const hidden = files.length - shown.length

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={1}>
          <Text bold>
            {files.length} {files.length === 1 ? 'archivo cambiado' : 'archivos cambiados'}
          </Text>
          <Text color="diffAdded">+{added}</Text>
          <Text color="diffRemoved">−{removed}</Text>
        </Box>
        {shown.map(file => {
          const { name, dir } = split(file.path, cwd)
          const isOpen = open === file.path

          return (
            <Box flexDirection="column">
              <Box flexDirection="row" gap={1}>
                <Button
                  key={`toggle:${file.path}`}
                  label={`${isOpen ? '▾' : '▸'} ${name}`}
                  plain
                  onPress={() =>
                    update($, expanded, cur => (cur === file.path ? null : file.path))
                  }
                />
                {file.isNew && <Text color="success">nuevo</Text>}
                {dir !== '' && (
                  <Text dimColor wrap="truncate-start">
                    {dir}
                  </Text>
                )}
                <Text color="diffAdded">+{file.added}</Text>
                <Text color="diffRemoved">−{file.removed}</Text>
              </Box>
              {isOpen && file.patch !== '' && (
                <Code source={file.patch} format="diff" path={file.path} />
              )}
            </Box>
          )
        })}
        {hidden > 0 && <Text dimColor>+{hidden} más</Text>}
      </Box>
    )
  })
}
