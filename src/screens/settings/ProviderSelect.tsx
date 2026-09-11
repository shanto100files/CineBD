import React, {useEffect, useState, useCallback} from 'react';
import {View, FlatList, TouchableOpacity, StyleSheet, ToastAndroid} from 'react-native';
import {useM3Colors} from '../../theme/M3PaletteContext';
import AppText from '../../components/ui/Text';
import {useAuthStore} from '../../lib/zustand/authStore';
import useContentStore from '../../lib/zustand/contentStore';
import {settingsStorage} from '../../lib/storage';
import {HARDCODED_KILL_KEY} from '../../lib/services/initService';
import axios from 'axios';
import {useNavigation} from '@react-navigation/native';
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
  const installedProviders = useContentStore(state => state.installedProviders);
  const setHomeProviderValue = useContentStore(state => state.setHomeProviderValue);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [useAggregated, setUseAggregated] = useState(!settingsStorage.getHomeProvider());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
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
  }, [installedProviders]);

  const toggleProvider = useCallback((value: string) => {
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
  }, [installedProviders]);

  const selectAll = () => {
    setUseAggregated(true);
    setSelected(new Set(installedProviders.map(p => p.value)));
  };

  const handleSave = async () => {
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
        Select multiple providers to show on your home page
      </AppText>

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
        data={providers}
        keyExtractor={item => item.value}
        renderItem={({item}) => {
          const isChecked = !useAggregated && selected.has(item.value);
          return (
            <TouchableOpacity
              onPress={() => toggleProvider(item.value)}
              style={[styles.row, {
                backgroundColor: isChecked ? colors.primaryContainer : colors.surfaceContainer,
                borderColor: isChecked ? colors.primary : colors.outlineVariant,
              }]}>
              <View style={styles.rowContent}>
                <AppText role="titleMedium" style={{color: isChecked ? colors.onPrimaryContainer : colors.onSurface, flex: 1}}>
                  {item.display_name}
                </AppText>
                <View style={[styles.checkbox, {
                  borderColor: isChecked ? colors.primary : colors.outline,
                  backgroundColor: isChecked ? colors.primary : 'transparent',
                }]}>
                  {isChecked && <MaterialIcons name="check" size={16} color={colors.onPrimary} />}
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
  checkbox: {width: 22, height: 22, borderRadius: 6, borderWidth: 2, justifyContent: 'center', alignItems: 'center'},
});
