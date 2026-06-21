# 応募者AIランキング — TiDB Cloud の「ハイブリッド検索」で作る次世代HRテック

> **コンテスト記事概要 + 実装手順まとめ（ハイブリッド検索版 / Gemini構成）**
> スタック: Next.js 16 / Vercel AI SDK v6 / TiDB Cloud (Starter) / Google Gemini API
> **コア技術: ベクトル検索 × 全文検索（BM25）を “単一サービス・単一テーブル” で融合するハイブリッド検索**
>
> ※ 前提バージョン: `next@16` / `ai@6` / `@ai-sdk/google` / `mysql2@3`
> （AI SDK はメジャーでストリーミングAPI名が変わるため必ず明記。各パッケージのメジャーは公開前に `npm show <pkg> version` で確認すること）
>
> 💡 **ユースケース**: 「1つの求人に応募してきた人たちの履歴書を、求人要件に対してランキングする」社内ツール。従来 Gemini（Gem）に履歴書を貼り付けて読ませていた運用を、**自社DB（TiDB）に保持したハイブリッド検索 + Geminiの推薦コメント**で作り直す、という実体験ベースの題材。
>
> ⚠️ **製品名の注意**: かつての「TiDB Cloud Serverless」は現在 **「TiDB Cloud Starter」** に改名（2025-08-12 付）。本記事も Starter 表記に統一する。
> 🚨 **全文検索（FTS）の提供リージョンに注意**: TiDB のネイティブ全文検索は **TiDB Cloud Starter / Essential の一部リージョンのみ**で利用可能。2026年6月時点では **AWS フランクフルト（eu-central-1）／AWS シンガポール（ap-southeast-1）の2つだけ**。**東京リージョンでは `FTS_MATCH_WORD` が使えない**ので、クラスタは**シンガポール**（日本から近い）等で作成すること。公開前に自分のクラスタ・リージョンで FTS が動くか必ず確認する。

---

## なぜ「ハイブリッド検索」なのか（この記事の差別化ポイント）

採用マッチングでは、**意味の近さ**と**キーワードの正確さ**のどちらも外せない。

- **ベクトル検索だけ**だと: 「React 3年」で「Next.js + TypeScript」の応募者を拾える一方、「**AWS認定必須**」「**Go 言語**」「**TOEIC 900**」のような“この語が入っていること自体が条件”を取りこぼす。埋め込みは語を意味に溶かしてしまうため、固有名詞・資格名・型番・年数のような厳密一致が苦手。
- **全文検索（キーワード）だけ**だと: 「React 3年以上」で「Next.js 2年」の応募者が引っかからない。意味的な近さを理解できない。

この2つは弱点が**正反対**なので、組み合わせると互いの穴を埋め合える。これが**ハイブリッド検索**であり、RAG の検索品質を上げる定番アプローチでもある。

そして本記事の主役は **「TiDB なら、ベクトル検索も全文検索も同じテーブル・同じSQLで完結する」** という事実。PgVector + PostgreSQL + Elasticsearch を別々に運用する“2DBの綱渡り”が不要になる。**ここが Gems / GPTs や、ベクトルDB単体では再現しにくい競争優位**になる。

> **フック文案:**
> 「求人要件に対して応募者を、意味とキーワードの両面から SQL でランキングできたら、書類選考の常識が変わる。」

---

## 記事コラム概要

### 1. はじめに — 「キーワード検索」と「ベクトル検索」、片方では足りない

採用担当者が "React 3年以上" で絞っても "Next.js 2年 + TypeScript" の応募者は引っかからない（キーワードの限界）。
逆に意味検索だけだと "AWS認定必須" の厳密条件を取りこぼす（ベクトルの限界）。
**両者の弱点が正反対であること**を冒頭で示し、ハイブリッド検索の必然性に繋げる。
（導入として「これまで Gem に履歴書を貼って読ませていた」運用の限界＝データが自社に残らない・検索の効き方を制御できない、に触れると体験談として刺さる）

---

### 2. TiDB Cloud のハイブリッド検索を1段落で説明

