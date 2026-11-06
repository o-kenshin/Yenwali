-- =============================================================================
-- Yenwali 初期スキーマ
--
-- 方針
-- - 全テーブルで RLS を有効にし、ポリシーは1つも作らない
--   → anon / authenticated キーからは一切読み書きできない
-- - アクセスはすべてサーバー側からシークレットキー（service_role）で行う
-- - 複数テーブルにまたがる書き込みは関数（RPC）にまとめ、1トランザクションで実行する
-- =============================================================================


-- -----------------------------------------------------------------------------
-- groups: 割り勘のグループ（イベント）
-- -----------------------------------------------------------------------------
create table public.groups (
  id          text        primary key check (id ~ '^[A-Za-z0-9_-]{21,64}$'),
  name        text        not null check (char_length(name) between 1 and 50),
  created_at  timestamptz not null default now()
);


-- -----------------------------------------------------------------------------
-- members: グループのメンバー
-- -----------------------------------------------------------------------------
create table public.members (
  id          uuid        primary key default gen_random_uuid(),
  group_id    text        not null references public.groups (id) on delete cascade,
  name        text        not null check (char_length(name) between 1 and 20),
  sort_order  integer     not null,
  created_at  timestamptz not null default now(),

  -- payments から (payer_id, group_id) で参照し、
  -- 「立て替えた人が同じグループのメンバーであること」を DB で保証するため
  unique (id, group_id),
  unique (group_id, sort_order)
);


-- -----------------------------------------------------------------------------
-- payments: 立て替えの記録
--
-- レートと円換算額は保存した時点の値で固定する。
-- rate_to_jpy は numeric で持ち、アプリとは文字列（::text）で受け渡す。
-- -----------------------------------------------------------------------------
create table public.payments (
  id               uuid          primary key default gen_random_uuid(),
  group_id         text          not null references public.groups (id) on delete cascade,
  title            text          not null check (char_length(title) between 1 and 50),
  payer_id         uuid          not null,

  -- 元の通貨の最小単位の整数（USD 12.34 → 1234）
  amount_minor     bigint        not null check (amount_minor > 0 and amount_minor <= 1000000000000),
  currency         char(3)       not null check (currency ~ '^[A-Z]{3}$'),

  -- 1 通貨あたり何円か（小数第10位まで）
  rate_to_jpy      numeric(30, 10) not null check (rate_to_jpy > 0),
  rate_source      text          not null check (rate_source in ('frankfurter', 'exchangerate-api', 'manual', 'identity')),
  rate_date        date          not null,
  rate_fetched_at  timestamptz   not null,

  -- 円換算額（1円単位に四捨五入済み）
  amount_jpy       bigint        not null check (amount_jpy >= 0 and amount_jpy <= 1000000000000),

  paid_on          date          not null,
  created_at       timestamptz   not null default now(),
  updated_at       timestamptz   not null default now(),

  -- JPY のときはレート 1・取得元 identity に限る
  check ((currency = 'JPY') = (rate_source = 'identity')),

  -- 立て替えた人は同じグループのメンバー。
  -- 支払いに関わっているメンバーは削除できない。
  -- チェックをコミット時まで遅らせるのは、グループを消したときの連鎖削除
  -- （members と payments が同時に消える）を通すため。
  foreign key (payer_id, group_id) references public.members (id, group_id)
    deferrable initially deferred
);

create index payments_group_id_created_at_idx on public.payments (group_id, created_at);


-- -----------------------------------------------------------------------------
-- payment_participants: その支払いを負担する人
-- -----------------------------------------------------------------------------
create table public.payment_participants (
  payment_id  uuid not null references public.payments (id) on delete cascade,
  member_id   uuid not null references public.members (id) deferrable initially deferred,
  primary key (payment_id, member_id)
);

create index payment_participants_member_id_idx on public.payment_participants (member_id);


-- -----------------------------------------------------------------------------
-- RLS: 有効にするだけでポリシーは作らない（= anon / authenticated は全拒否）
-- -----------------------------------------------------------------------------
alter table public.groups               enable row level security;
alter table public.members              enable row level security;
alter table public.payments             enable row level security;
alter table public.payment_participants enable row level security;

-- 念のため権限そのものも外しておく
revoke all on public.groups, public.members, public.payments, public.payment_participants
  from anon, authenticated;

-- サーバー（service_role）は RLS をバイパスする。権限も明示しておく
grant select, insert, update, delete
  on public.groups, public.members, public.payments, public.payment_participants
  to service_role;


-- =============================================================================
-- RPC（サーバーからシークレットキーでのみ呼ぶ）
-- =============================================================================

-- -----------------------------------------------------------------------------
-- グループとメンバーを一度に作る
-- -----------------------------------------------------------------------------
create function public.create_group(p_id text, p_name text, p_member_names text[])
returns void
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(array_length(p_member_names, 1), 0) < 2 then
    raise exception 'at least two members are required' using errcode = '22023';
  end if;

  insert into public.groups (id, name) values (p_id, p_name);

  -- 入力の順番をそのまま並び順にする
  insert into public.members (group_id, name, sort_order)
  select p_id, member_name, ordinality::integer - 1
  from unnest(p_member_names) with ordinality as t(member_name, ordinality);
