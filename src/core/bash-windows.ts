import type { FileChange } from '../../types'

/**
 * Keeps each file change counted once when tool calls run at the same time,
 * as subagents launched together do.
 *
 * A Bash call is watched through a window: a snapshot of the repository
 * before the command and one after it. Windows can overlap, and an Edit or
 * Write from another call can land inside one. Two rules keep the counts
 * exact:
 *
 * - A window that closes diffs from the oldest snapshot still open, or from
 *   the last snapshot a window closed on when that one is newer. So a change
 *   is reported by the first window to close over it, and never again.
 * - Files an Edit or Write changed since that starting point are left out of
 *   the diff, since those tools already reported them. When the command
 *   changed the same file too, its part is lost: the one case this misses.
 *
 * Snapshots are opaque here (`S`): taking and diffing them is git's job.
 */
export class BashWindows<S> {
  /** Orders openings, closings and writes. */
  #clock = 0
  /** The windows still open, by when they opened, with their first snapshot. */
  readonly #open = new Map<number, S>()
  /** The last snapshot a window closed on. */
  #lastClosed: { at: number; snapshot: S } | undefined
  /** Files Edit or Write changed while a window was open. */
  #written: Array<{ at: number; path: string }> = []

  /** A window opens on its first snapshot; returns the window's ticket. */
  open(before: S): number {
    const at = this.#tick()
    this.#open.set(at, before)

    return at
  }

  /** Edit or Write changed a file. */
  fileWritten(path: string): void {
    if (this.#open.size > 0) this.#written.push({ at: this.#tick(), path })
  }

  /** The snapshot the window's diff starts from, and when it was taken. */
  startOf(ticket: number): { at: number; snapshot: S } | undefined {
    const oldest = Math.min(...this.#open.keys())
    const start = this.#open.get(oldest)
    if (!this.#open.has(ticket) || start === undefined) return undefined
    if (this.#lastClosed && this.#lastClosed.at > oldest) return this.#lastClosed

    return { at: oldest, snapshot: start }
  }

  /** The window closes on `after`; returns the diff's changes that are its to report. */
  close(ticket: number, after: S, changes: readonly FileChange[], since: number): FileChange[] {
    const written = new Set(this.#written.filter(entry => entry.at > since).map(entry => entry.path))
    this.#lastClosed = { at: this.#tick(), snapshot: after }
    this.cancel(ticket)

    return changes.filter(change => !written.has(change.path))
  }

  /** The window closes with nothing to report (the call was refused or the snapshot failed). */
  cancel(ticket: number): void {
    this.#open.delete(ticket)
    const oldest = Math.min(...this.#open.keys())
    this.#written = this.#written.filter(entry => entry.at > oldest)
  }

  #tick(): number {
    this.#clock += 1

    return this.#clock
  }
}
