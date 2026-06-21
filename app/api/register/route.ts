import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { embedText } from "@/lib/embed";

export async function POST(req: NextRequest) {
  const { name, resume } = await req.json();
  // 履歴書を意味ベクトル化 → [0.012, -0.043, 0.91...]（JS配列）
  const vector = await embedText(resume);
  const vecStr = `[${vector.join(",")}]`; // TiDBのベクトルは '[...]' 文字列

  await db.execute("INSERT INTO candidates (name, resume, embedding) VALUES (?, ?, ?)", [
    name,
    resume,
    vecStr,
  ]);
  return NextResponse.json({ ok: true });
}
