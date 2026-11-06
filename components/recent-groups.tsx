"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

import { forgetGroup, loadRecentGroups, type RecentGroup } from "@/lib/client/recent-groups";

import { Card, SectionTitle } from "./ui";

/**
 * 最近使ったグループ（このブラウザの localStorage に保存したもの）
 */

// localStorage を「外部のストア」として読む（サーバーでの描画時は空）
const listeners = new Set<() => void>();
let cache: { raw: string; value: RecentGroup[] } | null = null;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function getSnapshot(): RecentGroup[] {
  const value = loadRecentGroups();
  const raw = JSON.stringify(value);

  // 同じ内容なら同じ配列を返す（useSyncExternalStore が無限に再描画しないように）
  if (!cache || cache.raw !== raw) {
    cache = { raw, value };
  }

  return cache.value;
}

const EMPTY: RecentGroup[] = [];

function getServerSnapshot(): RecentGroup[] {
  return EMPTY;
}

export function RecentGroups() {
  const groups = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (groups.length === 0) return null;

  return (
    <Card>
      <SectionTitle>最近使ったグループ</SectionTitle>
      <ul className="divide-y divide-line">
        {groups.map((g) => (
          <li key={g.id} className="flex items-center gap-2">
            <Link href={`/g/${g.id}`} className="flex min-h-12 flex-1 items-center py-2 font-bold">
              {g.name}
            </Link>
            <button
              type="button"
              className="h-10 rounded-xl px-3 text-xs text-muted hover:bg-surface-muted"
              onClick={() => {
                forgetGroup(g.id);
                listeners.forEach((l) => l());
              }}
              aria-label={`${g.name} を履歴から消す`}
            >
              履歴から消す
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
