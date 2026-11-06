# Yenwali（エンワリ）

ログイン不要・URL を共有するだけの割り勘 Web アプリです。
**外貨で払った金額を、記録した時点の参考レートで日本円に換算して固定**し、精算はすべて日本円で行います。
海外旅行での利用を想定し、スマホで片手で操作できることを優先しています。

- グループ名とメンバーを入れてグループを作成 → URL を共有 → 各自が立て替えを記録 → 精算結果を見る
- 記録・編集・削除は、同じ URL を開いている他の人の画面にもすぐ反映されます

## 機能

| 画面 | 内容 |
| --- | --- |
| `/` | アプリの説明、グループ作成（グループ名＋メンバー2人以上）、最近使ったグループ（localStorage） |
| `/g/[id]` | 合計（円）、URL のコピー・LINE で共有、精算（誰が誰にいくら・メンバーごとの内訳・テキストでコピー）、立て替えの一覧、メンバーの追加・名前の変更・削除 |
| `/g/[id]/pay/new` | 立て替えの記録（内容・金額・**通貨**・立て替えた人・負担する人・日付） |
| `/g/[id]/pay/[paymentId]` | 立て替えの編集・削除。「最新レートで再計算」 |

- 通貨は ISO 4217 のコードから選びます（よく使う通貨を上に表示）。初期値は、そのグループで最後に記録した通貨です（記録がなければ JPY）
- JPY 以外では「1 USD = 152.34 円（2026-11-06 時点）→ 7,617 円」のように換算のプレビューと「◯月◯日時点の参考レート」を表示します
- レートは手動で上書きでき、上書きしたものには「手動」と表示します
- 編集してもレートは変わりません。「最新レートで再計算」を押したときだけ取り直します
- レートを取得できないときは、自動で手動入力に切り替わります（保存できなくなることはありません）

## 技術スタック

- Next.js 16（App Router / Cache Components）+ TypeScript（strict）+ Tailwind CSS v4
- Supabase（PostgreSQL / Realtime Broadcast）
- zod（入力検証）、nanoid（グループ ID）
- Vitest（ロジック・SQL の単体テスト）、Playwright（画面の通しテスト）、PGlite（SQL のテスト用）

## ディレクトリ構成

```
app/
  page.tsx                     トップ
  g/[id]/page.tsx              グループのページ
  g/[id]/pay/new, [paymentId]  立て替えの記録・編集
  api/rate/[currency]/         為替レートの取得（サーバー側・1時間キャッシュ）
  api/groups/[id]/             グループの最新状態（再取得用）
  actions.ts                   Server Actions（書き込みはすべてここ）
components/                    画面の部品
lib/
  money/                       お金の計算（UI から独立した純粋関数＋テスト）
  rates/                       為替 API のレスポンスの解析（＋テスト）
  server/                      server-only: DB・為替取得・Broadcast・検証
  client/                      ブラウザ: Realtime 購読・最近のグループ・クリップボード
supabase/
  migrations/                  SQL のマイグレーション
  tests/                       マイグレーションを PGlite で流すテスト
e2e/                           Playwright のテスト
```

## セットアップ（ローカル）

必要なもの: Node.js 20.9 以上（24 で動作確認）、Docker（Supabase をローカルで動かす場合）

```bash
npm install
cp .env.example .env.local
```

### A. Supabase をローカルで動かす

```bash
npx supabase start            # Docker 上で Postgres / Realtime などが起動し、マイグレーションが適用される
npx supabase status           # 表示された API URL・Publishable key・Secret key を .env.local に書く
npm run dev                   # http://localhost:3000
```

### B. Supabase なしで試す

DB の代わりにメモリに保存するモードがあります（サーバーを止めるとデータは消えます。Realtime は使えないので、30 秒ごと・タブに戻ったときの再取得で反映されます）。

```bash
YENWALI_STORE=memory npm run dev
```

### コマンド

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | 開発サーバー |
| `npm run lint` | ESLint |
| `npm run typecheck` | 型チェック（ルートの型を生成してから `tsc --noEmit`） |
| `npm test` | Vitest（お金の計算・API レスポンスの解析・SQL のマイグレーション） |
| `npm run test:e2e` | Playwright（初回は `npx playwright install chromium`）。メモリ保存・固定レートで本番ビルドを起動して試す |
| `npm run build` | 本番ビルド |

## 環境変数

| 名前 | 必須 | 説明 |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | ○ | Supabase の URL。サーバーとブラウザ（Realtime の購読）で使う |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | ○ | 公開キー。ブラウザで Broadcast を購読するためだけに使う（RLS で全テーブルを拒否しているので、このキーではデータを読み書きできない） |
| `SUPABASE_SECRET_KEY` | ○ | サーバー専用のシークレットキー。`server-only` のモジュールからしか読まない。**`NEXT_PUBLIC_` を付けないこと** |
| `YENWALI_STORE` | | `supabase`（既定）または `memory`。`memory` は Vercel では起動時にエラーにする |
| `YENWALI_FAKE_RATES` | | `1` で為替 API を叩かず固定レートを返す（E2E 用） |

旧形式のキー（`anon` / `service_role` の JWT）を使う場合は、それぞれ PUBLISHABLE_KEY / SECRET_KEY に入れれば動きます。

## デプロイ

### Supabase

