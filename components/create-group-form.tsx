"use client";

import { useId, useRef, useState, useTransition } from "react";

import { createGroupAction } from "@/app/actions";
import { LIMITS } from "@/lib/limits";

import { Button, FieldError, FieldLabel, INPUT_CLASS } from "./ui";

/**
 * グループ作成フォーム（グループ名とメンバー名だけ）
 */
export function CreateGroupForm() {
  const formId = useId();

  const [name, setName] = useState("");
  // 入力欄を並べ替えても React が見失わないよう、各欄に key を持たせる
  const [members, setMembers] = useState<{ key: number; value: string }[]>([
    { key: 0, value: "" },
    { key: 1, value: "" },
  ]);
  const nextKey = useRef(2);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const memberRefs = useRef(new Map<number, HTMLInputElement>());

  // ---------------------------------------------------------------------------
  // メンバー欄の操作
  // ---------------------------------------------------------------------------

  function addMemberField(focus = true): void {
    if (members.length >= LIMITS.membersMax) return;

    const key = nextKey.current++;

    setMembers((prev) => [...prev, { key, value: "" }]);

    if (focus) {
      // 追加した欄が描画されてからフォーカスする
      requestAnimationFrame(() => memberRefs.current.get(key)?.focus());
    }
  }

  function removeMemberField(key: number): void {
    setMembers((prev) => prev.filter((m) => m.key !== key));
  }

  function updateMember(key: number, value: string): void {
    setMembers((prev) => prev.map((m) => (m.key === key ? { ...m, value } : m)));
  }

  // ---------------------------------------------------------------------------
  // 送信
  // ---------------------------------------------------------------------------

  function submit(): void {
    const memberNames = members.map((m) => m.value.trim()).filter((v) => v !== "");

    // サーバーでも検証するが、よくある間違いはここで先に伝える
    const localErrors: Record<string, string> = {};

    if (name.trim() === "") localErrors.name = "グループ名を入力してください";
    if (memberNames.length < LIMITS.membersMin) localErrors.members = "メンバーを2人以上入力してください";
    else if (new Set(memberNames).size !== memberNames.length) localErrors.members = "同じ名前のメンバーがいます";

    setErrors(localErrors);
    setFormError(null);

    if (Object.keys(localErrors).length > 0) return;

    startTransition(async () => {
      // 成功するとサーバー側でグループのページに移動する
      const result = await createGroupAction({ name, members: memberNames });

      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setFormError(result.error);
      }
    });
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      noValidate
    >
      {/* グループ名 */}
      <div>
        <FieldLabel htmlFor={`${formId}-name`}>グループ名</FieldLabel>
        <input
          id={`${formId}-name`}
          className={INPUT_CLASS}
          placeholder="例：台湾旅行"
          value={name}
          maxLength={LIMITS.groupNameMax}
          onChange={(e) => setName(e.target.value)}
          enterKeyHint="next"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              memberRefs.current.get(members[0]?.key ?? -1)?.focus();
            }
          }}
          aria-invalid={Boolean(errors.name)}
        />
        <FieldError message={errors.name} />
      </div>

      {/* メンバー */}
      <fieldset>
        <legend className="mb-1.5 block text-sm font-bold text-muted">メンバー</legend>

        <ul className="space-y-2">
          {members.map((member, index) => (
            <li key={member.key} className="flex items-center gap-2">
              <input
                ref={(el) => {
                  if (el) memberRefs.current.set(member.key, el);
                  else memberRefs.current.delete(member.key);
                }}
                className={INPUT_CLASS}
                placeholder={`メンバー${index + 1}の名前`}
                aria-label={`メンバー${index + 1}の名前`}
                value={member.value}
                maxLength={LIMITS.memberNameMax}
                onChange={(e) => updateMember(member.key, e.target.value)}
                enterKeyHint={index === members.length - 1 ? "done" : "next"}
                onKeyDown={(e) => {
                  // Enter で次の欄へ。最後の欄なら欄を増やす（日本語変換の確定の Enter は除く）
                  if (e.key !== "Enter" || e.nativeEvent.isComposing) return;

                  e.preventDefault();

                  const next = members[index + 1];

                  if (next) memberRefs.current.get(next.key)?.focus();
                  else if (member.value.trim() !== "") addMemberField();
                }}
              />
              {members.length > LIMITS.membersMin && (
                <button
                  type="button"
                  onClick={() => removeMemberField(member.key)}
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-xl text-muted hover:bg-surface-muted"
                  aria-label={`メンバー${index + 1}の欄を消す`}
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>

        <FieldError message={errors.members} />

        {members.length < LIMITS.membersMax && (
          <Button variant="ghost" className="mt-2 text-accent" onClick={() => addMemberField()}>
            ＋ メンバーを追加
          </Button>
        )}
      </fieldset>

      {formError && Object.keys(errors).length === 0 && <FieldError message={formError} />}

      <Button type="submit" size="lg" className="w-full" disabled={isPending}>
        {isPending ? "作成しています…" : "グループを作る"}
      </Button>
    </form>
  );
}
