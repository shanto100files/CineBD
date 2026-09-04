import React from 'react';
import {View, ScrollView, StyleSheet} from 'react-native';
import {useM3Colors} from '../../theme/M3PaletteContext';
import AppText from '../../components/ui/Text';
import {MaterialIcons} from '@expo/vector-icons';
import {useNavigation} from '@react-navigation/native';
import {TouchableOpacity} from 'react-native';

export default function TermsOfService() {
  const colors = useM3Colors();
  const navigation = useNavigation();

  return (
    <View style={[styles.container, {backgroundColor: colors.background}]}>
      <View style={[styles.header, {borderColor: colors.outlineVariant}]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color={colors.onBackground} />
        </TouchableOpacity>
        <AppText role="titleLarge" style={{color: colors.onBackground, flex: 1, textAlign: 'center'}}>
          ব্যবহারবিধি
        </AppText>
        <View style={{width: 24}} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, {backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant}]}>
          <MaterialIcons name="info-outline" size={28} color={colors.primary} style={{marginBottom: 12}} />
          <AppText role="titleMedium" style={{color: colors.onBackground, marginBottom: 8}}>
            CineBD - Terms of Service
          </AppText>
          <AppText role="bodySmall" style={{color: colors.onSurfaceVariant, marginBottom: 16}}>
            Last updated: September 2026
          </AppText>

          <AppText role="titleSmall" style={{color: colors.primary, marginBottom: 6}}>
            1. সেবার বিবরণ
          </AppText>
          <AppText role="bodyMedium" style={styles.bodyText}>
            CineBD একটি মোবাইল অ্যাপ্লিকেশন যা বিভিন্ন সোর্স থেকে রিয়েল-টাইম কনটেন্ট সংগ্রহ করে এবং দেখায়। আমরা কোনো কনটেন্ট হোস্ট করি না। সমস্ত কনটেন্ট তৃতীয় পক্ষের সাইট থেকে আনা হয়।
          </AppText>

          <AppText role="titleSmall" style={{color: colors.primary, marginBottom: 6, marginTop: 16}}>
            2. ব্যবহারকারীর দায়িত্ব
          </AppText>
          <AppText role="bodyMedium" style={styles.bodyText}>
            অ্যাপ ব্যবহার করে আপনি মেনে নিচ্ছেন যে:
          </AppText>
          <AppText role="bodyMedium" style={styles.bodyText}>
            {'\u2022'} আপনি স্থানীয় আইন অনুযায়ী কনটেন্ট দেখবেন{'\n'}
            {'\u2022'} অ্যাপের মাধ্যমে অনৈতিক বা বেআইনি কাজ করবেন না{'\n'}
            {'\u2022'} সার্ভারে চাপ কমাতে একাধিক অ্যাকাউন্ট তৈরি করবেন না
          </AppText>

          <AppText role="titleSmall" style={{color: colors.primary, marginBottom: 6, marginTop: 16}}>
            3. কনটেন্ট
          </AppText>
          <AppText role="bodyMedium" style={styles.bodyText}>
            অ্যাপে প্রদর্শিত সমস্ত কনটেন্ট তৃতীয় পক্ষের সার্ভার থেকে রিয়েল-টাইমে লোড হয়। প্রতিটি সোর্সের কনটেন্ট আলাদাভাবে কাজ করতে পারে। কনটেন্টের মান, উপলব্ধতা এবং সমস্যার জন্য আমরা দায়ী নই।
          </AppText>

          <AppText role="titleSmall" style={{color: colors.primary, marginBottom: 6, marginTop: 16}}>
            4. রিপোর্ট ও অনুরোধ
          </AppText>
          <AppText role="bodyMedium" style={styles.bodyText}>
            কোনো সমস্যা হলে Settings থেকে Bug Report বা Request Movie/Series ফিচার ব্যবহার করুন। আমরা সম্ভব দ্রুত সমাধান করার চেষ্টা করব।
          </AppText>

          <AppText role="titleSmall" style={{color: colors.primary, marginBottom: 6, marginTop: 16}}>
            5. পরিবর্তন
          </AppText>
          <AppText role="bodyMedium" style={styles.bodyText}>
            আমরা যেকোনো সময় এই শর্তাবলী পরিবর্তন করতে পারি। অ্যাপ ব্যবহার চালিয়ে গেলে আপনি নতুন শর্তাবলী মেনে নিচ্ছেন বলে বিবেচিত হবে।
          </AppText>

          <View style={[styles.disclaimer, {backgroundColor: colors.errorContainer, borderColor: colors.error}]}>
            <MaterialIcons name="warning-amber" size={18} color={colors.error} />
            <AppText role="bodySmall" style={{color: colors.onErrorContainer, marginLeft: 8, flex: 1}}>
              এই অ্যাপ শুধুমাত্র ব্যক্তিগত ব্যবহারের জন্য। বেআইনি উদ্দেশ্যে ব্যবহার করা নিষেধ।
            </AppText>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  header: {flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, borderBottomWidth: 1},
  content: {padding: 16},
  card: {padding: 20, borderRadius: 16, borderWidth: 1},
  bodyText: {color: '#ccc', lineHeight: 22, marginBottom: 4},
  disclaimer: {flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 10, marginTop: 20, borderWidth: 1},
});
