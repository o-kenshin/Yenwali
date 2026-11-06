"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState, useTransition } from "react";

import { deletePaymentAction, savePaymentAction } from "@/app/actions";
import { LIMITS } from "@/lib/limits";
import {
  convertToJpy,
  currencyDigits,
  formatJpyNumber,
  listCurrenciesForPicker,
  minorToInputString,
  normalizeRateString,
  parseAmountToMinor,
} from "@/lib/money";
import { rateDateLabel, rateEquation } from "@/lib/rate-label";
import type { GroupSnapshot, PaymentInput, PaymentView, RateQuote, RateSource } from "@/lib/types";

import { SiteFooter } from "./site-footer";
import { Button, cx, FieldError, FieldLabel, INPUT_CLASS } from "./ui";

/**
 * 立て替えの記録・編集フォーム
 *
 * 項目は「内容・金額・立て替えた人・負担する人・日付」に「通貨」を 1 つ足しただけ。
 * 通貨が JPY のままなら、レートの表示は一切出ない。
 *
 * レートの決め方
 * - 新規: 最新の参考レート（auto）。取れなければ手動入力に切り替わる
 * - 編集: 保存済みのレートをそのまま使う（keep）。「最新レートで再計算」を押したときだけ取り直す
 * - いつでも手動で上書きできる（manual）
 */

type RateMode = "auto" | "keep" | "manual";

/** 画面で使うレート（プレビュー用） */
type EffectiveRate = { rate: string; source: RateSource; rateDate: string } | null;

const CURRENCIES = listCurrenciesForPicker();

