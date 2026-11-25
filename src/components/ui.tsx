import { Ionicons } from '@expo/vector-icons';
import { createContext, useContext, type ComponentProps, type ReactNode } from 'react';
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

import { Colors, FeatureColors, Radius, Shadow, Spacing, type Feature, type Palette } from '@/constants/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function useColors(): Palette {
  return Colors[useColorScheme() === 'dark' ? 'dark' : 'light'];
}

// The feature colour of the current screen; buttons, chips and switches pick it up.
const FeatureCtx = createContext<Feature>('home');
export function useFeature() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  return FeatureColors[scheme][useContext(FeatureCtx)];
}
export function useFeatureColors(feature: Feature) {
  return FeatureColors[useColorScheme() === 'dark' ? 'dark' : 'light'][feature];
}

type TxtVariant = 'body' | 'title' | 'heading' | 'label' | 'small' | 'muted' | 'error';
export function Txt({ variant = 'body', style, ...rest }: TextProps & { variant?: TxtVariant }) {
  const c = useColors();
  const color =
    variant === 'muted' || variant === 'small' || variant === 'label' ? c.textSecondary : variant === 'error' ? c.danger : c.text;
  return <Text style={[{ color }, txt[variant], style]} {...rest} />;
}

const txt = StyleSheet.create({
  body: { fontSize: 16, lineHeight: 23 },
  title: { fontSize: 30, lineHeight: 36, fontWeight: '700', letterSpacing: -0.5 },
  heading: { fontSize: 17, lineHeight: 23, fontWeight: '600' },
  label: { fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' },
  small: { fontSize: 13, lineHeight: 18 },
  muted: { fontSize: 15, lineHeight: 21 },
  error: { fontSize: 14, lineHeight: 20 },
});

/**
 * Screen container. `feature` sets the colour of everything inside.
 * contentInsetAdjustmentBehavior keeps content clear of translucent iOS
 * headers (otherwise the first field can end up under the header in modals).
 */
export function Screen({
  children,
  feature = 'home',
  scroll = true,
  edges = ['top'],
}: {
  children: ReactNode;
  feature?: Feature;
  scroll?: boolean;
  edges?: ('top' | 'bottom')[];
}) {
  const c = useColors();
  return (
    <FeatureCtx.Provider value={feature}>
      <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={edges}>
        {scroll ? (
          <ScrollView
            contentContainerStyle={styles.screen}
            keyboardShouldPersistTaps="handled"
            contentInsetAdjustmentBehavior="automatic"
            automaticallyAdjustKeyboardInsets>
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.screen, { flex: 1 }]}>{children}</View>
        )}
      </SafeAreaView>
    </FeatureCtx.Provider>
  );
}

