import type { NextRequest } from "next/server";

import { getRepository } from "@/lib/server/db";
import { buildSnapshot } from "@/lib/server/snapshot";
import { groupIdSchema } from "@/lib/server/validation";

/**
 * GET /api/groups/{id} → グループの最新の状態（精算の計算結果込み）
 *
 * Broadcast で「更新あり」を受け取ったブラウザや、30 秒ごとの再取得から呼ばれる。
 */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/groups/[id]">): Promise<Response> {
  const { id } = await ctx.params;

  if (!groupIdSchema.safeParse(id).success) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const data = await getRepository().getGroupData(id);

  if (!data) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  return Response.json(buildSnapshot(data), { headers: { "Cache-Control": "no-store" } });
}
