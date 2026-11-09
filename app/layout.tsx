import type { Metadata, Viewport } from "next";

import { getSiteUrl } from "@/lib/site-url";

import "./globals.css";

const SITE_NAME = "Yenwali（エンワリ）";

const DESCRIPTION =
  "ログイン不要・URLを共有するだけの割り勘アプリ。海外で外貨で払った分も、その時点の参考レートで日本円に換算して精算できます。";

export const metadata: Metadata = {
  // OGP などの相対 URL を絶対 URL にするための基準
  metadataBase: new URL(getSiteUrl()),

  title: {
    default: `${SITE_NAME}｜外貨もそのまま割り勘`,
    template: "%s｜Yenwali",
  },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: ["割り勘", "割り勘アプリ", "外貨", "海外旅行", "精算", "Yenwali", "エンワリ"],

  // LINE・X などで共有したときの表示
  openGraph: {
    type: "website",
    locale: "ja_JP",
    siteName: SITE_NAME,
    title: `${SITE_NAME}｜外貨もそのまま割り勘`,
    description: DESCRIPTION,
    url: "/",
  },
  twitter: {
    card: "summary",
    title: `${SITE_NAME}｜外貨もそのまま割り勘`,
    description: DESCRIPTION,
  },

  // Google Search Console の所有権確認（HTML タグ方式）。環境変数で値を入れる
  verification: process.env.GOOGLE_SITE_VERIFICATION
    ? { google: process.env.GOOGLE_SITE_VERIFICATION }
    : undefined,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f3ec" },
    { media: "(prefers-color-scheme: dark)", color: "#171513" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
