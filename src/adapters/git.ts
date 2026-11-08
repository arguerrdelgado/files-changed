import type { EngineInterface } from 'claude-code'

import type { FileChange, ReplyChanges } from '../../types'
import { NO_CHANGES } from '../core/changes'
import { changesFromDiff } from '../core/diff'

/**
 * Finds what a Bash command changed, inside a git repository.
 *
 * Before and after the command the working tree is recorded with
 * `git stash create`: it writes an unreferenced commit to the object database
 * (git's garbage collector removes it later), may refresh the index's cached
 * file stats as `git status` does, and changes no ref, the stash list, the
 * index's content or any working file. The diff between the two records is
 * what the command changed, not what was already uncommitted.
 *
 * Every git command this mod runs is in this file. `--no-ext-diff` and
 * `--no-textconv` keep git from running diff programs a repository configures.
 */

/** New untracked files read per command at most, so a command that creates thousands stays fast; the rest are counted. */
const MAX_NEW_UNTRACKED_FILES = 50

/** The working tree at one moment. */
export type Snapshot = {
  /** The repository's top folder. */
  root: string
  /** A commit holding the working tree: a `git stash create` commit, or HEAD when nothing changed. */
  tree: string
  /** Untracked files that `.gitignore` does not exclude, relative to `root`. */
  untracked: ReadonlySet<string>
}

/** Records the working tree, or undefined outside a git repository or in one with no commits. */
export async function takeSnapshot($: EngineInterface): Promise<Snapshot | undefined> {
  const root = (await git($, ['rev-parse', '--show-toplevel'], await $.session.cwd()))?.trim()
  if (!root) return undefined

  const stash = (await git($, ['stash', 'create'], root))?.trim()
  const tree = stash || (await git($, ['rev-parse', 'HEAD'], root))?.trim()
  if (!tree) return undefined

  const untracked = (await git($, ['ls-files', '--others', '--exclude-standard', '-z'], root)) ?? ''

  return { root, tree, untracked: new Set(untracked.split('\0').filter(Boolean)) }
}

/** What changed in the repository between two snapshots of it. */
export async function changesBetween($: EngineInterface, before: Snapshot, after: Snapshot): Promise<ReplyChanges> {
  if (after.root !== before.root) return NO_CHANGES

  const { root } = after
  const files: FileChange[] = []
  if (after.tree !== before.tree) {
    const diff = await git($, ['diff', '--no-renames', '--no-ext-diff', '--no-textconv', before.tree, after.tree], root)
    files.push(...changesFromDiff(diff ?? '', root))
  }

  const created = [...after.untracked].filter(file => !before.untracked.has(file))
  for (const file of created.slice(0, MAX_NEW_UNTRACKED_FILES)) {
    // `--no-index` exits 1 when the files differ, which is always the case here.
    const diff = await git($, ['diff', '--no-index', '--no-ext-diff', '--no-textconv', '--', '/dev/null', file], root, [0, 1])
    files.push(...changesFromDiff(diff ?? '', root).map(change => ({ ...change, status: 'added' as const })))
  }

  return { files, unlisted: Math.max(created.length - MAX_NEW_UNTRACKED_FILES, 0) }
}

/** Runs one git command; its output, or undefined when it exits with a code not in `okExitCodes`. */
async function git(
  $: EngineInterface,
  args: readonly string[],
  cwd: string,
  okExitCodes: readonly number[] = [0],
): Promise<string | undefined> {
  const run = await $.process.run(['git', '-c', 'core.quotepath=off', ...args], { cwd })

  return okExitCodes.includes(run.exitCode) ? run.stdout : undefined
}
