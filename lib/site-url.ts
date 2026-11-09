/**
 * サイトの公開 URL（検索エンジン向けの絶対 URL を作るのに使う）
 *
 * 優先順位
 * 1. NEXT_PUBLIC_SITE_URL（独自ドメインを使うときに設定する）
 * 2. VERCEL_PROJECT_PRODUCTION_URL（Vercel が自動で入れる本番のドメイン。https:// は付かない）
 * 3. ローカル開発用
 */
export function getSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;

  if (explicit) return explicit.replace(/\/+$/, "");

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;

  if (vercel) return `https://${vercel}`;

  return "http://localhost:3000";
}
