import { describe, expect, it } from "vitest";

import {
  computeBalances,
  computeTransfers,
  convertToJpy,
  currencyDigits,
  divRoundHalfUp,
  formatForeign,
  formatJpy,
  isCurrencyCode,
  minorToInputString,
  normalizeRateString,
  parseAmountToMinor,
  parseRateToScaled,
  splitEvenly,
  type MemberBalance,
  type SettlementPayment,
  type Transfer,
} from "./index";

// ---------------------------------------------------------------------------
// テスト用のヘルパー
// ---------------------------------------------------------------------------

/** 送金をすべて反映したあとの差額を返す */
function applyTransfers(balances: readonly MemberBalance[], transfers: readonly Transfer[]): Map<string, bigint> {
  const result = new Map(balances.map((b) => [b.memberId, b.balance]));

  for (const t of transfers) {
    // 払う側は差額が増え（マイナスが 0 に近づき）、もらう側は減る
    result.set(t.fromId, (result.get(t.fromId) ?? 0n) + t.amount);
    result.set(t.toId, (result.get(t.toId) ?? 0n) - t.amount);
  }

  return result;
}

/** 再現性のある疑似乱数（テストを毎回同じ結果にするため） */
function createRandom(seed: number): (max: number) => number {
  let state = seed;

  return (max: number) => {
    state = (state * 1103515245 + 12345) % 2147483648;

    return state % max;
  };
}

// ---------------------------------------------------------------------------
// 通貨テーブル
// ---------------------------------------------------------------------------

describe("currencies", () => {
  it("ISO 4217 の桁数を自前のテーブルから返す", () => {
    expect(currencyDigits("JPY")).toBe(0);
    expect(currencyDigits("USD")).toBe(2);
    expect(currencyDigits("KRW")).toBe(0);
    expect(currencyDigits("KWD")).toBe(3);
    expect(currencyDigits("VND")).toBe(0);
  });

  it("実在しない通貨コードを弾く", () => {
    expect(isCurrencyCode("USD")).toBe(true);
    expect(isCurrencyCode("XXX")).toBe(false);
    expect(isCurrencyCode("usd")).toBe(false);
    expect(() => currencyDigits("ABC")).toThrow();
  });
});

// ---------------------------------------------------------------------------
// 10進数の扱い
// ---------------------------------------------------------------------------

describe("decimal", () => {
  it("四捨五入は 0.5 を切り上げる", () => {
    expect(divRoundHalfUp(5n, 10n)).toBe(1n);
    expect(divRoundHalfUp(4n, 10n)).toBe(0n);
    expect(divRoundHalfUp(15n, 10n)).toBe(2n);
    expect(divRoundHalfUp(25n, 10n)).toBe(3n); // 銀行丸めではない
  });

  it("レートを 10^10 倍の整数にする", () => {
    expect(parseRateToScaled("152.3456")).toBe(1523456000000n);
    expect(parseRateToScaled("1")).toBe(10000000000n);
    expect(parseRateToScaled("0.0061642")).toBe(61642000n);
  });

  it("API が返しうる指数表記のレートも扱える", () => {
    expect(normalizeRateString("6.1642e-3")).toBe("0.0061642");
    expect(normalizeRateString("1.5E2")).toBe("150");
  });

  it("小数第11位以下は四捨五入する", () => {
    expect(normalizeRateString("0.00000000005")).toBe("0.0000000001");
    expect(normalizeRateString("1.00000000004")).toBe("1");
  });

  it("0 以下や不正なレートは null", () => {
    expect(parseRateToScaled("0")).toBeNull();
    expect(parseRateToScaled("-1")).toBeNull();
    expect(parseRateToScaled("abc")).toBeNull();
    expect(parseRateToScaled(".")).toBeNull();
    expect(parseRateToScaled("1e999")).toBeNull();
  });

  it("金額の入力を最小単位の整数にする", () => {
    expect(parseAmountToMinor("12.34", 2)).toEqual({ ok: true, minor: 1234n });
    expect(parseAmountToMinor("12", 2)).toEqual({ ok: true, minor: 1200n });
    expect(parseAmountToMinor("12.340", 2)).toEqual({ ok: true, minor: 1234n });
    expect(parseAmountToMinor("1,000", 0)).toEqual({ ok: true, minor: 1000n });
    expect(parseAmountToMinor("１２．５", 2)).toEqual({ ok: true, minor: 1250n }); // 全角
    expect(parseAmountToMinor("1.234", 3)).toEqual({ ok: true, minor: 1234n });
  });

  it("金額の入力エラー", () => {
    expect(parseAmountToMinor("", 2)).toEqual({ ok: false, error: "empty" });
    expect(parseAmountToMinor("abc", 2)).toEqual({ ok: false, error: "invalid" });
    expect(parseAmountToMinor("1e3", 2)).toEqual({ ok: false, error: "invalid" });
    expect(parseAmountToMinor("1.234", 2)).toEqual({ ok: false, error: "too_many_decimals" });
    expect(parseAmountToMinor("10.5", 0)).toEqual({ ok: false, error: "too_many_decimals" });
    expect(parseAmountToMinor("0", 0)).toEqual({ ok: false, error: "not_positive" });
  });
});

