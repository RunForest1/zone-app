# zone-app

Каталог предметов игры Stalzone: список с фильтрами и детальная страница предмета
с характеристиками, историей продаж и текущим аукционом.

## Стек

- Next.js 16 (App Router) + React 19
- TypeScript
- Tailwind CSS 4
- Turbopack + React Compiler
- PostgreSQL + Prisma (постоянное хранилище истории сделок)
- Docker Compose (db, migrate, web, worker, **bot** — новый сервис)
- Данные — локальная база `src/lib/stalzone-database-main/ru` (json-файлы)
- Аукцион — внешний API `https://eapi.stalzone.com` (см. «API аукциона»)
- Telegram-уведомления — **grammY**, трафик до `api.telegram.org` идёт через
  общий прокси-контейнер `shared-proxy` (Xray-core, живёт вне этого
  репозитория — см. «Телеграм-бот уведомлений»)

## Команды

```
bun dev      # сервер разработки
bun build    # production-сборка
bun start    # запуск production-сборки
bun worker   # фоновый воркер синхронизации истории
bun bot      # телеграм-бот уведомлений (новый)
bun migrate  # применить миграции (prisma migrate deploy)
```

## Структура

```
src/
├── app/
│   ├── layout.tsx              # корневой layout: шапка, контейнер, подвал
│   ├── page.tsx                # каталог (/)
│   ├── items/[id]/page.tsx     # детальная страница предмета (/items/<id>)
│   ├── actions.ts              # серверный экшен: пометить предмет отслеживаемым
│   ├── api/health/route.ts     # healthcheck (проверяет доступность БД)
│   ├── icons/[...path]/route.ts# отдача иконок из базы (/icons/<категория>/<id>.png)
│   ├── globals.css             # глобальные стили и палитра (тёплая светлая тема)
│   └── components/             # компоненты интерфейса
│       ├── item-catalog.tsx    # клиентский каталог: меню категорий, панель фильтров, сетка
│       ├── category-nav.tsx    # левое меню категорий (верхний уровень)
│       ├── item-card.tsx       # карточка предмета (рамка и свечение в цвет ранга)
│       ├── item-icon.tsx       # иконка предмета с заглушкой
│       ├── filter-select.tsx   # выпадающий список
│       ├── button.tsx          # кнопки (акцентная / второстепенная)
│       ├── panel.tsx           # белая панель с заголовком
│       ├── item-history.tsx    # серверный: история + фильтры (кэш данных)
│       ├── market-history.tsx  # клиентский: фильтры-чипы, статистика, график
│       ├── item-lots.tsx       # серверный: панель «Текущий аукцион»
│       ├── price-chart.tsx     # график цены: оси и подсказка при наведении
│       ├── lots-table.tsx      # таблица лотов с сортировкой и страницами
│       └── placeholder.tsx     # заглушка под ещё не готовый блок
└── lib/
    ├── items/
    │   ├── index.ts            # класс ItemsDatabase: чтение базы
    │   ├── store.ts            # общий экземпляр базы на всё приложение
    │   └── catalog.ts          # краткая версия, фильтры, ранги и их цвета
    ├── auction/
    │   ├── index.ts            # класс SZApi: API аукциона + getSzApi()
    │   ├── data.ts             # кэш данных аукциона (use cache + cacheLife)
    │   ├── market.ts           # фильтры и статистика по сделкам
    │   ├── quality.ts          # названия и цвета качества (qlt, 0–5)
    │   └── period.ts           # периоды истории (7/14/30) и разбор ?days=
    ├── db/
    │   ├── index.ts            # Prisma-клиент (singleton)
    │   ├── sales.ts            # чтение/запись сделок, отметка предмета
    │   └── alerts.ts           # чтение/запись подписок и лога уведомлений (новый)
    └── format.ts                # форматирование цены и даты
└── worker/
    └── index.ts                # фоновый воркер синхронизации истории + детектор сделок
└── bot/                         # новый — телеграм-бот уведомлений
    ├── index.ts                 # запуск бота (long polling через прокси)
    ├── proxy.ts                 # сборка fetch-агента для прокси (TELEGRAM_PROXY_URL)
    ├── commands.ts              # /filter, /status, /pause, /resume, /chatid
    ├── auth.ts                  # проверка, что команду шлёт разрешённый пользователь
    └── format.ts                # текст сообщения о выгодной сделке
```

```
prisma/
├── schema.prisma               # сделки, состояние и лог синхронизации + подписки на алерты
└── migrations/                 # миграции (применяет сервис migrate)
```

## Архитектура

### Данные (`src/lib/items`)

