import "server-only";

/**
 * サーバー専用の環境変数
 *
 * シークレットキーはこのファイル（server-only）からしか読まない。
 * クライアントのバンドルに含まれるとビルドが失敗する。
 */

export type StoreKind = "supabase" | "memory";

/** データの保存先。E2E テストやお試しでは "memory" を使える（Vercel では使えない） */
export function getStoreKind(): StoreKind {
  const kind = process.env.YENWALI_STORE ?? "supabase";

  if (kind !== "supabase" && kind !== "memory") {
    throw new Error(`YENWALI_STORE must be "supabase" or "memory" (got "${kind}")`);
  }

  if (kind === "memory" && process.env.VERCEL) {
    // サーバーレスではインスタンスごとにメモリが分かれ、データが消えるため
    throw new Error('YENWALI_STORE="memory" cannot be used on Vercel');
  }

  return kind;
}

/** Supabase の接続情報（サーバー用） */
export function getSupabaseServerConfig(): { url: string; secretKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secretKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set");
  }

  return { url, secretKey };
}

/** 為替 API を叩かず固定のレートを返すか（E2E テスト用） */
export function isFakeRatesEnabled(): boolean {
  return process.env.YENWALI_FAKE_RATES === "1";
}