- **ベクトル検索 + 全文検索 + 通常のSQL を “1つのサービス・1つのテーブル” で完結**できる
- ベクトルは `VECTOR(1536)` カラム + `VEC_COSINE_DISTANCE`、全文検索は `FTS_MATCH_WORD`（BM25 ランキング）
- サーバーレス・完全従量課金（TiDB Cloud Starter）で、PoC〜本番まで同じ DB。**充実した無料枠**あり
- ベクトルインデックス（HNSW）も全文インデックスも **TiFlash 列指向レプリカ**上に作られる
- 「別々のDBを繋ぎ込む配管」が消えるのが、PostgreSQL + 外部ベクトルDB 構成との最大の違い

---

### 3. デモアプリの構成と技術選定

| レイヤー | 技術 | 役割 |
|---|---|---|
| フロントエンド | Next.js 16 (App Router) | 管理画面 UI |
| AI ストリーミング | Vercel AI SDK v6 `streamText` | 推薦コメントの生成 |
| Embedding | Gemini `gemini-embedding-001`（1536次元に縮約） | テキスト → ベクトル変換 |
| 意味検索 | TiDB `VEC_COSINE_DISTANCE` (HNSW) | セマンティックな近さ |
| キーワード検索 | TiDB `FTS_MATCH_WORD` (BM25) | 厳密一致・固有名詞 |
| スコア融合 | RRF (Reciprocal Rank Fusion) | 2つのランキングを統合 |
| 生成LLM | Gemini `gemini-2.5-flash-lite` | 推薦コメント生成（無料枠が潤沢） |
| DB | TiDB Cloud Starter | ベクトル + テキスト + 全文索引を単一クラスタで保持 |
| デプロイ | Vercel | フロント + API Routes |

> ℹ️ `create-next-app@latest` は現在 Next.js 16 を導入する（App Router がデフォルト、Turbopack 既定）。バージョン表記は実際に使うものへ合わせること。
> 💱 **プロバイダは差し替え可能**: Embedding/生成は AI SDK のプロバイダ層で抽象化されているため、`@ai-sdk/google` を `@ai-sdk/openai` 等へ差し替えられる。本記事は**無料枠が潤沢で日本語に強い Gemini** を主軸にするが、「OpenAI `text-embedding-3-small`（1536次元）にも数行で切り替え可能」という設計の柔らかさ自体が、自作の利点として見せどころになる。

---

### 4〜6. 実装解説（コアパート）

記事の核。スキーマ設計（ベクトル列 + 全文索引）→ Embedding 保存 → **① ベクトル検索 → ② 全文検索 → ③ ハイブリッド融合（RRF）** の順に積み上げる。
「ベクトルだけでは取りこぼす例」を実データで見せてから、ハイブリッドで救済される様子を体験させると説得力が出る。

---

### 7. Vercel AI SDK で「なぜこの応募者か」を自動生成

`streamText` に応募者プロフィール＋**どちらの検索でヒットしたか（意味/キーワード）**をコンテキストとして渡し、採用担当者向けの推薦コメントをストリーミング表示。RAG のコンテキスト注入パターンとして解説。

> ⚠️ サーバー側は **`toTextStreamResponse()`**（プレーンテキスト）で返し、フロントは `fetch` + `ReadableStream` で逐次読み取る最小構成。`useChat` / `useCompletion`（`@ai-sdk/react`）を使う場合はサーバーを `toUIMessageStreamResponse()` に変える（AI SDK v6 では旧 `toDataStreamResponse()` はドキュメントから消えており非推奨／廃止）。

---

### 8. UI — ハイブリッドスコア付き応募者ランキング画面

求人要件テキストを入力すると、**RRF 統合スコア順**で応募者が並ぶ管理画面。
各応募者に「意味検索ヒット / キーワード検索ヒット」のバッジと、AI生成の推薦コメントが付く。

---

### 9. （任意コラム）自作 vs 既製品（Gems / GPTs）

| 観点 | Gems / GPTs | 自作（TiDB + Next.js） |
|---|---|---|
| 初期コスト | ほぼゼロ | スキーマ設計〜実装が必要 |
| データの所有 | プラットフォーム依存 | 自社 DB に完全保持 |
| 検索方式 | ブラックボックス | **ベクトル/全文/ハイブリッドを自分で制御** |
| カスタマイズ | プロンプトのみ | スコア融合の重み・UI を自由に変更可 |
| 社内データ連携 | 困難 | 既存 DB と同一クラスタで管理可 |

