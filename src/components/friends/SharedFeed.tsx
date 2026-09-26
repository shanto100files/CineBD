import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {CommonActions, useFocusEffect, useNavigation} from '@react-navigation/native';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Image,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  View,
} from 'react-native';
import AppText from '../ui/Text';
import FriendAvatar from './FriendAvatar';
import {friendsService, SharedItem} from '../../lib/services/friendsService';
import {timeAgo} from '../../lib/utils/timeAgo';
import {useAuthStore} from '../../lib/zustand/authStore';
import {useM3Colors} from '../../theme/M3PaletteContext';

interface SharedFeedProps {
  onUnreadChange?: (count: number) => void;
}

const SharedFeed = ({onUnreadChange}: SharedFeedProps) => {
  const colors = useM3Colors();
  const token = useAuthStore(s => s.token);
  const navigation = useNavigation();
  const [items, setItems] = useState<SharedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const unreadCallback = useRef(onUnreadChange);

  useEffect(() => {
    unreadCallback.current = onUnreadChange;
  }, [onUnreadChange]);

  const load = useCallback(async () => {
    try {
      const list = await friendsService.feed();
      setItems(list);
      const unreadIds = list.filter(i => !i.is_read).map(i => i.id);
      unreadCallback.current?.(unreadIds.length);
      if (unreadIds.length > 0) {
        friendsService.markRead(unreadIds).catch(() => {});
      }
    } catch {
      // Keep whatever is on screen; pull-to-refresh can retry.
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (token) {
        load();
      } else {
        setItems([]);
        setLoading(false);
      }
    }, [token, load]),
  );

  const openShared = (item: SharedItem) => {
    navigation.dispatch(
      CommonActions.navigate('TabStack', {
        screen: 'HomeStack',
        params: {
          screen: 'Info',
          params: {
            link: item.link,
            provider: item.provider,
            poster: item.poster || undefined,
          },
        },
      }),
    );
  };

  if (!token) {
    return (
      <View style={{alignItems: 'center', flex: 1, justifyContent: 'center', padding: 32}}>
        <MaterialCommunityIcons
          name="account-group-outline"
          size={56}
          color={colors.onSurfaceVariant}
        />
        <AppText
          role="bodyMedium"
          style={{color: colors.onSurfaceVariant, marginTop: 12, textAlign: 'center'}}>
          বন্ধুদের শেয়ারড দেখতে লগইন করুন
        </AppText>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={{paddingBottom: 120, paddingHorizontal: 16, paddingTop: 4}}
      keyboardShouldPersistTaps="handled"
      style={{flex: 1}}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={colors.primary}
          onRefresh={() => {
            setRefreshing(true);
            load();
          }}
        />
      }>
      {loading ? (
        <ActivityIndicator color={colors.primary} size="large" style={{marginTop: 40}} />
      ) : null}

      {!loading && items.length === 0 ? (
        <View style={{alignItems: 'center', marginTop: 60}}>
          <MaterialCommunityIcons
            name="movie-open-outline"
            size={56}
            color={colors.onSurfaceVariant}
          />
          <AppText
            role="bodyMedium"
            style={{color: colors.onSurfaceVariant, marginTop: 12, textAlign: 'center'}}>
            বন্ধুরা এখনো কিছু শেয়ার করেনি
          </AppText>
        </View>
      ) : null}

      {!loading &&
        items.map(item => (
          <TouchableOpacity
            activeOpacity={0.8}
            key={item.id}
            onPress={() => openShared(item)}
            style={{
              backgroundColor: colors.surfaceContainerLow,
              borderRadius: 16,
              flexDirection: 'row',
              gap: 12,
              marginBottom: 10,
              padding: 10,
            }}>
            <View
              style={{
                backgroundColor: colors.surfaceContainerHigh,
                borderRadius: 10,
                height: 96,
                overflow: 'hidden',
                width: 68,
              }}>
              {item.poster ? (
                <Image
                  source={{uri: item.poster}}
                  style={{height: '100%', resizeMode: 'cover', width: '100%'}}
                />
              ) : (
                <View
                  style={{
                    alignItems: 'center',
                    flex: 1,
                    justifyContent: 'center',
                  }}>
                  <MaterialCommunityIcons
                    name="movie-outline"
                    size={26}
                    color={colors.onSurfaceVariant}
                  />
                </View>
              )}
            </View>

            <View style={{flex: 1, justifyContent: 'center'}}>
              <AppText
                numberOfLines={2}
                role="titleMediumEmphasized"
                style={{color: colors.onBackground}}>
                {item.title || 'Unknown'}
              </AppText>
              <View
                style={{
                  alignItems: 'center',
                  flexDirection: 'row',
                  gap: 6,
                  marginTop: 6,
                }}>
                <FriendAvatar name={item.sender} uri={item.avatar_url} size={18} />
                <AppText
                  numberOfLines={1}
                  role="bodySmall"
                  style={{color: colors.onSurfaceVariant, flexShrink: 1}}>
                  {item.sender} • {timeAgo(item.created_at)}
                </AppText>
              </View>
              {!item.is_read ? (
                <View
                  style={{
                    alignSelf: 'flex-start',
                    backgroundColor: colors.primary,
                    borderRadius: 8,
                    marginTop: 6,
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                  }}>
                  <AppText role="labelSmallEmphasized" style={{color: colors.onPrimary}}>
                    নতুন
                  </AppText>
                </View>
              ) : null}
            </View>

            <MaterialCommunityIcons
              name="chevron-right"
              size={24}
              color={colors.onSurfaceVariant}
              style={{alignSelf: 'center'}}
            />
          </TouchableOpacity>
        ))}
    </ScrollView>
  );
};

export default SharedFeed;
