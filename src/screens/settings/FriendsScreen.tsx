import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, {useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  TextInput,
  ToastAndroid,
  TouchableOpacity,
  View,
} from 'react-native';
import {CommonActions} from '@react-navigation/native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {SettingsStackParamList} from '../../App';
import AppText from '../../components/ui/Text';
import {useM3Colors} from '../../theme/M3PaletteContext';
import {useAuthStore} from '../../lib/zustand/authStore';
import {
  friendsService,
  FriendsData,
  SearchUser,
  SharedItem,
} from '../../lib/services/friendsService';

type Tab = 'friends' | 'received';

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
  const [busyId, setBusyId] = useState(0);

  const load = useCallback(async () => {
    try {
      const [d, f] = await Promise.all([friendsService.list(), friendsService.feed()]);
      setData(d);
      setFeed(f);
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

  useEffect(() => {
    if (token) load();
    else setLoading(false);
  }, [token, load]);

  useEffect(() => {
    if (search.trim().length < 2) {
      setResults(null);
      return;
    }
    setSearching(true);
    const t = setTimeout(() => {
      friendsService
        .search(search.trim())
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
      ToastAndroid.show(`${u.username} কে রিকোয়েস্ট পাঠানো হয়েছে`, ToastAndroid.SHORT);
      setResults(
        (results || []).map(r =>
          r.id === u.id ? {...r, relation: 'request_sent' as const} : r,
        ),
      );
    } catch (e: any) {
      ToastAndroid.show(e.response?.data?.error || 'ব্যর্থ হয়েছে', ToastAndroid.SHORT);
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

  const unfriend = (id: number, name: string) => {
    setBusyId(id);
    friendsService
      .unfriend(id)
      .then(load)
      .catch(() => ToastAndroid.show('ব্যর্থ হয়েছে', ToastAndroid.SHORT))
      .finally(() => setBusyId(0));
  };

  const openShared = (item: SharedItem) => {
    // Info lives in HomeStack — hop tabs via the root dispatcher.
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
      <View style={{alignItems: 'center', backgroundColor: colors.background, flex: 1, justifyContent: 'center', padding: 32}}>
        <MaterialCommunityIcons name="account-group-outline" size={64} color={colors.onSurfaceVariant} />
        <AppText role="titleMediumEmphasized" style={{color: colors.onBackground, marginTop: 16, textAlign: 'center'}}>
          বন্ধু যোগ করতে লগইন করুন
        </AppText>
        <AppText role="bodyMedium" style={{color: colors.onSurfaceVariant, marginTop: 8, textAlign: 'center'}}>
          অ্যাকাউন্ট থাকলে বন্ধুদের সাথে মুভি/সিরিজ শেয়ার করতে পারবেন
        </AppText>
        <TouchableOpacity
          onPress={() => navigation.navigate('Login')}
          style={{backgroundColor: colors.primary, borderRadius: 24, marginTop: 24, paddingHorizontal: 32, paddingVertical: 12}}>
          <AppText role="labelLargeEmphasized" style={{color: colors.onPrimary}}>Login</AppText>
        </TouchableOpacity>
      </View>
    );
  }

  const renderSearchResults = () => {
    if (search.trim().length < 2) return null;
    return (
      <View style={{paddingHorizontal: 16, paddingTop: 8}}>
        <AppText role="labelLargeEmphasized" style={{color: colors.onSurfaceVariant}}>
          {searching ? 'খোঁজা হচ্ছে...' : `ফলাফল (${results?.length ?? 0})`}
        </AppText>
        {(results || []).map(u => (
          <View key={u.id} style={{alignItems: 'center', flexDirection: 'row', gap: 12, paddingVertical: 8}}>
            <Avatar name={u.username} />
            <AppText role="bodyLargeEmphasized" style={{color: colors.onBackground, flex: 1}} numberOfLines={1}>
              {u.username}
            </AppText>
            {u.relation === 'none' ? (
              <TouchableOpacity
                disabled={busyId === u.id}
                onPress={() => sendRequest(u)}
                style={{backgroundColor: colors.primary, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 7}}>
                {busyId === u.id ? (
                  <ActivityIndicator size="small" color={colors.onPrimary} />
                ) : (
                  <AppText role="labelMediumEmphasized" style={{color: colors.onPrimary}}>Add</AppText>
                )}
              </TouchableOpacity>
            ) : (
              <AppText role="labelMediumEmphasized" style={{color: colors.onSurfaceVariant, paddingHorizontal: 8}}>
                {u.relation === 'friends' ? 'বন্ধু' : u.relation === 'request_sent' ? 'পাঠানো হয়েছে' : 'রিকোয়েস্ট এসেছে'}
              </AppText>
            )}
          </View>
        ))}
        {results && results.length === 0 && !searching ? (
          <AppText role="bodyMedium" style={{color: colors.onSurfaceVariant, paddingVertical: 12}}>
            কাউকে পাওয়া যায়নি
          </AppText>
        ) : null}
        <View style={{height: 1, backgroundColor: colors.outlineVariant, marginVertical: 10}} />
      </View>
    );
  };

  const renderFriendsTab = () => (
    <>
      {renderSearchResults()}
      {(data?.incoming.length ?? 0) > 0 ? (
        <View style={{paddingHorizontal: 16}}>
          <AppText role="labelLargeEmphasized" style={{color: colors.primary, marginTop: 4}}>
            রিকোয়েস্ট ({data!.incoming.length})
          </AppText>
          {data!.incoming.map(r => (
            <View key={r.id} style={{alignItems: 'center', flexDirection: 'row', gap: 12, paddingVertical: 8}}>
              <Avatar name={r.username} />
              <AppText role="bodyLargeEmphasized" style={{color: colors.onBackground, flex: 1}} numberOfLines={1}>
                {r.username}
              </AppText>
              <TouchableOpacity
                disabled={busyId === r.id}
                onPress={() => respond(r.id, true)}
                style={{backgroundColor: colors.primary, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 7}}>
                {busyId === r.id ? <ActivityIndicator size="small" color={colors.onPrimary} /> : <AppText role="labelMediumEmphasized" style={{color: colors.onPrimary}}>Accept</AppText>}
              </TouchableOpacity>
              <TouchableOpacity
                disabled={busyId === r.id}
                onPress={() => respond(r.id, false)}
                style={{backgroundColor: colors.surfaceContainerHigh, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 7}}>
                <AppText role="labelMediumEmphasized" style={{color: colors.onSurfaceVariant}}>Na</AppText>
              </TouchableOpacity>
            </View>
          ))}
          <View style={{height: 1, backgroundColor: colors.outlineVariant, marginVertical: 10}} />
        </View>
      ) : null}
      <View style={{paddingHorizontal: 16, paddingBottom: 24}}>
        <AppText role="labelLargeEmphasized" style={{color: colors.onSurfaceVariant}}>
          বন্ধুরা ({data?.friends.length ?? 0})
        </AppText>
        {(data?.friends.length ?? 0) === 0 ? (
          <AppText role="bodyMedium" style={{color: colors.onSurfaceVariant, paddingVertical: 16}}>
            এখনো কোনো বন্ধু নেই। উপরে সার্চ করে বন্ধু যোগ করুন।
          </AppText>
        ) : null}
        {(data?.friends || []).map(f => (
          <View key={f.id} style={{alignItems: 'center', flexDirection: 'row', gap: 12, paddingVertical: 8}}>
            <Avatar name={f.username} />
            <View style={{flex: 1}}>
              <AppText role="bodyLargeEmphasized" style={{color: colors.onBackground}} numberOfLines={1}>
                {f.username}
              </AppText>
            </View>
            <TouchableOpacity
              disabled={busyId === f.id}
              onPress={() => unfriend(f.id, f.username)}
              style={{backgroundColor: colors.errorContainer, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 7}}>
              <AppText role="labelMediumEmphasized" style={{color: colors.error}}>Remove</AppText>
            </TouchableOpacity>
          </View>
        ))}
        {(data?.outgoing.length ?? 0) > 0 ? (
          <>
            <AppText role="labelLargeEmphasized" style={{color: colors.onSurfaceVariant, marginTop: 16}}>
              অপেক্ষমাণ রিকোয়েস্ট
            </AppText>
            {data!.outgoing.map(o => (
              <View key={o.id} style={{alignItems: 'center', flexDirection: 'row', gap: 12, paddingVertical: 8}}>
                <Avatar name={o.username} />
                <AppText role="bodyLargeEmphasized" style={{color: colors.onBackground, flex: 1}} numberOfLines={1}>
                  {o.username}
                </AppText>
                <AppText role="labelMediumEmphasized" style={{color: colors.onSurfaceVariant}}>পাঠানো হয়েছে</AppText>
              </View>
            ))}
          </>
        ) : null}
      </View>
    </>
  );

  const renderReceivedTab = () => (
    <View style={{paddingHorizontal: 16, paddingBottom: 24}}>
      {feed.length === 0 ? (
        <View style={{alignItems: 'center', marginTop: 60}}>
          <MaterialCommunityIcons name="movie-open-outline" size={56} color={colors.onSurfaceVariant} />
          <AppText role="bodyMedium" style={{color: colors.onSurfaceVariant, marginTop: 12, textAlign: 'center'}}>
            বন্ধুরা এখনো কিছু শেয়ার করেনি
          </AppText>
        </View>
      ) : null}
      {feed.map(item => (
        <TouchableOpacity
          key={item.id}
          onPress={() => openShared(item)}
          style={{backgroundColor: colors.surfaceContainerLow, borderRadius: 14, flexDirection: 'row', gap: 12, marginBottom: 10, padding: 10}}>
          <View style={{backgroundColor: colors.surfaceContainerHigh, borderRadius: 10, height: 84, width: 60, overflow: 'hidden'}}>
            {item.poster ? (
              <Image source={{uri: item.poster}} style={{height: '100%', resizeMode: 'cover', width: '100%'}} />
            ) : null}
          </View>
          <View style={{flex: 1, justifyContent: 'center'}}>
            <AppText role="titleMediumEmphasized" style={{color: colors.onBackground}} numberOfLines={2}>
              {item.title || 'Unknown'}
            </AppText>
            <AppText role="bodySmall" style={{color: colors.onSurfaceVariant, marginTop: 4}}>
              {item.sender} • {timeAgo(item.created_at)}
            </AppText>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={24} color={colors.onSurfaceVariant} style={{alignSelf: 'center'}} />
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <View style={{backgroundColor: colors.background, flex: 1}}>
      <View style={{alignItems: 'center', flexDirection: 'row', gap: 4, paddingHorizontal: 8, paddingTop: 8}}>
        <TouchableOpacity onPress={navigation.goBack} style={{padding: 10}}>
          <MaterialCommunityIcons name="arrow-left" size={26} color={colors.onBackground} />
        </TouchableOpacity>
        <AppText role="titleLargeEmphasized" style={{color: colors.onBackground, flex: 1}}>
          বন্ধুরা
        </AppText>
      </View>
      <View style={{flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10}}>
        {(['friends', 'received'] as Tab[]).map(t => (
          <TouchableOpacity
            key={t}
            onPress={() => setTab(t)}
            style={{
              backgroundColor: tab === t ? colors.primary : colors.surfaceContainerHigh,
              borderRadius: 20,
              paddingHorizontal: 16,
              paddingVertical: 8,
            }}>
            <AppText role="labelLargeEmphasized" style={{color: tab === t ? colors.onPrimary : colors.onSurfaceVariant}}>
              {t === 'friends' ? 'বন্ধু / সার্চ' : 'শেয়ারড'}
              {t === 'received' && (data?.unread ?? 0) > 0 ? ` (${data!.unread})` : ''}
            </AppText>
          </TouchableOpacity>
        ))}
      </View>
      <FlatList
        data={[0]}
        keyExtractor={() => 'list'}
        renderItem={() => null}
        ListHeaderComponent={tab === 'friends' ? renderFriendsTab() : renderReceivedTab()}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      />
    </View>
  );
}

