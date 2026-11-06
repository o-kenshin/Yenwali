"use client";

import { useState, useTransition } from "react";

import { addMemberAction, deleteMemberAction, renameMemberAction } from "@/app/actions";
import { LIMITS } from "@/lib/limits";
import type { GroupSnapshot } from "@/lib/types";

import { Button, Card, FieldError, INPUT_CLASS, SectionTitle } from "./ui";

/**
 * メンバーの追加・名前の変更・削除（グループのページの下に置く）
 *
 * 支払いに関わっているメンバーは削除できない（サーバーと DB でも拒否する）。
 */
export function MemberEditor({
  snapshot,
  onUpdated,
  onMessage,
}: {
  snapshot: GroupSnapshot;
  onUpdated: (next: GroupSnapshot) => void;
  onMessage: (message: string) => void;
}) {
  const groupId = snapshot.group.id;

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // 支払いに関わっているメンバー（立て替えた人 or 負担する人）
  const inUse = new Set(snapshot.payments.flatMap((p) => [p.payerId, ...p.participantIds]));
  const canDeleteMore = snapshot.members.length > LIMITS.membersMin;

  // ---------------------------------------------------------------------------
  // 操作
  // ---------------------------------------------------------------------------

  function run(action: () => Promise<{ ok: true; data: GroupSnapshot } | { ok: false; error: string }>, done?: () => void): void {
    setError(null);

    startTransition(async () => {
      const result = await action();

      if (result.ok) {
        onUpdated(result.data);
        done?.();
      } else {
        setError(result.error);
      }
    });
  }

  function addMember(): void {
    if (newName.trim() === "") return;

    run(
      () => addMemberAction({ groupId, name: newName }),
      () => {
        setNewName("");
        onMessage("メンバーを追加しました");
      },
    );
  }

  function saveRename(memberId: string): void {
    run(
      () => renameMemberAction({ groupId, memberId, name: editingName }),
      () => setEditingId(null),
    );
  }

  function deleteMember(memberId: string, name: string): void {
    if (!window.confirm(`${name} さんをメンバーから削除しますか？`)) return;

    run(
      () => deleteMemberAction({ groupId, memberId }),
      () => onMessage("メンバーを削除しました"),
    );
  }

  return (
    <Card aria-labelledby="members-title">
      <SectionTitle>
        <span id="members-title">メンバー</span>
      </SectionTitle>

      <ul className="divide-y divide-line" data-testid="members">
        {snapshot.members.map((m) => (
          <li key={m.id} className="py-2">
            {editingId === m.id ? (
              // 名前の変更中
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  saveRename(m.id);
                }}
              >
                <input
                  className={INPUT_CLASS}
                  value={editingName}
                  maxLength={LIMITS.memberNameMax}
                  onChange={(e) => setEditingName(e.target.value)}
                  aria-label={`${m.name} の新しい名前`}
                  autoFocus
                />
                <Button type="submit" disabled={isPending || editingName.trim() === ""}>
                  保存
                </Button>
                <Button variant="ghost" onClick={() => setEditingId(null)}>
                  やめる
                </Button>
              </form>
            ) : (
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-bold">{m.name}</span>
                <Button
                  variant="ghost"
                  className="text-accent"
                  onClick={() => {
                    setEditingId(m.id);
                    setEditingName(m.name);
                    setError(null);
                  }}
                  aria-label={`${m.name} の名前を変える`}
                >
                  名前を変える
                </Button>
                <Button
                  variant="ghost"
                  className="text-negative"
                  disabled={isPending || inUse.has(m.id) || !canDeleteMore}
                  onClick={() => deleteMember(m.id, m.name)}
                  aria-label={`${m.name} を削除`}
                  title={
                    inUse.has(m.id)
                      ? "立て替えに関わっているメンバーは削除できません"
                      : !canDeleteMore
                        ? "メンバーは2人以上必要です"
                        : undefined
                  }
                >
                  削除
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <p className="mt-1 text-xs text-muted">立て替えに関わっているメンバーは削除できません。</p>

      {/* メンバーの追加 */}
      {snapshot.members.length < LIMITS.membersMax && (
        <form
          className="mt-4 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            addMember();
          }}
        >
          <input
            className={INPUT_CLASS}
            placeholder="追加するメンバーの名前"
            aria-label="追加するメンバーの名前"
            value={newName}
            maxLength={LIMITS.memberNameMax}
            onChange={(e) => setNewName(e.target.value)}
          />
          <Button type="submit" variant="secondary" disabled={isPending || newName.trim() === ""} className="shrink-0">
            追加
          </Button>
        </form>
      )}

      <FieldError message={error ?? undefined} />
    </Card>
  );
}
