import type { Metadata } from "next";

import { CreateGroupForm } from "@/components/create-group-form";
import { RecentGroups } from "@/components/recent-groups";
import { SiteFooter } from "@/components/site-footer";
import { Card, Logo } from "@/components/ui";

// 検索結果で正規の URL として扱ってもらう
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

/**
 * トップページ: アプリの説明と、グループ作成フォーム
 */
export default function HomePage() {
  return (
    <>
      <main className="mx-auto w-full max-w-xl flex-1 space-y-5 px-4 pt-6">
        <header className="space-y-4 pt-2">
          <Logo size="lg" />
          <h1 className="text-[1.65rem] font-black leading-snug">
            旅先の外貨も、
            <br />
            そのまま<span className="text-accent">円で割り勘</span>。
          </h1>
          <p className="text-sm leading-relaxed text-muted">
            ログインもアプリのインストールもいりません。グループを作って URL を送るだけ。
            ドルやウォンで払った分は、記録したときの参考レートで日本円に換算して固定します。
          </p>
        </header>

        {/* 使い方（3ステップ） */}
        <ol className="grid grid-cols-3 gap-2 text-center text-xs">
          {[
            ["1", "グループを作る"],
            ["2", "URLを送る"],
            ["3", "立て替えを記録"],
          ].map(([n, label]) => (
            <li key={n} className="rounded-2xl bg-surface-muted px-2 py-3">
              <span className="mx-auto mb-1 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-[0.7rem] font-black text-on-accent">
                {n}
              </span>
              <span className="font-bold">{label}</span>
            </li>
          ))}
        </ol>

        <Card>
          <h2 className="mb-4 text-lg font-black">グループを作る</h2>
          <CreateGroupForm />
        </Card>

        <RecentGroups />
      </main>

      <SiteFooter />
    </>
  );
}
