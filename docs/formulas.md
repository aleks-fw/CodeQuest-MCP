# Формулы CodeQuest

Код: `src/game/stats.ts`. Спек: §4. Все статы — функции снимка проекта; время и диск не участвуют.

## Статы здоровья (0–100)

Architecture, Security, Performance, Clean Code, Reliability, Maintainability:

```
стат = round(100 × e^(−W / (8 × S)))
S = 1 + √(файлов кода / 10)
```

- W — сумма весов открытых находок этой категории: critical 10, high 5, medium 2, low 1.
- «Файлов кода» — `facts.sourceFiles`. Чем больше проект, тем мягче одна находка.
- Нет находок — 100. Ниже 0 не бывает.
- Проверка по спеку: 10 файлов и одна high-находка безопасности — 73; 250 файлов — 90.

Категория находки → стат: `architecture`, `security`, `performance`, `clean-code` → Clean Code, `reliability`,
`maintainability`. Находки `testing` и `bug` в статы здоровья не входят.

## Testing (0–100)

```
c   = покрытие строк из отчёта, иначе modulesWithTests / modules   (от 0 до 1)
cmd = 1, если есть команда тестов, иначе 0
pass = 1, если последний прогон тестов зелёный, иначе 0

команды разрешены:      round(60 × c + 20 × cmd + 20 × pass)
команды не разрешены:   round((60 × c + 20 × cmd) / 80 × 100)
нет модулей:            100
```

## Bugs и Tech Debt (счётчики)

- **Bugs** = находки категории `bug`, кроме `generic/failing-tests`, плюс число упавших тестов последнего прогона (если
  команды разрешены). Упавший тест уже виден в счётчике, поэтому находка `generic/failing-tests` не считается второй раз.
- **Tech Debt** = число находок правил `generic/todo`, `generic/duplicate-block`, `generic/unused-file`,
  `generic/large-file`, `generic/suppression`.
