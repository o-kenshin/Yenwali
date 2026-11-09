import type { MetadataRoute } from "next";

import { getSiteUrl } from "@/lib/site-url";

/**
 * robots.txt
 *
 * - トップページは検索エンジンに載せる
 * - API はクロールさせない
 * - グループのページ（/g/...）はここでは拒否しない。
 *   拒否するとクローラーがページの noindex を読めず、URL だけが検索結果に載ることがあるため。
 *   ページ側の noindex で検索結果から外す
 */
export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: "/api/",
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
