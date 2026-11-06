/**
 * 通貨テーブル（ISO 4217）
 *
 * - 小数点以下の桁数（minor unit）は Intl.NumberFormat に頼らず、ここで自前で持つ。
 *   ブラウザや Node のバージョンによって Intl の結果が変わることを避けるため。
 * - 基金通貨（CLF, UYI など）や貴金属（XAU など）は、旅行の支払いで使わないので含めない。
 */

export type CurrencyInfo = {
  /** ISO 4217 の3文字コード */
  code: string;
  /** 小数点以下の桁数（JPY=0, USD=2, KWD=3 など） */
  digits: number;
  /** 画面に出す日本語名（ないものはコードだけ表示する） */
  nameJa?: string;
};

/**
 * よく使う通貨。通貨選択の上のほうに、この順で出す。
 */
export const POPULAR_CURRENCY_CODES = [
  "JPY",
  "USD",
  "EUR",
  "KRW",
  "TWD",
  "THB",
  "GBP",
  "AUD",
  "SGD",
  "HKD",
  "CNY",
  "VND",
  "PHP",
  "MYR",
  "IDR",
  "CAD",
  "NZD",
  "CHF",
] as const;

/**
 * 通貨の一覧。
 * 形式: [コード, 桁数, 日本語名?]
 */
const RAW_CURRENCIES: ReadonlyArray<readonly [string, number, string?]> = [
  ["AED", 2, "UAEディルハム"],
  ["AFN", 2],
  ["ALL", 2],
  ["AMD", 2],
  ["ANG", 2],
  ["AOA", 2],
  ["ARS", 2, "アルゼンチンペソ"],
  ["AUD", 2, "豪ドル"],
  ["AWG", 2],
  ["AZN", 2],
  ["BAM", 2],
  ["BBD", 2],
  ["BDT", 2],
  ["BGN", 2],
  ["BHD", 3, "バーレーンディナール"],
  ["BIF", 0],
  ["BMD", 2],
  ["BND", 2, "ブルネイドル"],
  ["BOB", 2],
  ["BRL", 2, "ブラジルレアル"],
  ["BSD", 2],
  ["BTN", 2],
  ["BWP", 2],
  ["BYN", 2],
  ["BZD", 2],
  ["CAD", 2, "カナダドル"],
  ["CDF", 2],
  ["CHF", 2, "スイスフラン"],
  ["CLP", 0, "チリペソ"],
  ["CNY", 2, "人民元"],
  ["COP", 2, "コロンビアペソ"],
  ["CRC", 2],
  ["CUP", 2],
  ["CVE", 2],
  ["CZK", 2, "チェココルナ"],
  ["DJF", 0],
  ["DKK", 2, "デンマーククローネ"],
  ["DOP", 2],
  ["DZD", 2],
  ["EGP", 2, "エジプトポンド"],
  ["ERN", 2],
  ["ETB", 2],
  ["EUR", 2, "ユーロ"],
  ["FJD", 2, "フィジードル"],
  ["FKP", 2],
  ["GBP", 2, "英ポンド"],
  ["GEL", 2],
  ["GHS", 2],
  ["GIP", 2],
  ["GMD", 2],
  ["GNF", 0],
  ["GTQ", 2],
  ["GYD", 2],
  ["HKD", 2, "香港ドル"],
  ["HNL", 2],
  ["HTG", 2],
  ["HUF", 2, "ハンガリーフォリント"],
  ["IDR", 2, "インドネシアルピア"],
  ["ILS", 2, "イスラエルシェケル"],
  ["INR", 2, "インドルピー"],
  ["IQD", 3],
  ["IRR", 2],
  ["ISK", 0, "アイスランドクローナ"],
  ["JMD", 2],
  ["JOD", 3, "ヨルダンディナール"],
  ["JPY", 0, "日本円"],
  ["KES", 2],
  ["KGS", 2],
  ["KHR", 2, "カンボジアリエル"],
  ["KMF", 0],
  ["KPW", 2],
  ["KRW", 0, "韓国ウォン"],
  ["KWD", 3, "クウェートディナール"],
  ["KYD", 2],
  ["KZT", 2],
  ["LAK", 2, "ラオスキープ"],
  ["LBP", 2],
  ["LKR", 2, "スリランカルピー"],
  ["LRD", 2],
  ["LSL", 2],
  ["LYD", 3],
  ["MAD", 2, "モロッコディルハム"],
  ["MDL", 2],
  ["MGA", 2],
  ["MKD", 2],
  ["MMK", 2, "ミャンマーチャット"],
  ["MNT", 2, "モンゴルトゥグルグ"],
  ["MOP", 2, "マカオパタカ"],
  ["MRU", 2],
  ["MUR", 2],
  ["MVR", 2, "モルディブルフィヤ"],
  ["MWK", 2],
  ["MXN", 2, "メキシコペソ"],
  ["MYR", 2, "マレーシアリンギット"],
  ["MZN", 2],
  ["NAD", 2],
  ["NGN", 2],
  ["NIO", 2],
  ["NOK", 2, "ノルウェークローネ"],
  ["NPR", 2, "ネパールルピー"],
  ["NZD", 2, "NZドル"],
  ["OMR", 3, "オマーンリアル"],
  ["PAB", 2],
  ["PEN", 2, "ペルーソル"],
  ["PGK", 2],
  ["PHP", 2, "フィリピンペソ"],
  ["PKR", 2],
  ["PLN", 2, "ポーランドズウォティ"],
  ["PYG", 0],
  ["QAR", 2, "カタールリヤル"],
  ["RON", 2],
  ["RSD", 2],
  ["RUB", 2],
  ["RWF", 0],
  ["SAR", 2, "サウジリヤル"],
  ["SBD", 2],
  ["SCR", 2],
  ["SDG", 2],
  ["SEK", 2, "スウェーデンクローナ"],
  ["SGD", 2, "シンガポールドル"],
  ["SHP", 2],
  ["SLE", 2],
  ["SOS", 2],
  ["SRD", 2],
  ["SSP", 2],
  ["STN", 2],
  ["SVC", 2],
  ["SYP", 2],
  ["SZL", 2],
  ["THB", 2, "タイバーツ"],
  ["TJS", 2],
  ["TMT", 2],
  ["TND", 3],
  ["TOP", 2],
  ["TRY", 2, "トルコリラ"],
  ["TTD", 2],
  ["TWD", 2, "台湾ドル"],
  ["TZS", 2],
  ["UAH", 2],
  ["UGX", 0],
  ["USD", 2, "米ドル"],
  ["UYU", 2],
  ["UZS", 2],
  ["VES", 2],
  ["VND", 0, "ベトナムドン"],
  ["VUV", 0],
  ["WST", 2],
  ["XAF", 0],
  ["XCD", 2],
  ["XCG", 2],
  ["XOF", 0],
  ["XPF", 0],
  ["YER", 2],
  ["ZAR", 2, "南アフリカランド"],
  ["ZMW", 2],
  ["ZWG", 2],
];