- `ItemsDatabase` (`index.ts`) — рекурсивно читает все json из `<root>/items`, собирает
предметы в объект по id (поле `items`). Иконка предмета — `icons/<category>/<id>.png` (прописана в поле `icon` относительно корня базы, либо `null`, если файла нет).
Варианты предметов (папки `_variants/<id>`) складываются в поле `variants`;
чтение вариантов отключается опцией `includeVariants: false` (в приложении
варианты не читаются — интерфейс строится на данных аукциона).
- `store.ts` — единый экземпляр базы (`itemsDatabase`). База читается один раз,
**не создавайте новый `ItemsDatabase` на каждый запрос**.
- `catalog.ts` — `toSummary` (предмет → краткая версия для каталога), `applyFilters` (чистая функция фильтрации и сортировки), `topCategories` (верхние категории
с числом предметов), справочники `CATEGORY_TREE`/`RANK_OPTIONS`/`RANK_COLORS`/`SORT_OPTIONS`,
хелперы `categoryLabel`, `rankLabel`, `rankColor`, `itemName`, `iconUrl`.
Русские названия категорий лежат здесь — при добавлении категорий правьте `CATEGORY_TREE`.
Ранги сортируются от легендарного к низкому; «по рангу» — сортировка по умолчанию,
«по разделам» использует порядок `CATEGORY_TREE`.

### API аукциона (`src/lib/auction`)

- `SZApi` — клиент `https://eapi.stalzone.com`. Читаются публичные данные (лоты,
история), поэтому нужна авторизация «по секрету»: заголовки `Client-Id` и `Client-Secret` (см. <https://eapi.stalzone.com/auth.html>, «Secret Based
Authentication»). Методы `getLots(item)` и `getHistory(item)` типизированы
(`AuctionLot`, `PricePoint`); ошибки — исключением.
- `getSzApi()` — берёт креды из переменных окружения `CLIENT_ID` и `CLIENT_SECRET` (`.env`; для секрета поддерживается и старое имя `SZ_API_TOKEN`). Если их нет,
возвращает `null`, и блоки на странице показывают заглушку.
- `getLots` постранично добирает все активные лоты (страница — 200, ограничение 600),
`getHistory` — все сделки за период (пачки по 6 страниц, не больше 30 страниц).
- Параметры API: `limit` (макс. 200, по умолчанию 20), `offset`, `additional`;
у лотов ещё `sort` и `order` (в клиенте не используются — сортировка в интерфейсе).
- `additional: true` (в клиенте включён) даёт дополнительные поля по лоту/сделке:
`qlt` (качество), `ptn` (точка), `buyer` (покупатель), `it_transf_count` и др.
Для истории доп. поля тянем только с первой страницы: если у предмета нет
`qlt`/`ptn`, остальные страницы запрашиваются без них (меньше трафика).
- Формат ответа: лоты — `{ total, lots: [...] }`, история — `{ total, prices: [...] }`.

### Кэш данных аукциона (`src/lib/auction/data.ts`)

- `loadLots(itemId)` и `loadHistory(itemId, days, window)` — обёртки над `SZApi` с директивой `use cache`. Лоты живут ~1 минуту (`revalidate: 60`), история —
~5 минут (`revalidate: 300`), тег — `item:<id>` (для `revalidateTag`).
- Ключ истории включает `window` — время запроса, **округлённое вниз** до 5 минут
(`windowOf`). Поэтому все фильтры (качество, точка) и соседние запросы попадают
в один кэш-энтри: API дёргается не чаще раза в 5 минут на предмет+период,
а смена фильтра — мгновенная (фильтрация уже готовых данных в памяти).
- `ItemHistory` и `ItemLots` — раздельные Suspense-блоки: лоты (один запрос)
показываются раньше истории (у «горячих» предметов это десятки страниц).
- `loadHistory` **читает историю из PostgreSQL**, а не из API: страница в API
не ходит. `loadLots` — как и раньше из API (лоты в БД не сохраняются).
- `ensureHistory(itemId)` — ленивый backfill: при первом открытии карточки
история за `BACKFILL_DAYS` (30) дней сразу тянется из API, кладётся в БД
и показывается — ждать воркера не нужно. Дальше историю дописывает воркер.
Вызывается после `connection()`: внутри есть `Date.now()` и запись в БД.

### База данных и воркер

