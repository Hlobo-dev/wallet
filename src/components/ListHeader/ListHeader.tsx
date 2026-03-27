import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import { StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { Button } from '@/components/Button';
import { Label } from '@/components/Label';

interface ListHeaderProps {
  title: string;
  style?: StyleProp<ViewStyle>;
  buttonText?: string;
  onButtonPress?: () => void;
  buttonTestID?: string;
  disabled?: boolean;
  /** Optional custom element to render on the right side (replaces the button) */
  rightElement?: ReactNode;
}

export const ListHeader = ({ title, buttonText, onButtonPress, style, buttonTestID, disabled, rightElement }: ListHeaderProps) => {
  return (
    <Animated.View style={[style, styles.wrapper]} entering={FadeIn} exiting={FadeOut} testID={buttonTestID}>
      <Label type="boldDisplay4">{title}</Label>
      {rightElement
        ? rightElement
        : buttonText && onButtonPress && <Button text={buttonText} onPress={onButtonPress} testID={buttonTestID} disabled={disabled} />}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
