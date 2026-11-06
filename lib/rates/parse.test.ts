import { describe, expect, it } from "vitest";

import { parseExchangeRateApiResponse, parseFrankfurterResponse } from "./parse";

describe("parseFrankfurterResponse", () => {
  it("実際のレスポンスの形を読める", () => {
    const body = '{"date":"2026-11-06","base":"USD","quote":"JPY","rate":158.28}';

    expect(parseFrankfurterResponse(body, "USD")).toEqual({ rate: "158.28", rateDate: "2026-11-06" });
  });

  it("桁の多いレートを浮動小数点にせずそのまま読む", () => {
    const body = '{"date":"2026-11-06","base":"VND","quote":"JPY","rate":0.0061642}';

    expect(parseFrankfurterResponse(body, "VND")?.rate).toBe("0.0061642");
  });

  it("指数表記のレートも読める", () => {
    const body = '{"date":"2026-11-06","base":"IRR","quote":"JPY","rate":3.7e-3}';

    expect(parseFrankfurterResponse(body, "IRR")?.rate).toBe("0.0037");
  });

  it("エラーや別の通貨のレスポンスは null", () => {
    expect(parseFrankfurterResponse('{"status":422,"message":"invalid currency: XXX"}', "XXX")).toBeNull();
    expect(parseFrankfurterResponse('{"date":"2026-11-06","base":"EUR","quote":"JPY","rate":1}', "USD")).toBeNull();
    expect(parseFrankfurterResponse("<html>", "USD")).toBeNull();
    expect(parseFrankfurterResponse('{"date":"2026-11-06","base":"USD","quote":"JPY","rate":0}', "USD")).toBeNull();
  });
});

describe("parseExchangeRateApiResponse", () => {
  it("rates.JPY と更新日を読む", () => {
    const body =
      '{"result":"success","time_last_update_unix":1793923351,"base_code":"USD","rates":{"USD":1,"EUR":0.92,"JPY":158.2051,"KRW":1450.5}}';

    expect(parseExchangeRateApiResponse(body, "USD")).toEqual({ rate: "158.2051", rateDate: "2026-11-06" });
  });

  it("失敗のレスポンスは null", () => {
    expect(parseExchangeRateApiResponse('{"result":"error","error-type":"unsupported-code"}', "XXX")).toBeNull();
    expect(
      parseExchangeRateApiResponse('{"result":"success","time_last_update_unix":1,"base_code":"USD","rates":{"USD":1}}', "USD"),
    ).toBeNull();
  });
});