- Схема (`prisma/schema.prisma`): `TrackedItem` (за кем следим),
`ItemSync` (состояние синхронизации: `backfilledAt`, `lastSyncedAt`,
`lastSaleTime`, `lastError`), `Sale` (сделки: время, цена, количество,
качество, точка и ключ дедупликации `key`), `SyncLog` (журнал прогонов),
`AlertChat` и `AlertEvent` (подписки и лог уведомлений — см. «Телеграм-бот»).
- Миграция — `prisma/migrations/20251015000000_init`; применяется командой
`bun migrate` (`prisma migrate deploy`) или сервисом `migrate` в compose.
- `src/lib/db/index.ts` — Prisma-клиент как singleton (`globalThis` в dev).
- `src/lib/db/sales.ts` — `readSales`, `saveSales` (вставка пачками по 1000,
дубликаты пропускаются), `latestSaleTime`, `trackItem`.
- `src/lib/db/alerts.ts` — `listActiveAlertChats`, `upsertAlertChat`,
`wasAlertSent` / `markAlertSent` (дедуп) — см. «Телеграм-бот».
- `src/app/actions.ts` — серверный экшен `trackItem`: при открытии карточки
помечает предмет отслеживаемым (`ItemHistory` зовёт его после `connection()`).
- `src/worker/index.ts` — воркер: раз в `WORKER_INTERVAL_MS` (по умолчанию
5 минут) обходит отслеживаемые предметы; при первом появлении предмета
делает разовый backfill за `WORKER_BACKFILL_DAYS` (30) дней, дальше
дописывает только новое (начиная с последней сохранённой сделки).
Если выборка упёрлась в лимит страниц (`complete: false`), `backfilledAt` не ставится и `lastSaleTime` не сдвигается — backfill повторится на
следующем прогоне (дубликаты отсекает `key`). Ошибки по предмету пишутся
в `SyncLog` и `ItemSync.lastError` и не останавливают цикл; SIGTERM/SIGINT —
корректное завершение (дожидается текущего предмета, закрывает Prisma).
В конце каждого прогона воркер чистит старое: сделки и записи `SyncLog` старше `WORKER_RETENTION_DAYS` (35 дней; нужно максимум 30 + запас).
Отслеживание **не снимается само**: раз попав в `TrackedItem` (при первом
открытии карточки — неважно кем), предмет синкается в фоне постоянно,
даже если его больше никто не открывает. Для детектора алертов это значит:
по предметам, которые никто никогда не открывал на сайте, новых `Sale` не
будет и уведомлений по ним тоже не будет — если нужно отслеживать что-то
отдельно от посещаемости сайта, добавьте команду бота `/track <id>`,
которая напрямую создаёт запись в `TrackedItem`.
После сохранения новых сделок по предмету воркер вызывает `checkAlerts(itemId, newSales)` (см. «Телеграм-бот») — сама отправка сообщений в Telegram
делается отдельным процессом `bot`, воркер только пишет событие в `AlertEvent`.
- `src/app/api/health/route.ts` — healthcheck: `SELECT 1` в БД (`await connection()`,
чтобы роут не закэшировался на сборке).
- Переменные окружения: `DATABASE_URL`, `CLIENT_ID`, `CLIENT_SECRET`, `DOMAIN`,
`WORKER_INTERVAL_MS`, `WORKER_BACKFILL_DAYS`, плюс переменные бота (см. ниже).
`.env` в репозиторий не коммитится (он в `.gitignore`).
- Docker: `Dockerfile` — multi-stage с target-ами `web` (standalone), `worker`
и `bot`; `docker-compose.yml` — `db` (Postgres + именованный volume `db-data`),
`migrate` (одноразовый, применяет миграции до старта), `web`, `worker`, `bot`;
у сервисов `restart: unless-stopped` (кроме `migrate`), healthcheck и
ротация логов (`json-file`, 10 МБ × 3). Запуск: `docker compose up -d --build`.

### Серверное и клиентское

- Нормы обновления аукциона: лоты — раз в минуту, история — раз в 5 минут
(это и есть TTL кэша в `data.ts`). Документированных лимитов у API нет,
поэтому наращивать частоту не надо — достаточно кэша.

- Каталог (`app/page.tsx`) — серверный компонент: собирает список предметов,
передаёт краткие версии в клиентский `ItemCatalog`. Раскладка во всю ширину:
слева меню категорий (`CategoryNav`), сверху поиск, фильтр по рангу и сортировка
(по рангу / по разделам / А→Я / Я→А; по умолчанию — по рангу, от легендарного
к низкому; «по разделам» недоступна внутри одной категории, «по рангу» —
при выбранном конкретном ранге). Категории в меню —
только верхний уровень; показываются те, что есть в данных. Карточки
показываются порциями по 120 (кнопка «Показать ещё»), есть «Сбросить».

