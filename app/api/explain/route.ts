import { streamText } from "ai";
import { google } from "@ai-sdk/google";
import { NextRequest } from "next/server";

// 応募者がなぜこの求人にマッチするかを Gemini に説明させ、テキストをストリーミングで返す
export async function POST(req: NextRequest) {
  const { jobDescription, candidate } = await req.json();

  const hitWhere =
    [
      candidate.hitVector ? "意味（ベクトル）検索" : null,
      candidate.hitKeyword ? "キーワード（全文）検索" : null,
    ]
      .filter(Boolean)
      .join(" / ") || "不明";

  const result = streamText({
    model: google("gemini-2.5-flash-lite"),
    system:
      "あなたは採用アシスタントです。応募者がなぜこの求人にマッチするかを、採用担当者向けに150字以内で簡潔に日本語で説明してください。誇張せず、経歴の事実に基づいて述べること。",
    prompt: `求人要件:
${jobDescription}

応募者: ${candidate.name}
経歴: ${candidate.resume}
ヒットした検索: ${hitWhere}`,
  });

  // useChat を使わない最小構成なので toTextStreamResponse()（プレーンテキスト）
  return result.toTextStreamResponse();
}
