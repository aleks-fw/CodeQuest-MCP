# Security Policy / Политика безопасности

## Supported versions

Only the latest commit on the `main` branch is supported. The project is at an early stage.

## Reporting a vulnerability

Please **do not** open a public issue with exploit details.

Use GitHub's private reporting: open the **Security** tab of this repository and choose
**Report a vulnerability**. If that option is not available, open a public issue that says only that you have a
security problem (no technical details), and the maintainer will arrange a private channel.

Пожалуйста, **не** публикуйте детали уязвимости в открытом issue. Воспользуйтесь вкладкой **Security → Report a
vulnerability**. Если её нет, создайте issue только с фразой о том, что у вас есть проблема безопасности (без
технических подробностей), и мы договоримся о закрытом канале.

## What counts as a vulnerability here

CodeQuest MCP reads project folders and, with the user's permission, runs the project's own commands on behalf of an
AI agent, so these are in scope:

- The scanner or the server writing to the project under analysis.
- Running a project command without `allow_commands` being set for that project.
- Secrets found by the scanner appearing unmasked in tool output, the journal or the state files.
- Reading or writing files outside the project folder and `CODEQUEST_HOME`.
- Faking progress: getting XP without a machine check passing.
- Corrupting the progress files through two sessions at once (the lock).

A wrong quest or a missed finding is an ordinary bug: please use a normal issue.

## Responsible use

Point the server only at projects you own or are allowed to analyse, and allow commands only for projects whose
scripts you trust.