- Детальная страница (`app/items/[id]/page.tsx`) — серверный компонент,
читает предмет по `id` (иначе `notFound()`), показывает иконку, категорию
и ранг (окрашенный цветом ранга). Характеристик на странице нет — только
«История продаж» (`ItemHistory`) и «Текущий аукцион» (`ItemLots`), каждый
в своём `<Suspense>`. Обращение к `params` обёрнуто в `<Suspense>` — иначе dev-валидация «мгновенной навигации» ругается
(см. /docs/messages/instant-shell-url-data).

- `ItemMarket` (серверный) тянет лоты и историю за выбранный период, дальше
работает клиентский `MarketView`: выбор качества (`qlt`, названия и цвета из `@/lib/auction/quality`) и точки (`ptn`; отсутствующая точка считается нулём,
поэтому в списке есть «0»), график цены (`PriceChart`) с осями и подсказкой
при наведении и таблица лотов (`LotsTable`) — переключение страниц (по 20)
сверху, сортировка кликом по заголовку столбца.

- Статистика рынка: средняя цена (с числом сделок за период) и медиана — по **совершённым сделкам** за выбранный период (и с учётом фильтров качества/точки),
последняя сделка — из истории, мин. предложение — минимальный выкуп активных
лотов, прибыль = средняя − мин. предложение, маржа = прибыль / средняя × 100.
Эта же формула (`estimateProfit` в `@/lib/auction/market`) переиспользуется
детектором алертов — отдельной формулы для бота не заводим.

- Фильтры качества и точки показываются, только если признак есть в данных,
но значения перечисляются полным диапазоном: заточка 0–15, качество 0–5
(`featureRange` в `@/lib/auction/market`), чтобы варианты не «пропадали»,
когда по какому-то значению пока не было сделок или лотов.

- Фильтры рынка — период (7/14/30 дней) и качество/точка — берутся из адреса
(`?days=&qlt=&ptn=`): ссылки-«чипы» лежат в `MarketView`, разбор — `parsePeriod`/`parseFeature`, сборка адреса — `marketHref` (`@/lib/auction/period`).
Клиентского состояния у фильтров нет, поэтому они работают и без гидратации,
а данные выбираются и фильтруются на сервере.

- `ItemMarket` вызывает `await connection()` (`next/server`) и только потом `Date.now()` — до `connection()` пререндер запрещает нестабильные значения;
окно считается по календарным датам. История тянется страницами (по 200,
пачками по 6, не больше 30 страниц) и агрегируется в `summarize` (`@/lib/auction/market`): ряд графика — ~120 интервалов со средней ценой,
статистика (средняя, медиана, число сделок и штук, мин/макс, последняя) —
по всем сделкам окна. Если лимита страниц не хватило на весь период,
UI пишет «период покрыт не полностью». Дата/время форматируются детерминированно
(`src/lib/format.ts`, Москва UTC+3) — иначе SSR и браузер дают разные строки
и ломается гидратация.

- Иконки не лежат в `public`, их отдаёт route handler `app/icons/[...path]/route.ts` из папки базы.

### Внешний вид

Тёплая светлая тема. Палитра вынесена в токены в `globals.css` (`@theme`):
классы `bg-surface`, `text-accent` и т.п. Структура токенов повторяет lunar-zone.ru
(уровни поверхностей, границ и текста), оттенки — тёплые.

| Токен           | Цвет      | Назначение                                        |
| --------------- | --------- | ------------------------------------------------- |
| `background`    | `#FAF8F4` | фон страницы                                      |
| `surface`       | `#FFFFFF` | карточки и панели                                 |
| `surface-muted` | `#F4EEE6` | вложенные поверхности и ховер                     |
| `foreground`    | `#2B2621` | основной текст                                    |
| `muted`         | `#7C7268` | вторичный текст                                   |
| `faint`         | `#A89E92` | третичный текст и подписи                         |
| `line`          | `#EBE3D8` | границы                                           |
| `line-strong`   | `#DBD0C0` | границы заметнее                                  |
| `accent`        | `#B06A37` | акцент: ссылки, активные элементы, главные кнопки |
| `accent-soft`   | `#F8E9D7` | подложка акцента                                  |

Плюс тень `--shadow-card` (класс `shadow-card`). Блоки — белые панели `rounded-xl` с рамкой `line` и тенью `shadow-card`: шапка и подвал сайта,
меню разделов, панель фильтров, карточки и секции на странице предмета.

Ранги окрашены: цвета лежат в `RANK_COLORS` (`catalog.ts`), хелпер `rankColor`.
Рамка карточки, свечение (`box-shadow`) и подпись ранга красятся в цвет ранга;
у предметов без закреплённого ранга (`DEFAULT`) рамка и свечение серые
(ранг можно выбрать на странице).

