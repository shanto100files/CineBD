import React, {useEffect, useState} from 'react';
import {View, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator} from 'react-native';
import {useM3Colors} from '../../theme/M3PaletteContext';
import AppText from '../../components/ui/Text';
import {useAuthStore} from '../../lib/zustand/authStore';
import {settingsStorage} from '../../lib/storage';
import axios from 'axios';
import {useNavigation} from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import {MaterialIcons} from '@expo/vector-icons';

const API = 'https://cinepix.top/api/app';

interface ProviderItem {
  value: string;
  display_name: string;
  icon: string;
}

export default function ProviderSelectScreen() {
  const colors = useM3Colors();
  const token = useAuthStore(s => s.token);
  const navigation = useNavigation();
  const [providers, setProviders] = useState<ProviderItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [useAggregated, setUseAggregated] = useState(!settingsStorage.getHomeProvider());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!token) return;
    axios.get(`${API}/myproviders`, {
      headers: {Authorization: `Bearer ${token}`},
      timeout: 8000,
    }).then(res => {
      const list = res.data.providers || [];
      setProviders(list);
      if (!res.data.all) {
        setSelected(new Set(list.map((p: ProviderItem) => p.value)));
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [token]);

  const toggle = (value: string) => {
    setUseAggregated(false);
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  const selectAll = () => {
    setUseAggregated(true);
    setSelected(new Set(providers.map(p => p.value)));
  };

  const handleSave = async () => {
    if (!token) return;
    setSaving(true);
    try {
      if (useAggregated) {
        settingsStorage.setHomeProvider('');
        await axios.post(`${API}/myproviders`, {providers: []}, {
          headers: {Authorization: `Bearer ${token}`},
          timeout: 8000,
        });
        Toast.show({type: 'success', text1: 'Home set to All providers (aggregated)'});
      } else {
        const sel = Array.from(selected);
        if (sel.length === 1) {
          settingsStorage.setHomeProvider(sel[0]);
        } else {
          settingsStorage.setHomeProvider('');
        }
        await axios.post(`${API}/myproviders`, {providers: sel}, {
          headers: {Authorization: `Bearer ${token}`},
          timeout: 8000,
        });
        Toast.show({type: 'success', text1: `Home set to ${sel.length} provider(s)`});
      }
      navigation.goBack();
    } catch {}
    setSaving(false);
  };

  if (loading) {
    return <View style={[styles.container, {backgroundColor: colors.background}]}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

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
      <AppText role="bodySmall" style={[styles.hint, {color: colors.onSurfaceVariant}]}>
        Choose which provider shows on your home page
      </AppText>

      {/* Aggregated option */}
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
          <View style={[styles.radio, {borderColor: useAggregated ? colors.primary : colors.outline}]}>
            {useAggregated && <View style={[styles.radioInner, {backgroundColor: colors.primary}]} />}
          </View>
        </View>
      </TouchableOpacity>

      {/* Single provider divider */}
      <View style={{flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginTop: 16, marginBottom: 8}}>
        <View style={{flex: 1, height: 1, backgroundColor: colors.outlineVariant}} />
        <AppText role="labelSmall" style={{color: colors.onSurfaceVariant, marginHorizontal: 12}}>OR SELECT SINGLE PROVIDER</AppText>
        <View style={{flex: 1, height: 1, backgroundColor: colors.outlineVariant}} />
      </View>

      <FlatList
        data={providers}
        keyExtractor={item => item.value}
        renderItem={({item}) => {
          const isActive = !useAggregated && selected.has(item.value);
          const isOnly = !useAggregated && selected.size === 1 && selected.has(item.value);
          return (
            <TouchableOpacity
              onPress={() => {
                setSelected(new Set([item.value]));
                setUseAggregated(false);
              }}
              style={[styles.row, {
                backgroundColor: isOnly ? colors.primaryContainer : colors.surfaceContainer,
                borderColor: isOnly ? colors.primary : colors.outlineVariant,
              }]}>
              <View style={styles.rowContent}>
                <AppText role="titleMedium" style={{color: isOnly ? colors.onPrimaryContainer : colors.onSurface, flex: 1}}>
                  {item.display_name}
                </AppText>
                <View style={[styles.radio, {borderColor: isOnly ? colors.primary : colors.outline}]}>
                  {isOnly && <View style={[styles.radioInner, {backgroundColor: colors.primary}]} />}
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
        contentContainerStyle={{paddingHorizontal: 16, paddingBottom: 32, gap: 8}}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  header: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4},
  hint: {paddingHorizontal: 16, marginBottom: 8},
  aggregatedRow: {marginHorizontal: 16, padding: 16, borderRadius: 12, borderWidth: 1},
  row: {padding: 16, borderRadius: 12, borderWidth: 1},
  rowContent: {flexDirection: 'row', alignItems: 'center'},
  radio: {width: 22, height: 22, borderRadius: 11, borderWidth: 2, justifyContent: 'center', alignItems: 'center'},
  radioInner: {width: 12, height: 12, borderRadius: 6},
});
