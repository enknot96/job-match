"use client";
import { useState } from "react";
import styles from "./page.module.css";
import type { Candidate } from "@/lib/types";

// 出典: simple-icons（CC0） https://simpleicons.org/
const TECH_STACK = [
  {
    label: "TiDB Cloud",
    path: "M12 0 1.609 6.001v11.998L11.999 24l10.393-6.001V6.001ZM8.535 17.999v-7.998L5.07 12V8L12 4l3.462 2-3.464 2.001v12Zm6.93 0v-7.997l3.464-2v7.997z",
  },
  {
    label: "Gemini Embedding",
    path: "M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81",
  },
  {
    label: "Vercel AI SDK",
    path: "m12 1.608 12 20.784H0Z",
  },
  {
    label: "Next.js",
    path: "M18.665 21.978C16.758 23.255 14.465 24 12 24 5.377 24 0 18.623 0 12S5.377 0 12 0s12 5.377 12 12c0 3.583-1.574 6.801-4.067 9.001L9.219 7.2H7.2v9.596h1.615V9.251l9.85 12.727Zm-3.332-8.533 1.6 2.061V7.2h-1.6v6.245Z",
  },
];

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
          <Logo />
          <h1 className={styles.title}>応募者AIランキング</h1>
        </div>
        <p className={styles.tagline}>
          求人要件を入れると、TiDBの<strong>ベクトル検索（意味）×全文検索（キーワード）</strong>を
          RRFで融合し、応募者を「合う順」に並べ替えます。
        </p>
        <p className={styles.demoNote}>
          デモ用に架空の応募者30名分を投入済みです。そのまま「ハイブリッド検索」を押してお試しいただけます。
        </p>
        <div className={styles.stack}>
          {TECH_STACK.map((t) => (
            <span key={t.label} className={styles.pill}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d={t.path} />
              </svg>
              {t.label}
            </span>
          ))}
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

// ベクトル検索(青)とキーワード検索(緑)、2つの円の重なり＝RRF融合を表すロゴマーク
function Logo() {
  return (
    <span className={styles.logoBadge} aria-hidden="true">
      <svg width="24" height="24" viewBox="0 0 40 40" style={{ isolation: "isolate" }}>
        <circle cx="16" cy="20" r="12" fill="var(--vector)" />
        <circle cx="24" cy="20" r="12" fill="var(--keyword)" style={{ mixBlendMode: "multiply" }} />
      </svg>
    </span>
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
