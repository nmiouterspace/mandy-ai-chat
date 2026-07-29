import { getDatabase, getSessionUser, hashToken, json, readCookie } from "../../../../lib/server-auth";

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  return json({ user });
}

export async function DELETE(request: Request) {
  const token = readCookie(request, "mandy_session");
  if (token) {
    const database = await getDatabase();
    await database.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await hashToken(token)).run();
  }
  return json(
    { ok: true },
    { headers: { "set-cookie": "mandy_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0" } },
  );
}
