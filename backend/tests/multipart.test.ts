import { type IncomingMessage } from 'http';
import { Readable } from 'stream';
import { describe, expect, it } from 'vitest';

import { readMultipartFile } from '../src/infra/multipart';

interface MultipartPart {
  content: Buffer;
  contentType: string;
  fieldName: string;
  filename: string;
}

describe('multipart file reader', () => {
  it('reads one uploaded file from a multipart request stream', async () => {
    const content = Buffer.from('89504e470d0a1a0a', 'hex');
    const body = createMultipartBody('test-boundary', [
      {
        content,
        contentType: 'image/png',
        fieldName: 'avatar',
        filename: 'avatar.png',
      },
    ]);

    const file = await readMultipartFile(
      createRequest([body.subarray(0, 12), body.subarray(12)]),
      'multipart/form-data; boundary=test-boundary',
      String(body.length),
      {
        fieldName: 'avatar',
        maxBytes: 1024,
      },
    );

    expect(file).toEqual({
      content,
      contentType: 'image/png',
      fieldName: 'avatar',
      filename: 'avatar.png',
    });
  });

  it('rejects requests with multiple matching uploaded files', async () => {
    const body = createMultipartBody('test-boundary', [
      {
        content: Buffer.from('first'),
        contentType: 'image/png',
        fieldName: 'avatar',
        filename: 'first.png',
      },
      {
        content: Buffer.from('second'),
        contentType: 'image/png',
        fieldName: 'avatar',
        filename: 'second.png',
      },
    ]);

    await expect(
      readMultipartFile(createRequest([body]), 'multipart/form-data; boundary=test-boundary', String(body.length), {
        fieldName: 'avatar',
        maxBytes: 1024,
      }),
    ).rejects.toMatchObject({
      code: 'FILE_UPLOAD_INVALID',
      status: 400,
    });
  });

  it('rejects requests with unexpected uploaded file fields', async () => {
    const body = createMultipartBody('test-boundary', [
      {
        content: Buffer.from('89504e470d0a1a0a', 'hex'),
        contentType: 'image/png',
        fieldName: 'avatar',
        filename: 'avatar.png',
      },
      {
        content: Buffer.from('extra'),
        contentType: 'image/png',
        fieldName: 'attachment',
        filename: 'attachment.png',
      },
    ]);

    await expect(
      readMultipartFile(createRequest([body]), 'multipart/form-data; boundary=test-boundary', String(body.length), {
        fieldName: 'avatar',
        maxBytes: 1024,
      }),
    ).rejects.toMatchObject({
      code: 'FILE_UPLOAD_INVALID',
      status: 400,
    });
  });

  it('rejects requests with unexpected text fields', async () => {
    const body = Buffer.concat([
      Buffer.from(
        [
          '--test-boundary',
          'Content-Disposition: form-data; name="description"',
          '',
          'avatar',
          '--test-boundary',
          'Content-Disposition: form-data; name="avatar"; filename="avatar.png"',
          'Content-Type: image/png',
          '',
          '',
        ].join('\r\n'),
        'utf8',
      ),
      Buffer.from('89504e470d0a1a0a', 'hex'),
      Buffer.from('\r\n--test-boundary--\r\n', 'utf8'),
    ]);

    await expect(
      readMultipartFile(createRequest([body]), 'multipart/form-data; boundary=test-boundary', String(body.length), {
        fieldName: 'avatar',
        maxBytes: 1024,
      }),
    ).rejects.toMatchObject({
      code: 'FILE_UPLOAD_INVALID',
      status: 400,
    });
  });

  it('rejects empty uploaded files', async () => {
    const body = createMultipartBody('test-boundary', [
      {
        content: Buffer.alloc(0),
        contentType: 'image/png',
        fieldName: 'avatar',
        filename: 'avatar.png',
      },
    ]);

    await expect(
      readMultipartFile(createRequest([body]), 'multipart/form-data; boundary=test-boundary', String(body.length), {
        fieldName: 'avatar',
        maxBytes: 1024,
      }),
    ).rejects.toMatchObject({
      code: 'FILE_UPLOAD_INVALID',
      status: 400,
    });
  });

  it('rejects uploaded files larger than the configured limit', async () => {
    const body = createMultipartBody('test-boundary', [
      {
        content: Buffer.alloc(5, 'a'),
        contentType: 'image/png',
        fieldName: 'avatar',
        filename: 'avatar.png',
      },
    ]);

    await expect(
      readMultipartFile(createRequest([body]), 'multipart/form-data; boundary=test-boundary', String(body.length), {
        fieldName: 'avatar',
        maxBytes: 4,
      }),
    ).rejects.toMatchObject({
      code: 'FILE_TOO_LARGE',
      status: 413,
    });
  });

  it('rejects malformed multipart payloads', async () => {
    await expect(
      readMultipartFile(
        createRequest([Buffer.from('--test-boundary\r\nmissing headers', 'utf8')]),
        'multipart/form-data; boundary=test-boundary',
        '',
        {
          fieldName: 'avatar',
          maxBytes: 1024,
        },
      ),
    ).rejects.toMatchObject({
      code: 'FILE_UPLOAD_INVALID',
      status: 400,
    });
  });
});

function createMultipartBody(boundary: string, parts: MultipartPart[]) {
  const chunks = parts.flatMap((part) => [
    Buffer.from(
      [
        `--${boundary}`,
        `Content-Disposition: form-data; name="${part.fieldName}"; filename="${part.filename}"`,
        `Content-Type: ${part.contentType}`,
        '',
        '',
      ].join('\r\n'),
      'utf8',
    ),
    part.content,
    Buffer.from('\r\n', 'utf8'),
  ]);

  return Buffer.concat([...chunks, Buffer.from(`--${boundary}--\r\n`, 'utf8')]);
}

function createRequest(chunks: Buffer[]) {
  return Readable.from(chunks) as IncomingMessage;
}
