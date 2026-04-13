import { describe, expect, it } from 'vitest';
import { getFullPhoneNumber, getPhoneError } from './phone.js';

const t = {
  required: 'required',
  phoneDigitsOnly: 'digits',
  phoneNoLeadingZero: 'leading-zero',
  phoneNineDigits: 'nine-digits'
};

describe('phone helpers', () => {
  it('builds the full phone number with country code at the beginning', () => {
    expect(getFullPhoneNumber('+966', '533041569')).toBe('+966533041569');
  });

  it('validates missing values', () => {
    expect(getPhoneError('', t)).toBe('required');
  });

  it('rejects non digit phone numbers', () => {
    expect(getPhoneError('53A304156', t)).toBe('digits');
  });

  it('rejects values that start with zero', () => {
    expect(getPhoneError('012345678', t)).toBe('leading-zero');
  });

  it('rejects values with invalid length', () => {
    expect(getPhoneError('12345678', t)).toBe('nine-digits');
  });

  it('accepts valid local numbers', () => {
    expect(getPhoneError('533041569', t)).toBe('');
  });
});
