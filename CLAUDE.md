# Vault — гайд для Claude Code

Личный финансовый трекер (PWA), чистый HTML/CSS/JS без сборки и фреймворков.
Интерфейс на русском, валюта только € (EUR). Данные синхронизируются в облако
(Supabase) по аккаунту; вход по email/паролю или через Google.

## Расположение и стек
- Папка проекта: `C:\cabbage\Projects\vault`
- Файлы:
  - `index.html` — вся разметка (экраны + модалки)
  - `styles.css` — все стили (тёмная тема)
  - `app.js` — вся логика + регистрация service worker
  - `sw.js` — service worker (офлайн-кэш; **на localhost не регистрируется**, см. начало app.js)
  - `README.md` — описание + инструкция по GitHub Pages
  - `serve.ps1`, `.claude/` — локальные инструменты превью (в `.gitignore`, в репо не идут)
- **Node и Python в системе НЕ установлены.** JS нельзя проверить через `node --check`.
  Вместо этого: считать баланс скобок/кавычек (`tr -cd '{' | wc -c` и т.п.) и проверять
  поведение через preview_eval (см. ниже).

## Git / GitHub
- Remote: `origin` → https://github.com/kapopus/vault.git, ветка `main`.
- **После каждой завершённой правки делать commit + push.** Юзер этого ждёт.
- Футер коммита: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- Git-bash сбрасывает cwd между вызовами — всегда начинать команду с
  `cd "/c/cabbage/Projects/vault" && ...`. Кириллица в путях работает.

## Превью (как «видеть» приложение)
- Статический сервер на PowerShell (`serve.ps1`), порт **5050**, зарегистрирован
  в `C:\Users\dkapu\.claude\launch.json` под именем `vault`.
- Запуск: `mcp__Claude_Preview__preview_start` с `name: "vault"`.
- Скриншот: `mcp__Claude_Preview__preview_screenshot`. Иногда таймаутит — повторить
  или перезапустить сервер (`preview_stop` → `preview_start`).
- `mcp__Claude_Preview__preview_eval` — выполнять JS в странице для проверки
  состояния и поведения (например, `nav('stats')`, читать `S`, дёргать функции).
  Это основной способ верификации без автотестов.
- В превью `S.settings.onboarded` часто сбрасывается (чистый стейт) → показывается
  онбординг. Чтобы его убрать в проверках: `S.settings.onboarded=true; save();
  document.getElementById('onboarding').classList.remove('on')`.

## Модель данных (объект `S`)
**Источник правды — облако (Supabase, таблица `user_states`, одна строка на аккаунт,
всё состояние в `state jsonb`).** При настроенном `config.js` `save()` пушит `S` в БД
(дебаунс 800мс + флаш на `pagehide`/`visibilitychange`), а localStorage/IndexedDB **не
используются** (legacy-локалка читается один раз в `appInit` только для миграции старых
юзеров, потом удаляется). Если `config.js` пустой — фоллбэк в `localStorage['vault_v6']`
+ IndexedDB (`VaultDB`), как раньше (дев-режим без облака).
`parseState()` задаёт дефолты и мигрирует старые данные — **новые поля добавлять туда же**.
Облачный слой: `cloud.js` (auth-экран, клиент Supabase, синк), `config.js` (ключи),
`supabase.sql` (схема + RLS + `delete_user()`). Контракт см. в шапке `cloud.js`.
```
S = {
  profile: { name, email, avatar },        // avatar — data-URL фото (256px JPEG) или null (буква); email из аккаунта, неизменяем
  accounts: { cash, bank },                 // «базовый» баланс; реальный = base + транзакции
  transactions: [ {id,type,amount,desc,note,date,account,category,isRec,toAcct?,recId?} ],
  categories: [ {id,name,icon,color,type,budget?} ],// type: expense|income|both; budget — месячный лимит (€)
  goals: [ {id,name,target,current,deadline,icon,color,contributions[]} ],
  recurring: [ {id,name,amount,type,freq,day,category,icon,account,lastPaid?,createdAt?} ], // type: expense|income
  templates: [ {id,name,amount,type,account,category,icon} ],
  debts: [ {id,name,dir,amount,desc,dueDate,payments[],done} ], // dir: owe|owed; только трекинг, балансы счетов не двигает
  piggy: { balance, history[], pin },       // pin — 3 цифры или null
  notifs: [...], settings: {...}, createdAt
}
S.settings = { onboarded, sound, lang:'ru', currency:'EUR', appPin? }  // lang/currency-селекторы убраны; appPin — 4 цифры или нет
```
- **Экранировать пользовательский текст** через `esc(...)` при вставке в `innerHTML` (имена/описания/заметки).
- **Даты** парсить через `ymd('YYYY-MM-DD')` (локально), не `new Date(str).getMonth()` (UTC-сдвиг).
- **Удаления** обратимы: `undoToast(msg, restoreFn)` вместо обычного тоста.
- **Регулярные**: ежемесячные авто-проводятся при запуске (`autoPostRecurring`, защита `createdAt`+`lastPaid`); income/expense.
- **Бюджеты**: `category.budget` → прогресс в списке категорий + warn-уведомление при превышении.
- **App-lock**: `S.settings.appPin` → экран `#applock` на входе (`showAppLock`), настройка в профиле (`initSecurity`).
- `acctBal(acct)` = базовый баланс счёта + влияние транзакций. **Не считать балансы вручную.**
- `type` транзакции: `expense` | `income` | `transfer`. `transfer` — это банкомат (нал↔банк),
  в статистику доходов/расходов НЕ входит.

