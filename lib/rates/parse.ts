/**
 * 為替 API のレスポンスの解析（純粋関数）
 *
 * JSON.parse すると数値が浮動小数点になって桁が落ちるおそれがあるので、
 * レートの数値は「レスポンスの生の文字列」から正規表現で取り出し、10進数の文字列のまま扱う。
 */

import { normalizeRateString } from "@/lib/money";

export type ParsedRate = {
  /** 正規化済みの10進数の文字列 */
  rate: string;
  /** YYYY-MM-DD */
  rateDate: string;
};

/** JSON の数値リテラル */
const NUMBER_PATTERN = "(-?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)";

/**
 * Frankfurter v2: GET https://api.frankfurter.dev/v2/rate/{FROM}/jpy
 *
 * 実際のレスポンス（2026-11-06 に確認）:
 *   {"date":"2026-11-06","base":"USD","quote":"JPY","rate":158.28}
 * 存在しない通貨は HTTP 422: {"status":422,"message":"invalid currency: XXX"}
 */
export function parseFrankfurterResponse(body: string, from: string): ParsedRate | null {
  const json = safeJson(body);

  if (!json || typeof json !== "object") {
    return null;
  }

  const obj = json as Record<string, unknown>;

  // 頼んだ通貨のレートかどうかを確かめる
  if (obj.base !== from || obj.quote !== "JPY") {
    return null;
  }

  const date = typeof obj.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(obj.date) ? obj.date : null;
  const rawRate = new RegExp(`"rate"\\s*:\\s*${NUMBER_PATTERN}`).exec(body)?.[1];
  const rate = rawRate ? normalizeRateString(rawRate) : null;

  if (!date || !rate) {
    return null;
  }

  return { rate, rateDate: date };
}

/**
 * ExchangeRate-API Open Access: GET https://open.er-api.com/v6/latest/{FROM}
 *
 * 必要な部分だけ:
 *   {"result":"success","time_last_update_unix":1793923351,"base_code":"USD","rates":{"USD":1,...,"JPY":158.2,...}}
 */
export function parseExchangeRateApiResponse(body: string, from: string): ParsedRate | null {
  const json = safeJson(body);

  if (!json || typeof json !== "object") {
    return null;
  }

  const obj = json as Record<string, unknown>;

  if (obj.result !== "success" || obj.base_code !== from) {
    return null;
  }

  const updatedUnix = obj.time_last_update_unix;

  if (typeof updatedUnix !== "number" || !Number.isFinite(updatedUnix)) {
    return null;
  }

  // "rates": { ... } の中だけから JPY を探す（base_code など他の場所の "JPY" を拾わないため）
  const ratesBlock = /"rates"\s*:\s*\{([^}]*)\}/.exec(body)?.[1];
  const rawRate = ratesBlock ? new RegExp(`"JPY"\\s*:\\s*${NUMBER_PATTERN}`).exec(ratesBlock)?.[1] : undefined;
  const rate = rawRate ? normalizeRateString(rawRate) : null;

  if (!rate) {
    return null;
  }

  // 更新時刻（UTC）の日付をレートの日付とする
  const rateDate = new Date(updatedUnix * 1000).toISOString().slice(0, 10);

  return { rate, rateDate };
}

function safeJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}
