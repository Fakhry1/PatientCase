import { genderOptionId } from '../config/form.js';
import { getFullPhoneNumber } from './phone.js';

const GENDER_OPTION_TEXT = {
  male: '\u0630\u0643\u0631 (Male)',
  female: '\u0623\u0646\u062b\u0649 (Female)'
};

function createId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function buildWebhookPayload(form, attachments = []) {
  const createdAt = new Date().toISOString();
  const normalizedAttachments = attachments
    .map((attachment) => {
      const key = attachment?.uploadResponse?.key || attachment?.key || '';
      const link =
        attachment?.url ||
        attachment?.fileUrl ||
        attachment?.uploadResponse?.url ||
        attachment?.uploadResponse?.fileUrl ||
        (key ? `https://utfs.io/f/${key}` : '');
      const utfsUrl = attachment?.utfsUrl || (key ? `https://utfs.io/f/${key}` : '');

      if (!link) return null;

      return {
        url: link,
        utfsUrl: utfsUrl || link
      };
    })
    .filter(Boolean);
  const attachmentUploadResponses = attachments
    .map((attachment) => attachment?.uploadResponse)
    .filter((response) => response && typeof response === 'object');
  const attachmentsJson = normalizedAttachments.length > 0 ? JSON.stringify(normalizedAttachments) : '';
  const attachmentResponsesJson =
    attachmentUploadResponses.length > 0 ? JSON.stringify(attachmentUploadResponses) : '';

  const baseData = {
    responseId: createId().slice(0, 8),
    submissionId: createId().slice(0, 8),
    respondentId: createId().slice(0, 8),
    formId: 'patient-case-intake-form',
    formName: 'Medical Consultation Request Form',
    createdAt,
    fields: [
      { key: 'question_full_name', label: 'full_name', type: 'INPUT_TEXT', value: form.fullName },
      { key: 'question_date_of_birth', label: 'date_of_birth', type: 'INPUT_DATE', value: form.dateOfBirth },
      {
        key: 'question_phone',
        label: 'phone',
        type: 'INPUT_TEXT',
        value: getFullPhoneNumber(form.countryCode, form.phoneNumber)
      },
      {
        key: 'question_gender',
        label: 'gender',
        type: 'DROPDOWN',
        value: [genderOptionId[form.gender]],
        options: [
          { id: genderOptionId.male, text: GENDER_OPTION_TEXT.male },
          { id: genderOptionId.female, text: GENDER_OPTION_TEXT.female }
        ]
      },
      {
        key: 'question_selected_speciality',
        label: 'selected_speciality',
        type: 'DROPDOWN',
        value: [form.specialtyId],
        options: [{ id: form.specialtyId, text: form.specialtyName }]
      },
      { key: 'question_symptoms', label: 'symptoms', type: 'TEXTAREA', value: form.symptoms },
      {
        key: 'question_attachments',
        label: 'attachments',
        type: 'TEXTAREA',
        value: attachmentsJson
      },
      {
        key: 'question_attachment_upload_responses',
        label: 'attachment_upload_responses',
        type: 'TEXTAREA',
        value: attachmentResponsesJson
      }
    ]
  };

  if (normalizedAttachments.length > 0) {
    baseData.attachments = normalizedAttachments;
  }

  if (attachmentUploadResponses.length > 0) {
    baseData.attachmentUploadResponses = attachmentUploadResponses;
  }

  return {
    eventId: createId(),
    eventType: 'FORM_RESPONSE',
    createdAt,
    data: baseData
  };
}
