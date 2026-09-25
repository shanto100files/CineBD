import {Post, ProviderContext} from '../types';
import {throwProviderError} from '../providerErrors';

const BASE_URL = 'https://mmsvibex.fit';

const defaultHeaders = {
  'User-Agent':
    'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  Pragma: 'no-cache',
  'Cache-Control': 'no-cache',
};

function buildUrl(filter: string, page: number, query: string): string {
  if (query && query.trim()) {
    return `${BASE_URL}/?s=${encodeURIComponent(query.trim())}${
      page > 1 ? `&paged=${page}` : ''
    }`;
  }
  if (filter) {
    if (filter.startsWith('filter=')) {
      // Home sort tabs: /?filter=popular
      return `${BASE_URL}/?${filter}`;
    }
    const clean = filter.replace(/\/$/, '');
    return `${BASE_URL}/${clean}${page > 1 ? `/page/${page}` : ''}/`;
  }
  return `${BASE_URL}/${page > 1 ? `page/${page}/` : ''}`;
}

interface CardInfo {
  link: string;
  title: string;
  image: string;
  duration?: string;
  views?: string;
}

function extractCards(
  html: string,
  cheerio: ProviderContext['cheerio'],
): CardInfo[] {
  const $ = cheerio.load(html);
  const cards: CardInfo[] = [];
  const seen = new Set<string>();

  $(
    'article.thumb-block, article.post, div.thumb-block, div.video-item, div.post-item',
  ).each((_, el) => {
    const card = $(el);
    // Actor/actor-listing cards link to ?actors=... — skip them.
    const href = card.find('a[href]').first().attr('href') || '';
    if (!href || href.includes('?actors=') || href.includes('/actor/')) {
      return;
    }
    let link = href.startsWith('http')
      ? href
      : `${BASE_URL}${href.startsWith('/') ? '' : '/'}${href}`;
    try {
      const u = new URL(link);
      link = `${u.pathname}${u.search}`;
    } catch {}

    const title =
      card.find('a[title]').first().attr('title')?.trim() ||
      card.find('.title').first().text().replace(/\s+/g, ' ').trim() ||
      card.find('span.title').first().text().trim();
    if (!title) {
      return;
    }

    const img =
      card.find('img').first().attr('data-src') ||
      card.find('img').first().attr('src') ||
      '';
    // Skip lazy-load placeholder pixel
    const image =
      img && !img.includes('px.gif') ? (img.startsWith('http') ? img : `${BASE_URL}/${img.replace(/^\//, '')}`) : '';

    const duration = card
      .find('.duration')
      .first()
      .text()
      .replace(/\s+/g, ' ')
      .trim();
    const views = card
      .find('.views')
      .first()
      .text()
      .replace(/\s+/g, ' ')
      .replace(/[^\d.,KM]/gi, '')
      .trim();

    if (seen.has(link)) {
      return;
    }
    seen.add(link);
    cards.push({link, title, image, duration, views});
  });

  return cards;
}

export const getPosts = async function ({
  filter,
  page = 1,
  signal,
  providerContext,
}: {
  filter?: string;
  page?: number;
  signal?: AbortSignal;
  providerContext: ProviderContext;
}): Promise<Post[]> {
  try {
    const {axios} = providerContext;
    const url = buildUrl(filter || '', page, '');
    const res = await axios.get(url, {
      headers: defaultHeaders,
      signal,
      timeout: 20000,
    });
    const cards = extractCards(String(res.data || ''), providerContext.cheerio);
    return cards.map(c => ({
      title: c.title,
      link: c.link,
      image: c.image,
      banner: c.image,
    }));
  } catch (err) {
    throwProviderError('MmsVibeX 18+', 'posts', err);
  }
};

export const getSearchPosts = async function ({
  searchQuery,
  page = 1,
  signal,
  providerContext,
}: {
  searchQuery: string;
  page?: number;
  signal?: AbortSignal;
  providerContext: ProviderContext;
}): Promise<Post[]> {
  try {
    const {axios} = providerContext;
    const url = buildUrl('', page, searchQuery);
    const res = await axios.get(url, {
      headers: defaultHeaders,
      signal,
      timeout: 20000,
    });
    const cards = extractCards(String(res.data || ''), providerContext.cheerio);
    return cards.map(c => ({
      title: c.title,
      link: c.link,
      image: c.image,
      banner: c.image,
    }));
  } catch (err) {
    throwProviderError('MmsVibeX 18+', 'search posts', err);
  }
};
