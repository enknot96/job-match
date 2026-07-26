import { streamText } from "ai";
import { google } from "@ai-sdk/google";
import { NextRequest, NextResponse } from "next/server";

// 応募者がなぜこの求人にマッチするかを Gemini に説明させ、テキストをストリーミングで返す
export async function POST(req: NextRequest) {
  let jobDescription: unknown;
  let candidate: { name?: string; resume?: string; hitVector?: boolean; hitKeyword?: boolean };
  try {
    ({ jobDescription, candidate } = await req.json());
  } catch {
    return NextResponse.json({ error: "リクエストの形式が不正です。" }, { status: 400 });
  }
  if (typeof jobDescription !== "string" || !candidate?.name || !candidate?.resume) {
    return NextResponse.json({ error: "jobDescription と candidate は必須です。" }, { status: 400 });
  }

  const hitWhere =
    [
      candidate.hitVector ? "意味（ベクトル）検索" : null,
      candidate.hitKeyword ? "キーワード（全文）検索" : null,
    ]
      .filter(Boolean)
      .join(" / ") || "不明";

  try {
    const result = streamText({
      model: google("gemini-3.5-flash-lite"),
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
  } catch (e) {
    console.error("[/api/explain] failed:", e);
    return NextResponse.json({ error: "推薦理由の生成に失敗しました。" }, { status: 500 });
  }
}