### Известные предупреждения сборки

- `bun build` выводит предупреждения Turbopack про «overly broad patterns»
в `src/lib/items/index.ts` (чтение базы с диска: `resolveRootDir`, `itemsDir`,
путь до `_variants`). Это ожидаемо: файлы базы попадают в трассировку. На работу
приложения и на размер JS не влияет — не «чинить».

---

## Телеграм-бот уведомлений о сделках

### Задача

Бот следит за сделками, которые воркер уже сохраняет в `Sale`, и присылает
в один групповой чат (используется 2–3 людьми) сообщение, когда появляется
выгодная сделка: `прибыль ≥ minProfit` (и опционально `маржа ≥ minMargin`).
Фильтры настраиваются командами прямо в Telegram — лезть в код или в БД
руками не нужно.

Важное архитектурное решение: **бот не является источником правды по сделкам**.
Он не ходит в `eapi.stalzone.com` и не дублирует логику воркера — только
читает то, что воркер уже посчитал и сохранил, и шлёт сообщения. Это значит:
если воркер встанет, бот просто не получит новых событий, а не сломается
с ошибками API.

### Схема данных (добавить в `prisma/schema.prisma`)

```prisma
// Групповой чат (или личка), куда бот шлёт уведомления, со своими фильтрами.
// На 2–3 человек обычно будет одна запись — общий групповой чат,
// но схема не ограничивает количество.
model AlertChat {
  id            String   @id @default(cuid())
  telegramChatId String  @unique            // chat.id из Telegram (отрицательный для групп)
  title         String?                     // название чата — для логов/отладки
  minProfit     Int      @default(50000)    // порог прибыли в игровой валюте
  minMargin     Float?                      // порог маржи в % (опционально)
  categories    String[] @default([])       // пусто = все категории (топ-уровень CATEGORY_TREE)
  ranks         String[] @default([])       // пусто = все ранги
  active        Boolean  @default(true)     // /pause выключает без удаления настроек
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  events AlertEvent[]
}

// Лог отправленных уведомлений — для дедупликации и истории.
model AlertEvent {
  id          String    @id @default(cuid())
  alertChatId String
  alertChat   AlertChat @relation(fields: [alertChatId], references: [id])
  itemId      String                        // id предмета (как в ItemsDatabase)
  saleKey     String                        // ключ сделки из Sale.key — дедуп
  profit      Int
  margin      Float?
  sentAt      DateTime  @default(now())

  @@unique([alertChatId, saleKey])          // одна и та же сделка не шлётся чату дважды
  @@index([itemId])
}
```

После правки — `bun prisma migrate dev --name add_alerts` локально,
в проде применяется как обычно через сервис `migrate`.

### `src/lib/db/alerts.ts`

Функции:

- `listActiveAlertChats()` — все `AlertChat` с `active: true`.
- `upsertAlertChat(telegramChatId, patch)` — создание чата при первом
  `/start` в группе и обновление полей фильтра командами.
- `wasAlertSent(alertChatId, saleKey)` / `markAlertSent(...)` — дедуп
  через `@@unique([alertChatId, saleKey])`: пишем через
  `prisma.alertEvent.create` в `try/catch` и игнорируем конфликт
  уникальности (как `saveSales` игнорирует дубли по `Sale.key`).

### Детектор сделок в воркере

В `src/worker/index.ts`, сразу после того, как для предмета сохранены новые
сделки (`saveSales`), добавить вызов `checkAlerts(itemId, newSales)`
(новый файл, например `src/lib/alerts/detect.ts`):

1. Взять `listActiveAlertChats()`.
2. Для каждой новой сделки посчитать прибыль/маржу относительно текущих
   активных лотов предмета — переиспользовать `estimateProfit` из
   `@/lib/auction/market` (та же формула, что и на странице предмета:
   прибыль = цена сделки − мин. предложение лотов, маржа = прибыль / цена × 100).
3. Для каждого `AlertChat`, где сделка проходит по порогу и по фильтрам
   категории/ранга (категория и ранг предмета берутся из `catalog.ts`),
   и для которой `wasAlertSent` вернул `false` — записать строку
   в `AlertEvent` (это и есть «постановка в очередь на отправку»).
4. Сам HTTP-запрос к Telegram API из воркера **не делается** — это зона
   ответственности процесса `bot`, чтобы прокси/сетевые проблемы Telegram
   не могли уронить или замедлить синхронизацию сделок.

### Процесс `bot` (`src/bot/index.ts`)

