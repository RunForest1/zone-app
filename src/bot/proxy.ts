import type { Bot } from "grammy";

// Прокси для запросов бота к Telegram.
// Важно: встроенный fetch Bun не умеет socks-прокси и не применяет
// node-агенты (SocksProxyAgent/HttpsProxyAgent), поэтому ходим через
// нативный для Bun параметр `proxy`, а это требует HTTP-прокси.
// У контейнера shared-proxy (Xray) как раз есть http-inbound на порту 1081.

// Тип функции fetch, который ждёт grammY в client.fetch.
type BotOptions = NonNullable<ConstructorParameters<typeof Bot>[1]>;
type ClientFetch = NonNullable<NonNullable<BotOptions["client"]>["fetch"]>;

// Опция fetch конкретно Bun.
type ProxiedInit = RequestInit & { proxy?: string };

// fetch для grammY через TELEGRAM_PROXY_URL (http://…).
// Без переменной возвращает undefined — прокси не используется.
export function buildProxyFetch(): ClientFetch | undefined {
  const url = process.env.TELEGRAM_PROXY_URL;

  if (!url) {
    return undefined;
  }

  // Пересобираем init: оставляем только нужное, отбрасывая node-специфичные
  // поля grammY (agent, compress, duplex) — Bun их не понимает.
  const proxied = (input: string | URL | Request, init: RequestInit = {}) => {
    const { method, headers, body, signal } = init;

    return fetch(input, {
      method,
      headers,
      body,
      signal,
      proxy: url,
    } as ProxiedInit);
  };

  return proxied as unknown as ClientFetch;
}
