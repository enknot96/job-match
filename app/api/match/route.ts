import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { embedText } from "@/lib/embed";

const K = 60; // RRF 定数（順位の影響をなだらかにする経験的な値）
const POOL = 20; // 各検索で集める候補数
const TOP = 5; // 画面に出す件数

type Row = { id: number; name: string; resume: string };

// 求人要件を受け取り、「ベクトルのみ」と「ハイブリッド」両方のランキングを返す
export async function POST(req: NextRequest) {
  const { jobDescription, keywords } = await req.json();
  const vecStr = `[${(await embedText(jobDescription)).join(",")}]`;
  const ftsText = (keywords && keywords.trim()) || jobDescription;

  // ① ベクトル検索（意味の近さ）— VEC_COSINE_DISTANCE + HNSW索引
  const [vecRows] = await db.execute(
    `SELECT id FROM candidates
    ORDER BY VEC_COSINE_DISTANCE(embedding, ?) ASC
    LIMIT ${POOL}`,
    [vecStr],
  );
  // ② 全文検索（キーワード/BM25）— FTS_MATCH_WORD + 全文索引（FTSは db.query 必須）
  const [ftsRows] = await db.query(
    `SELECT id FROM candidates
    WHERE FTS_MATCH_WORD(?, resume)
    ORDER BY FTS_MATCH_WORD(?, resume) DESC
    LIMIT ${POOL}`,
    [ftsText, ftsText],
  );

  // IDだけの配列にする
  // (vecRows as {id:number}[]) = TypeScriptへの型の注釈（「これはidを持つ行の配列だ」と教えるだけ。動作は変えない）
  // .map((r) => r.id) = 各行 {id: 1} から id だけ抜き出して新しい配列を作る → [1,2,3]
  const vecIds = (vecRows as { id: number }[]).map((r) => r.id); // [1, 2, 3]
  const ftsIds = (ftsRows as { id: number }[]).map((r) => r.id); // [3, 4]
  // 「どっちで拾われたか」判定用の集合を作る
  // 大前提...  Set と Map は [] でも {} でもなく、専用のクラス
  const hitVec = new Set(vecIds); // {1, 2, 3}
  const hitFts = new Set(ftsIds); // {3, 4}

  // RRF 融合: score = Σ 1/(K + 順位)
  const score = new Map<number, number>(); // 「id → 合計スコア」の表 / キーが数値・値が数値
  // score.set(キー, 値) で1組登録、score.get(キー) で取り出す
  vecIds.forEach((id, i) => score.set(id, (score.get(id) ?? 0) + 1 / (K + i + 1)));
  ftsIds.forEach((id, i) => score.set(id, (score.get(id) ?? 0) + 1 / (K + i + 1)));

  // ハイブリッドの上位を確定
  const hybridIds = [...score.entries()] // [[1,0.0164],[2,0.0161],[3,0.0323],[4,0.0161]]
    .sort((a, b) => b[1] - a[1]) // スコア(2番目)で大きい順に並べ替え
    .slice(0, TOP) // 先頭TOP件（=5件）
    .map(([id]) => id); // [id,score]ペアからidだけ取り出す
  // 比較用：ベクトルのみの上位
  const vectorOnlyIds = vecIds.slice(0, TOP); // 比較用：ベクトル検索だけの上位

  // 表示に必要なIDの本文をまとめて取得
  const needIds = [...new Set([...hybridIds, ...vectorOnlyIds])];
  if (needIds.length === 0) return NextResponse.json({ hybrid: [], vectorOnly: [] });
  const [rows] = await db.query("SELECT id, name, resume FROM candidates WHERE id IN (?)", [
    needIds,
  ]);
  const byId = new Map((rows as Row[]).map((r) => [r.id, r]));

  const build = (ids: number[]) =>
    ids.map((id) => ({
      ...byId.get(id)!,
      score: score.get(id),
      hitVector: hitVec.has(id),
      hitKeyword: hitFts.has(id),
    }));

  return NextResponse.json({ hybrid: build(hybridIds), vectorOnly: build(vectorOnlyIds) });
}

// ==============================================================
// 4人の応募者がDBにいると仮定して、POSTされた瞬間からコードを上から順に追う
// ==============================================================

