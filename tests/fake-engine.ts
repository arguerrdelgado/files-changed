/**
 * What Claude Code would answer beneath the mod, for the tests: a session in
 * `/proj`, Edit and Write results, git answers and message blocks drawn as
 * their text.
 */

/** Answers one git command, given its arguments after `git -c core.quotepath=off`. */
export type Git = (args: string) => { exitCode: number; stdout: string }

const outsideRepository: Git = () => ({ exitCode: 128, stdout: '' })

const hunk = (lines: string[]) => ({
  oldStart: 1,
  oldLines: lines.filter(line => !line.startsWith('+')).length,
  newStart: 1,
  newLines: lines.filter(line => !line.startsWith('-')).length,
  lines,
})

export function fakeEngine(on: any, options: { git?: Git; onBash?: () => void } = {}): void {
  const git = options.git ?? outsideRepository

  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/proj' }))
  on('turn.start', (_: unknown, e: any) => ({ turnId: e.turnId }))
  on('turn.complete', (_: unknown, e: any) => ({ text: e.answer ?? '' }))
  on('process.run', (_: unknown, e: any) => ({ value: { ...git(e.argv.slice(3).join(' ')), stderr: '' } }))
  on('ui.render', ($: any, e: any) => {
    const { Text } = $.ui.resolve(e)
    return h(Text, null, e.props.text)
  })
  on('tool.call', (_: unknown, e: any) => {
    if (e.tool === 'Bash') {
      options.onBash?.()
      return { result: { stdout: '', stderr: '' } }
    }
    if (e.tool === 'Write')
      return {
        result: { type: 'create', filePath: e.file_path, content: e.content, structuredPatch: [], originalFile: null },
      }

    return {
      result: {
        filePath: e.file_path,
        oldString: e.old_string,
        newString: e.new_string,
        originalFile: 'x',
        structuredPatch: [hunk([' ctx', '-old', '+new1', '+new2'])],
        userModified: false,
        replaceAll: false,
      },
    }
  })
}
