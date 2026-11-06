import { expect, test, type Page } from "@playwright/test";

/**
 * Yenwali の通しテスト
 *
 * 固定レート（YENWALI_FAKE_RATES=1）:
 *   USD 152.34 / EUR 165.5 / KRW 0.1083 / KWD 496.12（KWD だけ ExchangeRate-API 扱い）
 *   それ以外の外貨は「取得失敗」になる
 */

// -----------------------------------------------------------------------------
// ヘルパー
// -----------------------------------------------------------------------------

/**
 * 表示中の要素だけを testid で探す。
 * Next.js は前の画面を <Activity> で隠したまま DOM に残すので、同じ testid が複数ある場合がある。
 */
function byTestId(page: Page, testId: string) {
  return page.getByTestId(testId).filter({ visible: true });
}

/** グループを作ってグループのページを開く */
async function createGroup(page: Page, name: string, members: string[]): Promise<string> {
  await page.goto("/");
  await page.getByRole("textbox", { name: "グループ名" }).fill(name);

  for (const [index, member] of members.entries()) {
    if (index >= 2) {
      await page.getByRole("button", { name: "＋ メンバーを追加" }).click();
    }

    await page.getByRole("textbox", { name: `メンバー${index + 1}の名前` }).fill(member);
  }

  await page.getByRole("button", { name: "グループを作る" }).click();
  await page.waitForURL(/\/g\/[A-Za-z0-9_-]{21,}$/);
  await expect(byTestId(page, "group-name")).toHaveText(name);

  return page.url();
}

type PaymentOptions = {
  title: string;
  amount: string;
  currency?: string;
  payer?: string;
  /** 負担から外す人 */
  exclude?: string[];
};

/** 記録画面を開いて入力する（保存はしない） */
async function fillPayment(page: Page, options: PaymentOptions): Promise<void> {
  await page.getByRole("link", { name: "＋ 立て替えを記録する" }).click();
  await expect(page.getByRole("heading", { name: "立て替えを記録" })).toBeVisible();

  await page.getByRole("textbox", { name: "内容" }).fill(options.title);

  if (options.currency) {
    await page.getByRole("combobox", { name: "通貨" }).selectOption(options.currency);
  }

  await page.getByRole("textbox", { name: "金額" }).fill(options.amount);

  if (options.payer) {
    await page.getByRole("radiogroup", { name: "立て替えた人" }).getByText(options.payer, { exact: true }).click();
  }

  for (const name of options.exclude ?? []) {
    const group = page.getByRole("group", { name: /負担する人/ });

    // 利用者と同じように、チップ（ラベル）をタップする
    await group.locator("label", { has: page.getByRole("checkbox", { name, exact: true }) }).click();
    await expect(group.getByRole("checkbox", { name, exact: true })).not.toBeChecked();
  }
}

async function addPayment(page: Page, options: PaymentOptions): Promise<void> {
  await fillPayment(page, options);
  await page.getByRole("button", { name: "記録する" }).click();
  await expect(byTestId(page, "group-name")).toBeVisible();
}

// -----------------------------------------------------------------------------
// テスト
// -----------------------------------------------------------------------------

test("グループを作って、円の立て替えを記録すると精算結果が出る", async ({ page }) => {
  await createGroup(page, "温泉旅行", ["あおい", "ひろ", "けん"]);

  // まだ記録がない
  await expect(page.getByText("立て替えを記録すると、ここに")).toBeVisible();

  // JPY のままなら、レートの表示は出ない
  await fillPayment(page, { title: "旅館", amount: "1000" });
  await expect(byTestId(page, "rate-preview")).toHaveCount(0);
  await page.getByRole("button", { name: "記録する" }).click();

  // 1000 円を 3 人で割ると 334 / 333 / 333
  await expect(byTestId(page, "total-jpy")).toHaveText("¥1,000");

  const transfers = byTestId(page, "transfers");

  await expect(transfers.getByRole("listitem")).toHaveCount(2);
  await expect(transfers).toContainText("ひろ→あおい");
  await expect(transfers).toContainText("¥333");

  const balances = byTestId(page, "balances");

  await expect(balances.getByRole("row", { name: /あおい/ })).toContainText("¥1,000¥334+¥666");
  await expect(balances.getByRole("row", { name: /ひろ/ })).toContainText("¥0¥333-¥333");

  // トップページの「最近使ったグループ」に出る
  await page.goto("/");
  await expect(page.getByRole("link", { name: "温泉旅行" })).toBeVisible();
});

