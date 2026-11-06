/**
 * 最近使ったグループ（localStorage）
 *
 * プライベートブラウズなどで localStorage が使えないことがあるので、
 * 読み書きはすべて try/catch で囲み、失敗しても画面は普通に動くようにする。
 */

const STORAGE_KEY = "yenwali:recent-groups";
const MAX_ITEMS = 10;

export type RecentGroup = {
  id: string;
  name: string;
  /** 最後に開いた日時（ISO 8601） */
  visitedAt: string;
};

function isRecentGroup(value: unknown): value is RecentGroup {
  if (!value || typeof value !== "object") return false;

  const v = value as Record<string, unknown>;

  return typeof v.id === "string" && typeof v.name === "string" && typeof v.visitedAt === "string";
}

export function loadRecentGroups(): RecentGroup[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);

    return Array.isArray(parsed) ? parsed.filter(isRecentGroup).slice(0, MAX_ITEMS) : [];
  } catch {
    return [];
  }
}

/** グループを開いたことを記録する（先頭に移動） */
export function rememberGroup(group: { id: string; name: string }): void {
  try {
    const rest = loadRecentGroups().filter((g) => g.id !== group.id);
    const next: RecentGroup[] = [{ ...group, visitedAt: new Date().toISOString() }, ...rest].slice(0, MAX_ITEMS);

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // 保存できなくても困らない
  }
}

export function forgetGroup(groupId: string): void {
  try {
    const next = loadRecentGroups().filter((g) => g.id !== groupId);

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // 何もしない
  }
}
