import { getDatabase, getSessionUser, json } from "../../../../../lib/server-auth";

type Context = { params: Promise<{ id: string }> };

async function ownsConversation(userId: string, conversationId: string) {
  const database = await getDatabase();
  return database
    .prepare("SELECT id FROM conversations WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1")
    .bind(conversationId, userId)
    .first<{ id: string }>();
}

export async function GET(request: Request, context: Context) {
  const user = await getSessionUser(request);
  if (!user) return json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  if (!(await ownsConversation(user.id, id))) return json({ error: "Not found" }, { status: 404 });
  const database = await getDatabase();
  const rows = await database
    .prepare(
      `SELECT id, role, content AS text, file_name AS file, created_at AS createdAt
       FROM messages WHERE conversation_id = ? AND user_id = ? ORDER BY created_at ASC`,
    )
    .bind(id, user.id)
    .all();
  return json({ messages: rows.results });
}

export async function POST(request: Request, context: Context) {
  const user = await getSessionUser(request);
  if (!user) return json({ error: "Unauthorized" }, { status: 401 });
  const { id: conversationId } = await context.params;
  if (!(await ownsConversation(user.id, conversationId))) return json({ error: "Not found" }, { status: 404 });
  const body = (await request.json()) as { role?: string; text?: string; file?: string };
  const role = body.role === "assistant" ? "assistant" : "user";
  const content = (body.text ?? "").trim();
  if (!content) return json({ error: "Tin nhắn trống." }, { status: 400 });
  const id = crypto.randomUUID();
  const now = Date.now();
  const database = await getDatabase();
  await database.batch([
    database
      .prepare(
        "INSERT INTO messages (id, conversation_id, user_id, role, content, file_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(id, conversationId, user.id, role, content, body.file ?? null, now),
    database.prepare("UPDATE conversations SET updated_at = ? WHERE id = ? AND user_id = ?").bind(now, conversationId, user.id),
  ]);
  return json({ message: { id, role, text: content, file: body.file ?? null, createdAt: now } }, { status: 201 });
}