test("外貨は換算のプレビューを出し、保存した時点のレートで円に換算する", async ({ page }) => {
  await createGroup(page, "NY旅行", ["A", "B"]);

  await fillPayment(page, { title: "ディナー", amount: "50", currency: "USD" });

  // 「1 USD = 152.34 円（YYYY-MM-DD 時点）→ 7,617 円」
  await expect(byTestId(page, "rate-equation")).toContainText(/1 USD = 152\.34 円（\d{4}-\d{2}-\d{2} 時点）/);
  await expect(byTestId(page, "preview-jpy")).toHaveText("7,617 円");
  await expect(byTestId(page, "rate-preview")).toContainText(/\d+月\d+日時点の参考レート/);

  // 小数点以下の桁が多すぎる
  await page.getByRole("textbox", { name: "金額" }).fill("1.234");
  await page.getByRole("button", { name: "記録する" }).click();
  await expect(page.getByText("USDは小数点以下2桁までです")).toBeVisible();

  await page.getByRole("textbox", { name: "金額" }).fill("50");
  await page.getByRole("button", { name: "記録する" }).click();

  // 一覧に「USD 50.00 → ¥7,617」
  const row = byTestId(page, "payment-row").first();

  await expect(row).toContainText("USD 50.00 →");
  await expect(row).toContainText("¥7,617");
  await expect(row).toContainText("1 USD = 152.34 円");
  await expect(byTestId(page, "total-jpy")).toHaveText("¥7,617");

  // 次の記録は、前回使った通貨（USD）が初期値になる
  await page.getByRole("link", { name: "＋ 立て替えを記録する" }).click();
  await expect(page.getByRole("combobox", { name: "通貨" })).toHaveValue("USD");
});

test("レートを手動で上書きすると「手動」と表示される", async ({ page }) => {
  await createGroup(page, "ソウル", ["A", "B"]);

  await fillPayment(page, { title: "焼肉", amount: "50000", currency: "KRW" });
  await expect(byTestId(page, "preview-jpy")).toHaveText("5,415 円");

  await page.getByRole("button", { name: "レートを手動で入力" }).click();
  await page.getByRole("textbox", { name: /1 KRW あたりの円/ }).fill("0.11");
  await expect(byTestId(page, "preview-jpy")).toHaveText("5,500 円");
  await expect(byTestId(page, "rate-preview")).toContainText("手動");

  await page.getByRole("button", { name: "記録する" }).click();

  const row = byTestId(page, "payment-row").first();

  await expect(row).toContainText("¥5,500");
  await expect(row).toContainText("手動");
});

test("編集してもレートは保たれ、「最新レートで再計算」で取り直せる", async ({ page }) => {
  await createGroup(page, "パリ", ["A", "B"]);

  // 手動レートで記録
  await fillPayment(page, { title: "美術館", amount: "20", currency: "EUR" });
  await page.getByRole("button", { name: "レートを手動で入力" }).click();
  await page.getByRole("textbox", { name: /1 EUR あたりの円/ }).fill("170");
  await page.getByRole("button", { name: "記録する" }).click();
  await expect(byTestId(page, "payment-row").first()).toContainText("¥3,400");

  // 編集: 金額を変えても、保存したときのレート（170）のまま
  await byTestId(page, "payment-row").first().click();
  await expect(page.getByRole("heading", { name: "立て替えを編集" })).toBeVisible();
  await expect(byTestId(page, "rate-preview")).toContainText("保存したときのレートのまま");
  await page.getByRole("textbox", { name: "金額" }).fill("30");
  await expect(byTestId(page, "preview-jpy")).toHaveText("5,100 円");
  await page.getByRole("button", { name: "保存する" }).click();
  await expect(byTestId(page, "payment-row").first()).toContainText("¥5,100");

  // 「最新レートで再計算」で参考レート（165.5）に
  await byTestId(page, "payment-row").first().click();
  await page.getByRole("button", { name: "最新レートで再計算" }).click();
  await expect(byTestId(page, "rate-equation")).toContainText("1 EUR = 165.5 円");
  await expect(byTestId(page, "preview-jpy")).toHaveText("4,965 円");
  await page.getByRole("button", { name: "保存する" }).click();

  const row = byTestId(page, "payment-row").first();

  await expect(row).toContainText("¥4,965");
  await expect(row).not.toContainText("手動");
});

test("レートを取得できない通貨は手動入力に切り替わり、そのまま保存できる", async ({ page }) => {
  await createGroup(page, "カイロ", ["A", "B"]);

  await fillPayment(page, { title: "タクシー", amount: "100", currency: "EGP" });
  await expect(page.getByText("為替レートを取得できませんでした。レートを手動で入力してください。")).toBeVisible();

  await page.getByRole("textbox", { name: /1 EGP あたりの円/ }).fill("3.1");
  await expect(byTestId(page, "preview-jpy")).toHaveText("310 円");
  await page.getByRole("button", { name: "記録する" }).click();

  await expect(byTestId(page, "payment-row").first()).toContainText("EGP 100.00 →");
  await expect(byTestId(page, "payment-row").first()).toContainText("¥310");
});

