import mysql, { type RowDataPacket } from "mysql2/promise";

export const db = mysql.createPool({
  host: process.env.TIDB_HOST,
  port: Number(process.env.TIDB_PORT),
  user: process.env.TIDB_USER,
  password: process.env.TIDB_PASSWORD,
  database: process.env.TIDB_DATABASE,
  // TiDB Cloud は TLS 1.2+ 必須
  ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
});

// --- 型付き SELECT ヘルパー ------------------------------------------------
// mysql2 は行をユニオン型で返すため、呼び出し側ごとにキャストが散らばりがち。
// SELECT 結果の `T[]` への変換をこの2関数に集約し、各 route から as を排除する。

/** プレースホルダ（?）に渡せる値。配列ネスト（`IN (?)`）も許可。 */
export type SqlParam = string | number | bigint | boolean | Date | null | SqlParam[];

/** プリペアドステートメント（`db.execute`）で SELECT し、行を `T[]` で返す。 */
export async function executeRows<T>(sql: string, params?: SqlParam[]): Promise<T[]> {
  const [rows] = await db.execute<RowDataPacket[]>(sql, params);
  return rows as T[];
}

/**
 * テキストプロトコル（`db.query`）で SELECT し、行を `T[]` で返す。
 * TiDB の全文検索 `FTS_MATCH_WORD` はプリペアド非対応のため query が必須。
 */
export async function queryRows<T>(sql: string, params?: SqlParam[]): Promise<T[]> {
  const [rows] = await db.query<RowDataPacket[]>(sql, params);
  return rows as T[];
}
