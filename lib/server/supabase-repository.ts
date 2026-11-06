import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { normalizeRateString } from "@/lib/money";

import { getSupabaseServerConfig } from "./env";
import {
  RepositoryError,
  type GroupData,
  type MemberRecord,
  type PaymentRecord,
  type Repository,
} from "./repository";

/**
 * Supabase（PostgreSQL）に保存するリポジトリ
 *
 * シークレットキー（service_role）で接続するので RLS をバイパスする。
 * このファイルは server-only なので、クライアントには絶対に含まれない。
 */

// -----------------------------------------------------------------------------
// クライアント
// -----------------------------------------------------------------------------

let cachedClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (!cachedClient) {
    const { url, secretKey } = getSupabaseServerConfig();

    cachedClient = createClient(url, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  return cachedClient;
}

// -----------------------------------------------------------------------------
// DB の行の形（受け取ったデータも型を信じず検証する）
// -----------------------------------------------------------------------------

const groupRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  created_at: z.string(),
});

const memberRowSchema = z.object({
  id: z.string(),
  group_id: z.string(),
  name: z.string(),
  sort_order: z.number().int(),
});

const paymentRowSchema = z.object({
  id: z.string(),
  group_id: z.string(),
  title: z.string(),
  payer_id: z.string(),
  amount_minor: z.number().int(),
  currency: z.string(),
  // numeric は ::text で文字列として受け取る（number にすると精度が落ちる）
  rate_to_jpy: z.string(),
  rate_source: z.enum(["frankfurter", "exchangerate-api", "manual", "identity"]),
  rate_date: z.string(),
  rate_fetched_at: z.string(),
  amount_jpy: z.number().int(),
  paid_on: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  payment_participants: z.array(z.object({ member_id: z.string() })),
});

const PAYMENT_COLUMNS = [
  "id",
  "group_id",
  "title",
  "payer_id",
  "amount_minor",
  "currency",
  "rate_to_jpy::text",
  "rate_source",
  "rate_date",
  "rate_fetched_at",
  "amount_jpy",
  "paid_on",
  "created_at",
  "updated_at",
  "payment_participants(member_id)",
].join(",");

function toPaymentRecord(row: z.infer<typeof paymentRowSchema>): PaymentRecord {
  return {
    id: row.id,
    groupId: row.group_id,
    title: row.title,
    payerId: row.payer_id,
    amountMinor: row.amount_minor,
    currency: row.currency,
    // numeric(30,10) は "152.3400000000" のように返るので正規化する
    rateToJpy: normalizeRateString(row.rate_to_jpy) ?? row.rate_to_jpy,
    rateSource: row.rate_source,
    rateDate: row.rate_date,
    rateFetchedAt: row.rate_fetched_at,
    amountJpy: row.amount_jpy,
    paidOn: row.paid_on,
    participantIds: row.payment_participants.map((p) => p.member_id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Supabase のエラーを、アプリのエラーに変換して投げる */
function throwDbError(error: { code?: string; message: string }): never {
  // 23503: 外部キー違反
  // - members の行を消そうとして参照されていた → 支払いに関わっているメンバー
  // - それ以外（支払いの保存時）→ グループに属さないメンバーを指定した
  if (error.code === "23503") {
    const isMemberDelete = error.message.includes('on table "members"');

    throw new RepositoryError(isMemberDelete ? "in_use" : "invalid_member");
  }

  if (error.code === "P0002") {
    throw new RepositoryError("not_found");
  }

  throw new Error(`Database error: ${error.message}`);
}

// -----------------------------------------------------------------------------
// リポジトリ本体
// -----------------------------------------------------------------------------

export function createSupabaseRepository(): Repository {
  const db = getSupabaseAdmin();

  return {
    async createGroup(id, name, memberNames) {
      const { error } = await db.rpc("create_group", {
        p_id: id,
        p_name: name,
        p_member_names: memberNames,
      });

      if (error) throwDbError(error);
    },

    async getGroupData(groupId): Promise<GroupData | null> {
      // 3 つのテーブルを並行して読む
      const [groupRes, membersRes, paymentsRes] = await Promise.all([
        db.from("groups").select("id,name,created_at").eq("id", groupId).maybeSingle(),
        db.from("members").select("id,group_id,name,sort_order").eq("group_id", groupId).order("sort_order"),
        db
          .from("payments")
          .select(PAYMENT_COLUMNS)
          .eq("group_id", groupId)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false }),
      ]);

      if (groupRes.error) throwDbError(groupRes.error);
      if (membersRes.error) throwDbError(membersRes.error);
      if (paymentsRes.error) throwDbError(paymentsRes.error);

      if (!groupRes.data) {
        return null;
      }

      const group = groupRowSchema.parse(groupRes.data);
      const members: MemberRecord[] = z
        .array(memberRowSchema)
        .parse(membersRes.data)
        .map((m) => ({ id: m.id, groupId: m.group_id, name: m.name, sortOrder: m.sort_order }));
      const payments = z.array(paymentRowSchema).parse(paymentsRes.data).map(toPaymentRecord);

      return {
        group: { id: group.id, name: group.name, createdAt: group.created_at },
        members,
        payments,
      };
    },

    async addMember(groupId, name) {
      const { error } = await db.rpc("add_member", { p_group_id: groupId, p_name: name });

      if (error) throwDbError(error);
    },

    async renameMember(groupId, memberId, name) {
      const { data, error } = await db
        .from("members")
        .update({ name })
        .eq("id", memberId)
        .eq("group_id", groupId)
        .select("id");

      if (error) throwDbError(error);
      if (!data || data.length === 0) throw new RepositoryError("not_found");
    },

    async deleteMember(groupId, memberId) {
      const { data, error } = await db.rpc("delete_member", {
        p_group_id: groupId,
        p_member_id: memberId,
      });

      if (error) throwDbError(error);

      const result = z.enum(["ok", "not_found", "too_few", "in_use"]).parse(data);

      if (result !== "ok") throw new RepositoryError(result);
    },

    async savePayment(paymentId, payment) {
      const { data, error } = await db.rpc("save_payment", {
        p_id: paymentId,
        p_group_id: payment.groupId,
        p_title: payment.title,
        p_payer_id: payment.payerId,
        p_amount_minor: payment.amountMinor,
        p_currency: payment.currency,
        p_rate_to_jpy: payment.rateToJpy,
        p_rate_source: payment.rateSource,
        p_rate_date: payment.rateDate,
        p_rate_fetched_at: payment.rateFetchedAt,
        p_amount_jpy: payment.amountJpy,
        p_paid_on: payment.paidOn,
        p_participant_ids: payment.participantIds,
      });

      if (error) throwDbError(error);
      if (data === null) throw new RepositoryError("not_found");

      return z.string().parse(data);
    },

    async deletePayment(groupId, paymentId) {
      const { data, error } = await db
        .from("payments")
        .delete()
        .eq("id", paymentId)
        .eq("group_id", groupId)
        .select("id");

      if (error) throwDbError(error);
      if (!data || data.length === 0) throw new RepositoryError("not_found");
    },
  };
}
