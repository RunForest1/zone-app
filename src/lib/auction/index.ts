// Клиент API аукциона Stalzone.
const BASE_URL = "https://eapi.stalzone.com";

// Сколько ждём ответ API, мс.
const REQUEST_TIMEOUT_MS = 8000;

// Сколько записей API отдаёт за раз (максимум по документации).
const PAGE_SIZE = 200;

// Верхняя граница лотов, чтобы страница не тянула слишком много.
const LOTS_LIMIT = 600;

// Сколько страниц истории максимум тянем и по сколько параллельно.
// 30 страниц = 6000 сделок: у очень «горячих» предметов это меньше
// запрошенного периода, и тогда UI честно показывает покрытый промежуток.
const HISTORY_PAGES = 30;
const HISTORY_BATCH = 6;

// Дополнительные сведения о лоте/сделке.
export interface LotAdditional {
  // Качество предмета (у артефактов).
  qlt?: number;
  // Точка предмета.
  ptn?: number;
  buyer?: string;
  it_transf_count?: number;
  [key: string]: unknown;
}

// Лот на аукционе.
export interface AuctionLot {
  itemId: string;
  amount: number;
  startPrice: number;
  currentPrice?: number;
  buyoutPrice: number;
  startTime: string;
  endTime: string;
  additional: LotAdditional;
}

// Точка истории продаж.
export interface PricePoint {
  amount: number;
  price: number;
  time: string;
  additional: LotAdditional;
}

// Лоты и история — публичные данные, поэтому авторизуемся «по секрету»:
// заголовки Client-Id и Client-Secret (см. https://eapi.stalzone.com/auth.html).
export class SZApi {
  private headers: Record<string, string>;

  constructor(clientId: string, clientSecret: string) {
    this.headers = {
      "Client-Id": clientId,
      "Client-Secret": clientSecret,
      "Content-Type": "application/json",
    };
  }

  // Все активные лоты предмета (постранично, до LOTS_LIMIT).
  async getLots(item: string): Promise<AuctionLot[]> {
    const first = await this.lotsPage(item, 0);
    const lots = [...first.items];

    for (
      let offset = PAGE_SIZE;
      lots.length < first.total;
      offset += PAGE_SIZE
    ) {
      if (lots.length >= LOTS_LIMIT) {
        break;
      }

      const page = await this.lotsPage(item, offset);

      if (page.items.length === 0) {
        break;
      }

      lots.push(...page.items);
    }

    return lots;
  }

  // История цен за последние `days` дней от времени `now`.
  // Окно закрываем полностью (страницы тянем пачками), поэтому период
  // не обрезается даже у «горячих» предметов с тысячами сделок.
  // Первая страница идёт с доп. полями: по ней видно, есть ли у предмета
  // качество/точка. Если их нет — остальное тянем без них (меньше трафика).
  // Возвращаем хронологически: сначала старые сделки, потом свежие.
  async getHistory(
    item: string,
    days: number,
    now: number,
  ): Promise<PricePoint[]> {
    const since = now - days * 24 * 60 * 60 * 1000;
    const first = await this.historyPage(item, 0, true);
    const collected: PricePoint[] = [...first.items];
    const withFeatures = first.items.some(
      (point) =>
        typeof point.additional?.qlt === "number" ||
        typeof point.additional?.ptn === "number",
    );

    let done = this.reachedEnd(first.items, since);

    for (
      let start = 1;
      start < HISTORY_PAGES && !done;
      start += HISTORY_BATCH
    ) {
      const requests: Array<Promise<{ items: PricePoint[] }>> = [];

      for (
        let i = start;
        i < Math.min(start + HISTORY_BATCH, HISTORY_PAGES);
        i += 1
      ) {
        requests.push(this.historyPage(item, i * PAGE_SIZE, withFeatures));
      }

      const pages = await Promise.all(requests);

      for (const page of pages) {
        collected.push(...page.items);

        if (this.reachedEnd(page.items, since)) {
          done = true;
        }
      }
    }

    return collected
      .filter((point) => new Date(point.time).getTime() >= since)
      .sort((a, b) => a.time.localeCompare(b.time));
  }

  // Дошли ли до границы окна на этой странице (значит, дальше тянуть не надо).
  private reachedEnd(items: PricePoint[], since: number): boolean {
    const oldest = items[items.length - 1];

    if (items.length < PAGE_SIZE || !oldest) {
      return true;
    }

    return new Date(oldest.time).getTime() < since;
  }

  private lotsPage(item: string, offset: number) {
    return this.page<AuctionLot>(
      `/RU/auction/${item}/lots`,
      offset,
      "lots",
      true,
    );
  }

  private historyPage(item: string, offset: number, additional: boolean) {
    return this.page<PricePoint>(
      `/RU/auction/${item}/history`,
      offset,
      "prices",
      additional,
    );
  }

  // Одна страница ответа: общее число и записи.
  private async page<T>(
    path: string,
    offset: number,
    key: string,
    additional: boolean,
  ): Promise<{ total: number; items: T[] }> {
    const url = `${BASE_URL}${path}?limit=${PAGE_SIZE}&offset=${offset}&additional=${additional}`;
    const res = await fetch(url, {
      headers: this.headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!res.ok) {
      throw new Error(
        `Запрос ${path} не удался: ${res.status} ${res.statusText}`,
      );
    }

    const data = (await res.json()) as { total?: number } & Record<
      string,
      unknown
    >;
    const items = (data[key] as T[] | undefined) ?? [];

    return { total: data.total ?? items.length, items };
  }
}

let cached: SZApi | null | undefined;

// API аукциона из переменных окружения CLIENT_ID и CLIENT_SECRET
// (для секрета поддерживается и старое имя SZ_API_TOKEN).
// Возвращает null, если креды не заданы.
export function getSzApi(): SZApi | null {
  if (cached === undefined) {
    const clientId = process.env.CLIENT_ID;
    const clientSecret = process.env.CLIENT_SECRET ?? process.env.SZ_API_TOKEN;
    cached =
      clientId && clientSecret ? new SZApi(clientId, clientSecret) : null;
  }

  return cached;
}
