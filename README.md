# zone-app

Стартовый проект на [Next.js](https://nextjs.org) (App Router).

## Стек

- Next.js 16 + React 19
- TypeScript
- Tailwind CSS 4
- Turbopack + React Compiler

## Разработка

```bash
bun install
bun dev
```

Приложение будет доступно на [http://localhost:3000](http://localhost:3000).

## Скрипты

- `bun dev` — запуск сервера разработки
- `bun build` — production-сборка
- `bun start` — запуск production-сборки

## Структура

```txt
src/
└── app/
    ├── globals.css   # глобальные стили и токены Tailwind
    ├── layout.tsx    # корневой layout
    └── page.tsx      # главная страница
```