Отдельный долгоживущий процесс (своя команда `bun bot`, свой сервис в
docker-compose), две задачи:

1. **Отправка**: раз в несколько секунд (или через `LISTEN/NOTIFY` Postgres,
   если захочется без поллинга) опрашивает свежие `AlertEvent` без флага
   `sentToTelegram` — либо проще: пишет в Telegram сразу в момент
   создания `AlertEvent`, если `bot` и `worker` работают в одном процессе
   через общий модуль `src/lib/alerts/detect.ts`, импортированный и там,
   и там, с колбэком отправки, переданным только в `bot`. Для начала
   проще всего держать `bot` отдельным процессом с собственным поллингом
   таблицы `AlertEvent` раз в 10–15 секунд — меньше связности между
   воркером и ботом.
2. **Команды** (long polling `getUpdates` через grammY) — см. ниже.

Библиотека — **grammY** (`bun add grammy`): хорошо работает на Bun,
не требует Express/отдельного веб-сервера для long polling.

### Команды бота

Все команды, кроме `/start` и `/chatid`, может выполнять только
отправитель из списка `ALERT_ADMIN_USER_IDS` (переменная окружения,
через запятую) — на 2–3 человек проще явно перечислить Telegram
`user.id`, чем городить роли. Проверка — `src/bot/auth.ts`,
`isAllowedUser(ctx)`.

- `/start` — регистрирует текущий чат (`upsertAlertChat` с дефолтным
  порогом), отвечает текущими настройками.
- `/chatid` — отвечает `chat.id` (нужно один раз, чтобы прописать его
  руками, если захочется завести второй чат).
- `/filter minprofit 60000` — меняет `minProfit`.
- `/filter margin 15` — меняет `minMargin` (`/filter margin off` — сброс).
- `/filter categories Оружие,Броня` — список через запятую, названия
  как в `CATEGORY_TREE` (`categoryLabel`); `все` — сброс фильтра.
- `/filter ranks Легендарный,Эпический` — аналогично по `RANK_OPTIONS`.
- `/status` — текущие настройки чата.
- `/pause` / `/resume` — `active = false/true` без потери фильтров.

Парсинг команд — простой `switch` по `ctx.message.text.split(' ')`,
усложнять грамматику парсера не нужно.

### Формат сообщения (`src/bot/format.ts`)

Короткое сообщение с Markdown-разметкой Telegram: название предмета
(ссылкой на `${DOMAIN}/items/<id>`, та же переменная `DOMAIN`, что уже
используется в проекте), ранг, цена сделки, прибыль, маржа, качество/точка
если есть у сделки. Переиспользовать `formatPrice`/`formatDate` из
`src/lib/format.ts`, чтобы числа выглядели так же, как на сайте.

### Прокси — общий контейнер `shared-proxy`, вне репозитория zone-app

Happ — GUI-клиент, headless-версии под Linux-сервер у него по факту нет.
Нам не нужен сам Happ, нужен движок, который он использует внутри —
**Xray-core** (та же VLESS/Reality-подписка, что Happ использует на вашем
компьютере). Контейнер с ним не кладём внутрь `zone-app` — он пригодится
и другим проектам на сервере, поэтому это отдельный независимый
docker-compose стек, который поднимается один раз и живёт сам по себе.

```
[любой проект, напр. zone-app/bot] --(сеть shared-proxy-net,
  socks5://shared-proxy:1080)--> [shared-proxy: Xray-core]
  --(VLESS/Reality)--> сервер подписки --> api.telegram.org (или что угодно ещё)
```

#### Стек `shared-proxy` — отдельная папка на сервере

Например `~/infra/shared-proxy/` (не внутри `zone-app` — это общая для всех
проектов инфраструктура). Конфиг Xray-core **не лежит готовым файлом** —
собирается при каждом старте контейнера из одной переменной окружения
`VLESS_URL` (та самая ссылка вида `vless://<uuid>@<host>:<port>?...#remark`
из подписки), чтобы сменить ноду или перенести прокси на другой сервер
можно было правкой одной строки, без ручной раскладки полей по JSON:

```
~/infra/shared-proxy/
├── Dockerfile        # teddysun/xray + node для парсинга ссылки
├── entrypoint.js      # VLESS_URL -> config.json -> запуск xray
├── docker-compose.yml
└── .env               # активная ссылка + остальные ноды закомментированы
```

`Dockerfile`:

```dockerfile
FROM teddysun/xray:latest

RUN apk add --no-cache nodejs

COPY entrypoint.js /entrypoint.js

ENTRYPOINT ["node", "/entrypoint.js"]
```

