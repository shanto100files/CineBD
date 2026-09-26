import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, {useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Image,
  Keyboard,
  RefreshControl,
  ScrollView,
  TextInput,
  ToastAndroid,
  TouchableOpacity,
  View,
} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {CommonActions, useFocusEffect} from '@react-navigation/native';
import {SettingsStackParamList} from '../../App';
import AppText from '../../components/ui/Text';
import {useM3Colors} from '../../theme/M3PaletteContext';
import {useAuthStore} from '../../lib/zustand/authStore';
import {
  friendsService,
  FriendsData,
  SearchUser,
  SharedItem,
  ActivityData,
  InboxItem,
} from '../../lib/services/friendsService';

type Tab = 'friends' | 'chats' | 'received';

type Props = NativeStackScreenProps<SettingsStackParamList, 'Friends'>;

const timeAgo = (dateStr: string) => {
  const diff = Date.now() - new Date(dateStr.replace(' ', 'T') + 'Z').getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'এইমাত্র';
  if (mins < 60) return `${mins} মিনিট আগে`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ঘণ্টা আগে`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} দিন আগে`;
  return dateStr.slice(0, 10);
};

const Avatar = ({name, size = 42}: {name: string; size?: number}) => {
  const colors = useM3Colors();
  return (
    <View
      style={{
        alignItems: 'center',
        backgroundColor: colors.primaryContainer,
        borderRadius: size / 2,
        height: size,
        justifyContent: 'center',
        width: size,
      }}>
      <AppText
        role="titleMediumEmphasized"
        style={{color: colors.onPrimaryContainer}}>
        {name.slice(0, 1).toUpperCase()}
      </AppText>
    </View>
  );
};

