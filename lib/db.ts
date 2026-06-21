import mysql from "mysql2/promise";

export const db = mysql.createPool({
  host: process.env.TIDB_HOST,
  port: Number(process.env.TIDB_PORT),
  user: process.env.TIDB_USER,
  password: process.env.TIDB_PASSWORD,
  database: process.env.TIDB_DATABASE,
  // TiDB Cloud は TLS 1.2+ 必須
  ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
});