1. [Supabase](https://supabase.com) でプロジェクトを作る
2. マイグレーションを適用する
   ```bash
   npx supabase login
   npx supabase link --project-ref <プロジェクトの ref>
   npx supabase db push
   ```
   （またはダッシュボードの SQL Editor で `supabase/migrations/*.sql` を実行）
3. Project Settings > API Keys で Publishable key と Secret key を控える
4. Realtime は既定で有効です。Broadcast は公開チャンネルを使うので、追加の設定はいりません

### Vercel

1. このリポジトリを Vercel にインポート（Framework Preset: Next.js。ビルド設定は既定のまま）
2. Environment Variables に `NEXT_PUBLIC_SUPABASE_URL`・`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`・`SUPABASE_SECRET_KEY` を設定
3. デプロイ

## 設計判断

### お金の計算

- **浮動小数点を使わない。** 金額は通貨の最小単位の整数（`amount_minor`）、レートは10進数の文字列で持ち、計算では BigInt で 10^10 倍した整数にする
- 円換算は `四捨五入(amount_minor × rate ÷ 10^桁数)`（0.5 は切り上げ）。割り勘の端数はメンバーの並び順の先頭から 1 円ずつ
- 通貨の桁数は `Intl.NumberFormat` に頼らず自前の表（`lib/money/currencies.ts`）で持つ。基金通貨（CLF など）や貴金属（XAU など）は旅行で使わないので外した
- レートは小数第10位まで保存する（それより細かい分は四捨五入）。DB は `numeric(30,10)`
- 為替 API のレスポンスは JSON.parse すると数値が浮動小数点になるので、レートは生の文字列から取り出す。指数表記（`6.1642e-3`）にも対応した
- 金額・円換算額の上限は 1 兆、1 グループの記録は 1000 件まで。これで合計も JavaScript の安全な整数の範囲に収まるので、画面とのやりとりは number にした（計算は BigInt）
- 精算はサーバー側で計算し、ブラウザは表示に専念する。ブラウザで計算するのは換算のプレビューだけ（同じ純粋関数を使う）

### レート

- 新規の記録では、**保存するときにサーバーが参考レートを取り直して使う**（ブラウザから送られたレートは信用しない）。プレビューと同じ 1 時間キャッシュを通るので、通常は表示どおりの値になる
- 手動で入力したレートの「レートの日付」は、支払った日とした
- JPY はレート `1`・取得元 `identity`。DB でも「JPY ⇔ identity」を CHECK 制約にした
- 編集画面で通貨を変えたときは保存済みのレートは使えないので、自動で最新の参考レートに切り替わる。元の通貨に戻せば保存済みのレートに戻る
- キャッシュはサーバーのメモリに通貨ごとに 1 時間。取得に失敗した結果はキャッシュしない

### DB・セキュリティ

- 全テーブルで RLS を有効にし、ポリシーは作らない。さらに `anon` / `authenticated` からテーブルと関数の権限も外した
- 複数テーブルにまたがる書き込み（グループ作成、支払いと負担者の保存、メンバー追加・削除）は RPC（PL/pgSQL）にまとめて 1 トランザクションで実行する
- 「立て替えた人が同じグループのメンバーであること」は `(payer_id, group_id)` の複合外部キーで、「負担する人が同じグループのメンバーであること」は RPC 内のチェックで DB でも保証する。Server Action でも事前に照合する
- 支払いに関わっているメンバーは削除できない（RPC で判定し、外部キーでも拒否）。外部キーは `deferrable initially deferred` にして、グループごと消すときの連鎖削除は通るようにした
- メンバーは 2 人未満にできない。同じグループに同じ名前のメンバーは作れない（精算結果が読めなくなるため）
- グループ ID は nanoid 21 文字（約 126 bit）
- グループのページは `noindex`
- データアクセスはリポジトリのインターフェース越しにして、Supabase 版とメモリ版を用意した。E2E テストは Supabase・外部 API なしで動く

### リアルタイム反映

- 書き込み後、サーバーから `group:{id}` チャンネルに `updated` イベントを中身なしで送る（REST の `httpSend`）。ブラウザは受け取ったら `/api/groups/{id}` から取り直す
- Realtime がつながっていないあいだは 30 秒ごとに取り直す。タブに戻ったとき・画面が表示されたときも取り直す
- Next.js 16 は前の画面を `<Activity>` で残すので、記録画面から戻ったときも表示のたびに取り直すようにした

### 画面

- 記録・編集は別ページにした（スマホでのブラウザバック・リロードに強い）
- 「立て替えを記録する」と「記録する」ボタンは画面の下に固定（片手で押せるように）
- 通貨の選択はネイティブの `<select>`（スマホでは OS のピッカーが出て選びやすい）
- 配色は朱色のアクセント＋生成り色の背景のオリジナル。ダークモードにも対応
- 全角数字・カンマ入りの金額も受け付ける

## 既知の制限

- **レートは 1 日 1 回更新の参考レート（仲値）**です。リアルタイムのレートではなく、カード会社の請求レートや両替所のレートとも異なります。合わせたいときは手動で入力してください
- 週末・祝日は直近の営業日のレートになります（レートの日付として表示します）
- レートのキャッシュはサーバーのインスタンスごとのメモリです。サーバーレス環境ではインスタンスが変わると取り直しになります（その場合も API の更新は 1 日 1 回なので値は通常同じです）
- Broadcast は公開チャンネルなので、公開キーを持つ人は「更新あり」の通知を送れます。中身は送らないので、できるのは再取得を促すことだけです
- URL を知っている人は誰でも閲覧・編集できます（Walica と同じ考え方）。編集の履歴や取り消し、グループの削除機能はありません
- 同じ支払いを 2 人が同時に編集した場合は、後から保存したほうが残ります
- 存在しないグループの URL は「ページが見つかりません」を表示しますが、ストリーミング描画のため HTTP ステータスは 200 です（`noindex` は付きます）
- メモリ保存モード（`YENWALI_STORE=memory`）は試用・テスト用です