`entrypoint.js` — читает `process.env.VLESS_URL`, парсит его через `new URL(...)`
(WHATWG `URL` справляется с произвольной схемой: `username` — uuid,
`hostname`/`port` — адрес сервера, `searchParams` — `security`/`sni`/`fp`/`pbk`/
`sid`/`type`/`flow`), собирает из этого `config.json` в формате Xray (inbound
`socks` на `1080` и `http` на `1081`, outbound — `vless` c `realitySettings`,
если `security=reality`), пишет его в `/etc/xray/config.json` и запускает
`/usr/bin/xray run -config /etc/xray/config.json` как дочерний процесс,
пробрасывая `SIGTERM`/`SIGINT`, чтобы `docker stop` останавливал корректно.
Если в ссылке не хватает обязательных полей (uuid/host/port, или `pbk` при
`security=reality`) — падает с понятным сообщением при старте, а не молча.

`docker-compose.yml`:

```yaml
services:
  proxy:
    build: .
    container_name: shared-proxy
    environment:
      VLESS_URL: ${VLESS_URL}
    restart: unless-stopped
    networks:
      - shared-proxy-net
    healthcheck:
      test: ["CMD", "sh", "-c", "curl -s -x socks5h://127.0.0.1:1080 https://api.telegram.org >/dev/null"]
      interval: 30s
      timeout: 10s
      retries: 3
    logging:
      driver: json-file
      options: { max-size: "10m", max-file: "3" }

networks:
  shared-proxy-net:
    driver: bridge
    name: shared-proxy-net   # фиксированное имя — на него ссылаются другие проекты
```

`.env` — одна активная строка `VLESS_URL=vless://...` (под вашу подписку
oasisnet.ru, нода Германия по умолчанию) плюс остальные ноды из той же
подписки закомментированы ниже на случай, если основная ляжет: раскомментировать
нужную, закомментировать текущую, `docker compose restart proxy` — пересборка
образа не нужна, `config.json` генерируется заново при каждом старте.

Поднимается один раз: `cd ~/infra/shared-proxy && docker compose up -d --build`.
Порты `1080`/`1081` нигде не публикуются на хост (секции `ports:` нет) —
достать прокси можно только изнутри docker-сетей, явно в него включённых.
Этого достаточно для изоляции: ставить `internal: true` на саму сеть
`shared-proxy-net` **не нужно** — этот флаг отключает связность с
интернетом для всей сети целиком, включая сам `proxy`-контейнер, и тогда
он не сможет достучаться до сервера подписки (в предыдущей версии этого
документа было написано обратное — это была ошибка, здесь она исправлена).

**`.env` содержит реальный ключ доступа к VPN-подписке** — не коммитить
никуда, даже в приватный репозиторий (добавить в `.gitignore` стека).

#### Как `zone-app/bot` подключается к общему прокси

В `docker-compose.yml` проекта `zone-app` своего сервиса `proxy` больше нет
— только подключение к уже существующей внешней сети:

```yaml
services:
  bot:
    build:
      context: .
      target: bot
    environment:
      DATABASE_URL: ${DATABASE_URL}
      TELEGRAM_BOT_TOKEN: ${TELEGRAM_BOT_TOKEN}
      TELEGRAM_PROXY_URL: socks5://shared-proxy:1080   # имя КОНТЕЙНЕРА, не сервиса
      ALERT_ADMIN_USER_IDS: ${ALERT_ADMIN_USER_IDS}
    depends_on:
      db:
        condition: service_started
    restart: unless-stopped
    networks:
      - shared-proxy-net
      - default   # нужна, чтобы достучаться до db (Postgres) этого проекта

networks:
  shared-proxy-net:
    external: true   # сеть создана стеком shared-proxy, не этим compose-файлом
```

В `Dockerfile` добавить multi-stage target `bot` рядом с существующими
`web`/`worker` (та же база — установка зависимостей, копирование `src/bot`
и `src/lib`, команда запуска `bun run src/bot/index.ts`).

Важно обращаться по **имени контейнера** (`shared-proxy`), а не по имени
сервиса `proxy` — DNS-алиасы по имени сервиса compose раздаёт только внутри
своего же compose-проекта, между разными стеками резолвится `container_name`.

Любой следующий проект на этом сервере (ещё один бот, другой сайт) просто
добавляет себе тот же блок `networks: shared-proxy-net: external: true` и
использует тот же `socks5://shared-proxy:1080` — в самом прокси менять
ничего не нужно.

