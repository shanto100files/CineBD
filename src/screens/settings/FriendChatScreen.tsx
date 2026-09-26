import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  ToastAndroid,
  TouchableOpacity,
  View,
} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {SettingsStackParamList} from '../../App';
import AppText from '../../components/ui/Text';
import {useM3Colors} from '../../theme/M3PaletteContext';
import {friendsService, ChatMessage} from '../../lib/services/friendsService';

type Props = NativeStackScreenProps<SettingsStackParamList, 'FriendChat'>;

const timeShort = (dateStr: string) => {
  const d = new Date(dateStr.replace(' ', 'T') + 'Z');
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  return `${d.getDate()}/${d.getMonth() + 1} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const FriendChatScreen = ({navigation, route}: Props) => {
  const colors = useM3Colors();
  const {userId, username} = route.params;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<{
    scrollToEnd?: (options?: {animated?: boolean}) => void;
  }>(null);

  const load = useCallback(async () => {
    try {
      const items = await friendsService.messages(userId);
      setMessages(items);
    } catch {
      ToastAndroid.show('মেসেজ লোড করা যায়নি', ToastAndroid.SHORT);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  // Light polling keeps the conversation fresh while the chat is open.
  useEffect(() => {
    const t = setInterval(() => {
      friendsService.messages(userId).then(setMessages).catch(() => {});
    }, 8000);
    return () => clearInterval(t);
  }, [userId]);

  const send = async () => {
    const msg = text.trim();
    if (!msg || sending) return;
    setSending(true);
    try {
      await friendsService.sendMessage(userId, msg);
      setText('');
      await load();
      setTimeout(() => listRef.current?.scrollToEnd?.({animated: true}), 150);
    } catch (e: any) {
      ToastAndroid.show(e.response?.data?.error || 'পাঠানো যায়নি', ToastAndroid.SHORT);
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
      style={{backgroundColor: colors.background, flex: 1}}>
      {/* Header */}
      <View
        style={{
          alignItems: 'center',
          backgroundColor: colors.surfaceContainerLow,
          flexDirection: 'row',
          gap: 10,
          paddingHorizontal: 8,
          paddingVertical: 8,
        }}>
        <TouchableOpacity onPress={navigation.goBack} style={{padding: 8}}>
          <MaterialCommunityIcons name="arrow-left" size={26} color={colors.onBackground} />
        </TouchableOpacity>
        <View
          style={{
            alignItems: 'center',
            backgroundColor: colors.primaryContainer,
            borderRadius: 20,
            height: 40,
            justifyContent: 'center',
            width: 40,
          }}>
          <AppText role="titleSmallEmphasized" style={{color: colors.onPrimaryContainer}}>
            {username.slice(0, 1).toUpperCase()}
          </AppText>
        </View>
        <TouchableOpacity
          onPress={() => navigation.navigate('FriendProfile', {userId, username})}
          style={{flex: 1}}>
          <AppText role="titleMediumEmphasized" style={{color: colors.onBackground}} numberOfLines={1}>
            {username}
          </AppText>
          <AppText role="labelSmallEmphasized" style={{color: colors.primary}}>
            বন্ধু • ট্যাপ করে প্রোফাইল দেখুন
          </AppText>
        </TouchableOpacity>
      </View>

      {/* Messages */}
      <View style={{flex: 1}}>
        {loading ? (
          <ActivityIndicator style={{marginTop: 30}} color={colors.primary} />
        ) : messages.length === 0 ? (
          <View style={{alignItems: 'center', flex: 1, justifyContent: 'center', padding: 30}}>
            <MaterialCommunityIcons name="message-text-outline" size={52} color={colors.onSurfaceVariant} />
            <AppText
              role="bodyMedium"
              style={{color: colors.onSurfaceVariant, marginTop: 10, textAlign: 'center'}}>
              কোনো মেসেজ নেই। কথা শুরু করুন!
            </AppText>
          </View>
        ) : (
          <FlatListOfMessages
            ref={listRef}
            data={messages}
            keyExtractor={m => String(m.id)}
            onLayout={() => listRef.current?.scrollToEnd?.({animated: false})}
            renderItem={({item}) => (
              <View
                style={{
                  alignItems: item.mine ? 'flex-end' : 'flex-start',
                  paddingHorizontal: 12,
                  paddingVertical: 3,
                }}>
                <View
                  style={{
                    backgroundColor: item.mine ? colors.primary : colors.surfaceContainerHigh,
                    borderRadius: 16,
                    borderBottomRightRadius: item.mine ? 4 : 16,
                    borderBottomLeftRadius: item.mine ? 16 : 4,
                    maxWidth: '78%',
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                  }}>
                  <AppText
                    role="bodyMedium"
                    style={{color: item.mine ? colors.onPrimary : colors.onSurface}}>
                    {item.message}
                  </AppText>
                  <AppText
                    role="labelSmallEmphasized"
                    style={{
                      color: item.mine ? colors.onPrimary + '99' : colors.onSurfaceVariant,
                      alignSelf: 'flex-end',
                      fontSize: 10,
                      marginTop: 2,
                    }}>
                    {timeShort(item.created_at)}
                    {item.mine && item.is_read ? ' ✓✓' : ''}
                  </AppText>
                </View>
              </View>
            )}
          />
        )}
      </View>

      {/* Composer */}
      <View
        style={{
          alignItems: 'flex-end',
          backgroundColor: colors.surfaceContainerLow,
          flexDirection: 'row',
          gap: 8,
          paddingHorizontal: 10,
          paddingVertical: 8,
        }}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="মেসেজ লিখুন..."
          placeholderTextColor={colors.onSurfaceVariant}
          multiline
          maxLength={1000}
          style={{
            backgroundColor: colors.surfaceContainerHigh,
            borderRadius: 20,
            color: colors.onBackground,
            flex: 1,
            fontSize: 15,
            maxHeight: 100,
            paddingHorizontal: 14,
            paddingVertical: 9,
          }}
        />
        <TouchableOpacity
          disabled={!text.trim() || sending}
          onPress={send}
          style={{
            alignItems: 'center',
            backgroundColor: text.trim() ? colors.primary : colors.surfaceContainerHigh,
            borderRadius: 22,
            height: 42,
            justifyContent: 'center',
            marginBottom: 1,
            width: 42,
          }}>
          {sending ? (
            <ActivityIndicator size="small" color={colors.onPrimary} />
          ) : (
            <MaterialCommunityIcons
              name="send"
              size={20}
              color={text.trim() ? colors.onPrimary : colors.onSurfaceVariant}
            />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

// Minimal typed wrapper so the ref has scrollToEnd available.
interface FlatListOfMessagesProps {
  data: ChatMessage[];
  keyExtractor: (item: ChatMessage) => string;
  renderItem: (info: {item: ChatMessage}) => React.JSX.Element;
  onLayout?: () => void;
}
type FlatListOfMessages = React.Component<FlatListOfMessagesProps & {ref?: any}>;
const FlatListOfMessages = require('react-native').FlatList as React.ComponentType<
  FlatListOfMessagesProps & {ref?: any}
>;

export default FriendChatScreen;
