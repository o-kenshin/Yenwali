import "server-only";

import { cache } from "react";

import type { GroupSnapshot } from "@/lib/types";

import { getRepository } from "./db";
import { buildSnapshot } from "./snapshot";
import { groupIdSchema } from "./validation";

/**
 * ページ（Server Component）からグループを読む。
 * generateMetadata とページ本体で 2 回呼んでも、1 回のリクエストでは DB を 1 回しか読まない。
 */
export const loadGroupSnapshot = cache(async (groupId: string): Promise<GroupSnapshot | null> => {
  if (!groupIdSchema.safeParse(groupId).success) {
    return null;
  }

  const data = await getRepository().getGroupData(groupId);

  return data ? buildSnapshot(data) : null;
});
