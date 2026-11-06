/**
 * 外貨 → 日本円の換算
 *
 * jpy = 四捨五入( amount_minor × rate ÷ 10^桁数 )
 *
 * レートは 10^10 倍した整数で扱うので、実際の式は
 *   jpy = 四捨五入( amount_minor × rateScaled ÷ (10^桁数 × 10^10) )
 * になる。すべて BigInt で計算し、浮動小数点は使わない。
 */

import { currencyDigits } from "./currencies";
import { divRoundHalfUp, parseRateToScaled, pow10, RATE_SCALE } from "./decimal";

/**
 * 外貨の金額（最小単位の整数）を円に換算する。
 *
 * @param amountMinor 通貨の最小単位の整数（USD 12.34 なら 1234n）
 * @param currency    ISO 4217 の通貨コード
 * @param rate        1 通貨あたり何円か（10進数の文字列）
 * @returns 1円単位に四捨五入した円の額
 */
export function convertToJpy(amountMinor: bigint, currency: string, rate: string): bigint {
  if (amountMinor < 0n) {
    throw new Error("convertToJpy: amount must be >= 0");
  }

  const rateScaled = parseRateToScaled(rate);

  if (rateScaled === null) {
    throw new Error(`convertToJpy: invalid rate "${rate}"`);
  }

  const digits = currencyDigits(currency);
  const denominator = pow10(digits) * RATE_SCALE;

  return divRoundHalfUp(amountMinor * rateScaled, denominator);
}
