import { createRemoteJWKSet, jwtVerify } from "jose";
import { GOOGLE_CLIENT_ID } from "../../../../lib/google";
import {
  createSessionToken,
  getDatabase,
  getRuntimeEnv,
  hashToken,
  json,
} from "../../../../lib/server-auth";

const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const SESSION_AGE_SECONDS = 60 * 60 * 24 * 30;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { credential?: string };
    if (!body.credential) return json({ error: "Thiếu Google credential." }, { status: 400 });

    const clientId = (await getRuntimeEnv()).GOOGLE_CLIENT_ID ?? GOOGLE_CLIENT_ID;
    const { payload } = await jwtVerify(body.credential, GOOGLE_JWKS, {
      audience: clientId,
      issuer: ["https://accounts.google.com", "accounts.google.com"],
    });

    if (!payload.sub || typeof payload.email !== "string" || !payload.email || payload.email_verified !== true) {
      return json({ error: "Tài khoản Google chưa được xác minh." }, { status: 401 });
    }

    const database = await getDatabase();
    const now = Date.now();
    const email = payload.email.toLowerCase();
    const name = typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : email.split("@")[0];
    const avatarUrl = typeof payload.picture === "string" ? payload.picture : null;

    const existing = await database
      .prepare("SELECT id FROM users WHERE google_sub = ? OR lower(email) = ? LIMIT 1")
      .bind(payload.sub, email)
      .first<{ id: string }>();

    const userId = existing?.id ?? crypto.randomUUID();
    if (existing) {
      await database
        .prepare("UPDATE users SET google_sub = ?, email = ?, name = ?, avatar_url = ?, updated_at = ? WHERE id = ?")
        .bind(payload.sub, email, name, avatarUrl, now, userId)
        .run();
    } else {
      await database
        .prepare(
          "INSERT INTO users (id, google_sub, email, name, avatar_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(userId, payload.sub, email, name, avatarUrl, now, now)
        .run();
    }

    const token = createSessionToken();
    const tokenHash = await hashToken(token);
    const expiresAt = now + SESSION_AGE_SECONDS * 1000;
    await database.batch([
      database.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(now),
      database
        .prepare("INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
        .bind(tokenHash, userId, expiresAt, now),
    ]);

    return json(
      { user: { id: userId, email, name, avatarUrl } },
      {
        headers: {
          "set-cookie": `mandy_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_AGE_SECONDS}`,
        },
      },
    );
  } catch {
    return json({ error: "Không thể xác minh đăng nhập Google." }, { status: 401 });
  }
}
