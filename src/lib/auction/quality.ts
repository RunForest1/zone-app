// Названия качества предмета (поле qlt, 0–5).
const QUALITY_LABELS = [
  "Обычный",
  "Необычный",
  "Особый",
  "Редкий",
  "Исключительный",
  "Легендарный",
];

// Цвета качества — от обычного к легендарному.
const QUALITY_COLORS = [
  "#9c9a94",
  "#6d9e4f",
  "#4a86b8",
  "#8a6bbf",
  "#c2662f",
  "#d9a01c",
];

// Название качества по числу.
export function qualityLabel(value: number): string {
  return QUALITY_LABELS[value] ?? String(value);
}

// Цвет качества по числу.
export function qualityColor(value: number): string {
  return QUALITY_COLORS[value] ?? QUALITY_COLORS[0];
}