test("ExchangeRate-API のレートを使うとフッターに出典を出す（KWD は 3 桁）", async ({ page }) => {
  await createGroup(page, "クウェート", ["A", "B"]);
  await expect(byTestId(page, "exchangerate-api-credit")).toHaveCount(0);

  await fillPayment(page, { title: "ホテル", amount: "1.234", currency: "KWD" });
  // 1.234 × 496.12 = 612.21208 → 612 円
  await expect(byTestId(page, "preview-jpy")).toHaveText("612 円");
  await expect(byTestId(page, "exchangerate-api-credit")).toBeVisible();
  await page.getByRole("button", { name: "記録する" }).click();

  await expect(byTestId(page, "payment-row").first()).toContainText("KWD 1.234 →");
  await expect(byTestId(page, "exchangerate-api-credit")).toBeVisible();
});

test("負担する人を外した支払いと、立て替えの削除", async ({ page }) => {
  await createGroup(page, "BBQ", ["A", "B", "C"]);

  // A が 3000 円、C は対象外 → B が A に 1500 円
  await addPayment(page, { title: "お肉", amount: "3000", exclude: ["C"] });

  const transfers = byTestId(page, "transfers");

  await expect(transfers.getByRole("listitem")).toHaveCount(1);
  await expect(transfers).toContainText("B→A¥1,500");
  await expect(byTestId(page, "payment-row").first()).toContainText("A、B");

  // 削除
  page.once("dialog", (dialog) => void dialog.accept());
  await byTestId(page, "payment-row").first().click();
  await page.getByRole("button", { name: "この立て替えを削除" }).click();
  await expect(byTestId(page, "group-name")).toBeVisible();
  await expect(byTestId(page, "payment-row")).toHaveCount(0);
  await expect(byTestId(page, "total-jpy")).toHaveText("¥0");
});

test("メンバーの追加・名前の変更、支払いに関わる人は削除できない", async ({ page }) => {
  await createGroup(page, "合宿", ["A", "B"]);
  await addPayment(page, { title: "お弁当", amount: "800" });

  const members = byTestId(page, "members");

  // 追加
  await page.getByRole("textbox", { name: "追加するメンバーの名前" }).fill("C");
  await page.getByRole("button", { name: "追加", exact: true }).click();
  await expect(members.getByRole("listitem")).toHaveCount(3);

  // 名前の変更
  await page.getByRole("button", { name: "C の名前を変える" }).click();
  await page.getByRole("textbox", { name: "C の新しい名前" }).fill("ちひろ");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(members).toContainText("ちひろ");

  // 支払いに関わる A と B は削除できない。関わっていない「ちひろ」は削除できる
  await expect(page.getByRole("button", { name: "A を削除" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "B を削除" })).toBeDisabled();

  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "ちひろ を削除" }).click();
  await expect(members.getByRole("listitem")).toHaveCount(2);
});

test("精算結果をテキストでコピーできる", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);

  const url = await createGroup(page, "飲み会", ["A", "B"]);

  await addPayment(page, { title: "一次会", amount: "6000" });
  await page.getByRole("button", { name: "テキストでコピー" }).click();
  await expect(page.getByText("精算結果をコピーしました")).toBeVisible();

  const text = await page.evaluate(() => navigator.clipboard.readText());

  expect(text).toContain("【飲み会】の精算");
  expect(text).toContain("B → A：¥3,000");
  expect(text).toContain(url);
});

test("他の人の記録が、同じ URL を開いている画面に反映される", async ({ page, browser }) => {
  const url = await createGroup(page, "共有テスト", ["A", "B"]);

  // 別の人（別のブラウザ）が同じ URL を開く
  const other = await browser.newContext();
  const otherPage = await other.newPage();

  await otherPage.goto(url);
  await expect(byTestId(otherPage, "payment-row")).toHaveCount(0);

  // こちらで記録する
  await addPayment(page, { title: "ランチ", amount: "2000" });

  // 相手の画面がタブに戻ってきた（Realtime がないときの補い）→ 取り直して反映される
  await otherPage.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(byTestId(otherPage, "payment-row")).toHaveCount(1);
  await expect(byTestId(otherPage, "total-jpy")).toHaveText("¥2,000");

  await other.close();
});

test("存在しないグループは「見つかりません」を出し、検索エンジンに載せない", async ({ page }) => {
  await page.goto("/g/doesnotexist_doesnotexist");

  await expect(page.getByText("ページが見つかりません")).toBeVisible();
  await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();
});
