import React, {
  useState,
  useMemo,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import {
  View,
  TouchableOpacity,
  ToastAndroid,
  FlatList,
  ActivityIndicator,
  ScrollView,
  TextInput,
} from 'react-native';
import {Image} from 'expo-image';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useNavigation} from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Feather from '@expo/vector-icons/Feather';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';
import * as IntentLauncher from 'expo-intent-launcher';
import RNReactNativeHapticFeedback from 'react-native-haptic-feedback';
import {EpisodeLink, Link} from '../lib/providers/types';
import {RootStackParamList} from '../App';
import Downloader from './Downloader';
import {cacheStorage, mainStorage, settingsStorage} from '../lib/storage';
import {ifExists} from '../lib/file/ifExists';
import {useEpisodes, useStreamData} from '../lib/hooks/useEpisodes';
import SkeletonLoader from './Skeleton';
import DropdownField from './ui/DropdownField';
import {
  createDesktopCompatibleFileName,
  createDirectDownloadId,
  createSeriesDownloadId,
} from '../lib/downloadId';
import useDownloadsStore from '../lib/zustand/downloadsStore';
import {useM3Colors} from '../theme/M3PaletteContext';
import MaterialDialogSurface from './ui/MaterialDialogSurface';
import LoadingIndicator from './ui/LoadingIndicator';
import {LEGACY_TERTIARY_BACKGROUND} from '../theme/seeds';
import Text from './ui/Text';
import EpisodeRowContent, {getValidImageUri} from './EpisodeRowContent';
import {setSyncedEpisodeProgress} from '../lib/sync/syncService';

const CONTROL_TEXT = '#F5F0EF';
const CONTROL_TEXT_MUTED = '#D4CBC9';