> **締め文案:** 「既製品は手軽だが、“検索の効き方そのもの”を自分でチューニングでき、データを自社で持てることが競争優位になる。」

---

### 10. まとめと展望

- 「**ベクトル + 全文 + SQL = 新しい SELECT 文**」のメッセージで締める
- 応用例: 社内ドキュメント検索 / EC レコメンド / サポートチケット振り分け（いずれもハイブリッドが効く）
- 発展: リランカーモデルでの再ランキング、構造化フィルタ（年収・勤務地・応募職種ID）との併用
- **AIエージェントのメモリ基盤への発展**: 「同一テーブルでベクトル＋キーワードをハイブリッド検索する」という発想は、そのまま **AIエージェントの永続メモリ**にも応用できる。セッション/ユーザーを跨いだ記憶の保存・想起に、TiDB（や mem9 のようなメモリレイヤー）を使う構成は本記事の自然な続編になる。

---

## 実装手順

### Step 0. 事前準備

```bash
# プロジェクト作成（最新は Next.js 16。App Router はデフォルト）
npx create-next-app@latest job-matching-ai --typescript --app
cd job-matching-ai

# 依存インストール
# ・dotenv は Next.js が .env.local を自動読込するため不要
# ・useChat を使う場合のみ @ai-sdk/react を追加
npm install ai@6 @ai-sdk/google mysql2
```

`.env.local` に以下を設定:

```env
TIDB_HOST=your-cluster.tidbcloud.com
TIDB_PORT=4000
TIDB_USER=your_user
TIDB_PASSWORD=your_password
TIDB_DATABASE=job_matching

# Google AI Studio で取得した API キー（無料枠で利用可）
GOOGLE_GENERATIVE_AI_API_KEY=...
```

> 🔑 Gemini の API キーは **Google AI Studio**（aistudio.google.com）で無料発行できる。Embedding（`gemini-embedding-001`）も生成（`gemini-2.5-flash-lite`）も無料枠の範囲で動かせる規模のデモ。

---

### Step 1. TiDB Cloud のスキーマ設計（ベクトル列 + 全文索引）

```sql
-- 応募者（職務経歴書）テーブル ＝ ある求人に応募してきた人のプール
CREATE TABLE candidates (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  resume      TEXT         NOT NULL,
  embedding   VECTOR(1536),
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ベクトル/全文どちらのインデックスも TiFlash 列指向レプリカ上に作られる
-- （まず列指向レプリカを用意し、available = 1 になるまで待ってからインデックスを張る）
ALTER TABLE candidates SET TIFLASH REPLICA 1;

-- ① HNSW ベクトルインデックス（インデックス可能な距離関数は COSINE / L2 のみ）
ALTER TABLE candidates
  ADD VECTOR INDEX idx_embedding ((VEC_COSINE_DISTANCE(embedding))) USING HNSW;

-- ② 全文検索インデックス（ハイブリッド検索のキーワード側）
--   MULTILINGUAL パーサは日本語・英語混在を自動解析するため、
--   日英混在しがちな職務経歴書に最適。英語のみなら STANDARD（高速）でも可。
ALTER TABLE candidates
  ADD FULLTEXT INDEX idx_resume_fts (resume) WITH PARSER MULTILINGUAL;
```

> 📝 上の `SET TIFLASH REPLICA 1` を先に張っておけば、両インデックスはその列指向レプリカ上に作られる。レプリカをまだ用意していない場合は、全文インデックス側に `ADD_COLUMNAR_REPLICA_ON_DEMAND` を付けると TiFlash レプリカを自動作成できる（`ADD FULLTEXT INDEX idx_resume_fts (resume) WITH PARSER MULTILINGUAL ADD_COLUMNAR_REPLICA_ON_DEMAND;`）。どちらか一方でよい。
> 📝 ベクトル/全文インデックスの構文は TiDB のバージョンで変わることがある。**利用クラスタの公式ドキュメントで最新表記を必ず確認**すること。
> 🚨 全文検索は **対応リージョン（フランクフルト / シンガポール）のみ**。`FTS_MATCH_WORD` がエラーになる場合はクラスタ種別・リージョンを確認する。

