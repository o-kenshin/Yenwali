"use server";

/**
 * Server Actions（書き込みはすべてここを通る）
 *
 * 流れ: zod で検証 → DB の内容と照合 → 書き込み → Broadcast で「更新あり」を通知
 */

import { nanoid } from "nanoid";
import { redirect } from "next/navigation";

import { LIMITS } from "@/lib/limits";
import { getRepository } from "@/lib/server/db";
import { notifyGroupUpdated } from "@/lib/server/broadcast";
import { buildPaymentWrite } from "@/lib/server/payments";
import { RepositoryError } from "@/lib/server/repository";
import { buildSnapshot } from "@/lib/server/snapshot";
import {
  addMemberSchema,
  createGroupSchema,
  deleteMemberSchema,
  deletePaymentSchema,
  paymentInputSchema,
  renameMemberSchema,
  toFieldErrors,
} from "@/lib/server/validation";
import type { ActionResult, GroupSnapshot, PaymentInput } from "@/lib/types";

// -----------------------------------------------------------------------------
// 共通
// -----------------------------------------------------------------------------

const MESSAGES = {
  invalid: "入力内容を確認してください",
  groupNotFound: "グループが見つかりません",
  unexpected: "保存できませんでした。時間をおいてもう一度お試しください",
} as const;

function fail(error: string, extra: { code?: string; fieldErrors?: Record<string, string> } = {}): {
  ok: false;
  error: string;
  code?: string;
  fieldErrors?: Record<string, string>;
} {
  return { ok: false, error, ...extra };
}

/** 書き込み後の最新のスナップショットを返す（呼び出した画面をすぐ更新するため） */
async function freshSnapshot(groupId: string): Promise<ActionResult<GroupSnapshot>> {
  const data = await getRepository().getGroupData(groupId);

  return data ? { ok: true, data: buildSnapshot(data) } : fail(MESSAGES.groupNotFound);
}

/** 想定外のエラーはログに出して、利用者には一般的なメッセージを返す */
function unexpected(error: unknown): { ok: false; error: string } {
  console.error("[action] unexpected error", error);

  return { ok: false, error: MESSAGES.unexpected };
}

// -----------------------------------------------------------------------------
// グループ
// -----------------------------------------------------------------------------

export async function createGroupAction(input: { name: string; members: string[] }): Promise<ActionResult> {
  const parsed = createGroupSchema.safeParse(input);

  if (!parsed.success) {
    return fail(MESSAGES.invalid, { fieldErrors: toFieldErrors(parsed.error) });
  }

  // 推測できない ID（nanoid 21 文字 ≒ 126 bit）
  const id = nanoid(21);

  try {
    await getRepository().createGroup(id, parsed.data.name, parsed.data.members);
  } catch (error) {
    return unexpected(error);
  }

  // redirect は例外で実装されているので try の外で呼ぶ
  redirect(`/g/${id}`);
}

// -----------------------------------------------------------------------------
// メンバー
// -----------------------------------------------------------------------------

export async function addMemberAction(input: { groupId: string; name: string }): Promise<ActionResult<GroupSnapshot>> {
  const parsed = addMemberSchema.safeParse(input);

  if (!parsed.success) {
    return fail(MESSAGES.invalid, { fieldErrors: toFieldErrors(parsed.error) });
  }

  const { groupId, name } = parsed.data;

  try {
    const repo = getRepository();
    const data = await repo.getGroupData(groupId);

    if (!data) return fail(MESSAGES.groupNotFound);

    if (data.members.length >= LIMITS.membersMax) {
      return fail(`メンバーは${LIMITS.membersMax}人までです`);
    }

    if (data.members.some((m) => m.name === name)) {
      return fail("同じ名前のメンバーがいます", { fieldErrors: { name: "同じ名前のメンバーがいます" } });
    }

    await repo.addMember(groupId, name);
    await notifyGroupUpdated(groupId);

    return await freshSnapshot(groupId);
  } catch (error) {
    if (error instanceof RepositoryError && error.code === "not_found") return fail(MESSAGES.groupNotFound);

    return unexpected(error);
  }
}

