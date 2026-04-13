import { useEffect, useState } from 'react';
import CountryCodePicker from './components/CountryCodePicker.jsx';
import Field from './components/Field.jsx';
import SectionCard from './components/SectionCard.jsx';
import SuccessPanel from './components/SuccessPanel.jsx';
import { COUNTRY_CODES } from './config/countries.js';
import { initialForm } from './config/form.js';
import { translations } from './i18n/translations.js';
import { fetchSpecialties, submitConsultation } from './lib/api.js';
import { buildWebhookPayload } from './lib/consultationPayload.js';
import { getFullPhoneNumber, getPhoneError } from './lib/phone.js';
import { mapSpecialties, translateSpecialtyName } from './lib/specialties.js';

const ARABIC_LABEL = '\u0627\u0644\u0639\u0631\u0628\u064a\u0629';
const EMPTY_OPTION = '\u2014';

function getSpecialtyErrorMessage(baseMessage, detail) {
  if (!detail) return '';
  return `${baseMessage} (${detail})`;
}

export default function App() {
  const [language, setLanguage] = useState('ar');
  const [form, setForm] = useState(initialForm);
  const [specialties, setSpecialties] = useState([]);
  const [loadingSpecialties, setLoadingSpecialties] = useState(true);
  const [specialtyErrorDetail, setSpecialtyErrorDetail] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitState, setSubmitState] = useState({ status: 'idle', message: '' });
  const [submitted, setSubmitted] = useState(false);
  const [submissionMeta, setSubmissionMeta] = useState({ reference: '', specialty: '', phone: '' });

  const t = translations[language];
  const dir = language === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => {
    let isActive = true;

    async function loadSpecialties() {
      try {
        setLoadingSpecialties(true);
        setSpecialtyErrorDetail('');
        const payload = await fetchSpecialties('Failed to load specialties.');
        if (!isActive) return;

        setSpecialties(mapSpecialties(payload));
      } catch (error) {
        if (!isActive) return;
        setSpecialtyErrorDetail(error.message || 'Failed to load specialties.');
      } finally {
        if (isActive) {
          setLoadingSpecialties(false);
        }
      }
    }

    loadSpecialties();

    return () => {
      isActive = false;
    };
  }, []);

  function clearFieldMessage(name) {
    setFieldErrors((current) => ({ ...current, [name]: '' }));
    setSubmitState({ status: 'idle', message: '' });
  }

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((current) => {
      if (name === 'specialtyId') {
        const selected = specialties.find((item) => item.id === value);
        return {
          ...current,
          specialtyId: value,
          specialtyName: selected?.name || '',
        };
      }

      return {
        ...current,
        [name]: value,
      };
    });

    clearFieldMessage(name);
  }

  function handleCountryCodeSelect(code) {
    setForm((current) => ({ ...current, countryCode: code }));
    clearFieldMessage('phoneNumber');
  }

  function handlePhoneChange(event) {
    const next = event.target.value.replace(/\D/g, '').slice(0, 9);
    setForm((current) => ({ ...current, phoneNumber: next }));
    clearFieldMessage('phoneNumber');
  }


  function validateForm() {
    const errors = {};

    if (!form.fullName.trim()) errors.fullName = t.required;
    if (!form.dateOfBirth) errors.dateOfBirth = t.required;
    if (!form.gender) errors.gender = t.required;

    const phoneError = getPhoneError(form.phoneNumber, t);
    if (phoneError) errors.phoneNumber = phoneError;

    if (!form.specialtyId) errors.specialtyId = t.required;
    if (!form.symptoms.trim()) errors.symptoms = t.required;

    setFieldErrors((current) => ({ ...current, ...errors }));
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!validateForm()) return;

    try {
      setSubmitState({ status: 'loading', message: '' });
      const payload = await buildWebhookPayload(form);
      await submitConsultation(payload, t.submissionError);

      setSubmissionMeta({
        reference: payload.eventId.slice(0, 8).toUpperCase(),
        specialty: translateSpecialtyName(form.specialtyName, language),
        phone: getFullPhoneNumber(form.countryCode, form.phoneNumber),
      });
      setSubmitState({ status: 'success', message: t.successMsg });
      setSubmitted(true);
    } catch (error) {
      setSubmitState({
        status: 'error',
        message: error.message || t.genericApiError,
      });
    }
  }

  function resetForm() {
    setForm(initialForm);
    setFieldErrors({});
    setSubmitState({ status: 'idle', message: '' });
    setSubmitted(false);
    setSubmissionMeta({ reference: '', specialty: '', phone: '' });
  }

  async function retrySpecialties() {
    try {
      setLoadingSpecialties(true);
      setSpecialtyErrorDetail('');
      const payload = await fetchSpecialties('Failed to load specialties.');
      setSpecialties(mapSpecialties(payload));
    } catch (error) {
      setSpecialtyErrorDetail(error.message || 'Failed to load specialties.');
    } finally {
      setLoadingSpecialties(false);
    }
  }

  const finalPhone = form.phoneNumber ? getFullPhoneNumber(form.countryCode, form.phoneNumber) : '';
  const finalPhoneDisplay = finalPhone || '...';
  const specialtyError = getSpecialtyErrorMessage(t.specialtyError, specialtyErrorDetail);
  const canSubmit = submitState.status !== 'loading' && !loadingSpecialties && !specialtyErrorDetail;

  const successSummaryItems = [
    { label: t.successSpecialtyLabel, value: submissionMeta.specialty || '—' },
    { label: t.finalPhone, value: submissionMeta.phone || '—', dir: 'ltr' },
  ];

  return (
    <div className="app-shell" dir={dir}>
      <section className="hero-panel">
        <div className="hero-decoration hero-decoration-a" />
        <div className="hero-decoration hero-decoration-b" />

        <div className="hero-topbar">
          <div className="portal-pill glass-card">
            <img src="/imam-fakhr-logo.jpeg" alt="Imam Fakhraldin Organization Logo" className="portal-logo" />
            <span>{t.portalLabel}</span>
          </div>

          <div className="language-switch glass-card">
            <button type="button" className={language === 'ar' ? 'active' : ''} onClick={() => setLanguage('ar')}>
              {ARABIC_LABEL}
            </button>
            <button type="button" className={language === 'en' ? 'active' : ''} onClick={() => setLanguage('en')}>
              English
            </button>
          </div>
        </div>

        <div className="hero-body">
          <h1>{t.title}</h1>
          <p>{t.heroDesc}</p>

          <div className="hero-meta-grid hero-meta-compact">
            <div>
              <span>{t.finalPhone}</span>
              <code dir="ltr">{finalPhoneDisplay}</code>
            </div>
            <div>
              <span>{t.apiBase}</span>
              <code>{t.secureStatus}</code>
            </div>
          </div>
        </div>
      </section>

      <section className="form-panel">
        <div className="form-container">
          {!submitted && (
            <>
              <div className="form-intro">
                <p>{t.subtitle}</p>
                <h2>{t.formTitle}</h2>
                <span>{t.description}</span>
              </div>
            </>
          )}

          {submitted ? (
            <SuccessPanel
              heading={t.successHeading}
              message={t.successMsg}
              note={t.successNote}
              buttonText={t.createAnother}
              onReset={resetForm}
              referenceLabel={t.successReferenceLabel}
              referenceValue={submissionMeta.reference}
              summaryItems={successSummaryItems}
            />
          ) : (
            <form className="case-form" onSubmit={handleSubmit} noValidate>
              <div className="form-badges" aria-hidden="true">
                <span className="form-badge">{t.finalPhone}</span>
                <span className="form-badge">{t.secureStatus}</span>
              </div>

              <SectionCard title={t.patientSectionTitle} description={t.patientSectionDesc}>
                <Field label={t.fullNameLabel} required error={fieldErrors.fullName}>
                  <input
                    type="text"
                    name="fullName"
                    value={form.fullName}
                    onChange={handleChange}
                    placeholder={t.fullNamePlaceholder}
                    autoComplete="name"
                  />
                </Field>

                <div className="grid-two">
                  <Field label={t.dobLabel} required error={fieldErrors.dateOfBirth}>
                    <input type="date" name="dateOfBirth" value={form.dateOfBirth} onChange={handleChange} autoComplete="bday" />
                  </Field>

                  <Field label={t.genderLabel} required error={fieldErrors.gender}>
                    <select name="gender" value={form.gender} onChange={handleChange} autoComplete="sex">
                      <option value="" disabled>
                        {EMPTY_OPTION}
                      </option>
                      <option value="male">{t.genderMale}</option>
                      <option value="female">{t.genderFemale}</option>
                    </select>
                  </Field>
                </div>

                <Field label={t.phoneLabel} required hint={fieldErrors.phoneNumber ? '' : t.phoneHint} error={fieldErrors.phoneNumber}>
                  <div className="phone-row">
                    <CountryCodePicker
                      countries={COUNTRY_CODES}
                      language={language}
                      value={form.countryCode}
                      onSelect={handleCountryCodeSelect}
                    />
                    <input
                      type="tel"
                      name="phoneNumber"
                      value={form.phoneNumber}
                      onChange={handlePhoneChange}
                      placeholder={t.phonePlaceholder}
                      inputMode="numeric"
                      autoComplete="tel-national"
                      maxLength="9"
                    />
                  </div>
                  <div className="phone-preview" dir="ltr">{finalPhoneDisplay}</div>
                </Field>
              </SectionCard>

              <SectionCard title={t.caseSectionTitle} description={t.caseSectionDesc}>

                <Field label={t.specialtyLabel} required error={fieldErrors.specialtyId || specialtyError}>
                  <select name="specialtyId" value={form.specialtyId} onChange={handleChange} disabled={loadingSpecialties}>
                    <option value="" disabled>
                      {loadingSpecialties ? t.specialtyLoading : t.specialtyPlaceholder}
                    </option>
                    {specialties.map((specialty) => (
                      <option key={specialty.id} value={specialty.id}>
                        {translateSpecialtyName(specialty.name, language)}
                      </option>
                    ))}
                  </select>
                  {!!specialtyErrorDetail && (
                    <button type="button" className="inline-action" onClick={retrySpecialties}>
                      {t.retrySpecialtiesAction}
                    </button>
                  )}
                </Field>

                <Field label={t.descriptionLabel} required error={fieldErrors.symptoms}>
                  <textarea
                    name="symptoms"
                    value={form.symptoms}
                    onChange={handleChange}
                    placeholder={t.descriptionPlaceholder}
                    rows="5"
                  />
                  <div className="text-counter">{form.symptoms.trim().length} / 500</div>
                </Field>
              </SectionCard>

              {submitState.status === 'error' && <div className="submit-error">{submitState.message}</div>}

              <div className="submit-block" aria-live="polite">
                <button type="submit" className="primary-button" disabled={!canSubmit}>
                  {submitState.status === 'loading' ? t.submitting : t.submitBtn}
                </button>
                <p>{specialtyErrorDetail ? t.fixSpecialtyBeforeSubmit : t.formNote}</p>
              </div>
            </form>
          )}
        </div>
      </section>

      <footer className="app-footer">{t.footer}</footer>
    </div>
  );
}


