import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { embedText } from "@/lib/embed";
import { mutationForbiddenResponse } from "@/lib/guard";

export async function POST(req: NextRequest) {
  const forbidden = mutationForbiddenResponse();
  if (forbidden) return forbidden;

  try {
    const { name, resume } = await req.json();
    if (typeof name !== "string" || typeof resume !== "string" || !name.trim() || !resume.trim()) {
      return NextResponse.json({ error: "name と resume は必須です。" }, { status: 400 });
    }

    // 履歴書を意味ベクトル化 → [0.012, -0.043, 0.91...]（JS配列）
    const vector = await embedText(resume);
    const vecStr = `[${vector.join(",")}]`; // TiDBのベクトルは '[...]' 文字列

    await db.execute("INSERT INTO candidates (name, resume, embedding) VALUES (?, ?, ?)", [
      name,
      resume,
      vecStr,
    ]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[/api/register] failed:", e);
    return NextResponse.json({ error: "登録に失敗しました。" }, { status: 500 });
  }
}