/** コード → 通貨情報 */
const CURRENCY_MAP: ReadonlyMap<string, CurrencyInfo> = new Map(
  RAW_CURRENCIES.map(([code, digits, nameJa]) => [code, { code, digits, nameJa }]),
);

/** 実在する通貨コードか（大文字の3文字のみ受け付ける） */
export function isCurrencyCode(code: string): boolean {
  return CURRENCY_MAP.has(code);
}

/** 通貨情報を取得する。存在しないコードはエラー。 */
export function getCurrency(code: string): CurrencyInfo {
  const info = CURRENCY_MAP.get(code);

  if (!info) {
    throw new Error(`Unknown currency code: ${code}`);
  }

  return info;
}

/** 小数点以下の桁数 */
export function currencyDigits(code: string): number {
  return getCurrency(code).digits;
}

/**
 * 通貨選択に出す順番の一覧。
 * よく使う通貨を先に、残りはコードのアルファベット順。
 */
export function listCurrenciesForPicker(): { popular: CurrencyInfo[]; others: CurrencyInfo[] } {
  const popularSet = new Set<string>(POPULAR_CURRENCY_CODES);

  const popular = POPULAR_CURRENCY_CODES.map((code) => getCurrency(code));

  const others = RAW_CURRENCIES.map(([code]) => getCurrency(code)).filter(
    (c) => !popularSet.has(c.code),
  );

  return { popular, others };
}
