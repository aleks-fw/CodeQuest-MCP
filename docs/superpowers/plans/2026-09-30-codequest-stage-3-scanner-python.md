# CodeQuest MCP — этап 3: сканер Python

Спек §3.1–3.3, §8.4. Ветка `stage-3`. Пишу и проверяю сам, без субагентов (решение пользователя 2026-09-30: экономить
лимиты). Пакет `smol-toml` 1.9.0 установлен с согласия пользователя.

Уже есть с этапа 2: язык и вид `.py` файлов, тестовые пути Python, подсчёт тест-кейсов и проверок Python, точки входа
Python, правила `empty-catch`, `suppression`, `skipped-test`, `no-env-example` для Python. Не хватает: факты проекта,
импорт-граф, четыре `py/*`-правила, число обработчиков бота, фикстуры.

## Задачи

1. **Циклы без `import type`.** Граф хранит `runtimeImports` (рёбра без импортов только для типов). `import-cycle` и
   «тест → модуль» используют `runtimeImports`, `unused-file` — полный `imports`. Для Python сюда же попадают импорты
   в блоке `if TYPE_CHECKING:`.
2. **Факты Python** (`python-project.ts`): зависимости из `requirements*.txt`, `pyproject.toml` (`[project]`,
   `[tool.poetry.dependencies]`, `[dependency-groups]`), фреймворки, pytest, ruff, интерпретатор проекта, команды
   `test`/`lint`. Вливаются в `facts.frameworks` и `facts.commands` (команды JS главнее).
3. **Импорт-граф Python** (`python-imports.ts`): `import x`, `from x import y`, относительные, пакеты внутри проекта;
   корни поиска `''`, `src/`, папка самого файла. `GRAPH_LANGUAGES` получает `python`.
4. **Правила `py/bare-except`, `py/mutable-default`, `py/blocking-in-async`, `py/eval`** и Python-обработчики бота
   (aiogram, python-telegram-bot) в `botHandlers`.
5. **Фикстуры:** `tests/fixtures/rules/py.*/{bad,good}` и проект `python-aiogram-bot`; тесты проекта.
6. **Итог:** статус этапа в `ПЛАН.md` и дорожной карте, `stage-2-followups.md` обновлён, `npm run check`.

## Договорённости

- Как в этапе 2: правила читают только `ctx`, без диска; ключи находок без номеров строк; регулярки по всему файлу без
  неограниченных префиксов; фикстуры без настоящих dot-файлов и строк, похожих на секреты.
- Интерпретатор проекта ищется на диске в `analyzeProject` (`.venv`/`venv` скрыты от списка файлов) и передаётся в
  `buildContext`; сама сборка контекста остаётся чистой.