## Важные продуктовые решения (не сломать!)
- **Только € и русский.** Мультивалютность и мультиязычность убраны; селекторы language/currency
  удалены из онбординга и настроек (раньше были заглушками). `S.settings.lang/currency` всегда ru/EUR.
- **Копилка (piggy):** заходит по **3-значному PIN** (`openPinPad`), баланс скрыт
  (в профиле строка показывает `🔒 ••••`). Связана с банком: пополнение списывает с банка,
  снятие возвращает на банк. **Не входит в общий баланс и статистику**, транзакции не создаёт.
- **Банкомат вместо переводов:** тип «🏧 Банкомат» в окне добавления — направление
  «Снять с банка» (bank→cash) / «Внести на банк» (cash→bank). Хранится как `type:'transfer'`.
- **Онбординг** при первом запуске (`maybeOnboard`/`showOnboarding`): имя (обяз.), фото-аватар;
  email показывается read-only из аккаунта. Существующим юзерам с данными не показывается.
- **Аватар — только фото** (загрузка через `buildAvatarPicker`/`triggerAvatarUpload`, сжатие в
  256px JPEG data-URL) либо буква имени. Эмодзи-аватары убраны. Показывается в профиле и топбаре главной.
- Главный экран: «Доходы/Расходы · МЕСЯЦ» — за текущий месяц. «Общий баланс» = cash+bank.
- Статистика: единый `periodRange()` (start/end/days по фактически прошедшим дням).
  «Ср./день» делит на реальные дни. График «Динамика за период» уважает выбранный период.

## UI-конвенции
- Все деньги выводить через `fmt(n) + ' €'`.
- Подтверждения (удаления и т.п.) — через **`confirmSheet({title,text,okText,danger,onOk})`**.
- Произвольные форм-попапы — через **`openSheet(innerHTML)`** (возвращает `{ov, close}`).
  Оба дают единый нижний лист с крестиком, без «ручки» перетаскивания. Не плодить
  свои `position:fixed` оверлеи — переиспользовать эти хелперы.
- Статичные модалки (`.ovl > .mdl`) получают крестик автоматически (`setupModalCloses`).
- Тосты — `toast('...')`. Конфетти — `launchConfetti()`.
- Цвета/токены в `:root` (`--ink`, `--ink2/3/4`, `--p/p2/p3`, `--gr/rd/am/bl`). Текст
  должен быть контрастным (недавно чинили тусклость; избегать двойного затемнения
  opacity × низкая alpha цвета).

## Рабочий цикл
1. Прочитать нужные куски `index.html` / `styles.css` / `app.js`.
2. Внести правки (Edit). Для повторяющихся текстовых замен можно sed, но осторожно
   с `color:` внутри `border-color:` и т.п.
3. Проверить баланс скобок и поведение в превью (preview_eval/screenshot).
4. commit + push с понятным сообщением и co-author футером.
