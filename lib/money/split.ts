/**
 * 割り勘の分割
 *
 * 円の額を負担する人数で割り、割り切れない端数は
 * 「メンバーの並び順の先頭」から 1 円ずつ多く負担する。
 * 分割した額の合計は必ず元の額と一致する。
 *
 * 例: 1000 円を 3 人 → 334 / 333 / 333
 */

/**
 * @param totalJpy        分ける円の額（0 以上の整数）
 * @param orderedMemberIds 負担する人の ID。グループのメンバーの並び順に並べて渡すこと。
 * @returns メンバー ID → 負担額
 */
export function splitEvenly(totalJpy: bigint, orderedMemberIds: readonly string[]): Map<string, bigint> {
  if (orderedMemberIds.length === 0) {
    throw new Error("splitEvenly: at least one participant is required");
  }

  if (totalJpy < 0n) {
    throw new Error("splitEvenly: total must be >= 0");
  }

  if (new Set(orderedMemberIds).size !== orderedMemberIds.length) {
    throw new Error("splitEvenly: participants must be unique");
  }

  const count = BigInt(orderedMemberIds.length);
  const base = totalJpy / count; // 1人あたりの基本額（切り捨て）
  const remainder = totalJpy % count; // 余った円（人数未満）

  const result = new Map<string, bigint>();

  orderedMemberIds.forEach((memberId, index) => {
    // 先頭から remainder 人だけ 1 円多く負担する
    const extra = BigInt(index) < remainder ? 1n : 0n;

    result.set(memberId, base + extra);
  });

  return result;
}
