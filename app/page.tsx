"use client";
import { useState } from "react";
import styles from "./page.module.css";

type Candidate = {
  id: number;
  name: string;
  resume: string;
  score: number;
  hitVector: boolean;
  hitKeyword: boolean;
};

export default function Home() {
  const [description, setDescription] = useState(
    "Reactのフロントエンドエンジニアを募集。TypeScriptでのSPA開発経験者。",
  );
  const [keywords, setKeywords] = useState("AWS認定");
  const [hybrid, setHybrid] = useState<Candidate[]>([]);
  const [vectorOnly, setVectorOnly] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSearch = description.trim().length > 0 && !loading;

  async function handleMatch() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobDescription: description, keywords }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "検索に失敗しました。");
      }
      const data = await res.json();
      setHybrid(data.hybrid ?? []);
      setVectorOnly(data.vectorOnly ?? []);
      setSearched(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "検索に失敗しました。時間をおいて再試行してください。");
      setSearched(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.main}>
      <header className={styles.hero}>
        <div className={styles.brand}>
          <span className={styles.logo} aria-hidden="true">
            JM
          </span>
          <h1 className={styles.title}>応募者AIランキング</h1>
        </div>
        <p className={styles.tagline}>
          求人要件を入れると、TiDBの<strong>ベクトル検索（意味）×全文検索（キーワード）</strong>を
          RRFで融合し、応募者を「合う順」に並べ替えます。
        </p>
        <div className={styles.stack}>
          <span className={styles.pill}>TiDB Cloud</span>
          <span className={styles.pill}>Gemini Embedding</span>
          <span className={styles.pill}>Vercel AI SDK</span>
          <span className={styles.pill}>Next.js</span>
        </div>
      </header>

      <section className={styles.panel}>
        <div className={styles.field}>
          <label htmlFor="jobDescription" className={styles.label}>
            求人要件 <span className={styles.labelHint}>（意味検索に使用）</span>
          </label>
          <textarea
            id="jobDescription"
            className={styles.textarea}
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="keywords" className={styles.label}>
            必須キーワード <span className={styles.labelHint}>（全文検索に使用 / 例: AWS認定）</span>
          </label>
          <input
            id="keywords"
            className={styles.input}
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
          />
        </div>

        <button
          onClick={handleMatch}
          disabled={!canSearch}
          aria-busy={loading}
          className={styles.submit}
        >
          {loading && <span className={styles.spinner} aria-hidden="true" />}
          {loading ? "検索中…" : "ハイブリッド検索"}
        </button>
      </section>

      {error && (
        <div role="alert" className={styles.alert}>
          ⚠️ {error}
        </div>
      )}

      {searched && !error && hybrid.length === 0 && (
        <div className={styles.empty}>
          該当する応募者が見つかりませんでした。
          <br />
          求人要件やキーワードを変えてお試しください。
        </div>
      )}

      {searched && !error && hybrid.length > 0 && (
        <div className={styles.compare}>
          {/* ビフォー：ベクトルのみ */}
          <section className={styles.column}>
            <div className={styles.columnHead}>
              <span className={styles.stageChip}>BEFORE</span>
              <span className={`${styles.columnTitle} ${styles.columnTitleMuted}`}>
                ベクトル検索のみ
              </span>
            </div>
            <p className={styles.columnSub}>意味の近さだけで順位付け</p>
            {vectorOnly.map((c, i) => (
              <ResultCard key={c.id} rank={i + 1} c={c} jobDescription={description} muted />
            ))}
          </section>

          {/* アフター：ハイブリッド */}
          <section className={`${styles.column} ${styles.columnPrimary}`}>
            <div className={styles.columnHead}>
              <span className={`${styles.stageChip} ${styles.stageChipPrimary}`}>AFTER</span>
              <span className={styles.columnTitle}>ハイブリッド検索</span>
            </div>
            <p className={styles.columnSub}>ベクトル × 全文を RRF で融合</p>
            {hybrid.map((c, i) => (
              <ResultCard key={c.id} rank={i + 1} c={c} jobDescription={description} />
            ))}
          </section>
        </div>
      )}
    </main>
  );
}

function ResultCard({
  rank,
  c,
  jobDescription,
  muted,
}: {
  rank: number;
  c: Candidate;
  jobDescription: string;
  muted?: boolean;
}) {
  const topRank = !muted && rank === 1;
  return (
    <article className={`${styles.card} ${muted ? styles.cardMuted : ""}`}>
      <div className={styles.cardTop}>
        <span className={`${styles.rank} ${topRank ? styles.rankTop : ""}`}>{rank}</span>
        <span className={styles.name}>{c.name}</span>
        <span className={styles.score}>
          <span className={styles.scoreLabel}>score</span>
          {c.score?.toFixed(4)}
        </span>
      </div>

      <div className={styles.badges}>
        {c.hitVector && <span className={`${styles.badge} ${styles.badgeVector}`}>意味検索ヒット</span>}
        {c.hitKeyword && (
          <span className={`${styles.badge} ${styles.badgeKeyword}`}>キーワードヒット</span>
        )}
      </div>

      <p className={styles.resume}>{c.resume}</p>

      {!muted && <ExplainButton jobDescription={jobDescription} candidate={c} />}
    </article>
  );
}

function ExplainButton({
  jobDescription,
  candidate,
}: {
  jobDescription: string;
  candidate: Candidate;
}) {
  const [explanation, setExplanation] = useState("");
  const [loading, setLoading] = useState(false);
  const [explainError, setExplainError] = useState(false);

  async function handleExplain() {
    setLoading(true);
    setExplanation("");
    setExplainError(false);
    try {
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobDescription, candidate }),
      });
      if (!res.ok || !res.body) {
        throw new Error("生成に失敗しました。");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        setExplanation((prev) => prev + decoder.decode(value, { stream: true }));
      }
    } catch {
      setExplainError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.explainWrap}>
      <button onClick={handleExplain} disabled={loading} className={styles.explainBtn}>
        {loading ? "生成中…" : explanation || explainError ? "🔄 もう一度生成" : "🤖 AIに推薦理由を聞く"}
      </button>
      {explanation && (
        <p aria-live="polite" className={styles.explanation}>
          {explanation}
        </p>
      )}
      {explainError && (
        <p role="alert" className={styles.explainError}>
          推薦理由の生成に失敗しました。再試行してください。
        </p>
      )}
    </div>
  );
}
