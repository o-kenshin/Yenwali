/**
 * 小さな共通部品（見た目をそろえるため）
 */

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/** クラス名をつなぐ */
export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

// -----------------------------------------------------------------------------
// ボタン
// -----------------------------------------------------------------------------

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-accent text-on-accent shadow-sm hover:bg-accent-strong active:scale-[0.99]",
  secondary: "bg-surface text-ink border border-line hover:bg-surface-muted",
  ghost: "text-ink hover:bg-surface-muted",
  danger: "bg-surface text-negative border border-line hover:bg-surface-muted",
};

const BASE_BUTTON =
  "inline-flex items-center justify-center gap-2 rounded-2xl font-bold transition disabled:cursor-not-allowed disabled:opacity-50";

const SIZE_CLASSES = {
  md: "min-h-11 px-4 text-sm",
  lg: "min-h-14 px-5 text-base",
} as const;

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: keyof typeof SIZE_CLASSES }) {
  return (
    <button
      type="button"
      className={cx(BASE_BUTTON, VARIANT_CLASSES[variant], SIZE_CLASSES[size], className)}
      {...props}
    />
  );
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: keyof typeof SIZE_CLASSES }) {
  return <Link className={cx(BASE_BUTTON, VARIANT_CLASSES[variant], SIZE_CLASSES[size], className)} {...props} />;
}

// -----------------------------------------------------------------------------
// カード・見出し
// -----------------------------------------------------------------------------

export function Card({ className, ...props }: ComponentProps<"section">) {
  return <section className={cx("rounded-3xl border border-line bg-surface p-4", className)} {...props} />;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="text-base font-bold">{children}</h2>
      {action}
    </div>
  );
}

// -----------------------------------------------------------------------------
// 入力欄
// -----------------------------------------------------------------------------

export const INPUT_CLASS =
  "w-full min-h-12 rounded-2xl border border-line bg-surface px-4 text-base text-ink placeholder:text-muted/70 focus:border-accent focus:outline-none";

export function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-bold text-muted">
      {children}
    </label>
  );
}

export function FieldError({ message, id }: { message?: string; id?: string }) {
  if (!message) return null;

  return (
    <p id={id} role="alert" className="mt-1.5 text-sm text-negative">
      {message}
    </p>
  );
}

// -----------------------------------------------------------------------------
// ロゴ（¥ の丸印 + 文字）
// -----------------------------------------------------------------------------

export function Logo({ size = "md" }: { size?: "md" | "lg" }) {
  const mark = size === "lg" ? "h-10 w-10 text-xl" : "h-7 w-7 text-sm";
  const text = size === "lg" ? "text-2xl" : "text-lg";

  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden
        className={cx(
          "inline-flex items-center justify-center rounded-full bg-accent font-black text-on-accent",
          mark,
        )}
      >
        ¥
      </span>
      <span className={cx("font-black tracking-tight", text)}>Yenwali</span>
    </span>
  );
}
