# Installing CodeQuest MCP (instructions for an AI agent)

Repository: https://github.com/aleks-fw/rpg-game-code
What it is: an MCP server (Node.js, stdio) that gives each project a level, XP, stats and quests generated from the
real state of the code. XP is paid only after a machine check, never on the AI's word.
Tools (13): `get_project_state`, `get_player_level`, `get_project_stats`, `get_active_quests`, `get_quest_details`,
`start_quest`, `verify_quest_completion`, `refresh_project_analysis`, `get_project_history`, `get_achievements`,
`get_project_bosses`, `set_project_settings`, `set_language`. Prompts: `quest_board`, `verify_quest`, `work_on_quest`.

Follow these steps in order. Do not skip the confirmations: they involve a download and a change to the user's MCP
configuration.

1. **Check requirements.** Node.js 22.12 or newer (`node --version`) and Git. Tested only on Windows + Node 22.
2. **Ask the user where to install** (a folder for the clone and a folder for the progress data). Respect any rule
   the user gave about drives or directories. The server is not on npm: it is built from the repository.
3. **Clone and build:**
   ```
   git clone https://github.com/aleks-fw/rpg-game-code.git <DIR>
   cd <DIR>
   npm ci
   npm run build
   ```
4. **Register the server** with the user's MCP client, after the user confirms the config change. The command is
   `node <DIR>/dist/cli/index.js mcp`.
   - Claude Code: `claude mcp add codequest --scope user --env CODEQUEST_HOME=<DATA_DIR> -- node "<DIR>/dist/cli/index.js" mcp`
   - Other clients (JSON): `{"mcpServers": {"codequest": {"command": "node", "args": ["<DIR>/dist/cli/index.js", "mcp"], "env": {"CODEQUEST_HOME": "<DATA_DIR>"}}}}`
   - `CODEQUEST_HOME` is where progress is stored (default `~/.codequest`).
5. **Verify.** Restart or reload the MCP client, confirm the server `codequest` is connected and lists 13 tools. A good
   smoke test is `get_player_level` in any project folder, or offline: `node <DIR>/dist/cli/index.js hud --path <project>`.

Usage rules:
- Report to the user in their language; the server's output follows the setting made with `set_language`.
- Never run a project's own commands (tests, build) unless the user agreed: ask first, then call
  `set_project_settings` with `allow_commands`.
- Never claim XP the server did not pay. Use `verify_quest_completion` and report what it says.
- After a rebuild the MCP server has to be restarted to load the new `dist/`.
