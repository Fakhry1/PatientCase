export function getFullPhoneNumber(countryCode, phoneNumber) {
  return `${countryCode}${phoneNumber}`;
}

export function getPhoneError(value, t) {
  const normalized = value.trim();

  if (!normalized) return t.required;
  if (!/^\d+$/.test(normalized)) return t.phoneDigitsOnly;
  if (normalized.startsWith('0')) return t.phoneNoLeadingZero;
  if (normalized.length !== 9) return t.phoneNineDigits;

  return '';
}
