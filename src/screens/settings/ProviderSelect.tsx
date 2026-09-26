import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  TextInput,
  ToastAndroid,
  TouchableOpacity,
  View,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import axios from 'axios';
import {MaterialIcons} from '@expo/vector-icons';
import AppText from '../../components/ui/Text';
import {useM3Colors} from '../../theme/M3PaletteContext';
import {useAuthStore} from '../../lib/zustand/authStore';
import useContentStore from '../../lib/zustand/contentStore';
import {HARDCODED_KILL_KEY} from '../../lib/services/initService';
import {settingsStorage} from '../../lib/storage';
import {showAppDialog} from '../../lib/zustand/appDialogStore';

const API = 'https://cinepix.top/api/app';

interface ProviderItem {
  value: string;
  display_name: string;
  icon: string;
}

interface RedeemResult {
  ok: boolean;
  msg?: string;
  providers?: string[];
  days?: number;
  expires_at?: string | null;
}

/**
 * Home Provider picker — LOCKED by default.
 *
 * The list renders with everything ticked (the aggregated default) but the
 * checkboxes are a lock: changing the selection requires an account with
 * entitlement.
 *  - logged out        → "আগে লগইন করুন" dialog
 *  - free account      → Premium/অ্যাডমিন dialog (or a trial coupon)
 *  - premium / admin   → free to select/unselect
 * Coupon codes unlock specific providers for N days (admin creates them in
 * App → Coupons and hands them out for trials/promotions).
 */
