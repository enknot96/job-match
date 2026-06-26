/** 画面に返す応募者1件（match API のレスポンス要素）。 */
export type Candidate = {
  id: number;
  name: string;
  resume: string;
  /** RRF 融合スコア（大きいほど上位）。 */
  score: number;
  /** ベクトル検索でヒットしたか。 */
  hitVector: boolean;
  /** 全文（キーワード）検索でヒットしたか。 */
  hitKeyword: boolean;
};

/** candidates テーブルの基本行（本文取得時に使用）。 */
export type CandidateRow = {
  id: number;
  name: string;
  resume: string;
};

/** id だけを取り出す検索クエリの行。 */
export type IdRow = { id: number };

/** match API のレスポンス。 */
export type MatchResponse = {
  hybrid: Candidate[];
  vectorOnly: Candidate[];
};
