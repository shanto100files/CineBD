import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {
  Host,
  RNHostView,
  Shape,
  Text,
  TextField,
  type TextFieldRef,
  useNativeState,
} from '@expo/ui/jetpack-compose';
import {fillMaxWidth} from '@expo/ui/jetpack-compose/modifiers';
import React, {forwardRef, useEffect, useImperativeHandle, useRef} from 'react';
import {Platform, Pressable, TextInput, View} from 'react-native';
import {useM3Colors, useM3HostTheme} from '../../theme/M3PaletteContext';

interface SearchFieldProps {
  value: string;
  onChangeText: (value: string) => void;
  onSubmit: (value: string) => void;
  onFocusChange?: (focused: boolean) => void;
  placeholder?: string;
}

export interface SearchFieldRef {
  focus: () => void;
}

/**
 * Two implementations, chosen at module level (never conditional hooks):
 *  - TV: plain RN TextInput. The Compose Host participates poorly (if at all)
 *    in Android TV D-pad focus traversal, so TV gets a focusable RN field
 *    with its own focus ring.
 *  - Mobile: @expo/ui Jetpack Compose TextField (rich M3 styling).
 */

const TvSearchField = forwardRef<SearchFieldRef, SearchFieldProps>(
  (
    {value, onChangeText, onSubmit, onFocusChange, placeholder = 'Search'},
    ref,
  ) => {
    const colors = useM3Colors();
    const inputRef = useRef<TextInput>(null);
    const [fieldFocused, setFieldFocused] = React.useState(false);
    const [shellFocused, setShellFocused] = React.useState(false);

    useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus(),
    }));

    return (
      <Pressable
        focusable
        onPress={() => inputRef.current?.focus()}
        onFocus={() => setShellFocused(true)}
        onBlur={() => setShellFocused(false)}
        style={{
          borderRadius: 24,
          borderWidth: shellFocused ? 3 : 0,
          borderColor: colors.primary,
          backgroundColor: fieldFocused
            ? colors.surfaceContainerHigh
            : colors.surfaceContainerLow,
          paddingHorizontal: 16,
          paddingVertical: 10,
        }}>
        <View style={{flexDirection: 'row', alignItems: 'center'}}>
          <MaterialCommunityIcons
            name="magnify"
            size={22}
            color={shellFocused ? colors.primary : colors.onSurfaceVariant}
          />
          <TextInput
            ref={inputRef}
            value={value}
            onChangeText={onChangeText}
            onSubmitEditing={() => onSubmit(value)}
            onFocus={() => {
              setFieldFocused(true);
              onFocusChange?.(true);
            }}
            onBlur={() => {
              setFieldFocused(false);
              onFocusChange?.(false);
            }}
            placeholder={placeholder}
            placeholderTextColor={colors.onSurfaceVariant}
            style={{
              flex: 1,
              marginLeft: 10,
              color: colors.onSurface,
              fontSize: 16,
              padding: 0,
            }}
          />
        </View>
      </Pressable>
    );
  },
);

const ComposeSearchField = forwardRef<SearchFieldRef, SearchFieldProps>(
  (
    {value, onChangeText, onSubmit, onFocusChange, placeholder = 'Search'},
    ref,
  ) => {
    const colors = useM3Colors();
    const hostTheme = useM3HostTheme();
    const nativeValue = useNativeState(value);
    const fieldRef = useRef<TextFieldRef>(null);

    useImperativeHandle(ref, () => ({
      focus: () => fieldRef.current?.focus(),
    }));

    useEffect(() => {
      fieldRef.current?.setText(value);
    }, [value]);

    return (
      <Host
        style={{width: '100%'}}
        matchContents={{vertical: true}}
        {...hostTheme}>
        <TextField
          ref={fieldRef}
          value={nativeValue}
          singleLine
          onValueChange={onChangeText}
          onFocusChanged={onFocusChange}
          keyboardOptions={{
            autoCorrectEnabled: false,
            capitalization: 'none',
            imeAction: 'search',
          }}
          keyboardActions={{onSearch: onSubmit}}
          shape={Shape.Pill({})}
          textStyle={{fontSize: 16}}
          colors={{
            focusedContainerColor: colors.surfaceContainerHigh,
            unfocusedContainerColor: colors.surfaceContainerLow,
            focusedTextColor: colors.onSurface,
            unfocusedTextColor: colors.onSurface,
            cursorColor: colors.primary,
            focusedIndicatorColor: 'transparent',
            unfocusedIndicatorColor: 'transparent',
            focusedLeadingIconColor: colors.primary,
            unfocusedLeadingIconColor: colors.onSurfaceVariant,
            focusedPlaceholderColor: colors.onSurfaceVariant,
            unfocusedPlaceholderColor: colors.onSurfaceVariant,
          }}
          modifiers={[fillMaxWidth()]}>
          <TextField.Placeholder>
            <Text color={colors.onSurfaceVariant}>{placeholder}</Text>
          </TextField.Placeholder>
          <TextField.LeadingIcon>
            <RNHostView matchContents>
              <View style={{height: 24, width: 24}}>
                <MaterialCommunityIcons
                  name="magnify"
                  size={24}
                  color={colors.onSurfaceVariant}
                />
              </View>
            </RNHostView>
          </TextField.LeadingIcon>
        </TextField>
      </Host>
    );
  },
);

const SearchField = Platform.isTV ? TvSearchField : ComposeSearchField;

export default SearchField;
