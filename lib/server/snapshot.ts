import "server-only";

import { computeBalances, computeTransfers } from "@/lib/money";
import type { GroupSnapshot } from "@/lib/types";

import type { GroupData } from "./repository";

/**
 * DB から読んだデータを、画面に出す形（精算の計算結果込み）にする。
 * 精算の計算はサーバー側で行い、ブラウザは表示に専念する。
 */
export function buildSnapshot(data: GroupData): GroupSnapshot {
  const memberIds = data.members.map((m) => m.id);

  // 精算の計算は BigInt で行う
  const balances = computeBalances(
    memberIds,
    data.payments.map((p) => ({
      payerId: p.payerId,
      amountJpy: BigInt(p.amountJpy),
      participantIds: p.participantIds,
    })),
  );

  const transfers = computeTransfers(balances);

  const totalJpy = data.payments.reduce((sum, p) => sum + BigInt(p.amountJpy), 0n);

  return {
    group: { id: data.group.id, name: data.group.name },
    members: data.members.map((m) => ({ id: m.id, name: m.name })),
    payments: data.payments.map((p) => ({
      id: p.id,
      title: p.title,
      payerId: p.payerId,
      amountMinor: p.amountMinor,
      currency: p.currency,
      rateToJpy: p.rateToJpy,
      rateSource: p.rateSource,
      rateDate: p.rateDate,
      rateFetchedAt: p.rateFetchedAt,
      amountJpy: p.amountJpy,
      paidOn: p.paidOn,
      participantIds: p.participantIds,
      createdAt: p.createdAt,
    })),

    // 金額は上限（1兆円 × 件数）の範囲で safe integer に収まる前提で number に戻す
    totalJpy: Number(totalJpy),
    balances: balances.map((b) => ({
      memberId: b.memberId,
      paid: Number(b.paid),
      owed: Number(b.owed),
      balance: Number(b.balance),
    })),
    transfers: transfers.map((t) => ({ fromId: t.fromId, toId: t.toId, amount: Number(t.amount) })),

    lastCurrency: data.payments[0]?.currency ?? "JPY",
    usesExchangeRateApi: data.payments.some((p) => p.rateSource === "exchangerate-api"),
  };
}
