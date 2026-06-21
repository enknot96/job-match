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

  async function handleMatch() {
    setLoading(true);
    try {
      const res = await fetch("/api/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobDescription: description, keywords }),
      });
      const data = await res.json();
      setHybrid(data.hybrid ?? []);
      setVectorOnly(data.vectorOnly ?? []);
      setSearched(true);
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

      <label style={{ display: "block", marginTop: 16, fontSize: 13, fontWeight: 600 }}>
        求人要件（意味検索に使用）
      </label>
      <textarea
        rows={4}
        style={{ width: "100%", padding: 8, fontSize: 14 }}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

      <label style={{ display: "block", marginTop: 12, fontSize: 13, fontWeight: 600 }}>
        必須キーワード（全文検索に使用） 例: AWS認定
      </label>
      <input
        style={{ width: "100%", padding: 8, fontSize: 14 }}
        value={keywords}
        onChange={(e) => setKeywords(e.target.value)}
      />

      <button
        onClick={handleMatch}
        disabled={loading}
        style={{
          marginTop: 12,
          padding: "8px 20px",
          fontSize: 14,
          cursor: "pointer",
          background: "#111",
          color: "#fff",
          border: "none",
          borderRadius: 6,
        }}
      >
        {loading ? "検索中..." : "ハイブリッド検索"}
      </button>

      {searched && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 24 }}>
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

  async function handleExplain() {
    setLoading(true);
    setExplanation("");
    try {
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobDescription, candidate }),
      });
      if (!res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        setExplanation((prev) => prev + decoder.decode(value, { stream: true }));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={handleExplain}
        disabled={loading}
        style={{ fontSize: 12, cursor: "pointer", padding: "4px 10px" }}
      >
        {loading ? "生成中..." : "🤖 AIに推薦理由を聞く"}
      </button>
      {explanation && (
        <p style={{ fontSize: 12, marginTop: 6, color: "#333", lineHeight: 1.6 }}>{explanation}</p>
      )}
    </div>
  );
}
