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
      const data = await providerManager.getPosts({
        filter: item.filter,
        page: 1,
        providerValue: activeProvider.value,
        signal,
      });
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

  const homePageData: HomePageData[] = [];
  let successCount = 0;

  // Load first catalog ("home") immediately for fast initial render
  if (catalogs.length > 0) {
    const first = await fetchSingle(catalogs[0]);
    homePageData.push(first);
    if (first.Posts.length > 0) successCount++;
  }

  // Load remaining catalogs sequentially to avoid worker overload
  for (let i = 1; i < catalogs.length; i++) {
    if (signal.aborted) break;
    const result = await fetchSingle(catalogs[i]);
    homePageData.push(result);
    if (result.Posts.length > 0) successCount++;
  }

  if (successCount === 0 && homePageData.length === 0) {
    throw new Error('Failed to load any content categories');
  }

  return homePageData;
};

export const getHomePageData = getHomePageDataOptimized;
