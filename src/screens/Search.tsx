import {View, FlatList, Pressable, Text} from 'react-native';
import React, {useState, useEffect, useCallback, memo, useRef} from 'react';
import {useNavigation} from '@react-navigation/native';
import type {BottomTabNavigationProp} from '@react-navigation/bottom-tabs';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {SearchStackParamList, TabStackParamList} from '../App';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {MMKV} from '../lib/Mmkv';
import {SafeAreaView} from 'react-native-safe-area-context';
import Animated, {FadeInDown} from 'react-native-reanimated';
import debounce from 'lodash/debounce';
import Button from '../components/ui/Button';
import IconButton from '../components/ui/IconButton';
import AppText from '../components/ui/Text';
import SearchField, {type SearchFieldRef} from '../components/ui/SearchField';
import {useM3Colors} from '../theme/M3PaletteContext';
import {
  fetchIMDbSuggestions,
  type IMDbSuggestion,
} from '../lib/services/imdbSuggestions';

const MAX_VISIBLE_RESULTS = 15;
const MAX_HISTORY_ITEMS = 30;

const SearchResultItem = memo(
  ({
    item,
    onPress,
  }: {
    item: IMDbSuggestion;
    onPress: (title: string) => void;
  }) => {
    const colors = useM3Colors();
    const handlePress = useCallback(() => {
      onPress(item.title);
    }, [item.title, onPress]);

    return (
      <View style={{paddingHorizontal: 16, paddingVertical: 5}}>
        <Pressable
          onPress={handlePress}
          style={({pressed}) => ({
            backgroundColor: pressed
              ? colors.surfaceContainerHighest
              : colors.surfaceContainerLow,
            borderRadius: 20,
            padding: 14,
          })}>
          <View style={{alignItems: 'center', flexDirection: 'row'}}>
            <View
              style={{
                alignItems: 'center',
                backgroundColor: colors.secondaryContainer,
                borderRadius: 16,
                height: 44,
                justifyContent: 'center',
                marginRight: 14,
                width: 44,
              }}>
              <MaterialCommunityIcons
                name={item.type === 'tv' ? 'television' : 'movie-open'}
                size={22}
                color={colors.onSecondaryContainer}
              />
            </View>
            <View style={{flex: 1}}>
              <AppText
                role="bodyLargeEmphasized"
                style={{color: colors.onSurface}}>
                {item.title}
              </AppText>
              <AppText
                role="bodySmall"
                style={{color: colors.onSurfaceVariant, marginTop: 2}}>
                {item.type === 'tv' ? 'TV Show' : 'Movie'}
                {item.year ? ` \u2022 ${item.year}` : ''}
              </AppText>
            </View>
            <MaterialCommunityIcons
              name="arrow-top-right"
              size={20}
              color={colors.onSurfaceVariant}
            />
          </View>
        </Pressable>
      </View>
    );
  },
);

const HistoryItem = memo(
  ({
    search,
    onPress,
    onRemove,
  }: {
    search: string;
    onPress: (text: string) => void;
    onRemove: (text: string) => void;
  }) => {
    const colors = useM3Colors();
    const handlePress = useCallback(() => {
      onPress(search);
    }, [search, onPress]);

    const handleRemove = useCallback(() => {
      onRemove(search);
    }, [search, onRemove]);

    return (
      <Pressable
        onPress={handlePress}
        className="flex-row items-center rounded-[20px] mb-2 px-4 py-3.5"
        style={({pressed}) => ({
          backgroundColor: colors.surfaceContainerLow,
          opacity: pressed ? 0.72 : 1,
        })}>
        <MaterialCommunityIcons
          name="history"
          size={22}
          color={colors.onSurfaceVariant}
        />
        <Text
          numberOfLines={1}
          className="flex-1 mx-3"
          style={{
            color: colors.onSurface,
            fontSize: 16,
            fontWeight: '500',
          }}>
          {search}
        </Text>
        <Pressable
          onPress={handleRemove}
          hitSlop={8}
          accessibilityLabel={`Remove ${search} from recent searches`}>
          <MaterialCommunityIcons
            name="close"
            size={18}
            color={colors.onSurfaceVariant}
          />
        </Pressable>
      </Pressable>
    );
  },
);

