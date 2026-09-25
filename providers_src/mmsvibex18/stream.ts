import {ProviderContext, Stream} from '../types';
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

function resolveUrl(href: string): string {
  if (!href) {
    return '';
  }
  return href.startsWith('http') ? href : `${BASE_URL}/${href.replace(/^\//, '')}`;
}

/**
 * The post page embeds a video-js player:
 *   <video id="wpst-video" poster="...thumb.jpg">
 *     <source src="https://cdn.mmsvibex.net/processed/<id>_final.mp4?v=..." type="video/mp4">
 *   </video>
 * The CDN serves the file without referer checks and supports range requests,
 * so the extracted mp4 plays/download directly.
 */
export const getStream = async function ({
  link,
  providerContext,
}: {
  link: string;
  type: string;
  signal?: AbortSignal;
  providerContext: ProviderContext;
  isDownload?: boolean;
}): Promise<Stream[]> {
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

    const streams: Stream[] = [];
    const seen = new Set<string>();

    // 1) Main player source (full video)
    $('video#wpst-video source, video source').each((_, el) => {
      const src = $(el).attr('src') || '';
      const type = ($(el).attr('type') || 'video/mp4').toLowerCase();
      if (!src || seen.has(src) || !type.includes('mp4')) {
        return;
      }
      seen.add(src);
      streams.push({
        server: 'MmsVibeX',
        link: resolveUrl(src),
        type: 'mp4',
        quality: '720',
      });
    });

    // 2) Fallback: any processed mp4 on the page (the full file, not trailers)
    if (streams.length === 0) {
      const mp4s = html.match(
        /https?:\/\/[^"'\s]+\/processed\/[^"'\s]+\.mp4[^"'\s]*/g,
      );
      if (mp4s) {
        for (const mp4 of [...new Set(mp4s)]) {
          if (!seen.has(mp4)) {
            seen.add(mp4);
            streams.push({
              server: 'MmsVibeX',
              link: mp4,
              type: 'mp4',
              quality: '720',
            });
          }
        }
      }
    }

    if (streams.length === 0) {
      throw new Error('No playable video found on page');
    }

    // Highest-quality first (single-quality source today, kept for safety)
    return streams;
  } catch (err) {
    throwProviderError('MmsVibeX 18+', 'stream', err);
  }
};
