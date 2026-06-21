import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { embedText } from "@/lib/embed";

export async function GET() {
  // 1) TiDB 接続テスト
  const [rows] = await db.query("SELECT 1 AS ok");
  const dbOk = (rows as { ok: number }[])[0]?.ok;
  // 2) Gemini Embedding テスト
  const vec = await embedText("接続テスト用のサンプル文です");
  return NextResponse.json({
    dbOk, // 1 なら DB接続OK
    embeddingDims: vec.length, // 1536 なら Embedding OK
  });
}
