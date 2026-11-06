import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { GroupView } from "@/components/group-view";
import { loadGroupSnapshot } from "@/lib/server/load-group";

/**
 * グループのページ: 記録ボタン・精算結果・立て替えの一覧・メンバーの編集を 1 ページに並べる
 */

export async function generateMetadata(props: PageProps<"/g/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const snapshot = await loadGroupSnapshot(id);

  return {
    title: snapshot ? snapshot.group.name : "グループが見つかりません",
    // URL を知っている人だけのページなので、検索エンジンに載せない
    robots: { index: false, follow: false },
  };
}

export default async function GroupPage(props: PageProps<"/g/[id]">) {
  const { id } = await props.params;
  const snapshot = await loadGroupSnapshot(id);

  if (!snapshot) {
    notFound();
  }

  return <GroupView initial={snapshot} />;
}