// 🎬 登場人物（DBの中身・簡略版）
// ┌─────┬──────┬────────────────────────┐
// │ id  │ 名前 │          経歴          │
// ├─────┼──────┼────────────────────────┤
// │ 1   │ 佐藤 │ React/TS + AWS認定     │
// ├─────┼──────┼────────────────────────┤
// │ 2   │ 田中 │ React/TS（認定なし）   │
// ├─────┼──────┼────────────────────────┤
// │ 3   │ 森   │ SRE/インフラ + AWS認定 │
// ├─────┼──────┼────────────────────────┤
// │ 4   │ 渡辺 │ Python（無関係）       │
// └─────┴──────┴────────────────────────┘

// 📨 送られてきたリクエスト
// { "jobDescription": "Reactフロントエンド", "keywords": "AWS認定" }

// ---
// ここから route.ts を上から順に実行します。

// ① リクエストを受け取る

// const { jobDescription, keywords } = await req.json();
// → jobDescription = "Reactフロントエンド" / keywords = "AWS認定"

// ② 求人要件をベクトル化

// const vecStr = `[${(await embedText(jobDescription)).join(",")}]`;
// → "Reactフロントエンド" をGeminiが数値化 → vecStr = "[0.12,0.88,...]"（求人の意味ベクトル）

// ③ キーワードを決める

// const ftsText = (keywords && keywords.trim()) || jobDescription;
// → keywordsが入ってるので ftsText = "AWS認定"

// ④ ベクトル検索（意味が近い順にidを取得）

// const [vecRows] = await db.execute(`... ORDER BY VEC_COSINE_DISTANCE(embedding, ?) ASC LIMIT 20`, [vecStr]);
// TiDBが「求人の意味に近い順」を返す。森(3)はインフラ職で意味が遠いので入らない：
// → vecRows = [{id:2}, {id:1}, {id:4}]（田中→佐藤→渡辺の順）

// ⑤ 全文検索（"AWS認定"を含むidを取得）

// const [ftsRows] = await db.query(`... WHERE FTS_MATCH_WORD(?, resume) ... LIMIT 20`, [ftsText, ftsText]);
// "AWS認定"を実際に持つ人だけ返る。田中(2)・渡辺(4)は持ってないので入らない：
// → ftsRows = [{id:3}, {id:1}]（森→佐藤の順）

// ▎ ✋ ここで重要：ベクトルには森がいない／全文には田中・渡辺がいない。2つの検索の顔ぶれが違うのがポイント。

// ⑥ idだけの配列にする

// const vecIds = (vecRows ...).map((r) => r.id);   // [2, 1, 4]
// const ftsIds = (ftsRows ...).map((r) => r.id);   // [3, 1]
// → vecIds = [2, 1, 4] / ftsIds = [3, 1]

// ⑦ 「どっちで拾われたか」用の集合

// const hitVec = new Set(vecIds);   // 中身: 2,1,4
// const hitFts = new Set(ftsIds);   // 中身: 3,1
// → あとで「森(3)はベクトルにいた？」を hitVec.has(3) で聞ける（→ false）

// ⑧ RRF：idごとにスコアを足し込む（最重要）

// const score = new Map();   // 空の「id→点数」表
// vecIds.forEach((id, i) => score.set(id, (score.get(id) ?? 0) + 1/(K + i + 1)));
// ftsIds.forEach((id, i) => score.set(id, (score.get(id) ?? 0) + 1/(K + i + 1)));

// 1人ずつ点を入れていきます（K=60）。iは0始まりの順位。

// ベクトル側 [2,1,4] を処理：

// ┌──────┬─────┬─────────────┬──────────────────────────────┐
// │  誰  │  i  │    計算     │         scoreの中身          │
// ├──────┼─────┼─────────────┼──────────────────────────────┤
// │ id=2 │ 0   │ 1/61=0.0164 │ 2→0.0164                     │
// ├──────┼─────┼─────────────┼──────────────────────────────┤
// │ id=1 │ 1   │ 1/62=0.0161 │ 2→0.0164, 1→0.0161           │
// ├──────┼─────┼─────────────┼──────────────────────────────┤
// │ id=4 │ 2   │ 1/63=0.0159 │ 2→0.0164, 1→0.0161, 4→0.0159 │
// └──────┴─────┴─────────────┴──────────────────────────────┘

// 全文側 [3,1] を処理：

