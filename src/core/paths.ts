/** Folder levels an outside folder shows at most before its middle is cut. */
const MAX_OUTSIDE_LEVELS = 3

/** How the card shows a path. */
export type ShownPath = {
  name: string
  /**
   * The folder: relative to the session's folder, else under `~` in the home
   * folder or absolute, its middle cut when deep (`/tmp/a/…/z`) so the row fits.
   */
  folder: string
  /** True when the file is outside the session's folder. */
  isOutside: boolean
}

/** Splits a path into the file name and the folder the card shows. */
export function displayPath(path: string, cwd: string, home?: string): ShownPath {
  const cut = path.lastIndexOf('/')
  const name = path.slice(cut + 1)
  const folder = path.slice(0, Math.max(cut, 0))

  const inside = relativeTo(folder, cwd)
  if (inside !== undefined) return { name, folder: inside, isOutside: false }

  const inHome = home ? relativeTo(folder, home) : undefined

  const shown = inHome === undefined ? folder : `~${inHome && `/${inHome}`}`

  return { name, folder: shortened(shown), isOutside: true }
}

/** Keeps the first two levels and the last one of a deep folder: `/tmp/a/b/c/z` → `/tmp/a/…/z`. */
function shortened(folder: string): string {
  const lead = folder.startsWith('/') ? '/' : ''
  const levels = folder.slice(lead.length).split('/')
  if (levels.length <= MAX_OUTSIDE_LEVELS + 1) return folder

  return `${lead}${levels.slice(0, 2).join('/')}/…/${levels.at(-1)}`
}

/** `folder` relative to `base` ('' for `base` itself), or undefined when it is not inside it. */
function relativeTo(folder: string, base: string): string | undefined {
  const root = base.replace(/\/+$/, '')
  if (folder === root) return ''

  return folder.startsWith(`${root}/`) ? folder.slice(root.length + 1) : undefined
}
