import {Stream} from '../providers/types';

const fetchFileSizeForStream = async (stream: Stream): Promise<number> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  const headers: Record<string, string> = {
    ...stream.headers,
    Range: 'bytes=0-0',
  };

  try {
    const response = await fetch(stream.link, {
      method: 'GET',
      signal: controller.signal,
      headers,
    });

    clearTimeout(timeout);

    const contentRange = response.headers.get('Content-Range');
    if (contentRange) {
      const match = contentRange.match(/\/(\d+)/);
      if (match) return parseInt(match[1], 10);
    }

    const contentLength = response.headers.get('Content-Length');
    if (contentLength) return parseInt(contentLength, 10);

    await response.body?.cancel();
  } catch {
    clearTimeout(timeout);
  }
  return 0;
};

export const fetchFileSizes = async (
  streams: Stream[],
): Promise<Map<string, number>> => {
  const sizeMap = new Map<string, number>();

  const results = await Promise.allSettled(
    streams.map(async stream => {
      const size = await fetchFileSizeForStream(stream);
      sizeMap.set(stream.link, size);
      return {link: stream.link, size};
    }),
  );

  return sizeMap;
};
