import { NextRequest, NextResponse } from "next/server";
import { executeRows, queryRows } from "@/lib/db";
import { embedText } from "@/lib/embed";
import type { CandidateRow, IdRow, MatchResponse } from "@/lib/types";

const K = 60; // RRF 定数（順位の影響をなだらかにする経験的な値）
const POOL = 20; // 各検索で集める候補数
const TOP = 5; // 画面に出す件数

// 求人要件を受け取り、「ベクトルのみ」と「ハイブリッド」両方のランキングを返す。
// 詳しい動作の追跡は docs/hybrid-search-walkthrough.md を参照。
export async function POST(req: NextRequest) {
  try {
    const { jobDescription, keywords } = await req.json();
    if (typeof jobDescription !== "string" || !jobDescription.trim()) {
      return NextResponse.json({ error: "求人要件を入力してください。" }, { status: 400 });
    }
    const vecStr = `[${(await embedText(jobDescription)).join(",")}]`;
    const ftsText = (keywords && keywords.trim()) || jobDescription;

    // ① ベクトル検索（意味の近さ）— VEC_COSINE_DISTANCE + HNSW索引
    const vecRows = await executeRows<IdRow>(
      `SELECT id FROM candidates
      ORDER BY VEC_COSINE_DISTANCE(embedding, ?) ASC
      LIMIT ${POOL}`,
      [vecStr],
    );
    // ② 全文検索（キーワード/BM25）— FTS_MATCH_WORD + 全文索引（FTSは query 必須）
    const ftsRows = await queryRows<IdRow>(
      `SELECT id FROM candidates
      WHERE FTS_MATCH_WORD(?, resume)
      ORDER BY FTS_MATCH_WORD(?, resume) DESC
      LIMIT ${POOL}`,
      [ftsText, ftsText],
    );

    const vecIds = vecRows.map((r) => r.id);
    const ftsIds = ftsRows.map((r) => r.id);
    // 「どっちで拾われたか」判定用の集合
    const hitVec = new Set(vecIds);
    const hitFts = new Set(ftsIds);

    // RRF 融合: score = Σ 1/(K + 順位)。両方の検索でヒットすると加算され上位に来る
    const score = new Map<number, number>();
    vecIds.forEach((id, i) => score.set(id, (score.get(id) ?? 0) + 1 / (K + i + 1)));
    ftsIds.forEach((id, i) => score.set(id, (score.get(id) ?? 0) + 1 / (K + i + 1)));

    // ハイブリッドの上位を確定
    const hybridIds = [...score.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP)
      .map(([id]) => id);
    // 比較用：ベクトル検索だけの上位
    const vectorOnlyIds = vecIds.slice(0, TOP);

    // 表示に必要なIDの本文をまとめて取得
    const needIds = [...new Set([...hybridIds, ...vectorOnlyIds])];
    if (needIds.length === 0) {
      return NextResponse.json({ hybrid: [], vectorOnly: [] } satisfies MatchResponse);
    }
    const rows = await queryRows<CandidateRow>(
      "SELECT id, name, resume FROM candidates WHERE id IN (?)",
      [needIds],
    );
    const byId = new Map(rows.map((r) => [r.id, r]));

    const build = (ids: number[]) =>
      ids
        .map((id) => {
          const row = byId.get(id);
          if (!row) return null;
          return {
            ...row,
            score: score.get(id) ?? 0,
            hitVector: hitVec.has(id),
            hitKeyword: hitFts.has(id),
          };
        })
        .filter((c) => c !== null);

    return NextResponse.json({
      hybrid: build(hybridIds),
      vectorOnly: build(vectorOnlyIds),
    } satisfies MatchResponse);
  } catch (e) {
    console.error("[/api/match] failed:", e);
    return NextResponse.json(
      { error: "検索に失敗しました。時間をおいて再試行してください。" },
      { status: 500 },
    );
  }
}
