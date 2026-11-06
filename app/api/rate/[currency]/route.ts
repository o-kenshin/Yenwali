import type { NextRequest } from "next/server";

import { isCurrencyCode } from "@/lib/money";
import { getRateToJpy } from "@/lib/server/rates";

/**
 * GET /api/rate/USD → 1 USD あたり何円か（換算のプレビュー用）
 *
 * 外部 API はブラウザから直接叩かず、必ずここ（サーバー）を通す。
 * サーバー側で通貨ごとに 1 時間キャッシュしている。
 */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/rate/[currency]">): Promise<Response> {
  const { currency } = await ctx.params;
  const code = currency.toUpperCase();

  if (!isCurrencyCode(code)) {
    return Response.json({ error: "unknown_currency" }, { status: 400 });
  }

  const quote = await getRateToJpy(code);

  if (!quote) {
    // どちらのソースも失敗 → 画面は手動入力に切り替える
    return Response.json({ error: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  return Response.json(quote, { headers: { "Cache-Control": "no-store" } });
}
