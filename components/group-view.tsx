"use client";

import Link from "next/link";
import { useEffect } from "react";

import { copyText, openLineShare } from "@/lib/client/clipboard";
import { rememberGroup } from "@/lib/client/recent-groups";
import { useGroupSnapshot } from "@/lib/client/use-group-snapshot";
import { formatForeign, formatJpy, formatMonthDay } from "@/lib/money";
import { rateDateLabel, rateEquation } from "@/lib/rate-label";
import { buildSettlementText } from "@/lib/settlement-text";
import type { GroupSnapshot, PaymentView } from "@/lib/types";

import { MemberEditor } from "./member-editor";
import { SiteFooter } from "./site-footer";
import { Toast, useToast } from "./toast";
import { Button, ButtonLink, Card, cx, Logo, SectionTitle } from "./ui";

/**
 * グループのページ本体（ブラウザ側）
 *
 * 上から「合計と共有」「精算結果」「立て替えの一覧」「メンバー」の順に縦に並べ、
 * 「立て替えを記録する」ボタンは片手で押せるよう画面の下に固定する。
 */
export function GroupView({ initial }: { initial: GroupSnapshot }) {
  const { snapshot, setSnapshot, connection } = useGroupSnapshot(initial);
  const toast = useToast();

  const groupId = snapshot.group.id;
  const nameOf = new Map(snapshot.members.map((m) => [m.id, m.name]));

  // このブラウザの「最近使ったグループ」に記録する
  useEffect(() => {
    rememberGroup({ id: groupId, name: snapshot.group.name });
  }, [groupId, snapshot.group.name]);

  const groupUrl = (): string => `${window.location.origin}/g/${groupId}`;

  // ---------------------------------------------------------------------------
  // 共有・コピー
  // ---------------------------------------------------------------------------

  async function copyUrl(): Promise<void> {
    toast.show((await copyText(groupUrl())) ? "URLをコピーしました" : "コピーできませんでした");
  }

  function shareToLine(): void {
    openLineShare(`「${snapshot.group.name}」の割り勘はこちらから記録してね\n${groupUrl()}`);
  }

  async function copySettlement(): Promise<void> {
    const ok = await copyText(buildSettlementText(snapshot, groupUrl()));

    toast.show(ok ? "精算結果をコピーしました" : "コピーできませんでした");
  }

  return (
    <>
      <Toast message={toast.message} />

      <main className="mx-auto w-full max-w-xl flex-1 space-y-4 px-4 pt-4">
        {/* ------------------------------------------------------------------ */}
        {/* ヘッダー: グループ名・合計・共有                                     */}
        {/* ------------------------------------------------------------------ */}
        <header className="space-y-4">
          <div className="flex items-center justify-between">
            <Link href="/" aria-label="トップへ">
              <Logo />
            </Link>
            <span
              className="flex items-center gap-1.5 text-xs text-muted"
              title={connection === "realtime" ? "他の人の記録がすぐ反映されます" : "30秒ごとに最新の状態を取り直します"}
            >
              <span
                aria-hidden
                className={cx("h-2 w-2 rounded-full", connection === "realtime" ? "bg-positive" : "bg-muted/50")}
              />
              {connection === "realtime" ? "リアルタイム" : "自動更新"}
            </span>
          </div>

          <div className="rounded-3xl bg-accent px-5 py-5 text-on-accent">
            <h1 className="break-words text-xl font-black" data-testid="group-name">
              {snapshot.group.name}
            </h1>
            <p className="mt-1 text-sm opacity-90">{snapshot.members.length}人のグループ</p>
            <p className="mt-4 text-xs font-bold opacity-90">合計</p>
            <p className="tabular text-3xl font-black" data-testid="total-jpy">
              {formatJpy(snapshot.totalJpy)}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={copyUrl}>
              URLをコピー
            </Button>
            <Button variant="secondary" onClick={shareToLine}>
              LINEで送る
            </Button>
          </div>
        </header>

        {/* ------------------------------------------------------------------ */}
        {/* 精算結果                                                            */}
        {/* ------------------------------------------------------------------ */}
        <Card aria-labelledby="settlement-title">
          <SectionTitle
            action={
              snapshot.payments.length > 0 && (
                <button
                  type="button"
                  className="min-h-10 rounded-xl px-3 text-sm font-bold text-accent hover:bg-accent-soft"
                  onClick={copySettlement}
                >
                  テキストでコピー
                </button>
              )
            }
          >
            <span id="settlement-title">精算</span>
          </SectionTitle>

          {snapshot.transfers.length === 0 ? (
            <p className="rounded-2xl bg-surface-muted px-4 py-4 text-sm text-muted">
              {snapshot.payments.length === 0
                ? "立て替えを記録すると、ここに「誰が誰にいくら払うか」が出ます。"
                : "精算は必要ありません。"}
            </p>
          ) : (
            <ul className="space-y-2" data-testid="transfers">
              {snapshot.transfers.map((t) => (
                <li
                  key={`${t.fromId}-${t.toId}`}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-surface-muted px-4 py-3"
                >
                  <span className="min-w-0 text-sm">
                    <span className="font-bold">{nameOf.get(t.fromId)}</span>
                    <span className="mx-1.5 text-muted">→</span>
                    <span className="font-bold">{nameOf.get(t.toId)}</span>
                  </span>
                  <span className="tabular shrink-0 text-lg font-black">{formatJpy(t.amount)}</span>
                </li>
              ))}
            </ul>
          )}

          {/* メンバーごとの内訳 */}
          {snapshot.payments.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-2 text-xs font-bold text-muted">メンバーごとの内訳</h3>
              <div className="overflow-hidden rounded-2xl border border-line">
                <table className="tabular w-full text-sm" data-testid="balances">
                  <thead className="bg-surface-muted text-xs text-muted">
                    <tr>
                      <th className="px-3 py-2 text-left font-bold">名前</th>
                      <th className="px-2 py-2 text-right font-bold">支払った額</th>
                      <th className="px-2 py-2 text-right font-bold">負担額</th>
                      <th className="px-3 py-2 text-right font-bold">差額</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {snapshot.balances.map((b) => (
                      <tr key={b.memberId}>
                        <td className="max-w-[6rem] truncate px-3 py-2 font-bold">{nameOf.get(b.memberId)}</td>
                        <td className="px-2 py-2 text-right">{formatJpy(b.paid)}</td>
                        <td className="px-2 py-2 text-right">{formatJpy(b.owed)}</td>
                        <td
                          className={cx(
                            "px-3 py-2 text-right font-bold",
                            b.balance > 0 && "text-positive",
                            b.balance < 0 && "text-negative",
                          )}
                        >
                          {b.balance > 0 ? "+" : ""}
                          {formatJpy(b.balance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-muted">差額がプラスの人は受け取り、マイナスの人は支払います。</p>
            </div>
          )}
        </Card>

        {/* ------------------------------------------------------------------ */}
        {/* 立て替えの一覧                                                      */}
        {/* ------------------------------------------------------------------ */}
        <Card>
          <SectionTitle>
            立て替えの記録
            <span className="ml-2 text-sm font-normal text-muted">{snapshot.payments.length}件</span>
          </SectionTitle>

          {snapshot.payments.length === 0 ? (
            <p className="text-sm text-muted">まだ記録がありません。下のボタンから記録しましょう。</p>
          ) : (
            <ul className="-mx-2 divide-y divide-line" data-testid="payments">
              {snapshot.payments.map((p) => (
                <PaymentRow key={p.id} payment={p} groupId={groupId} snapshot={snapshot} nameOf={nameOf} />
              ))}
            </ul>
          )}
        </Card>

        {/* ------------------------------------------------------------------ */}
        {/* メンバー                                                            */}
        {/* ------------------------------------------------------------------ */}
        <MemberEditor snapshot={snapshot} onUpdated={setSnapshot} onMessage={toast.show} />
      </main>

      <SiteFooter showExchangeRateApiCredit={snapshot.usesExchangeRateApi} />

      {/* 片手で押せるよう、記録ボタンは画面の下に固定する */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/90 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 backdrop-blur">
        <div className="mx-auto max-w-xl">
          <ButtonLink href={`/g/${groupId}/pay/new`} size="lg" className="w-full">
            ＋ 立て替えを記録する
          </ButtonLink>
        </div>
      </div>
    </>
  );
}

/**
 * 立て替え 1 件の行。タップで編集画面へ。
 */
function PaymentRow({
  payment: p,
  groupId,
  snapshot,
  nameOf,
}: {
  payment: PaymentView;
  groupId: string;
  snapshot: GroupSnapshot;
  nameOf: Map<string, string>;
}) {
  const isForeign = p.currency !== "JPY";
  const isEveryone = p.participantIds.length === snapshot.members.length;

  const participantsLabel = isEveryone
    ? `全員（${p.participantIds.length}人）`
    : snapshot.members
        .filter((m) => p.participantIds.includes(m.id))
        .map((m) => m.name)
        .join("、");

  return (
    <li>
      <Link
        href={`/g/${groupId}/pay/${p.id}`}
        className="block rounded-2xl px-2 py-3 hover:bg-surface-muted"
        data-testid="payment-row"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-bold">{p.title}</p>
            <p className="mt-0.5 truncate text-xs text-muted">
              {formatMonthDay(p.paidOn)}・{nameOf.get(p.payerId)}が立て替え・{participantsLabel}
            </p>
          </div>
          <div className="shrink-0 text-right">
            {isForeign && <p className="tabular text-xs text-muted">{formatForeign(p.amountMinor, p.currency)} →</p>}
            <p className="tabular text-lg font-black">{formatJpy(p.amountJpy)}</p>
          </div>
        </div>

        {isForeign && (
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            <span className="tabular">{rateEquation(p.currency, p.rateToJpy)}</span>
            <span>{rateDateLabel(p.rateSource, p.rateDate)}</span>
            {p.rateSource === "manual" && (
              <span className="rounded-full bg-accent-soft px-2 py-0.5 font-bold text-accent">手動</span>
            )}
          </p>
        )}
      </Link>
    </li>
  );
}
