import "server-only";

import {
  RepositoryError,
  type GroupData,
  type GroupRecord,
  type MemberRecord,
  type PaymentRecord,
  type PaymentWrite,
  type Repository,
} from "./repository";

/**
 * メモリに保存するリポジトリ（E2E テスト・ローカルのお試し用）
 *
 * プロセスが終わるとデータは消える。
 * 開発サーバーのホットリロードで消えないよう globalThis に置く。
 */

type MemoryState = {
  groups: Map<string, GroupRecord>;
  members: Map<string, MemberRecord>;
  payments: Map<string, PaymentRecord>;
};

const globalForMemory = globalThis as typeof globalThis & { __yenwaliMemory?: MemoryState };

function state(): MemoryState {
  globalForMemory.__yenwaliMemory ??= {
    groups: new Map(),
    members: new Map(),
    payments: new Map(),
  };

  return globalForMemory.__yenwaliMemory;
}

function membersOf(groupId: string): MemberRecord[] {
  return [...state().members.values()]
    .filter((m) => m.groupId === groupId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/** 値をコピーして返す（呼び出し側の変更が保存内容に影響しないように） */
function clone<T>(value: T): T {
  return structuredClone(value);
}

export function createMemoryRepository(): Repository {
  return {
    async createGroup(id, name, memberNames) {
      const s = state();
      const now = new Date().toISOString();

      s.groups.set(id, { id, name, createdAt: now });

      memberNames.forEach((memberName, index) => {
        const memberId = crypto.randomUUID();

        s.members.set(memberId, { id: memberId, groupId: id, name: memberName, sortOrder: index });
      });
    },

    async getGroupData(groupId): Promise<GroupData | null> {
      const s = state();
      const group = s.groups.get(groupId);

      if (!group) {
        return null;
      }

      // Map は追加した順を保つので、逆順にすれば新しい順になる（更新しても位置は変わらない）
      const payments = [...s.payments.values()].filter((p) => p.groupId === groupId).reverse();

      return clone({ group, members: membersOf(groupId), payments });
    },

    async addMember(groupId, name) {
      const s = state();

      if (!s.groups.has(groupId)) {
        throw new RepositoryError("not_found");
      }

      const members = membersOf(groupId);
      const sortOrder = members.length > 0 ? Math.max(...members.map((m) => m.sortOrder)) + 1 : 0;
      const id = crypto.randomUUID();

      s.members.set(id, { id, groupId, name, sortOrder });
    },

    async renameMember(groupId, memberId, name) {
      const member = state().members.get(memberId);

      if (!member || member.groupId !== groupId) {
        throw new RepositoryError("not_found");
      }

      member.name = name;
    },

    async deleteMember(groupId, memberId) {
      const s = state();
      const member = s.members.get(memberId);

      if (!member || member.groupId !== groupId) {
        throw new RepositoryError("not_found");
      }

      // DB の delete_member と同じ順番で確かめる
      const inUse = [...s.payments.values()].some(
        (p) => p.payerId === memberId || p.participantIds.includes(memberId),
      );

      if (inUse) {
        throw new RepositoryError("in_use");
      }

      if (membersOf(groupId).length <= 2) {
        throw new RepositoryError("too_few");
      }

      s.members.delete(memberId);
    },

    async savePayment(paymentId, payment: PaymentWrite) {
      const s = state();
      const memberIds = new Set(membersOf(payment.groupId).map((m) => m.id));

      if (!memberIds.has(payment.payerId) || payment.participantIds.some((id) => !memberIds.has(id))) {
        throw new RepositoryError("invalid_member");
      }

      const now = new Date().toISOString();

      if (paymentId === null) {
        const id = crypto.randomUUID();

        s.payments.set(id, clone({ ...payment, id, createdAt: now, updatedAt: now }));

        return id;
      }

      const existing = s.payments.get(paymentId);

      if (!existing || existing.groupId !== payment.groupId) {
        throw new RepositoryError("not_found");
      }

      s.payments.set(paymentId, clone({ ...payment, id: paymentId, createdAt: existing.createdAt, updatedAt: now }));

      return paymentId;
    },

    async deletePayment(groupId, paymentId) {
      const s = state();
      const existing = s.payments.get(paymentId);

      if (!existing || existing.groupId !== groupId) {
        throw new RepositoryError("not_found");
      }

      s.payments.delete(paymentId);
    },
  };
}
