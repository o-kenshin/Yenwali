/**
 * マイグレーションの SQL を PGlite（WASM 版の PostgreSQL）で実際に流して確かめる。
 * Supabase を起動しなくても、制約・RPC・権限のテストができる。
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";

const MIGRATIONS_DIR = join(import.meta.dirname, "..", "migrations");
const GROUP_ID = "abcdefghijklmnopqrstu";
const OTHER_GROUP_ID = "zzzzzzzzzzzzzzzzzzzzz";

let db: PGlite;
let members: { id: string; name: string }[];

async function savePayment(args: {
  id?: string | null;
  groupId?: string;
  payerId: string;
  participants: string[];
  currency?: string;
  source?: string;
}): Promise<string> {
  const currency = args.currency ?? "USD";
  const source = args.source ?? (currency === "JPY" ? "identity" : "frankfurter");

  const result = await db.query<{ id: string }>(
    `select public.save_payment($1, $2, 'ディナー', $3, 1234, $4, '152.3456', $5,
       '2026-11-06', now(), 1880, '2026-11-06', $6::uuid[]) as id`,
    [args.id ?? null, args.groupId ?? GROUP_ID, args.payerId, currency, source, args.participants],
  );

  return result.rows[0]!.id;
}

beforeEach(async () => {
  db = new PGlite();

  // Supabase に最初からあるロールを用意する
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls;");

  for (const file of readdirSync(MIGRATIONS_DIR).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
  }

  await db.query("select public.create_group($1, $2, $3)", [GROUP_ID, "旅行", ["A", "B", "C"]]);
  await db.query("select public.create_group($1, $2, $3)", [OTHER_GROUP_ID, "別", ["X", "Y"]]);

  members = (
    await db.query<{ id: string; name: string }>(
      "select id, name from public.members where group_id = $1 order by sort_order",
      [GROUP_ID],
    )
  ).rows;
});

describe("migration", () => {
  it("グループ作成でメンバーが入力順に並ぶ", () => {
    expect(members.map((m) => m.name)).toEqual(["A", "B", "C"]);
  });

  it("レートは numeric で保存し、文字列で取り出せる", async () => {
    await savePayment({ payerId: members[0]!.id, participants: [members[0]!.id, members[1]!.id] });

    const row = (await db.query<{ rate: string }>("select rate_to_jpy::text as rate from public.payments")).rows[0];

    expect(row?.rate).toBe("152.3456000000");
  });

  it("更新で負担する人が入れ替わる", async () => {
    const id = await savePayment({ payerId: members[0]!.id, participants: [members[0]!.id, members[1]!.id] });

    await savePayment({ id, payerId: members[1]!.id, participants: [members[2]!.id] });

    const participants = (
      await db.query<{ member_id: string }>("select member_id from public.payment_participants")
    ).rows;

    expect(participants.map((p) => p.member_id)).toEqual([members[2]!.id]);
  });

  it("他のグループの支払いは更新できない（null が返る）", async () => {
    const id = await savePayment({ payerId: members[0]!.id, participants: [members[0]!.id] });
    const other = (await db.query<{ id: string }>("select id from public.members where group_id = $1", [OTHER_GROUP_ID]))
      .rows;

    const result = await db.query<{ id: string | null }>(
      `select public.save_payment($1, $2, 'x', $3, 1, 'JPY', '1', 'identity', '2026-11-06', now(), 1, '2026-11-06', $4::uuid[]) as id`,
      [id, OTHER_GROUP_ID, other[0]!.id, [other[0]!.id]],
    );

    expect(result.rows[0]?.id).toBeNull();
  });

  it("他のグループのメンバーを立て替えた人・負担する人にできない", async () => {
    const other = (await db.query<{ id: string }>("select id from public.members where group_id = $1", [OTHER_GROUP_ID]))
      .rows[0]!.id;

    await expect(savePayment({ payerId: members[0]!.id, participants: [other] })).rejects.toMatchObject({ code: "23503" });
    await expect(savePayment({ payerId: other, participants: [members[0]!.id] })).rejects.toMatchObject({ code: "23503" });
  });

  it("JPY は identity、外貨は identity 以外でなければならない", async () => {
    await expect(
      savePayment({ payerId: members[0]!.id, participants: [members[0]!.id], currency: "JPY", source: "manual" }),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      savePayment({ payerId: members[0]!.id, participants: [members[0]!.id], currency: "USD", source: "identity" }),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("支払いに関わっているメンバーは削除できない", async () => {
    await savePayment({ payerId: members[0]!.id, participants: [members[1]!.id] });

    const r = async (memberId: string): Promise<string> =>
      (await db.query<{ r: string }>("select public.delete_member($1, $2) as r", [GROUP_ID, memberId])).rows[0]!.r;

    expect(await r(members[0]!.id)).toBe("in_use"); // 立て替えた人
    expect(await r(members[1]!.id)).toBe("in_use"); // 負担する人

    // 直接 delete しても外部キーで止まる
    await expect(db.query("delete from public.members where id = $1", [members[1]!.id])).rejects.toMatchObject({
      code: "23503",
    });

    // 関わっていない C は消せる → 残り 2 人なので、それ以上は消せない
    await db.query("select public.add_member($1, 'D')", [GROUP_ID]);
    expect(await r(members[2]!.id)).toBe("ok");
  });

  it("メンバーは 2 人より少なくできない", async () => {
    const r = async (memberId: string): Promise<string> =>
      (await db.query<{ r: string }>("select public.delete_member($1, $2) as r", [GROUP_ID, memberId])).rows[0]!.r;

    expect(await r(members[2]!.id)).toBe("ok");
    expect(await r(members[1]!.id)).toBe("too_few");
  });

  it("メンバーの追加は末尾に並ぶ", async () => {
    await db.query("select public.add_member($1, 'D')", [GROUP_ID]);

    const names = (
      await db.query<{ name: string }>("select name from public.members where group_id = $1 order by sort_order", [
        GROUP_ID,
      ])
    ).rows.map((m) => m.name);

    expect(names).toEqual(["A", "B", "C", "D"]);
  });

  it("グループを消すと関連する行もすべて消える", async () => {
    await savePayment({ payerId: members[0]!.id, participants: [members[1]!.id, members[2]!.id] });
    await db.query("delete from public.groups where id = $1", [GROUP_ID]);

    const count = async (table: string): Promise<number> =>
      Number((await db.query<{ c: string }>(`select count(*) as c from public.${table}`)).rows[0]!.c);

    expect(await count("payments")).toBe(0);
    expect(await count("payment_participants")).toBe(0);
    expect(await count("members")).toBe(2); // 別グループの X, Y だけ残る
  });

  it("全テーブルで RLS が有効で、anon / authenticated には権限がない", async () => {
    const rls = (
      await db.query<{ relname: string; relrowsecurity: boolean }>(
        `select relname, relrowsecurity from pg_class
         where relname in ('groups', 'members', 'payments', 'payment_participants')`,
      )
    ).rows;

    expect(rls).toHaveLength(4);
    expect(rls.every((r) => r.relrowsecurity)).toBe(true);

    for (const role of ["anon", "authenticated"]) {
      for (const table of ["groups", "members", "payments", "payment_participants"]) {
        const { rows } = await db.query<{ ok: boolean }>(
          `select has_table_privilege($1, $2, 'select') or has_table_privilege($1, $2, 'insert') as ok`,
          [role, `public.${table}`],
        );

        expect(rows[0]?.ok).toBe(false);
      }

      const { rows } = await db.query<{ ok: boolean }>(
        "select has_function_privilege($1, 'public.create_group(text, text, text[])', 'execute') as ok",
        [role],
      );

      expect(rows[0]?.ok).toBe(false);
    }
  });
});