---

### Step 2. DB 接続ユーティリティ

```typescript
// lib/db.ts
import mysql from 'mysql2/promise';

export const db = mysql.createPool({
  host:     process.env.TIDB_HOST,
  port:     Number(process.env.TIDB_PORT),
  user:     process.env.TIDB_USER,
  password: process.env.TIDB_PASSWORD,
  database: process.env.TIDB_DATABASE,
  // TiDB Cloud は TLS 1.2+ 必須。minVersion 未指定だと環境により接続失敗する
  ssl:      { minVersion: 'TLSv1.2', rejectUnauthorized: true },
});
```

---

### Step 3. Embedding 生成ユーティリティ（Gemini）

```typescript
// lib/embed.ts
import { google } from '@ai-sdk/google';
import { embed }  from 'ai';

// GOOGLE_GENERATIVE_AI_API_KEY は環境変数から自動的に読み込まれる
const embeddingModel = google.embedding('gemini-embedding-001');

export async function embedText(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: embeddingModel,
    value: text,
    // 既定は 3072 次元。Matryoshka で 1536 へ縮約し VECTOR(1536) と一致させる。
    providerOptions: { google: { outputDimensionality: 1536 } },
  });
  return embedding;
}
```

> 📐 `gemini-embedding-001` は Matryoshka 表現学習により、1536 や 768 への縮約でも品質劣化が小さい。3072 以外の次元に縮約する場合 Google はベクトルの正規化を推奨するが、本記事は `VEC_COSINE_DISTANCE`（コサイン＝スケール非依存）でランキングするため実用上の影響はない。
> 💱 OpenAI を使う場合は `@ai-sdk/openai` を入れ、`openai.embedding('text-embedding-3-small')`（既定 1536 次元）に差し替えるだけ。

---

### Step 4. 応募者・求人の登録 API

```typescript
// app/api/register/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db }        from '@/lib/db';
import { embedText } from '@/lib/embed';

export async function POST(req: NextRequest) {
  const { name, resume } = await req.json();
  const vector = await embedText(resume);
  const vecStr = `[${vector.join(',')}]`; // TiDB のベクトルリテラルは文字列 '[...]'

  // resume はベクトル化と同時に、全文索引にもそのまま載る（同じカラム）
  await db.execute(
    'INSERT INTO candidates (name, resume, embedding) VALUES (?, ?, ?)',
    [name, resume, vecStr]
  );

  return NextResponse.json({ ok: true });
}
```

> 🔒 本サンプルは認証を省略している。職務経歴書は個人情報のため、**本番では認証・アクセス制御・保存時暗号化**を前提にすること。
> 🧪 **記事・デモ用データは必ずダミー**を使う（実在の応募者データを公開・スクショに出さない）。

---

### Step 5. ① ベクトル検索（意味の近さ）

HNSW インデックスは「`ORDER BY VEC_COSINE_DISTANCE(col, ?) LIMIT k`」の形でのみ使われる点に注意（別名で `ORDER BY` するとフルスキャンになり得るため、距離関数を直接書く）。

```sql
SELECT id, name, resume,
       VEC_COSINE_DISTANCE(embedding, ?) AS distance
FROM candidates
ORDER BY VEC_COSINE_DISTANCE(embedding, ?) ASC
LIMIT 20;
```

---

### Step 6. ② 全文検索（キーワードの正確さ）

`FTS_MATCH_WORD(クエリ, カラム)`（第1引数=検索文字列、第2引数=対象カラム）を WHERE と ORDER BY の両方に書く。スコアは BM25 で、大きいほど関連度が高い。

```sql
SELECT id, name, resume,
       FTS_MATCH_WORD(?, resume) AS bm25
FROM candidates
WHERE FTS_MATCH_WORD(?, resume)
ORDER BY bm25 DESC
LIMIT 20;
```

