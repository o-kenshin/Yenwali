/**
 * グループのデータを読み込むあいだの表示（Suspense の境界にもなる）
 */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 space-y-4 px-4 pt-4" aria-busy="true" aria-label="読み込み中">
      <div className="h-7 w-28 animate-pulse rounded-full bg-surface-muted" />
      <div className="h-36 animate-pulse rounded-3xl bg-surface-muted" />
      <div className="h-40 animate-pulse rounded-3xl bg-surface-muted" />
      <div className="h-64 animate-pulse rounded-3xl bg-surface-muted" />
    </main>
  );
}