export async function renameMemberAction(input: {
  groupId: string;
  memberId: string;
  name: string;
}): Promise<ActionResult<GroupSnapshot>> {
  const parsed = renameMemberSchema.safeParse(input);

  if (!parsed.success) {
    return fail(MESSAGES.invalid, { fieldErrors: toFieldErrors(parsed.error) });
  }

  const { groupId, memberId, name } = parsed.data;

  try {
    const repo = getRepository();
    const data = await repo.getGroupData(groupId);

    if (!data) return fail(MESSAGES.groupNotFound);

    if (data.members.some((m) => m.name === name && m.id !== memberId)) {
      return fail("同じ名前のメンバーがいます", { fieldErrors: { name: "同じ名前のメンバーがいます" } });
    }

    await repo.renameMember(groupId, memberId, name);
    await notifyGroupUpdated(groupId);

    return await freshSnapshot(groupId);
  } catch (error) {
    if (error instanceof RepositoryError && error.code === "not_found") return fail("メンバーが見つかりません");

    return unexpected(error);
  }
}

export async function deleteMemberAction(input: {
  groupId: string;
  memberId: string;
}): Promise<ActionResult<GroupSnapshot>> {
  const parsed = deleteMemberSchema.safeParse(input);

  if (!parsed.success) {
    return fail(MESSAGES.invalid);
  }

  const { groupId, memberId } = parsed.data;

  try {
    await getRepository().deleteMember(groupId, memberId);
    await notifyGroupUpdated(groupId);

    return await freshSnapshot(groupId);
  } catch (error) {
    if (error instanceof RepositoryError) {
      const messages = {
        not_found: "メンバーが見つかりません",
        in_use: "立て替えに関わっているメンバーは削除できません",
        too_few: "メンバーは2人以上必要です",
        invalid_member: "メンバーが見つかりません",
      } as const;

      return fail(messages[error.code], { code: error.code });
    }

    return unexpected(error);
  }
}

// -----------------------------------------------------------------------------
// 立て替え
// -----------------------------------------------------------------------------

export async function savePaymentAction(input: PaymentInput): Promise<ActionResult<{ paymentId: string }>> {
  const parsed = paymentInputSchema.safeParse(input);

  if (!parsed.success) {
    return fail(MESSAGES.invalid, { fieldErrors: toFieldErrors(parsed.error) });
  }

  const validInput: PaymentInput = parsed.data;

  try {
    const repo = getRepository();
    const data = await repo.getGroupData(validInput.groupId);

    if (!data) return fail(MESSAGES.groupNotFound);

    // 金額・レート・円換算額を組み立てる（メンバーの所属もここで確かめる）
    const built = await buildPaymentWrite(validInput, data);

    if (!built.ok) {
      return fail(built.error, {
        code: built.code,
        fieldErrors: built.field ? { [built.field]: built.error } : undefined,
      });
    }

    const paymentId = await repo.savePayment(validInput.paymentId, built.payment);

    await notifyGroupUpdated(validInput.groupId);

    return { ok: true, data: { paymentId } };
  } catch (error) {
    if (error instanceof RepositoryError) {
      if (error.code === "not_found") return fail("この立て替えは削除されています", { code: "not_found" });
      if (error.code === "invalid_member") return fail("メンバーが変更されています。画面を開き直してください");
    }

    return unexpected(error);
  }
}

export async function deletePaymentAction(input: { groupId: string; paymentId: string }): Promise<ActionResult> {
  const parsed = deletePaymentSchema.safeParse(input);

  if (!parsed.success) {
    return fail(MESSAGES.invalid);
  }

  try {
    await getRepository().deletePayment(parsed.data.groupId, parsed.data.paymentId);
    await notifyGroupUpdated(parsed.data.groupId);

    return { ok: true, data: null };
  } catch (error) {
    // すでに消えていれば、消したのと同じ扱いにする
    if (error instanceof RepositoryError && error.code === "not_found") return { ok: true, data: null };

    return unexpected(error);
  }
}
