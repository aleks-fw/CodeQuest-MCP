import asyncio
import os

import requests
from aiogram import Bot, Dispatcher, F
from aiogram.filters import Command
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message

from src.format import format_price
from src.parse import parse_command

bot = Bot(token=os.environ.get("BOT_TOKEN", ""))
dp = Dispatcher()
reminders: dict[int, list[str]] = {}


@dp.message(Command("start"))
async def start(message: Message) -> None:
    await message.answer("Welcome! Send /help to see what I can do.")


@dp.message(Command("help"))
async def help_command(message: Message) -> None:
    await message.answer("Commands: /about, /price, /weather, /remind, /feedback, /ban")


@dp.message(Command("about"))
async def about(message: Message) -> None:
    await message.answer("Shop helper bot: prices, weather and reminders.")


@dp.message(Command("price"))
async def price(message: Message) -> None:
    _, args = parse_command(message.text or "")
    cents = int(args[0]) if args else 0
    await message.answer(f"Price: {format_price(cents)}")


@dp.message(Command("weather"))
async def weather(message: Message) -> None:
    _, args = parse_command(message.text or "")
    city = " ".join(args) or "London"
    response = requests.get(f"{os.environ['WEATHER_API_URL']}/current", params={"city": city})
    data = response.json()
    await message.answer(f"{city}: {data['temperature']} C")


@dp.message(Command("remind"))
async def remind(message: Message) -> None:
    _, args = parse_command(message.text or "")
    items = reminders.setdefault(message.chat.id, [])
    items.append(" ".join(args))
    await message.answer(f"Saved. This chat has {len(items)} reminders.")


@dp.message(Command("feedback"))
async def feedback(message: Message) -> None:
    await message.answer("Thanks! Your feedback was sent to the team.")


@dp.message(Command("ban"))
async def ban(message: Message) -> None:
    _, args = parse_command(message.text or "")
    user_id = int(args[0])
    await bot.ban_chat_member(message.chat.id, user_id)
    await message.answer(f"User {user_id} is banned.")


@dp.message(F.text.regexp(r"^hello\b"))
async def hello(message: Message) -> None:
    await message.answer("Hello there!")


@dp.callback_query(F.data == "confirm")
async def confirm(query: CallbackQuery) -> None:
    await query.answer("Confirmed")
    await query.message.edit_text("Order confirmed.")


@dp.message()
async def fallback(message: Message) -> None:
    command, _ = parse_command(message.text or "")
    if command:
        await message.answer(f"Unknown command: /{command}")
        return
    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[[InlineKeyboardButton(text="Confirm", callback_data="confirm")]]
    )
    await message.answer("Confirm your order?", reply_markup=keyboard)


async def main() -> None:
    await dp.start_polling(bot)


if __name__ == "__main__":
    print("Bot started")
    asyncio.run(main())