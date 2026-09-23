import {ProviderSource} from '../storage/extensionStorage';
import {Post} from '../providers/types';

export const formatName = (name: string): string => {
  // Replace special characters with an underscore
  return name.replaceAll(/[^a-zA-Z0-9]/g, '_');
};

const DEFAULT_REPO_NAME = 'vega-providers';
const DEFAULT_BRANCH = 'main';
const RAW_GITHUB_HOST = 'raw.githubusercontent.com';
const GITHUB_HOST = 'github.com';

const normalizeUrl = (url: string): string => {
  return url.trim().replace(/\/+$/, '');
};

const buildRawGithubUrl = (
  author: string,
  repo = DEFAULT_REPO_NAME,
  branch = DEFAULT_BRANCH,
): string => {
  return `https://${RAW_GITHUB_HOST}/${author}/${repo}/refs/heads/${branch}`;
};

type ParsedGithubSource = {
  author: string;
  repo: string;
  branch: string;
};

const parseRawGithubUrl = (url: URL): ParsedGithubSource | null => {
  if (url.hostname !== RAW_GITHUB_HOST) {
    return null;
  }

  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length < 4) {
    return null;
  }

  const author = segments[0];
  const repo = segments[1];
  let branch = DEFAULT_BRANCH;

  if (
    segments[2] === 'refs' &&
    segments[3] === 'heads' &&
    segments.length > 4
  ) {
    branch = decodeURIComponent(segments.slice(4).join('/'));
  }

  if (!author || !repo) {
    return null;
  }

  return {author, repo, branch};
};

const parseGithubRepoUrl = (url: URL): ParsedGithubSource | null => {
  if (url.hostname !== GITHUB_HOST) {
    return null;
  }

  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length < 2) {
    return null;
  }

  const author = segments[0];
  const repo = segments[1];
  let branch = DEFAULT_BRANCH;

  if (segments[2] === 'tree' && segments.length > 3) {
    branch = decodeURIComponent(segments.slice(3).join('/'));
  }

  if (!author || !repo) {
    return null;
  }

  return {author, repo, branch};
};

export const createProviderSource = (value: string): ProviderSource => {
  const input = value.trim();
  if (!input) {
    throw new Error('Provider source value is required');
  }

  const isUrlInput = /^https?:\/\//i.test(input);

  if (isUrlInput) {
    let parsed: URL;
    try {
      parsed = new URL(input);
    } catch {
      throw new Error('Invalid provider source URL');
    }

    if (parsed.hostname === 'cinepix.top') {
      return {
        author: 'Cinepix',
        url: input,
        isDefault: false,
      };
    }

    const parsedSource =
      parseRawGithubUrl(parsed) || parseGithubRepoUrl(parsed);
    if (!parsedSource) {
      throw new Error(
        'Only github.com or raw.githubusercontent.com provider source URLs are supported',
      );
    }

    return {
      author: parsedSource.author,
      url: buildRawGithubUrl(
        parsedSource.author,
        parsedSource.repo,
        parsedSource.branch,
      ),
      isDefault: false,
    };
  }

  const author = input.replace(/^@/, '').trim();
  if (!author) {
    throw new Error('Invalid GitHub author name');
  }

  return {
    author,
    url: buildRawGithubUrl(author),
    isDefault: false,
  };
};

export function getPostBadge(post: Post): string | undefined {
  const title = post.title || '';
  const link = post.link || '';
  const providerName = (post.provider || '').toLowerCase();

  if (providerName.includes('4khdhub')) return '4K';

  // 4K/UHD is the strongest selling point — show it over language.
  if (/\b4k\b|\b2160p\b|\b2160\b|\buhd\b/i.test(title)) return '4K';

  // Primary (top) badge: language wins for series titles, then quality/4K.
  // Season info is NOT decided here - see getSeasonBadge (rendered below).
  if (/\[Hindi\]|\bHindi\b/i.test(title)) return 'Hindi';
  if (/\[Tamil\]|\bTamil\b/i.test(title)) return 'Tamil';
  if (/\[Telugu\]|\bTelugu\b/i.test(title)) return 'Telugu';
  if (/\[Bengali\]|\bBengali\b/i.test(title)) return 'Bengali';
  if (/\[English\]|\bEnglish\b/i.test(title)) return 'English';
  if (/\[Dual\]|\bDual\b/i.test(title)) return 'Dual';

  if (post.episodeCount) {
    return `Ep ${post.episodeCount}`;
  }
  if (post.quality && !['4', '1', '2', '3'].includes(post.quality)) {
    return post.quality;
  }

  const epMatch = title.match(/episode\s*(\d+)/i) || title.match(/ep\.?\s*(\d+)/i);
  if (epMatch) {
    return `Ep ${epMatch[1]}`;
  }

  if (/series|tv|season|episode/i.test(link) || /series|tv|season|episode/i.test(title)) {
    return 'Series';
  }

  if (/\b(2160p|1080p|720p|hdcam|hd)\b/i.test(title)) {
    const q = title.match(/\b(2160p|1080p|720p|hdcam|hd)\b/i);
    return q ? q[1].toUpperCase() : undefined;
  }

  return undefined;
}