// ---------------------------------------------------------------------------
// 円への換算
// ---------------------------------------------------------------------------

describe("convertToJpy", () => {
  it("USD 12.34 をレート 152.3456 で換算すると 1880 円（1879.944… の四捨五入）", () => {
    expect(convertToJpy(1234n, "USD", "152.3456")).toBe(1880n);
  });

  it("ちょうど 0.5 円は切り上げる", () => {
    // USD 0.01 × 50 = 0.5 円 → 1 円
    expect(convertToJpy(1n, "USD", "50")).toBe(1n);
    // USD 0.01 × 49.99 = 0.4999 円 → 0 円
    expect(convertToJpy(1n, "USD", "49.99")).toBe(0n);
  });

  it("KWD（3 桁）の換算", () => {
    // KWD 1.234 × 512.05 = 631.8697 → 632 円
    expect(convertToJpy(1234n, "KWD", "512.05")).toBe(632n);
    // KWD 0.001 × 500 = 0.5 → 1 円
    expect(convertToJpy(1n, "KWD", "500")).toBe(1n);
  });

  it("KRW（0 桁）の換算", () => {
    // KRW 12,345 × 0.10835 = 1337.60075 → 1338 円
    expect(convertToJpy(12345n, "KRW", "0.10835")).toBe(1338n);
    // KRW 10,000 × 0.1083 = 1083 円
    expect(convertToJpy(10000n, "KRW", "0.1083")).toBe(1083n);
  });

  it("VND のように 1 未満で桁の多いレート", () => {
    // VND 250,000 × 0.0061642 = 1541.05 → 1541 円
    expect(convertToJpy(250000n, "VND", "0.0061642")).toBe(1541n);
  });

  it("JPY はレート 1 でそのまま", () => {
    expect(convertToJpy(7617n, "JPY", "1")).toBe(7617n);
  });

  it("大きな金額でも誤差が出ない", () => {
    // number だと誤差が出る桁: USD 9,999,999,999.99 × 152.3456
    expect(convertToJpy(999999999999n, "USD", "152.3456")).toBe(1523455999998n);
  });
});

// ---------------------------------------------------------------------------
// 割り勘の分割
// ---------------------------------------------------------------------------

describe("splitEvenly", () => {
  it("1000 円を 3 人で割ると 334 / 333 / 333", () => {
    const shares = splitEvenly(1000n, ["a", "b", "c"]);

    expect([...shares.values()]).toEqual([334n, 333n, 333n]);
  });

  it("端数は並び順の先頭から 1 円ずつ", () => {
    const shares = splitEvenly(1001n, ["a", "b", "c"]);

    expect(shares.get("a")).toBe(334n);
    expect(shares.get("b")).toBe(334n);
    expect(shares.get("c")).toBe(333n);
  });

  it("分割した合計は必ず元の額と一致する", () => {
    const random = createRandom(42);

    for (let n = 0; n < 500; n += 1) {
      const total = BigInt(random(1_000_000));
      const people = Array.from({ length: 1 + random(10) }, (_, i) => `m${i}`);
      const shares = splitEvenly(total, people);
      const sum = [...shares.values()].reduce((a, b) => a + b, 0n);

      expect(sum).toBe(total);
    }
  });

  it("負担する人がいないとエラー", () => {
    expect(() => splitEvenly(100n, [])).toThrow();
  });
});

// ---------------------------------------------------------------------------
// 精算
// ---------------------------------------------------------------------------

