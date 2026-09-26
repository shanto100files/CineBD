import React, {useCallback, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {Image} from 'expo-image';
import LinearGradient from 'react-native-linear-gradient';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import VideoPlayer from '../../../components/media-console';
import {RootStackParamList} from '../../../App';
import {useEpisodes} from '../../../lib/hooks/useEpisodes';
import {useStream} from '../../../lib/hooks/useStream';
import {Link, Stream} from '../../../lib/providers/types';
import {useM3Colors} from '../../../theme/M3PaletteContext';

interface InlinePlayerProps {
  /** Poster/backdrop shown before playback starts. */
  backdrop: string;
  title?: string;
  /** Link list from meta: series season entries (episodesLink) or movie directLinks. */
  linkList: Link[];
  providerValue: string;
  type: string;
  /** Info page link, used for resume/progress association. */
  infoUrl?: string;
  /** Poster object passed to the fullscreen player on expand. */
  poster: {
    logo?: string;
    poster?: string;
    background?: string;
  };
}

// Prime-Video-style inline player at the top of the Info page.
// Idle: backdrop + big play button. Playing: the real video with the shared
// media-console controls, constrained to 16:9 inside the scroll. Below the
// surface: season chips, episode quick-pick chips and quality chips. The
// fullscreen button hands playback off to the landscape Player screen.
const InlinePlayer = ({
  backdrop,
  title,
  linkList,
  providerValue,
  type,
  infoUrl,
  poster,
}: InlinePlayerProps) => {
  const colors = useM3Colors();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [playing, setPlaying] = useState(false);
  const seasonEntries = useMemo(
    () => linkList.filter(l => l.episodesLink),
    [linkList],
  );
  const movieEntry = useMemo(
    () => linkList.find(l => l.directLinks?.length),
    [linkList],
  );
  const [activeSeason, setActiveSeason] = useState<Link | undefined>(
    () => seasonEntries[0],
  );

  const seasonLink = activeSeason || seasonEntries[0] || movieEntry;
  const {data: episodeList = [], isLoading: episodesLoading} = useEpisodes(
    seasonLink?.episodesLink,
    providerValue,
    Boolean(seasonLink?.episodesLink),
  );

  const pickableList: any[] = useMemo(
    () =>
      episodeList.length > 0 ? episodeList : seasonLink?.directLinks || [],
    [episodeList, seasonLink],
  );

  const [selection, setSelection] = useState<{
    episodeData: any[];
    linkIndex: number;
    episode: any;
  } | null>(null);

  const activeEpisode = selection?.episode;
  const streamRouteParams = useMemo(
    () =>
      selection
        ? {
            linkIndex: selection.linkIndex,
            episodeList: selection.episodeData,
            type,
            primaryTitle: title,
            secondaryTitle: seasonLink?.title,
            providerValue,
            poster,
            infoUrl,
          }
        : undefined,
    [selection, type, title, seasonLink, providerValue, poster, infoUrl],
  );
  const {
    streamData: streams,
    selectedStream,
    setSelectedStream,
    isLoading: streamLoading,
  } = useStream({
    activeEpisode,
    routeParams: streamRouteParams,
    provider: providerValue,
    enabled: playing && Boolean(activeEpisode),
  });

  const selectAndPlay = useCallback(
    (episodeData: any[], linkIndex: number) => {
      const episode = episodeData[linkIndex];
      if (!episode) {
        return;
      }
      setSelection({episodeData, linkIndex, episode});
      setPlaying(true);
    },
    [],
  );

  const expandToFullscreen = useCallback(() => {
    if (!selection) {
      return;
    }
    const payload = {
      linkIndex: selection.linkIndex,
      episodeList: selection.episodeData,
      type,
      primaryTitle: title,
      secondaryTitle: seasonLink?.title,
      poster,
      providerValue,
      infoUrl,
    };
    // Stop inline playback first so audio doesn't keep running underneath
    // the fullscreen Player screen.
    setPlaying(false);
    setSelection(null);
    // navigate bubbles up to the root stack where the landscape Player lives
    // (same pattern SeasonList uses); back from there returns to Info.
    navigation.navigate('Player', payload as never);
  }, [navigation, selection, title, seasonLink?.title, poster, providerValue, type, infoUrl]);

  const showSeasonChips = seasonEntries.length > 1;
  // Series with per-episode quality rows: collapse them into episode groups so
  // chips read E1 E2 E3 instead of E6 E6 E6 (one entry per quality).
  const episodeGroups = useMemo(() => {
    if (episodeList.length === 0) {
      return [];
    }
    const groups: {label: string; entries: {ep: any; index: number}[]}[] = [];
    const byLabel = new Map<string, {label: string; entries: {ep: any; index: number}[]}>
      ();
    episodeList.forEach((ep, index) => {
      const label = episodeGroupLabel(ep, index);
      let group = byLabel.get(label);
      if (!group) {
        group = {label, entries: []};
        byLabel.set(label, group);
        groups.push(group);
      }
      group.entries.push({ep, index});
    });
    return groups;
  }, [episodeList]);

  const isMovieMode = !seasonLink?.episodesLink;
  const showEpisodeChips = !isMovieMode && episodeGroups.length > 1;
  // Active episode's group: those quality rows become the quality chips.
  const activeGroup = useMemo(() => {
    if (isMovieMode || !selection) {
      return null;
    }
    const idx = selection.episodeData === episodeList ? selection.linkIndex : -1;
    return episodeGroups.find(g => g.entries.some(e => e.index === idx)) || null;
  }, [episodeGroups, episodeList, isMovieMode, selection]);
  const showQualityChips =
    isMovieMode || activeGroup
      ? streams.length > 1
      : false;

  const selectEpisodeGroup = useCallback(
    (groupIndex: number) => {
      const group = episodeGroups[groupIndex];
      if (!group || group.entries.length === 0) {
        return;
      }
      // Default pick: best-looking entry (highest quality number wins).
      const best = [...group.entries].sort((a, b) => {
        const qa = parseInt(String(a.ep?.title || '').match(/(\d{3,4})p/i)?.[1] || '0', 10);
        const qb = parseInt(String(b.ep?.title || '').match(/(\d{3,4})p/i)?.[1] || '0', 10);
        return qb - qa;
      })[0];
      selectAndPlay(episodeList, best.index);
    },
    [episodeGroups, episodeList, selectAndPlay],
  );

  return (
    <View>
      <View style={styles.playerWrap}>
        {playing && activeEpisode ? (
          <View style={styles.fill}>
            {streamLoading || !selectedStream?.link ? (
              <View style={[styles.fill, styles.loadingBox]}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.loadingText}>Loading stream...</Text>
              </View>
            ) : (
              <VideoPlayer
                source={{uri: selectedStream.link}}
                title={{
                  primary: (title || '').slice(0, 70),
                  secondary: activeEpisode?.title,
                }}
                showOnStart
                showDuration
                showHours
                rewindTime={10}
                doubleTapTime={200}
                seekColor={colors.primary}
                disableVolume
                isFullscreen={false}
                toggleResizeModeOnFullscreen={false}
                onEnterFullscreen={expandToFullscreen}
                onBack={expandToFullscreen}
                progressUpdateInterval={1000}
              />
            )}
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Play"
            onPress={() => selectAndPlay(pickableList, 0)}
            style={styles.fill}>
            {backdrop ? (
              <Image
                source={{uri: backdrop}}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
              />
            ) : (
              <View
                style={[
                  StyleSheet.absoluteFill,
                  {backgroundColor: colors.surfaceContainerLowest},
                ]}
              />
            )}
            <LinearGradient
              colors={['rgba(0,0,0,0.05)', 'rgba(0,0,0,0.55)']}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.centerOverlay}>
              {episodesLoading && pickableList.length === 0 ? (
                <ActivityIndicator size="large" color={colors.primary} />
              ) : (
                <View
                  style={[styles.playCircle, {backgroundColor: colors.primary}]}>
                  <MaterialCommunityIcons
                    name="play"
                    size={34}
                    color={colors.onPrimary}
                  />
                </View>
              )}
              {title ? (
                <Text numberOfLines={1} style={styles.idleTitle}>
                  {title}
                </Text>
              ) : null}
            </View>
          </Pressable>
        )}
      </View>

      {/* Season chips */}
      {showSeasonChips ? (
        <View style={styles.chipRowWrap}>
          <ChipRow
            items={seasonEntries.map((l, i) => ({
              key: l.episodesLink || String(i),
              label: l.title || `Season ${i + 1}`,
              active: seasonLink?.episodesLink === l.episodesLink,
              onPress: () => {
                setActiveSeason(l);
                setSelection(null);
                setPlaying(false);
              },
            }))}
          />
        </View>
      ) : null}

      {/* Episode quick-pick chips (01 02 03... plays inline immediately) */}
      {showEpisodeChips ? (
        <View style={styles.chipRowWrap}>
          <ChipRow
            items={episodeGroups.map((group, gi) => ({
              key: group.label + gi,
              label: group.label,
              active: Boolean(activeGroup) && activeGroup === group,
              onPress: () => selectEpisodeGroup(gi),
            }))}
          />
        </View>
      ) : null}

      {/* Quality chips: movie qualities or the active episode's qualities */}
      {showQualityChips ? (
        <View style={styles.chipRowWrap}>
          <ChipRow
            items={streams.map((s: Stream, i) => ({
              key: s.link || String(i),
              label: s.quality ? `${s.quality}p` : s.server || `Source ${i + 1}`,
              active: selectedStream?.link === s.link,
              onPress: () => setSelectedStream(s),
            }))}
          />
        </View>
      ) : null}
    </View>
  );
};