end;
$$;


-- -----------------------------------------------------------------------------
-- メンバーを末尾に追加する
-- -----------------------------------------------------------------------------
create function public.add_member(p_group_id text, p_name text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
begin
  -- 同時に追加されても sort_order が衝突しないよう、グループ行をロックする
  perform 1 from public.groups where id = p_group_id for update;

  if not found then
    raise exception 'group not found' using errcode = 'P0002';
  end if;

  insert into public.members (group_id, name, sort_order)
  values (
    p_group_id,
    p_name,
    (select coalesce(max(sort_order), -1) + 1 from public.members where group_id = p_group_id)
  )
  returning id into v_id;

  return v_id;
end;
$$;


-- -----------------------------------------------------------------------------
-- メンバーを削除する
-- - 支払いに関わっているメンバーは削除できない（外部キーで拒否される: 23503）
-- - メンバーは2人より少なくできない
-- 戻り値: 'ok' | 'not_found' | 'too_few' | 'in_use'
-- -----------------------------------------------------------------------------
create function public.delete_member(p_group_id text, p_member_id uuid)
returns text
language plpgsql
set search_path = ''
as $$
begin
  perform 1 from public.groups where id = p_group_id for update;

  if not exists (select 1 from public.members where id = p_member_id and group_id = p_group_id) then
    return 'not_found';
  end if;

  if exists (select 1 from public.payments where payer_id = p_member_id)
     or exists (select 1 from public.payment_participants where member_id = p_member_id) then
    return 'in_use';
  end if;

  if (select count(*) from public.members where group_id = p_group_id) <= 2 then
    return 'too_few';
  end if;

  delete from public.members where id = p_member_id and group_id = p_group_id;

  return 'ok';
end;
$$;


-- -----------------------------------------------------------------------------
-- 支払いを作成・更新する（p_id が null なら作成）
-- 負担する人も同じトランザクションで入れ替える。
-- 戻り値: 支払いの id（更新対象が見つからなければ null）
-- -----------------------------------------------------------------------------
create function public.save_payment(
  p_id              uuid,
  p_group_id        text,
  p_title           text,
  p_payer_id        uuid,
  p_amount_minor    bigint,
  p_currency        text,
  p_rate_to_jpy     text,
  p_rate_source     text,
  p_rate_date       date,
  p_rate_fetched_at timestamptz,
  p_amount_jpy      bigint,
  p_paid_on         date,
  p_participant_ids uuid[]
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if coalesce(array_length(p_participant_ids, 1), 0) = 0 then
    raise exception 'at least one participant is required' using errcode = '22023';
  end if;

  -- 負担する人が全員このグループのメンバーであること
  if exists (
    select 1
    from unnest(p_participant_ids) as t(member_id)
    where not exists (
      select 1 from public.members m where m.id = t.member_id and m.group_id = p_group_id
    )
  ) then
    raise exception 'participant is not a member of the group' using errcode = '23503';
  end if;

  if p_id is null then
    insert into public.payments (
      group_id, title, payer_id, amount_minor, currency,
      rate_to_jpy, rate_source, rate_date, rate_fetched_at, amount_jpy, paid_on
    ) values (
      p_group_id, p_title, p_payer_id, p_amount_minor, p_currency,
      p_rate_to_jpy::numeric, p_rate_source, p_rate_date, p_rate_fetched_at, p_amount_jpy, p_paid_on
    )
    returning id into v_id;
  else
    update public.payments set
      title           = p_title,
      payer_id        = p_payer_id,
      amount_minor    = p_amount_minor,
      currency        = p_currency,
      rate_to_jpy     = p_rate_to_jpy::numeric,
      rate_source     = p_rate_source,
      rate_date       = p_rate_date,
      rate_fetched_at = p_rate_fetched_at,
      amount_jpy      = p_amount_jpy,
      paid_on         = p_paid_on,
      updated_at      = now()
    where id = p_id and group_id = p_group_id
    returning id into v_id;

    if v_id is null then
      return null;
    end if;

    delete from public.payment_participants where payment_id = v_id;
  end if;

  insert into public.payment_participants (payment_id, member_id)
  select distinct v_id, member_id from unnest(p_participant_ids) as t(member_id);

  return v_id;
end;
$$;


-- -----------------------------------------------------------------------------
-- 関数の実行権限はサーバー（service_role）だけに与える
-- -----------------------------------------------------------------------------
revoke all on function public.create_group(text, text, text[]) from public, anon, authenticated;
revoke all on function public.add_member(text, text) from public, anon, authenticated;
revoke all on function public.delete_member(text, uuid) from public, anon, authenticated;
revoke all on function public.save_payment(uuid, text, text, uuid, bigint, text, text, text, date, timestamptz, bigint, date, uuid[])
  from public, anon, authenticated;

grant execute on function public.create_group(text, text, text[]) to service_role;
grant execute on function public.add_member(text, text) to service_role;
grant execute on function public.delete_member(text, uuid) to service_role;
grant execute on function public.save_payment(uuid, text, text, uuid, bigint, text, text, text, date, timestamptz, bigint, date, uuid[])
  to service_role;
