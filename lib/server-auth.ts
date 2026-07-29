type RuntimeEnv = { DB?: D1Database; GOOGLE_CLIENT_ID?: string };

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
};

export async function getRuntimeEnv() {
  const { env } = await import("cloudflare:workers");
  return env as unknown as RuntimeEnv;
}

export async function getDatabase() {
  const database = (await getRuntimeEnv()).DB;
  if (!database) throw new Error("D1 binding DB is unavailable");
  return database;
}

export function readCookie(request: Request, name: string) {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

export async function hashToken(token: string) {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function createSessionToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function getSessionUser(request: Request): Promise<SessionUser | null> {
  const token = readCookie(request, "mandy_session");
  if (!token) return null;
  const tokenHash = await hashToken(token);
  const now = Date.now();
  const database = await getDatabase();
  const row = await database
    .prepare(
      `SELECT u.id, u.email, u.name, u.avatar_url AS avatarUrl
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?
       LIMIT 1`,
    )
    .bind(tokenHash, now)
    .first<SessionUser>();
  return row ?? null;
}

export function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, {
    ...init,
    headers: { "cache-control": "no-store", ...(init?.headers ?? {}) },
  });
}
