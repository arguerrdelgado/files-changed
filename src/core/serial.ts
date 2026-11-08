/** Runs async tasks one at a time, in the order they were queued, whatever each one's outcome. */
export function serial(): <T>(task: () => Promise<T>) => Promise<T> {
  let last: Promise<unknown> = Promise.resolve()

  return task => {
    const run = last.then(task)
    last = run.catch(() => undefined)

    return run
  }
}