export default function FriendsScreen({navigation}: Props): React.JSX.Element {
  const colors = useM3Colors();
  const token = useAuthStore(s => s.token);
  const [tab, setTab] = useState<Tab>('friends');
  const [data, setData] = useState<FriendsData | null>(null);
  const [feed, setFeed] = useState<SharedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<SearchUser[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [busyId, setBusyId] = useState(0);
  const [activityVisible, setActivityVisible] = useState(0);
  const [inbox, setInbox] = useState<InboxItem[]>([]);

  const load = useCallback(async () => {
    try {
      const [d, f, a, ib] = await Promise.all([
        friendsService.list(),
        friendsService.feed(),
        friendsService.getActivity().catch(() => null),
        friendsService.inbox().catch(() => [] as InboxItem[]),
      ]);
      setData(d);
      setFeed(f);
      setInbox(ib);
      if (a) setActivityVisible(a.activity_visible);
      // Auto-mark received items as read once they're visible.
      const unreadIds = f.filter(i => !i.is_read).map(i => i.id);
      if (unreadIds.length > 0) {
        friendsService.markRead(unreadIds).catch(() => {});
      }
    } catch {
      ToastAndroid.show('লোড করা যায়নি', ToastAndroid.SHORT);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Reload every time the screen gains focus (e.g. returning from a friend
  // profile after removing/blocking them) so the list is never stale.
  useFocusEffect(
    useCallback(() => {
      if (token) {
        load();
      } else {
        setLoading(false);
      }
    }, [token, load]),
  );

  // Light inbox refresh so chat unread counts stay fresh while the screen is open.
  useEffect(() => {
    if (!token) return;
    const iv = setInterval(() => {
      friendsService
        .inbox()
        .then(setInbox)
        .catch(() => {});
    }, 15000);
    return () => clearInterval(iv);
  }, [token]);

  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) {
      setResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(() => {
      friendsService
        .search(q)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const sendRequest = async (u: SearchUser) => {
    setBusyId(u.id);
    try {
      await friendsService.sendRequest(u.id);
      ToastAndroid.show(
        `${u.username} কে রিকোয়েস্ট পাঠানো হয়েছে`,
        ToastAndroid.SHORT,
      );
      setResults(
        (results || []).map(r =>
          r.id === u.id ? {...r, relation: 'request_sent' as const} : r,
        ),
      );
    } catch (e: any) {
      ToastAndroid.show(
        e.response?.data?.error || 'ব্যর্থ হয়েছে',
        ToastAndroid.SHORT,
      );
    } finally {
      setBusyId(0);
    }
  };

  const respond = async (reqId: number, accept: boolean) => {
    setBusyId(reqId);
    try {
      await friendsService.respond(reqId, accept);
      load();
    } catch {
      ToastAndroid.show('ব্যর্থ হয়েছে', ToastAndroid.SHORT);
    } finally {
      setBusyId(0);
    }
  };

  const toggleActivityVisible = async (visible: boolean) => {
    setActivityVisible(visible ? 1 : 0); // optimistic
    try {
      await friendsService.setActivityVisible(visible);
      ToastAndroid.show(
        visible
          ? 'আপনার দেখার activity এখন বন্ধুরা দেখবে'
          : 'আপনার activity এখন ব্যক্তিগত',
        ToastAndroid.SHORT,
      );
    } catch {
      setActivityVisible(visible ? 0 : 1); // revert
      ToastAndroid.show('ব্যর্থ হয়েছে', ToastAndroid.SHORT);
    }
  };

  const openShared = (item: SharedItem) => {
    Keyboard.dismiss();
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
      <View
        style={{
          alignItems: 'center',
          backgroundColor: colors.background,
          flex: 1,
          justifyContent: 'center',
          padding: 32,
        }}>
        <MaterialCommunityIcons
          name="account-group-outline"
          size={64}
          color={colors.onSurfaceVariant}
        />
        <AppText
          role="titleMediumEmphasized"
          style={{color: colors.onBackground, marginTop: 16, textAlign: 'center'}}>
          বন্ধু যোগ করতে লগইন করুন
        </AppText>
        <AppText
          role="bodyMedium"
          style={{color: colors.onSurfaceVariant, marginTop: 8, textAlign: 'center'}}>
          অ্যাকাউন্ট থাকলে বন্ধুদের সাথে মুভি/সিরিজ শেয়ার করতে পারবেন
        </AppText>
        <TouchableOpacity
          onPress={() => navigation.navigate('Login')}
          style={{
            backgroundColor: colors.primary,
            borderRadius: 24,
            marginTop: 24,
            paddingHorizontal: 32,
            paddingVertical: 12,
          }}>
          <AppText role="labelLargeEmphasized" style={{color: colors.onPrimary}}>
            লগইন করুন
          </AppText>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={{
            position: 'absolute',
            top: 8,
            left: 12,
            alignItems: 'center',
            borderRadius: 21,
            height: 42,
            justifyContent: 'center',
            width: 42,
          }}
          hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
          <MaterialCommunityIcons name="arrow-left" size={26} color={colors.onBackground} />
        </TouchableOpacity>
      </View>
    );
  }

  const q = search.trim();

  // ---- Search box (always visible on the friends tab) ----
  const renderSearchBox = () => (
    <View style={{paddingHorizontal: 16, paddingTop: 4, paddingBottom: 6}}>
      <View
        style={{
          alignItems: 'center',
          backgroundColor: searchFocused
            ? colors.surfaceContainerHighest
            : colors.surfaceContainerHigh,
          borderColor: searchFocused ? colors.primary : 'transparent',
          borderRadius: 28,
          borderWidth: 2,
          flexDirection: 'row',
          gap: 10,
          paddingHorizontal: 16,
          paddingVertical: 4,
        }}>
        <MaterialCommunityIcons
          name="magnify"
          size={22}
          color={searchFocused ? colors.primary : colors.onSurfaceVariant}
        />
        <TextInput
          value={search}
          onChangeText={setSearch}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          placeholder="বন্ধু খুঁজুন (কমপক্ষে ২ অক্ষর)..."
          placeholderTextColor={colors.onSurfaceVariant}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
          style={{
            color: colors.onBackground,
            flex: 1,
            fontSize: 15,
            paddingVertical: 10,
          }}
        />
        {searching ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : search.length > 0 ? (
          <TouchableOpacity
            onPress={() => {
              setSearch('');
              Keyboard.dismiss();
            }}
            style={{padding: 4}}>
            <MaterialCommunityIcons
              name="close-circle"
              size={20}
              color={colors.onSurfaceVariant}
            />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );

  const renderSearchResults = () => {
    if (q.length < 2) return null;
    return (
      <View style={{paddingHorizontal: 16, paddingTop: 6}}>
        <AppText
          role="labelLargeEmphasized"
          style={{color: colors.primary, marginBottom: 4}}>
          {searching
            ? 'খোঁজা হচ্ছে...'
            : `ফলাফল (${results?.length ?? 0})`}
        </AppText>
        {searching && !results ? (
          <View style={{paddingVertical: 8}}>
            {[0, 1, 2].map(i => (
              <View
                key={i}
                style={{
                  backgroundColor: colors.surfaceContainerLow,
                  borderRadius: 14,
                  height: 58,
                  marginBottom: 8,
                }}
              />
            ))}
          </View>
        ) : null}
        {!searching &&
          (results || []).map(u => (
            <View
              key={u.id}
              style={{
                alignItems: 'center',
                backgroundColor: colors.surfaceContainerLow,
                borderRadius: 14,
                flexDirection: 'row',
                gap: 12,
                marginBottom: 8,
                paddingHorizontal: 10,
                paddingVertical: 8,
              }}>
              <Avatar name={u.username} size={40} />
              <AppText
                role="bodyLargeEmphasized"
                style={{color: colors.onBackground, flex: 1}}
                numberOfLines={1}>
                {u.username}
              </AppText>
              {u.relation === 'none' ? (
                <TouchableOpacity
                  disabled={busyId === u.id}
                  onPress={() => sendRequest(u)}
                  style={{
                    alignItems: 'center',
                    backgroundColor: colors.primary,
                    borderRadius: 18,
                    flexDirection: 'row',
                    gap: 4,
                    paddingHorizontal: 14,
                    paddingVertical: 7,
                  }}>
                  {busyId === u.id ? (
                    <ActivityIndicator size="small" color={colors.onPrimary} />
                  ) : (
                    <>
                      <MaterialCommunityIcons
                        name="account-plus"
                        size={15}
                        color={colors.onPrimary}
                      />
                      <AppText
                        role="labelMediumEmphasized"
                        style={{color: colors.onPrimary}}>
                        Add
                      </AppText>
                    </>
                  )}
                </TouchableOpacity>
              ) : (
                <View
                  style={{
                    backgroundColor: colors.surfaceContainerHigh,
                    borderRadius: 14,
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                  }}>
                  <AppText
                    role="labelMediumEmphasized"
                    style={{color: colors.onSurfaceVariant}}>
                    {u.relation === 'friends'
                      ? '✓ বন্ধু'
                      : u.relation === 'request_sent'
                        ? 'পাঠানো হয়েছে'
                        : 'রিকোয়েস্ট এসেছে'}
                  </AppText>
                </View>
              )}
            </View>
          ))}
        {!searching && results && results.length === 0 ? (
          <View style={{alignItems: 'center', paddingVertical: 14}}>
            <MaterialCommunityIcons
              name="account-search-outline"
              size={40}
              color={colors.onSurfaceVariant}
            />
            <AppText
              role="bodyMedium"
              style={{
                color: colors.onSurfaceVariant,
                marginTop: 8,
                textAlign: 'center',
              }}>
              "{q}" নামে কাউকে পাওয়া যায়নি
            </AppText>
          </View>
        ) : null}
        <View
          style={{
            backgroundColor: colors.surfaceContainerLow,
            borderRadius: 12,
            marginTop: 4,
            paddingHorizontal: 12,
            paddingVertical: 8,
          }}>
          <AppText
            role="labelSmallEmphasized"
            style={{color: colors.onSurfaceVariant}}>
            💡 টিপস: বন্ধুর সঠিক ইউজারনেম লিখুন। রিকোয়েস্ট গ্রহণ করলে দুজনেই একে
            অপরকে কন্টেন্ট শেয়ার করতে পারবেন।
          </AppText>
        </View>
        <View style={{height: 1, backgroundColor: colors.outlineVariant, marginTop: 12}} />
      </View>
    );
  };

  const renderFriendsTab = () => (
    <>
      {renderSearchBox()}
      {renderSearchResults()}
      {(data?.incoming.length ?? 0) > 0 ? (
        <View style={{paddingHorizontal: 16}}>
          <AppText
            role="labelLargeEmphasized"
            style={{color: colors.primary, marginTop: 8, marginBottom: 4}}>
            📥 রিকোয়েস্ট ({data!.incoming.length})
          </AppText>
          {data!.incoming.map(r => (
            <View
              key={r.id}
              style={{
                alignItems: 'center',
                backgroundColor: colors.primaryContainer + '33',
                borderColor: colors.primary + '55',
                borderRadius: 14,
                borderWidth: 1,
                flexDirection: 'row',
                gap: 12,
                marginBottom: 8,
                paddingHorizontal: 10,
                paddingVertical: 8,
              }}>
              <Avatar name={r.username} size={40} />
              <View style={{flex: 1}}>
                <AppText
                  role="bodyLargeEmphasized"
                  style={{color: colors.onBackground}}
                  numberOfLines={1}>
                  {r.username}
                </AppText>
                <AppText role="labelSmallEmphasized" style={{color: colors.onSurfaceVariant}}>
                  আপনাকে বন্ধুত্বের রিকোয়েস্ট পাঠিয়েছে
                </AppText>
              </View>
              <TouchableOpacity
                disabled={busyId === r.id}
                onPress={() => respond(r.id, true)}
                style={{
                  alignItems: 'center',
                  backgroundColor: colors.primary,
                  borderRadius: 18,
                  paddingHorizontal: 14,
                  paddingVertical: 7,
                }}>
                {busyId === r.id ? (
                  <ActivityIndicator size="small" color={colors.onPrimary} />
                ) : (
                  <AppText
                    role="labelMediumEmphasized"
                    style={{color: colors.onPrimary}}>
                    Accept
                  </AppText>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                disabled={busyId === r.id}
                onPress={() => respond(r.id, false)}
                style={{
                  backgroundColor: colors.surfaceContainerHigh,
                  borderRadius: 18,
                  paddingHorizontal: 14,
                  paddingVertical: 7,
                }}>
                <AppText
                  role="labelMediumEmphasized"
                  style={{color: colors.onSurfaceVariant}}>
                  Na
                </AppText>
              </TouchableOpacity>
            </View>
          ))}
          <View style={{height: 1, backgroundColor: colors.outlineVariant, marginVertical: 10}} />
        </View>
      ) : null}
      <View style={{paddingHorizontal: 16, paddingBottom: 24}}>
        <AppText
          role="labelLargeEmphasized"
          style={{color: colors.onSurfaceVariant, marginBottom: 4}}>
          👥 বন্ধুরা ({data?.friends.length ?? 0})
        </AppText>
        {(data?.friends.length ?? 0) === 0 && q.length < 2 ? (
          <View style={{alignItems: 'center', paddingVertical: 20}}>
            <MaterialCommunityIcons
              name="account-multiple-outline"
              size={52}
              color={colors.onSurfaceVariant}
            />
            <AppText
              role="bodyMedium"
              style={{
                color: colors.onSurfaceVariant,
                marginTop: 10,
                textAlign: 'center',
              }}>
              এখনো কোনো বন্ধু নেই।{'\n'}উপরের সার্চ বক্সে বন্ধুর ইউজারনেম লিখে Add
              চাপুন।
            </AppText>
          </View>
        ) : null}
        {(data?.friends || []).map(f => {
          const conv = inbox.find(c => c.user_id === f.id);
          const unread = conv?.unread ?? 0;
          return (
          <View
            key={f.id}
            style={{
              alignItems: 'center',
              backgroundColor: unread > 0 ? colors.primaryContainer + '22' : colors.surfaceContainerLow,
              borderRadius: 14,
              flexDirection: 'row',
              gap: 12,
              marginBottom: 8,
              paddingHorizontal: 10,
              paddingVertical: 8,
            }}>
            <TouchableOpacity
              onPress={() =>
                navigation.navigate('FriendProfile', {userId: f.id, username: f.username})
              }>
              <View>
                <Avatar name={f.username} size={40} />
                {unread > 0 ? (
                  <View
                    style={{
                      alignItems: 'center',
                      backgroundColor: colors.primary,
                      borderColor: colors.background,
                      borderRadius: 10,
                      borderWidth: 2,
                      height: 18,
                      justifyContent: 'center',
                      minWidth: 18,
                      paddingHorizontal: 4,
                      position: 'absolute',
                      right: -4,
                      top: -4,
                    }}>
                    <AppText style={{color: colors.onPrimary, fontSize: 9, fontWeight: '800'}}>
                      {unread > 9 ? '9+' : unread}
                    </AppText>
                  </View>
                ) : null}
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() =>
                navigation.navigate('FriendProfile', {userId: f.id, username: f.username})
              }
              style={{flex: 1}}>
              <AppText
                role="bodyLargeEmphasized"
                style={{color: colors.onBackground}}
                numberOfLines={1}>
                {f.username}
              </AppText>
              <AppText
                role="labelSmallEmphasized"
                style={{
                  color: unread > 0 ? colors.primary : colors.onSurfaceVariant,
                  fontWeight: unread > 0 ? '700' : '400',
                }}
                numberOfLines={1}>
                {unread > 0
                  ? `${unread}টি নতুন মেসেজ`
                  : conv?.last_message
                    ? conv.last_message
                    : '✓ বন্ধু • প্রোফাইল দেখুন'}
              </AppText>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() =>
                navigation.navigate('FriendChat', {userId: f.id, username: f.username})
              }
              style={{
                backgroundColor: colors.primaryContainer,
                borderRadius: 18,
                height: 36,
                width: 36,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <MaterialCommunityIcons name="message-outline" size={20} color={colors.primary} />
            </TouchableOpacity>
          </View>
          );
        })}
        {(data?.outgoing.length ?? 0) > 0 ? (
          <>
            <AppText
              role="labelLargeEmphasized"
              style={{color: colors.onSurfaceVariant, marginTop: 14, marginBottom: 4}}>
              ⏳ অপেক্ষমাণ রিকোয়েস্ট
            </AppText>
            {data!.outgoing.map(o => (
              <View
                key={o.id}
                style={{
                  alignItems: 'center',
                  backgroundColor: colors.surfaceContainerLow,
                  borderRadius: 14,
                  flexDirection: 'row',
                  gap: 12,
                  marginBottom: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                }}>
                <Avatar name={o.username} size={40} />
                <AppText
                  role="bodyLargeEmphasized"
                  style={{color: colors.onBackground, flex: 1}}
                  numberOfLines={1}>
                  {o.username}
                </AppText>
                <AppText
                  role="labelMediumEmphasized"
                  style={{color: colors.onSurfaceVariant}}>
                  পাঠানো হয়েছে
                </AppText>
              </View>
            ))}
          </>
        ) : null}

        {/* Privacy card: watch-activity sharing is opt-in (default private). */}
        <View
          style={{
            backgroundColor: colors.surfaceContainerLow,
            borderColor: colors.outlineVariant,
            borderRadius: 14,
            borderWidth: 1,
            marginTop: 14,
            padding: 12,
          }}>
          <View style={{alignItems: 'center', flexDirection: 'row', gap: 10}}>
            <MaterialCommunityIcons
              name={activityVisible ? 'eye' : 'eye-off'}
              size={22}
              color={activityVisible ? colors.primary : colors.onSurfaceVariant}
            />
            <View style={{flex: 1}}>
              <AppText
                role="titleSmallEmphasized"
                style={{color: colors.onBackground}}>
                দেখার activity শেয়ার
              </AppText>
              <AppText
                role="labelSmallEmphasized"
                style={{color: colors.onSurfaceVariant, marginTop: 2}}>
                {activityVisible
                  ? 'বন্ধুরা দেখতে পাবে আপনি কী দেখছেন (৪৮ ঘণ্টা)'
                  : 'ব্যক্তিগত — আপনি কী দেখছেন তা কেউ দেখবে না'}
              </AppText>
            </View>
            <TouchableOpacity
              onPress={() => toggleActivityVisible(!(activityVisible === 1))}
              style={{
                backgroundColor: activityVisible
                  ? colors.primary
                  : colors.surfaceContainerHighest,
                borderRadius: 16,
                paddingHorizontal: 14,
                paddingVertical: 7,
              }}>
              <AppText
                role="labelMediumEmphasized"
                style={{
                  color: activityVisible ? colors.onPrimary : colors.onSurfaceVariant,
                }}>
                {activityVisible ? 'চালু' : 'বন্ধ'}
              </AppText>
            </TouchableOpacity>
          </View>
          <AppText
            role="labelSmallEmphasized"
            style={{
              color: colors.onSurfaceVariant,
              marginTop: 8,
              fontStyle: 'italic',
            }}>
            🔒 ডিফল্টভাবে আপনার দেখা কন্টেন্ট সম্পূর্ণ ব্যক্তিগত। আপনি নিজে Share
            বাটনে পাঠালে সেটাই বন্ধুরা দেখবে।
          </AppText>
        </View>
      </View>
    </>
  );

  const totalUnreadChats = inbox.reduce((s, c) => s + c.unread, 0);

  const renderChatsTab = () => (
    <View style={{paddingHorizontal: 16, paddingBottom: 24, paddingTop: 4}}>
      {loading ? (
        <ActivityIndicator style={{marginTop: 40}} size="large" color={colors.primary} />
      ) : null}
      {!loading && inbox.length === 0 ? (
        <View style={{alignItems: 'center', marginTop: 60}}>
          <MaterialCommunityIcons
            name="message-off-outline"
            size={56}
            color={colors.onSurfaceVariant}
          />
          <AppText
            role="bodyMedium"
            style={{
              color: colors.onSurfaceVariant,
              marginTop: 12,
              textAlign: 'center',
            }}>
            এখনো কোনো কথোপকথন নেই{'\n'}বন্ধু ট্যাব থেকে 💬 আইকনে চেপে মেসেজ পাঠান
          </AppText>
        </View>
      ) : null}
      {!loading &&
        inbox.map(c => (
          <TouchableOpacity
            key={c.user_id}
            activeOpacity={0.8}
            onPress={() =>
              navigation.navigate('FriendChat', {
                userId: c.user_id,
                username: c.username,
              })
            }
            style={{
              alignItems: 'center',
              backgroundColor: colors.surfaceContainerLow,
              borderRadius: 14,
              flexDirection: 'row',
              gap: 12,
              marginBottom: 8,
              paddingHorizontal: 10,
              paddingVertical: 10,
            }}>
            <Avatar name={c.username} size={42} />
            <View style={{flex: 1}}>
              <AppText
                role="bodyLargeEmphasized"
                style={{color: colors.onBackground}}
                numberOfLines={1}>
                {c.username}
              </AppText>
              <AppText
                role="bodySmall"
                style={{
                  color: c.unread > 0 ? colors.onSurface : colors.onSurfaceVariant,
                  fontWeight: c.unread > 0 ? '700' : '400',
                  marginTop: 2,
                }}
                numberOfLines={1}>
                {c.last_message}
              </AppText>
            </View>
            <AppText
              role="labelSmallEmphasized"
              style={{color: colors.onSurfaceVariant}}>
              {timeAgo(c.last_at)}
            </AppText>
            {c.unread > 0 ? (
              <View
                style={{
                  alignItems: 'center',
                  backgroundColor: colors.primary,
                  borderRadius: 12,
                  justifyContent: 'center',
                  minWidth: 22,
                  height: 22,
                  paddingHorizontal: 6,
                }}>
                <AppText
                  role="labelSmallEmphasized"
                  style={{color: colors.onPrimary}}>
                  {c.unread > 99 ? '99+' : c.unread}
                </AppText>
              </View>
            ) : (
              <MaterialCommunityIcons
                name="chevron-right"
                size={22}
                color={colors.onSurfaceVariant}
              />
            )}
          </TouchableOpacity>
        ))}
    </View>
  );

  const renderReceivedTab = () => (
    <View style={{paddingHorizontal: 16, paddingBottom: 24, paddingTop: 4}}>
      {loading ? (
        <ActivityIndicator style={{marginTop: 40}} size="large" color={colors.primary} />
      ) : null}
      {!loading && feed.length === 0 ? (
        <View style={{alignItems: 'center', marginTop: 60}}>
          <MaterialCommunityIcons
            name="movie-open-outline"
            size={56}
            color={colors.onSurfaceVariant}
          />
          <AppText
            role="bodyMedium"
            style={{
              color: colors.onSurfaceVariant,
              marginTop: 12,
              textAlign: 'center',
            }}>
            বন্ধুরা এখনো কিছু শেয়ার করেনি
          </AppText>
        </View>
      ) : null}
      {!loading &&
        feed.map(item => (
          <TouchableOpacity
            key={item.id}
            activeOpacity={0.8}
            onPress={() => openShared(item)}
            style={{
              backgroundColor: colors.surfaceContainerLow,
              borderRadius: 14,
              flexDirection: 'row',
              gap: 12,
              marginBottom: 10,
              padding: 10,
            }}>
            <View
              style={{
                backgroundColor: colors.surfaceContainerHigh,
                borderRadius: 10,
                height: 84,
                width: 60,
                overflow: 'hidden',
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
                    size={24}
                    color={colors.onSurfaceVariant}
                  />
                </View>
              )}
            </View>
            <View style={{flex: 1, justifyContent: 'center'}}>
              <AppText
                role="titleMediumEmphasized"
                style={{color: colors.onBackground}}
                numberOfLines={2}>
                {item.title || 'Unknown'}
              </AppText>
              <AppText
                role="bodySmall"
                style={{color: colors.onSurfaceVariant, marginTop: 4}}>
                {item.sender} • {timeAgo(item.created_at)}
              </AppText>
              {!item.is_read ? (
                <View
                  style={{
                    alignSelf: 'flex-start',
                    backgroundColor: colors.primary,
                    borderRadius: 8,
                    marginTop: 5,
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                  }}>
                  <AppText
                    role="labelSmallEmphasized"
                    style={{color: colors.onPrimary}}>
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
    </View>
  );

  return (
    <View style={{backgroundColor: colors.background, flex: 1}}>
      <View
        style={{
          alignItems: 'center',
          flexDirection: 'row',
          gap: 4,
          paddingHorizontal: 8,
          paddingTop: 8,
        }}>
        <TouchableOpacity onPress={navigation.goBack} style={{padding: 10}}>
          <MaterialCommunityIcons
            name="arrow-left"
            size={26}
            color={colors.onBackground}
          />
        </TouchableOpacity>
        <AppText
          role="titleLargeEmphasized"
          style={{color: colors.onBackground, flex: 1}}>
          বন্ধুরা
        </AppText>
        {(data?.friends.length ?? 0) > 0 ? (
          <View
            style={{
              alignItems: 'center',
              backgroundColor: colors.surfaceContainerHigh,
              borderRadius: 16,
              flexDirection: 'row',
              gap: 4,
              marginRight: 8,
              paddingHorizontal: 10,
              paddingVertical: 5,
            }}>
            <MaterialCommunityIcons name="account-group" size={14} color={colors.onSurfaceVariant} />
            <AppText style={{color: colors.onSurfaceVariant, fontSize: 12, fontWeight: '600'}}>
              {data!.friends.length}
            </AppText>
          </View>
        ) : null}
      </View>
      <View
        style={{
          flexDirection: 'row',
          gap: 8,
          paddingHorizontal: 16,
          paddingVertical: 10,
        }}>
        {(['friends', 'chats', 'received'] as Tab[]).map(t => (
          <TouchableOpacity
            key={t}
            onPress={() => setTab(t)}
            style={{
              backgroundColor: tab === t ? colors.primary : colors.surfaceContainerHigh,
              borderRadius: 20,
              paddingHorizontal: 16,
              paddingVertical: 8,
            }}>
            <AppText
              role="labelLargeEmphasized"
              style={{color: tab === t ? colors.onPrimary : colors.onSurfaceVariant}}>
              {t === 'friends'
                ? 'বন্ধু / সার্চ'
                : t === 'chats'
                  ? 'চ্যাট'
                  : 'শেয়ারড'}
              {t === 'chats' && totalUnreadChats > 0 ? ` ${totalUnreadChats}` : ''}
              {t === 'received' && (data?.unread ?? 0) > 0
                ? ` (${data!.unread})`
                : ''}
            </AppText>
          </TouchableOpacity>
        ))}
      </View>
      {/* ScrollView is essential here: long friend/chat/share lists must
          scroll, and RefreshControl only works as a ScrollView prop. */}
      <ScrollView
        style={{
          flex: 1,
          backgroundColor: colors.surfaceContainerLowest,
        }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }>
        {tab === 'friends'
          ? renderFriendsTab()
          : tab === 'chats'
            ? renderChatsTab()
            : renderReceivedTab()}
      </ScrollView>
    </View>
  );
}
