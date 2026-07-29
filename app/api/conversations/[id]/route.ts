import { getDatabase, getSessionUser, json } from "../../../../lib/server-auth";

type Context = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, context: Context) {
  const user = await getSessionUser(request);
  if (!user) return json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const database = await getDatabase();
  const permanent = new URL(request.url).searchParams.get("permanent") === "1";

  if (permanent) {
    const result = await database
      .prepare("DELETE FROM conversations WHERE id = ? AND user_id = ? AND deleted_at IS NOT NULL")
      .bind(id, user.id)
      .run();
    if (!result.meta.changes) return json({ error: "Not found" }, { status: 404 });
    return json({ ok: true, permanent: true });
  }

  const now = Date.now();
  const result = await database
    .prepare("UPDATE conversations SET deleted_at = ?, updated_at = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL")
    .bind(now, now, id, user.id)
    .run();
  if (!result.meta.changes) return json({ error: "Not found" }, { status: 404 });
  return json({ ok: true, deletedAt: now });
}

export async function PATCH(request: Request, context: Context) {
  const user = await getSessionUser(request);
  if (!user) return json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { action?: string };
  if (body.action !== "restore") return json({ error: "Unsupported action" }, { status: 400 });

  const now = Date.now();
  const database = await getDatabase();
  const result = await database
    .prepare("UPDATE conversations SET deleted_at = NULL, updated_at = ? WHERE id = ? AND user_id = ? AND deleted_at IS NOT NULL")
    .bind(now, id, user.id)
    .run();
  if (!result.meta.changes) return json({ error: "Not found" }, { status: 404 });
  return json({ ok: true, updatedAt: now });
}
