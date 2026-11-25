import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  useColorScheme,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Radius, Spacing, type Palette } from '@/constants/theme';

export function useColors(): Palette {
  return Colors[useColorScheme() === 'dark' ? 'dark' : 'light'];
}

type TxtVariant = 'body' | 'title' | 'heading' | 'small' | 'muted' | 'error';
export function Txt({ variant = 'body', style, ...rest }: TextProps & { variant?: TxtVariant }) {
  const c = useColors();
  const color = variant === 'muted' || variant === 'small' ? c.textSecondary : variant === 'error' ? c.danger : c.text;
  return <Text style={[{ color }, txt[variant], style]} {...rest} />;
}

const txt = StyleSheet.create({
  body: { fontSize: 16, lineHeight: 22 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '600' },
  small: { fontSize: 13, lineHeight: 18 },
  muted: { fontSize: 15, lineHeight: 20 },
  error: { fontSize: 14, lineHeight: 20 },
});

export function Screen({
  children,
  scroll = true,
  edges = ['top'],
}: {
  children: ReactNode;
  scroll?: boolean;
  edges?: ('top' | 'bottom')[];
}) {
  const c = useColors();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={edges}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.screen, { flex: 1 }]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }, style]}>{children}</View>;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  icon,
  small,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  icon?: ComponentProps<typeof Ionicons>['name'];
  small?: boolean;
}) {
  const c = useColors();
  const bg = variant === 'primary' ? c.primary : variant === 'danger' ? c.danger : variant === 'secondary' ? c.accent : 'transparent';
  const fg = variant === 'primary' ? c.primaryText : variant === 'danger' ? c.card : c.primary;
  const off = disabled || loading;
  return (
    <Pressable
      role="button"
      aria-label={title}
      aria-disabled={off}
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: bg, opacity: off ? 0.5 : pressed ? 0.8 : 1 },
      ]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.row}>
          {icon ? <Ionicons name={icon} size={small ? 16 : 18} color={fg} /> : null}
          <Text style={{ color: fg, fontWeight: '600', fontSize: small ? 14 : 16 }}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function IconButton({
  icon,
  onPress,
  label,
  color,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  label: string;
  color?: string;
}) {
  const c = useColors();
  return (
    <Pressable role="button" aria-label={label} hitSlop={10} onPress={onPress}>
      <Ionicons name={icon} size={22} color={color ?? c.textSecondary} />
    </Pressable>
  );
}

export function Input(props: TextInputProps & { label?: string; containerStyle?: StyleProp<ViewStyle> }) {
  const c = useColors();
  const { label, style, containerStyle, ...rest } = props;
  return (
    <View style={[{ gap: Spacing.xs }, containerStyle]}>
      {label ? <Txt variant="small">{label}</Txt> : null}
      <TextInput
        placeholderTextColor={c.textSecondary}
        autoCorrect={false}
        aria-label={label ?? rest.placeholder}
        {...rest}
        style={[styles.input, { color: c.text, backgroundColor: c.card, borderColor: c.border }, style]}
      />
    </View>
  );
}

export function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={[styles.row, { justifyContent: 'space-between' }]}>
      <Txt>{label}</Txt>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} />
    </View>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, { borderColor: selected ? c.primary : c.border, backgroundColor: selected ? c.accent : c.card }]}>
      <Text style={{ color: selected ? c.primary : c.text, fontWeight: selected ? '600' : '400' }}>{label}</Text>
    </Pressable>
  );
}

export function Empty({ text }: { text: string }) {
  return (
    <View style={{ paddingVertical: Spacing.xxl, alignItems: 'center' }}>
      <Txt variant="muted">{text}</Txt>
    </View>
  );
}

export function Loading() {
  const c = useColors();
  return (
    <View style={{ padding: Spacing.xxl }}>
      <ActivityIndicator color={c.primary} />
    </View>
  );
}

export function ErrorText({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <Txt variant="error" accessibilityRole="alert">
      {message}
    </Txt>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

export const styles = StyleSheet.create({
  screen: { padding: Spacing.lg, gap: Spacing.lg, paddingBottom: Spacing.xxl * 2 },
  card: { borderRadius: Radius.md, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.lg, gap: Spacing.sm },
  button: { borderRadius: Radius.md, paddingVertical: 12, paddingHorizontal: Spacing.lg, alignItems: 'center', justifyContent: 'center' },
  buttonSmall: { paddingVertical: 6, paddingHorizontal: Spacing.md },
  input: { borderWidth: 1, borderRadius: Radius.sm, paddingHorizontal: Spacing.md, paddingVertical: 10, fontSize: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: Spacing.md, paddingVertical: 6 },
});
