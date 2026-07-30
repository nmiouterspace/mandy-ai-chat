import { getSessionUser, json } from "../../../lib/server-auth";

type ChatMessage = { role: "user" | "assistant"; text: string };

type ResponsesPayload = {
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
  error?: { message?: string };
};

function readOutputText(payload: ResponsesPayload) {
  if (payload.output_text) return payload.output_text;
  return (payload.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text" && item.text)
    .map((item) => item.text)
    .join("\n")
    .trim();
}

export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return json({ error: "Unauthorized" }, { status: 401 });

  const gatewayToken =
    process.env.AI_GATEWAY_API_KEY ||
    request.headers.get("x-vercel-oidc-token") ||
    process.env.VERCEL_OIDC_TOKEN;
  const openAiKey = process.env.OPENAI_API_KEY;
  const apiKey = gatewayToken || openAiKey;
  if (!apiKey) {
    return json({ error: "Mandy AI chưa nhận được thông tin xác thực AI." }, { status: 503 });
  }

  const useGateway = Boolean(gatewayToken);
  const body = (await request.json()) as {
    messages?: ChatMessage[];
    mode?: "general" | "english";
    style?: string;
    webSearch?: boolean;
  };
  const messages = (body.messages ?? [])
    .filter((message) => message.text?.trim())
    .slice(-20)
    .map((message) => ({ role: message.role, content: message.text.trim() }));
  if (!messages.length) return json({ error: "Tin nhắn trống." }, { status: 400 });

  const englishInstruction =
    "You are Mandy English, a patient English coach. Match the learner's language and level, correct mistakes gently, explain clearly, and include practical examples.";
  const generalInstruction =
    "You are Mandy AI, a warm, accurate personal assistant. Answer in the user's language, be concise but useful, and clearly say when information is uncertain.";
  const styleInstruction =
    body.style === "Mandy Creative"
      ? "Be imaginative and offer several original options when appropriate."
      : body.style === "Mandy Fast"
        ? "Prioritize a short, direct answer."
        : "Balance clarity, depth, and brevity.";

  try {
    const response = await fetch(
      useGateway ? "https://ai-gateway.vercel.sh/v1/responses" : "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: useGateway ? "openai/gpt-5.6-sol" : "gpt-5.6-sol",
          instructions: `${body.mode === "english" ? englishInstruction : generalInstruction} ${styleInstruction}`,
          input: messages,
          ...(body.webSearch ? { tools: [{ type: "web_search" }] } : {}),
        }),
      },
    );
    const payload = (await response.json()) as ResponsesPayload;
    if (!response.ok) {
      return json({ error: payload.error?.message ?? "Dịch vụ AI không phản hồi." }, { status: response.status });
    }
    const text = readOutputText(payload);
    if (!text) return json({ error: "Mandy AI chưa tạo được câu trả lời." }, { status: 502 });
    return json({ text });
  } catch (error) {
    console.error("Mandy AI request failed", error);
    return json({ error: "Không thể kết nối với Mandy AI lúc này." }, { status: 502 });
  }
}
