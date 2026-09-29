import React, {useMemo, useState} from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  ToastAndroid,
  View,
} from 'react-native';
import {useNavigation, useRoute} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import AppText from '../../components/ui/Text';
import {useM3Colors} from '../../theme/M3PaletteContext';
import useProfileStore, {
  PROFILE_AVATARS,
  canCustomizeProfiles,
} from '../../lib/zustand/profileStore';
import useContentStore from '../../lib/zustand/contentStore';
import {useEntitlementStore} from '../../lib/zustand/entitlementStore';
import {useAuthStore} from '../../lib/zustand/authStore';
import {settingsStorage} from '../../lib/storage';
import {extensionStorage} from '../../lib/storage/extensionStorage';
import {FLOATING_TAB_BAR_RESERVE} from '../../theme/layout';

const AVATAR_COLORS = [
  '#EF5350', '#AB47BC', '#5C6BC0', '#29B6F6', '#26A69A',
  '#9CCC65', '#FFA726', '#FF7043', '#EC407A', '#7E57C2',
];

/**
 * Create / edit a profile.
 * Route params: {profileId?: string} — absent = create mode.
 *
 * Profiles are account-synced: login is required (the switcher gates
 * guests), and edits push to the server keyed by user id.
 *
 * Provider selection rules:
 *  - free users: read-only — they use admin presets as-is
 *  - premium/admin: any provider they are entitled to (single or multi)
 */
