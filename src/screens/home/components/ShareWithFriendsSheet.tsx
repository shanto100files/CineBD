import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, {useEffect, useMemo, useState} from 'react';
import {ActivityIndicator, Modal, Pressable, TextInput, ToastAndroid, View} from 'react-native';
import AppText from '../../../components/ui/Text';
import {useM3Colors} from '../../../theme/M3PaletteContext';
import {friendsService, FriendUser} from '../../../lib/services/friendsService';

interface ShareWithFriendsSheetProps {
  visible: boolean;
  onClose: () => void;
  content: {link: string; provider: string; title: string; poster: string} | null;
}

const ShareWithFriendsSheet = ({
  visible,
  onClose,
  content,
}: ShareWithFriendsSheetProps) => {
  const colors = useM3Colors();
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
        ToastAndroid.show(`${r.sent} জনকে শেয়ার করা হয়েছে 🎬`, ToastAndroid.SHORT);
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

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{backgroundColor: 'rgba(0,0,0,0.55)', flex: 1, justifyContent: 'flex-end'}}>
        <Pressable
          onPress={e => e.stopPropagation()}
          style={{
            backgroundColor: colors.surfaceContainerLow,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            maxHeight: '72%',
            paddingBottom: 24,
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
          {content?.title ? (
            <AppText role="bodySmall" style={{color: colors.onSurfaceVariant, marginTop: 4, textAlign: 'center'}} numberOfLines={1}>
              {content.title}
            </AppText>
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
                  এখনো কোনো বন্ধু নেই। Settings → বন্ধুরা থেকে বন্ধু যোগ করুন।
                </AppText>
              </View>
            ) : (
              <View style={{maxHeight: 320}}>
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
                        borderRadius: 14,
                        flexDirection: 'row',
                        gap: 12,
                        paddingHorizontal: 8,
                        paddingVertical: 9,
                      })}>
                      <View
                        style={{
                          alignItems: 'center',
                          backgroundColor: isSel ? colors.primary : colors.primaryContainer,
                          borderRadius: 19,
                          height: 38,
                          justifyContent: 'center',
                          width: 38,
                        }}>
                        <AppText role="titleSmallEmphasized" style={{color: isSel ? colors.onPrimary : colors.onPrimaryContainer}}>
                          {f.username.slice(0, 1).toUpperCase()}
                        </AppText>
                      </View>
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
              </View>
            )}
          </View>

          <View style={{flexDirection: 'row', gap: 10, justifyContent: 'flex-end', paddingHorizontal: 20, paddingTop: 14}}>
            <Pressable onPress={onClose} style={{borderRadius: 22, paddingHorizontal: 20, paddingVertical: 10}}>
              <AppText role="labelLargeEmphasized" style={{color: colors.onSurfaceVariant}}>Cancel</AppText>
            </Pressable>
            <Pressable
              disabled={selected.length === 0 || sending}
              onPress={send}
              style={({pressed}) => ({
                alignItems: 'center',
                backgroundColor:
                  selected.length === 0 || sending
                    ? colors.surfaceContainerHigh
                    : pressed
                      ? colors.primaryContainer
                      : colors.primary,
                borderRadius: 22,
                flexDirection: 'row',
                gap: 6,
                minWidth: 110,
                justifyContent: 'center',
                paddingHorizontal: 18,
                paddingVertical: 10,
              })}>
              {sending ? (
                <ActivityIndicator size="small" color={colors.onPrimary} />
              ) : (
                <>
                  <MaterialCommunityIcons name="send" size={16} color={selected.length === 0 ? colors.onSurfaceVariant : colors.onPrimary} />
                  <AppText
                    role="labelLargeEmphasized"
                    style={{color: selected.length === 0 ? colors.onSurfaceVariant : colors.onPrimary}}>
                    পাঠান{selected.length > 0 ? ` (${selected.length})` : ''}
                  </AppText>
                </>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

export default ShareWithFriendsSheet;
