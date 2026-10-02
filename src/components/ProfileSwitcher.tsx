import React, {useCallback} from 'react';
import {Modal, Pressable, ScrollView, StyleSheet, ToastAndroid, View} from 'react-native';
import TvFocusable from './ui/TvFocusable';
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
      //
      // FAIL CLOSED: the decision and the lock-screen open are outside the
      // fall-through — if the check itself errors, challenge (when a PIN
      // exists) instead of silently switching into a possibly-adult target.
      let needsLock = false;
      try {
        const state = useProfileStore.getState();
        const target = id
          ? state.profiles.find(p => p.id === id) || null
          : null;
        needsLock = profileSwitchNeedsLock(
          target,
          state.activeProfile(),
          settingsStorage.isAdultEnabled(),
        );
      } catch {
        try {
          needsLock = require('../lib/adultLock').isAdultPinSet();
        } catch {
          needsLock = false;
        }
      }
      if (needsLock) {
        onClose();
        try {
          require('../App').openAdultLock({
            mode: 'unlock',
            switchProfile: id,
          });
        } catch {}
        return; // never fall through into an unguarded switch
      }
      // setActive also reloads the scoped watchlist/history and re-gates
      // the installed provider list for the new profile.
      setActive(id);
      onClose();
    },
    [setActive, onClose],
  );

  const AvatarCircle = ({p, active, onPress, onLongPress}: {p: UserProfile; active: boolean; onPress: () => void; onLongPress?: () => void}) => (
    <TvFocusable
      onPress={onPress}
      onLongPress={isLoggedIn ? onLongPress : undefined}
      style={st.avatarWrap}>
      <View
        style={[
          st.avatar,
          {
            backgroundColor: p.color,
            // Hairline at rest instead of nothing: an unselected tile had no
            // edge against the sheet, so only the selected one looked real.
            borderColor: active ? colors.primary : colors.outlineVariant,
            borderWidth: active ? 3 : 1,
          },
        ]}>
        <MaterialCommunityIcons
          name={(p.avatar as any) || 'account'}
          size={38}
          color="#FFFFFF"
        />
      </View>
      {canCustomize && (
        <TvFocusable
          style={st.editBadge}
          hitSlop={8}
          onPress={() => goEdit({profileId: p.id})}
          accessibilityLabel="প্রোফাইল সম্পাদনा">
          <MaterialCommunityIcons name="pencil" size={11} color="#FFFFFF" />
        </TvFocusable>
      )}
      <AppText style={[st.avatarName, active && {color: colors.primary, fontWeight: '700'}]} numberOfLines={1}>
        {p.name}
      </AppText>
      {p.kind === 'family' && (
        <View style={st.familyBadge}>
          <MaterialCommunityIcons name="shield-home-outline" size={12} color="#FFFFFF" />
        </View>
      )}
    </TvFocusable>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={[st.backdrop, {paddingTop: insets.top + 20, paddingBottom: insets.bottom + 24}]}
        onPress={onClose}>
        <Pressable
          style={[
            st.sheet,
            {backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant},
          ]}
          onPress={() => {}}>
          {/* Grabber: makes the box read as a dismissible sheet instead of a
              raw card dropped on the scrim. */}
          <View style={[st.grabber, {backgroundColor: colors.outline}]} />
          <ScrollView
            style={{flexShrink: 1}}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{paddingBottom: 4}}>
          <AppText role="headlineSmallEmphasized" style={st.title}>
            কে দেখছে?
          </AppText>
          <AppText style={[st.subtitle, {color: colors.onSurfaceVariant}]}>
            প্রোফাইল বেছে নিন
          </AppText>
          <View style={[st.headerRule, {backgroundColor: colors.outlineVariant}]} />

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
                <TvFocusable
                  style={[st.loginBtn, {borderColor: colors.primary}]}
                  onPress={goLogin}
                  hasTVPreferredFocus>
                  <MaterialCommunityIcons name="login" size={20} color={colors.primary} />
                  <AppText style={{color: colors.primary, fontWeight: '700'}}>লগইন করুন</AppText>
                </TvFocusable>
              </View>

              {presets.length > 0 && (
                <>
                  {/* Centre-aligned with flanking rules: the section header
                      was flush-left while every item under it was centred,
                      so the two halves never lined up. */}
                  <View style={st.sectionRow}>
                    <View style={[st.sectionRule, {backgroundColor: colors.outlineVariant}]} />
                    <AppText style={[st.sectionTxt, {color: colors.onSurfaceVariant}]}>
                      প্রিসেট প্রোফাইল
                    </AppText>
                    <View style={[st.sectionRule, {backgroundColor: colors.outlineVariant}]} />
                  </View>
                  <View style={st.grid}>
                    {presets.map(p => (
                      <TvFocusable key={p.id} style={st.avatarWrap} onPress={goLogin}>
                        <View style={[st.avatar, {backgroundColor: p.color, opacity: 0.85, borderWidth: 1, borderColor: colors.outlineVariant}]}>
                          <MaterialCommunityIcons name={(p.avatar as any) || 'shape'} size={38} color="#FFF" />
                        </View>
                        <AppText style={st.avatarName} numberOfLines={1}>
                          {p.name}
                        </AppText>
                      </TvFocusable>
                    ))}
                  </View>
                </>
              )}
            </>
          ) : (
            <>
              <View style={st.grid}>
                {/* The "ডিফল্ট" aggregate tile was removed on request: default
                    pools the 18+ provider set together with the normal ones on
                    one surface, so it kept them side by side anyway. Pick a
                    real profile instead. */}
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
                  <TvFocusable style={st.avatarWrap} onPress={() => goEdit({})}>
                    <View style={[st.avatar, {backgroundColor: colors.surfaceContainerHighest, borderWidth: 1, borderColor: colors.outlineVariant}]}>
                      <MaterialCommunityIcons name="plus" size={40} color={colors.onSurfaceVariant} />
                    </View>
                    <AppText style={st.avatarName}>নতুন</AppText>
                  </TvFocusable>
                )}
              </View>

              {presets.length > 0 && (
                <>
                  {/* Centre-aligned with flanking rules: the section header
                      was flush-left while every item under it was centred,
                      so the two halves never lined up. */}
                  <View style={st.sectionRow}>
                    <View style={[st.sectionRule, {backgroundColor: colors.outlineVariant}]} />
                    <AppText style={[st.sectionTxt, {color: colors.onSurfaceVariant}]}>
                      প্রিসেট প্রোফাইল
                    </AppText>
                    <View style={[st.sectionRule, {backgroundColor: colors.outlineVariant}]} />
                  </View>
                  <View style={st.grid}>
                    {presets.map(p => {
                      const existingLocal = profiles.find(lp => lp.presetId === p.id || lp.name === p.name);
                      return (
                      <TvFocusable
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
                        <View style={[st.avatar, {backgroundColor: p.color, opacity: 0.85, borderWidth: 1, borderColor: colors.outlineVariant}]}>
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
                      </TvFocusable>
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
                  <TvFocusable
                    style={[st.footerBtn, {backgroundColor: colors.surfaceContainerHigh, borderColor: colors.outlineVariant}]}
                    onPress={() => goEdit({manage: true})}>
                    <MaterialCommunityIcons name="pencil" size={20} color={colors.primary} />
                    <AppText style={{color: colors.primary}}>প্রোফাইল ম্যানেজ করুন</AppText>
                  </TvFocusable>
                ) : (
                  <>
                    <TvFocusable
                      style={[st.footerBtn, {backgroundColor: colors.surfaceContainerHigh, borderColor: colors.outlineVariant}]}
                      onPress={() => {
                        const target = profiles.find(p => p.id === activeId) || profiles[0];
                        goEdit(target ? {profileId: target.id} : {});
                      }}>
                      <MaterialCommunityIcons name="pencil-off" size={20} color={colors.primary} />
                      <AppText style={{color: colors.primary}}>প্রোফাইল এডিট করুন</AppText>
                    </TvFocusable>
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
    <TvFocusable onPress={onPress} hitSlop={10} style={{marginRight: 14}}>
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
    </TvFocusable>
  );
};

export default ProfileAvatarChip;

const st = StyleSheet.create({
  backdrop: {flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24},
  // Depth + a hairline outline so the box separates from the scrim instead of
  // sitting on it as a flat grey card.
  sheet: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '86%',
    borderRadius: 28,
    borderWidth: 1,
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 18,
    shadowColor: '#000',
    shadowOpacity: 0.55,
    shadowRadius: 26,
    shadowOffset: {width: 0, height: 14},
    elevation: 14,
  },
  grabber: {width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 12, opacity: 0.7},
  title: {textAlign: 'center', color: '#FFF'},
  subtitle: {textAlign: 'center', fontSize: 13, marginTop: 4},
  headerRule: {height: 1, borderRadius: 1, marginTop: 14, marginBottom: 2, marginHorizontal: 14},
  sectionRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 20,
    marginBottom: 4,
  },
  sectionRule: {flex: 1, height: 1, borderRadius: 1},
  sectionTxt: {fontSize: 12, fontWeight: '700'},
  grid: {flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 14, marginTop: 8},
  avatarWrap: {alignItems: 'center', width: 74, minHeight: 96},
  // elevation/shadow lift the avatar off the sheet; the hairline resting ring
  // (painted inline) gives unselected tiles an edge on a same-toned surface.
  // No overflow:'hidden' — the badges are absolutely pinned past the circle.
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 6,
    shadowOffset: {width: 0, height: 3},
    elevation: 3,
  },
  avatarName: {marginTop: 6, fontSize: 12, color: '#DDD', maxWidth: 72},
  familyBadge: {position: 'absolute', top: 46, right: 8, backgroundColor: '#2E7D32', borderRadius: 8, padding: 2},
  editBadge: {position: 'absolute', top: -3, right: -3, backgroundColor: '#3A3A3C', borderRadius: 11, padding: 4, borderWidth: 2, borderColor: '#141414'},
  addedBadge: {position: 'absolute', top: -2, right: -2, backgroundColor: '#2E7D32', borderRadius: 10, padding: 2, borderWidth: 2, borderColor: '#141414'},
  guestBody: {marginTop: 8, fontSize: 13, color: '#BBB', textAlign: 'center', lineHeight: 19},
  guestNote: {marginTop: 8, fontSize: 12, color: '#8BC34A', textAlign: 'center'},
  loginBtn: {flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, paddingHorizontal: 26, paddingVertical: 11, borderRadius: 24, borderWidth: 1.5},
  accountNote: {fontSize: 11, color: '#9E9E9E', textAlign: 'center', marginBottom: 10, paddingHorizontal: 8},
  footerRow: {marginTop: 16, alignItems: 'center'},
  // Full-width outlined pill rather than a loose icon+label floating above
  // the sheet edge — it now reads as the sheet's primary action.
  footerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 26,
    borderWidth: 1,
  },
});
