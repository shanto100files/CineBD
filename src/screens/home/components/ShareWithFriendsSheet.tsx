import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {CommonActions, useNavigation} from '@react-navigation/native';
import React, {useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  ToastAndroid,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import FriendAvatar from '../../../components/friends/FriendAvatar';
import AppText from '../../../components/ui/Text';
import {friendsService, FriendUser} from '../../../lib/services/friendsService';
import {useM3Colors} from '../../../theme/M3PaletteContext';

interface ShareWithFriendsSheetProps {
  visible: boolean;
  onClose: () => void;
  content: {link: string; provider: string; title: string; poster: string} | null;
}

// Pick black/white text for a colored button background so the Send button
// stays readable no matter which accent seed the user has chosen.
const readableOn = (hex: string, fallback: string): string => {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(hex || '');
  if (!match) return fallback;
  const value = parseInt(match[1], 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 150 ? '#101012' : '#FFFFFF';
};

const ShareWithFriendsSheet = ({
  visible,
  onClose,
  content,
}: ShareWithFriendsSheetProps) => {
  const colors = useM3Colors();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [friends, setFriends] = useState<FriendUser[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [filter, setFilter] = useState('');

  const visibleFriends = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return friends;
    return friends.filter(f => f.username.toLowerCase().includes(q));
  }, [friends, filter]);

  const allVisibleSelected =
    visibleFriends.length > 0 &&
    visibleFriends.every(f => selected.includes(f.id));

  useEffect(() => {
    if (!visible) return;
    setSelected([]);
    setFilter('');
    setLoading(true);
    friendsService
      .list()
      .then(d => setFriends(d.friends))
      .catch(() => ToastAndroid.show('বন্ধু লোড করা যায়নি', ToastAndroid.SHORT))
      .finally(() => setLoading(false));
  }, [visible]);

  const toggle = (id: number) => {
    setSelected(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
    );
  };

  const send = async () => {
    if (!content || selected.length === 0 || sending) return;
    setSending(true);
    try {
      const r = await friendsService.share(selected, content);
      if (r.sent > 0) {
        ToastAndroid.show(`${r.sent} জনকে শেয়ার করা হয়েছে`, ToastAndroid.SHORT);
      } else if (r.duplicates > 0) {
        ToastAndroid.show('ইতিমধ্যে শেয়ার করা হয়েছে', ToastAndroid.SHORT);
      } else {
        ToastAndroid.show('শেয়ার করা যায়নি', ToastAndroid.SHORT);
      }
      onClose();
    } catch (e: any) {
      ToastAndroid.show(e.response?.data?.error || 'শেয়ার ব্যর্থ', ToastAndroid.SHORT);
    } finally {
      setSending(false);
    }
  };

  const goAddFriends = () => {
    onClose();
    navigation.dispatch(
      CommonActions.navigate('TabStack', {
        screen: 'SettingsStack',
        params: {screen: 'Friends'},
      }),
    );
  };

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{flex: 1}}>
        <Pressable
          onPress={onClose}
          style={{backgroundColor: 'rgba(0,0,0,0.55)', flex: 1, justifyContent: 'flex-end'}}>
          <Pressable
            onPress={e => e.stopPropagation()}
            style={{
              backgroundColor: colors.surfaceContainerLow,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              maxHeight: '78%',
              paddingBottom: 12 + insets.bottom,
              paddingTop: 12,
            }}>
            <View style={{alignItems: 'center', marginBottom: 8}}>
              <View style={{backgroundColor: colors.outlineVariant, borderRadius: 2, height: 4, width: 40}} />
            </View>
            <View style={{alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'center', paddingHorizontal: 20}}>
              <MaterialCommunityIcons name="share-variant-outline" size={22} color={colors.primary} />
              <AppText role="titleMediumEmphasized" style={{color: colors.onBackground}} numberOfLines={1}>
                বন্ধুদের সাথে শেয়ার করুন
              </AppText>
            </View>

            {content?.poster || content?.title ? (
              <View
                style={{
                  alignItems: 'center',
                  backgroundColor: colors.surfaceContainerHigh,
                  borderRadius: 14,
                  flexDirection: 'row',
                  gap: 12,
                  marginHorizontal: 20,
                  marginTop: 12,
                  padding: 10,
                }}>
                {content.poster ? (
                  <Image
                    source={{uri: content.poster}}
                    style={{borderRadius: 10, height: 72, width: 52}}
                  />
                ) : null}
                <View style={{flex: 1}}>
                  <AppText
                    numberOfLines={2}
                    role="titleSmallEmphasized"
                    style={{color: colors.onBackground}}>
                    {content.title || ''}
                  </AppText>
                  {content.provider ? (
                    <AppText
                      role="labelSmallEmphasized"
                      style={{color: colors.onSurfaceVariant, marginTop: 4}}>
                      {content.provider}
                    </AppText>
                  ) : null}
                </View>
              </View>
            ) : null}

            {friends.length > 0 ? (
              <View
                style={{
                  alignItems: 'center',
                  flexDirection: 'row',
                  gap: 8,
                  marginTop: 12,
                  paddingHorizontal: 20,
                }}>
                <View
                  style={{
                    alignItems: 'center',
                    backgroundColor: colors.surfaceContainerHigh,
                    borderRadius: 20,
                    flexDirection: 'row',
                    flex: 1,
                    gap: 6,
                    paddingHorizontal: 12,
                  }}>
                  <MaterialCommunityIcons
                    name="account-search"
                    size={18}
                    color={colors.onSurfaceVariant}
                  />
                  <TextInput
                    value={filter}
                    onChangeText={setFilter}
                    placeholder="বন্ধু খুঁজুন..."
                    placeholderTextColor={colors.onSurfaceVariant}
                    autoCapitalize="none"
                    style={{color: colors.onBackground, flex: 1, fontSize: 14, paddingVertical: 8}}
                  />
                  {filter.length > 0 ? (
                    <Pressable onPress={() => setFilter('')} hitSlop={8}>
                      <MaterialCommunityIcons
                        name="close-circle"
                        size={18}
                        color={colors.onSurfaceVariant}
                      />
                    </Pressable>
                  ) : null}
                </View>
                {visibleFriends.length > 0 ? (
                  <Pressable
                    onPress={() =>
                      setSelected(
                        allVisibleSelected
                          ? selected.filter(id => !visibleFriends.some(f => f.id === id))
                          : Array.from(
                              new Set([...selected, ...visibleFriends.map(f => f.id)]),
                            ),
                      )
                    }
                    style={{
                      alignItems: 'center',
                      backgroundColor: colors.secondaryContainer,
                      borderRadius: 18,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                    }}>
                    <AppText
                      role="labelMediumEmphasized"
                      style={{color: colors.onSecondaryContainer}}>
                      {allVisibleSelected ? 'সব বাদ' : 'সব সিলেক্ট'}
                    </AppText>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            <View style={{marginTop: 12, paddingHorizontal: 20}}>
              {loading ? (
                <ActivityIndicator style={{paddingVertical: 28}} color={colors.primary} />
              ) : friends.length === 0 ? (
                <View style={{alignItems: 'center', paddingVertical: 20}}>
                  <MaterialCommunityIcons name="account-plus-outline" size={44} color={colors.onSurfaceVariant} />
                  <AppText role="bodyMedium" style={{color: colors.onSurfaceVariant, marginTop: 10, textAlign: 'center'}}>
                    এখনো কোনো বন্ধু নেই।
                  </AppText>
                  <Pressable
                    onPress={goAddFriends}
                    style={{
                      backgroundColor: colors.primary,
                      borderRadius: 20,
                      marginTop: 14,
                      paddingHorizontal: 18,
                      paddingVertical: 9,
                    }}>
                    <AppText role="labelLargeEmphasized" style={{color: colors.onPrimary}}>
                      বন্ধু যোগ করুন
                    </AppText>
                  </Pressable>
                </View>
              ) : (
                <ScrollView
                  contentContainerStyle={{paddingBottom: 4}}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={false}
                  style={{maxHeight: 320}}>
                  {visibleFriends.length === 0 ? (
                    <AppText
                      role="bodyMedium"
                      style={{
                        color: colors.onSurfaceVariant,
                        paddingVertical: 16,
                        textAlign: 'center',
                      }}>
                      "{filter}" নামে কোনো বন্ধু নেই
                    </AppText>
                  ) : null}
                  {visibleFriends.map(f => {
                    const isSel = selected.includes(f.id);
                    return (
                      <Pressable
                        key={f.id}
                        onPress={() => toggle(f.id)}
                        style={({pressed}) => ({
                          alignItems: 'center',
                          backgroundColor: pressed
                            ? colors.surfaceContainerHigh
                            : isSel
                              ? colors.primaryContainer
                              : 'transparent',
                          borderColor: isSel ? colors.primary + '66' : 'transparent',
                          borderRadius: 14,
                          borderWidth: 1,
                          flexDirection: 'row',
                          gap: 12,
                          marginBottom: 4,
                          paddingHorizontal: 8,
                          paddingVertical: 9,
                        })}>
                        <FriendAvatar name={f.username} uri={f.avatar_url} size={38} />
                        <AppText role="bodyLargeEmphasized" style={{color: colors.onBackground, flex: 1}} numberOfLines={1}>
                          {f.username}
                        </AppText>
                        <View
                          style={{
                            alignItems: 'center',
                            borderColor: isSel ? colors.primary : colors.outline,
                            borderRadius: 11,
                            borderWidth: 2,
                            height: 22,
                            justifyContent: 'center',
                            width: 22,
                            backgroundColor: isSel ? colors.primary : 'transparent',
                          }}>
                          {isSel ? (
                            <MaterialCommunityIcons name="check" size={14} color={colors.onPrimary} />
                          ) : null}
                        </View>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}
            </View>

            <View style={{flexDirection: 'row', gap: 10, justifyContent: 'flex-end', paddingHorizontal: 20, paddingTop: 14}}>
              <Pressable
                onPress={onClose}
                style={({pressed}) => ({
                  borderRadius: 22,
                  paddingHorizontal: 20,
                  paddingVertical: 10,
                  backgroundColor: pressed ? colors.surfaceContainerHigh : 'transparent',
                })}>
                <AppText role="labelLargeEmphasized" style={{color: colors.onSurfaceVariant}}>বাতিল</AppText>
              </Pressable>
              <Pressable
                disabled={selected.length === 0 || sending}
                onPress={send}
                style={({pressed}) => {
                  const active = selected.length > 0 && !sending;
                  return {
                    alignItems: 'center',
                    backgroundColor: !active
                      ? colors.surfaceContainerHigh
                      : pressed
                        ? colors.primary
                        : colors.primary,
                    borderRadius: 22,
                    elevation: active ? 2 : 0,
                    flexDirection: 'row',
                    gap: 6,
                    minWidth: 110,
                    justifyContent: 'center',
                    paddingHorizontal: 18,
                    paddingVertical: 10,
                    shadowColor: colors.primary,
                    shadowOffset: {width: 0, height: 2},
                    shadowOpacity: active ? 0.45 : 0,
                    shadowRadius: 4,
                  };
                }}>
                {sending ? (
                  <ActivityIndicator size="small" color={readableOn(colors.primary, colors.onPrimary)} />
                ) : (
                  <>
                    <MaterialCommunityIcons
                      name="send"
                      size={16}
                      color={selected.length === 0 ? colors.onSurfaceVariant : readableOn(colors.primary, colors.onPrimary)}
                    />
                    <AppText
                      role="labelLargeEmphasized"
                      style={{
                        color:
                          selected.length === 0
                            ? colors.onSurfaceVariant
                            : readableOn(colors.primary, colors.onPrimary),
                      }}>
                      পাঠান{selected.length > 0 ? ` (${selected.length})` : ''}
                    </AppText>
                  </>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
};

export default ShareWithFriendsSheet;
