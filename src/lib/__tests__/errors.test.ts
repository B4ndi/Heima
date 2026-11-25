import { nb } from '@/i18n/nb';

import { rpcErrorMessage, userMessage } from '../errors';

describe('userMessage', () => {
  it('never leaks raw database errors', () => {
    const msg = userMessage({ code: '23505', message: 'duplicate key value violates unique constraint "invites_code_hash_key"' });
    expect(msg).toBe(nb.errors.generic);
    expect(msg).not.toMatch(/invites|constraint/);
  });
  it('shows our own business-rule messages', () => {
    expect(userMessage({ code: 'P0001', message: 'Husstanden må ha minst én admin' })).toBe('Husstanden må ha minst én admin');
  });
  it('maps permission and rate-limit errors', () => {
    expect(userMessage({ code: '42501', message: 'permission denied for table posts' })).toBe(nb.errors.forbidden);
    expect(userMessage({ status: 429 })).toBe(nb.errors.tooMany);
  });
  it('maps RPC error codes', () => {
    expect(rpcErrorMessage('rate_limited')).toBe(nb.errors.tooMany);
    expect(rpcErrorMessage('anything-else')).toBe(nb.errors.invalidCode);
  });
});
