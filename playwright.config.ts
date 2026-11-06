import { defineConfig, devices } from "@playwright/test";

/**
 * 主要な画面の通しテスト
 *
 * Supabase や為替 API に依存しないよう、
 * メモリ保存（YENWALI_STORE=memory）と固定レート（YENWALI_FAKE_RATES=1）で本番ビルドを起動する。
 */

const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
  },

  // モバイルファーストなので、スマホの画面サイズで確かめる
  projects: [{ name: "mobile", use: { ...devices["Pixel 7"] } }],

  webServer: {
    command: `npm run build && npm run start -- --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: {
      YENWALI_STORE: "memory",
      YENWALI_FAKE_RATES: "1",
      // ブラウザの Realtime は使わない（30 秒ごと・タブに戻ったときの再取得で反映する）
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
    },
  },
});