// Chip label for an episode group: prefers the E-number ("E6", "E113-120"),
// falls back to a trimmed title so chips stay pill-sized.
const episodeGroupLabel = (ep: any, index: number): string => {
  const raw: string = ep?.title || '';
  const m = raw.match(/E\d{1,4}(?:-\d{1,4})?/);
  if (m) {
    return m[0];
  }
  return raw.length > 14 ? `${raw.slice(0, 13)}…` : raw || `Ep ${index + 1}`;
};

const ChipRow = ({
  items,
}: {
  items: {key: string; label: string; active: boolean; onPress: () => void}[];
}) => {
  const colors = useM3Colors();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipRow}>
      {items.map(item => (
        <Pressable
          key={item.key}
          accessibilityRole="button"
          onPress={item.onPress}
          style={[
            styles.chip,
            {
              backgroundColor: item.active
                ? colors.primary
                : colors.surfaceContainerHigh,
            },
          ]}>
          <Text
            numberOfLines={1}
            style={[
              styles.chipText,
              {color: item.active ? colors.onPrimary : colors.onSurface},
            ]}>
            {item.label}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  playerWrap: {
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
    width: '100%',
  },
  fill: {
    flex: 1,
    width: '100%',
  },
  loadingBox: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    marginTop: 10,
  },
  centerOverlay: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  playCircle: {
    alignItems: 'center',
    borderRadius: 38,
    height: 76,
    justifyContent: 'center',
    width: 76,
  },
  idleTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 12,
    marginHorizontal: 24,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 4,
  },
  chipRowWrap: {
    marginTop: 10,
  },
  chipRow: {
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 2,
  },
  chip: {
    borderRadius: 18,
    maxWidth: 220,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
  },
});

export default InlinePlayer;