/**
 * Season-only badge (S01, S03, S01-S04) rendered UNDER the language badge.
 * Covers every provider format seen in the wild:
 *  - totalSeasons/seasonCount fields
 *  - "S01-S05" and "(Season 1 – 3)" ranges
 *  - "S03E05" combined tokens
 *  - "Season 2" / "S3" in the title
 *  - slugs: "-season-3", "-s2-", "-s4", MovieNest style trailing "-2"/"-4"
 *    (only for confirmed series posts, so movie sequels like "tangled-2"
 *    are not misread; 1-2 digits only so years never match)
 */
export function getSeasonBadge(post: Post): string | undefined {
  const title = post.title || '';
  const link = post.link || '';

  if (post.totalSeasons && post.totalSeasons > 1) {
    return `S01-S${String(post.totalSeasons).padStart(2, '0')}`;
  }
  if (post.totalSeasons === 1) {
    return 'S01';
  }
  if (post.seasonCount && post.seasonCount > 1) {
    return `S01-S${String(post.seasonCount).padStart(2, '0')}`;
  }
  if (post.seasonCount === 1) {
    return 'S01';
  }

  const rangeMatch = title.match(/s0*(\d+)\s*[-–]\s*s?0*(\d+)/i);
  if (rangeMatch) {
    const start = parseInt(rangeMatch[1]);
    const end = parseInt(rangeMatch[2]);
    if (start > 0 && end > start) {
      return `S${String(start).padStart(2, '0')}-S${String(end).padStart(2, '0')}`;
    }
  }

  const seasonRangeMatch = title.match(/season\s*(\d{1,2})\s*[-–&]\s*(?:season\s*)?(\d{1,2})/i);
  if (seasonRangeMatch) {
    const start = parseInt(seasonRangeMatch[1]);
    const end = parseInt(seasonRangeMatch[2]);
    if (start > 0 && end > start) {
      return `S${String(start).padStart(2, '0')}-S${String(end).padStart(2, '0')}`;
    }
  }

  const sxeMatch = title.match(/\bs(\d{1,2})e\d{1,3}\b/i);
  if (sxeMatch) {
    const num = parseInt(sxeMatch[1]);
    if (num > 0) return `S${String(num).padStart(2, '0')}`;
  }

  const seasonMatch = title.match(/season\s*(\d+)/i) || title.match(/\bs(\d{1,2})\b/i);
  if (seasonMatch) {
    const num = parseInt(seasonMatch[1]);
    if (num > 0) return `S${String(num).padStart(2, '0')}`;
  }

  const linkSeasonMatch =
    link.match(/-season-?(\d{1,2})(?:-|$)/i) || link.match(/-s(\d{1,2})(?:-|$)/i);
  if (linkSeasonMatch) {
    const num = parseInt(linkSeasonMatch[1]);
    if (num > 0) return `S${String(num).padStart(2, '0')}`;
  }

  if ((post.type || '').toLowerCase() === 'series') {
    const tailNumMatch = link.match(/-(\d{1,2})$/);
    if (tailNumMatch) {
      const num = parseInt(tailNumMatch[1]);
      if (num > 0) return `S${String(num).padStart(2, '0')}`;
    }
  }

  return undefined;
}

export function getProviderBadge(post: Post): string | undefined {
  const provider = (post.provider || '').toLowerCase();
  if (provider.includes('cinefreak')) return 'CF';
  if (provider.includes('moviebox') || provider.includes('movieboxweb')) return 'MB';
  return undefined;
}

export function getProviderFullName(providerValue: string): string | undefined {
  const p = providerValue.toLowerCase();
  if (p.includes('cinefreak')) return 'CineFreak';
  if (p.includes('moviebox') || p.includes('movieboxweb')) return 'MovieBox';
  if (p.includes('4khdhub')) return '4KHDHub';
  return undefined;
}
