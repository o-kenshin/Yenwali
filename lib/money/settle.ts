/**
 * 精算の計算
 *
 * 1. メンバーごとに「差額 = 立て替えた額の合計 − 負担額の合計」を出す。
 *    （全員の差額の合計は必ず 0 になる）
 * 2. 差額がマイナスの人（払う側）とプラスの人（もらう側）を、それぞれ額の大きい順に並べる。
 * 3. 先頭どうしで小さいほうの額を送金し、0 になった人を次の人に進める。これをくり返す。
 */

import { splitEvenly } from "./split";

/** 精算の計算に使う支払い（円換算済み） */
export type SettlementPayment = {
  payerId: string;
  amountJpy: bigint;
  participantIds: readonly string[];
};

/** メンバーごとの収支 */
export type MemberBalance = {
  memberId: string;
  /** 立て替えた額の合計 */
  paid: bigint;
  /** 負担額の合計 */
  owed: bigint;
  /** 差額（プラスならもらう側、マイナスなら払う側） */
  balance: bigint;
};

/** 送金 1 件 */
export type Transfer = {
  fromId: string;
  toId: string;
  amount: bigint;
};

/**
 * メンバーごとの「立て替えた額」「負担額」「差額」を計算する。
 *
 * @param orderedMemberIds グループのメンバー ID（並び順どおり）
 * @param payments         支払いの一覧
 */
export function computeBalances(
  orderedMemberIds: readonly string[],
  payments: readonly SettlementPayment[],
): MemberBalance[] {
  // 並び順を引けるようにしておく（端数を先頭から割り振るのに使う）
  const orderIndex = new Map(orderedMemberIds.map((id, index) => [id, index]));

  const paid = new Map<string, bigint>(orderedMemberIds.map((id) => [id, 0n]));
  const owed = new Map<string, bigint>(orderedMemberIds.map((id) => [id, 0n]));

  for (const payment of payments) {
    if (!orderIndex.has(payment.payerId)) {
      throw new Error(`computeBalances: unknown payer ${payment.payerId}`);
    }

    // 立て替えた人に加算
    paid.set(payment.payerId, (paid.get(payment.payerId) ?? 0n) + payment.amountJpy);

    // 負担する人を、メンバーの並び順に並べ直してから分割する
    const participants = [...payment.participantIds].sort((a, b) => {
      const ia = orderIndex.get(a);
      const ib = orderIndex.get(b);

      if (ia === undefined || ib === undefined) {
        throw new Error("computeBalances: unknown participant");
      }

      return ia - ib;
    });

    const shares = splitEvenly(payment.amountJpy, participants);

    for (const [memberId, share] of shares) {
      owed.set(memberId, (owed.get(memberId) ?? 0n) + share);
    }
  }

  return orderedMemberIds.map((memberId) => {
    const p = paid.get(memberId) ?? 0n;
    const o = owed.get(memberId) ?? 0n;

    return { memberId, paid: p, owed: o, balance: p - o };
  });
}

/**
 * 差額から「誰が誰にいくら払うか」を計算する（送金回数が少なくなる貪欲法）。
 *
 * 同じ額の人どうしは、渡された順（＝メンバーの並び順）を保つので、結果は毎回同じになる。
 */
export function computeTransfers(balances: readonly MemberBalance[]): Transfer[] {
  const total = balances.reduce((sum, b) => sum + b.balance, 0n);

  if (total !== 0n) {
    throw new Error("computeTransfers: balances must sum to zero");
  }

  // 額の大きい順に並べる（Array.prototype.sort は安定ソートなので、同額なら元の順のまま）
  const byAmountDesc = (a: { amount: bigint }, b: { amount: bigint }): number =>
    a.amount === b.amount ? 0 : a.amount > b.amount ? -1 : 1;

  // 払う側（差額がマイナス）。amount は払うべき額（正の数）
  const debtors = balances
    .filter((b) => b.balance < 0n)
    .map((b) => ({ id: b.memberId, amount: -b.balance }))
    .sort(byAmountDesc);

  // もらう側（差額がプラス）。amount はもらうべき額
  const creditors = balances
    .filter((b) => b.balance > 0n)
    .map((b) => ({ id: b.memberId, amount: b.balance }))
    .sort(byAmountDesc);

  const transfers: Transfer[] = [];

  let i = 0; // debtors の先頭
  let j = 0; // creditors の先頭

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i]!;
    const creditor = creditors[j]!;

    // 先頭どうしで、小さいほうの額を送金する
    const amount = debtor.amount < creditor.amount ? debtor.amount : creditor.amount;

    transfers.push({ fromId: debtor.id, toId: creditor.id, amount });

    debtor.amount -= amount;
    creditor.amount -= amount;

    // 0 になった人は次の人に進める
    if (debtor.amount === 0n) i += 1;
    if (creditor.amount === 0n) j += 1;
  }

  return transfers;
}
