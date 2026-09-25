import {Info, Link, ProviderContext} from '../types';
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

function parseDuration(text?: string): string {
  // "08:44" -> "8m 44s" style readable label
  const m = text?.match(/(\d+):(\d{2})(?::(\d{2}))?/);
  if (!m) {
    return '';
  }
  if (m[3]) {
    return `${Number(m[1])}h ${m[2]}m ${m[3]}s`;
  }
  return `${Number(m[1])}m ${m[2]}s`;
}

export const getMeta = async function ({
  link,
  providerContext,
}: {
  link: string;
  providerContext: ProviderContext;
}): Promise<Info> {
  try {
    const {axios, cheerio} = providerContext;
    const pageUrl = link.startsWith('http')
      ? link
      : `${BASE_URL}/${link.replace(/^\//, '')}`;
    const res = await axios.get(pageUrl, {
      headers: defaultHeaders,
      timeout: 20000,
    });
    const html = String(res.data || '');
    const $ = cheerio.load(html);

    const title =
      $('h1.entry-title').first().text().replace(/\s+/g, ' ').trim() ||
      (() => {
        const h1 = $('h1').first().text().replace(/\s+/g, ' ').trim();
        if (h1) return h1;
        const t = $('meta[property="og:title"]').attr('content')?.trim() || '';
        return t.replace(/\s*-\s*Watch.*$/i, '').trim();
      })() ||
      'Unknown';

    const image =
      $('meta[property="og:image"]').attr('content')?.trim() ||
      $('video#wpst-video').attr('poster')?.trim() ||
      '';

    const synopsis =
      $('meta[property="og:description"]').attr('content')?.trim() ||
      $('meta[name="description"]').attr('content')?.trim() ||
      '';

    const durationText = parseDuration(
      $('span.duration').first().text().trim(),
    );

    const tags = $('a[href*="/tag/"], a[href*="/category/"]')
      .map((_, el) =>
        $(el).text().replace(/\s+/g, ' ').trim(),
      )
      .get()
      .filter(t => t && t.length < 30);

    const cast = $('a[href*="/actor/"]')
      .map((_, el) => $(el).text().replace(/\s+/g, ' ').trim())
      .get()
      .filter(t => t && t.length < 40);

    // Single video post: one "Watch" link that carries the post URL; the
    // stream module extracts the CDN mp4 from the page.
    const linkList: Link[] = [
      {
        title: durationText ? `Watch${durationText ? ` • ${durationText}` : ''}` : 'Watch',
        quality: '',
        directLinks: [
          {
            title,
            link: pageUrl,
            type: 'movie',
            description: synopsis?.slice(0, 140) || '',
            image,
          },
        ],
      },
    ];

    return {
      title,
      synopsis: synopsis || 'No synopsis available',
      image,
      type: 'movie',
      linkList,
      tags: [...new Set(tags)].slice(0, 10),
      cast: [...new Set(cast)].slice(0, 10),
      webUrl: pageUrl,
    };
  } catch (err) {
    throwProviderError('MmsVibeX 18+', 'metadata', err);
  }
};
