import React, {useState} from 'react';
import {View, ScrollView, TextInput, TouchableOpacity, StyleSheet, ToastAndroid, ActivityIndicator} from 'react-native';
import {useM3Colors} from '../../theme/M3PaletteContext';
import AppText from '../../components/ui/Text';
import {MaterialIcons} from '@expo/vector-icons';
import {useNavigation} from '@react-navigation/native';
import {useAuthStore} from '../../lib/zustand/authStore';
import axios from 'axios';

const API = 'https://cinepix.top/api/app';

type ReportType = 'bug' | 'request_movie' | 'request_series';

const REPORT_TYPES: {value: ReportType; label: string; icon: string; color: string}[] = [
  {value: 'bug', label: 'Bug Report', icon: 'bug-report', color: '#EF4444'},
  {value: 'request_movie', label: 'Request Movie', icon: 'movie', color: '#F59E0B'},
  {value: 'request_series', label: 'Request Series', icon: 'tv', color: '#8B5CF6'},
];

export default function ReportScreen() {
  const colors = useM3Colors();
  const navigation = useNavigation();
  const {user, token} = useAuthStore();
  const [type, setType] = useState<ReportType>('bug');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [contentUrl, setContentUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim()) {
      ToastAndroid.show('Please enter a title', ToastAndroid.SHORT);
      return;
    }
    if (!description.trim()) {
      ToastAndroid.show('Please enter details', ToastAndroid.SHORT);
      return;
    }
    setSubmitting(true);
    try {
      await axios.post(`${API}/report`, {
        type,
        title: title.trim(),
        description: description.trim(),
        content_url: contentUrl.trim(),
        username: user?.username || 'anonymous',
      }, {timeout: 10000});
      ToastAndroid.show('Report submitted! Thank you.', ToastAndroid.SHORT);
      navigation.goBack();
    } catch (e: any) {
      ToastAndroid.show(e.response?.data?.error || 'Failed to submit', ToastAndroid.SHORT);
    }
    setSubmitting(false);
  };

  return (
    <View style={[styles.container, {backgroundColor: colors.background}]}>
      <View style={[styles.header, {borderColor: colors.outlineVariant}]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color={colors.onBackground} />
        </TouchableOpacity>
        <AppText role="titleLarge" style={{color: colors.onBackground, flex: 1, textAlign: 'center'}}>
          Report & Request
        </AppText>
        <View style={{width: 24}} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Type selector */}
        <AppText role="labelLarge" style={{color: colors.onBackground, marginBottom: 10}}>
          What is this about?
        </AppText>
        <View style={styles.typeRow}>
          {REPORT_TYPES.map(t => (
            <TouchableOpacity
              key={t.value}
              onPress={() => setType(t.value)}
              style={[styles.typeCard, {
                backgroundColor: type === t.value ? t.color + '20' : colors.surfaceContainer,
                borderColor: type === t.value ? t.color : colors.outlineVariant,
                borderWidth: type === t.value ? 2 : 1,
              }]}>
              <MaterialIcons name={t.icon as any} size={24} color={type === t.value ? t.color : colors.onSurfaceVariant} />
              <AppText role="labelSmall" style={{color: type === t.value ? t.color : colors.onSurfaceVariant, marginTop: 4, textAlign: 'center'}}>
                {t.label}
              </AppText>
            </TouchableOpacity>
          ))}
        </View>

        {/* Title */}
        <AppText role="labelLarge" style={{color: colors.onBackground, marginTop: 16, marginBottom: 6}}>
          {type === 'bug' ? 'Issue Title' : type === 'request_movie' ? 'Movie Name' : 'Series Name'}
        </AppText>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder={type === 'bug' ? 'e.g. Video not playing' : type === 'request_movie' ? 'e.g. Avengers: Endgame' : 'e.g. Breaking Bad'}
          placeholderTextColor={colors.onSurfaceVariant}
          style={[styles.input, {color: colors.onBackground, borderColor: colors.outlineVariant, backgroundColor: colors.surfaceContainer}]}
        />

        {/* Description */}
        <AppText role="labelLarge" style={{color: colors.onBackground, marginTop: 12, marginBottom: 6}}>
          {type === 'bug' ? 'Describe the issue' : 'Details (year, language, quality preference)'}
        </AppText>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder={type === 'bug' ? 'What happened? When? Which provider?' : 'Any additional info...'}
          placeholderTextColor={colors.onSurfaceVariant}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          style={[styles.input, styles.textArea, {color: colors.onBackground, borderColor: colors.outlineVariant, backgroundColor: colors.surfaceContainer}]}
        />

        {/* Content URL (optional) */}
        <AppText role="labelLarge" style={{color: colors.onBackground, marginTop: 12, marginBottom: 6}}>
          Link (optional)
        </AppText>
        <TextInput
          value={contentUrl}
          onChangeText={setContentUrl}
          placeholder="Paste link if available..."
          placeholderTextColor={colors.onSurfaceVariant}
          style={[styles.input, {color: colors.onBackground, borderColor: colors.outlineVariant, backgroundColor: colors.surfaceContainer}]}
        />

        {/* Submit */}
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={submitting}
          style={[styles.submitBtn, {backgroundColor: colors.primary}]}>
          {submitting ? (
            <ActivityIndicator size="small" color={colors.onPrimary} />
          ) : (
            <>
              <MaterialIcons name="send" size={18} color={colors.onPrimary} />
              <AppText role="labelLarge" style={{color: colors.onPrimary, marginLeft: 8}}>
                Submit {type === 'bug' ? 'Report' : 'Request'}
              </AppText>
            </>
          )}
        </TouchableOpacity>

        <AppText role="bodySmall" style={{color: colors.onSurfaceVariant, textAlign: 'center', marginTop: 12}}>
          You are submitting as: {user?.username || 'anonymous'}
        </AppText>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  header: {flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, borderBottomWidth: 1},
  content: {padding: 16},
  typeRow: {flexDirection: 'row', gap: 10},
  typeCard: {flex: 1, padding: 14, borderRadius: 12, alignItems: 'center'},
  input: {borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14},
  textArea: {minHeight: 100},
  submitBtn: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 14, borderRadius: 12, marginTop: 20},
});
