import { neon } from "@neondatabase/serverless";

type RuntimeEnv = { GOOGLE_CLIENT_ID?: string };

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
};

export async function getRuntimeEnv() {
  return { GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID } satisfies RuntimeEnv;
}

type QueryResult<T = Record<string, unknown>> = { rows: T[]; rowCount?: number | null };
type NeonSql = {
  query: <T = Record<string, unknown>>(statement: string, values?: unknown[]) => Promise<QueryResult<T>>;
};

class PreparedStatement {
  private values: unknown[] = [];

  constructor(
    private sql: NeonSql,
    private statement: string,
  ) {}

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  private postgresStatement() {
    let index = 0;
    return this.statement.replace(/\?/g, () => `$${++index}`);
  }

  async execute<T = Record<string, unknown>>() {
    return this.sql.query(this.postgresStatement(), this.values) as Promise<QueryResult<T>>;
  }

  async first<T>() {
    const result = await this.execute<T>();
    return result.rows[0] ?? null;
  }

  async all<T>() {
    const result = await this.execute<T>();
    return { results: result.rows };
  }

  async run() {
    const result = await this.execute();
    return { meta: { changes: result.rowCount ?? 0 } };
  }
}

class Database {
  constructor(private sql: NeonSql) {}

  prepare(statement: string) {
    return new PreparedStatement(this.sql, statement);
  }

  async batch(statements: PreparedStatement[]) {
    return Promise.all(statements.map((statement) => statement.run()));
  }
}

let databasePromise: Promise<Database> | null = null;

async function connectDatabase() {
  const databaseUrl = process.env.DATABASE_URL ?? process.env.STORAGE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is unavailable");
  const sql = neon(databaseUrl, { fullResults: true });
  const schemaStatements = [
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      google_sub TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      avatar_url TEXT,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at BIGINT NOT NULL,
      created_at BIGINT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id)`,
    `CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'general',
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      deleted_at BIGINT
    )`,
    `CREATE INDEX IF NOT EXISTS conversations_user_updated_idx ON conversations(user_id, updated_at)`,
    `CREATE INDEX IF NOT EXISTS conversations_user_deleted_idx ON conversations(user_id, deleted_at)`,
    `CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      file_name TEXT,
      created_at BIGINT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS messages_conversation_created_idx ON messages(conversation_id, created_at)`,
  ];

  for (const statement of schemaStatements) {
    await sql.query(statement);
  }

  return new Database(sql as unknown as NeonSql);
}

export async function getDatabase() {
  databasePromise ??= connectDatabase();
  return databasePromise;
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
      `SELECT u.id, u.email, u.name, u.avatar_url AS \"avatarUrl\"
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
