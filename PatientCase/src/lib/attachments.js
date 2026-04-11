const MAX_ATTACHMENT_COUNT = 5;
const MAX_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024;
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

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
    reader.readAsDataURL(file);
  });
}

export async function buildAttachmentPayloads(files) {
  return Promise.all(
    files.map(async (file) => ({
      name: file.name,
      type: file.type || 'application/octet-stream',
      size: file.size,
      content: await readFileAsDataUrl(file)
    }))
  );
}
