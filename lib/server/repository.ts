import "server-only";

import type { RateSource } from "@/lib/types";

/**
 * データの保存先の抽象。
 * 本番は Supabase、E2E テストではメモリの実装を使う。
 */

export type GroupRecord = {
  id: string;
  name: string;
  createdAt: string;
};

export type MemberRecord = {
  id: string;
  groupId: string;
  name: string;
  sortOrder: number;
};

export type PaymentRecord = {
  id: string;
  groupId: string;
  title: string;
  payerId: string;
  amountMinor: number;
  currency: string;
  /** 正規化済みの10進数の文字列 */
  rateToJpy: string;
  rateSource: RateSource;
  rateDate: string;
  rateFetchedAt: string;
  amountJpy: number;
  paidOn: string;
  participantIds: string[];
  createdAt: string;
  updatedAt: string;
};

/** グループのページに必要なデータ一式 */
export type GroupData = {
  group: GroupRecord;
  /** sort_order 順 */
  members: MemberRecord[];
  /** 新しい順 */
  payments: PaymentRecord[];
};

/** 支払いの書き込み内容 */
export type PaymentWrite = Omit<PaymentRecord, "id" | "createdAt" | "updatedAt">;

/** リポジトリの失敗理由 */
export type RepositoryErrorCode =
  | "not_found" // 対象が見つからない
  | "in_use" // 支払いに関わっているので削除できない
  | "too_few" // メンバーが2人未満になる
  | "invalid_member"; // グループに属さないメンバー

export class RepositoryError extends Error {
  constructor(readonly code: RepositoryErrorCode) {
    super(code);
    this.name = "RepositoryError";
  }
}

export interface Repository {
  createGroup(id: string, name: string, memberNames: string[]): Promise<void>;
  getGroupData(groupId: string): Promise<GroupData | null>;

  addMember(groupId: string, name: string): Promise<void>;
  renameMember(groupId: string, memberId: string, name: string): Promise<void>;
  deleteMember(groupId: string, memberId: string): Promise<void>;

  /** paymentId が null なら作成。作成・更新した支払いの id を返す */
  savePayment(paymentId: string | null, payment: PaymentWrite): Promise<string>;
  deletePayment(groupId: string, paymentId: string): Promise<void>;
}
