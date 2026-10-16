// Время показываем по Москве (UTC+3) и считаем его вручную.
// Так строки совпадают на сервере и в браузере — иначе гидратация расходится
// и клиентские кнопки перестают реагировать.
const TZ_OFFSET_MS = 3 * 60 * 60 * 1000;

// Цена по-русски: 4200000 -> "4 200 000 ₽".
export function formatPrice(value: number): string {
  const digits = Math.round(value).toString();
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");

  return `${grouped} ₽`;
}

// Дата и время из ISO-строки: "15.10 22:43".
export function formatDateTime(iso: string): string {
  const parts = moscowParts(iso);

  if (!parts) {
    return iso;
  }

  return `${pad(parts.day)}.${pad(parts.month)} ${pad(parts.hours)}:${pad(
    parts.minutes,
  )}`;
}

// Дата без времени: "15.10".
export function formatDay(iso: string): string {
  const parts = moscowParts(iso);

  if (!parts) {
    return iso;
  }

  return `${pad(parts.day)}.${pad(parts.month)}`;
}

// Разбирает ISO-строку в части даты/времени по Москве.
function moscowParts(iso: string) {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const shifted = new Date(date.getTime() + TZ_OFFSET_MS);

  return {
    day: shifted.getUTCDate(),
    month: shifted.getUTCMonth() + 1,
    hours: shifted.getUTCHours(),
    minutes: shifted.getUTCMinutes(),
  };
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