function detectSeasonFromTitle(title: string): number | null {
  const patterns = [
    /(?:s|season)\s*(\d{1,2})/i,
    /^(\d{1,2})\s*[-–]\s*\d/i,
    /\bS(\d{1,2})\b/i,
  ];
  for (const p of patterns) {
    const m = title.match(p);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

function detectEpisodeFromTitle(title: string): number | null {
  const patterns = [
    /(?:e|ep|episode)\s*(\d{1,4})/i,
    /\bE(\d{1,4})\b/i,
    // Bare `NNN` after a dash can only be an episode if it is NOT a file size
    // (e.g. "720p - 1.1GB" must not match "1"), so require no `.`/digit right
    // after and a size unit not following.
    /[-–]\s*(\d{1,4})(?!\.?\d*\s*(?:GB|MB|KB|TB)\b)(?!\w)/,
  ];
  for (const p of patterns) {
    const m = title.match(p);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

function detectEpisodeRange(title: string): string | null {
  const patterns = [
    /(?:e|ep|episode)\s*(\d{1,4})\s*[-–]\s*(\d{1,4})/i,
    /\bE(\d{1,4})\s*[-–]\s*(\d{1,4})\b/i,
    // Same file-size guard as detectEpisodeFromTitle: "480p - 380MB" or
    // "720p - 1.1GB" sizes must not be read as episode ranges.
    /\b(\d{1,4})\s*[-–]\s*(\d{1,4})(?!\.?\d*\s*(?:GB|MB|KB|TB)\b)(?!\w)/,
  ];
  for (const p of patterns) {
    const m = title.match(p);
    if (m) return `${m[1]}-${m[2]}`;
  }
  return null;
}

function autoGroupEpisodesBySeason(
  episodes: EpisodeLink[],
): EpisodeLink[][] {
  const seasonMap = new Map<number, EpisodeLink[]>();
  for (const ep of episodes) {
    const season = detectSeasonFromTitle(ep.title);
    if (season !== null) {
      if (!seasonMap.has(season)) seasonMap.set(season, []);
      seasonMap.get(season)!.push(ep);
    }
  }
  if (seasonMap.size > 1) {
    const sorted = Array.from(seasonMap.entries()).sort((a, b) => a[0] - b[0]);
    return sorted.map(([, eps]) => eps);
  }
  if (seasonMap.size === 1 && episodes.length > seasonMap.get(Array.from(seasonMap.keys())[0])!.length) {
    // season tag found but not all episodes have it, fallback to episode reset logic
  } else if (seasonMap.size === 1) {
    return [episodes];
  }

  const groups: EpisodeLink[][] = [];
  let current: EpisodeLink[] = [];
  let prevEpNum: number | null = null;
  for (const ep of episodes) {
    const epNum = detectEpisodeFromTitle(ep.title);
    if (epNum !== null && prevEpNum !== null && epNum <= prevEpNum) {
      if (epNum === 1 || epNum < prevEpNum) {
        if (current.length > 0) groups.push(current);
        current = [];
      }
    }
    current.push(ep);
    if (epNum !== null) prevEpNum = epNum;
  }
  if (current.length > 0) groups.push(current);
  if (groups.length <= 1) return [episodes];
  return groups;
}
// const CONTROL_OUTLINE = '#494240';

interface SeasonListProps {
  LinkList: Link[];
  poster: {
    logo?: string;
    poster?: string;
    background?: string;
  };
  type: string;
  metaTitle: string;
  providerValue: string;
  refreshing?: boolean;
  routeParams: Readonly<{
    link: string;
    provider?: string;
    poster?: string;
  }>;
  imdbId?: string;
  synopsis?: string;
  refreshVersion?: number;
  quickDownload?: boolean;
}

interface PlayHandlerProps {
  linkIndex: number;
  type: string;
  primaryTitle: string;
  seasonTitle: string;
  episodeData: EpisodeLink[] | Link['directLinks'];
}

interface StickyMenuState {
  active: boolean;
  link?: string;
  type?: string;
}

interface EpisodeDetailsState {
  title: string;
  description: string;
  image?: string;
}

const getOriginalLinkIndex = <T extends {link: string}>(
  links: T[] | undefined,
  link: string,
  fallbackIndex: number,
): number => {
  const originalIndex = links?.findIndex(item => item.link === link) ?? -1;
  return originalIndex >= 0 ? originalIndex : fallbackIndex;
};

const SeasonList: React.FC<SeasonListProps> = ({
  LinkList = [],
  poster,
  type,
  metaTitle,
  providerValue,
  refreshing,
  routeParams,
  imdbId,
  synopsis,
  refreshVersion,
  quickDownload,
}) => {
  const colors = useM3Colors();
  const primary = colors.primary;
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const {fetchStreams} = useStreamData();
  const detailsPressRef = useRef<string | null>(null);
  const episodeSortOrderKey = `episodeSortOrder:${providerValue}:${routeParams.link}`;

  // Memoized initial active season
  const [activeSeason, setActiveSeason] = useState<Link>(() => {
    if (!LinkList || LinkList.length === 0) {
      return {} as Link;
    }

    const cached = cacheStorage.getString(
      `ActiveSeason${metaTitle + providerValue}`,
    );

    if (cached) {
      try {
        const parsedSeason = JSON.parse(cached);
        // Verify the cached season still exists in LinkList
        const seasonExists = LinkList.find(
          link => link.title === parsedSeason.title,
        );
        if (seasonExists) {
          return parsedSeason;
        }
      } catch (error) {
        console.warn('Failed to parse cached season:', error);
      }
    }

    // Default to a Hindi dub variant when the provider offers one
    // (multi-audio links like "Original Audio / Hindi dub / ...");
    // otherwise fall back to the first entry.
    const hindiDub = LinkList.find(
      l => /hindi/i.test(l.title || '') && /dub/i.test(l.title || ''),
    );
    if (hindiDub) {
      return hindiDub;
    }
    const hindi = LinkList.find(l => /hindi/i.test(l.title || ''));
    if (hindi) {
      return hindi;
    }
    return LinkList[0];
  });

  // React Query for episodes
  const {
    data: episodeList = [],
    isLoading: episodeLoading,
    error: episodeError,
    refetch: refetchEpisodes,
  } = useEpisodes(
    activeSeason?.episodesLink,
    providerValue,
    activeSeason?.episodesLink ? true : false,
  );

  const [activeAutoSeason, setActiveAutoSeason] = useState<number>(0);

  const autoGroupedSeasons = useMemo(() => {
    if (!episodeList || episodeList.length === 0) {
      return null;
    }
    const groups = autoGroupEpisodesBySeason(episodeList);
    if (groups.length <= 1) return null;
    return groups;
  }, [episodeList]);

  const [activeSeasonNum, setActiveSeasonNum] = useState<number>(() => detectSeasonFromTitle(LinkList[0]?.title || '') || 1);
  const seasonGroups = useMemo(() => {
    if (autoGroupedSeasons) return [];
    const map = new Map<number, Link[]>();
    for (const link of LinkList) {
      const num = detectSeasonFromTitle(link.title) || 1;
      if (!map.has(num)) map.set(num, []);
      map.get(num)!.push(link);
    }
    return Array.from(map.entries()).sort((a,b)=>a[0]-b[0]).map(([num, links])=>({seasonNum:num, links, title:`Season ${String(num).padStart(2,'0')}`} as any));
  }, [LinkList, autoGroupedSeasons]);
  const activeSeasonGroup = useMemo(()=> seasonGroups.find(g=>g.seasonNum===activeSeasonNum) || seasonGroups[0], [seasonGroups, activeSeasonNum]);

  useEffect(() => {
    if (seasonGroups.length>0 && !seasonGroups.some(g=>g.seasonNum===activeSeasonNum)) {
      setActiveSeasonNum(seasonGroups[0].seasonNum);
    }
  }, [seasonGroups, activeSeasonNum]);

  useEffect(() => {
    if (activeSeasonGroup && activeSeasonGroup.links.length>0 && !activeSeasonGroup.links.some((l: Link)=>l.title===activeSeason?.title)) {
      setActiveSeason(activeSeasonGroup.links[0] as any);
    }
  }, [activeSeasonGroup, activeSeason]);

  useEffect(() => {
    setSelectedQuality('all');
    setAllQualitiesSelected(true);
  }, [activeSeasonNum, activeSeason?.title]);

  useEffect(() => {
    if (refreshing && activeSeason?.episodesLink) {
      refetchEpisodes();
    }
  }, [activeSeason?.episodesLink, refetchEpisodes, refreshVersion, refreshing]);

  // UI state
  const [vlcLoading, setVlcLoading] = useState<boolean>(false);
  const [stickyMenu, setStickyMenu] = useState<StickyMenuState>({
    active: false,
  });

  // Search and sorting state - memoized initial values
  const [searchText, setSearchText] = useState<string>('');
  const [activeEpType, setActiveEpType] = useState<'all' | 'single' | 'combo'>('all');
  const [selectedQuality, setSelectedQuality] = useState<string>('all');
  const [allQualitiesSelected, setAllQualitiesSelected] = useState(true);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(() =>
    mainStorage.getString(episodeSortOrderKey) === 'desc' ? 'desc' : 'asc',
  );

  const isMovieQualityMode = useMemo(() => {
    if (!LinkList || LinkList.length <= 1) return false;
    const hasSeasons = LinkList.some(l => detectSeasonFromTitle(l.title || ''));
    if (hasSeasons) return false;
    return LinkList.some(l => l.directLinks && l.directLinks.length > 0);
  }, [LinkList]);

  const qualityOptions = useMemo(() => {
    if (!isMovieQualityMode) return [];
    const seen = new Set<string>();
    const unique: Link[] = [];
    for (const link of LinkList) {
      const qual = link.title || 'Unknown';
      if (!seen.has(qual)) {
        seen.add(qual);
        unique.push(link);
      }
    }
    return unique;
  }, [isMovieQualityMode, LinkList]);

  const allMergedDirectLinks = useMemo(() => {
    if (!isMovieQualityMode || !LinkList) return [];
    return LinkList.flatMap(l => l.directLinks || []);
  }, [isMovieQualityMode, LinkList]);

  useEffect(() => {
    setSortOrder(
      mainStorage.getString(episodeSortOrderKey) === 'desc' ? 'desc' : 'asc',
    );
  }, [episodeSortOrderKey]);

  // External player state
  const [showServerModal, setShowServerModal] = useState<boolean>(false);
  const [externalPlayerStreams, setExternalPlayerStreams] = useState<any[]>([]);
  const [isLoadingStreams, setIsLoadingStreams] = useState<boolean>(false);
  const [episodeDetails, setEpisodeDetails] =
    useState<EpisodeDetailsState | null>(null);
  const [episodeDetailsImageFailed, setEpisodeDetailsImageFailed] =
    useState(false);

  useEffect(() => {
    setEpisodeDetailsImageFailed(false);
  }, [episodeDetails?.image]);

  // VLC loading animation - using shared value so it reacts to vlcLoading state
  const vlcRotation = useSharedValue(0);

  useEffect(() => {
    if (vlcLoading) {
      vlcRotation.value = 0;
      vlcRotation.value = withRepeat(
        withTiming(360, {duration: 800}),
        -1,
        false,
      );
    } else {
      cancelAnimation(vlcRotation);
      vlcRotation.value = 0;
    }
  }, [vlcLoading]);

  const vlcLoadingAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{rotate: `${vlcRotation.value}deg`}],
  }));

  // Memoized filtering and sorting logic for episodes
  const filteredAndSortedEpisodes = useMemo(() => {
    let episodes: EpisodeLink[] = [];

    if (autoGroupedSeasons && autoGroupedSeasons[activeAutoSeason]) {
      episodes = autoGroupedSeasons[activeAutoSeason].filter(
        episode => episode && episode.title && episode.link,
      );
    } else if (episodeList && Array.isArray(episodeList)) {
      episodes = episodeList.filter(
        episode => episode && episode.title && episode.link,
      );
    }

    if (searchText.trim()) {
      episodes = episodes.filter(episode =>
        episode?.title?.toLowerCase().includes(searchText.toLowerCase()),
      );
    }

    // Natural sort by episode number
    episodes = [...episodes].sort((a, b) => {
      const numA = detectEpisodeFromTitle(a.title) ?? 9999;
      const numB = detectEpisodeFromTitle(b.title) ?? 9999;
      return numA - numB;
    });

    if (sortOrder === 'desc') {
      episodes = episodes.reverse();
    }

    return episodes;
  }, [episodeList, searchText, sortOrder, autoGroupedSeasons, activeAutoSeason]);

  // Memoized direct links processing
  const filteredAndSortedDirectLinks = useMemo(() => {
    let baseLinks: any[] = [];
    if (isMovieQualityMode && allQualitiesSelected) {
      baseLinks = allMergedDirectLinks;
    } else if (activeSeason?.directLinks && Array.isArray(activeSeason.directLinks) && activeSeason.directLinks.length > 0) {
      baseLinks = activeSeason.directLinks;
    } else {
      return [];
    }
    let links = baseLinks.filter(
      (link: any) => link && link.title && link.link,
    );

    // Apply search filter
    if (searchText.trim()) {
      links = links.filter(link =>
        link?.title?.toLowerCase().includes(searchText.toLowerCase()),
      );
    }

    if (activeEpType !== 'all') {
      links = links.filter(link => {
        const isCombo = link.title.includes('-');
        return activeEpType === 'combo' ? isCombo : !isCombo;
      });
    }



    // Natural sort by episode number
    links = [...links].sort((a, b) => {
      const numA = detectEpisodeFromTitle(a.title) ?? 9999;
      const numB = detectEpisodeFromTitle(b.title) ?? 9999;
      return numA - numB;
    });

    if (sortOrder === 'desc') {
      links = links.reverse();
    }

    return links;
  }, [isMovieQualityMode, allQualitiesSelected, allMergedDirectLinks, activeSeason?.directLinks, activeSeasonGroup, searchText, sortOrder, activeEpType]);

  // Memoized completion checker
  const isCompleted = useCallback((link: string) => {
    const watchProgress = JSON.parse(cacheStorage.getString(link) || '{}');
    const percentage =
      (watchProgress?.position / watchProgress?.duration) * 100;
    return percentage > 85;
  }, []);

  // Memoized toggle sort order
  const toggleSortOrder = useCallback(() => {
    const newOrder = sortOrder === 'asc' ? 'desc' : 'asc';
    setSortOrder(newOrder);
    mainStorage.setString(episodeSortOrderKey, newOrder);
  }, [episodeSortOrderKey, sortOrder]);

  useEffect(() => {
    setActiveEpType('all');
  }, [activeSeason?.title]);

  // Memoized season change handler
  const handleSeasonChange = useCallback(
    (item: Link) => {
      setActiveSeason(item);
      cacheStorage.setString(
        `ActiveSeason${metaTitle + providerValue}`,
        JSON.stringify(item),
      );
    },
    [metaTitle, providerValue],
  );

  // Memoized external player handler
  const handleExternalPlayer = useCallback(
    async (link: string, streamType: string) => {
      setVlcLoading(true);
      setIsLoadingStreams(true);

      try {
        const streams = await fetchStreams(link, streamType, providerValue);

        if (!streams || streams.length === 0) {
          ToastAndroid.show(
            'No streams available from provider',
            ToastAndroid.SHORT,
          );
          return;
        }

        console.log('Available Streams Count:', streams.length);
        setExternalPlayerStreams([...streams]);
        setIsLoadingStreams(false);
        setVlcLoading(false);
        setShowServerModal(true);

        ToastAndroid.show(
          `Found ${streams.length} servers`,
          ToastAndroid.SHORT,
        );
      } catch (error: any) {
        console.error('Error fetching streams:', error);
        const errorMessage = error?.message || 'Failed to load streams';
        ToastAndroid.show(errorMessage, ToastAndroid.SHORT);
      } finally {
        setVlcLoading(false);
        setIsLoadingStreams(false);
      }
    },
    [fetchStreams, providerValue],
  );

  // Memoized external player opener
  const openExternalPlayer = useCallback(
    async (
      streamUrl: string,
      headers?: Record<string, string>,
      title?: string,
    ) => {
      setShowServerModal(false);
      setVlcLoading(true);

      try {
        const intentParams: any = {
          data: streamUrl,
          type: 'video/*',
          flags: 1,
        };

        const extra: Record<string, any> = {};

        if (title) {
          extra.title = title;
          extra['android.intent.extra.TITLE'] = title;
        }

        if (headers && Object.keys(headers).length > 0) {
          Object.assign(extra, headers);
          extra['android.media.intent.extra.HTTP_HEADERS'] = headers;
          extra.headers = headers;

          const headersArray = Object.entries(headers).map(
            ([key, val]) => `${key}: ${val}`,
          );
          extra.headers_array = headersArray;

          const referer = headers['Referer'] || headers['referer'];
          if (referer) {
            extra['android.intent.extra.REFERRER'] = referer;
            extra['android.intent.extra.REFERRER_NAME'] = referer;
          }
        }

        if (Object.keys(extra).length > 0) {
          intentParams.extra = extra;
        }

        await IntentLauncher.startActivityAsync(
          'android.intent.action.VIEW',
          intentParams,
        );
      } catch (error) {
        console.error('Error opening external player:', error);
        ToastAndroid.show('Failed to open external player', ToastAndroid.SHORT);
      } finally {
        setVlcLoading(false);
      }
    },
    [],
  );

  // Memoized play handler
  const playHandler = useCallback(
    async ({
      linkIndex,
      type: playbackType,
      primaryTitle,
      seasonTitle,
      episodeData,
    }: PlayHandlerProps) => {
      if (!episodeData || episodeData.length === 0) {
        return;
      }

      const link = episodeData[linkIndex].link;
      const file = (
        metaTitle +
        seasonTitle +
        episodeData[linkIndex]?.title
      ).replaceAll(/[^a-zA-Z0-9]/g, '_');

      const externalPlayer = settingsStorage.getBool('useExternalPlayer');
      const dwFile = await ifExists(file);

      const downloadIndex = getOriginalLinkIndex(episodeList, link, linkIndex);
      const downloadId = createSeriesDownloadId(
        metaTitle,
        seasonTitle,
        downloadIndex,
      );
      const localDownload =
        useDownloadsStore.getState().downloads[downloadId];
      const localPath =
        (localDownload?.status === 'completed' && localDownload?.filePath) ||
        dwFile;

      if (externalPlayer) {
        if (localPath) {
          await IntentLauncher.startActivityAsync(
            'android.intent.action.VIEW',
            {
              data: localPath,
              type: 'video/*',
            },
          );
          return;
        }
        handleExternalPlayer(link, playbackType);
        return;
      }

      navigation.navigate('Player', {
        linkIndex,
        episodeList: episodeData,
        type: playbackType,
        primaryTitle: primaryTitle,
        secondaryTitle: seasonTitle,
        poster: poster,
        providerValue: providerValue,
        infoUrl: routeParams.link,
      });
    },
    [
      routeParams.link,
      poster,
      providerValue,
      metaTitle,
      handleExternalPlayer,
      navigation,
    ],
  );

  // Memoized long press handler
  const onLongPressHandler = useCallback(
    (active: boolean, link: string, streamType?: string) => {
      if (settingsStorage.isHapticFeedbackEnabled()) {
        RNReactNativeHapticFeedback.trigger('effectTick', {
          enableVibrateFallback: true,
          ignoreAndroidSystemSettings: false,
        });
      }
      setStickyMenu({active: active, link: link, type: streamType});
    },
    [],
  );

  // Memoized mark as watched handler
  const markAsWatched = useCallback(() => {
    if (stickyMenu.link) {
      cacheStorage.setString(
        stickyMenu.link,
        JSON.stringify({
          position: 1,
          duration: 1,
        }),
      );
      const episode = [
        ...episodeList,
        ...(activeSeason.directLinks || []),
      ].find(item => item.link === stickyMenu.link);
      if (episode) {
        setSyncedEpisodeProgress({
          episode,
          title: metaTitle,
          poster: poster.poster,
          background: poster.background,
          provider: providerValue,
          infoUrl: routeParams.link,
          type,
          position: 1,
          duration: 1,
        });
      }
      setStickyMenu({active: false});
    }
  }, [
    activeSeason.directLinks,
    episodeList,
    metaTitle,
    poster.background,
    poster.poster,
    providerValue,
    routeParams.link,
    stickyMenu.link,
    type,
  ]);

  // Memoized mark as unwatched handler
  const markAsUnwatched = useCallback(() => {
    if (stickyMenu.link) {
      cacheStorage.setString(
        stickyMenu.link,
        JSON.stringify({
          position: 0,
          duration: 1,
        }),
      );
      const episode = [
        ...episodeList,
        ...(activeSeason.directLinks || []),
      ].find(item => item.link === stickyMenu.link);
      if (episode) {
        setSyncedEpisodeProgress({
          episode,
          title: metaTitle,
          poster: poster.poster,
          background: poster.background,
          provider: providerValue,
          infoUrl: routeParams.link,
          type,
          position: 0,
          duration: 1,
        });
      }
      setStickyMenu({active: false});
    }
  }, [
    activeSeason.directLinks,
    episodeList,
    metaTitle,
    poster.background,
    poster.poster,
    providerValue,
    routeParams.link,
    stickyMenu.link,
    type,
  ]);

  // Memoized sticky menu external player handler
  const handleStickyMenuExternalPlayer = useCallback(() => {
    setStickyMenu({active: false});
    if (stickyMenu.link && stickyMenu.type) {
      handleExternalPlayer(stickyMenu.link, stickyMenu.type);
    }
  }, [stickyMenu.link, stickyMenu.type, handleExternalPlayer]);

  // Memoized episode render item
  const renderEpisodeItem = useCallback(
    ({item, index}: {item: EpisodeLink; index: number}) => {
      if (!item || !item.link || !item.title) {
        console.warn('Invalid episode item at index', index, item);
        return null; // Skip rendering if item is invalid
      }

      const downloadIndex = getOriginalLinkIndex(episodeList, item.link, index);
      const downloadId = createSeriesDownloadId(
        metaTitle,
        activeSeason.title,
        downloadIndex,
      );
      const rawEpTitle = item.title || '';
      const rawEpDesc = item.description || '';
      const rawEpBoth = rawEpTitle + ' ' + rawEpDesc;
      const epSizeM = rawEpBoth.match(/(\d+[\.,]?\d*\s*(?:GB|MB|TB))/i);
      const epSize = epSizeM ? epSizeM[0] : '';
      const epLangM = rawEpBoth.match(/(Hindi\s*(?:&\s*French)?|English|Bengali|Bangla|Tamil|Telugu|Dual Audio|Dubbed|Multi Audio)/i);
      const epLang = epLangM ? epLangM[1] : '';
      const epQm = rawEpBoth.match(/(2160p|1080p|720p|480p|4K|HD)/i);
      const epQual = epQm ? epQm[1] : '';
      const epTagM = rawEpBoth.match(/(BluRay|WEB-?DL|WEBRip|HDRip|DVDRip|REMUX)/i);
      const epTag = epTagM ? epTagM[1] : '';
      const seasonTitleRaw = activeSeason?.title || '';
      const sLangM = seasonTitleRaw.match(/(Hindi\s*(?:&\s*French)?|English|Bengali|Tamil|Telugu|Dual Audio|Dubbed)/i);
      const sQM = seasonTitleRaw.match(/(2160p|1080p|720p|480p|4K)/i);
      const finalLang = epLang || sLangM?.[1] || '';
      const finalQual = epQual || sQM?.[1] || '';
      const epNum = detectEpisodeFromTitle(rawEpTitle);
      const sNum = detectSeasonFromTitle(rawEpTitle);
      const epRange = detectEpisodeRange(rawEpTitle);
      let epLabel = '';
      if (sNum !== null && epRange) {
        epLabel = `S${sNum} Ep ${epRange}`;
      } else if (sNum !== null && epNum !== null) {
        epLabel = `S${sNum} Ep ${epNum}`;
      } else if (epRange) {
        epLabel = `Ep ${epRange}`;
      } else if (epNum !== null) {
        epLabel = `Ep ${epNum}`;
      }
      const epTitleParts = [epLabel, finalQual, finalLang].filter(Boolean);
      const epDisplayTitle = epTitleParts.length > 0 ? epTitleParts.join(' • ') : (item.title?.trim() || `Episode ${index + 1}`);
      const epDescParts = [epTag, epSize].filter(Boolean);
      const epSubtitle = epDescParts.length > 0 ? epDescParts.join(' • ') : '';
      const handleEpisodePress = () => {
        playHandler({
          linkIndex: index,
          type,
          primaryTitle: metaTitle,
          seasonTitle: activeSeason?.title || '',
          episodeData: filteredAndSortedEpisodes,
        });
      };
      return (
        <View
          key={item.link + index}
          className={`w-full my-1.5
          ${
            isCompleted(item.link) || stickyMenu.link === item.link
              ? 'opacity-60'
              : ''
          }
        `}>
          <View
            className="min-h-[76px] flex-row w-full items-center px-3 py-2"
            style={{
              backgroundColor: LEGACY_TERTIARY_BACKGROUND,
              // borderColor: CONTROL_OUTLINE,
              borderRadius: 14,
              borderWidth: 1,
            }}>
            <TouchableOpacity
              activeOpacity={0.65}
              className="min-w-0 flex-1 items-center flex-row gap-x-3"
              onPress={() => {
                if (detailsPressRef.current === item.link) {
                  detailsPressRef.current = null;
                  return;
                }
                handleEpisodePress();
              }}
              onLongPress={() =>
                onLongPressHandler(true, item.link, 'series')
              }>
              <EpisodeRowContent
                title={epDisplayTitle || item.title}
                description={epSubtitle || item.description}
                image={item.image}
                accentColor={primary}
                textColor={CONTROL_TEXT}
                mutedTextColor={CONTROL_TEXT_MUTED}
                onShowDetailsPressIn={() => {
                  detailsPressRef.current = item.link;
                }}
                onShowDetails={
                  (item.description?.trim() || epSubtitle)
                    ? () => {
                        setEpisodeDetails({
                          title: epDisplayTitle || item.title,
                          description: epSubtitle || item.description || '',
                          image: item.image,
                        });
                        setTimeout(() => {
                          if (detailsPressRef.current === item.link) {
                            detailsPressRef.current = null;
                          }
                        }, 0);
                      }
                    : undefined
                }
              />
            </TouchableOpacity>
            <Downloader
              downloadId={downloadId}
              providerValue={providerValue}
              link={item.link}
              type={type}
              mediaType="series"
              showName={metaTitle}
              seasonTitle={activeSeason.title}
              episodeName={item.title}
              imdbId={imdbId}
              poster={poster.poster}
              background={poster.background}
              synopsis={synopsis}
              infoUrl={routeParams.link}
              skip={item.skip || (item as any)?.skips}
              quickDownload={
                quickDownload ||
                activeSeason?.quickDownload ||
                item?.quickDownload
              }
              title={
                metaTitle.length > 30
                  ? metaTitle.slice(0, 30) + '... ' + item.title
                  : metaTitle + ' ' + item.title
              }
              fileName={createDesktopCompatibleFileName(
                `${metaTitle} ${item.title}`,
                'series',
              )}
            />
          </View>
        </View>
      );
    },
    [
      isCompleted,
      stickyMenu.link,
      playHandler,
      metaTitle,
      activeSeason?.title,
      episodeList,
      filteredAndSortedEpisodes,
      onLongPressHandler,
      primary,
      providerValue,
      routeParams.link,
      imdbId,
      poster.poster,
    ],
  );

  // Memoized direct link render item
  const renderDirectLinkItem = useCallback(
    ({item, index}: {item: any; index: number}) => {
      if (!item || !item.link || !item.title) {
        console.warn('Invalid direct link item at index', index, item);
        return null; // Skip rendering if item is invalid
      }

      const downloadIndex = getOriginalLinkIndex(
        activeSeason.directLinks,
        item.link,
        index,
      );
      const downloadId = createDirectDownloadId(
        metaTitle,
        activeSeason.title,
        downloadIndex,
      );
      const rawTitle = item.title || '';
      const rawDesc = item.description || '';
      const rawBoth = rawTitle + ' ' + rawDesc;
      const sizeM = rawBoth.match(/(\d+[\.,]?\d*\s*(?:GB|MB|TB))/i);
      const size = sizeM ? sizeM[0] : '';
      const langM = rawBoth.match(/(Hindi\s*(?:&\s*French)?|English|Bengali|Bangla|Tamil|Telugu|Dual Audio|Dubbed|Multi Audio)/i);
      const lang = langM ? langM[1] : '';
      const qM = rawBoth.match(/(2160p|1080p|720p|480p|4K|HD)/i);
      const qual = qM ? qM[1] : '';
      const tagM = rawBoth.match(/(BluRay|WEB-?DL|WEBRip|HDRip|DVDRip|REMUX)/i);
      const tag = tagM ? tagM[1] : '';
      const seasonTitleRaw2 = activeSeason?.title || '';
      const sLangM2 = seasonTitleRaw2.match(/(Hindi\s*(?:&\s*French)?|English|Bengali|Bangla|Tamil|Telugu|Dual Audio|Dubbed|Multi Audio)/i);
      const sQM2 = seasonTitleRaw2.match(/(2160p|1080p|720p|480p|4K)/i);
      const finalLang2 = lang || sLangM2?.[1] || '';
      const finalQual2 = qual || sQM2?.[1] || '';
      const epNum2 = detectEpisodeFromTitle(rawTitle);
      const sNum2 = detectSeasonFromTitle(rawTitle) || detectSeasonFromTitle(seasonTitleRaw2);
      const epRange2 = detectEpisodeRange(rawTitle);
      let epLabel2 = '';
      if (sNum2 !== null && epRange2) {
        epLabel2 = `S${sNum2} Ep ${epRange2}`;
      } else if (sNum2 !== null && epNum2 !== null) {
        epLabel2 = `S${sNum2} Ep ${epNum2}`;
      } else if (epRange2) {
        epLabel2 = `Ep ${epRange2}`;
      } else if (epNum2 !== null) {
        epLabel2 = `Ep ${epNum2}`;
      }
      const titleParts = [epLabel2, finalQual2, finalLang2].filter(Boolean);
      const displayTitle = titleParts.length > 0 ? titleParts.join(' • ') : (rawTitle.trim() || (activeSeason?.directLinks?.length && activeSeason.directLinks.length > 1 ? `${activeSeason?.title || 'Episode'} ${index + 1}` : activeSeason?.title && activeSeason.title.toLowerCase() !== 'default' ? activeSeason.title : 'Play'));
      const descParts = [tag, size].filter(Boolean);
      const displayDesc = descParts.length > 0 ? descParts.join(' • ') : '';
      const handleEpisodePress = () => {
        playHandler({
          linkIndex: index,
          type,
          primaryTitle: metaTitle,
          seasonTitle: activeSeason?.title || '',
          episodeData: filteredAndSortedDirectLinks,
        });
      };

      return (
        <View
          key={item.link + index}
          className={`w-full my-1.5
          ${
            isCompleted(item.link) || stickyMenu.link === item.link
              ? 'opacity-60'
              : ''
          }
        `}>
          <View
            className="min-h-[76px] flex-row w-full items-center px-3 py-2"
            style={{
              backgroundColor: LEGACY_TERTIARY_BACKGROUND,
              // borderColor: CONTROL_OUTLINE,
              borderRadius: 14,
              borderWidth: 1,
            }}>
            <TouchableOpacity
              activeOpacity={0.65}
              className="min-w-0 flex-1 items-center flex-row gap-x-3"
              onPress={() => {
                if (detailsPressRef.current === item.link) {
                  detailsPressRef.current = null;
                  return;
                }
                handleEpisodePress();
              }}
              onLongPress={() =>
                onLongPressHandler(true, item.link, item?.type || 'series')
              }>
              <EpisodeRowContent
                title={displayTitle}
                description={displayDesc || item.description}
                image={item.image}
                accentColor={primary}
                textColor={CONTROL_TEXT}
                mutedTextColor={CONTROL_TEXT_MUTED}
                onShowDetailsPressIn={() => {
                  detailsPressRef.current = item.link;
                }}
                onShowDetails={
                  item.description?.trim()
                    ? () => {
                        setEpisodeDetails({
                          title: item.title,
                          description: item.description.trim(),
                          image: item.image,
                        });
                        setTimeout(() => {
                          if (detailsPressRef.current === item.link) {
                            detailsPressRef.current = null;
                          }
                        }, 0);
                      }
                    : undefined
                }
              />
            </TouchableOpacity>
            <Downloader
              downloadId={downloadId}
              providerValue={providerValue}
              link={item.link}
              type={type}
              mediaType={item?.type === 'series' ? 'series' : 'movie'}
              showName={metaTitle}
              seasonTitle={activeSeason.title}
              episodeName={item.title}
              imdbId={imdbId}
              poster={poster.poster}
              background={poster.background}
              synopsis={synopsis}
              infoUrl={routeParams.link}
              skip={item.skip || (item as any)?.skips}
              quickDownload={
                quickDownload ||
                activeSeason?.quickDownload ||
                item?.quickDownload
              }
              title={
                metaTitle.length > 30
                  ? metaTitle.slice(0, 30) + '... ' + item.title
                  : metaTitle + ' ' + item.title
              }
              fileName={
                item?.type === 'series' ||
                (activeSeason?.directLinks &&
                  activeSeason.directLinks.length > 1)
                  ? createDesktopCompatibleFileName(
                      `${metaTitle} ${item.title}`,
                      'series',
                    )
                  : createDesktopCompatibleFileName(metaTitle, 'movie')
              }
            />
          </View>
        </View>
      );
    },
    [
      isCompleted,
      stickyMenu.link,
      playHandler,
      metaTitle,
      activeSeason?.title,
      activeSeason?.directLinks,
      filteredAndSortedDirectLinks,
      onLongPressHandler,
      primary,
      providerValue,
      routeParams.link,
      imdbId,
      poster.poster,
    ],
  );

  // Memoized server render item
  const renderServerItem = useCallback(
    (item: any, index: number) => (
      <TouchableOpacity
        key={`server-${index}-${item.server}`}
        className="mb-2 flex-row items-center justify-between p-3"
        style={{
          backgroundColor: LEGACY_TERTIARY_BACKGROUND,
          // borderColor: CONTROL_OUTLINE,
          borderRadius: 14,
          borderWidth: 1,
        }}
        onPress={() =>
          openExternalPlayer(
            item.link,
            item.headers,
            `${metaTitle || ''} ${item.server || ''}`.trim(),
          )
        }>
        <View>
          <Text
            className="text-lg capitalize font-bold"
            style={{color: CONTROL_TEXT}}>
            {item.server || `Server ${index + 1}`}
          </Text>
          <Text className="text-xs" style={{color: CONTROL_TEXT_MUTED}}>
            {item.type ? `Format: ${item.type.toUpperCase()}` : ''}
          </Text>
        </View>
        <MaterialCommunityIcons name="vlc" size={24} color={primary} />
      </TouchableOpacity>
    ),
    [primary, openExternalPlayer, metaTitle],
  );

  // Early return if no LinkList provided
  if (!LinkList || LinkList.length === 0) {
    return (
      <View className="p-4">
        <Text className="text-white text-center">No Streams Available</Text>
      </View>
    );
  }

  // Show loading skeleton while episodes are loading
  if (episodeLoading) {
    return (
      <View>
        {LinkList.length > 1 && (
          <DropdownField
            options={isMovieQualityMode ? [{title: 'সব কোয়ালিটি'} as any, ...LinkList] : LinkList}
            value={isMovieQualityMode ? {title: 'সব কোয়ালিটি'} as any : activeSeason}
            getKey={item =>
              item.episodesLink || item.directLinks?.[0]?.link || item.title
            }
            getLabel={item => item.title || 'Unknown'}
            onChange={item => {
              if (isMovieQualityMode) {
                setAllQualitiesSelected(item.title === 'সব কোয়ালিটি');
                if (item.title !== 'সব কোয়ালিটি') handleSeasonChange(item);
              } else {
                handleSeasonChange(item);
              }
            }}
            showFullOptionLabels
          />
        )}

        <View
          style={{
            width: '100%',
            padding: 10,
            alignItems: 'flex-start',
            gap: 20,
          }}>
          {[...Array(6)].map((_, index) => (
            <SkeletonLoader key={index} show={true} height={48} width={'85%'} />
          ))}
        </View>
      </View>
    );
  }

  // Show error state
  if (episodeError) {
    return (
      <View className="p-4">
        <Text className="text-red-500 text-center">
          {episodeError.message || 'Failed to load episodes. Please try again.'}
        </Text>
        <TouchableOpacity
          className="mt-2 bg-red-600 p-2 rounded-md"
          onPress={() => refetchEpisodes()}>
          <Text className="text-white text-center">Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View>
      {/* Season Tabs - Dropdown */}
      {autoGroupedSeasons ? (
        <>
          {LinkList.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap: 8, paddingHorizontal: 4, marginBottom: 8}}>
              {LinkList.map((item: any, index: number) => {
                const isActive = activeSeason?.title === item.title;
                return (
                  <TouchableOpacity key={item.title+index} onPress={()=>{setActiveSeason(item); if(item.episodesLink){refetchEpisodes();}}} style={{paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: isActive?colors.primary:colors.surfaceContainerHigh, borderWidth:1, borderColor:isActive?colors.primary:colors.outlineVariant}}>
                    <Text style={{color:isActive?colors.onPrimary:colors.onSurface, fontSize:12, fontWeight:isActive?'700':'500'}}>{item.title}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
          <DropdownField
            options={autoGroupedSeasons.map((g, i) => ({title: `Season ${detectSeasonFromTitle(g[0]?.title || '') || i + 1}`, idx: i})) as any}
            value={{title: `Season ${detectSeasonFromTitle(autoGroupedSeasons[activeAutoSeason]?.[0]?.title || '') || activeAutoSeason + 1}`, idx: activeAutoSeason} as any}
            getKey={item => String((item as any).idx)}
            getLabel={item => (item as any).title}
            onChange={item => setActiveAutoSeason((item as any).idx)}
            showFullOptionLabels
            style={{marginBottom: 8}}
          />
        </>
      ) : seasonGroups.length > 1 ? (
        <DropdownField
          options={seasonGroups as any}
          value={activeSeasonGroup as any}
          getKey={item => String((item as any).seasonNum)}
          getLabel={item => (item as any).title}
          onChange={item => setActiveSeasonNum((item as any).seasonNum)}
          showFullOptionLabels
          style={{marginBottom: 8}}
        />
      ) : isMovieQualityMode ? (
        <DropdownField
          options={[{title: 'সব কোয়ালিটি', episodesLink: '', directLinks: []} as any, ...LinkList]}
          value={allQualitiesSelected ? {title: 'সব কোয়ালিটি'} as any : activeSeason}
          getKey={item => `${item.title || ''}::${item.episodesLink || item.directLinks?.[0]?.link || ''}`}
          getLabel={item => item.title || 'Unknown'}
          onChange={(item: any) => {
            if (item.title === 'সব কোয়ালিটি') {
              setAllQualitiesSelected(true);
            } else {
              setAllQualitiesSelected(false);
              handleSeasonChange(item);
            }
          }}
          showFullOptionLabels
          style={{marginBottom: 8}}
        />
      ) : (
        <DropdownField
          options={LinkList}
          value={activeSeason}
          getKey={item => `${item.title || ''}::${item.episodesLink || item.directLinks?.[0]?.link || ''}`}
          getLabel={item => item.title || 'Unknown'}
          onChange={handleSeasonChange}
          showFullOptionLabels
          style={{marginBottom: 8}}
        />
      )}

      {/* Search and Sort Controls */}
      {(episodeList.length > 2 ||
        (activeSeason?.directLinks && activeSeason.directLinks?.length > 2) ||
        searchText) && (
        <View className="flex-row items-center mt-2">
          <View
            style={{
              backgroundColor: colors.surfaceContainerHigh,
              borderColor: colors.outlineVariant,
              borderRadius: 18,
              borderWidth: 1,
              flex: 1,
              flexDirection: 'row',
              height: 48,
              marginRight: 10,
              overflow: 'hidden',
            }}>
            <View
              style={{
                alignItems: 'center',
                justifyContent: 'center',
                paddingLeft: 14,
              }}>
              <MaterialCommunityIcons
                name="magnify"
                size={22}
                color={colors.primary}
              />
            </View>
            <TextInput
              accessibilityLabel="Find episode"
              placeholder="Find episode"
              placeholderTextColor={colors.onSurfaceVariant}
              selectionColor={colors.primary}
              returnKeyType="search"
              style={{
                color: colors.onSurface,
                flex: 1,
                fontSize: 16,
                paddingHorizontal: 10,
                paddingVertical: 0,
              }}
              value={searchText}
              onChangeText={setSearchText}
            />
          </View>
          <TouchableOpacity
            accessibilityLabel={
              sortOrder === 'asc'
                ? 'Sort episodes descending'
                : 'Sort episodes ascending'
            }
            className="h-12 w-12 flex-row items-center justify-center"
            style={{
              backgroundColor: colors.secondaryContainer,
              borderRadius: 18,
            }}
            onPress={toggleSortOrder}>
            <MaterialCommunityIcons
              name={sortOrder === 'asc' ? 'sort-ascending' : 'sort-descending'}
              size={24}
              color={colors.onSecondaryContainer}
            />
          </TouchableOpacity>
        </View>
      )}

      {activeSeason?.directLinks && activeSeason.directLinks.length > 0 && (() => {
        const hasSingle = activeSeason.directLinks!.some(l => !l.title.includes('-'));
        const hasCombo = activeSeason.directLinks!.some(l => l.title.includes('-'));
        if (!hasSingle || !hasCombo) return null;
        return (
          <View style={{flexDirection: 'row', gap: 8, marginTop: 12, paddingHorizontal: 4}}>
            {(['all', 'single', 'combo'] as const).map(type => {
              const label = type === 'all' ? 'All' : type === 'single' ? 'Single Ep' : 'Combo Ep';
              const isActive = activeEpType === type;
              return (
                <TouchableOpacity
                  key={type}
                  onPress={() => setActiveEpType(type)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 7,
                    borderRadius: 20,
                    backgroundColor: isActive ? colors.primary : colors.surfaceContainerHigh,
                    borderWidth: 1,
                    borderColor: isActive ? colors.primary : colors.outlineVariant,
                  }}>
                  <Text style={{color: isActive ? colors.onPrimary : colors.onSurface, fontSize: 13, fontWeight: isActive ? '700' : '500'}}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        );
      })()}

      {/* Episode/Direct Links List */}
      <View className="w-full mt-3">
        {/* Episodes List */}
        {filteredAndSortedEpisodes.length > 0 && (
          <FlatList
            data={filteredAndSortedEpisodes}
            keyExtractor={(item, index) => `episode-${item.link}-${index}`}
            renderItem={renderEpisodeItem}
            maxToRenderPerBatch={10}
            windowSize={10}
            removeClippedSubviews={true}
          />
        )}

        {/* Direct Links List */}
        {filteredAndSortedDirectLinks.length > 0 && (
          <View className="w-full mt-2">
            <FlatList
              data={filteredAndSortedDirectLinks}
              keyExtractor={(item, index) => `direct-${item.link}-${index}`}
              renderItem={renderDirectLinkItem}
              maxToRenderPerBatch={10}
              windowSize={10}
              removeClippedSubviews={true}
            />
          </View>
        )}

        {/* No Content Available */}
        {filteredAndSortedEpisodes.length === 0 &&
          filteredAndSortedDirectLinks.length === 0 &&
          LinkList?.length === 0 && (
            <Text
              className="min-h-20 text-lg font-semibold"
              style={{color: colors.onSurfaceVariant}}>
              No stream found
            </Text>
          )}
      </View>

      {/* VLC Loading Indicator */}
      {vlcLoading && (
        <View className="absolute top-0 left-0 w-full h-full bg-black/60 bg-opacity-50 justify-center items-center">
          <Animated.View style={[vlcLoadingAnimatedStyle]}>
            <MaterialCommunityIcons name="vlc" size={70} color={primary} />
          </Animated.View>
          <Text
            className="mt-2 text-lg font-semibold"
            style={{color: colors.onSurface}}>
            Loading available servers...
          </Text>
        </View>
      )}

      <MaterialDialogSurface
        visible={episodeDetails !== null}
        onDismiss={() => setEpisodeDetails(null)}
        style={{padding: 0}}>
        {episodeDetails ? (
          <>
            {getValidImageUri(episodeDetails.image) &&
            !episodeDetailsImageFailed ? (
              <Image
                source={getValidImageUri(episodeDetails.image)}
                contentFit="cover"
                transition={200}
                onError={() => setEpisodeDetailsImageFailed(true)}
                style={{aspectRatio: 16 / 9, width: '100%'}}
              />
            ) : (
              <View
                style={{
                  alignItems: 'center',
                  aspectRatio: 16 / 9,
                  backgroundColor: colors.surfaceContainerHighest,
                  justifyContent: 'center',
                  width: '100%',
                }}>
                <MaterialCommunityIcons
                  name="image-off-outline"
                  size={44}
                  color={colors.onSurfaceVariant}
                />
              </View>
            )}
            <View style={{padding: 20}}>
              <Text
                role="titleLarge"
                style={{color: colors.onSurface, fontWeight: '700'}}>
                {episodeDetails.title}
              </Text>
              <ScrollView style={{maxHeight: 230}}>
                <Text
                  role="bodyMedium"
                  style={{
                    color: colors.onSurfaceVariant,
                    lineHeight: 22,
                    marginTop: 10,
                  }}>
                  {episodeDetails.description}
                </Text>
              </ScrollView>
            </View>
          </>
        ) : null}
      </MaterialDialogSurface>

      <MaterialDialogSurface
        visible={showServerModal}
        onDismiss={() => setShowServerModal(false)}>
        <Text
          className="mb-2 text-center text-xl font-bold"
          style={{color: colors.onSurface}}>
          Select External Player Server
        </Text>
        <Text
          className="mb-4 text-center text-sm"
          style={{color: colors.onSurfaceVariant}}>
          {externalPlayerStreams.length} servers available
        </Text>

        {isLoadingStreams ? (
          <LoadingIndicator size={40} color={primary} />
        ) : (
          <>
            <ScrollView style={{maxHeight: 300}}>
              {externalPlayerStreams.map((item, index) =>
                renderServerItem(item, index),
              )}
              {externalPlayerStreams.length === 0 && (
                <Text
                  className="p-4 text-center"
                  style={{color: colors.onSurfaceVariant}}>
                  No servers available
                </Text>
              )}
            </ScrollView>

            <TouchableOpacity
              className="mt-4 py-3"
              style={{
                backgroundColor: colors.secondaryContainer,
                borderRadius: 18,
              }}
              onPress={() => setShowServerModal(false)}>
              <Text
                className="text-center font-bold"
                style={{color: colors.onSecondaryContainer}}>
                Cancel
              </Text>
            </TouchableOpacity>
          </>
        )}
      </MaterialDialogSurface>

      <MaterialDialogSurface
        visible={stickyMenu.active}
        onDismiss={() => setStickyMenu({active: false})}>
        <Text
          className="mb-4 text-xl font-bold"
          style={{color: colors.onSurface}}>
          Episode actions
        </Text>
        <View style={{gap: 10}}>
          {isCompleted(stickyMenu.link || '') ? (
            <TouchableOpacity
              className="h-12 flex-row items-center gap-3 px-4"
              style={{
                backgroundColor: colors.surfaceContainerHighest,
                borderRadius: 18,
              }}
              onPress={markAsUnwatched}>
              <Ionicons name="checkmark-done" size={30} color={primary} />
              <Text style={{color: colors.onSurface}}>Mark as unwatched</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              className="h-12 flex-row items-center gap-3 px-4"
              style={{
                backgroundColor: colors.surfaceContainerHighest,
                borderRadius: 18,
              }}
              onPress={markAsWatched}>
              <Ionicons name="checkmark" size={25} color={primary} />
              <Text style={{color: colors.onSurface}}>Mark as watched</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            className="h-12 flex-row items-center gap-3 px-4"
            style={{
              backgroundColor: colors.surfaceContainerHighest,
              borderRadius: 18,
            }}
            onPress={handleStickyMenuExternalPlayer}>
            <Feather name="external-link" size={20} color={primary} />
            <Text style={{color: colors.onSurface}}>External player</Text>
          </TouchableOpacity>
        </View>
      </MaterialDialogSurface>
    </View>
  );
};

export default SeasonList;