**Смена ноды при сбое:** в `~/infra/shared-proxy/.env` раскомментировать
строку `VLESS_URL=` нужной ноды, закомментировать текущую, `docker compose
restart proxy` там же — все зависящие проекты подхватят новую ноду сразу,
без собственных изменений (меняется только то, куда ходит `shared-proxy`,
бот по-прежнему стучится в `socks5://shared-proxy:1080`).

`src/bot/proxy.ts` (без изменений от исходного плана):

```ts
import { SocksProxyAgent } from "socks-proxy-agent";
import { HttpsProxyAgent } from "https-proxy-agent";

// Собирает агент для fetch по TELEGRAM_PROXY_URL (socks5:// или http(s)://).
// Если переменная не задана — прокси не используется (для случая,
// когда бот и так работает из сети без блокировок, например на зарубежном VPS).
export function buildProxyAgent() {
  const url = process.env.TELEGRAM_PROXY_URL;
  if (!url) {
    return undefined;
  }
  if (url.startsWith("socks")) {
    return new SocksProxyAgent(url);
  }
  return new HttpsProxyAgent(url);
}
```

`src/bot/index.ts` — передаём агент в клиент grammY через
`client.baseFetchConfig.agent`:

```ts
import { Bot } from "grammy";
import { buildProxyAgent } from "./proxy";

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN!, {
  client: {
    baseFetchConfig: {
      agent: buildProxyAgent(),
      // grammY по умолчанию бьётся в Bun fetch; с agent нужен Node-совместимый
      // fetch (undici), compatibilityMode не трогаем, если Bun это уже умеет.
    },
  },
});
```

Пакеты: `bun add grammy socks-proxy-agent https-proxy-agent`.

**Проверка перед запуском в проде**: временный скрипт
`bun run -e 'await fetch("https://api.telegram.org", { ... agent })'`
или просто `bot.api.getMe()` сразу после старта с логом результата —
если прокси настроен неверно, это должно упасть на старте, а не молча
висеть без уведомлений.

### Переменные окружения (дополнение к `.env.example`)

```
TELEGRAM_BOT_TOKEN=            # токен от @BotFather
TELEGRAM_PROXY_URL=socks5://shared-proxy:1080   # имя контейнера shared-proxy
ALERT_ADMIN_USER_IDS=          # telegram user.id через запятую, кому разрешено менять фильтры
```

### Порядок внедрения (для агента)

1. Добавить модели `AlertChat`/`AlertEvent` в `schema.prisma`, сгенерировать
   миграцию.
2. `src/lib/db/alerts.ts` — CRUD-функции, по образцу `sales.ts`.
3. `src/lib/alerts/detect.ts` — чистая функция оценки сделки против фильтров
   чата (принимает сделку, предмет, лоты — ничего не знает про Telegram).
4. Подключить `detect.ts` в конце цикла по предмету в `src/worker/index.ts`,
   писать проходящие по фильтру события в `AlertEvent`.
5. Поднять минимальный `src/bot/index.ts` с `/start`, `/status` и
   поллингом новых `AlertEvent` — проверить, что сообщения доходят
   в тестовый личный чат без фильтров, без прокси (если сеть позволяет)
   или сразу с прокси.
6. Поднять стек `~/infra/shared-proxy` (Xray-core, вне репозитория
   `zone-app`) по `config.json`, добавить `proxy.ts` на стороне бота,
   проверить связность `bot → shared-proxy → Telegram`.
7. Добавить остальные команды фильтров (`/filter ...`), `auth.ts`.
8. Завести сервис `bot` в `docker-compose.yml` проекта с внешней сетью
   `shared-proxy-net`, добавить target в `Dockerfile`, прописать переменные
   в `.env.example`.
9. Проверить дедуп: перезапустить воркер/бота на одних и тех же данных —
   повторных сообщений по уже отправленным сделкам быть не должно.

## Соглашения по коду

- Комментарии — на русском.
- Код простой и читаемый, пригодный для правок руками.
- Условия — в блоках с фигурными скобками, без однострочных `if (...) ...;`.
- Переиспользуемые куски выносим в `src/components` и `src/lib`.
- В `next.config.ts` включены `cacheComponents`, `partialPrefetching`, `reactCompiler`.
При включённом `cacheComponents` не используются `dynamic`/`revalidate`/`fetchCache`,
а несрочные данные оборачиваются в `<Suspense>` (см. `node_modules/next/dist/docs/`).
- Бот и воркер — отдельные процессы с разной зоной ответственности: воркер
  ничего не знает про Telegram, бот ничего не знает про `eapi.stalzone.com`.
  Общий код между ними — только чтение/запись через Prisma и чистые функции
  вроде `estimateProfit`/`detect.ts`.