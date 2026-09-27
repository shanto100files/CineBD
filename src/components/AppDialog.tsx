import {MaterialCommunityIcons} from '@expo/vector-icons';
import React from 'react';
import {
  Modal,
  ScrollView,
  TouchableOpacity,
  View,
} from 'react-native';
import Markdown from 'react-native-markdown-display';
import {useM3Colors} from '../theme/M3PaletteContext';
import AppText from './ui/Text';

export type AppDialogVariant = 'info' | 'success' | 'warning' | 'error';

export interface AppDialogAction {
  label: string;
  onPress?: () => void;
  variant?: 'default' | 'primary' | 'destructive';
  testID?: string;
  disabled?: boolean;
  dismissOnPress?: boolean;
}

interface AppDialogProps {
  visible: boolean;
  title: string;
  message: string;
  messageFormat?: 'plain' | 'markdown';
  primary: string;
  variant?: AppDialogVariant;
  actions?: AppDialogAction[];
  onDismiss: () => void;
}

const variantStyles: Record<
  AppDialogVariant,
  {
    icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
    colorRole: 'primary' | 'tertiary' | 'secondary' | 'error';
  }
> = {
  info: {icon: 'information-outline', colorRole: 'primary'},
  success: {icon: 'check-circle-outline', colorRole: 'tertiary'},
  warning: {icon: 'alert-outline', colorRole: 'secondary'},
  error: {icon: 'alert-circle-outline', colorRole: 'error'},
};

const AppDialog = ({
  visible,
  title,
  message,
  messageFormat = 'plain',
  variant = 'info',
  actions = [{label: 'OK', variant: 'primary'}],
  onDismiss,
}: AppDialogProps) => {
  const appearance = variantStyles[variant];
  const colors = useM3Colors();
  const iconColor = colors[appearance.colorRole];
  const confirmAction = actions[actions.length - 1];
  const dismissAction = actions.length > 1 ? actions[0] : undefined;

  const handleAction = (action: AppDialogAction) => {
    action.onPress?.();
    if (action.dismissOnPress !== false) {
      onDismiss();
    }
  };

  const renderButton = (action: AppDialogAction) => {
    const isConfirm = action === confirmAction;
    const contentColor =
      action.variant === 'destructive'
        ? colors.error
        : isConfirm
          ? colors.primary
          : colors.onSurfaceVariant;
    return (
      <TouchableOpacity
        key={action.label}
        testID={action.testID}
        activeOpacity={0.7}
        disabled={action.disabled}
        onPress={() => handleAction(action)}
        style={{
          alignItems: 'center',
          borderRadius: 20,
          justifyContent: 'center',
          minWidth: 64,
          opacity: action.disabled ? 0.4 : 1,
          paddingHorizontal: 14,
          paddingVertical: 10,
        }}>
        <AppText
          role="labelLargeEmphasized"
          style={{color: contentColor, textAlign: 'center'}}>
          {action.label}
        </AppText>
      </TouchableOpacity>
    );
  };

  if (!visible) {
    return null;
  }

  return (
    <Modal
      transparent
      visible
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onDismiss}>
      <View
        style={{
          alignItems: 'center',
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          flex: 1,
          justifyContent: 'center',
          padding: 24,
        }}>
        <TouchableOpacity
          activeOpacity={1}
          onPress={onDismiss}
          style={{bottom: 0, left: 0, position: 'absolute', right: 0, top: 0}}
        />
        <View
          style={{
            backgroundColor: colors.surfaceContainerHigh,
            borderRadius: 28,
            elevation: 8,
            maxWidth: 400,
            paddingHorizontal: 24,
            paddingTop: 24,
            width: '100%'}}>
          <View style={{alignItems: 'center', flexDirection: 'row', marginBottom: 12}}>
            <MaterialCommunityIcons
              name={appearance.icon}
              size={28}
              color={iconColor}
            />
            <AppText
              role="titleLargeEmphasized"
              style={{
                color: colors.onSurface,
                flex: 1,
                marginLeft: 16,
                textAlign: 'left',
              }}>
              {title}
            </AppText>
          </View>
          <ScrollView
            nestedScrollEnabled
            style={{maxHeight: 360}}
            contentContainerStyle={{paddingBottom: 4}}>
            {messageFormat === 'markdown' ? (
              <Markdown
                style={{
                  body: {color: colors.onSurfaceVariant, fontSize: 14},
                  bullet_list: {marginVertical: 4},
                  code_inline: {
                    backgroundColor: colors.surfaceContainerHighest,
                    color: colors.onSurface,
                  },
                  fence: {
                    backgroundColor: colors.surfaceContainerHighest,
                    borderColor: colors.outlineVariant,
                    color: colors.onSurface,
                  },
                  heading1: {
                    color: colors.onSurface,
                    fontSize: 20,
                    marginVertical: 8,
                  },
                  heading2: {
                    color: colors.onSurface,
                    fontSize: 18,
                    marginVertical: 7,
                  },
                  heading3: {
                    color: colors.onSurface,
                    fontSize: 16,
                    marginVertical: 6,
                  },
                  link: {color: colors.primary},
                  ordered_list: {marginBottom: 4, marginTop: 4},
                  paragraph: {marginBottom: 6, marginTop: 0},
                }}>
                {message}
              </Markdown>
            ) : (
              <AppText role="bodyMedium" style={{color: colors.onSurfaceVariant}}>
                {message}
              </AppText>
            )}
          </ScrollView>
          <View
            style={{
              alignItems: 'center',
              flexDirection: 'row',
              gap: 4,
              justifyContent: 'flex-end',
              paddingBottom: 16,
              paddingTop: 12,
            }}>
            {dismissAction ? renderButton(dismissAction) : null}
            {confirmAction ? renderButton(confirmAction) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default AppDialog;
