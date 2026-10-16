import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Папка с вариантами предметов внутри категории.
const VARIANTS_DIR = "_variants";

// Корень базы предметов (русская локаль Stalzone).
// Считаем путь от корня проекта, а если запуск идёт не оттуда
// (например, скрипт запущен из подпапки) — от самого файла.
export const ROOT_DIR = resolveRootDir();

function resolveRootDir(): string {
  const fromProject = path.join(
    process.cwd(),
    "src/lib/stalzone-database-main/ru",
  );

  if (fs.existsSync(fromProject)) {
    return fromProject;
  }

  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.join(here, "..", "stalzone-database-main", "ru");
}

// Локализованные строки предмета (ru, en, es, fr, ko).
export type Lines = Record<string, string>;

// Предмет из базы: данные из json + иконка + варианты.
export interface Item {
  id: string;
  category: string;
  name: { lines?: Lines };
  color: string;
  status: { state: string };
  infoBlocks: unknown[];
  // Путь к иконке относительно корня базы, либо null, если иконки нет.
  icon: string | null;
  // Варианты предмета (папка _variants/<id>).
  variants: Item[];
}

// Настройки базы.
export interface ItemsDatabaseOptions {
  // Корень базы. По умолчанию — база из этого проекта.
  rootDir?: string;
  // Читать ли варианты предметов (папки _variants). По умолчанию true.
  includeVariants?: boolean;
}

// Собирает все предметы из базы в объект по id.
export class ItemsDatabase {
  // Все предметы, ключ — id.
  readonly items: Record<string, Item> = {};

  // Каталоги базы: нужны, чтобы читать варианты предмета по требованию.
  private readonly rootDir: string;
  private readonly itemsDir: string;

  constructor(options: ItemsDatabaseOptions = {}) {
    this.rootDir = options.rootDir ?? ROOT_DIR;
    this.itemsDir = path.join(this.rootDir, "items");
    const includeVariants = options.includeVariants ?? true;

    // Варианты собираем отдельно и привязываем к предметам в конце.
    const variants: Array<{ id: string; item: Item }> = [];

    // Рекурсивно идём по всем json в папке items.
    for (const file of walk(this.itemsDir)) {
      const parts = path.relative(this.itemsDir, file).split(path.sep);
      const variantAt = parts.indexOf(VARIANTS_DIR);
      const isVariant = variantAt !== -1;

      // Варианты не нужны — их файлы не читаем (экономит время и память).
      if (isVariant && !includeVariants) {
        continue;
      }

      const data = JSON.parse(fs.readFileSync(file, "utf8")) as Omit<
        Item,
        "icon" | "variants"
      >;

      const item: Item = {
        ...data,
        icon: iconPath(this.rootDir, data),
        variants: [],
      };

      // Если файл лежит в _variants/<id>/, это вариант предмета с этим id.
      if (isVariant) {
        const baseId = parts[variantAt + 1] ?? item.id;
        variants.push({ id: baseId, item });
      } else {
        this.items[item.id] = item;
      }
    }

    // Привязываем варианты к их предметам.
    for (const { id, item } of variants) {
      const base = this.items[id];

      if (base) {
        base.variants.push(item);
      }
    }
  }

  // Предмет по id.
  get(id: string): Item | undefined {
    return this.items[id];
  }

  // Все предметы списком.
  list(): Item[] {
    return Object.values(this.items);
  }
}

// Рекурсивно возвращает пути всех .json файлов в папке.
function walk(dir: string): string[] {
  const files: string[] = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...walk(full));
      continue;
    }

    if (entry.name.endsWith(".json")) {
      files.push(full);
    }
  }

  return files;
}

// Путь к иконке относительно корня базы, либо null, если файла нет.
function iconPath(
  rootDir: string,
  item: { category: string; id: string },
): string | null {
  const icon = `icons/${item.category}/${item.id}.png`;

  if (fs.existsSync(path.join(rootDir, icon))) {
    return icon;
  }

  return null;
}
