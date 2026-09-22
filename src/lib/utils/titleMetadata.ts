import {Post} from '../../lib/providers/types';

export interface TitleMeta {
  quality: string[];
  language: string[];
  year?: string;
  isSeries: boolean;
  format: string[];
}

const QUALITY_PATTERNS: Array<[RegExp, string]> = [
  [/\b4k\b|\b2160p\b|\b2160\b/i, '4K'],
  [/\b1080p?\b/i, '1080p'],
  [/\b720p?\b/i, '720p'],
  [/\b480p?\b/i, '480p'],
  [/\b360p?\b/i, '360p'],
  [/hevc|\b265\b/i, 'HEVC'],
  [/web-?dl|webdl|web\s*rip|webrip/i, 'WEB-DL'],
  [/bluray|blu-ray|\bbrrip\b/i, 'BluRay'],
  [/\bhdr\b|\bhdr10\b|\bhdr10\+\b/i, 'HDR'],
];

const LANGUAGE_PATTERNS: Array<[RegExp, string]> = [
  [/\bhindi\b/i, 'Hindi'],
  [/\bbengali\b|\bbangla\b/i, 'Bengali'],
  [/\benglish\b/i, 'English'],
  [/\btamil\b/i, 'Tamil'],
  [/\btelugu\b/i, 'Telugu'],
  [/\bmalayalam\b/i, 'Malayalam'],
  [/\bpunjabi\b/i, 'Punjabi'],
  [/\bkorean\b/i, 'Korean'],
  [/\bjapanese\b/i, 'Japanese'],
  [/\bchinese\b|\bmandarin\b/i, 'Chinese'],
  [/\bspanish\b/i, 'Spanish'],
  [/\brussian\b/i, 'Russian'],
  [/dual\s*audio|\bdual\b/i, 'Dual Audio'],
  [/\borg\b/i, 'ORG'],
];

const FORMAT_PATTERNS: Array<[RegExp, string]> = [
  [/web-?dl|webdl/i, 'WEB-DL'],
  [/bluray|blu-ray|\bbrrip\b|\bbdrip\b/i, 'BluRay'],
  [/web\s*rip|webrip/i, 'WEBRip'],
  [/\bhdcam\b|\bhdts\b/i, 'HDCam'],
  [/\bhevc\b/i, 'HEVC'],
  [/\besub?s?\b/i, 'ESub'],
];

export function extractTitleMeta(post: Post): TitleMeta {
  const title = post.title || '';

  const quality = QUALITY_PATTERNS.filter(([re]) => re.test(title)).map(
    ([, label]) => label,
  );

  const language = LANGUAGE_PATTERNS.filter(([re]) => re.test(title)).map(
    ([, label]) => label,
  );

  const yearMatch = title.match(/\b(19|20)\d{2}\b/);
  const year = yearMatch ? yearMatch[0] : undefined;

  const isSeries =
    /\bseries\b|\bseason\b|\bs\d{1,2}\b|\be\d{1,3}\b|\bepisode\b|\btv\b/i.test(
      title,
    ) || /\bseries\b|\bseason\b|\btv\b/i.test(post.link || '');

  const format = FORMAT_PATTERNS.filter(([re]) => re.test(title)).map(
    ([, label]) => label,
  );

  return {quality, language, year, isSeries, format};
}

export function getUniqueValues(posts: Post[], key: 'quality' | 'language'): string[] {
  const set = new Set<string>();
  for (const p of posts) {
    for (const v of extractTitleMeta(p)[key]) {
      set.add(v);
    }
  }
  return Array.from(set);
}

export function getUniqueYears(posts: Post[]): string[] {
  const set = new Set<string>();
  for (const p of posts) {
    const y = extractTitleMeta(p).year;
    if (y) set.add(y);
  }
  return Array.from(set).sort((a, b) => b.localeCompare(a));
}

export type SortMode = 'relevance' | 'title' | 'year' | 'quality';

export function sortPosts(posts: Post[], mode: SortMode): Post[] {
  const arr = [...posts];
  switch (mode) {
    case 'title':
      return arr.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    case 'year':
      return arr.sort((a, b) => {
        const ya = extractTitleMeta(a).year || '0';
        const yb = extractTitleMeta(b).year || '0';
        return yb.localeCompare(ya);
      });
    case 'quality':
      return arr.sort((a, b) => {
        const rank = (p: Post) => {
          const q = extractTitleMeta(p).quality;
          if (q.includes('4K')) return 4;
          if (q.includes('1080p')) return 3;
          if (q.includes('720p')) return 2;
          if (q.includes('480p')) return 1;
          return 0;
        };
        return rank(b) - rank(a);
      });
    default:
      return arr;
  }
}
