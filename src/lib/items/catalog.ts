import type { Item } from "./index";

// Краткая версия предмета для каталога (без тяжёлых infoBlocks).
export interface ItemSummary {
  id: string;
  name: string;
  category: string;
  color: string;
  icon: string | null;
}

// Способ сортировки каталога.
export type SortValue = "rank" | "section" | "name-asc" | "name-desc";

// Значения фильтров каталога. Пустая строка = фильтр не задан.
export interface CatalogFilters {
  query: string;
  category: string;
  color: string;
  sort: SortValue;
}

// Пустые фильтры (все предметы, сортировка по рангу от легендарного к низкому).
export const EMPTY_FILTERS: CatalogFilters = {
  query: "",
  category: "",
  color: "",
  sort: "rank",
};

// Вариант в выпадающем списке.
export interface FilterOption {
  value: string;
  label: string;
  // Недоступный вариант (например, сортировка по рангу при выбранном ранге).
  disabled?: boolean;
}

// Категория верхнего уровня с числом предметов.
export interface CategoryInfo {
  value: string;
  label: string;
  count: number;
}

// Узел дерева категорий: верхний уровень и его подкатегории.
// Ключи value совпадают с путями в базе (поле category у предмета).
interface CategoryNode {
  value: string;
  label: string;
  children?: CategoryNode[];
}

// Русские названия категорий. Меню показывает только верхний уровень и только
// те категории, что есть в данных; подкатегории используются в подписях.
const CATEGORY_TREE: CategoryNode[] = [
  {
    value: "weapon",
    label: "Оружие",
    children: [
      { value: "weapon/assault_rifle", label: "Автоматы" },
      { value: "weapon/submachine_gun", label: "Пистолеты-пулемёты" },
      { value: "weapon/pistol", label: "Пистолеты" },
      { value: "weapon/shotgun_rifle", label: "Дробовики и ружья" },
      { value: "weapon/sniper_rifle", label: "Снайперские винтовки" },
      { value: "weapon/machine_gun", label: "Пулемёты" },
      { value: "weapon/heavy", label: "Прочее вооружение" },
      { value: "weapon/melee", label: "Ближний бой" },
      { value: "weapon/device", label: "Устройства" },
    ],
  },
  {
    value: "weapon_modules",
    label: "Модули оружия",
    children: [
      { value: "weapon_modules/weapon_module", label: "Модули" },
      { value: "weapon_modules/weapon_module_core", label: "Ядра" },
      {
        value: "weapon_modules/weapon_module_remover",
        label: "Квазидеструкторы",
      },
    ],
  },
  {
    value: "armor",
    label: "Броня",
    children: [
      { value: "armor/clothes", label: "Одежда" },
      { value: "armor/combat", label: "Боевые" },
      { value: "armor/combined", label: "Комбинированные" },
      { value: "armor/device", label: "Устройства" },
      { value: "armor/scientist", label: "Научные" },
    ],
  },
  {
    value: "artefact",
    label: "Артефакты",
    children: [
      { value: "artefact/biochemical", label: "Биохимические" },
      { value: "artefact/electrophysical", label: "Электрофизические" },
      { value: "artefact/gravity", label: "Гравитационные" },
      { value: "artefact/other_arts", label: "Прочие" },
      { value: "artefact/thermal", label: "Термические" },
    ],
  },
  {
    value: "attachment",
    label: "Обвесы",
    children: [
      { value: "attachment/accessory", label: "Аксессуары" },
      { value: "attachment/barrel", label: "Надульники и глушители" },
      { value: "attachment/collimator_sights", label: "Прицелы" },
      { value: "attachment/forend", label: "Цевья и крепления" },
      { value: "attachment/handgrips", label: "Рукоятки" },
      { value: "attachment/mag", label: "Магазины" },
      { value: "attachment/other", label: "Прочие обвесы" },
      { value: "attachment/pistol_handle", label: "Пистолетные рукояти" },
    ],
  },
  { value: "backpacks", label: "Рюкзаки" },
  { value: "containers", label: "Контейнеры" },
  { value: "bullet", label: "Патроны" },
  { value: "grenade", label: "Гранаты" },
  { value: "medicine", label: "Медикаменты" },
  {
    value: "supply",
    label: "Снабжение",
    children: [
      { value: "supply/food", label: "Еда" },
      { value: "supply/drink", label: "Напитки" },
      { value: "supply/medicine", label: "Медикаменты" },
    ],
  },
  {
    value: "other",
    label: "Внешний вид",
    children: [
      { value: "other/skins", label: "Косметика" },
      { value: "other/armor_motif", label: "Мотив брони" },
    ],
  },
  {
    value: "device",
    label: "Устройства",
    children: [{ value: "device/device", label: "Устройства" }],
  },
  { value: "misc", label: "Прочее" },
];

