import { ItemsDatabase } from "./index";

// Единый экземпляр базы на всё приложение.
// Читается один раз при первом импорте; варианты в интерфейсе не нужны.
export const itemsDatabase = new ItemsDatabase({ includeVariants: false });
