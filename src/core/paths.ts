/** How the card shows a path. */
export type ShownPath = {
  name: string
  /** The folder: relative to the session's folder, under `~` in the home folder, else absolute. */
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

  return { name, folder: inHome === undefined ? folder : `~${inHome && `/${inHome}`}`, isOutside: true }
}

/** `folder` relative to `base` ('' for `base` itself), or undefined when it is not inside it. */
function relativeTo(folder: string, base: string): string | undefined {
  const root = base.replace(/\/+$/, '')
  if (folder === root) return ''

  return folder.startsWith(`${root}/`) ? folder.slice(root.length + 1) : undefined
}
