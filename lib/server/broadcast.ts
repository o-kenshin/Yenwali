import "server-only";

import { groupChannelName, GROUP_UPDATED_EVENT } from "@/lib/realtime";

import { getStoreKind } from "./env";
import { getSupabaseAdmin } from "./supabase-repository";

/**
 * 「このグループに更新あり」とだけ Supabase Realtime の Broadcast で知らせる。
 * データの中身は送らない（受け取ったブラウザがサーバーから取り直す）。
 *
 * 通知に失敗しても書き込み自体は成功しているので、エラーは握りつぶしてログだけ出す。
 * （ブラウザ側は 30 秒ごとの再取得で追いつく）
 */
export async function notifyGroupUpdated(groupId: string): Promise<void> {
  // メモリ保存のときは Supabase がないので何もしない
  if (getStoreKind() !== "supabase") {
    return;
  }

  const supabase = getSupabaseAdmin();
  const channel = supabase.channel(groupChannelName(groupId));

  try {
    // REST で送る（サーバーから WebSocket をつなぐ必要がない）
    await channel.httpSend(GROUP_UPDATED_EVENT, {}, { timeout: 3000 });
  } catch (error) {
    console.warn("[broadcast] failed to notify group update", error);
  } finally {
    await supabase.removeChannel(channel);
  }
}
