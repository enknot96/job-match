import { google } from "@ai-sdk/google";
import { embed } from "ai";

const embeddingModel = google.embedding("gemini-embedding-001");

export async function embedText(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: embeddingModel,
    value: text,
    // 既定3072次元 → 1536へ縮約し VECTOR(1536) に一致させる
    providerOptions: { google: { outputDimensionality: 1536 } },
  });
  return embedding;
}
