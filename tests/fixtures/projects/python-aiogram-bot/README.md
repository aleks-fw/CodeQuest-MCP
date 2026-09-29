# Shop Helper Bot

A Telegram bot for a small shop, built with aiogram 3.

## Commands

- /start and /help: greeting and the command list
- /about: what the bot does
- /price <cents>: format a price
- /weather <city>: current weather from the weather API
- /remind <text>: save a reminder for this chat
- /feedback: send feedback to the team
- /ban <user id>: remove a user from the group

## Running

Copy `.env.example` to `.env`, set `BOT_TOKEN`, then run `python -m src.bot`. Tests: `python -m pytest -q`.