/**
 * 記録・編集画面のデータを読み込むあいだの表示
 *
 * グループのページ（/g/[id]）からここへ移るとき、/g/[id] の loading.tsx は
 * 移動の前後で共通の部分にあたるので使われない。
 * そのため、この階層にも Suspense の境界を置いて、押した瞬間に画面が切り替わるようにする。
 */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 space-y-4 px-4 pt-4" aria-busy="true" aria-label="読み込み中">
      {/* 戻るリンク・見出し */}
      <div className="h-7 w-24 animate-pulse rounded-full bg-surface-muted" />
      <div className="h-8 w-48 animate-pulse rounded-full bg-surface-muted" />

      {/* 内容・金額と通貨・立て替えた人・負担する人 */}
      <div className="h-12 animate-pulse rounded-2xl bg-surface-muted" />
      <div className="h-12 animate-pulse rounded-2xl bg-surface-muted" />
      <div className="h-24 animate-pulse rounded-3xl bg-surface-muted" />
      <div className="h-32 animate-pulse rounded-3xl bg-surface-muted" />
    </main>
  );
}
