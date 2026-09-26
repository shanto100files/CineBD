import React, {useState, useEffect} from 'react';
import {View, Modal, ScrollView, TouchableOpacity, StyleSheet} from 'react-native';
import {MaterialCommunityIcons} from '@expo/vector-icons';
import AppText from './ui/Text';
import {useM3Colors} from '../theme/M3PaletteContext';
import {settingsStorage} from '../lib/storage';
import useContentStore from '../lib/zustand/contentStore';

const PROVIDERS = [
  {name: '4KHDHub', short: '4K Hub', desc: 'Movies & Series', icon: 'movie-open-outline'},
  {name: 'CineFreak', short: 'CFreak', desc: 'Movies & Series', icon: 'filmstrip-outline'},
  {name: 'HubFlix', short: 'Hflix', desc: 'Movies & Series', icon: 'play-circle-outline'},
  {name: 'MultiStream', short: 'Multi', desc: 'Multi-source aggregator', icon: 'layers-outline'},
  {name: 'Vegamovies', short: 'Vega', desc: 'Movies & Web Series', icon: 'video-outline'},
];

const WelcomePopup = () => {
  const colors = useM3Colors();
  const [visible, setVisible] = useState(false);
  const installedProviders = useContentStore(state => state.installedProviders);

  useEffect(() => {
    if (!settingsStorage.isOnboardingCompleted()) {
      setVisible(true);
    }
  }, []);

  const handleAccept = () => {
    settingsStorage.setOnboardingCompleted();
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={[styles.container, {backgroundColor: colors.surfaceContainer}]}>
          <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
            {/* Header */}
            <View style={styles.header}>
              <View style={[styles.iconCircle, {backgroundColor: colors.primaryContainer}]}>
                <MaterialCommunityIcons name="play-circle" size={40} color={colors.primary} />
              </View>
              <AppText role="headlineMedium" style={{color: colors.onSurface, fontWeight: '800', marginTop: 16, textAlign: 'center'}}>
                Welcome to Cinepix
              </AppText>
              <AppText role="bodyMedium" style={{color: colors.onSurfaceVariant, marginTop: 8, textAlign: 'center', lineHeight: 20}}>
                Stream movies & series from multiple sources
              </AppText>
            </View>

            {/* How to use */}
            <View style={[styles.section, {borderColor: colors.outlineVariant}]}>
              <View style={styles.sectionHeader}>
                <MaterialCommunityIcons name="book-open-variant" size={20} color={colors.primary} />
                <AppText role="titleSmall" style={{color: colors.primary, marginLeft: 8, fontWeight: '700'}}>
                  How to use
                </AppText>
              </View>
              <Step num={1} text="Content loads from all providers automatically" colors={colors} />
              <Step num={2} text="Browse movies or series from that source" colors={colors} />
              <Step num={3} text="Tap play to stream, or download for offline" colors={colors} />
              <Step num={4} text="Switch providers anytime from Settings" colors={colors} />
            </View>

            {/* Available Providers */}
            <View style={[styles.section, {borderColor: colors.outlineVariant}]}>
              <View style={styles.sectionHeader}>
                <MaterialCommunityIcons name="puzzle" size={20} color={colors.primary} />
                <AppText role="titleSmall" style={{color: colors.primary, marginLeft: 8, fontWeight: '700'}}>
                  Available Providers
                </AppText>
              </View>
              {PROVIDERS.map(p => (
                <View key={p.name} style={[styles.providerRow, {borderColor: colors.outlineVariant}]}>
                  <MaterialCommunityIcons name={p.icon as any} size={22} color={colors.onSurfaceVariant} />
                  <View style={{flex: 1, marginLeft: 12}}>
                    <AppText role="bodyMedium" style={{color: colors.onSurface, fontWeight: '600'}}>
                      {p.short}
                    </AppText>
                    <AppText role="labelSmall" style={{color: colors.onSurfaceVariant}}>
                      {p.desc}
                    </AppText>
                  </View>
                  {installedProviders.some(ip => ip.display_name?.includes(p.name)) && (
                    <View style={[styles.installedBadge, {backgroundColor: colors.primaryContainer}]}>
                      <AppText role="labelSmall" style={{color: colors.primary, fontWeight: '700'}}>Active</AppText>
                    </View>
                  )}
                </View>
              ))}
            </View>

            {/* Tips */}
            <View style={[styles.section, {borderColor: colors.outlineVariant}]}>
              <View style={styles.sectionHeader}>
                <MaterialCommunityIcons name="lightbulb-outline" size={20} color={colors.primary} />
                <AppText role="titleSmall" style={{color: colors.primary, marginLeft: 8, fontWeight: '700'}}>
                  Tips
                </AppText>
              </View>
              <AppText role="bodySmall" style={{color: colors.onSurfaceVariant, lineHeight: 20}}>
                {'\u2022'} Use the Search tab to find content across all providers{'\n'}
                {'\u2022'} Long-press episodes to mark as watched{'\n'}
                {'\u2022'} Enable dark mode in Settings{' > '}Appearance{'\n'}
                {'\u2022'} Report bugs from Settings{' > '}Report Bug
              </AppText>
            </View>
          </ScrollView>

          {/* Accept button */}
          <TouchableOpacity
            style={[styles.acceptBtn, {backgroundColor: colors.primary}]}
            onPress={handleAccept}
            activeOpacity={0.8}>
            <AppText role="labelLarge" style={{color: colors.onPrimary, fontWeight: '700'}}>
              Got it, let's go!
            </AppText>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const Step = ({num, text, colors}: {num: number; text: string; colors: any}) => (
  <View style={styles.stepRow}>
    <View style={[styles.stepNum, {backgroundColor: colors.primary}]}>
      <AppText role="labelSmall" style={{color: colors.onPrimary, fontWeight: '700'}}>{num}</AppText>
    </View>
    <AppText role="bodySmall" style={{color: colors.onSurfaceVariant, flex: 1, lineHeight: 18}}>
      {text}
    </AppText>
  </View>
);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '85%',
    borderRadius: 24,
    padding: 24,
    overflow: 'hidden',
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 10,
  },
  stepNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  installedBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  acceptBtn: {
    marginTop: 8,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
});

export default WelcomePopup;
