import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { FileChange, Summaries } from '../types'

const ADDED = '#3fb950'
const REMOVED = '#f85149'
const MAX_NEW_UNTRACKED = 50

const turnFiles = atom(
  { plugin: 'files-changed', key: 'turnFiles' } as const,
  [] as FileChange[],
  { shape: 'v1' },
)
const summaries = atom(
  { plugin: 'files-changed', key: 'summaries' } as const,
  {} as Summaries,
  { shape: 'v1' },
)
const open = atom(
  { plugin: 'files-changed', key: 'open' } as const,
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
  content?: string
  staged?: boolean
}

type Snapshot = { root: string; tree: string; untracked: Set<string> }

let isTurnRunning = false
// The API marks no block as a reply's last, so the card goes to the block
// whose text ends the turn's answer, drawn before or after the turn ends.
let turnBlocks: string[] = []
let pending: { answer: string; files: FileChange[] } | undefined
// Drawing cannot write state: a block claimed while drawn is kept here until
// the next turn stores it.
const claimed = new Map<string, FileChange[]>()
const texts = new Map<string, string>()
const seen = new Set<string>()

function hunksOf(out: PatchResult): Hunk[] {
  const hunks = out.structuredPatch ?? []
  if (hunks.length > 0 || out.type !== 'create' || !out.content) return hunks

  const lines = out.content.replace(/\n$/, '').split('\n')

  return [{ oldStart: 0, oldLines: 0, newStart: 1, newLines: lines.length, lines: lines.map(l => `+${l}`) }]
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
  if (cut < 0) return { name: shown, dir: '' }

  const dir = shown.slice(0, cut)
  const parts = dir.split('/').filter(Boolean)

  return {
    name: shown.slice(cut + 1),
    dir: dir.startsWith('/') && parts.length > 2 ? `…/${parts.slice(-2).join('/')}` : dir,
  }
}

function matches(text: string | undefined, answer: string): boolean {
  const block = text?.trim() ?? ''
  const whole = answer.trim()

  return block !== '' && (whole === block || whole.endsWith(block))
}

async function git(
  $: EngineInterface,
  args: string[],
  cwd: string,
  okCodes: number[] = [0],
): Promise<string | undefined> {
  const run = await $.process.run(['git', '-c', 'core.quotepath=off', ...args], { cwd })

  return okCodes.includes(run.exitCode) ? run.stdout : undefined
}

// `git stash create` records the working tree as a commit without touching
// refs, the index or any file, so two of them diff exactly what one command did.
async function snapshot($: EngineInterface): Promise<Snapshot | undefined> {
  const root = (await git($, ['rev-parse', '--show-toplevel'], await $.session.cwd()))?.trim()
  if (!root) return undefined

  const stash = (await git($, ['stash', 'create'], root))?.trim()
  const tree = stash || (await git($, ['rev-parse', 'HEAD'], root))?.trim()
  if (!tree) return undefined

  const others = (await git($, ['ls-files', '--others', '--exclude-standard', '-z'], root)) ?? ''

  return { root, tree, untracked: new Set(others.split('\0').filter(Boolean)) }
}

function parseDiff(diff: string, root: string): FileChange[] {
  return diff
    .split(/^diff --git /m)
    .slice(1)
    .flatMap(section => {
      const lines = section.split('\n')
      const from = lines.find(l => l.startsWith('--- '))?.slice(4)
      const to = lines.find(l => l.startsWith('+++ '))?.slice(4)
      const target = to && to !== '/dev/null' ? to : from
      if (!target) return []

      const path = `${root}/${target.replace(/^[ab]\//, '')}`
      const start = lines.findIndex(l => l.startsWith('--- '))
      const body = lines.slice(start).filter(l => l !== '')
      let added = 0
      let removed = 0
      for (const line of body.slice(2)) {
        if (line.startsWith('+')) added += 1
        else if (line.startsWith('-')) removed += 1
      }

      return [{ path, added, removed, isNew: from === '/dev/null', patch: body.join('\n') }]
    })
}

