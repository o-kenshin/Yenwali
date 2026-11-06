import "server-only";

import { isCurrencyCode } from "@/lib/money";
import { parseExchangeRateApiResponse, parseFrankfurterResponse, type ParsedRate } from "@/lib/rates/parse";
import type { RateQuote } from "@/lib/types";

import { isFakeRatesEnabled } from "./env";

/**
 * 為替レートの取得（サーバー側だけで行う）
 *
 * 1. Frankfurter（ECB などの参考レート）
 * 2. 失敗したら ExchangeRate-API の Open Access
 * 3. どちらも失敗したら null（画面は手動入力に切り替わる）
 *
 * 取れたレートは通貨ごとに 1 時間キャッシュする。
 * どちらも 1 日 1 回更新の参考レート（仲値）で、リアルタイムのレートではない。
 */

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 時間
const FETCH_TIMEOUT_MS = 5000;

type CacheEntry = { quote: RateQuote; expiresAt: number };

// サーバーのインスタンスごとのメモリキャッシュ
const globalForRates = globalThis as typeof globalThis & { __yenwaliRateCache?: Map<string, CacheEntry> };
const cache = (globalForRates.__yenwaliRateCache ??= new Map());

/** 日本時間の今日の日付（YYYY-MM-DD） */
export function todayInTokyo(now: Date = new Date()): string {
  // 日本は夏時間がないので +9 時間で求められる
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * 1 通貨あたり何円かを取得する。取得できなければ null。
 */
export async function getRateToJpy(currency: string): Promise<RateQuote | null> {
  if (!isCurrencyCode(currency)) {
    return null;
  }

  // 円はレート 1 で固定
  if (currency === "JPY") {
    const now = new Date();

    return { currency, rate: "1", source: "identity", rateDate: todayInTokyo(now), fetchedAt: now.toISOString() };
  }

  const cached = cache.get(currency);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.quote;
  }

  const quote = isFakeRatesEnabled() ? fakeRate(currency) : await fetchFromSources(currency);

  if (quote) {
    cache.set(currency, { quote, expiresAt: Date.now() + CACHE_TTL_MS });
  }

  return quote;
}

/** 2 つのソースを順に試す */
async function fetchFromSources(currency: string): Promise<RateQuote | null> {
  const frankfurter = await fetchText(`https://api.frankfurter.dev/v2/rate/${currency}/jpy`).then((body) =>
    body ? parseFrankfurterResponse(body, currency) : null,
  );

  if (frankfurter) {
    return toQuote(currency, frankfurter, "frankfurter");
  }

  const erApi = await fetchText(`https://open.er-api.com/v6/latest/${currency}`).then((body) =>
    body ? parseExchangeRateApiResponse(body, currency) : null,
  );

  if (erApi) {
    return toQuote(currency, erApi, "exchangerate-api");
  }

  return null;
}

function toQuote(currency: string, parsed: ParsedRate, source: RateQuote["source"]): RateQuote {
  return { currency, rate: parsed.rate, rateDate: parsed.rateDate, source, fetchedAt: new Date().toISOString() };
}

/** 失敗（ネットワークエラー・タイムアウト・2xx 以外）は null */
async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      cache: "no-store", // キャッシュは自前で持つ
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      return null;
    }

    return await res.text();
  } catch {
    return null;
  }
}

// -----------------------------------------------------------------------------
// E2E テスト用の固定レート（YENWALI_FAKE_RATES=1 のとき）
// ここにない通貨は「取得失敗」として扱い、手動入力への切り替えを試せるようにする。
// -----------------------------------------------------------------------------

const FAKE_RATES: Record<string, string> = {
  USD: "152.34",
  EUR: "165.5",
  KRW: "0.1083",
  TWD: "4.71",
  THB: "4.45",
  KWD: "496.12",
};

function fakeRate(currency: string): RateQuote | null {
  const rate = FAKE_RATES[currency];

  if (!rate) {
    return null;
  }

  return {
    currency,
    rate,
    // KWD だけ予備のソース扱いにして、出典表示（フッターのリンク）を E2E で確かめられるようにする
    source: currency === "KWD" ? "exchangerate-api" : "frankfurter",
    rateDate: todayInTokyo(),
    fetchedAt: new Date().toISOString(),
  };
}