> 💡 全文検索には「求人要件の全文」より「**必須キーワードだけを抽出した文字列**」を渡す方が精度が上がる（例: `"React AWS認定 TypeScript"`）。簡易デモなら全文をそのまま渡してもよい。

---

### Step 7. ③ ハイブリッド融合（記事のハイライト）— まず「2クエリ + アプリ側RRF融合」

2つのランキングを **RRF（Reciprocal Rank Fusion）** で統合する。RRF は「順位」だけを使うため、スケールの違う2スコア（COSINE 距離と BM25）を**正規化なしで安全に合成**できるのが利点。

まずは **「Step 5 と Step 6 を個別に実行し、アプリ側で順位を合算する」** 形を主役にする。HNSW / 全文インデックスがそれぞれ確実に効き、デバッグもしやすい。各応募者が「意味/キーワードのどちらでヒットしたか」も自然に取れる（推薦コメント生成のコンテキストになる）。

> **RRF の式:** `score(doc) = Σ 1 / (K + rank)` （`K = 60` は経験的な定番値。`rank` は各検索での1始まりの順位）

実装は Step 8 のAPIコード参照。

> 🎚️ RRF の代わりに `final_score = vs_weight * vec_sim + fts_weight * bm25` の**重み付き融合**も可能だが、その場合は各スコアの正規化が必要。まず RRF で動かし、チューニングしたくなったら重み付けへ。

---

#### （発展形）すべてを単一SQLで融合する — “TiDBらしさ”の見せ場

慣れてきたら、**1本の SQL** で RRF 融合まで完結させられる。`WITH` + `UNION ALL` + `GROUP BY` + `ROW_NUMBER()` で、どちらか片方だけにヒットした応募者も拾える。**「ベクトルも全文もRRFも単一SQL」**は TiDB ならではのインパクトがあるので、記事では発展形として見せると効果的。

```sql
WITH
vec AS (
  SELECT id,
         ROW_NUMBER() OVER (ORDER BY VEC_COSINE_DISTANCE(embedding, ?) ASC) AS rnk
  FROM candidates
  ORDER BY VEC_COSINE_DISTANCE(embedding, ?) ASC
  LIMIT 20
),
fts AS (
  SELECT id,
         ROW_NUMBER() OVER (ORDER BY FTS_MATCH_WORD(?, resume) DESC) AS rnk
  FROM candidates
  WHERE FTS_MATCH_WORD(?, resume)
  LIMIT 20
)
SELECT c.id, c.name, c.resume,
       SUM(1.0 / (60 + u.rnk)) AS score   -- RRF（定数 k=60）
FROM (
  SELECT id, rnk FROM vec
  UNION ALL
  SELECT id, rnk FROM fts
) AS u
JOIN candidates c ON c.id = u.id
GROUP BY c.id, c.name, c.resume
ORDER BY score DESC
LIMIT 5;
```

> 📊 `EXPLAIN` で `vec` CTE 側が HNSW ベクトルインデックスを使っているか確認する。CTE 内に窓関数と `ORDER BY ... LIMIT` が同居するとプランが変わることがあり、HNSW が効かなければ上の「2クエリ + アプリ融合」に戻すのが安全。本記事は**2クエリ版をメイン、単一SQL版を発展形**として並べる構成にしている。

---

### Step 8. ハイブリッド検索 API（メイン: 2クエリ + アプリ側RRF）

