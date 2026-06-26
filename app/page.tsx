"use client";
import { useState } from "react";

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
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: "2rem", fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 24 }}>応募者AIランキング（ハイブリッド検索）</h1>
      <p style={{ color: "#666", fontSize: 14 }}>
        TiDBのベクトル検索 × 全文検索(BM25)を RRF で融合し、応募者をランキングします。
      </p>

      <label
        htmlFor="jobDescription"
        style={{ display: "block", marginTop: 16, fontSize: 13, fontWeight: 600 }}
      >
        求人要件（意味検索に使用）
      </label>
      <textarea
        id="jobDescription"
        rows={4}
        style={{ width: "100%", padding: 8, fontSize: 14 }}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

      <label
        htmlFor="keywords"
        style={{ display: "block", marginTop: 12, fontSize: 13, fontWeight: 600 }}
      >
        必須キーワード（全文検索に使用） 例: AWS認定
      </label>
      <input
        id="keywords"
        style={{ width: "100%", padding: 8, fontSize: 14 }}
        value={keywords}
        onChange={(e) => setKeywords(e.target.value)}
      />

      <button
        onClick={handleMatch}
        disabled={!canSearch}
        aria-busy={loading}
        style={{
          marginTop: 12,
          padding: "8px 20px",
          fontSize: 14,
          cursor: canSearch ? "pointer" : "not-allowed",
          opacity: canSearch ? 1 : 0.5,
          background: "#111",
          color: "#fff",
          border: "none",
          borderRadius: 6,
        }}
      >
        {loading ? "検索中..." : "ハイブリッド検索"}
      </button>

      {error && (
        <div
          role="alert"
          style={{
            marginTop: 16,
            padding: "10px 14px",
            border: "1px solid #fca5a5",
            background: "#fef2f2",
            color: "#b91c1c",
            borderRadius: 6,
            fontSize: 14,
          }}
        >
          ⚠️ {error}
        </div>
      )}

      {searched && !error && hybrid.length === 0 && (
        <div
          style={{
            marginTop: 24,
            padding: "32px 16px",
            textAlign: "center",
            border: "1px dashed #ddd",
            borderRadius: 8,
            color: "#666",
            fontSize: 14,
          }}
        >
          該当する応募者が見つかりませんでした。<br />
          求人要件やキーワードを変えてお試しください。
        </div>
      )}

      {searched && !error && hybrid.length > 0 && (
        <div className="compare-grid">
          {/* ビフォー：ベクトルのみ */}
          <section>
            <h2 style={{ fontSize: 16, color: "#888" }}>① ベクトル検索のみ（ビフォー）</h2>
            {vectorOnly.map((c, i) => (
              <ResultCard key={c.id} rank={i + 1} c={c} jobDescription={description} muted />
            ))}
          </section>
          {/* アフター：ハイブリッド */}
          <section>
            <h2 style={{ fontSize: 16 }}>② ハイブリッド検索（アフター）⭐</h2>
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
  return (
    <div
      style={{
        border: "1px solid #ddd",
        borderRadius: 8,
        padding: 12,
        marginTop: 10,
        background: muted ? "#fafafa" : "#fff",
      }}
    >
      <strong>
        {rank}位: {c.name}
      </strong>
      <span style={{ marginLeft: 8, color: "#999", fontSize: 12 }}>
        score: {c.score?.toFixed(4)}
      </span>
      <div style={{ marginTop: 4 }}>
        {c.hitVector && <Badge color="#2563eb">意味検索ヒット</Badge>}
        {c.hitKeyword && <Badge color="#16a34a">キーワードヒット</Badge>}
      </div>
      <p style={{ fontSize: 13, color: "#555", margin: "6px 0" }}>{c.resume.slice(0, 80)}...</p>
      {!muted && <ExplainButton jobDescription={jobDescription} candidate={c} />}
    </div>
  );
}

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span
      style={{
        fontSize: 11,
        background: color,
        color: "#fff",
        borderRadius: 4,
        padding: "2px 6px",
        marginRight: 6,
      }}
    >
      {children}
    </span>
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
    <div>
      <button
        onClick={handleExplain}
        disabled={loading}
        style={{ fontSize: 12, cursor: loading ? "not-allowed" : "pointer", padding: "4px 10px" }}
      >
        {loading ? "生成中..." : explanation || explainError ? "🔄 もう一度生成" : "🤖 AIに推薦理由を聞く"}
      </button>
      {explanation && (
        <p
          aria-live="polite"
          style={{ fontSize: 12, marginTop: 6, color: "#333", lineHeight: 1.6 }}
        >
          {explanation}
        </p>
      )}
      {explainError && (
        <p role="alert" style={{ fontSize: 12, marginTop: 6, color: "#b91c1c" }}>
          推薦理由の生成に失敗しました。再試行してください。
        </p>
      )}
    </div>
  );
}
