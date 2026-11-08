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
/plugin install files-changed --marketplace OWNER/files-changed
```

Answer `y` to add the marketplace, then choose a scope.

## What it counts

- **Edit and Write**: every file Claude edits or creates, with the exact patch the tool applied. Several edits to one file in the same reply add up into one row.
- **Bash, inside a git repository**: before and after each command, the mod records the working tree with `git stash create`, which writes a commit object without touching refs, the index, the stash list or any file. Diffing the two shows exactly what that command changed, not changes that were already uncommitted. New untracked files (respecting `.gitignore`) are counted too.

## Limitations

- Changes made by Bash are only counted inside a git repository.
- Commands run in the background are not watched.
- An untracked file that already existed and is modified by a command is not counted.
- The plugin API does not mark which text block ends a reply, so the card goes on the block whose text matches the end of the reply. A reply that ends with a tool call and no text gets no card.
- In the VS Code extension, what a mod draws on a message appears above that message's text, so the card sits just above the last block of the reply.

## Development

```
claude plugin validate .
claude plugin test .
```

To run it from this folder without installing it, start Claude Code with `claude --plugin-dir /path/to/files-changed`, or list the folder in the `CLAUDE_CODE_PLUGIN_DIRS` environment variable.

The plugin API is in early access and may change between Claude Code releases.

## License

[MIT](LICENSE)