```typescript
// app/api/match/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db }        from '@/lib/db';
import { embedText } from '@/lib/embed';

const K = 60; // RRF 定数

export async function POST(req: NextRequest) {
  const { jobDescription, keywords } = await req.json();
  const vecStr  = `[${(await embedText(jobDescription)).join(',')}]`;
  // keywords が無ければ求人要件本文をそのまま全文検索に流す
  const ftsText = (keywords && keywords.trim()) || jobDescription;

  // ① ベクトル検索（HNSW が確実に効く形）
  const [vecRows] = await db.execute(
    `SELECT id FROM candidates
     ORDER BY VEC_COSINE_DISTANCE(embedding, ?) ASC
     LIMIT 20`,
    [vecStr]
  );
  // ② 全文検索（BM25）
  const [ftsRows] = await db.execute(
    `SELECT id FROM candidates
     WHERE FTS_MATCH_WORD(?, resume)
     ORDER BY FTS_MATCH_WORD(?, resume) DESC
     LIMIT 20`,
    [ftsText, ftsText]
  );

  // ③ アプリ側で RRF 融合: score = Σ 1/(K + rank)
  const score  = new Map<number, number>();
  const hitVec = new Set<number>();
  const hitFts = new Set<number>();
  (vecRows as { id: number }[]).forEach((r, i) => {
    score.set(r.id, (score.get(r.id) ?? 0) + 1 / (K + i + 1));
    hitVec.add(r.id);
  });
  (ftsRows as { id: number }[]).forEach((r, i) => {
    score.set(r.id, (score.get(r.id) ?? 0) + 1 / (K + i + 1));
    hitFts.add(r.id);
  });

  const topIds = [...score.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id]) => id);
  if (topIds.length === 0) return NextResponse.json({ candidates: [] });

  // 上位IDの本文を取得（IN 句は db.query で配列展開）
  const [rows] = await db.query(
    'SELECT id, name, resume FROM candidates WHERE id IN (?)',
    [topIds]
  );
  const byId = new Map((rows as { id: number; name: string; resume: string }[]).map(r => [r.id, r]));
  const candidates = topIds.map(id => ({
    ...byId.get(id)!,
    score:      score.get(id),
    hitVector:  hitVec.has(id),  // 意味検索でヒット
    hitKeyword: hitFts.has(id),  // キーワード検索でヒット
  }));

  return NextResponse.json({ candidates });
}
```

> 🛟 単一SQL版（Step 7 発展形）に置き換えたくなったら、プレースホルダ順は「ベクトル×2 → 全文×2」。まずはこの2クエリ版で安定して動かすのがおすすめ。

---

### Step 9. Vercel AI SDK で推薦コメントをストリーミング生成（Gemini）

```typescript
// app/api/explain/route.ts
import { streamText } from 'ai';
import { google }     from '@ai-sdk/google';
import { NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
  const { jobDescription, candidate } = await req.json();

  const hitWhere = [
    candidate.hitVector  ? '意味（ベクトル）検索' : null,
    candidate.hitKeyword ? 'キーワード（全文）検索' : null,
  ].filter(Boolean).join(' / ') || '不明';

  const result = streamText({
    model: google('gemini-2.5-flash-lite'),
    system: '採用担当者向けに、応募者がなぜこの求人にマッチするかを200字以内で説明してください。',
    prompt: `
求人要件: ${jobDescription}

応募者プロフィール:
名前: ${candidate.name}
経歴: ${candidate.resume}
ヒットした検索: ${hitWhere}
ハイブリッド統合スコア(RRF): ${candidate.score?.toFixed?.(4) ?? candidate.score}
    `,
  });

  // AI SDK v6: useChat を使わない最小構成では toTextStreamResponse() が正解。
  // （useChat/useCompletion 連携時は toUIMessageStreamResponse）
  return result.toTextStreamResponse();
}
```

> ⚠️ 旧 SDK の `toDataStreamResponse()` はデータストリーム独自形式を返すため、フロントで生テキストとして連結すると制御文字が混ざる。本構成では **`toTextStreamResponse()`** を使う。

---

### Step 10. フロントエンド — ハイブリッドスコア付き応募者ランキング UI

