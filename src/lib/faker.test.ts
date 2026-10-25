import { describe, expect, test } from 'vitest';
import {
  CN_BANKS,
  FAKER_COUNTRIES,
  cnIdCheckDigit,
  generateCnDebitCard,
  generateCnIdCard,
  generateCnMobile,
  generateCnProfiles,
  generateIdentityProfile,
  luhnCheck,
} from './faker';

const stableRandom = (seed: number) => {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
};

describe('chinese test data generators', () => {
  test('debit cards pass Luhn and use a registered bank prefix', () => {
    const random = stableRandom(7);
    for (let i = 0; i < 20; i += 1) {
      const bank = CN_BANKS[i % CN_BANKS.length];
      const card = generateCnDebitCard(bank, random);
      expect(card).toHaveLength(bank.length);
      expect(card.startsWith(bank.prefix)).toBe(true);
      expect(luhnCheck(card)).toBe(true);
    }
  });

  test('ID cards are 18 chars with a valid checksum and gender parity', () => {
    const random = stableRandom(11);
    for (let i = 0; i < 20; i += 1) {
      const id = generateCnIdCard(true, random);
      expect(id).toMatch(/^\d{17}[\dX]$/);
      expect(cnIdCheckDigit(id.slice(0, 17))).toBe(id.charAt(17));
      expect(Number(id.charAt(16)) % 2).toBe(1);
      const year = Number(id.slice(6, 10));
      expect(year).toBeGreaterThanOrEqual(1950);
      expect(year).toBeLessThanOrEqual(2006);
    }
    const female = generateCnIdCard(false, random);
    expect(Number(female.charAt(16)) % 2).toBe(0);
  });

  test('mobile numbers use registered prefixes', () => {
    const random = stableRandom(3);
    for (let i = 0; i < 20; i += 1) {
      expect(generateCnMobile(random)).toMatch(/^1[3-9]\d{9}$/);
    }
  });

  test('generateCnProfiles produces complete rows', () => {
    const profiles = generateCnProfiles(5, stableRandom(42));
    expect(profiles).toHaveLength(5);
    for (const profile of profiles) {
      expect(profile.name.length).toBeGreaterThanOrEqual(2);
      expect(profile.idCard).toHaveLength(18);
      expect(luhnCheck(profile.cardNumber)).toBe(true);
      expect(CN_BANKS.some((bank) => profile.cardNumber.startsWith(bank.prefix))).toBe(true);
    }
  });
});

describe('virtual identity generator', () => {
  test('every country yields a complete valid profile', () => {
    for (const { code } of FAKER_COUNTRIES) {
      const profile = generateIdentityProfile(code, stableRandom(code.charCodeAt(0)));
      expect(profile.fullName).not.toBe('');
      expect(profile.city).not.toBe('');
      expect(profile.postal).not.toBe('');
      expect(profile.phone).not.toBe('');
      expect(profile.email.endsWith('@example.com')).toBe(true);
      expect(profile.website.endsWith('.example.com')).toBe(true);
      expect(luhnCheck(profile.cardNumber)).toBe(true);
      expect(profile.guid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(profile.password).toHaveLength(12);
      expect(profile.nationalId).not.toBe('');
    }
  });

  test('US profile matches expected formats', () => {
    const profile = generateIdentityProfile('US', stableRandom(99));
    expect(profile.postal).toMatch(/^\d{5}$/);
    expect(profile.phone).toMatch(/^\d{3}-\d{3}-\d{4}$/);
    expect(profile.birthday).toMatch(/^\d{1,2}\/\d{1,2}\/\d{4}$/);
    expect(profile.nationalId).toMatch(/^9\d{2}-\d{2}-\d{4}$/);
    expect(profile.region).toHaveLength(2);
    expect(profile.height).toMatch(/^\d' \d+" \(\d{2,3}cm\)$/);
  });

  test('Canadian postcodes keep the A#A #A# shape', () => {
    const profile = generateIdentityProfile('CA', stableRandom(5));
    expect(profile.postal).toMatch(/^[A-Z]\d[A-Z] \d[A-Z]\d$/);
  });

  test('Chinese profiles reuse mainland formats', () => {
    const profile = generateIdentityProfile('CN', stableRandom(21));
    expect(profile.postal).toMatch(/^\d{6}$/);
    expect(profile.phone).toMatch(/^1[3-9]\d{9}$/);
    expect(profile.nationalId).toHaveLength(18);
  });

  test('credit cards follow their network shape', () => {
    for (let i = 0; i < 40; i += 1) {
      const profile = generateIdentityProfile('US', stableRandom(i + 1000));
      if (profile.cardType === 'Visa') expect(profile.cardNumber).toMatch(/^4\d{15}$/);
      if (profile.cardType === 'MasterCard') expect(profile.cardNumber).toMatch(/^5[1-5]\d{14}$/);
      if (profile.cardType === 'American Express') expect(profile.cardNumber).toMatch(/^3[47]\d{13}$/);
      if (profile.cardType === 'Discover') expect(profile.cardNumber).toMatch(/^6011\d{12}$/);
      expect(luhnCheck(profile.cardNumber)).toBe(true);
    }
  });
});