export default function ProfileEditScreen() {
  const colors = useM3Colors();
  const navigation = useNavigation<NativeStackNavigationProp<Record<string, object | undefined>>>();
  const route = useRoute() as any;
  const editId: string | undefined = route.params?.profileId;

  const profiles = useProfileStore(s => s.profiles);
  const createProfile = useProfileStore(s => s.createProfile);
  const updateProfile = useProfileStore(s => s.updateProfile);
  const deleteProfile = useProfileStore(s => s.deleteProfile);
  const existing = profiles.find(p => p.id === editId);

  const installedProviders = useContentStore(s => s.installedProviders);
  const entAllowed = useEntitlementStore(s => s.allowed);
  const user = useAuthStore(s => s.user);
  const canCustomize = canCustomizeProfiles();

  const [name, setName] = useState(existing?.name || '');
  const [kind, setKind] = useState<'me' | 'family'>(existing?.kind || 'me');
  const [avatar, setAvatar] = useState(existing?.avatar || PROFILE_AVATARS[0]);
  const [color, setColor] = useState(existing?.color || AVATAR_COLORS[0]);
  const [providers, setProviders] = useState<string[] | null>(existing?.providers ?? null);

  // Full unscoped catalog: the profile being EDITED may be a different one
  // from the active profile, so never derive this from the already
  // profile-gated content store list.
  const entitled = useMemo(() => {
    const ent = useEntitlementStore.getState();
    const adultOk = settingsStorage.isAdultEnabled();
    const admin = !!user?.is_admin;
    const all = extensionStorage.getInstalledProviders() || [];
    return all.filter(p => {
      if (!adultOk && p.is_adult) return false;
      if (admin) return true;
      if (ent.allowed === null) return p.access_mode !== 'selected';
      return ent.allowed.includes(p.value);
    });
  }, [installedProviders, user?.is_admin, entAllowed]);

  const pickable = kind === 'family' ? entitled.filter(p => !p.is_adult) : entitled;

  const toggleProvider = (value: string) => {
    if (!canCustomize) return;
    setProviders(prev => {
      const base = prev === null ? entitled.map(p => p.value) : [...prev];
      const next = base.includes(value)
        ? base.filter(v => v !== value)
        : [...base, value];
      return next.length === entitled.length ? null : next;
    });
  };

  const isChecked = (value: string) =>
    providers === null || providers.includes(value);

  const save = () => {
    if (!useAuthStore.getState().isLoggedIn) {
      ToastAndroid.show('প্রোফাইল সেভ করতে লগইন করুন', ToastAndroid.SHORT);
      return;
    }
    if (!name.trim()) {
      ToastAndroid.show('প্রোফাইলের নাম দিন', ToastAndroid.SHORT);
      return;
    }
    if (providers !== null && providers.length === 0) {
      ToastAndroid.show('অন্তত একটি প্রোভাইডার নির্বাচন করুন', ToastAndroid.SHORT);
      return;
    }
    if (existing) {
      updateProfile(existing.id, {name: name.trim(), kind, avatar, color, providers});
      ToastAndroid.show('প্রোফাইল আপডেট হয়েছে', ToastAndroid.SHORT);
    } else {
      const created = createProfile({name, kind, providers, avatar, color});
      if (!created) {
        ToastAndroid.show('সর্বোচ্চ ৮টি প্রোফাইল করা যাবে', ToastAndroid.SHORT);
        return;
      }
      // Same child-proofing as the switcher: auto-activating a profile that
      // can show adult content requires the 18+ lock. The switch is deferred
      // into the unlock success path; cancelling keeps the profile created
      // but inactive.
      let needsLock = false;
      try {
        const {profileSwitchNeedsLock} = require('../../lib/adultLock');
        needsLock = profileSwitchNeedsLock(
          created,
          useProfileStore.getState().activeProfile(),
          settingsStorage.isAdultEnabled(),
        );
      } catch {
        // Fail closed: challenge instead of auto-activating unchecked.
        try {
          needsLock = require('../../lib/adultLock').isAdultPinSet();
        } catch {
          needsLock = false;
        }
      }
      if (needsLock) {
        ToastAndroid.show(
          'প্রোফাইল তৈরি হয়েছে — আনলক করলে সক্রিয় হবে',
          ToastAndroid.LONG,
        );
        navigation.goBack();
        require('../../App').openAdultLock({
          mode: 'unlock',
          switchProfile: created.id,
        });
        return;
      }
      useProfileStore.getState().setActive(created.id);
      ToastAndroid.show('প্রোফাইল তৈরি হয়েছে', ToastAndroid.SHORT);
    }
    navigation.goBack();
  };

  const manageMode = !!route.params?.manage && !editId;
  const activeId = useProfileStore(s => s.activeId);

  if (manageMode) {
    return (
      <View style={{flex: 1, backgroundColor: colors.background}}>
        <ScrollView contentContainerStyle={{padding: 18, paddingBottom: FLOATING_TAB_BAR_RESERVE}}>
          <AppText role="headlineSmallEmphasized" style={{color: colors.onSurface, marginBottom: 6}}>
            প্রোফাইল ম্যানেজ
          </AppText>
          <AppText style={{color: colors.onSurfaceVariant, fontSize: 12, marginBottom: 16}}>
            সম্পাদনা করতে ট্যাপ করুন। মুছতে সম্পাদনা পর্দায় “প্রোফাইল মুছুন” চাপুন।
          </AppText>
          <AppText style={{color: colors.onSurfaceVariant, fontSize: 12, marginTop: -10, marginBottom: 14}}>
            প্রোফাইল আপনার অ্যাকাউন্টে (user ID) সংরক্ষিত হয় — অন্য ডিভাইসে লগইন করলেও পাবেন।
          </AppText>

          <Pressable
            style={[st.row, {backgroundColor: colors.surfaceContainerHigh, marginBottom: 8}]}
            onPress={() => navigation.push('ProfileEdit', {})}>
            <MaterialCommunityIcons name="plus" size={22} color={colors.primary} />
            <AppText style={{flex: 1, marginLeft: 12, color: colors.onSurface}}>নতুন প্রোফাইল</AppText>
          </Pressable>

          {profiles.map(p => (
            <Pressable
              key={p.id}
              style={[st.row, {backgroundColor: colors.surfaceContainerHigh, marginBottom: 6}]}
              onPress={() => navigation.push('ProfileEdit', {profileId: p.id})}>
              <View style={[st.manageAvatar, {backgroundColor: p.color}]}>
                <MaterialCommunityIcons name={(p.avatar as any) || 'account'} size={20} color="#FFF" />
              </View>
              <View style={{flex: 1, marginLeft: 12}}>
                <AppText style={{color: colors.onSurface}}>{p.name}</AppText>
                <AppText style={{color: colors.onSurfaceVariant, fontSize: 11}}>
                  {p.kind === 'family' ? 'ফ্যামিলি মোড' : 'ব্যক্তিগত'}
                  {p.providers !== null ? ` • ${p.providers.length} টি প্রোভাইডার` : ' • সব প্রোভাইডার'}
                </AppText>
              </View>
              {p.id === activeId && (
                <View style={{backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, marginRight: 8}}>
                  <AppText style={{color: '#FFF', fontSize: 10, fontWeight: '700'}}>সক্রিয়</AppText>
                </View>
              )}
              <MaterialCommunityIcons name="chevron-right" size={22} color={colors.onSurfaceVariant} />
            </Pressable>
          ))}

          {profiles.length === 0 && (
            <AppText style={{color: colors.onSurfaceVariant, fontSize: 13, marginTop: 12}}>
              এখনো কোনো প্রোফাইল নেই
            </AppText>
          )}
        </ScrollView>
      </View>
    );
  }

  return (
    <ScrollView
      style={{flex: 1, backgroundColor: colors.background}}
      contentContainerStyle={{padding: 18, paddingBottom: FLOATING_TAB_BAR_RESERVE}}>
      <AppText role="headlineSmallEmphasized" style={{color: colors.onSurface, marginBottom: 6}}>
        {existing ? 'প্রোফাইল সম্পাদনা' : 'নতুন প্রোফাইল'}
      </AppText>
      <AppText style={{color: colors.onSurfaceVariant, fontSize: 12, marginBottom: 16}}>
        সেভ করলে প্রোফাইলটি আপনার অ্যাকাউন্টে (user ID) সংরক্ষিত হবে — অন্য ডিভাইসে লগইন করলেও পাবেন।
      </AppText>

      {/* Preview */}
      <View style={{alignItems: 'center', marginBottom: 20}}>
        <View style={[st.avatarPreview, {backgroundColor: color}]}>
          <MaterialCommunityIcons name={(avatar as any) || 'account'} size={46} color="#FFF" />
        </View>
        <AppText style={{marginTop: 8, color: colors.onSurfaceVariant}}>{name || 'প্রোফাইল'}</AppText>
      </View>

      {/* Name */}
      <AppText style={st.label}>নাম</AppText>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="যেমন: আমি, ছোট ভাই, ফ্যামিলি..."
        placeholderTextColor={colors.onSurfaceVariant}
        style={[st.input, {backgroundColor: colors.surfaceContainerHigh, color: colors.onSurface}]}
        maxLength={24}
      />

      {/* Family toggle */}
      <Pressable
        style={[st.row, {backgroundColor: colors.surfaceContainerHigh}]}
        onPress={() => {
          const next = kind === 'family' ? 'me' : 'family';
          setKind(next);
          if (next === 'family') {
            setProviders((prev) => {
              const base = prev === null ? entitled.map(p => p.value) : prev;
              return base.filter(v => !entitled.find(p => p.value === v)?.is_adult);
            });
          }
        }}>
        <MaterialCommunityIcons name="shield-home-outline" size={24} color="#66BB6A" />
        <View style={{flex: 1, marginLeft: 12}}>
          <AppText style={{color: colors.onSurface}}>ফ্যামিলি মোড</AppText>
          <AppText style={{color: colors.onSurfaceVariant, fontSize: 12}}>
            18+ কনটেন্ট সবসময় লুকানো থাকবে
          </AppText>
        </View>
        <MaterialCommunityIcons
          name={kind === 'family' ? 'toggle-switch' : 'toggle-switch-off-outline'}
          size={30}
          color={kind === 'family' ? colors.primary : colors.onSurfaceVariant}
        />
      </Pressable>

      {/* Avatar picker */}
      <AppText style={st.label}>অ্যাভাটার</AppText>
      <View style={st.avatarGrid}>
        {PROFILE_AVATARS.map(a => (
          <Pressable
            key={a}
            onPress={() => setAvatar(a)}
            style={[st.avatarCell, avatar === a && {borderColor: colors.primary, borderWidth: 2}]}>
            <MaterialCommunityIcons name={(a as any) || 'account'} size={26} color={colors.onSurface} />
          </Pressable>
        ))}
      </View>

      {/* Color picker */}
      <AppText style={st.label}>রং</AppText>
      <View style={st.avatarGrid}>
        {AVATAR_COLORS.map(c => (
          <Pressable
            key={c}
            onPress={() => setColor(c)}
            style={[st.colorCell, {backgroundColor: c}, color === c && {borderColor: colors.onSurface, borderWidth: 2}]}
          />
        ))}
      </View>

      {/* Providers */}
      <AppText style={[st.label, {marginTop: 20}]}>প্রোভাইডার</AppText>
      {!canCustomize ? (
        <View style={[st.lockBox, {backgroundColor: colors.surfaceContainerHigh}]}>
          <MaterialCommunityIcons name="lock-outline" size={20} color={colors.onSurfaceVariant} />
          <AppText style={{color: colors.onSurfaceVariant, flex: 1, marginLeft: 10, fontSize: 13}}>
            নাম, অ্যাভাটার ও রং সেভ করা যাবে — শুধু প্রোভাইডার তালিকা কাস্টমাইজ করতে প্রিমিয়াম লাগবে
          </AppText>
        </View>
      ) : (
        <>
          <Pressable
            style={[st.row, {backgroundColor: colors.surfaceContainerHigh, marginBottom: 8}]}
            onPress={() => setProviders(null)}>
            <MaterialCommunityIcons name="select-all" size={22} color={colors.primary} />
            <AppText style={{flex: 1, marginLeft: 12, color: colors.onSurface}}>সব দেখান (Aggregate)</AppText>
            <MaterialCommunityIcons
              name={providers === null ? 'checkbox-marked' : 'checkbox-blank-outline'}
              size={22}
              color={providers === null ? colors.primary : colors.onSurfaceVariant}
            />
          </Pressable>
          <FlatList
            data={pickable}
            keyExtractor={p => p.value}
            scrollEnabled={false}
            renderItem={({item}) => (
              <Pressable
                style={[st.row, {backgroundColor: colors.surfaceContainerHigh, marginBottom: 6}]}
                onPress={() => toggleProvider(item.value)}>
                <MaterialCommunityIcons
                  name={isChecked(item.value) ? 'checkbox-marked' : 'checkbox-blank-outline'}
                  size={22}
                  color={isChecked(item.value) ? colors.primary : colors.onSurfaceVariant}
                />
                <AppText style={{flex: 1, marginLeft: 12, color: colors.onSurface}} numberOfLines={1}>
                  {item.display_name}
                </AppText>
                {item.is_adult && (
                  <AppText style={{color: '#F48FB1', fontSize: 12, marginRight: 8}}>18+</AppText>
                )}
              </Pressable>
            )}
          />
        </>
      )}

      {/* Save + delete */}
      <Pressable style={[st.saveBtn, {backgroundColor: colors.primaryContainer}]} onPress={save}>
        <MaterialCommunityIcons name="check" size={22} color={colors.onPrimaryContainer} />
        <AppText style={{color: colors.onPrimaryContainer, marginLeft: 8, fontWeight: '600'}}>
          {existing ? 'আপডেট করুন' : 'তৈরি করুন'}
        </AppText>
      </Pressable>

      {existing && (
        <Pressable
          style={[st.saveBtn, {backgroundColor: colors.errorContainer, marginTop: 10}]}
          onPress={() => {
            deleteProfile(existing.id);
            ToastAndroid.show('প্রোফাইল মুছে ফেলা হয়েছে', ToastAndroid.SHORT);
            navigation.goBack();
          }}>
          <MaterialCommunityIcons name="delete-outline" size={22} color={colors.onErrorContainer} />
          <AppText style={{color: colors.onErrorContainer, marginLeft: 8}}>প্রোফাইল মুছুন</AppText>
        </Pressable>
      )}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  label: {fontSize: 13, color: '#B8B8B8', marginBottom: 8, marginTop: 14},
  input: {borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15},
  row: {flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: 12},
  avatarPreview: {width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center'},
  avatarGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  avatarCell: {
    width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(128,128,128,0.15)', borderWidth: 0,
  },
  manageAvatar: {width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center'},
  colorCell: {width: 36, height: 36, borderRadius: 18},
  lockBox: {flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: 12},
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: 14, paddingVertical: 13, marginTop: 22,
  },
});
