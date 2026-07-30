import { getDatabase, json } from "../../../lib/server-auth";

export async function GET() {
  const env = {
    databaseUrl: Boolean(process.env.DATABASE_URL),
    storageUrl: Boolean(process.env.STORAGE_URL),
    googleClientId: Boolean(process.env.GOOGLE_CLIENT_ID),
    openAiKey: Boolean(process.env.OPENAI_API_KEY),
  };

  try {
    const database = await getDatabase();
    const result = await database.prepare("SELECT 1 AS ok").first<{ ok: number }>();
    return json({ ok: result?.ok === 1, database: "connected", env });
  } catch (error) {
    console.error("Mandy AI health check failed", error);
    return json(
      {
        ok: false,
        database: "failed",
        env,
        error: error instanceof Error ? error.message : "Unknown server error",
      },
      { status: 500 },
    );
  }
}