const Search = () => {
  const colors = useM3Colors();
  const navigation =
    useNavigation<NativeStackNavigationProp<SearchStackParamList>>();
  const [searchText, setSearchText] = useState('');
  const [searchHistory, setSearchHistory] = useState<string[]>(
    MMKV.getArray<string>('searchHistory') || [],
  );
  const [searchResults, setSearchResults] = useState<IMDbSuggestion[]>([]);
  const searchFieldRef = useRef<SearchFieldRef>(null);
  const focusAfterTabResetRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const tabNavigation =
      navigation.getParent<BottomTabNavigationProp<TabStackParamList>>();
    if (!tabNavigation) {
      return;
    }

    const unsubscribeTabPress = tabNavigation.addListener('tabPress', event => {
      const state = tabNavigation.getState();
      if (state.routes[state.index]?.name !== 'SearchStack') {
        return;
      }

      if (!navigation.isFocused()) {
        event.preventDefault();
        focusAfterTabResetRef.current = true;
        navigation.popToTop();
        return;
      }

      searchFieldRef.current?.focus();
    });
    const unsubscribeFocus = navigation.addListener('focus', () => {
      if (!focusAfterTabResetRef.current) {
        return;
      }
      focusAfterTabResetRef.current = false;
      searchFieldRef.current?.focus();
    });

    return () => {
      unsubscribeTabPress();
      unsubscribeFocus();
    };
  }, [navigation]);

  const debouncedSearch = useCallback(
    debounce(async (text: string) => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (text.length >= 2) {
        const controller = new AbortController();
        abortControllerRef.current = controller;
        const results = await fetchIMDbSuggestions(text, controller.signal);
        if (!controller.signal.aborted) {
          setSearchResults(results.slice(0, MAX_VISIBLE_RESULTS));
        }
      } else {
        setSearchResults([]);
      }
    }, 250),
    [],
  );

  useEffect(() => {
    debouncedSearch(searchText);
    return () => {
      debouncedSearch.cancel();
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [searchText, debouncedSearch]);

  const handleSearch = useCallback(
    (text: string) => {
      if (text.trim()) {
        const prevSearches = MMKV.getArray<string>('searchHistory') || [];
        if (!prevSearches.includes(text.trim())) {
          const newSearches = [text.trim(), ...prevSearches].slice(
            0,
            MAX_HISTORY_ITEMS,
          );
          MMKV.setArray('searchHistory', newSearches);
          setSearchHistory(newSearches);
        }

        navigation.navigate('SearchResults', {
          filter: text.trim(),
        });
      }
    },
    [navigation],
  );

  const removeHistoryItem = useCallback(
    (search: string) => {
      const newSearches = searchHistory.filter(item => item !== search);
      MMKV.setArray('searchHistory', newSearches);
      setSearchHistory(newSearches);
    },
    [searchHistory],
  );

  const clearHistory = useCallback(() => {
    MMKV.setArray('searchHistory', []);
    setSearchHistory([]);
  }, []);

  const handleResultPress = useCallback(
    (title: string) => {
      const prevSearches = MMKV.getArray<string>('searchHistory') || [];
      if (!prevSearches.includes(title)) {
        const newSearches = [title, ...prevSearches].slice(
          0,
          MAX_HISTORY_ITEMS,
        );
        MMKV.setArray('searchHistory', newSearches);
        setSearchHistory(newSearches);
      }
      navigation.navigate('SearchResults', {
        filter: title,
      });
    },
    [navigation],
  );

  const renderSearchResult = useCallback(
    ({item}: {item: IMDbSuggestion}) => (
      <SearchResultItem item={item} onPress={handleResultPress} />
    ),
    [handleResultPress],
  );

  const renderHistoryItem = useCallback(
    ({item}: {item: string}) => (
      <HistoryItem
        search={item}
        onPress={handleSearch}
        onRemove={removeHistoryItem}
      />
    ),
    [handleSearch, removeHistoryItem],
  );

  const searchResultKeyExtractor = useCallback(
    (item: IMDbSuggestion, index: number) => `${item.title}-${index}`,
    [],
  );
  const historyKeyExtractor = useCallback(
    (item: string, index: number) => `history-${index}`,
    [],
  );

  const AnimatedContainer = Animated.View;

  return (
    <SafeAreaView className="flex-1 bg-m3-background">
      <AnimatedContainer
        entering={FadeInDown.duration(300)}
        className="px-4 pt-3">
        <AppText
          style={{
            color: colors.onSurfaceVariant,
            fontSize: 13,
            marginBottom: 14,
          }}>
          Search across all providers
        </AppText>
        <View className="flex-row items-center space-x-3 mb-3">
          <View className="flex-1">
            <SearchField
              ref={searchFieldRef}
              value={searchText}
              onChangeText={setSearchText}
              onSubmit={handleSearch}
              placeholder="Search anime..."
            />
          </View>
          {searchText.length > 0 && (
            <IconButton
              icon="close"
              label="Clear search"
              onPress={() => setSearchText('')}
              size={18}
            />
          )}
        </View>
      </AnimatedContainer>

      <View className="flex-1">
        {searchResults.length > 0 ? (
          <FlatList
            data={searchResults}
            keyExtractor={searchResultKeyExtractor}
            renderItem={renderSearchResult}
            contentContainerStyle={{paddingTop: 4}}
            showsVerticalScrollIndicator={false}
            removeClippedSubviews={true}
            maxToRenderPerBatch={10}
            updateCellsBatchingPeriod={50}
            windowSize={10}
            initialNumToRender={10}
          />
        ) : searchHistory.length > 0 ? (
          <AnimatedContainer
            entering={FadeInDown.duration(250)}
            className="px-4 flex-1 pt-4">
            <View className="flex-row items-center justify-between mb-3">
              <AppText
                role="titleMediumEmphasized"
                className="text-m3-on-surface">
                Recent Searches
              </AppText>
              <Button compact variant="text" onPress={clearHistory}>
                Clear all
              </Button>
            </View>

            <FlatList
              data={searchHistory}
              keyExtractor={historyKeyExtractor}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{paddingBottom: 20}}
              renderItem={renderHistoryItem}
              removeClippedSubviews={false}
              maxToRenderPerBatch={10}
              updateCellsBatchingPeriod={50}
              windowSize={10}
              initialNumToRender={10}
            />
          </AnimatedContainer>
        ) : (
          <AnimatedContainer
            entering={FadeInDown.duration(300)}
            className="items-center justify-center flex-1 px-8">
            <View className="mb-5 rounded-[28px] bg-m3-secondary-container p-7">
              <MaterialCommunityIcons
                name="magnify"
                size={32}
                color={colors.onSecondaryContainer}
              />
            </View>
            <AppText
              role="bodyLarge"
              className="text-center text-m3-on-surface">
              Your next watch starts here
            </AppText>
            <AppText
              role="bodyMedium"
              className="mt-1 text-center text-m3-on-surface-variant">
              Search by title, then browse every provider in one place
            </AppText>
          </AnimatedContainer>
        )}
      </View>
    </SafeAreaView>
  );
};

export default Search;
