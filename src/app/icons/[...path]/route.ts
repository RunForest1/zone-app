import fs from "node:fs/promises";
import path from "node:path";
import { ROOT_DIR } from "@/lib/items";

// Отдаёт иконки предметов из базы.
// Адрес: /icons/<категория>/<id>.png, например /icons/backpacks/vyjd.png.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params;
  const iconsDir = path.join(ROOT_DIR, "icons");
  const file = path.resolve(iconsDir, ...segments);

  // Защита от выхода за пределы папки иконок.
  if (file !== iconsDir && !file.startsWith(iconsDir + path.sep)) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const data = await fs.readFile(file);

    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
