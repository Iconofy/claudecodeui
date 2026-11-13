# About this fork

**This is a modified version of CloudCLI UI. It is not the original software and is not
made, endorsed or supported by Siteboon AI B.V.**

Based on: CloudCLI UI (https://github.com/siteboon/claudecodeui), release `v1.37.8`.
License: AGPL-3.0-or-later, the same as upstream, including the additional terms in
[LICENSE](LICENSE). See [NOTICE](NOTICE) for the original copyright.

Please report problems with the changes below to this fork, not to the upstream project.

## What is changed (2026-11-13)

### Sidebar
- **Project menu (⋮).** On desktop, the separate rename and delete buttons on a project row
  are now one "Project options" menu (Copy project path, Rename, Delete). On phones, the menu
  is a bottom sheet, like the session sheet. A tap that closes the sheet no longer also
  toggles the project card.
- **Copy project path** in the project menu, the session menu (Projects and Chats lists)
  and the mobile session sheet. The recent-conversations API now also returns `projectPath`.
- **Recycle bin.** "Delete" for a chat or a project now moves it to a Recycle bin tab
  (trash icon, after Archive), with Restore and a two-step "Delete now". Items are removed
  for good after 30 days, by an hourly job on the server. Archive is unchanged and separate.
  - API: `DELETE .../sessions/:id?force=true` and `DELETE /api/projects/:id?force=true` now
    move the item to the bin; add `&permanent=true` to delete it at once. New:
    `GET /api/providers/sessions/trash`, `GET /api/projects/trash`.
  - Database: new nullable `trashedAt` column on `sessions` and `projects` (added by a
    migration; older versions ignore it).
- **Chat search is easier to find.** The "Conversations" tab is labelled "Chats", and typing
  two or more characters in the Projects search box shows a `Search chats for "…"` button.

### Chat
- **Project path in the header.** The chat header shows the project's full path, with a tooltip.
- **Ultracode is an on/off toggle** in the model menu, under the Reasoning levels, for models
  that support it. It is no longer one of the effort levels, because the Claude CLI runs it at
  any effort level. A stored effort value `ultracode` still works (xhigh + Ultracode). Haiku
  lists the five effort levels the Claude CLI reports for it.
- **"Build & bypass mode"** button on a plan card, next to Build: approves the plan and switches
  both the running turn and the composer to bypass-permissions mode. To allow this, every Claude
  run starts with the SDK's `allowDangerouslySkipPermissions` flag. The flag only lets a run
  switch into that mode; the mode itself is still off until it is chosen.
- **Esc no longer stops a running turn.** Use the Stop button. The "esc" hint on Stop is gone.
- **Loading indicator** ("Loading all messages...") while a search hit loads the whole
  transcript before it jumps to the message.
- **`/usage` command**: the session's token use (like `/cost`) plus the Claude plan usage
  (5-hour and weekly windows) of the Claude login on the server machine. It reads
  `~/.claude/.credentials.json` (or `$CLAUDE_CONFIG_DIR`), only reads it, and never refreshes
  or rewrites the login. It uses the same **unofficial** endpoint as the Claude CLI's own
  `/usage`, so it can stop working at any time.
- **Session titles**: a first or last message that is only a slash command (such as `/model`)
  is not used as the session name.
- **Running timer** counts the current turn of a terminal Claude session, not the time since
  the CLI process started.

### Look
- Fonts: Ubuntu for the UI and chat, Fira Code for code and the terminal (Google Fonts).
  Ubuntu has no Thai or CJK glyphs; those use the device's fonts.
- Dark (`#141414`) theme and background colour in the web app manifest (phone status bar).

## Install

Requirements: Node.js 22 or later, and git.

```bash
git clone <this repository's URL> claudecodeui
cd claudecodeui
npm ci
npm run build
npm run server        # http://localhost:3001
```

The in-app **Update** button on a git install runs `git checkout main && git pull && npm install`
in this folder, so it pulls this fork's `main` branch. Run `npm run build` after it, then restart.
Do not run `npm install -g @cloudcli-ai/cloudcli`: that installs the original package, without
these changes.

## Keeping up with upstream

```bash
git remote add upstream https://github.com/siteboon/claudecodeui.git
git fetch upstream --tags
git merge v1.37.9        # the next upstream release tag
```
