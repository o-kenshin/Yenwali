/**
 * 金額・レートの表示用フォーマット（計算はしない）
 */

import { currencyDigits } from "./currencies";
import { formatScaledInteger } from "./decimal";

/** 整数部分に 3 桁ごとのカンマを入れる（"1234567.89" → "1,234,567.89"） */
function addThousandsSeparators(decimal: string): string {
  const [intPart = "", fracPart] = decimal.split(".");
  const negative = intPart.startsWith("-");
  const digits = negative ? intPart.slice(1) : intPart;

  const withCommas = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const body = fracPart !== undefined ? `${withCommas}.${fracPart}` : withCommas;

  return negative ? `-${body}` : body;
}

/** 円の額を "¥7,617" の形にする */
export function formatJpy(amount: bigint | number): string {
  const value = typeof amount === "bigint" ? amount : BigInt(amount);

  if (value < 0n) {
    return `-¥${addThousandsSeparators((-value).toString())}`;
  }

  return `¥${addThousandsSeparators(value.toString())}`;
}

/** 円の額を "7,617" の形にする（"円" を後ろにつけたい表示用） */
export function formatJpyNumber(amount: bigint | number): string {
  const value = typeof amount === "bigint" ? amount : BigInt(amount);

  return addThousandsSeparators(value.toString());
}

/** 外貨の額を "USD 50.00" の形にする */
export function formatForeign(amountMinor: bigint | number, currency: string): string {
  const value = typeof amountMinor === "bigint" ? amountMinor : BigInt(amountMinor);
  const body = formatScaledInteger(value, currencyDigits(currency));

  return `${currency} ${addThousandsSeparators(body)}`;
}

/** 入力欄に戻すための金額の文字列（カンマなし。"50.00" → "50"、"12.30" → "12.3"） */
export function minorToInputString(amountMinor: bigint | number, currency: string): string {
  const value = typeof amountMinor === "bigint" ? amountMinor : BigInt(amountMinor);

  return formatScaledInteger(value, currencyDigits(currency), { trimZeros: true });
}

/** レートを表示用にする（"152.3456" → "152.3456"、"1234.5" → "1,234.5"） */
export function formatRate(rate: string): string {
  return addThousandsSeparators(rate);
}

/** "2026-11-06" → "11月6日" */
export function formatMonthDay(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);

  if (!match) {
    return isoDate;
  }

  return `${Number(match[2])}月${Number(match[3])}日`;
}