/** ブラウザのタイムゾーンでの今日（YYYY-MM-DD） */
function todayLocal(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");

  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** サーバー（Route Handler）からレートを取る。失敗したら null */
async function fetchQuote(currency: string): Promise<RateQuote | null> {
  try {
    const res = await fetch(`/api/rate/${currency}`, { cache: "no-store" });

    return res.ok ? ((await res.json()) as RateQuote) : null;
  } catch {
    return null;
  }
}

export function PaymentForm({ snapshot, payment }: { snapshot: GroupSnapshot; payment?: PaymentView }) {
  const router = useRouter();
  const formId = useId();
  const groupId = snapshot.group.id;
  const isEdit = Boolean(payment);

  // ---------------------------------------------------------------------------
  // 入力の状態
  // ---------------------------------------------------------------------------
  const [title, setTitle] = useState(payment?.title ?? "");
  const [currency, setCurrency] = useState(payment?.currency ?? snapshot.lastCurrency);
  const [amount, setAmount] = useState(payment ? minorToInputString(payment.amountMinor, payment.currency) : "");
  const [payerId, setPayerId] = useState(payment?.payerId ?? snapshot.members[0]?.id ?? "");
  const [participantIds, setParticipantIds] = useState<string[]>(
    payment?.participantIds ?? snapshot.members.map((m) => m.id),
  );
  const [paidOn, setPaidOn] = useState(payment?.paidOn ?? todayLocal);

  const [rateMode, setRateMode] = useState<RateMode>(isEdit ? "keep" : "auto");
  const [manualRate, setManualRate] = useState("");

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isForeign = currency !== "JPY";

  // ---------------------------------------------------------------------------
  // 参考レートの取得（auto のときだけ）
  // 「どの通貨・何回目の取得の結果か」を一緒に持ち、今の入力と合わなければ取得中とみなす
  // ---------------------------------------------------------------------------
  const [quoteRequest, setQuoteRequest] = useState(0);
  const [quoteState, setQuoteState] = useState<{ currency: string; request: number; quote: RateQuote | null } | null>(
    null,
  );

  const needsQuote = isForeign && rateMode === "auto";

  useEffect(() => {
    if (!needsQuote) return;

    let cancelled = false;

    void fetchQuote(currency).then((quote) => {
      if (!cancelled) setQuoteState({ currency, request: quoteRequest, quote });
    });

    return () => {
      cancelled = true;
    };
  }, [needsQuote, currency, quoteRequest]);

  const quoteLoading = needsQuote && (quoteState?.currency !== currency || quoteState.request !== quoteRequest);
  const quote = needsQuote && !quoteLoading ? (quoteState?.quote ?? null) : null;
  const quoteFailed = needsQuote && !quoteLoading && quote === null;

  // 取得に失敗したら、手動入力に切り替える（エラーで保存できなくなる状態を作らない）
  const effectiveMode: RateMode = quoteFailed ? "manual" : rateMode;

  // ---------------------------------------------------------------------------
  // プレビューに使うレートと円換算額
  // ---------------------------------------------------------------------------
  let effectiveRate: EffectiveRate = null;

  if (isForeign) {
    if (effectiveMode === "keep" && payment) {
      effectiveRate = { rate: payment.rateToJpy, source: payment.rateSource, rateDate: payment.rateDate };
    } else if (effectiveMode === "auto" && quote) {
      effectiveRate = { rate: quote.rate, source: quote.source, rateDate: quote.rateDate };
    } else if (effectiveMode === "manual") {
      const normalized = normalizeRateString(manualRate);

      effectiveRate = normalized ? { rate: normalized, source: "manual", rateDate: paidOn } : null;
    }
  }

  const digits = currencyDigits(currency);
  const parsedAmount = parseAmountToMinor(amount, digits);
  const previewJpy =
    parsedAmount.ok && effectiveRate ? convertToJpy(parsedAmount.minor, currency, effectiveRate.rate) : null;

  // ---------------------------------------------------------------------------
  // 操作
  // ---------------------------------------------------------------------------

  function changeCurrency(next: string): void {
    setCurrency(next);
    setFieldErrors((prev) => ({ ...prev, amount: "", rate: "" }));

    // 編集で元の通貨に戻したなら保存済みのレート、それ以外は最新の参考レートを取り直す
    setRateMode(payment && payment.currency === next ? "keep" : "auto");
    setManualRate("");
  }

  function recalcWithLatest(): void {
    setRateMode("auto");
    setQuoteRequest((n) => n + 1);
  }

  function startManual(): void {
    // 今のレートを初期値にすると、少しだけ直したいときに楽
    setManualRate(effectiveRate?.rate ?? "");
    setRateMode("manual");
  }

  function toggleParticipant(memberId: string): void {
    setParticipantIds((prev) => (prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId]));
  }

  const allSelected = participantIds.length === snapshot.members.length;

  function submit(): void {
    // よくある入力ミスはここで先に伝える（最終的な検証はサーバー）
    const errors: Record<string, string> = {};

    if (title.trim() === "") errors.title = "内容を入力してください";
    if (!parsedAmount.ok) {
      errors.amount =
        parsedAmount.error === "too_many_decimals"
          ? digits === 0
            ? `${currency}は小数点なしで入力してください`
            : `${currency}は小数点以下${digits}桁までです`
          : "金額を入力してください";
    }
    if (participantIds.length === 0) errors.participantIds = "負担する人を1人以上選んでください";
    if (isForeign && effectiveMode === "manual" && !effectiveRate) errors.rate = "レートを入力してください";

    setFieldErrors(errors);
    setFormError(null);

    if (Object.values(errors).some(Boolean)) return;

    const input: PaymentInput = {
      groupId,
      paymentId: payment?.id ?? null,
      title,
      payerId,
      amount,
      currency,
      // 並び順をメンバーの順にそろえておく
      participantIds: snapshot.members.map((m) => m.id).filter((id) => participantIds.includes(id)),
      paidOn,
      rate:
        effectiveMode === "manual"
          ? { mode: "manual", value: manualRate }
          : effectiveMode === "keep"
            ? { mode: "keep" }
            : { mode: "auto" },
    };

    startTransition(async () => {
      const result = await savePaymentAction(input);

      if (result.ok) {
        router.push(`/g/${groupId}`);
        return;
      }

      // サーバー側でもレートが取れなかった → 手動入力に切り替える
      if (result.code === "rate_unavailable") {
        setRateMode("manual");
      }

      setFieldErrors(result.fieldErrors ?? {});
      setFormError(result.error);
    });
  }

  function remove(): void {
    if (!payment || !window.confirm(`「${payment.title}」を削除しますか？`)) return;

    startTransition(async () => {
      const result = await deletePaymentAction({ groupId, paymentId: payment.id });

      if (result.ok) router.push(`/g/${groupId}`);
      else setFormError(result.error);
    });
  }

  // ---------------------------------------------------------------------------
  // 表示
  // ---------------------------------------------------------------------------

  return (
    <>
      <main className="mx-auto w-full max-w-xl flex-1 px-4 pt-4">
        <header className="mb-4 flex items-center gap-2">
          <Link
            href={`/g/${groupId}`}
            className="flex h-11 items-center rounded-xl px-2 text-sm font-bold text-muted hover:bg-surface-muted"
          >
            ← {snapshot.group.name}
          </Link>
        </header>

        <h1 className="mb-4 text-xl font-black">{isEdit ? "立て替えを編集" : "立て替えを記録"}</h1>

        <form
          className="space-y-5 pb-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {/* 内容 */}
          <div>
            <FieldLabel htmlFor={`${formId}-title`}>内容</FieldLabel>
            <input
              id={`${formId}-title`}
              className={INPUT_CLASS}
              placeholder="例：ディナー"
              value={title}
              maxLength={LIMITS.titleMax}
              onChange={(e) => setTitle(e.target.value)}
              enterKeyHint="next"
              aria-invalid={Boolean(fieldErrors.title)}
            />
            <FieldError message={fieldErrors.title} />
          </div>

          {/* 金額と通貨 */}
          <div>
            <FieldLabel htmlFor={`${formId}-amount`}>金額</FieldLabel>
            <div className="flex gap-2">
              <select
                aria-label="通貨"
                className="min-h-12 w-28 shrink-0 rounded-2xl border border-line bg-surface px-3 text-base font-bold text-ink focus:border-accent focus:outline-none"
                value={currency}
                onChange={(e) => changeCurrency(e.target.value)}
              >
                <optgroup label="よく使う通貨">
                  {CURRENCIES.popular.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code}
                      {c.nameJa ? ` ${c.nameJa}` : ""}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="その他の通貨">
                  {CURRENCIES.others.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code}
                      {c.nameJa ? ` ${c.nameJa}` : ""}
                    </option>
                  ))}
                </optgroup>
              </select>
              <input
                id={`${formId}-amount`}
                className={cx(INPUT_CLASS, "tabular min-w-0 flex-1 text-right text-xl font-black")}
                inputMode={digits === 0 ? "numeric" : "decimal"}
                placeholder={digits === 0 ? "0" : `0.${"0".repeat(digits)}`}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                aria-invalid={Boolean(fieldErrors.amount)}
                autoComplete="off"
              />
            </div>
            <FieldError message={fieldErrors.amount} />

            {/* 外貨のときだけ、換算のプレビューを出す */}
            {isForeign && (
              <RatePreview
                currency={currency}
                mode={effectiveMode}
                loading={quoteLoading}
                failed={quoteFailed}
                rate={effectiveRate}
                previewJpy={previewJpy}
                manualRate={manualRate}
                onManualRateChange={setManualRate}
                onRecalc={recalcWithLatest}
                onStartManual={startManual}
                onCancelManual={() => setRateMode(isEdit && payment?.currency === currency ? "keep" : "auto")}
                canRecalc={isEdit || effectiveMode === "manual"}
                error={fieldErrors.rate}
              />
            )}
          </div>

          {/* 立て替えた人 */}
          <fieldset>
            <legend className="mb-1.5 block text-sm font-bold text-muted">立て替えた人</legend>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="立て替えた人">
              {snapshot.members.map((m) => (
                <label key={m.id} className="cursor-pointer">
                  <input
                    type="radio"
                    name={`${formId}-payer`}
                    className="peer sr-only"
                    checked={payerId === m.id}
                    onChange={() => setPayerId(m.id)}
                  />
                  <span className="flex min-h-11 items-center rounded-full border border-line bg-surface px-4 text-sm font-bold peer-checked:border-accent peer-checked:bg-accent peer-checked:text-on-accent peer-focus-visible:outline-2 peer-focus-visible:outline-focus">
                    {m.name}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* 負担する人 */}
          <fieldset aria-labelledby={`${formId}-participants`}>
            <div className="mb-1.5 flex items-center justify-between">
              <span id={`${formId}-participants`} className="text-sm font-bold text-muted">
                負担する人（{participantIds.length}人）
              </span>
              <button
                type="button"
                className="min-h-9 rounded-xl px-2 text-sm font-bold text-accent hover:bg-accent-soft"
                onClick={() => setParticipantIds(allSelected ? [] : snapshot.members.map((m) => m.id))}
              >
                {allSelected ? "全員はずす" : "全員にする"}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {snapshot.members.map((m) => (
                <label key={m.id} className="cursor-pointer">
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={participantIds.includes(m.id)}
                    onChange={() => toggleParticipant(m.id)}
                  />
                  <span className="flex min-h-11 items-center gap-1.5 rounded-full border border-line bg-surface px-4 text-sm font-bold text-muted peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:text-accent peer-focus-visible:outline-2 peer-focus-visible:outline-focus">
                    <span aria-hidden>{participantIds.includes(m.id) ? "✓" : "＋"}</span>
                    {m.name}
                  </span>
                </label>
              ))}
            </div>
            <FieldError message={fieldErrors.participantIds} />
          </fieldset>

          {/* 日付 */}
          <div>
            <FieldLabel htmlFor={`${formId}-date`}>日付</FieldLabel>
            <input
              id={`${formId}-date`}
              type="date"
              className={INPUT_CLASS}
              value={paidOn}
              onChange={(e) => setPaidOn(e.target.value)}
              required
            />
            <FieldError message={fieldErrors.paidOn} />
          </div>

          {formError && <FieldError message={formError} />}

          {/* 保存ボタン（片手で押せるよう下に固定） */}
          <div className="sticky bottom-0 -mx-4 border-t border-line bg-bg/90 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 backdrop-blur">
            <Button type="submit" size="lg" className="w-full" disabled={isPending || (needsQuote && quoteLoading)}>
              {isPending ? "保存しています…" : isEdit ? "保存する" : "記録する"}
            </Button>
          </div>

          {isEdit && (
            <Button variant="danger" className="w-full" onClick={remove} disabled={isPending}>
              この立て替えを削除
            </Button>
          )}
        </form>
      </main>

      <SiteFooter showExchangeRateApiCredit={effectiveRate?.source === "exchangerate-api"} />
    </>
  );
}

