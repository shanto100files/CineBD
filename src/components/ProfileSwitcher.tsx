import React, {useCallback} from 'react';
import {Modal, Pressable, ScrollView, StyleSheet, ToastAndroid, View} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import AppText from './ui/Text';
import {useM3Colors} from '../theme/M3PaletteContext';
import useProfileStore, {UserProfile} from '../lib/zustand/profileStore';
import {useAuthStore} from '../lib/zustand/authStore';
import {profileSwitchNeedsLock} from '../lib/adultLock';
import {settingsStorage} from '../lib/storage';
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

  // Reactive mirror of canCustomizeProfiles() (getState alone would not
  // re-render the modal on login/logout). Guests take the login branch.
  const canCustomize = !!user?.is_admin || isPremium;

  const goEdit = useCallback(
    (params: {profileId?: string; manage?: boolean}) => {
      onClose();
      // Lazy require: App.tsx -> Hero -> this file (safe at call time).
      require('../App').openProfileEdit(params);
    },
    [onClose],
  );

  const goLogin = useCallback(() => {
    onClose();
    require('../App').openLoginScreen();
  }, [onClose]);

  const onSelect = useCallback(
    (id: string | null) => {
      // Child-proofing: switching to a profile that can show adult content
      // from one that cannot (e.g. family -> 18+) requires the 18+ lock.
      // The switch is deferred into AdultLock's success handler through the
      // switchProfile param, so a cancelled unlock never changes profiles.
      try {
        const state = useProfileStore.getState();
        const target = id
          ? state.profiles.find(p => p.id === id) || null
          : null;
        if (
          profileSwitchNeedsLock(
            target,
            state.activeProfile(),
            settingsStorage.isAdultEnabled(),
          )
        ) {
          onClose();
          require('../App').openAdultLock({
            mode: 'unlock',
            switchProfile: id,
          });
          return;
        }
      } catch {}
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
      onLongPress={isLoggedIn ? onLongPress : undefined}
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
      {active && (
        <View
          style={{
            marginTop: 4,
            backgroundColor: colors.primary,
            borderRadius: 999,
            paddingHorizontal: 9,
            paddingVertical: 2,
          }}>
          <AppText style={{color: '#FFF', fontSize: 10, fontWeight: '700'}}>সক্রিয়</AppText>
        </View>
      )}
      {canCustomize && (
        <Pressable
          style={st.editBadge}
          hitSlop={8}
          onPress={() => goEdit({profileId: p.id})}
          accessibilityLabel="প্রোফাইল সম্পাদনा">
          <MaterialCommunityIcons name="pencil" size={11} color="#FFFFFF" />
        </Pressable>
      )}
      <AppText style={[st.avatarName, active && {color: colors.primary, fontWeight: '700'}]} numberOfLines={1}>
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
      <Pressable
        style={[st.backdrop, {paddingTop: insets.top + 20, paddingBottom: insets.bottom + 24}]}
        onPress={onClose}>
        <Pressable style={[st.sheet, {backgroundColor: colors.surfaceContainerLow}]} onPress={() => {}}>
          <ScrollView
            style={{flexShrink: 1}}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{paddingBottom: 4}}>
          <AppText role="headlineMediumEmphasized" style={st.title}>
            কে দেখছে?
          </AppText>

          {!isLoggedIn ? (
            <>
              <View style={{alignItems: 'center', paddingHorizontal: 4}}>
                <MaterialCommunityIcons
                  name="account-lock-outline"
                  size={46}
                  color={colors.onSurfaceVariant}
                />
                <AppText
                  style={{marginTop: 10, color: colors.onSurface, fontWeight: '600', textAlign: 'center'}}>
                  প্রোফাইল ব্যবহার করতে লগইন করুন
                </AppText>
                <AppText style={st.guestBody}>
                  প্রোফাইলগুলো আপনার অ্যাকাউন্ট (user ID) এ সংরক্ষিত হয় — লগইন করলে যেকোনো
                  ডিভাইসেই সেগুলো পাবেন।
                </AppText>
                {profiles.length > 0 && (
                  <AppText style={st.guestNote}>
                    আপনার পুরনো প্রোফাইল লগইন করলে অ্যাকাউন্টে যুক্ত হবে।
                  </AppText>
                )}
                <Pressable style={st.loginBtn} onPress={goLogin}>
                  <MaterialCommunityIcons name="login" size={20} color={colors.primary} />
                  <AppText style={{color: colors.primary, fontWeight: '700'}}>লগইন করুন</AppText>
                </Pressable>
              </View>

              {presets.length > 0 && (
                <>
                  <AppText role="titleSmallEmphasized" style={{marginTop: 18, color: colors.onSurfaceVariant}}>
                    প্রিসেট প্রোফাইল
                  </AppText>
                  <View style={st.grid}>
                    {presets.map(p => (
                      <Pressable key={p.id} style={st.avatarWrap} onPress={goLogin}>
                        <View style={[st.avatar, {backgroundColor: p.color, opacity: 0.85}]}>
                          <MaterialCommunityIcons name={(p.avatar as any) || 'shape'} size={38} color="#FFF" />
                        </View>
                        <AppText style={st.avatarName} numberOfLines={1}>
                          {p.name}
                        </AppText>
                      </Pressable>
                    ))}
                  </View>
                </>
              )}
            </>
          ) : (
            <>
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
                    <AppText style={[st.avatarName, activeId === null && {color: colors.primary, fontWeight: '700'}]}>
                      ডিফল্ট
                    </AppText>
                    {activeId === null && (
                      <View
                        style={{
                          marginTop: 4,
                          backgroundColor: colors.primary,
                          borderRadius: 999,
                          paddingHorizontal: 9,
                          paddingVertical: 2,
                        }}>
                        <AppText style={{color: '#FFF', fontSize: 10, fontWeight: '700'}}>সক্রিয়</AppText>
                      </View>
                    )}
                  </Pressable>
                )}
                {profiles.map(p => (
                  <AvatarCircle
                    key={p.id}
                    p={p}
                    active={p.id === activeId}
                    onPress={() => onSelect(p.id)}
                    onLongPress={() => goEdit({profileId: p.id})}
                  />
                ))}
                {canCustomize && (
                  <Pressable style={st.avatarWrap} onPress={() => goEdit({})}>
                    <View style={[st.avatar, {backgroundColor: colors.surfaceContainerHighest}]}>
                      <MaterialCommunityIcons name="plus" size={40} color={colors.onSurfaceVariant} />
                    </View>
                    <AppText style={st.avatarName}>নতুন</AppText>
                  </Pressable>
                )}
              </View>

              {presets.length > 0 && (
                <>
                  <AppText role="titleSmallEmphasized" style={{marginTop: 18, color: colors.onSurfaceVariant}}>
                    প্রিসেট প্রোফাইল
                  </AppText>
                  <View style={st.grid}>
                    {presets.map(p => {
                      const existingLocal = profiles.find(lp => lp.presetId === p.id || lp.name === p.name);
                      return (
                      <Pressable
                        key={p.id}
                        style={[st.avatarWrap, existingLocal && {opacity: 0.55}]}
                        onPress={() => {
                          if (existingLocal) {
                            // Preset already added: switch to it, don't duplicate.
                            ToastAndroid.show(
                              'প্রোফাইল আগে থেকেই আছে — সুইচ করা হয়েছে',
                              ToastAndroid.SHORT,
                            );
                            onSelect(existingLocal.id);
                            return;
                          }
                          const created = applyPreset(p.id);
                          if (!created) {
                            ToastAndroid.show('সর্বোচ্চ ৮টি প্রোফাইল করা যাবে', ToastAndroid.SHORT);
                            return;
                          }
                          ToastAndroid.show(
                            'প্রোফাইল যোগ হয়েছে: ' + created.name,
                            ToastAndroid.SHORT,
                          );
                          onSelect(created.id);
                        }}
                        onLongPress={
                          existingLocal
                            ? () => {
                                onClose();
                                require('../App').openProfileEdit({profileId: existingLocal.id});
                              }
                            : undefined
                        }>
                        <View style={[st.avatar, {backgroundColor: p.color, opacity: 0.85}]}>
                          <MaterialCommunityIcons name={(p.avatar as any) || 'shape' } size={38} color="#FFF" />
                          {existingLocal && (
                            <View style={st.addedBadge}>
                              <MaterialCommunityIcons name="check" size={12} color="#FFF" />
                            </View>
                          )}
                        </View>
                        <AppText style={st.avatarName} numberOfLines={1}>{p.name}</AppText>
                        {existingLocal && (
                          <AppText style={{fontSize: 10, color: colors.onSurfaceVariant}}>ট্যাপ = সুইচ</AppText>
                        )}
                      </Pressable>
                      );
                    })}
                  </View>
                </>
              )}

              <View style={st.footerRow}>
                <AppText style={st.accountNote}>
                  প্রোফাইল আপনার অ্যাকাউন্টে সংরক্ষিত হয় — নতুন ডিভাইসে লগইন করলেই পাবেন।
                </AppText>
                {canCustomize ? (
                  <Pressable style={st.footerBtn} onPress={() => goEdit({manage: true})}>
                    <MaterialCommunityIcons name="pencil" size={20} color={colors.primary} />
                    <AppText style={{color: colors.primary}}>প্রোফাইল ম্যানেজ করুন</AppText>
                  </Pressable>
                ) : (
                  <>
                    <Pressable
                      style={st.footerBtn}
                      onPress={() => {
                        const target = profiles.find(p => p.id === activeId) || profiles[0];
                        goEdit(target ? {profileId: target.id} : {});
                      }}>
                      <MaterialCommunityIcons name="pencil-off" size={20} color={colors.primary} />
                      <AppText style={{color: colors.primary}}>প্রোফাইল এডিট করুন</AppText>
                    </Pressable>
                    <AppText style={{color: colors.onSurfaceVariant, fontSize: 12, marginTop: 6}}>
                      নাম/অ্যাভাটার বদলানো যাবে; প্রোভাইডার কাস্টমাইজে প্রিমিয়াম লাগবে
                    </AppText>
                  </>
                )}
              </View>
            </>
          )}
          </ScrollView>
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
  sheet: {width: '100%', maxWidth: 420, maxHeight: '86%', borderRadius: 24, padding: 22, paddingBottom: 16},
  title: {textAlign: 'center', marginBottom: 16, color: '#FFF'},
  grid: {flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 14},
  avatarWrap: {alignItems: 'center', width: 74, minHeight: 96},
  avatar: {width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', overflow: 'hidden'},
  avatarName: {marginTop: 6, fontSize: 12, color: '#DDD', maxWidth: 72},
  familyBadge: {position: 'absolute', top: 46, right: 8, backgroundColor: '#2E7D32', borderRadius: 8, padding: 2},
  editBadge: {position: 'absolute', top: -3, right: -3, backgroundColor: '#3A3A3C', borderRadius: 11, padding: 4, borderWidth: 2, borderColor: '#1C1C1E'},
  addedBadge: {position: 'absolute', top: -2, right: -2, backgroundColor: '#2E7D32', borderRadius: 10, padding: 2, borderWidth: 2, borderColor: '#1C1C1E'},
  guestBody: {marginTop: 8, fontSize: 13, color: '#BBB', textAlign: 'center', lineHeight: 19},
  guestNote: {marginTop: 8, fontSize: 12, color: '#8BC34A', textAlign: 'center'},
  loginBtn: {flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, paddingHorizontal: 26, paddingVertical: 11, borderRadius: 24, borderWidth: 1.5, borderColor: 'rgba(120,140,255,0.6)'},
  accountNote: {fontSize: 11, color: '#9E9E9E', textAlign: 'center', marginBottom: 4, paddingHorizontal: 8},
  footerRow: {marginTop: 16, alignItems: 'center'},
  footerBtn: {flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8},
});
