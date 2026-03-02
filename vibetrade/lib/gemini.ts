export class GeminiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "GeminiError";
    this.status = status;
  }
}

type GeminiPart = { text?: string };
type GeminiContent = { role?: string; parts?: GeminiPart[] };
type GeminiCandidate = { content?: GeminiContent };
type GeminiResponse = { candidates?: GeminiCandidate[] };

function stripCodeFences(s: string): string {
  const trimmed = s.trim();
  const m = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return m ? m[1].trim() : trimmed;
}

export async function generateJsonWithGemini<T>(opts: {
  systemPrompt: string;
  userPrompt: string;
  model?: string;
  temperature?: number;
}): Promise<T> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new GeminiError("GEMINI_API_KEY not set");

  const model = opts.model ?? process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: opts.systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: opts.userPrompt }] }],
      generationConfig: {
        temperature: opts.temperature ?? 0.1,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new GeminiError(`Gemini request failed (${res.status}). ${txt}`.trim(), res.status);
  }

  const data = (await res.json()) as GeminiResponse;
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("")?.trim();
  if (!text) throw new GeminiError("Gemini returned empty response");

  const jsonStr = stripCodeFences(text);
  try {
    return JSON.parse(jsonStr) as T;
  } catch (e) {
    throw new GeminiError(`Failed to parse Gemini JSON: ${e instanceof Error ? e.message : "unknown error"}`);
  }
}

