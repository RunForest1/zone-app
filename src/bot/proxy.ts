import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";

// Собирает агент для fetch по TELEGRAM_PROXY_URL (socks5:// или http(s)://).
// Если переменная не задана — прокси не используется (когда бот и так
// работает из сети без блокировок, например на зарубежном VPS).
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
