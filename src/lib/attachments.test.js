import { describe, expect, it } from 'vitest';
import { ATTACHMENT_LIMITS, formatBytes, validateAttachmentSelection } from './attachments.js';

const t = {
  attachmentsMaxCount: (count) => `max-count-${count}`,
  attachmentsMaxSize: (size) => `max-size-${size}`,
  attachmentsInvalidType: 'invalid-type',
  attachmentsDuplicate: 'duplicate-file'
};

function createFile(name, size, type, lastModified = 1) {
  return { name, size, type, lastModified };
}

describe('attachment helpers', () => {
  it('formats bytes for user display', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
  });

  it('rejects too many files', () => {
    const existing = new Array(ATTACHMENT_LIMITS.maxCount).fill(null).map((_, index) =>
      createFile(`file-${index}.pdf`, 1000, 'application/pdf', index + 1)
    );

    const result = validateAttachmentSelection(existing, [createFile('extra.pdf', 1000, 'application/pdf', 99)], t);
    expect(result.error).toBe(`max-count-${ATTACHMENT_LIMITS.maxCount}`);
    expect(result.nextFiles).toHaveLength(ATTACHMENT_LIMITS.maxCount);
  });

  it('rejects unsupported file types', () => {
    const result = validateAttachmentSelection([], [createFile('notes.txt', 200, 'text/plain')], t);
    expect(result.error).toBe('invalid-type');
    expect(result.nextFiles).toEqual([]);
  });

  it('rejects oversized files', () => {
    const result = validateAttachmentSelection([], [createFile('report.pdf', ATTACHMENT_LIMITS.maxSizeBytes + 1, 'application/pdf')], t);
    expect(result.error).toBe(`max-size-${formatBytes(ATTACHMENT_LIMITS.maxSizeBytes)}`);
    expect(result.nextFiles).toEqual([]);
  });

  it('ignores duplicates and keeps unique files', () => {
    const first = createFile('scan.pdf', 2000, 'application/pdf', 10);
    const duplicate = createFile('scan.pdf', 2000, 'application/pdf', 10);
    const second = createFile('scan-2.pdf', 2200, 'application/pdf', 11);

    const result = validateAttachmentSelection([first], [duplicate, second], t);
    expect(result.error).toBe('duplicate-file');
    expect(result.nextFiles).toEqual([first, second]);
  });
});
