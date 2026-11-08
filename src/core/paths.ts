/**
 * How the card shows a path: the file name, and its folder relative to `cwd`.
 * A folder outside `cwd` with more than two parts keeps only its last two
 * (`/tmp/a/b/c` → `…/b/c`), so a row fits on one line.
 */
export function displayPath(path: string, cwd: string): { name: string; folder: string } {
  const base = cwd.endsWith('/') ? cwd : `${cwd}/`
  const shown = path.startsWith(base) ? path.slice(base.length) : path
  const cut = shown.lastIndexOf('/')
  if (cut < 0) return { name: shown, folder: '' }

  const folder = shown.slice(0, cut)
  const parts = folder.split('/').filter(Boolean)
  const isLongAbsolute = folder.startsWith('/') && parts.length > 2

  return {
    name: shown.slice(cut + 1),
    folder: isLongAbsolute ? `…/${parts.slice(-2).join('/')}` : folder,
  }
}
