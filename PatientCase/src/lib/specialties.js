import { SPECIALTY_LABELS } from '../config/specialtyLabels.js';

export function mapSpecialties(payload) {
  const source = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.items)
        ? payload.items
        : [];

  return source
    .map((item) => ({
      id: item.id || item._id || item.value || item.code || '',
      name: item.name || item.title || item.text || item.label || item.displayName || ''
    }))
    .filter((item) => item.id && item.name);
}

export function translateSpecialtyName(name, language) {
  const normalized = SPECIALTY_LABELS[name];
  if (normalized) return normalized[language];

  const englishMatch = name.match(/\((.*)\)/);
  const arabicPart = name.replace(/\s*\(.*\)\s*/, '').trim();
  return language === 'ar' ? arabicPart || name : englishMatch?.[1] || name;
}
