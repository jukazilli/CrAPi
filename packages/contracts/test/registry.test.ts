import { describe, expect, it } from 'vitest';

import { normalizeRegistration, parseRegistryQuery } from '../src/registry.js';

describe('registry contract', () => {
  it('normalizes registration identifiers without coercing them to numbers', () => {
    expect(normalizeRegistration('  00123-f ')).toBe('00123-F');
  });

  it('accepts a valid registry query', () => {
    const result = parseRegistryQuery({
      council: 'cref',
      uf: 'sp',
      registration_number: ' 00123-f ',
    });

    expect(result).toEqual({
      ok: true,
      value: { council: 'CREF', uf: 'SP', registration_number: '00123-F' },
    });
  });

  it('rejects malformed UFs', () => {
    const result = parseRegistryQuery({
      council: 'CREF',
      uf: 'SÃO PAULO',
      registration_number: '123',
    });

    expect(result.ok).toBe(false);
  });
});
