# CodeQuest MCP — отчёт приёмки MVP (этап 10)

Дата: 30.09.2026. Ветка `stage-10`. Прогон: `node scripts/acceptance.mjs …` (проекты копируются, оригиналы не трогаются,
команды проектов не запускаются, данные — в `D:\Claude\acceptance-data`).

## Что проверено

| Пункт спека §11 | Результат |
|---|---|
| 1. Прогон на фикстурах и открытых репозиториях | Магазин и Node-бот — в твоих репозиториях `rpg-game-code-Next.js` и `rpg-game-code-Node` (туда залиты тестовые заготовки, без ключей); Python-бот — `D:\Claude\тг бот`, только чтение. Ниже — доски. |
| 2. Доски магазина и ботов заметно разные; у Node- и Python-бота похожие ботовые квесты | Да: магазин — Clean Inventory / TODOs / Images + эпик Checkout Master; боты — Handle API Errors, Add Retry Logic, Improve Command Routing и др. + эпик Command Center. |
| 3. Адаптация и полный цикл «квест → фикс → автопроверка → XP → уровень» | Проходят автоматически (`tests/acceptance/scenarios.test.ts`): Clean Inventory +100, Checkout Master +1200, итого 1300 XP, уровень 1 → 3. |
| 4. Кнопка «Проверить квест» показывает ✓/✗ | Да: `codequest verify`, инструмент `verify_quest_completion`, промпт `verify_quest`; показано на живом Python-боте. |
| 5. Отчёт | Этот файл. |
| 6. Регистрация и живой вызов из новой сессии | Зарегистрирован (`claude mcp list`: Connected). Живой вызов из новой сессии сделает пользователь. |

## Доски

## shop

Analysis: 1.1s · 11 code files · stacks js · types shop · errors 0

```
QUEST BOARD · shop · LVL 1 NEWCOMER
🟢 Clean Inventory  Easy   · Cleanup       +100 XP · 5a148
🟢 Clean Up TODOs   Easy   · Cleanup       +100 XP · d0261
🟢 Optimize Images  Easy   · Performance   +100 XP · 6de4d
🔴 Checkout Master  Epic   · 3 tasks       +1200 XP · 10fe0
   ├─ Validate Payment Webhooks
   ├─ Payment Guardian
   └─ Protect Cart
```

```
STATS
Architecture: 100
Testing: 33
Security: 54
Performance: 94
Clean Code: 89
Reliability: 100
Maintainability: 100
Bugs: 0
Tech Debt: 2

Main findings:
- [critical] Security · shop/webhook-no-signature app/api/webhooks/stripe/route.ts
- [high] Testing · generic/untested-module lib/payment.ts
- [medium] Testing · generic/untested-module lib/cart.ts
- [low] Clean Code · generic/todo lib/cart.ts:14
- [low] Clean Code · generic/unused-file components/ProductBadge.tsx
- [low] Performance · js/raw-img app/page.tsx:13
```

Findings by rule: shop/webhook-no-signature ×1, js/raw-img ×1, generic/unused-file ×1, generic/untested-module ×2, generic/todo ×1

## bot-node

Analysis: 0.7s · 4 code files · stacks js · types bot · errors 0

```
QUEST BOARD · bot-node · LVL 1 NEWCOMER
🟢 Remove Debug Logs        Easy   · Cleanup       +100 XP · 64260
🟡 Add Retry Logic          Medium · Reliability   +300 XP · d4724
🟡 Improve Command Routing  Medium · Architecture  +300 XP · d526b
🔴 Command Center           Epic   · 3 tasks       +1200 XP · 4656b
   ├─ Handle API Errors
   ├─ Guard Admin Commands
   └─ Test Message Parsing
```

```
STATS
Architecture: 86
Testing: 50
Security: 68
Performance: 100
Clean Code: 93
Reliability: 59
Maintainability: 100
Bugs: 0
Tech Debt: 0

Main findings:
- [high] Security · bot/admin-no-check src/bot.ts
- [high] Reliability · bot/no-error-handler
- [medium] Architecture · bot/fat-router src/bot.ts
- [medium] Reliability · bot/no-timeout src/bot.ts:23
- [medium] Testing · generic/untested-module src/parse.ts
- [low] Clean Code · js/debug-log src/bot.ts:61
```

Findings by rule: bot/no-error-handler ×1, bot/admin-no-check ×1, bot/fat-router ×1, bot/no-timeout ×1, js/debug-log ×1, generic/untested-module ×1

## bot-python

Analysis: 0.8s · 21 code files · stacks python · types bot · errors 0

```
QUEST BOARD · bot-python · LVL 1 NEWCOMER
🟡 Add Tests for base  Medium · Testing       +300 XP · 5153a
🟡 Add Tests for db    Medium · Testing       +300 XP · ee146
🔴 Command Center      Epic   · 3 tasks       +1200 XP · 3a1e5
   ├─ Add Retry Logic
   ├─ Handle API Errors
   └─ Improve Command Routing
```

```
STATS
Architecture: 90
Testing: 63
Security: 100
Performance: 100
Clean Code: 100
Reliability: 52
Maintainability: 100
Bugs: 0
Tech Debt: 0

Main findings:
- [high] Reliability · bot/no-error-handler
- [medium] Architecture · bot/fat-router app/bot/handlers.py
- [medium] Reliability · bot/no-timeout app/sources/github.py:77
- [medium] Reliability · bot/no-timeout app/sources/github.py:108
- [medium] Reliability · bot/no-timeout app/sources/mcp_registry.py:76
- [medium] Reliability · bot/no-timeout app/sources/mcp_registry.py:107
- [medium] Testing · generic/untested-module app/db.py
- [medium] Testing · generic/untested-module app/sources/base.py
```

Findings by rule: bot/no-error-handler ×1, bot/fat-router ×1, generic/untested-module ×2, bot/no-timeout ×4

## Что найдено и исправлено по дороге

- Эпик платил 960 XP вместо 1200: коэффициент проверки считался после того, как подзадачи помечались выполненными.
- Адаптация по спеку (§7.6) прятала почти все квесты у маленьких проектов; теперь она действует только на Testing.
- Тесты, которые лезли в общую папку данных на диске C, переведены на временные папки.

## Честный список того, что не работает или не проверено

- Условия со звёздочкой (проверка `build`/`test`) появляются в квесте, только если команды разрешены **до** его выдачи;
  у уже выданного квеста они не добавляются.
- Запуск команд проектов проверен только с подменой запуска (в тестах) и с настоящим `node` в тесте запуска; на
  настоящих `npm test` и `pytest` чужих проектов не запускался (пункт про pytest пропускается, если он не установлен).
- Открытые репозитории — маленькие тестовые заготовки (4–21 файл кода), не боевые проекты: скорость на ~1000 файлах
  проверена только тестом производительности.
- Правило «Protect the Token» (токен бота в коде) в этих проектах не срабатывает: в заготовках токена нет.
- Дубли в журнале при одновременной работе двух процессов защищены блокировкой, но на одном проекте с двух машин
  (общая папка данных) не проверялось.
- HUD в статусной строке Claude Code не подключён: только текст и `codequest hud` (решение фазы 3).
