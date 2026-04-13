const MAX_ATTACHMENT_COUNT = 5;
const MAX_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024;
const UPLOADTHING_ENDPOINT = '/api/uploadthing';
const UPLOADTHING_SLUG = 'caseAttachmentUploader';
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.pdf', '.doc', '.docx'];
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]);

export const ATTACHMENT_LIMITS = {
  maxCount: MAX_ATTACHMENT_COUNT,
  maxSizeBytes: MAX_ATTACHMENT_SIZE_BYTES,
  accept: '.jpg,.jpeg,.png,.webp,.pdf,.doc,.docx'
};

export function formatBytes(size) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileExtension(name = '') {
  const index = name.lastIndexOf('.');
  return index >= 0 ? name.slice(index).toLowerCase() : '';
}

function isAllowedFile(file) {
  const extension = getFileExtension(file.name);
  const mimeType = (file.type || '').toLowerCase();

  if (mimeType && ALLOWED_MIME_TYPES.has(mimeType)) return true;
  return ALLOWED_EXTENSIONS.includes(extension);
}

function getFileSignature(file) {
  return [file.name, file.size, file.lastModified].join(':');
}

export function validateAttachmentSelection(existingFiles, incomingFiles, t) {
  if (!incomingFiles.length) {
    return { nextFiles: existingFiles, error: '' };
  }

  if (existingFiles.length + incomingFiles.length > ATTACHMENT_LIMITS.maxCount) {
    return {
      nextFiles: existingFiles,
      error: t.attachmentsMaxCount(ATTACHMENT_LIMITS.maxCount)
    };
  }

  const knownFiles = new Set(existingFiles.map(getFileSignature));
  const nextFiles = [...existingFiles];
  let duplicateIgnored = false;

  for (const file of incomingFiles) {
    if (!isAllowedFile(file)) {
      return {
        nextFiles: existingFiles,
        error: t.attachmentsInvalidType
      };
    }

    if (file.size > ATTACHMENT_LIMITS.maxSizeBytes) {
      return {
        nextFiles: existingFiles,
        error: t.attachmentsMaxSize(formatBytes(ATTACHMENT_LIMITS.maxSizeBytes))
      };
    }

    const signature = getFileSignature(file);
    if (knownFiles.has(signature)) {
      duplicateIgnored = true;
      continue;
    }

    knownFiles.add(signature);
    nextFiles.push(file);
  }

  return {
    nextFiles,
    error: duplicateIgnored ? t.attachmentsDuplicate : ''
  };
}

async function parseErrorMessage(response, fallback) {
  const text = await response.text();
  if (!text) return fallback;

  try {
    const json = JSON.parse(text);
    return json.message || json.error || fallback;
  } catch {
    return text;
  }
}

async function requestPresignedUploads(files) {
  const response = await fetch(`${UPLOADTHING_ENDPOINT}?actionType=upload&slug=${UPLOADTHING_SLUG}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-uploadthing-version': '6.13.3',
      'x-uploadthing-fe-package': '@uploadthing/client'
    },
    body: JSON.stringify({
      input: null,
      files: files.map((file) => ({
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream'
      }))
    })
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to request upload URLs.'));
  }

  const payload = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error('Unexpected upload URL response shape.');
  }

  return payload;
}

async function uploadFileToPresignedTarget(file, target) {
  const fields = target?.fields && typeof target.fields === 'object' ? target.fields : null;

  if (fields && Object.keys(fields).length > 0) {
    const formData = new FormData();
    Object.entries(fields).forEach(([key, value]) => formData.append(key, value));
    formData.append('file', file);

    const response = await fetch(target.url, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error(`Failed to upload ${file.name}.`);
    }

    return;
  }

  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(target.url, {
    method: 'PUT',
    body: formData
  });

  if (!response.ok) {
    throw new Error(`Failed to upload ${file.name}.`);
  }
}

function buildUploadedAttachment(file, target) {
  const url = target.fileUrl || target.appUrl || (target.key ? `https://utfs.io/f/${target.key}` : '');

  if (!url) {
    throw new Error('Upload completed without a file URL.');
  }

  return {
    url,
    fileName: target.fileName || target.name || file.name,
    mimeType: file.type || 'application/octet-stream',
    sizeBytes: file.size
  };
}

export async function uploadAttachments(files) {
  if (!files.length) return [];

  const targets = await requestPresignedUploads(files);

  if (targets.length !== files.length) {
    throw new Error('Upload service returned an invalid number of targets.');
  }

  const uploaded = await Promise.all(
    files.map(async (file, index) => {
      const target = targets[index];
      await uploadFileToPresignedTarget(file, target);
      return buildUploadedAttachment(file, target);
    })
  );

  return uploaded;
}