// Названия категорий по пути (для карточек и детальной страницы).
export const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  CATEGORY_TREE.flatMap((node): Array<[string, string]> => [
    [node.value, node.label],
    ...(node.children ?? []).map((child): [string, string] => [
      child.value,
      child.label,
    ]),
  ]),
);

// Порядок категорий как в CATEGORY_TREE (для сортировки «по разделам»).
const CATEGORY_ORDER = CATEGORY_TREE.flatMap((node) => [
  node.value,
  ...(node.children ?? []).map((child) => child.value),
]);

// Ранги предметов (поле color в базе). Порядок — от низкого к высокому.
export const RANK_OPTIONS: FilterOption[] = [
  { value: "", label: "Все ранги" },
  { value: "DEFAULT", label: "Обычный" },
  { value: "RANK_NEWBIE", label: "Новичок" },
  { value: "RANK_VETERAN", label: "Ветеран" },
  { value: "RANK_STALKER", label: "Сталкер" },
  { value: "RANK_MASTER", label: "Мастер" },
  { value: "RANK_LEGEND", label: "Легенда" },
  { value: "QUEST_ITEM", label: "Квестовый" },
];

// Порядок рангов для сортировки: первый — самый низкий, последний — легендарный.
const RANK_ORDER = [
  "QUEST_ITEM",
  "DEFAULT",
  "RANK_NEWBIE",
  "RANK_VETERAN",
  "RANK_STALKER",
  "RANK_MASTER",
  "RANK_LEGEND",
];

// Цвета рангов (для обводки карточек и подписей).
export const RANK_COLORS: Record<string, string> = {
  DEFAULT: "#9c9a94",
  RANK_NEWBIE: "#6d9e4f",
  RANK_VETERAN: "#4a86b8",
  RANK_STALKER: "#8a6bbf",
  RANK_MASTER: "#c2662f",
  RANK_LEGEND: "#d9a01c",
  QUEST_ITEM: "#3d8f8f",
};

// Способы сортировки каталога.
export const SORT_OPTIONS: FilterOption[] = [
  { value: "rank", label: "По рангу" },
  { value: "section", label: "По разделам" },
  { value: "name-asc", label: "От А до Я" },
  { value: "name-desc", label: "От Я до А" },
];

// Название категории для показа в интерфейсе.
export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

// Название ранга для показа в интерфейсе.
export function rankLabel(color: string): string {
  const option = RANK_OPTIONS.find((item) => item.value === color);

  if (option) {
    return option.label;
  }

  return color;
}

// Цвет ранга для показа в интерфейсе.
export function rankColor(color: string): string {
  return RANK_COLORS[color] ?? RANK_COLORS.DEFAULT;
}

// Верхний уровень категорий (для подсказок и команд бота).
export const TOP_CATEGORY_OPTIONS: FilterOption[] = CATEGORY_TREE.map(
  (node) => ({
    value: node.value,
    label: node.label,
  }),
);

