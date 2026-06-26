import { NextResponse } from "next/server";

/**
 * 破壊的(mutating)エンドポイント（DBの全削除・再投入・挿入）は
 * ローカル開発でのみ許可する。
 *
 * Vercel の全デプロイ環境（production / preview）では `VERCEL` 環境変数が
 * "1" になるため、これを検知して拒否する。デモデータは手元から同じ
 * TiDB へ投入すればよく、公開URLから誰でも `DELETE FROM candidates` を
 * 叩ける状態を防ぐのが目的。
 */
export function isMutationAllowed(): boolean {
  return process.env.VERCEL !== "1";
}

/** mutating 操作が許可されていなければ 403 レスポンスを返す（許可時は null）。 */
export function mutationForbiddenResponse(): NextResponse | null {
  if (isMutationAllowed()) return null;
  return NextResponse.json(
    { error: "この操作は本番環境では無効化されています（開発環境でのみ利用可能）。" },
    { status: 403 },
  );
}
