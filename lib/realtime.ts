/**
 * Realtime（Broadcast）のチャンネル名とイベント名。サーバーとブラウザで共有する。
 */

export const GROUP_UPDATED_EVENT = "updated";

export function groupChannelName(groupId: string): string {
  return `group:${groupId}`;
}