describe("computeBalances / computeTransfers", () => {
  const members = ["a", "b", "c"];

  it("負担する人が一部だけの支払い", () => {
    const payments: SettlementPayment[] = [
      // a が 3000 円を払い、a と b だけで割る（c は対象外）
      { payerId: "a", amountJpy: 3000n, participantIds: ["a", "b"] },
    ];

    const balances = computeBalances(members, payments);

    expect(balances).toEqual([
      { memberId: "a", paid: 3000n, owed: 1500n, balance: 1500n },
      { memberId: "b", paid: 0n, owed: 1500n, balance: -1500n },
      { memberId: "c", paid: 0n, owed: 0n, balance: 0n },
    ]);

    expect(computeTransfers(balances)).toEqual([{ fromId: "b", toId: "a", amount: 1500n }]);
  });

  it("負担する人の端数は、入力順ではなくメンバーの並び順で割り振る", () => {
    const payments: SettlementPayment[] = [{ payerId: "a", amountJpy: 100n, participantIds: ["c", "b", "a"] }];

    const balances = computeBalances(members, payments);

    expect(balances.map((b) => b.owed)).toEqual([34n, 33n, 33n]);
  });

  it("全員の差額の合計が 0 になる", () => {
    const random = createRandom(7);

    for (let round = 0; round < 200; round += 1) {
      const ids = Array.from({ length: 2 + random(8) }, (_, i) => `m${i}`);
      const payments: SettlementPayment[] = Array.from({ length: random(15) }, () => {
        const participants = ids.filter(() => random(3) > 0);

        return {
          payerId: ids[random(ids.length)]!,
          amountJpy: BigInt(1 + random(100_000)),
          participantIds: participants.length > 0 ? participants : [ids[0]!],
        };
      });

      const balances = computeBalances(ids, payments);
      const sum = balances.reduce((acc, b) => acc + b.balance, 0n);

      expect(sum).toBe(0n);
    }
  });

  it("精算結果の送金をすべて反映すると、全員の差額が 0 になる", () => {
    const random = createRandom(2026);

    for (let round = 0; round < 200; round += 1) {
      const ids = Array.from({ length: 2 + random(8) }, (_, i) => `m${i}`);
      const payments: SettlementPayment[] = Array.from({ length: 1 + random(15) }, () => ({
        payerId: ids[random(ids.length)]!,
        amountJpy: BigInt(1 + random(100_000)),
        participantIds: ids.filter((_, i) => i === 0 || random(2) === 0),
      }));

      const balances = computeBalances(ids, payments);
      const transfers = computeTransfers(balances);
      const after = applyTransfers(balances, transfers);

      for (const value of after.values()) {
        expect(value).toBe(0n);
      }

      // 送金回数は「差額が 0 でない人の数 − 1」以下
      const nonZero = balances.filter((b) => b.balance !== 0n).length;

      expect(transfers.length).toBeLessThanOrEqual(Math.max(0, nonZero - 1));

      // 送金額はすべて正
      for (const t of transfers) {
        expect(t.amount > 0n).toBe(true);
      }
    }
  });

  it("額の大きい人どうしから順に送金する", () => {
    const balances: MemberBalance[] = [
      { memberId: "a", paid: 0n, owed: 0n, balance: 5000n },
      { memberId: "b", paid: 0n, owed: 0n, balance: -1000n },
      { memberId: "c", paid: 0n, owed: 0n, balance: -4000n },
    ];

    expect(computeTransfers(balances)).toEqual([
      { fromId: "c", toId: "a", amount: 4000n },
      { fromId: "b", toId: "a", amount: 1000n },
    ]);
  });

  it("差額の合計が 0 でなければエラー", () => {
    expect(() =>
      computeTransfers([{ memberId: "a", paid: 1n, owed: 0n, balance: 1n }]),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// 表示
// ---------------------------------------------------------------------------

describe("format", () => {
  it("円と外貨の表示", () => {
    expect(formatJpy(7617n)).toBe("¥7,617");
    expect(formatJpy(1234567)).toBe("¥1,234,567");
    expect(formatJpy(-500n)).toBe("-¥500");
    expect(formatForeign(5000n, "USD")).toBe("USD 50.00");
    expect(formatForeign(1234567n, "KRW")).toBe("KRW 1,234,567");
    expect(formatForeign(1234n, "KWD")).toBe("KWD 1.234");
  });

  it("入力欄に戻す金額", () => {
    expect(minorToInputString(5000n, "USD")).toBe("50");
    expect(minorToInputString(1230n, "USD")).toBe("12.3");
    expect(minorToInputString(1000n, "JPY")).toBe("1000");
  });
});
