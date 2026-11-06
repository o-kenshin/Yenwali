import "server-only";

import { LIMITS } from "@/lib/limits";
import {
  convertToJpy,
  currencyDigits,
  normalizeRateString,
  parseAmountToMinor,
  parseRateToScaled,
  RATE_SCALE,
} from "@/lib/money";
import type { PaymentInput, RateSource } from "@/lib/types";

import { getRateToJpy, todayInTokyo } from "./rates";
import type { GroupData, PaymentWrite } from "./repository";

/**
 * 立て替えの保存内容を組み立てる（検証済みの入力と、DB の現在の内容から）
 *
 * - 金額を通貨の最小単位の整数にする
 * - レートを決める（JPY / 手動 / 保存済みのまま / 最新の参考レート）
 * - 円換算額を計算して固定する
 */

export type BuildPaymentResult =
  | { ok: true; payment: PaymentWrite }
  | { ok: false; error: string; code?: string; field?: string };

type RateFields = {
  rateToJpy: string;
  rateSource: RateSource;
  rateDate: string;
  rateFetchedAt: string;
};

export async function buildPaymentWrite(input: PaymentInput, data: GroupData): Promise<BuildPaymentResult> {
  // ---------------------------------------------------------------------------
  // メンバーがこのグループに属しているか
  // ---------------------------------------------------------------------------
  const memberIds = new Set(data.members.map((m) => m.id));

  if (!memberIds.has(input.payerId)) {
    return { ok: false, error: "立て替えた人がこのグループのメンバーではありません", field: "payerId" };
  }

  if (input.participantIds.some((id) => !memberIds.has(id))) {
    return { ok: false, error: "負担する人にこのグループのメンバーではない人がいます", field: "participantIds" };
  }

  // ---------------------------------------------------------------------------
  // 編集なら、元の支払いがこのグループにあるか / 新規なら件数の上限
  // ---------------------------------------------------------------------------
  const existing = input.paymentId ? data.payments.find((p) => p.id === input.paymentId) : undefined;

  if (input.paymentId && !existing) {
    return { ok: false, error: "この立て替えは削除されています", code: "not_found" };
  }

  if (!input.paymentId && data.payments.length >= LIMITS.paymentsMax) {
    return { ok: false, error: `1つのグループに記録できるのは${LIMITS.paymentsMax}件までです` };
  }

  // ---------------------------------------------------------------------------
  // 金額
  // ---------------------------------------------------------------------------
  const digits = currencyDigits(input.currency);
  const parsedAmount = parseAmountToMinor(input.amount, digits);

  if (!parsedAmount.ok) {
    const messages = {
      empty: "金額を入力してください",
      invalid: "金額は数字で入力してください",
      too_many_decimals:
        digits === 0
          ? `${input.currency}は小数点なしで入力してください`
          : `${input.currency}は小数点以下${digits}桁までです`,
      not_positive: "金額は0より大きくしてください",
    } as const;

    return { ok: false, error: messages[parsedAmount.error], field: "amount" };
  }

  if (parsedAmount.minor > BigInt(LIMITS.amountMax)) {
    return { ok: false, error: "金額が大きすぎます", field: "amount" };
  }

  // ---------------------------------------------------------------------------
  // レート
  // ---------------------------------------------------------------------------
  const rate = await resolveRate(input, existing);

  if (!rate.ok) {
    return rate;
  }

  // ---------------------------------------------------------------------------
  // 円換算（BigInt で計算して、ここで固定する）
  // ---------------------------------------------------------------------------
  const amountJpy = convertToJpy(parsedAmount.minor, input.currency, rate.fields.rateToJpy);

  if (amountJpy > BigInt(LIMITS.amountMax)) {
    return { ok: false, error: "円に換算した金額が大きすぎます", field: "amount" };
  }

  return {
    ok: true,
    payment: {
      groupId: input.groupId,
      title: input.title,
      payerId: input.payerId,
      amountMinor: Number(parsedAmount.minor),
      currency: input.currency,
      ...rate.fields,
      amountJpy: Number(amountJpy),
      paidOn: input.paidOn,
      participantIds: input.participantIds,
    },
  };
}

type ResolveRateResult = { ok: true; fields: RateFields } | { ok: false; error: string; code?: string; field?: string };

async function resolveRate(input: PaymentInput, existing: GroupData["payments"][number] | undefined): Promise<ResolveRateResult> {
  const now = new Date().toISOString();

  // 円はレート 1
  if (input.currency === "JPY") {
    return {
      ok: true,
      fields: { rateToJpy: "1", rateSource: "identity", rateDate: todayInTokyo(), rateFetchedAt: now },
    };
  }

  switch (input.rate.mode) {
    // 手動で入力したレート。レートの日付は支払った日とする
    case "manual": {
      const rate = normalizeRateString(input.rate.value);
      const scaled = rate ? parseRateToScaled(rate) : null;

      if (!rate || scaled === null) {
        return { ok: false, error: "レートは0より大きい数字で入力してください", field: "rate" };
      }

      if (scaled > BigInt(LIMITS.rateMax) * RATE_SCALE) {
        return { ok: false, error: "レートが大きすぎます", field: "rate" };
      }

      return {
        ok: true,
        fields: { rateToJpy: rate, rateSource: "manual", rateDate: input.paidOn, rateFetchedAt: now },
      };
    }

    // 編集: 保存済みのレートをそのまま使う（通貨を変えたときは使えない）
    case "keep": {
      if (!existing || existing.currency !== input.currency) {
        return { ok: false, error: "通貨を変えたときはレートを取り直してください", code: "rate_required", field: "rate" };
      }

      return {
        ok: true,
        fields: {
          rateToJpy: existing.rateToJpy,
          rateSource: existing.rateSource,
          rateDate: existing.rateDate,
          rateFetchedAt: existing.rateFetchedAt,
        },
      };
    }

    // 最新の参考レート（サーバーで 1 時間キャッシュしたもの）
    case "auto": {
      const quote = await getRateToJpy(input.currency);

      if (!quote) {
        return {
          ok: false,
          error: "為替レートを取得できませんでした。レートを手動で入力してください",
          code: "rate_unavailable",
          field: "rate",
        };
      }

      return {
        ok: true,
        fields: {
          rateToJpy: quote.rate,
          rateSource: quote.source,
          rateDate: quote.rateDate,
          rateFetchedAt: quote.fetchedAt,
        },
      };
    }
  }
}
