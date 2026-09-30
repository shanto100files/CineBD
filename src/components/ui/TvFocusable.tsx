import React, {useState} from 'react';
import {Platform, Pressable, StyleProp, ViewStyle} from 'react-native';
import {useM3Colors} from '../../theme/M3PaletteContext';

type TvFocusableStyle =
  | ((state: {pressed: boolean}) => StyleProp<ViewStyle>)
  | StyleProp<ViewStyle>;

interface TvFocusableProps {
  children: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  style?: TvFocusableStyle;
  /** Override the D-pad focus-ring color (default: M3 primary). */
  tvBorderColor?: string;
  [key: string]: any;
}

// Android TV: Pressable is NOT focusable by default — this wrapper opts in
// explicitly and paints a D-pad focus ring via onFocus/onBlur (transparent
// when blurred, pressed also lights the ring so OK-press feedback exists).
// On touch devices it renders a plain Pressable with zero visual change.
const TvFocusable = ({
  children,
  onPress,
  onLongPress,
  style,
  tvBorderColor,
  ...rest
}: TvFocusableProps) => {
  const isTv = Platform.isTV;
  const colors = useM3Colors();
  const [tvFocused, setTvFocused] = useState(false);
  const ringOn = isTv && tvFocused;
  const ringColor = tvBorderColor ?? colors.primary;
  return (
    <Pressable
      focusable={isTv}
      onPress={onPress}
      onLongPress={onLongPress}
      onFocus={isTv ? () => setTvFocused(true) : undefined}
      onBlur={isTv ? () => setTvFocused(false) : undefined}
      style={({pressed}) => {
        const base = typeof style === 'function' ? style({pressed}) : style;
        return [
          base,
          ringOn || (isTv && pressed)
            ? {borderWidth: 2, borderColor: ringColor}
            : null,
        ];
      }}
      {...rest}>
      {children}
    </Pressable>
  );
};

export default TvFocusable;