```tsx
// app/page.tsx
'use client';
import { useState } from 'react';

type Candidate = {
  id: number;
  name: string;
  resume: string;
  score: number;        // RRF 統合スコア（大きいほど良い）
  hitVector: boolean;
  hitKeyword: boolean;
  explanation?: string;
};

export default function Page() {
  const [description, setDescription] = useState('');
  const [keywords, setKeywords]       = useState('');
  const [candidates, setCandidates]   = useState<Candidate[]>([]);
  const [loading, setLoading]         = useState(false);

  async function handleMatch() {
    setLoading(true);
    try {
      const res  = await fetch('/api/match', {
        method: 'POST',
        body:   JSON.stringify({ jobDescription: description, keywords }),
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      setCandidates(data.candidates);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '2rem' }}>
      <h1>応募者AIランキング（ハイブリッド検索）</h1>

      <textarea
        rows={6}
        style={{ width: '100%' }}
        placeholder="求人要件のテキストを入力（意味検索に使用）..."
        value={description}
        onChange={e => setDescription(e.target.value)}
      />
      <input
        style={{ width: '100%', marginTop: 8 }}
        placeholder="必須キーワード（任意・全文検索に使用） 例: React AWS認定 TypeScript"
        value={keywords}
        onChange={e => setKeywords(e.target.value)}
      />
      <button onClick={handleMatch} disabled={loading} style={{ marginTop: 8 }}>
        {loading ? '検索中...' : 'ハイブリッド検索'}
      </button>

      {candidates.map((c, i) => (
        <div key={c.id} style={{ border: '1px solid #ddd', borderRadius: 8, padding: '1rem', marginTop: '1rem' }}>
          <strong>{i + 1}位: {c.name}</strong>
          <span style={{ marginLeft: 8, color: '#888', fontSize: 13 }}>
            統合スコア: {c.score.toFixed(4)}
          </span>
          <div style={{ marginTop: 4 }}>
            {c.hitVector  && <Badge>意味検索ヒット</Badge>}
            {c.hitKeyword && <Badge>キーワードヒット</Badge>}
          </div>
          <p style={{ fontSize: 14, color: '#555' }}>{c.resume.slice(0, 120)}...</p>
          <ExplainButton jobDescription={description} candidate={c} />
        </div>
      ))}
    </main>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontSize: 12, background: '#eef', borderRadius: 4, padding: '2px 6px', marginRight: 6 }}>
      {children}
    </span>
  );
}

function ExplainButton({ jobDescription, candidate }: { jobDescription: string; candidate: Candidate }) {
  const [explanation, setExplanation] = useState('');
  const [loading, setLoading]         = useState(false);

  async function handleExplain() {
    setLoading(true);
    setExplanation('');
    try {
      const res = await fetch('/api/explain', {
        method: 'POST',
        body:   JSON.stringify({ jobDescription, candidate }),
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.body) return;

      // toTextStreamResponse() はプレーンテキストを返すので、そのまま連結すればよい
      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        setExplanation(prev => prev + decoder.decode(value, { stream: true }));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button onClick={handleExplain} disabled={loading} style={{ fontSize: 13 }}>
        {loading ? '生成中...' : 'AIに推薦理由を聞く'}
      </button>
      {explanation && <p style={{ fontSize: 13, marginTop: 8 }}>{explanation}</p>}
    </div>
  );
}
```

> 💡 `decoder.decode(value, { stream: true })` の `stream: true` で、日本語がチャンク境界で割れても文字化けしにくい。

---

### Step 11. Vercel へデプロイ

```bash
# Vercel CLI でデプロイ
npx vercel --prod

# 環境変数は Vercel ダッシュボード または CLI で設定
npx vercel env add TIDB_HOST
npx vercel env add TIDB_PORT
npx vercel env add TIDB_USER
npx vercel env add TIDB_PASSWORD
npx vercel env add TIDB_DATABASE
npx vercel env add GOOGLE_GENERATIVE_AI_API_KEY
```

> ⏱️ Vercel Hobby（無料）プランで動く。LLMストリーミングは Functions の実行時間上限に注意し、推薦コメントは短め（200字程度）に保つと安全。Hobby は非商用用途向け（コンテストデモはOK）。

---

## 実装チェックリスト

