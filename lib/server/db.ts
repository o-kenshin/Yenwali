import "server-only";

import { getStoreKind } from "./env";
import { createMemoryRepository } from "./memory-repository";
import type { Repository } from "./repository";
import { createSupabaseRepository } from "./supabase-repository";

/**
 * 環境変数 YENWALI_STORE に応じたリポジトリを返す。
 */
export function getRepository(): Repository {
  return getStoreKind() === "memory" ? createMemoryRepository() : createSupabaseRepository();
}
