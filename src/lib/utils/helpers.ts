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
        author: 'CineBD',
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

  if (/\[Hindi\]|\bHindi\b/i.test(title)) return 'Hindi';
  if (/\[Tamil\]|\bTamil\b/i.test(title)) return 'Tamil';
  if (/\[Telugu\]|\bTelugu\b/i.test(title)) return 'Telugu';
  if (/\[Bengali\]|\bBengali\b/i.test(title)) return 'Bengali';

  if (providerName.includes('4khdhub') || /\b4k\b/i.test(title)) return '4K';

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
  if (post.episodeCount) {
    return `Ep ${post.episodeCount}`;
  }
  if (post.quality) {
    return post.quality;
  }

  const rangeMatch = title.match(/s0*(\d+)\s*[-–]\s*s?0*(\d+)/i);
  if (rangeMatch) {
    const start = parseInt(rangeMatch[1]);
    const end = parseInt(rangeMatch[2]);
    if (start > 0 && end > start) {
      return `S${String(start).padStart(2, '0')}-S${String(end).padStart(2, '0')}`;
    }
  }

  const seasonMatch = title.match(/season\s*(\d+)/i) || title.match(/s(\d{1,2})/i);
  if (seasonMatch) {
    const num = parseInt(seasonMatch[1]);
    if (num > 0) return `S${String(num).padStart(2, '0')}`;
  }

  const epMatch = title.match(/episode\s*(\d+)/i) || title.match(/ep\.?\s*(\d+)/i);
  if (epMatch) {
    return `Ep ${epMatch[1]}`;
  }

  if (/series|tv|season|episode/i.test(link) || /series|tv|season|episode/i.test(title)) {
    return 'Series';
  }

  if (/\b(4k|2160p|1080p|720p|hdcam|hd)\b/i.test(title)) {
    const q = title.match(/\b(4k|2160p|1080p|720p|hdcam|hd)\b/i);
    return q ? q[1].toUpperCase() : undefined;
  }

  return undefined;
}
