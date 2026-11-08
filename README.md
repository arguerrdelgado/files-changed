# files-changed

[Español](README.es.md)

A Claude Code mod that adds a card to each reply listing the files Claude changed in it, with the lines added and removed per file. Press a file to see its diff.

```
4 files changed  +61 −73
▸ Hero.tsx  +38 −64  features/landing/components
▸ PhoneIcon.tsx  +14 −0  components/ui  new
▸ old-logo.svg  +0 −1  public  deleted
Outside the project (1)
▸ MEMORY.md  +9 −8  ~/.claude/memory
```

Every reply keeps its own card, so you can scroll back and see what each one changed.

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

## Language

The card is in English by default, and also comes in Spanish. To change it, open `/config` in Claude Code and set **Card language** under files-changed to `en` or `es`. It is stored in your settings as `pluginConfigs["files-changed"].options.language`.

## What it counts

- **Edit and Write**: every file Claude edits or creates, with the exact patch the tool applied. Several edits to one file in the same reply add up into one row.
- **Bash, inside a git repository**: before and after each command, the mod records the working tree with `git stash create`, which leaves your files, branches, index content and stash list as they were. Diffing the two shows exactly what that command changed, not changes that were already uncommitted. New untracked files (respecting `.gitignore`) are counted too. [ARCHITECTURE.md](ARCHITECTURE.md#what-the-mod-runs-on-your-machine) lists every git command the mod runs.
- **Subagents**: what they change counts toward the reply that started them. When several run at once, each change is still counted once.
- **Files outside the project** are listed too, in their own group with `~` for your home folder, so you see whenever Claude writes outside the folder you are working in.
- Each file is marked **new**, **deleted** or **binary** where it applies. A binary file is listed with no line counts or diff.

## Limitations

- Changes made by Bash are only counted inside a git repository that has at least one commit.
- Commands run in the background are not watched.
- An untracked file that already existed and is modified by a command is not counted.
- A command that creates more than 50 untracked files lists the first 50; the rest are counted in an "and N more files" line.
- A renamed file shows as two rows: the old name deleted and the new one new.
- When a subagent's Edit or Write and another subagent's Bash command change the same file at the same time, the Bash command's part of that file is not counted.
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
