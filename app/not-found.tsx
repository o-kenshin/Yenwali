import { ButtonLink, Logo } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-start gap-4 px-4 pt-10">
      <Logo />
      <h1 className="text-xl font-black">ページが見つかりません</h1>
      <p className="text-sm text-muted">URL がまちがっているか、グループが削除された可能性があります。</p>
      <ButtonLink href="/" variant="secondary">
        トップへ
      </ButtonLink>
    </main>
  );
}
