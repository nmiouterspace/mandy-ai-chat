import { getDatabase, getSessionUser, json } from "../../../lib/server-auth";

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return json({ error: "Unauthorized" }, { status: 401 });
  const trash = new URL(request.url).searchParams.get("trash") === "1";
  const database = await getDatabase();
  const rows = await database
    .prepare(
      `SELECT id, title, mode, created_at AS createdAt, updated_at AS updatedAt, deleted_at AS deletedAt
       FROM conversations
       WHERE user_id = ? AND deleted_at IS ${trash ? "NOT NULL" : "NULL"}
       ORDER BY ${trash ? "deleted_at" : "updated_at"} DESC LIMIT 50`,
    )
    .bind(user.id)
    .all();
  return json({ conversations: rows.results });
}

export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json()) as { title?: string; mode?: string };
  const id = crypto.randomUUID();
  const now = Date.now();
  const title = (body.title ?? "Cuộc trò chuyện mới").trim().slice(0, 80) || "Cuộc trò chuyện mới";
  const mode = body.mode === "english" ? "english" : "general";
  const database = await getDatabase();
  await database
    .prepare(
      "INSERT INTO conversations (id, user_id, title, mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(id, user.id, title, mode, now, now)
    .run();
  return json({ conversation: { id, title, mode, createdAt: now, updatedAt: now } }, { status: 201 });
}
