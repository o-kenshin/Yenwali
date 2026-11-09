import type { MetadataRoute } from "next";

import { getSiteUrl } from "@/lib/site-url";

/**
 * sitemap.xml
 *
 * 検索エンジンに載せるのはトップページだけ。
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: getSiteUrl(),
      changeFrequency: "monthly",
      priority: 1,
    },
  ];
}