/** Coloured header at the top of each tab: icon, title, subtitle and a slot on the right. */
export function FeatureHeader({
  icon,
  title,
  subtitle,
  right,
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  const f = useFeature();
  return (
    <View style={[styles.header, { backgroundColor: f.bg }]}>
      <View style={[styles.headerIcon, { backgroundColor: f.fg }]}>
        <Ionicons name={icon} size={22} color={f.onFg} />
      </View>
      <View style={{ flex: 1 }}>
        <Txt variant="title" style={{ fontSize: 25, lineHeight: 30 }} role="heading" numberOfLines={1}>
          {title}
        </Txt>
        {subtitle ? (
          <Txt variant="small" numberOfLines={1}>
            {subtitle}
          </Txt>
        ) : null}
      </View>
      {right}
    </View>
  );
}

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const f = useFeature();
  return (
    <View style={[styles.row, { justifyContent: 'space-between', marginTop: Spacing.sm }]}>
      <Txt variant="label">{title}</Txt>
      {action && onAction ? (
        <Pressable role="button" aria-label={action} onPress={onAction} hitSlop={8}>
          <Text style={{ color: f.fg, fontWeight: '600', fontSize: 14 }}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Card({
  children,
  style,
  tint,
  onPress,
  label,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  tint?: string;
  onPress?: () => void;
  label?: string;
}) {
  const c = useColors();
  const base = [styles.card, Shadow, { backgroundColor: tint ?? c.card }, style];
  if (!onPress) return <View style={base}>{children}</View>;
  return (
    <Pressable role="button" aria-label={label} onPress={onPress} style={({ pressed }) => [base, pressed && { opacity: 0.85 }]}>
      {children}
    </Pressable>
  );
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
  icon?: IconName;
  small?: boolean;
}) {
  const c = useColors();
  const f = useFeature();
  const bg = variant === 'primary' ? f.fg : variant === 'danger' ? c.dangerBg : variant === 'secondary' ? f.bg : 'transparent';
  const fg = variant === 'primary' ? f.onFg : variant === 'danger' ? c.danger : f.fg;
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
        { backgroundColor: bg, opacity: off ? 0.45 : pressed ? 0.8 : 1 },
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
  size = 22,
}: {
  icon: IconName;
  onPress: () => void;
  label: string;
  color?: string;
  size?: number;
}) {
  const c = useColors();
  return (
    <Pressable role="button" aria-label={label} hitSlop={10} onPress={onPress}>
      <Ionicons name={icon} size={size} color={color ?? c.textSecondary} />
    </Pressable>
  );
}

/** Round "+" button used in headers. */
export function AddButton({ label, onPress }: { label: string; onPress: () => void }) {
  const f = useFeature();
  return (
    <Pressable
      role="button"
      aria-label={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.addButton, { backgroundColor: f.fg, opacity: pressed ? 0.8 : 1 }]}>
      <Ionicons name="add" size={24} color={f.onFg} />
    </Pressable>
  );
}

export function Input(props: TextInputProps & { label?: string; containerStyle?: StyleProp<ViewStyle> }) {
  const c = useColors();
  const { label, style, containerStyle, ...rest } = props;
  return (
    <View style={[{ gap: 6 }, containerStyle]}>
      {label ? <Txt variant="small">{label}</Txt> : null}
      <TextInput
        placeholderTextColor={c.textSecondary}
        autoCorrect={false}
        aria-label={label ?? rest.placeholder}
        {...rest}
        style={[styles.input, { color: c.text, backgroundColor: c.field }, style]}
      />
    </View>
  );
}

export function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const f = useFeature();
  return (
    <View style={[styles.row, { justifyContent: 'space-between' }]}>
      <Txt style={{ flex: 1 }}>{label}</Txt>
      <Switch
        value={value}
        onValueChange={onChange}
        aria-label={label}
        trackColor={{ true: f.fg }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const c = useColors();
  const f = useFeature();
  return (
    <Pressable
      role="button"
      aria-label={label}
      aria-selected={selected}
      onPress={onPress}
      style={[styles.chip, { backgroundColor: selected ? f.fg : c.field }]}>
      <Text style={{ color: selected ? f.onFg : c.text, fontWeight: selected ? '600' : '500' }}>{label}</Text>
    </Pressable>
  );
}

export function Empty({ text, icon }: { text: string; icon?: IconName }) {
  const f = useFeature();
  return (
    <View style={{ paddingVertical: Spacing.xxl, alignItems: 'center', gap: Spacing.md }}>
      {icon ? (
        <View style={[styles.emptyIcon, { backgroundColor: f.bg }]}>
          <Ionicons name={icon} size={28} color={f.fg} />
        </View>
      ) : null}
      <Txt variant="muted" style={{ textAlign: 'center' }}>
        {text}
      </Txt>
    </View>
  );
}

export function Loading() {
  const f = useFeature();
  return (
    <View style={{ padding: Spacing.xxl }}>
      <ActivityIndicator color={f.fg} />
    </View>
  );
}

export function ErrorText({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <Txt variant="error" role="alert">
      {message}
    </Txt>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

export const styles = StyleSheet.create({
  screen: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, gap: Spacing.lg, paddingBottom: 64 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
  },
  headerIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: Radius.md, padding: 18, gap: Spacing.sm },
  button: {
    borderRadius: Radius.pill,
    paddingVertical: 13,
    paddingHorizontal: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSmall: { paddingVertical: 7, paddingHorizontal: 14 },
  addButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  input: { borderRadius: Radius.sm, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  chip: { borderRadius: Radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
  emptyIcon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
