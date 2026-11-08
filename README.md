# files-changed

[Español](README.es.md)

A Claude Code mod that adds a card to each reply listing the files Claude changed in it, with the lines added and removed per file. Press a file to see its diff.

```
3 archivos cambiados  +61 −72
▸ Hero.tsx        +38 −64  features/landing/components
▸ PhoneIcon.tsx   nuevo  +14 −0  components/ui
▸ WhatsAppIcon.tsx  +3 −2  components/ui
```

The card's labels are in Spanish ("archivos cambiados" = files changed, "nuevo" = new). Every reply keeps its own card, so you can scroll back and see what each one changed.

## Install

In a Claude Code terminal session, type:

```
/plugin install files-changed --marketplace arguerrdelgado/files-changed
```

Answer `y` to add the marketplace, then choose a scope.

From a shell:

```
claude plugin install files-changed --marketplace arguerrdelgado/files-changed
```

In the desktop app, where `/plugin` does not run: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `arguerrdelgado/files-changed`, then **Add plugin**.

## What it counts

- **Edit and Write**: every file Claude edits or creates, with the exact patch the tool applied. Several edits to one file in the same reply add up into one row.
- **Bash, inside a git repository**: before and after each command, the mod records the working tree with `git stash create`, which leaves your files, branches, index content and stash list as they were. Diffing the two shows exactly what that command changed, not changes that were already uncommitted. New untracked files (respecting `.gitignore`) are counted too. [ARCHITECTURE.md](ARCHITECTURE.md#what-the-mod-runs-on-your-machine) lists every git command the mod runs.

## Limitations

- Changes made by Bash are only counted inside a git repository that has at least one commit.
- Commands run in the background are not watched.
- Binary files are not listed.
- An untracked file that already existed and is modified by a command is not counted.
- The plugin API does not mark which text block ends a reply, so the card goes on the block whose text matches the end of the reply. A reply that ends with a tool call and no text gets no card.
- In the VS Code extension, what a mod draws on a message appears above that message's text, so the card sits just above the last block of the reply.

## Development

The code is split into a pure core, adapters and the card: [ARCHITECTURE.md](ARCHITECTURE.md) explains how the parts fit together and how to extend them. [CHANGELOG.md](CHANGELOG.md) lists the changes in each version.

```
claude plugin validate .
claude plugin test .
```

To run it from this folder without installing it, start Claude Code with `claude --plugin-dir /path/to/files-changed`, or list the folder in the `CLAUDE_CODE_PLUGIN_DIRS` environment variable. Claude Code then writes its plugin API types into `.claude-plugin/types/`, and `npx --package typescript tsc -p .` checks the code's types.

The plugin API is in early access and may change between Claude Code releases.

## Built with Claude Code

This project was developed with [Claude Code](https://claude.com/claude-code).

## License

[MIT](LICENSE)
