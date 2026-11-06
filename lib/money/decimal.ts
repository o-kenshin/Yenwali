/**
 * 10進数の文字列と整数（BigInt）の変換。
 *
 * お金の計算では浮動小数点（number の小数）を一切使わない。
 * - 金額 … 通貨の最小単位の整数（例: USD 12.34 → 1234）
 * - レート … 10^10 倍した BigInt（例: 152.3456 → 1523456000000n）
 */

/** レートを整数として扱うときの小数桁数 */
export const RATE_SCALE_DIGITS = 10;

/** レートを整数として扱うときの倍率（10^10） */
export const RATE_SCALE = 10n ** BigInt(RATE_SCALE_DIGITS);

/** 指数表記の上限（"1e999999" のような巨大な値で BigInt が暴走しないように） */
const MAX_EXPONENT = 30;

/** 10 の n 乗（BigInt） */
export function pow10(n: number): bigint {
  return 10n ** BigInt(n);
}

/**
 * 割り算をして四捨五入する（0.5 は切り上げ）。
 * 非負の値だけを扱う（このアプリの金額・レートは常に 0 以上）。
 */
export function divRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (numerator < 0n || denominator <= 0n) {
    throw new Error("divRoundHalfUp: numerator must be >= 0 and denominator > 0");
  }

  const quotient = numerator / denominator;
  const remainder = numerator % denominator;

  // 余りが割る数の半分以上なら切り上げ（ちょうど半分も切り上げ）
  return remainder * 2n >= denominator ? quotient + 1n : quotient;
}

/**
 * 入力のゆらぎを整える。
 * - 全角数字・全角ピリオド → 半角
 * - 桁区切りのカンマ・空白を取り除く
 */
export function normalizeNumericInput(input: string): string {
  return input
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/[．。]/g, ".")
    .replace(/[,，\s]/g, "");
}

/**
 * 10進数の文字列を分解した結果。
 * value = mantissa × 10^(-scale)
 */
type ParsedDecimal = {
  mantissa: bigint;
  scale: number;
};

/**
 * 0 以上の10進数の文字列を分解する。
 * "152.34" や API が返しうる指数表記 "6.1642e-3" も受け付ける。
 * 解釈できない場合は null。
 */
function parseDecimal(input: string): ParsedDecimal | null {
  const match = /^(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(input);

  if (!match) {
    return null;
  }

  const intPart = match[1] ?? "";
  const fracPart = match[2] ?? "";
  const exponent = match[3] ? Number.parseInt(match[3], 10) : 0;

  // 数字が1つもない（"." や "e5" など）は不正
  if (intPart.length + fracPart.length === 0) {
    return null;
  }

  if (Math.abs(exponent) > MAX_EXPONENT) {
    return null;
  }

  return {
    mantissa: BigInt(intPart + fracPart || "0"),
    scale: fracPart.length - exponent,
  };
}

/**
 * レートの文字列を 10^10 倍した BigInt にする。
 * 小数第11位以下は四捨五入する。0 以下や不正な文字列は null。
 */
export function parseRateToScaled(input: string): bigint | null {
  const parsed = parseDecimal(normalizeNumericInput(input));

  if (!parsed) {
    return null;
  }

  const { mantissa, scale } = parsed;

  // mantissa × 10^(10 - scale) を求める
  const shift = RATE_SCALE_DIGITS - scale;
  const scaled = shift >= 0 ? mantissa * pow10(shift) : divRoundHalfUp(mantissa, pow10(-shift));

  return scaled > 0n ? scaled : null;
}

/**
 * 10^10 倍したレートを、末尾の 0 を取った10進数の文字列に戻す。
 * 例: 1523456000000n → "152.3456"
 */
export function scaledRateToString(scaled: bigint): string {
  return formatScaledInteger(scaled, RATE_SCALE_DIGITS, { trimZeros: true });
}

/**
 * レートの文字列を正規化する（DB に保存する形）。
 * 例: "6.1642e-3" → "0.0061642"、"152.340" → "152.34"
 */
export function normalizeRateString(input: string): string | null {
  const scaled = parseRateToScaled(input);

  return scaled === null ? null : scaledRateToString(scaled);
}

/** 金額の入力を解釈した結果 */
export type ParseAmountResult =
  | { ok: true; minor: bigint }
  | { ok: false; error: "empty" | "invalid" | "too_many_decimals" | "not_positive" };

/**
 * 画面で入力された金額（"12.34" など）を、通貨の最小単位の整数にする。
 * 通貨の桁数より細かい入力（USD で "1.234" など）はエラーにする。
 */
export function parseAmountToMinor(input: string, digits: number): ParseAmountResult {
  const normalized = normalizeNumericInput(input);

  if (normalized === "") {
    return { ok: false, error: "empty" };
  }

  // 金額の入力では指数表記は受け付けない
  const match = /^(\d*)(?:\.(\d*))?$/.exec(normalized);

  if (!match || (match[1] ?? "") + (match[2] ?? "") === "") {
    return { ok: false, error: "invalid" };
  }

  const intPart = match[1] || "0";
  // 末尾の 0 は桁数チェックの対象外にする（"12.340" は USD でも OK）
  const fracPart = (match[2] ?? "").replace(/0+$/, "");

  if (fracPart.length > digits) {
    return { ok: false, error: "too_many_decimals" };
  }

  const minor = BigInt(intPart) * pow10(digits) + BigInt(fracPart.padEnd(digits, "0") || "0");

  if (minor <= 0n) {
    return { ok: false, error: "not_positive" };
  }

  return { ok: true, minor };
}

/**
 * 整数を、指定した桁の小数として文字列にする。
 * 例: formatScaledInteger(1234n, 2) → "12.34"
 */
export function formatScaledInteger(
  value: bigint,
  digits: number,
  options: { trimZeros?: boolean } = {},
): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;

  const base = pow10(digits);
  const intPart = (abs / base).toString();
  let fracPart = digits > 0 ? (abs % base).toString().padStart(digits, "0") : "";

  if (options.trimZeros) {
    fracPart = fracPart.replace(/0+$/, "");
  }

  const body = fracPart ? `${intPart}.${fracPart}` : intPart;

  return negative ? `-${body}` : body;
}
