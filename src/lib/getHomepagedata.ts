import {Content} from './zustand/contentStore';
import {Post} from './providers/types';
import {providerManager} from './services/ProviderManager';

export interface HomePageData {
  title: string;
  Posts: Post[];
  filter: string;
  /** Provider this section was fetched from (set in aggregate home mode). */
  provider?: string;
  error?: string;
}

/**
 * How many of one provider's rows are fetched at the same time.
 *
 * Rows used to be awaited strictly one after another ("to avoid worker
 * overload"), so movielinkbd's 13 home rows became a 13-deep chain of round
 * trips — by far the largest single cost on the home screen (13 x 300-600ms
 * before a single slider painted). Providers already ran in parallel with each
 * other; only the rows inside one provider did not.
 *
 * The real ceilings are elsewhere: the sandbox spawns a worker per invoke, and
 * HTTP is bounded by DomainRateLimiter (12 concurrent / 20 rps per host, 48
 * overall). 4 concurrent rows overlap the network without flooding the JS
 * thread with 13 simultaneous `new Function` compiles — 13 rows now land in
 * ~4 batches instead of 13.
 */
const ROW_CONCURRENCY = 4;

/**
 * Per-row deadline. The sandbox invoke timeout is 120s and provider HTTP
 * allows 30s, so one dead host could previously hold every row queued behind
 * it (and therefore the whole home screen) for over a minute. A row that has
 * not answered here is converted into an error row and the rest carry on.
 */
const ROW_DEADLINE_MS = 15_000;

const withDeadline = <T>(work: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out')), ms);
    work.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      error => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });

export const getHomePageDataOptimized = async (
  activeProvider: Content['provider'],
  signal: AbortSignal,
): Promise<HomePageData[]> => {
  const catalogs = await providerManager.getCatalog({
    providerValue: activeProvider.value,
  });

  if (signal.aborted) throw new Error('Request aborted');

  const fetchSingle = async (item: {title: string; filter: string}) => {
    try {
      const data = await withDeadline(
        providerManager.getPosts({
          filter: item.filter,
          page: 1,
          providerValue: activeProvider.value,
          signal,
        }),
        ROW_DEADLINE_MS,
      );
      if (signal.aborted) throw new Error('Request aborted');
      return {title: item.title, Posts: data || [], filter: item.filter, provider: activeProvider.value};
    } catch (error) {
      return {
        title: item.title,
        Posts: [],
        filter: item.filter,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  };

  // Fixed-size worker pool. Results are written back at their own catalog
  // index, so the section order the provider declared survives even though the
  // rows now complete out of order.
  const homePageData: Array<HomePageData | undefined> = new Array(catalogs.length);
  let cursor = 0;
  const worker = async () => {
    while (!signal.aborted) {
      const index = cursor++;
      if (index >= catalogs.length) {
        return;
      }
      homePageData[index] = await fetchSingle(catalogs[index]);
    }
  };
  await Promise.all(
    Array.from({length: Math.min(ROW_CONCURRENCY, catalogs.length)}, () => worker()),
  );

  // `.filter` also drops the holes an aborted run leaves behind.
  const rows = homePageData.filter((row): row is HomePageData => row !== undefined);
  if (rows.length === 0) {
    throw new Error('Failed to load any content categories');
  }

  return rows;
};

export const getHomePageData = getHomePageDataOptimized;