// Значение верхнего уровня категории по подписи или самому значению
// (для команды /filter categories). Неизвестное — null.
export function topCategoryValue(input: string): string | null {
  const needle = input.trim().toLowerCase();
  const node = CATEGORY_TREE.find(
    (item) =>
      item.value.toLowerCase() === needle ||
      item.label.toLowerCase() === needle,
  );

  return node ? node.value : null;
}

// Значение ранга по подписи или самому значению (для /filter ranks).
// Неизвестное — null. Пустое значение («Все ранги») не возвращаем.
export function rankValue(input: string): string | null {
  const needle = input.trim().toLowerCase();
  const option = RANK_OPTIONS.find(
    (item) =>
      item.value !== "" &&
      (item.value.toLowerCase() === needle ||
        item.label.toLowerCase() === needle),
  );

  return option ? option.value : null;
}

// Локализованное имя предмета (русский, с запасными вариантами).
export function itemName(item: Item): string {
  return item.name.lines?.ru ?? item.name.lines?.en ?? item.id;
}

// Адрес иконки для браузера: путь из базы ("icons/...") → "/icons/...".
export function iconUrl(item: Item): string | null {
  return item.icon ? `/${item.icon}` : null;
}

// Предмет → краткая версия для каталога.
export function toSummary(item: Item): ItemSummary {
  return {
    id: item.id,
    name: itemName(item),
    category: item.category,
    color: item.color,
    icon: iconUrl(item),
  };
}

// Верхние категории, которые есть в данных (для левого меню).
export function topCategories(items: ItemSummary[]): CategoryInfo[] {
  const counts = new Map<string, number>();

  for (const item of items) {
    const top = item.category.split("/")[0];
    counts.set(top, (counts.get(top) ?? 0) + 1);
  }

  return CATEGORY_TREE.filter((node) => counts.has(node.value)).map((node) => ({
    value: node.value,
    label: node.label,
    count: counts.get(node.value) ?? 0,
  }));
}

// Отбирает и сортирует предметы по фильтрам.
export function applyFilters(
  items: ItemSummary[],
  filters: CatalogFilters,
): ItemSummary[] {
  const query = filters.query.trim().toLowerCase();

  const filtered = items.filter((item) => {
    if (query && !item.name.toLowerCase().includes(query)) {
      return false;
    }

    if (filters.color && item.color !== filters.color) {
      return false;
    }

    if (filters.category) {
      const inCategory =
        item.category === filters.category ||
        item.category.startsWith(`${filters.category}/`);

      if (!inCategory) {
        return false;
      }
    }

    return true;
  });

  return sortItems(filtered, filters.sort);
}

// Сортирует предметы выбранным способом.
function sortItems(items: ItemSummary[], sort: SortValue): ItemSummary[] {
  const sorted = [...items];

  if (sort === "name-asc") {
    sorted.sort((a, b) => a.name.localeCompare(b.name, "ru"));
    return sorted;
  }

  if (sort === "name-desc") {
    sorted.sort((a, b) => b.name.localeCompare(a.name, "ru"));
    return sorted;
  }

  sorted.sort((a, b) => {
    // «По разделам» сначала группирует предметы по категориям.
    if (sort === "section") {
      const bySection = categoryWeight(a.category) - categoryWeight(b.category);

      if (bySection !== 0) {
        return bySection;
      }
    }

    // Ранг — от легендарного к низкому.
    const byRank = rankWeight(b.color) - rankWeight(a.color);

    if (byRank !== 0) {
      return byRank;
    }

    return a.name.localeCompare(b.name, "ru");
  });

  return sorted;
}

// Вес ранга для сортировки (порядок из RANK_ORDER, выше — больше).
function rankWeight(color: string): number {
  const index = RANK_ORDER.indexOf(color);

  if (index === -1) {
    return 0;
  }

  return index;
}

// Вес категории для сортировки «по разделам».
function categoryWeight(category: string): number {
  const index = CATEGORY_ORDER.indexOf(category);

  if (index === -1) {
    return CATEGORY_ORDER.length;
  }

  return index;
}
