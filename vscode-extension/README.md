# CodeQuest for VS Code

A panel in the Explorer (pixel scene with your hero and boss, level and XP bars, stats, quests, a "Check quest" button)
and a status bar item `⚔ LVL 2 · 475/500 XP`. The data comes from the CodeQuest CLI (`state --json`).

Settings: `codequest.cliPath`, `codequest.nodePath`, `codequest.home`, `codequest.pollSeconds`.

Build: `npm run build` in this folder. Not done yet: class stars on the stat bars.

## Try it without installing

1. Open the folder `D:\Claude\rpg game-code\vscode-extension` in VS Code.
2. Press F5 ("Run Extension"; if VS Code asks for a launch config, choose "VS Code Extension Development").
3. In the second window open any project folder. The panel "CodeQuest" is in the Explorer (under "Timeline"); the status bar shows `⚔ LVL …`.

Look at: the scene draws; the bars match `codequest hud`; the button runs a check and the status bar spins; the panel pauses when hidden; a theme switch keeps text readable.

## Package

`npm run package` makes `codequest-vscode-0.1.0.vsix`. Install: `code --install-extension codequest-vscode-0.1.0.vsix`.
