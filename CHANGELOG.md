# Changelog

All notable changes to this project are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [0.4.0] - 2026-11-08

### Added

- The card's language is an option, `en` (the default) or `es`, set in `/config`.
- Deleted files are marked `deleted`, and binary files are listed, marked `binary`, with no line counts.
- Files outside the project are grouped under "Outside the project", with `~` for the home folder.
- A command that creates more than 50 untracked files counts the rest in an "and N more files" line.

### Changed

- A file's status (`new`, `deleted`, `binary`) is shown after its counts and folder.
- Saved state changed shape (`v2`); cards saved by an earlier version are not shown.

### Fixed

- A change made while another tool call was running, as with subagents working at the same time, could be counted twice.

## [0.3.0] - 2026-11-08

### Changed

- Code split into `src/core` (pure logic), `src/adapters` (Claude Code and git), `src/ui` (the card) and `hooks/register.tsx` (wiring). See [ARCHITECTURE.md](ARCHITECTURE.md).
- Saved state keys renamed to `turnChanges`, `cards` and `openRow`.
- Tests moved to `tests/` and extended to the pure logic and to the exact git commands the mod runs.
- A git failure during a Bash call is written to Claude Code's debug log instead of being dropped silently.
- The README gives the install steps for a shell and the desktop app too.

### Fixed

- A message block from an earlier reply could take the new reply's card when both had the same text.

### Security

- `git diff` runs with `--no-textconv`, so it never runs text conversion programs a repository configures.

## [0.2.0] - 2026-11-08

### Added

- A card in each reply with the files it changed, their added and removed lines, and each file's diff.
- Changes made by Bash commands inside a git repository.

### Removed

- The side panel and the `/cambios` command.

## [0.1.0] - 2026-11-08

### Added

- A side panel with the files changed in the last reply.

[0.4.0]: https://github.com/arguerrdelgado/files-changed/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/arguerrdelgado/files-changed/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/arguerrdelgado/files-changed/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/arguerrdelgado/files-changed/releases/tag/v0.1.0