// ┌──────┬─────┬───────────────────────────────────┬────────────────────────┐
// │  誰  │  i  │               計算                │      scoreの中身       │
// ├──────┼─────┼───────────────────────────────────┼────────────────────────┤
// │ id=3 │ 0   │ 1/61=0.0164                       │ …, 3→0.0164            │
// ├──────┼─────┼───────────────────────────────────┼────────────────────────┤
// │ id=1 │ 1   │ 既存0.0161 + 1/62=0.0161 = 0.0322 │ 1→0.0322（上書き更新） │
// └──────┴─────┴───────────────────────────────────┴────────────────────────┘

// ➡️  完成した score：
// 1 → 0.0322  （佐藤：両方にいたので2回足された＝最高得点）
// 2 → 0.0164  （田中：ベクトルのみ）
// 3 → 0.0164  （森：全文のみ）
// 4 → 0.0159  （渡辺：ベクトルのみ・下位）
// ?? 0 の意味：森(3)や田中(2)は初登場なので「まだ点が無い→0から」。佐藤(1)は2回目に来たとき「既存0.0161を取り出して足す」→これで両ヒットが合算される。

// ⑨ ハイブリッドの上位を決める

// const hybridIds = [...score.entries()].sort((a,b)=>b[1]-a[1]).slice(0,TOP).map(([id])=>id);
// - score.entries() → [[1,0.0322],[2,0.0164],[3,0.0164],[4,0.0159]]
// - スコアの高い順に並べ替え → [[1,..],[2,..],[3,..],[4,..]]
// - 上位5件取り、idだけ抜く → hybridIds = [1, 2, 3, 4]（佐藤→田中→森→渡辺）

// ⑩ 比較用：ベクトルのみの上位

// const vectorOnlyIds = vecIds.slice(0, TOP);   // [2, 1, 4]
// → vectorOnlyIds = [2, 1, 4]（田中→佐藤→渡辺。森がいない！）

// ⑪ 必要なidの名前・本文をまとめて取得

// const needIds = [...new Set([...hybridIds, ...vectorOnlyIds])];  // [1,2,3,4]
// const [rows] = await db.query("SELECT id, name, resume FROM candidates WHERE id IN (?)", [needIds]);
// const byId = new Map(rows.map((r) => [r.id, r]));  // id→{id,name,resume}
// → byId は「idを渡せば名前と経歴が引ける早見表」

// ⑫ 表示用に整える build

// const build = (ids) => ids.map((id) => ({
//   ...byId.get(id),         // 名前・経歴をコピー
//   score: score.get(id),    // 点数
//   hitVector: hitVec.has(id),
//   hitKeyword: hitFts.has(id),
// }));

// build([1,2,3,4])（ハイブリッド）の結果：
// ┌─────┬──────┬────────┬───────────────┬─────────────┐
// │ id  │ name │ score  │   hitVector   │ hitKeyword  │
// ├─────┼──────┼────────┼───────────────┼─────────────┤
// │ 1   │ 佐藤 │ 0.0322 │ ✅(1∈{2,1,4}) │ ✅(1∈{3,1}) │
// ├─────┼──────┼────────┼───────────────┼─────────────┤
// │ 2   │ 田中 │ 0.0164 │ ✅            │ ❌          │
// ├─────┼──────┼────────┼───────────────┼─────────────┤
// │ 3   │ 森   │ 0.0164 │ ❌            │ ✅ ← 救済   │
// ├─────┼──────┼────────┼───────────────┼─────────────┤
// │ 4   │ 渡辺 │ 0.0159 │ ✅            │ ❌          │
// └─────┴──────┴────────┴───────────────┴─────────────┘

// ⑬ 両方返す

// return NextResponse.json({ hybrid: build(hybridIds), vectorOnly: build(vectorOnlyIds) });
// → 画面に渡るデータ：
// - vectorOnly（左） = 田中, 佐藤, 渡辺 … 森がいない
// - hybrid（右） = 佐藤, 田中, 森, 渡辺 … 森が復活！

// ---
// 🎯 結論

// この関数は 「意味で探したリスト」と「キーワードで探したリスト」を、idごとに点数を足し合わせて1つにまとめ、両方の表を返すもの。
// - Set = 「その人どっちにいた？」を聞くための名簿
// - Map = 「id→点数」の集計表
// - ?? 0 = 初登場は0から、2回目は足し算 → 両方ヒットが高得点＝森のような人も拾える
