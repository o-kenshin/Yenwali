/**
 * サーバーとブラウザで共有する型
 *
 * 金額はすべて「整数」。サーバー側で上限（1兆）を検証しているので、
 * number でも誤差なく表せる（Number.MAX_SAFE_INTEGER ≒ 9000兆）。
 */

/** レートの取得元 */
export type RateSource = "frankfurter" | "exchangerate-api" | "manual" | "identity";

/** 為替レート 1 件（API から取ったもの） */
export type RateQuote = {
  currency: string;
  /** 1 通貨あたり何円か（10進数の文字列） */
  rate: string;
  source: Exclude<RateSource, "manual">;
  /** レートの日付（YYYY-MM-DD）。参考レートが何日のものか */
  rateDate: string;
  /** 取得した日時（ISO 8601） */
  fetchedAt: string;
};

export type MemberView = {
  id: string;
  name: string;
};

export type PaymentView = {
  id: string;
  title: string;
  payerId: string;
  /** 元の通貨の最小単位の整数 */
  amountMinor: number;
  currency: string;
  rateToJpy: string;
  rateSource: RateSource;
  rateDate: string;
  rateFetchedAt: string;
  amountJpy: number;
  paidOn: string;
  participantIds: string[];
  createdAt: string;
};

export type BalanceView = {
  memberId: string;
  paid: number;
  owed: number;
  balance: number;
};

export type TransferView = {
  fromId: string;
  toId: string;
  amount: number;
};

/** グループのページに必要なものを全部まとめたもの */
export type GroupSnapshot = {
  group: { id: string; name: string };
  members: MemberView[];
  /** 新しい順 */
  payments: PaymentView[];
  totalJpy: number;
  balances: BalanceView[];
  transfers: TransferView[];
  /** 最後に記録した支払いの通貨（なければ JPY）。新しい記録の通貨の初期値にする */
  lastCurrency: string;
  /** ExchangeRate-API のレートを使った支払いがあるか（出典表示のため） */
  usesExchangeRateApi: boolean;
};

/** Server Action の戻り値 */
export type ActionResult<T = null> =
  | { ok: true; data: T }
  | {
      ok: false;
      /** 画面に出すメッセージ */
      error: string;
      /** 画面の分岐に使うコード（"rate_unavailable" なら手動入力に切り替える など） */
      code?: string;
      /** 入力欄ごとのメッセージ */
      fieldErrors?: Record<string, string>;
    };

/** 立て替えの保存のときのレートの決め方 */
export type RateMode =
  /** サーバーで最新の参考レートを取る（新規・「最新レートで再計算」） */
  | { mode: "auto" }
  /** 保存済みのレートをそのまま使う（編集） */
  | { mode: "keep" }
  /** 手動で入力したレート */
  | { mode: "manual"; value: string };

/** 立て替えの保存の入力 */
export type PaymentInput = {
  groupId: string;
  /** null なら新規作成 */
  paymentId: string | null;
  title: string;
  payerId: string;
  /** 画面で入力した金額の文字列（"12.34" など） */
  amount: string;
  currency: string;
  participantIds: string[];
  /** YYYY-MM-DD */
  paidOn: string;
  rate: RateMode;
};
