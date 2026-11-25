import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform } from 'react-native';

import { Button, Card, ErrorText, Input, Screen, Txt } from '@/components/ui';
import { nb } from '@/i18n/nb';
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
    if (!parsed.success) return setError(nb.auth.invalidEmail);
    setBusy(true);
    const { error: e } = await supabase.auth.signInWithOtp({
      email: parsed.data,
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    // Same UI either way: do not reveal whether an account exists.
    if (e && e.status === 429) return setError(nb.errors.tooMany);
    if (e && e.status && e.status >= 500) return setError(userMessage(e));
    setStep('code');
  }

  async function verify() {
    setError(null);
    const parsed = schemas.otp.safeParse(code.trim());
    if (!parsed.success) return setError(nb.auth.invalidCode);
    setBusy(true);
    const { error: e } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: parsed.data,
      type: 'email',
    });
    setBusy(false);
    if (e) setError(e.status === 429 ? nb.errors.tooMany : nb.auth.invalidCode);
    // on success AuthProvider receives SIGNED_IN and the router moves on
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen edges={['top', 'bottom']}>
        <Txt variant="title" style={{ marginTop: 48 }}>
          {nb.auth.title}
        </Txt>
        <Txt variant="muted">{nb.auth.subtitle}</Txt>

        <Card>
          {step === 'email' ? (
            <>
              <Input
                label={nb.auth.email}
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
              <Button title={nb.auth.sendCode} onPress={sendCode} loading={busy} />
            </>
          ) : (
            <>
              <Txt>{nb.auth.codeSent(email.trim())}</Txt>
              <Input
                label={nb.auth.code}
                value={code}
                onChangeText={(t) => setCode(t.replace(/\D/g, ''))}
                keyboardType="number-pad"
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                maxLength={10}
                onSubmitEditing={verify}
              />
              <ErrorText message={error} />
              <Button title={nb.auth.verify} onPress={verify} loading={busy} />
              <Button
                title={nb.auth.changeEmail}
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

        <Txt variant="small">{nb.auth.privacy}</Txt>
        <Link href="/personvern" style={{ color: '#2F6B4F' }}>
          {nb.auth.privacyLink}
        </Link>
      </Screen>
    </KeyboardAvoidingView>
  );
}
