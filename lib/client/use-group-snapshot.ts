"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";

import { GROUP_UPDATED_EVENT, groupChannelName } from "@/lib/realtime";
import type { GroupSnapshot } from "@/lib/types";

/**
 * グループの最新の状態を持ち、他の人の更新をすぐ反映するフック
 *
 * - Supabase Realtime の Broadcast を購読し、「更新あり」が来たらサーバーから取り直す
 * - Realtime がつながっていないあいだは 30 秒ごとに取り直す
 * - タブに戻ってきたときも取り直す
 */

const POLL_INTERVAL_MS = 30_000;

// ブラウザ用の Supabase クライアント（公開キーで Realtime を購読するだけ。データは読めない）
let browserClient: SupabaseClient | null | undefined;

function getBrowserClient(): SupabaseClient | null {
  if (browserClient !== undefined) return browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  browserClient = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;

  return browserClient;
}

export type ConnectionState = "realtime" | "polling";

export function useGroupSnapshot(initial: GroupSnapshot): {
  snapshot: GroupSnapshot;
  setSnapshot: (next: GroupSnapshot) => void;
  refetch: () => Promise<void>;
  connection: ConnectionState;
  notFound: boolean;
} {
  const groupId = initial.group.id;

  const [snapshot, setSnapshot] = useState(initial);
  const [connection, setConnection] = useState<ConnectionState>("polling");
  const [notFound, setNotFound] = useState(false);

  // 古いリクエストの結果で新しい結果を上書きしないための連番
  const requestSeq = useRef(0);

  const refetch = useCallback(async () => {
    const seq = ++requestSeq.current;

    try {
      const res = await fetch(`/api/groups/${groupId}`, { cache: "no-store" });

      if (res.status === 404) {
        setNotFound(true);
        return;
      }

      if (!res.ok) return;

      const next = (await res.json()) as GroupSnapshot;

      if (seq === requestSeq.current) {
        setSnapshot(next);
      }
    } catch {
      // 通信できないときは次の機会に取り直す
    }
  }, [groupId]);

  // 書き込みの結果をすぐ反映するとき用（進行中の再取得の結果で巻き戻らないようにする）
  const applySnapshot = useCallback((next: GroupSnapshot) => {
    requestSeq.current += 1;
    setSnapshot(next);
  }, []);

  // サーバーから新しい初期値が届いたら（画面の再描画など）それに合わせる
  const [prevInitial, setPrevInitial] = useState(initial);

  if (initial !== prevInitial) {
    setPrevInitial(initial);
    setSnapshot(initial);
  }

  // ---------------------------------------------------------------------------
  // 画面が表示されるたびに取り直す
  // Next.js は前の画面を <Activity> で隠して残すので、記録画面から戻ったときも古い状態が見えないように。
  // ---------------------------------------------------------------------------
  useEffect(() => {
    // 描画の直後に取り直す（エフェクトの中で同期的に state を変えないよう、タイマーで次の機会に回す）
    const timer = window.setTimeout(() => void refetch(), 0);

    return () => window.clearTimeout(timer);
  }, [refetch]);

  // ---------------------------------------------------------------------------
  // Realtime（Broadcast）の購読
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const client = getBrowserClient();

    if (!client) return;

    const channel = client
      .channel(groupChannelName(groupId))
      .on("broadcast", { event: GROUP_UPDATED_EVENT }, () => {
        void refetch();
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setConnection("realtime");
          // つながるまでのあいだの更新を取りこぼさないように一度取り直す
          void refetch();
        } else {
          setConnection("polling");
        }
      });

    return () => {
      void client.removeChannel(channel);
    };
  }, [groupId, refetch]);

  // ---------------------------------------------------------------------------
  // Realtime がつながっていないあいだは 30 秒ごとに取り直す
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (connection === "realtime") return;

    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refetch();
      }
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [connection, refetch]);

  // ---------------------------------------------------------------------------
  // タブに戻ってきたら取り直す
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const onVisible = (): void => {
      if (document.visibilityState === "visible") {
        void refetch();
      }
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [refetch]);

  return { snapshot, setSnapshot: applySnapshot, refetch, connection, notFound };
}
