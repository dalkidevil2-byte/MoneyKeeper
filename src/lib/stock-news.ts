/**
 * 종목 뉴스 검색 — Google News RSS 사용 (무료, 인증 X, 한글 잘 잡힘).
 * URL: https://news.google.com/rss/search?q=KEYWORD&hl=ko&gl=KR&ceid=KR:ko
 */

export type NewsItem = {
  title: string;
  publisher: string;
  link: string;
  publishedAt: string; // ISO
};

/**
 * Google News RSS 호출. ticker 보다 회사명으로 검색해야 정확.
 * keyword 가 null/빈 문자열이면 빈 배열.
 */
export async function searchStockNews(
  keyword: string,
  limit = 5,
): Promise<NewsItem[]> {
  if (!keyword || !keyword.trim()) return [];
  try {
    const q = encodeURIComponent(keyword.trim());
    const url = `https://news.google.com/rss/search?q=${q}&hl=ko&gl=KR&ceid=KR:ko`;
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
      },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRssItems(xml).slice(0, limit);
  } catch {
    return [];
  }
}

function parseRssItems(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
  // <item> ... </item> 단위로 추출
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRegex.exec(xml)) !== null) {
    const block = m[1];
    const title = extractCData(block, 'title') ?? extractTag(block, 'title') ?? '';
    const link = extractTag(block, 'link') ?? '';
    const pub = extractTag(block, 'pubDate') ?? '';
    // Google RSS 의 source 가 publisher 역할
    const sourceMatch = /<source[^>]*>([\s\S]*?)<\/source>/.exec(block);
    const publisher = sourceMatch ? stripCData(sourceMatch[1]).trim() : '';

    if (title) {
      items.push({
        title: decodeHtml(title.trim()),
        publisher,
        link: link.trim(),
        publishedAt: pub ? new Date(pub).toISOString() : '',
      });
    }
  }
  return items;
}

function extractTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`);
  const m = re.exec(xml);
  return m ? stripCData(m[1]) : null;
}
function extractCData(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`);
  const m = re.exec(xml);
  return m ? m[1] : null;
}
function stripCData(s: string): string {
  return s.replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '');
}
function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}
