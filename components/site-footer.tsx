/**
 * フッター
 *
 * ExchangeRate-API の Open Access は、利用条件で出典表示が必要。
 * そのレートを使っている（または使おうとしている）ときは、リンクを出す。
 */

export function SiteFooter({ showExchangeRateApiCredit = false }: { showExchangeRateApiCredit?: boolean }) {
  return (
    <footer className="mx-auto w-full max-w-xl px-4 pb-32 pt-8 text-xs leading-relaxed text-muted">
      <p>
        為替レートは1日1回更新の参考レート（仲値）です。実際のカード会社や両替所のレートとは異なります。
      </p>
      <p className="mt-1">
        レート提供:{" "}
        <a href="https://frankfurter.dev" target="_blank" rel="noopener noreferrer" className="underline">
          Frankfurter
        </a>
        {showExchangeRateApiCredit && (
          <>
            {" / "}
            <a
              href="https://www.exchangerate-api.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
              data-testid="exchangerate-api-credit"
            >
              Rates By Exchange Rate API
            </a>
          </>
        )}
      </p>
      <p className="mt-3">© Yenwali</p>
    </footer>
  );
}
