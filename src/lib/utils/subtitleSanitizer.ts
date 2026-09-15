import * as FileSystem from 'expo-file-system/legacy';

const WATERMARK_PATTERNS = [
  /cinefreak\.top/gi,
  /cinefreak\s*\.?\s*top/gi,
  /www\.cinefreak\.top/gi,
  /cinefreak\.com/gi,
  /cinefreak/gi,
  /megakino/gi,
  /solarmovie/gi,
  /fmovies/gi,
  /putlocker/gi,
  /soap2day/gi,
  /myflixer/gi,
  /fbox/gi,
  /binge\.watch/gi,
  /primewire/gi,
  /123movies/gi,
  /gomovies/gi,
  /yesmovies/gi,
  /lookmovie/gi,
  /azmovie/gi,
  /sockshare/gi,
  /watchseries/gi,
  /mycima/gi,
  /cimanow/gi,
];

const REPLACEMENT = 'Cinepix.Top';

function sanitizeText(text: string): string {
  let result = text;
  for (const pattern of WATERMARK_PATTERNS) {
    result = result.replace(pattern, REPLACEMENT);
  }
  return result;
}

function sanitizeContent(content: string): string {
  const lines = content.split('\n');
  const isSrt = /^\d+\s*\r?\n\d{2}:\d{2}:\d{2}/.test(content.trim());

  if (isSrt) {
    return lines.map((line) => {
      const trimmed = line.trim();
      if (/^\d+$/.test(trimmed)) return line;
      if (/\d{2}:\d{2}:\d{2}/.test(trimmed) && /-->/.test(trimmed)) return line;
      if (trimmed === '') return line;
      return sanitizeText(line);
    }).join('\n');
  }

  const isVtt = /^WEBVTT/.test(content.trim());
  if (isVtt) {
    return lines.map((line) => {
      const trimmed = line.trim();
      if (/^WEBVTT/.test(trimmed)) return line;
      if (/\d{2}:\d{2}:\d{2}/.test(trimmed) && /-->/.test(trimmed)) return line;
      if (trimmed === '') return line;
      if (/^NOTE/.test(trimmed)) return line;
      return sanitizeText(line);
    }).join('\n');
  }

  return lines.map((line) => sanitizeText(line)).join('\n');
}

const cache = new Map<string, string>();

export async function fetchAndSanitizeSubtitle(uri: string): Promise<string> {
  if (cache.has(uri)) {
    return cache.get(uri)!;
  }

  try {
    if (!uri.startsWith('http://') && !uri.startsWith('https://')) {
      return uri;
    }

    const response = await fetch(uri);
    if (!response.ok) return uri;

    const original = await response.text();
    const sanitized = sanitizeContent(original);

    if (sanitized === original) {
      cache.set(uri, uri);
      return uri;
    }

    const fileName = `sub_${Date.now()}.vtt`;
    const filePath = `${FileSystem.cacheDirectory}${fileName}`;
    await FileSystem.writeAsStringAsync(filePath, sanitized, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    cache.set(uri, filePath);
    return filePath;
  } catch {
    return uri;
  }
}

export function clearSubtitleCache() {
  cache.forEach((filePath) => {
    if (filePath.startsWith(FileSystem.cacheDirectory || '')) {
      FileSystem.deleteAsync(filePath, { idempotent: true }).catch(() => {});
    }
  });
  cache.clear();
}
