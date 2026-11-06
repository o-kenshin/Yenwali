import { describe, expect, it } from "vitest";

import { buildSettlementText } from "./settlement-text";
import type { GroupSnapshot } from "./types";

const base: GroupSnapshot = {
  group: { id: "abcdefghijklmnopqrstu", name: "台湾旅行" },
  members: [
    { id: "a", name: "あおい" },
    { id: "b", name: "ひろ" },
  ],
  payments: [],
  totalJpy: 0,
  balances: [],
  transfers: [],
  lastCurrency: "JPY",
  usesExchangeRateApi: false,
};

describe("buildSettlementText", () => {
  it("LINE に貼れる形にする", () => {
    const text = buildSettlementText(
      { ...base, totalJpy: 7617, transfers: [{ fromId: "b", toId: "a", amount: 3808 }] },
      "https://example.com/g/abcdefghijklmnopqrstu",
    );

    expect(text).toBe(
      [
        "【台湾旅行】の精算",
        "",
        "ひろ → あおい：¥3,808",
        "",
        "合計：¥7,617（0件）",
        "",
        "くわしくはこちら",
        "https://example.com/g/abcdefghijklmnopqrstu",
      ].join("\n"),
    );
  });

  it("送金がなければそう書く", () => {
    expect(buildSettlementText(base, "https://example.com")).toContain("精算は必要ありません");
  });
});