- [ ] TiDB Cloud Starter クラスタ作成（**シンガポール等、FTS対応リージョン**）・接続確認（TLS 1.2+）
- [ ] 利用リージョンで全文検索（FTS）が有効か確認（`FTS_MATCH_WORD` が通るか）
- [ ] `VECTOR(1536)` カラムの定義
- [ ] TiFlash レプリカ付与（`available = 1` を待つ）→ HNSW ベクトルインデックス作成（`USING HNSW`）
- [ ] 全文インデックス作成（`ADD FULLTEXT INDEX ... WITH PARSER MULTILINGUAL`）
- [ ] Gemini `gemini-embedding-001` を `outputDimensionality: 1536` で生成 → TiDB 保存の動作確認（次元一致）
- [ ] ① ベクトル検索／② 全文検索が単体で動くか確認
- [ ] ③ ハイブリッド融合（2クエリ + アプリ側RRF）で上位5件が返るか確認
- [ ] （発展）単一SQL版で `EXPLAIN` し `vec` CTE が HNSW インデックスを使っているか確認
- [ ] 「ベクトルだけでは取りこぼし → ハイブリッドで救済」のデモ用**ダミー**サンプルデータ準備
- [ ] AI SDK v6 `streamText` + `toTextStreamResponse` のストリーミング確認（`gemini-2.5-flash-lite`）
- [ ] フロント UI でエンドツーエンド動作確認（ヒットバッジ表示含む）
- [ ] Vercel デプロイ・環境変数の設定
- [ ] 記事用スクリーンショット・デモ GIF（ベクトル単体 vs ハイブリッドの比較が映えると◎）

---

## 記事執筆のポイント

- **冒頭のフック**: 「キーワードの限界」と「ベクトルの限界」を**両方**具体例で示し、ハイブリッドの必然性に繋げる。「Gem に履歴書を貼っていた運用」の限界から入ると体験談として強い
- **ビフォーアフター**: 同じ求人要件で「ベクトルのみ」と「ハイブリッド」の結果を並べ、順位の入れ替わりを見せると一番効く
- **ハイライト**: `VEC_COSINE_DISTANCE` + `FTS_MATCH_WORD` + RRF を「同じテーブル・同じSQL基盤で」として強調。単一SQL版は“ダメ押し”の見せ場
- **TiDB ならでは**: 「ベクトルDBと検索エンジンを別々に運用せず、単一クラスタで完結」を明言（差別化の核）
- **正直さ**: FTS の提供リージョン制約、RRF と重み付け融合のトレードオフ、resume 丸ごと埋め込みの限界（本来はチャンク分割推奨）に一言触れると信頼性が上がる
- **コラムは軽く**: 既製品比較は表1枚＋1段落に留める

---

## 付録：改訂履歴（主な変更点）

1. **ユースケースを「応募者ランキング」に明確化**: 「1求人に応募してきた人を、求人要件に対してランキング」する社内ツールに焦点。執筆者の実体験（Gem 運用の置き換え）と接続。
2. **プロバイダを Gemini に変更（無料・高精度）**: Embedding は `gemini-embedding-001`（`outputDimensionality: 1536` で `VECTOR(1536)` 据え置き）、生成は `gemini-2.5-flash-lite`。`@ai-sdk/google` 採用。**実質$0**で構築可能。OpenAI（`text-embedding-3-small` 等）への差し替え可能性も明記。
3. **ハイブリッド融合は「2クエリ + アプリ側RRF」をメインに**: HNSW/全文インデックスが確実に効き、ヒット種別も取れる。単一SQL版（`WITH`+`UNION ALL`+`ROW_NUMBER`）は“発展形”として併記。
4. **FTS リージョン警告を冒頭に明記**: 2026年6月時点では **フランクフルト / シンガポールのみ**。東京では使えない点を強調。
5. **`FTS_MATCH_WORD` 引数順を明記**: 第1引数=検索文字列、第2引数=対象カラム。
6. **パーサ選択**: 日英混在の職務経歴書向けに全文インデックスは `WITH PARSER MULTILINGUAL`。TiFlash レプリカの用意方法（事前 `SET TIFLASH REPLICA` or `ADD_COLUMNAR_REPLICA_ON_DEMAND`）を整理。
7. **バージョン記述を検証済みに更新**: `next@16`（App Router 既定）/ `ai@6`（`toTextStreamResponse` 現行・`toDataStreamResponse` 廃止）。
8. **個人情報の扱い**: デモ・記事では**ダミーデータ必須**を明記。認証・暗号化の本番注意も維持。
9. **mem9 / エージェントメモリへの発展**を展望に追加（コンテスト加点狙い）。
10. **SSL / 堅牢性**: `minVersion: 'TLSv1.2'`、`try/finally`、`decode(..., { stream: true })` を維持。