export default function ProviderSelectScreen() {
  const colors = useM3Colors();
  const token = useAuthStore(s => s.token);
  const isPremium = useAuthStore(s => s.isPremium);
  const user = useAuthStore(s => s.user);
  const navigation =
    useNavigation<NativeStackNavigationProp<Record<string, object | undefined>>>();
  const installedProviders = useContentStore(state => state.installedProviders);
  const setHomeProviderValue = useContentStore(state => state.setHomeProviderValue);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [useAggregated, setUseAggregated] = useState(!settingsStorage.getHomeProvider());
  const [saving, setSaving] = useState(false);
  const [coupon, setCoupon] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [unlocks, setUnlocks] = useState<Record<string, {until: number; days: number}>>({});

  useEffect(() => {
    // Non-entitled users always see the default: everything ticked
    // (aggregated), locked. Only premium/admin restore a saved selection.
    if (!canEdit) {
      setUseAggregated(true);
      setSelected(new Set(installedProviders.map(p => p.value)));
      return;
    }
    const saved = settingsStorage.getHomeProvider();
    if (saved) {
      const vals = saved.split(',').filter(Boolean);
      if (vals.length > 0) {
        setSelected(new Set(vals));
        setUseAggregated(false);
        return;
      }
    }
    setUseAggregated(true);
    setSelected(new Set(installedProviders.map(p => p.value)));
  }, [installedProviders, canEdit]);

  // Load active coupon unlocks so rows can show their expiry badges.
  const loadUnlocks = useCallback(async () => {
    if (!token) {
      setUnlocks({});
      return;
    }
    try {
      const res = await axios.get(`${API}/myproviders`, {
        headers: {Authorization: `Bearer ${token}`, 'X-App-Key': HARDCODED_KILL_KEY},
        timeout: 8000,
      });
      const map: Record<string, {until: number; days: number}> = {};
      for (const g of res.data?.providers || []) {
        if (g?.value && g?.coupon_expires_at) {
          const until = new Date(g.coupon_expires_at).getTime();
          if (until > Date.now()) {
            map[g.value] = {until, days: g.coupon_days || 0};
          }
        }
      }
      setUnlocks(map);
    } catch {}
  }, [token]);

  useEffect(() => {
    loadUnlocks();
  }, [loadUnlocks]);

  const canEdit = isPremium || !!user?.is_admin;

  const showLockedDialog = useCallback(() => {
    if (!token) {
      showAppDialog({
        title: 'লগইন করুন',
        message: 'Provider সিলেক্ট করতে আগে লগইন করুন। লগইন করলে ট্রায়াল কুপনও ব্যবহার করতে পারবেন।',
        actions: [
          {label: 'পরে'},
          {label: 'লগইন', onPress: () => navigation.navigate('Login' as never)},
        ],
      });
      return;
    }
    showAppDialog({
      title: 'প্রিমিয়াম প্রয়োজন',
      message:
        'ইচ্ছামতো provider সিলেক্ট করতে Premium নিন, অথবা admin-এর সাথে যোগাযোগ করুন। ট্রায়াল কুপন থাকলে নিচের বক্সে কোডটি দিন — নির্দিষ্ট provider কয়েকদিনের জন্য আনলক হবে।',
      actions: [
        {label: 'বন্ধ'},
        {label: 'Premium নিন', onPress: () => navigation.navigate('Premium' as never)},
      ],
    });
  }, [token, navigation]);

  const toggleProvider = useCallback(
    (value: string) => {
      if (!canEdit) {
        showLockedDialog();
        return;
      }
      setUseAggregated(false);
      setSelected(prev => {
        const next = new Set(prev);
        if (next.has(value)) {
          next.delete(value);
        } else {
          next.add(value);
        }
        if (next.size === 0) {
          setUseAggregated(true);
          return new Set(installedProviders.map(p => p.value));
        }
        return next;
      });
    },
    [installedProviders, canEdit, showLockedDialog],
  );

  const selectAll = () => {
    if (!canEdit) {
      showLockedDialog();
      return;
    }
    setUseAggregated(true);
    setSelected(new Set(installedProviders.map(p => p.value)));
  };

  const handleRedeem = useCallback(async () => {
    const code = coupon.trim();
    if (!code) return;
    if (!token) {
      ToastAndroid.show('কুপন ব্যবহার করতে লগইন করুন', ToastAndroid.SHORT);
      return;
    }
    setRedeeming(true);
    try {
      const res = await axios.post<RedeemResult>(
        `${API}/redeem-coupon`,
        {code},
        {headers: {Authorization: `Bearer ${token}`, 'X-App-Key': HARDCODED_KILL_KEY}, timeout: 10000},
      );
      const data = res.data;
      if (data?.ok) {
        const names = (data.providers || []).join(', ');
        ToastAndroid.show(
          `কুপন সফল! ${names || 'Provider'} ${data.days || 0} দিনের জন্য আনলক হয়েছে`,
          ToastAndroid.LONG,
        );
        setCoupon('');
        await loadUnlocks();
        // Pre-select newly unlocked providers for convenience.
        if (data.providers?.length) {
          setSelected(prev => {
            const next = new Set(prev);
            for (const pv of data.providers || []) next.add(pv);
            return next;
          });
          setUseAggregated(false);
        }
      } else {
        ToastAndroid.show(data?.msg || 'কুপনটি সঠিক নয়', ToastAndroid.LONG);
      }
    } catch (e: any) {
      const msg = e?.response?.data?.msg || 'কুপন যাচাই ব্যর্থ হয়েছে, পরে চেষ্টা করুন';
      ToastAndroid.show(msg, ToastAndroid.LONG);
    }
    setRedeeming(false);
  }, [coupon, token, loadUnlocks]);

  const handleSave = async () => {
    // Locked for non-entitled users: keep the aggregated default everywhere.
    if (!canEdit) {
      showLockedDialog();
      return;
    }
    setSaving(true);
    try {
      const sel = Array.from(selected);
      const providerStr = useAggregated ? '' : sel.join(',');
      settingsStorage.setHomeProvider(providerStr);
      setHomeProviderValue(providerStr);

      if (token) {
        try {
          await axios.post(`${API}/myproviders`, {providers: useAggregated ? [] : sel}, {
            headers: {Authorization: `Bearer ${token}`, 'X-App-Key': HARDCODED_KILL_KEY},
            timeout: 8000,
          });
        } catch {}
      }

      ToastAndroid.show(
        useAggregated ? 'All providers selected' : `${sel.length} provider(s) selected`,
        ToastAndroid.SHORT,
      );
      navigation.goBack();
    } catch {
      ToastAndroid.show('Failed to save', ToastAndroid.SHORT);
    }
    setSaving(false);
  };

  const providers: ProviderItem[] = installedProviders.map(p => ({
    value: p.value,
    display_name: p.display_name,
    icon: p.icon || '',
  }));

  const lockedCount = useMemo(
    () => providers.filter(p => !!unlocks[p.value]).length,
    [providers, unlocks],
  );

  const formatDaysLeft = useCallback((until: number) => {
    const days = Math.ceil((until - Date.now()) / 86400000);
    return days >= 1 ? `${days} দিন` : 'আজ শেষ';
  }, []);

  const lockHint = !canEdit
    ? token
      ? '🔒 Provider পরিবর্তন করতে Premium নিন অথবা admin-এর সাথে যোগাযোগ করুন'
      : '🔒 Provider পরিবর্তন করতে লগইন করুন'
    : null;

  return (
    <View style={[styles.container, {backgroundColor: colors.background}]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <AppText role="titleMedium" style={{color: colors.primary}}>Cancel</AppText>
        </TouchableOpacity>
        <AppText role="titleLarge" style={{color: colors.onBackground}}>Home Provider</AppText>
        <TouchableOpacity onPress={handleSave} disabled={saving}>
          <AppText role="titleMedium" style={{color: colors.primary}}>
            {saving ? 'Saving...' : 'Save'}
          </AppText>
        </TouchableOpacity>
      </View>
      <ScrollView
        style={{flex: 1}}
        contentContainerStyle={{paddingBottom: 32}}
        keyboardShouldPersistTaps="handled">
        <AppText role="bodySmall" style={[styles.hint, {color: colors.onSurfaceVariant}]}>
          Select multiple providers to show on your home page
        </AppText>
        {lockHint && (
          <AppText role="labelMedium" style={{color: '#f59e0b', paddingHorizontal: 16, marginBottom: 6}}>
            {lockHint}
          </AppText>
        )}

        {!isPremium && (
          <View style={[styles.couponBox, {borderColor: colors.outlineVariant, backgroundColor: colors.surfaceContainerLow}]}>
            <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
              <MaterialIcons name="confirmation-number" size={18} color="#f59e0b" />
              <AppText role="titleSmall" style={{color: colors.onSurface, fontWeight: '700', flex: 1}}>
                ট্রায়াল / কুপন কোড
              </AppText>
            </View>
            <AppText role="bodySmall" style={{color: colors.onSurfaceVariant, marginTop: 2}}>
              অ্যাডমিন দেওয়া কোড দিলে নির্দিষ্ট provider কয়েকদিনের জন্য আনলক হবে
            </AppText>
            <View style={{flexDirection: 'row', gap: 8, marginTop: 10}}>
              <TextInput
                value={coupon}
                onChangeText={setCoupon}
                placeholder="যেমন: CINEPIX-TRIAL7"
                placeholderTextColor={colors.onSurfaceVariant}
                autoCapitalize="characters"
                autoCorrect={false}
                style={[styles.couponInput, {borderColor: colors.outlineVariant, color: colors.onSurface}]}
              />
              <TouchableOpacity
                onPress={handleRedeem}
                disabled={redeeming || !coupon.trim()}
                style={[styles.couponBtn, {backgroundColor: redeeming || !coupon.trim() ? colors.surfaceContainerHigh : colors.primary}]}>
                {redeeming ? (
                  <ActivityIndicator size="small" color={colors.onPrimary} />
                ) : (
                  <AppText role="labelLarge" style={{color: redeeming || !coupon.trim() ? colors.onSurfaceVariant : colors.onPrimary, fontWeight: '700'}}>
                    আনলক
                  </AppText>
                )}
              </TouchableOpacity>
            </View>
            {lockedCount > 0 && (
              <AppText role="labelSmall" style={{color: '#f59e0b', marginTop: 8}}>
                ★ {lockedCount} টি কুপন-আনলক করা provider সক্রিয় আছে
              </AppText>
            )}
            {!token && (
              <AppText role="labelSmall" style={{color: colors.onSurfaceVariant, marginTop: 8}}>
                কুপন ব্যবহার করতে লগইন করুন
              </AppText>
            )}
          </View>
        )}

        <TouchableOpacity
          onPress={selectAll}
          style={[styles.aggregatedRow, {
            backgroundColor: useAggregated ? colors.primaryContainer : colors.surfaceContainer,
            borderColor: useAggregated ? colors.primary : colors.outlineVariant,
          }]}>
          <View style={styles.rowContent}>
            <MaterialIcons name="home" size={20} color={useAggregated ? colors.onPrimaryContainer : colors.onSurface} style={{marginRight: 12}} />
            <View style={{flex: 1}}>
              <AppText role="titleMedium" style={{color: useAggregated ? colors.onPrimaryContainer : colors.onSurface}}>
                All providers (aggregated)
              </AppText>
              <AppText role="bodySmall" style={{color: colors.onSurfaceVariant}}>
                Show content from all installed providers
              </AppText>
            </View>
            <View style={[styles.checkbox, {
              borderColor: useAggregated ? colors.primary : colors.outline,
              backgroundColor: useAggregated ? colors.primary : 'transparent',
            }]}>
              {useAggregated && <MaterialIcons name="check" size={16} color={colors.onPrimary} />}
            </View>
          </View>
        </TouchableOpacity>

        <View style={{flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginTop: 16, marginBottom: 8}}>
          <View style={{flex: 1, height: 1, backgroundColor: colors.outlineVariant}} />
          <AppText role="labelSmall" style={{color: colors.onSurfaceVariant, marginHorizontal: 12}}>
            SELECT PROVIDERS ({selected.size} selected)
          </AppText>
          <View style={{flex: 1, height: 1, backgroundColor: colors.outlineVariant}} />
        </View>

        <FlatList
          style={{flexGrow: 0}}
          data={providers}
          keyExtractor={item => item.value}
          scrollEnabled={false}
          renderItem={({item}) => {
            const isChecked = !useAggregated && selected.has(item.value);
            const unlock = unlocks[item.value];
            return (
              <TouchableOpacity
                onPress={() => toggleProvider(item.value)}
                style={[styles.row, {
                  backgroundColor: isChecked ? colors.primaryContainer : colors.surfaceContainer,
                  borderColor: isChecked ? colors.primary : colors.outlineVariant,
                }]}>
                <View style={styles.rowContent}>
                  <View style={{flex: 1}}>
                    <AppText role="titleMedium" style={{color: isChecked ? colors.onPrimaryContainer : colors.onSurface}}>
                      {item.display_name}
                    </AppText>
                    {unlock && (
                      <AppText role="labelSmall" style={{color: '#f59e0b', marginTop: 2}}>
                        ★ কুপন আনলক — {formatDaysLeft(unlock.until)} বাকি
                      </AppText>
                    )}
                  </View>
                  <View style={[styles.checkbox, {
                    borderColor: isChecked ? colors.primary : colors.outline,
                    backgroundColor: isChecked ? colors.primary : 'transparent',
                    opacity: canEdit ? 1 : 0.55,
                  }]}>
                    {isChecked && <MaterialIcons name="check" size={16} color={colors.onPrimary} />}
                  </View>
                  {!canEdit && (
                    <MaterialIcons name="lock-outline" size={16} color="#f59e0b" style={{marginLeft: 8}} />
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
          contentContainerStyle={{paddingHorizontal: 16, gap: 8}}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  header: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4},
  hint: {paddingHorizontal: 16, marginBottom: 8},
  aggregatedRow: {marginHorizontal: 16, padding: 16, borderRadius: 12, borderWidth: 1},
  row: {padding: 16, borderRadius: 12, borderWidth: 1, marginHorizontal: 16},
  rowContent: {flexDirection: 'row', alignItems: 'center'},
  checkbox: {width: 22, height: 22, borderRadius: 6, borderWidth: 2, justifyContent: 'center', alignItems: 'center', marginLeft: 12},
  couponBox: {marginHorizontal: 16, marginTop: 10, padding: 14, borderRadius: 14, borderWidth: 1},
  couponInput: {flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14},
  couponBtn: {borderRadius: 10, paddingHorizontal: 18, justifyContent: 'center', alignItems: 'center', minWidth: 88},
});
