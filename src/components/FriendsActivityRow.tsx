import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, {useCallback, useEffect, useState} from 'react';
import {Image, Pressable, Text as RNText, View} from 'react-native';
import {useFocusEffect, CommonActions} from '@react-navigation/native';
import {navigationRef} from '../App';
import AppText from '../ui/Text';
import {useM3Colors} from '../../theme/M3PaletteContext';
import {useAuthStore} from '../../lib/zustand/authStore';
import {
  friendsService,
  FriendActivity,
  FriendRec,
} from '../../lib/services/friendsService';

// "Friends are watching" strip + friend-based recommendation row for Home.
// Hidden entirely when logged out, no friends, or nothing recent.

const timeAgo = (dateStr: string) => {
  const diff = Date.now() - new Date(dateStr.replace(' ', 'T') + 'Z').getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'এইমাত্র';
  if (mins < 60) return `${mins}ম`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}ঘ`;
  return `${Math.floor(hrs / 24)}দি`;
};

const FriendsActivityRow = () => {
  const colors = useM3Colors();
  const token = useAuthStore(s => s.token);
  const [activity, setActivity] = useState<FriendActivity[]>([]);
  const [recs, setRecs] = useState<FriendRec[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(() => {
    if (!token) return;
    friendsService
      .getActivity()
      .then(d => {
        setActivity(d.activity);
        setRecs(d.recs);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    load();
  }, [load]);

  if (!token || !loaded) return null;
  if (activity.length === 0 && recs.length === 0) return null;

  const openContent = (link: string, provider: string, poster?: string) => {
    try {
      navigationRef.dispatch(
        CommonActions.navigate('TabStack', {
          screen: 'HomeStack',
          params: {
            screen: 'Info',
            params: {link, provider, poster: poster || undefined},
          },
        }),
      );
    } catch {}
  };

  return (
    <View style={{marginTop: 18}}>
      {activity.length > 0 ? (
        <View>
          <View
            style={{
              alignItems: 'center',
              flexDirection: 'row',
              gap: 7,
              paddingHorizontal: 18,
            }}>
            <MaterialCommunityIcons
              name="account-group"
              size={17}
              color={colors.primary}
            />
            <AppText
              role="titleMediumEmphasized"
              style={{color: colors.onBackground}}>
              বন্ধুরা এখন দেখছে
            </AppText>
          </View>
          <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10, paddingHorizontal: 18}}>
            {activity.slice(0, 6).map((a, i) => (
              <Pressable
                key={`${a.user_id}-${a.link}-${i}`}
                onPress={() => openContent(a.link, a.provider, a.image)}
                style={({pressed}) => ({
                  alignItems: 'center',
                  backgroundColor: colors.surfaceContainerLow,
                  borderColor: colors.outlineVariant,
                  borderWidth: 1,
                  borderRadius: 20,
                  flexDirection: 'row',
                  gap: 8,
                  opacity: pressed ? 0.8 : 1,
                  paddingRight: 12,
                  paddingLeft: 4,
                  paddingVertical: 4,
                })}>
                <View
                  style={{
                    alignItems: 'center',
                    backgroundColor: colors.primaryContainer,
                    borderRadius: 16,
                    height: 32,
                    justifyContent: 'center',
                    width: 32,
                  }}>
                  <RNText style={{color: colors.onPrimaryContainer, fontSize: 13, fontWeight: '700'}}>
                    {a.username.slice(0, 1).toUpperCase()}
                  </RNText>
                </View>
                <View style={{flexShrink: 1}}>
                  <AppText role="labelLargeEmphasized" numberOfLines={1} style={{color: colors.onBackground}}>
                    {a.username}
                  </AppText>
                  <AppText role="labelSmallEmphasized" numberOfLines={1} style={{color: colors.onSurfaceVariant, maxWidth: 150}}>
                    {a.title}
                  </AppText>
                </View>
                <AppText role="labelSmallEmphasized" style={{color: colors.primary}}>
                  {timeAgo(a.updated_at)}
                </AppText>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {recs.length > 0 ? (
        <View style={{marginTop: activity.length > 0 ? 20 : 0}}>
          <View
            style={{
              alignItems: 'center',
              flexDirection: 'row',
              gap: 7,
              paddingHorizontal: 18,
            }}>
            <MaterialCommunityIcons
              name="star-four-points-outline"
              size={17}
              color="#f59e0b"
            />
            <AppText
              role="titleMediumEmphasized"
              style={{color: colors.onBackground}}>
              বন্ধুদের পছন্দ
            </AppText>
          </View>
          <View style={{flexDirection: 'row', flexWrap: 'nowrap', marginTop: 10, paddingHorizontal: 18}}>
            {recs.slice(0, 10).map((r, i) => (
              <Pressable
                key={`${r.link}-${i}`}
                onPress={() => openContent(r.link, r.provider, r.image)}
                style={({pressed}) => ({marginRight: 10, opacity: pressed ? 0.8 : 1})}>
                <View
                  style={{
                    backgroundColor: colors.surfaceContainerHigh,
                    borderRadius: 10,
                    height: 168,
                    overflow: 'hidden',
                    width: 114,
                  }}>
                  {r.image ? (
                    <Image
                      source={{uri: r.image}}
                      style={{height: '100%', resizeMode: 'cover', width: '100%'}}
                    />
                  ) : (
                    <View style={{alignItems: 'center', flex: 1, justifyContent: 'center', padding: 6}}>
                      <MaterialCommunityIcons name="movie-outline" size={30} color={colors.onSurfaceVariant} />
                      <AppText role="labelSmallEmphasized" numberOfLines={3} style={{color: colors.onSurfaceVariant, textAlign: 'center'}}>
                        {r.title}
                      </AppText>
                    </View>
                  )}
                  {r.watchers > 1 ? (
                    <View
                      style={{
                        backgroundColor: colors.primary,
                        borderRadius: 9,
                        bottom: 6,
                        left: 6,
                        paddingHorizontal: 7,
                        paddingVertical: 2,
                        position: 'absolute',
                      }}>
                      <RNText style={{color: colors.onPrimary, fontSize: 10, fontWeight: '700'}}>
                        👥 {r.watchers}
                      </RNText>
                    </View>
                  ) : null}
                </View>
                <AppText role="labelMediumEmphasized" numberOfLines={2} style={{color: colors.onSurfaceVariant, marginTop: 6, maxWidth: 114}}>
                  {r.title}
                </AppText>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
};

export default FriendsActivityRow;
