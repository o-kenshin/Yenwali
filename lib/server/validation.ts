import "server-only";

import { z } from "zod";

import { LIMITS } from "@/lib/limits";
import { isCurrencyCode } from "@/lib/money";

/**
 * 入力の検証（zod）
 *
 * ここでは「形」を検証する。
 * 「メンバーがそのグループに属しているか」は DB の内容と照らし合わせる必要があるので、
 * Server Action の中で（さらに DB の制約でも）確かめる。
 */

// -----------------------------------------------------------------------------
// 部品
// -----------------------------------------------------------------------------

export const groupIdSchema = z.string().regex(/^[A-Za-z0-9_-]{21,64}$/, { error: "グループが見つかりません" });

const idSchema = z.uuid({ error: "不正な ID です" });

/** 前後の空白を取ってから長さを検証する */
function trimmedText(label: string, max: number) {
  return z
    .string({ error: `${label}を入力してください` })
    .trim()
    .min(1, { error: `${label}を入力してください` })
    .max(max, { error: `${label}は${max}文字以内で入力してください` });
}

export const memberNameSchema = trimmedText("名前", LIMITS.memberNameMax);

/** 実在する日付か（2026-02-30 などを弾く） */
const isoDateSchema = z.iso.date({ error: "日付が正しくありません" });

// -----------------------------------------------------------------------------
// グループ
// -----------------------------------------------------------------------------

export const createGroupSchema = z.object({
  name: trimmedText("グループ名", LIMITS.groupNameMax),
  members: z
    .array(memberNameSchema)
    .min(LIMITS.membersMin, { error: `メンバーは${LIMITS.membersMin}人以上入力してください` })
    .max(LIMITS.membersMax, { error: `メンバーは${LIMITS.membersMax}人までです` })
    .refine((names) => new Set(names).size === names.length, { error: "同じ名前のメンバーがいます" }),
});

export const addMemberSchema = z.object({
  groupId: groupIdSchema,
  name: memberNameSchema,
});

export const renameMemberSchema = z.object({
  groupId: groupIdSchema,
  memberId: idSchema,
  name: memberNameSchema,
});

export const deleteMemberSchema = z.object({
  groupId: groupIdSchema,
  memberId: idSchema,
});

// -----------------------------------------------------------------------------
// 支払い
// -----------------------------------------------------------------------------

const rateModeSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("auto") }),
  z.object({ mode: z.literal("keep") }),
  z.object({ mode: z.literal("manual"), value: z.string().max(40) }),
]);

export const paymentInputSchema = z.object({
  groupId: groupIdSchema,
  paymentId: idSchema.nullable(),
  title: trimmedText("内容", LIMITS.titleMax),
  payerId: idSchema,
  // 金額は文字列で受け取り、通貨の桁数に合わせて整数にする（Server Action 側）
  amount: z.string().max(30, { error: "金額が大きすぎます" }),
  currency: z.string().refine(isCurrencyCode, { error: "通貨が正しくありません" }),
  participantIds: z
    .array(idSchema)
    .min(1, { error: "負担する人を1人以上選んでください" })
    .max(LIMITS.membersMax)
    .refine((ids) => new Set(ids).size === ids.length, { error: "負担する人が重複しています" }),
  paidOn: isoDateSchema,
  rate: rateModeSchema,
});

export const deletePaymentSchema = z.object({
  groupId: groupIdSchema,
  paymentId: idSchema,
});

// -----------------------------------------------------------------------------
// エラーの整形
// -----------------------------------------------------------------------------

/** zod のエラーを「入力欄ごとの最初のメッセージ」にする */
export function toFieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};

  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "_");

    result[key] ??= issue.message;
  }

  return result;
}
