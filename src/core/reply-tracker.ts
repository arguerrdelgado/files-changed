import type { CardsByBlock, ReplyChanges } from '../../types'
import { hasChanges } from './changes'

/**
 * Decides which message block of a reply gets its card.
 *
 * The plugin API does not mark the block that ends a reply, so the card goes
 * on the block whose text ends the reply's answer. Only blocks first drawn
 * since the reply started count, so a block from an earlier reply never takes
 * the card. VS Code can draw the last block only after the reply ends: then
 * the changes wait (`pending`) until that block is drawn.
 *
 * Drawing cannot write state, so a card a block claims while drawn is kept
 * here until `takeUnsavedCards` hands it over to be saved.
 */
export class ReplyTracker {
  /** False until the first reply since the module loaded. */
  #hasStarted = false
  /** Every block drawn since the module loaded. */
  readonly #seen = new Set<string>()
  /** Blocks first drawn since the reply started, in that order, with their latest text. */
  readonly #replyBlocks = new Map<string, string>()
  /** The reply's changes, waiting for its last block to be drawn. */
  #pending: { answer: string; changes: ReplyChanges } | undefined
  /** Cards claimed while drawn, not saved yet. */
  readonly #unsaved = new Map<string, ReplyChanges>()

  /** A new reply starts. */
  startTurn(): void {
    this.#hasStarted = true
    this.#replyBlocks.clear()
    this.#pending = undefined
  }

  /** A message block was drawn, or drawn again with new text. */
  blockDrawn(id: string, text: string): void {
    const isFirstDraw = !this.#seen.has(id)
    this.#seen.add(id)
    const belongsToThisReply = this.#hasStarted && (isFirstDraw || this.#replyBlocks.has(id))
    if (belongsToThisReply) this.#replyBlocks.set(id, text)

    if (this.#pending && this.#replyBlocks.has(id) && endsAnswer(text, this.#pending.answer)) {
      this.#unsaved.set(id, this.#pending.changes)
      this.#pending = undefined
    }
  }

  /**
   * The reply ended. Returns the block that gets its card now, or undefined
   * when there is nothing to show or its last block is not drawn yet.
   */
  endTurn(answer: string, changes: ReplyChanges): string | undefined {
    if (!hasChanges(changes)) return undefined

    const blocks = [...this.#replyBlocks].reverse()
    const last = blocks.find(([, text]) => endsAnswer(text, answer))
    if (last) return last[0]

    this.#pending = { answer, changes }
    return undefined
  }

  /** The changes the card on this block shows, if it has one. */
  changesFor(id: string, saved: CardsByBlock): ReplyChanges | undefined {
    return saved[id] ?? this.#unsaved.get(id)
  }

  /** Hands over the cards claimed while drawn, once, so they can be saved. */
  takeUnsavedCards(): CardsByBlock {
    const cards = Object.fromEntries(this.#unsaved)
    this.#unsaved.clear()
    return cards
  }
}

/** True when the block's text is the end of the reply's answer. */
function endsAnswer(text: string, answer: string): boolean {
  const block = text.trim()
  const whole = answer.trim()

  return block !== '' && whole.endsWith(block)
}