async function bashChanges($: EngineInterface, before: Snapshot): Promise<FileChange[]> {
  const after = await snapshot($)
  if (!after || after.root !== before.root) return []

  const { root } = after
  const found: FileChange[] = []
  if (after.tree !== before.tree) {
    const diff = await git($, ['diff', '--no-renames', '--no-ext-diff', before.tree, after.tree], root)
    found.push(...parseDiff(diff ?? '', root))
  }

  const created = [...after.untracked].filter(f => !before.untracked.has(f)).slice(0, MAX_NEW_UNTRACKED)
  for (const file of created) {
    const diff = await git($, ['diff', '--no-index', '--no-ext-diff', '--', '/dev/null', file], root, [0, 1])
    found.push(...parseDiff(diff ?? '', root).map(c => ({ ...c, isNew: true })))
  }

  return found
}

async function record($: EngineInterface, found: FileChange[]): Promise<void> {
  await update($, turnFiles, files => found.reduce(merge, files))
}

export const register: Register = on => {
  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      isTurnRunning = true
      turnBlocks = []
      pending = undefined
      await update($, turnFiles, () => [])
      if (claimed.size > 0) {
        const kept = Object.fromEntries(claimed)
        claimed.clear()
        await update($, summaries, s => ({ ...s, ...kept }))
      }
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId !== undefined) return ran

    isTurnRunning = false
    const files = await read($, turnFiles)
    if (files.length === 0) return ran

    const id = [...turnBlocks].reverse().find(b => matches(texts.get(b), e.answer))
    if (id === undefined) pending = { answer: e.answer, files }
    else await update($, summaries, s => ({ ...s, [id]: files }))

    return ran
  })

  on('tool.call', { tool: ['Edit', 'Write'] }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError) return ran

    const out = ran.result as PatchResult | undefined
    if (!out?.filePath || out.staged) return ran

    await record($, [summarize(out.filePath, hunksOf(out), out.type === 'create')])

    return ran
  })

  // Only inside a git repository; a background command's later changes are missed.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (e.run_in_background) return next(e)

    const before = await snapshot($).catch(() => undefined)
    const ran = await next(e)
    if (!before || ran.deny !== undefined) return ran

    const found = await bashChanges($, before).catch(() => [])
    if (found.length > 0) await record($, found)

    return ran
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const id = e.requestId
    if (isTurnRunning && !seen.has(id)) turnBlocks.push(id)
    seen.add(id)
    texts.set(id, e.props.text)

    let files = (await read($, summaries))[id] ?? claimed.get(id)
    if (!files && pending && matches(e.props.text, pending.answer)) {
      files = pending.files
      claimed.set(id, files)
      pending = undefined
    }

    const row = await next(e)
    if (!files || files.length === 0) return row

    const { Box, Text, Button, Code } = $.ui.resolve(e)
    const cwd = await $.session.cwd()
    const shown = await read($, open)
    const added = files.reduce((n, f) => n + f.added, 0)
    const removed = files.reduce((n, f) => n + f.removed, 0)

    return (
      <Box flexDirection="column">
        {row}
        <Box flexDirection="column" borderStyle="round" borderDimColor paddingX={1} marginTop={1}>
          <Box flexDirection="row" gap={1}>
            <Text bold>
              {files.length} {files.length === 1 ? 'archivo cambiado' : 'archivos cambiados'}
            </Text>
            <Text color={ADDED}>+{added}</Text>
            <Text color={REMOVED}>−{removed}</Text>
          </Box>
          {files.map(file => {
            const { name, dir } = split(file.path, cwd)
            const key = `${id}:${file.path}`
            const isOpen = shown === key

            return (
              <Box flexDirection="column">
                <Box flexDirection="row" gap={1}>
                  <Button
                    key={`card:${key}`}
                    label={`${isOpen ? '▾' : '▸'} ${name}`}
                    plain
                    onPress={() => update($, open, cur => (cur === key ? null : key))}
                  />
                  {file.isNew && <Text color={ADDED}>nuevo</Text>}
                  <Text color={ADDED}>+{file.added}</Text>
                  <Text color={REMOVED}>−{file.removed}</Text>
                  {dir !== '' && <Text dimColor>{dir}</Text>}
                </Box>
                {isOpen && file.patch !== '' && (
                  <Code source={file.patch} format="diff" path={file.path} />
                )}
              </Box>
            )
          })}
        </Box>
      </Box>
    )
  })
}
