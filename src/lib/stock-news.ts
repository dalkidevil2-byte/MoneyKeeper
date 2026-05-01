/**
 * 종목 뉴스 검색.
 * - Yahoo Finance Search API (비공식, 가끔 막힘)
 * - 폴백: 검색 결과 비어있으면 빈 배열
 */

import { yfHeaders } from './stock-quote';

export type NewsItem = {
  title: string;
  publisher: string;
  link: string;
  publishedAt: string; // ISO
};

export async function searchStockNews(
  ticker: string,
  limit = 5,
): Promise<NewsItem[]> {
  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(ticker)}&newsCount=${limit}&quotesCount=0`;
    const res = await fetch(url, { headers: yfHeaders() });
    if (!res.ok) return [];
    const j = await res.json();
    const news = (j.news ?? []) as Array<{
      title: string;
      publisher: string;
      link: string;
      providerPublishTime: number;
    }>;
    return news.slice(0, limit).map((n) => ({
      title: n.title,
      publisher: n.publisher,
      link: n.link,
      publishedAt: new Date(n.providerPublishTime * 1000).toISOString(),
    }));
  } catch {
    return [];
  }
}
