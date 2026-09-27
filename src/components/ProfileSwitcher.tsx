import React, {useCallback} from 'react';
import {Modal, Pressable, StyleSheet, ToastAndroid, View} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import AppText from './ui/Text';
import {useM3Colors} from '../theme/M3PaletteContext';
import useProfileStore, {UserProfile} from '../lib/zustand/profileStore';
import {useAuthStore} from '../lib/zustand/authStore';
import {useNavigation} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

/** YouTube 'Who's watching?'-style profile grid inside a full-screen modal. */
export const ProfileSwitcherModal = ({visible, onClose}: {visible: boolean; onClose: () => void}) => {
  const colors = useM3Colors();
  const insets = useSafeAreaInsets();
  const profiles = useProfileStore(s => s.profiles);
  const presets = useProfileStore(s => s.presets);
  const activeId = useProfileStore(s => s.activeId);
  const setActive = useProfileStore(s => s.setActive);
  const applyPreset = useProfileStore(s => s.applyPreset);
  const user = useAuthStore(s => s.user);
  const isPremium = useAuthStore(s => s.isPremium);
  const isLoggedIn = useAuthStore(s => s.isLoggedIn);
  const navigation = useNavigation() as any;

  // Reactive mirror of canCustomizeProfiles() (getState alone would not
  // re-render the modal on login/logout).
  const canCustomize = !!user?.is_admin || isPremium || !isLoggedIn;

  const goEdit = useCallback(
    (profileId?: string) => {
      onClose();
      navigation.navigate('ProfileEdit', profileId ? {profileId} : {});
    },
    [onClose, navigation],
  );

  const onSelect = useCallback(
    (id: string | null) => {
      // setActive also reloads the scoped watchlist/history and re-gates
      // the installed provider list for the new profile.
      setActive(id);
      onClose();
    },
    [setActive, onClose],
  );

  const AvatarCircle = ({p, active, onPress, onLongPress}: {p: UserProfile; active: boolean; onPress: () => void; onLongPress?: () => void}) => (
    <Pressable
      onPress={onPress}
      onLongPress={canCustomize ? onLongPress : undefined}
      style={st.avatarWrap}>
      <View
        style={[
          st.avatar,
          {backgroundColor: p.color, borderColor: active ? colors.primary : 'transparent', borderWidth: active ? 3 : 0},
        ]}>
        <MaterialCommunityIcons
          name={(p.avatar as any) || 'account'}
          size={38}
          color="#FFFFFF"
        />
      </View>
      <AppText style={[st.avatarName, active && {color: colors.primary}]} numberOfLines={1}>
        {p.name}
      </AppText>
      {p.kind === 'family' && (
        <View style={st.familyBadge}>
          <MaterialCommunityIcons name="shield-home-outline" size={12} color="#FFFFFF" />
        </View>
      )}
    </Pressable>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={[st.backdrop, {paddingTop: insets.top + 20}]} onPress={onClose}>
        <Pressable style={[st.sheet, {backgroundColor: colors.surfaceContainerLow}]} onPress={() => {}}>
          <AppText role="headlineMediumEmphasized" style={st.title}>
            কে দেখছে?
          </AppText>

          <View style={st.grid}>
            {profiles.length > 0 && (
              <Pressable style={st.avatarWrap} onPress={() => onSelect(null)}>
                <View
                  style={[
                    st.avatar,
                    {
                      backgroundColor: colors.surfaceContainerHighest,
                      borderColor: activeId === null ? colors.primary : 'transparent',
                      borderWidth: activeId === null ? 3 : 0,
                    },
                  ]}>
                  <MaterialCommunityIcons
                    name="home-variant-outline"
                    size={38}
                    color={colors.onSurfaceVariant}
                  />
                </View>
                <AppText style={[st.avatarName, activeId === null && {color: colors.primary}]}>
                  ডিফল্ট
                </AppText>
              </Pressable>
            )}
            {profiles.map(p => (
              <AvatarCircle
                key={p.id}
                p={p}
                active={p.id === activeId}
                onPress={() => onSelect(p.id)}
                onLongPress={() => goEdit(p.id)}
              />
            ))}
            {canCustomize && (
              <Pressable style={st.avatarWrap} onPress={() => goEdit()}>
                <View style={[st.avatar, {backgroundColor: colors.surfaceContainerHighest}]}>
                  <MaterialCommunityIcons name="plus" size={40} color={colors.onSurfaceVariant} />
                </View>
                <AppText style={st.avatarName}>নতুন</AppText>
              </Pressable>
            )}
          </View>

          {presets.length > 0 && canCustomize && (
            <>
              <AppText role="titleSmallEmphasized" style={{marginTop: 18, color: colors.onSurfaceVariant}}>
                অ্যাডমিন প্রিসেট
              </AppText>
              <View style={st.grid}>
                {presets.map(p => (
                  <Pressable
                    key={p.id}
                    style={st.avatarWrap}
                    onPress={() => {
                      const created = applyPreset(p.id);
                      if (!created) {
                        ToastAndroid.show('সর্বোচ্চ ৮টি প্রোফাইল করা যাবে', ToastAndroid.SHORT);
                        return;
                      }
                      onSelect(created.id);
                    }}>
                    <View style={[st.avatar, {backgroundColor: p.color, opacity: 0.85}]}>
                      <MaterialCommunityIcons name={(p.avatar as any) || 'shape' } size={38} color="#FFF" />
                    </View>
                    <AppText style={st.avatarName} numberOfLines={1}>{p.name}</AppText>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          <View style={st.footerRow}>
            {canCustomize ? (
              <Pressable style={st.footerBtn} onPress={() => goEdit()}>
                <MaterialCommunityIcons name="pencil" size={20} color={colors.primary} />
                <AppText style={{color: colors.primary}}>প্রোফাইল ম্যানেজ করুন</AppText>
              </Pressable>
            ) : (
              <AppText style={{color: colors.onSurfaceVariant, fontSize: 12}}>
                প্রোফাইল কাস্টমাইজ করতে প্রিমিয়াম লাগবে
              </AppText>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

/** Small round avatar button that sits on the hero (top-left). */
const ProfileAvatarChip = ({onPress}: {onPress: () => void}) => {
  const colors = useM3Colors();
  const profiles = useProfileStore(s => s.profiles);
  const activeId = useProfileStore(s => s.activeId);
  const active = profiles.find(p => p.id === activeId);
  return (
    <Pressable onPress={onPress} hitSlop={10} style={{marginRight: 14}}>
      <View
        style={{
          width: 42,
          height: 42,
          borderRadius: 21,
          backgroundColor: active?.color || colors.surfaceContainerHighest,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 2,
          borderColor: 'rgba(255,255,255,0.25)',
        }}>
        <MaterialCommunityIcons
          name={(active?.avatar as any) || 'account'}
          size={26}
          color={active ? '#FFF' : colors.onSurfaceVariant}
        />
      </View>
    </Pressable>
  );
};

export default ProfileAvatarChip;

const st = StyleSheet.create({
  backdrop: {flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24},
  sheet: {width: '100%', maxWidth: 420, borderRadius: 24, padding: 22, paddingBottom: 16},
  title: {textAlign: 'center', marginBottom: 16, color: '#FFF'},
  grid: {flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 14},
  avatarWrap: {alignItems: 'center', width: 74},
  avatar: {width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', overflow: 'hidden'},
  avatarName: {marginTop: 6, fontSize: 12, color: '#DDD', maxWidth: 72},
  familyBadge: {position: 'absolute', top: 46, right: 8, backgroundColor: '#2E7D32', borderRadius: 8, padding: 2},
  footerRow: {marginTop: 16, alignItems: 'center'},
  footerBtn: {flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8},
});
