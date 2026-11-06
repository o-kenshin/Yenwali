/**
 * 精算結果を LINE などに貼れるテキストにする
 */

import { formatJpy } from "@/lib/money";
import type { GroupSnapshot } from "@/lib/types";

export function buildSettlementText(snapshot: GroupSnapshot, groupUrl: string): string {
  const nameOf = new Map(snapshot.members.map((m) => [m.id, m.name]));

  const lines: string[] = [`【${snapshot.group.name}】の精算`, ""];

  if (snapshot.transfers.length === 0) {
    lines.push("精算は必要ありません");
  } else {
    for (const t of snapshot.transfers) {
      lines.push(`${nameOf.get(t.fromId) ?? "?"} → ${nameOf.get(t.toId) ?? "?"}：${formatJpy(t.amount)}`);
    }
  }

  lines.push("", `合計：${formatJpy(snapshot.totalJpy)}（${snapshot.payments.length}件）`, "", "くわしくはこちら", groupUrl);

  return lines.join("\n");
}
