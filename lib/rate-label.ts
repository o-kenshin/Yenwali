/**
 * レートの表示用の文言
 */

import { formatMonthDay, formatRate } from "@/lib/money";
import type { RateSource } from "@/lib/types";

/** "1 USD = 152.34 円" */
export function rateEquation(currency: string, rate: string): string {
  return `1 ${currency} = ${formatRate(rate)} 円`;
}

/** "11月6日時点の参考レート" / 手動のときは "手動で入力したレート" */
export function rateDateLabel(source: RateSource, rateDate: string): string {
  if (source === "manual") {
    return "手動で入力したレート";
  }

  return `${formatMonthDay(rateDate)}時点の参考レート`;
}

/** 取得元の表示名 */
export function rateSourceName(source: RateSource): string {
  switch (source) {
    case "frankfurter":
      return "Frankfurter";
    case "exchangerate-api":
      return "ExchangeRate-API";
    case "manual":
      return "手動";
    case "identity":
      return "日本円";
  }
}
