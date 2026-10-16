import { connection } from "next/server";
import { prisma } from "@/lib/db";

// Healthcheck: приложение живо и база доступна.
export async function GET() {
  // Ждём запрос — иначе роут может закэшироваться на этапе сборки.
  await connection();

  try {
    await prisma.$queryRaw`SELECT 1`;

    return Response.json({ ok: true, db: "up" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return Response.json({ ok: false, db: "down", error: message }, { status: 503 });
  }
}
