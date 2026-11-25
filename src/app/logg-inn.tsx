import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform } from 'react-native';

import { Button, Card, ErrorText, Input, Screen, Txt } from '@/components/ui';
import { t } from '@/i18n';
import { userMessage } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { schemas } from '@/lib/validation';

/**
 * Passwordless sign-in with a one-time *code* (not a magic link): nothing
 * secret ever travels through a URL / deep link that another app could
 * intercept. Codes are 8 digits, expire after 15 min and are rate limited by
 * Supabase Auth (+ CAPTCHA on hosted projects).
 */
export default function SignIn() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode() {
    setError(null);
    const parsed = schemas.email.safeParse(email.trim().toLowerCase());
    if (!parsed.success) return setError(t.auth.invalidEmail);
    setBusy(true);
    const { error: e } = await supabase.auth.signInWithOtp({
      email: parsed.data,
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    // Same UI either way: do not reveal whether an account exists.
    if (e && e.status === 429) return setError(t.errors.tooMany);
    if (e && e.status && e.status >= 500) return setError(userMessage(e));
    setStep('code');
  }

  async function verify() {
    setError(null);
    const parsed = schemas.otp.safeParse(code.trim());
    if (!parsed.success) return setError(t.auth.invalidCode);
    setBusy(true);
    const { error: e } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: parsed.data,
      type: 'email',
    });
    setBusy(false);
    if (e) setError(e.status === 429 ? t.errors.tooMany : t.auth.invalidCode);
    // on success AuthProvider receives SIGNED_IN and the router moves on
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen edges={['top', 'bottom']}>
        <Txt variant="title" style={{ marginTop: 48 }}>
          {t.auth.title}
        </Txt>
        <Txt variant="muted">{t.auth.subtitle}</Txt>

        <Card>
          {step === 'email' ? (
            <>
              <Input
                label={t.auth.email}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                textContentType="emailAddress"
                maxLength={254}
                onSubmitEditing={sendCode}
              />
              <ErrorText message={error} />
              <Button title={t.auth.sendCode} onPress={sendCode} loading={busy} />
            </>
          ) : (
            <>
              <Txt>{t.auth.codeSent(email.trim())}</Txt>
              <Input
                label={t.auth.code}
                value={code}
                onChangeText={(v) => setCode(v.replace(/\D/g, ''))}
                keyboardType="number-pad"
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                maxLength={10}
                onSubmitEditing={verify}
              />
              <ErrorText message={error} />
              <Button title={t.auth.verify} onPress={verify} loading={busy} />
              <Button
                title={t.auth.changeEmail}
                variant="ghost"
                onPress={() => {
                  setStep('email');
                  setCode('');
                  setError(null);
                }}
              />
            </>
          )}
        </Card>

        <Txt variant="small">{t.auth.privacy}</Txt>
        <Link href="/personvern" style={{ color: '#2F6B4F' }}>
          {t.auth.privacyLink}
        </Link>
      </Screen>
    </KeyboardAvoidingView>
  );
}