/**
 * 換算のプレビュー
 * 例: 「1 USD = 152.34 円（2026-11-06 時点）→ 7,617 円」
 */
function RatePreview(props: {
  currency: string;
  mode: RateMode;
  loading: boolean;
  failed: boolean;
  rate: EffectiveRate;
  previewJpy: bigint | null;
  manualRate: string;
  onManualRateChange: (value: string) => void;
  onRecalc: () => void;
  onStartManual: () => void;
  onCancelManual: () => void;
  canRecalc: boolean;
  error?: string;
}) {
  const { currency, mode, loading, failed, rate, previewJpy } = props;
  const inputId = useId();

  return (
    <div className="mt-3 rounded-2xl border border-line bg-surface-muted p-4" data-testid="rate-preview">
      {loading ? (
        <p className="text-sm text-muted">為替レートを取得しています…</p>
      ) : (
        <>
          {/* 換算の式 */}
          {rate ? (
            <p className="tabular text-sm" data-testid="rate-equation">
              {rateEquation(currency, rate.rate)}
              {rate.source === "manual" ? "（手動）" : `（${rate.rateDate} 時点）`}
              {previewJpy !== null && (
                <>
                  {" → "}
                  <span className="text-lg font-black" data-testid="preview-jpy">
                    {formatJpyNumber(previewJpy)} 円
                  </span>
                </>
              )}
            </p>
          ) : (
            <p className="text-sm text-muted">レートを入力すると円に換算します。</p>
          )}

          {/* レートの日付・手動の表示 */}
          {rate && (
            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
              {rate.source === "manual" && (
                <span className="rounded-full bg-accent-soft px-2 py-0.5 font-bold text-accent">手動</span>
              )}
              <span>{rateDateLabel(rate.source, rate.rateDate)}</span>
              {mode === "keep" && <span>・保存したときのレートのまま</span>}
            </p>
          )}

          {/* レートの取得に失敗したとき */}
          {failed && (
            <p className="mt-2 text-sm font-bold text-negative" role="alert">
              為替レートを取得できませんでした。レートを手動で入力してください。
            </p>
          )}

          {/* 手動入力 */}
          {mode === "manual" && (
            <div className="mt-3">
              <FieldLabel htmlFor={inputId}>1 {currency} あたりの円（カードの請求額や両替所のレートなど）</FieldLabel>
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-sm font-bold">1 {currency} =</span>
                <input
                  id={inputId}
                  className={cx(INPUT_CLASS, "tabular text-right")}
                  inputMode="decimal"
                  placeholder="例：152.34"
                  value={props.manualRate}
                  onChange={(e) => props.onManualRateChange(e.target.value)}
                  aria-invalid={Boolean(props.error)}
                  autoComplete="off"
                />
                <span className="shrink-0 text-sm font-bold">円</span>
              </div>
            </div>
          )}

          <FieldError message={props.error} />

          {/* 操作 */}
          <div className="mt-3 flex flex-wrap gap-2">
            {mode !== "manual" && (
              <Button variant="secondary" onClick={props.onStartManual}>
                レートを手動で入力
              </Button>
            )}
            {mode === "manual" && !failed && (
              <Button variant="ghost" onClick={props.onCancelManual}>
                手動入力をやめる
              </Button>
            )}
            {(props.canRecalc || failed) && (
              <Button variant="secondary" onClick={props.onRecalc}>
                {failed ? "もう一度取得する" : "最新レートで再計算"}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
