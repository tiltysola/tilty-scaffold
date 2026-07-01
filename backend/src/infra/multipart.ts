import busboy from 'busboy';
import { type IncomingMessage } from 'http';

import { AppError } from '../core/errors';

interface MultipartFile {
  content: Buffer;
  contentType: string;
  fieldName: string;
  filename: string;
}

interface MultipartOptions {
  fieldName: string;
  maxBytes: number;
}

const multipartOverheadLimit = 64 * 1024;

export async function readMultipartFile(
  request: IncomingMessage,
  contentType: string,
  contentLength: string,
  options: MultipartOptions,
) {
  validateContentLength(contentLength, options.maxBytes + multipartOverheadLimit, options.maxBytes);

  const files = await parseMultipartFiles(request, contentType, options);

  if (files.length !== 1) {
    throw new AppError('FILE_UPLOAD_INVALID', 'error.FILE_UPLOAD_INVALID', 400);
  }

  const file = files[0]!;

  if (file.content.length === 0) {
    throw new AppError('FILE_UPLOAD_INVALID', 'error.FILE_UPLOAD_INVALID', 400);
  }

  return file;
}

function parseMultipartFiles(request: IncomingMessage, contentType: string, options: MultipartOptions) {
  return new Promise<MultipartFile[]>((resolve, reject) => {
    let settled = false;
    let totalBytes = 0;
    const files: MultipartFile[] = [];
    const parser = createBusboyParser(contentType, options.maxBytes);

    const fail = (error: unknown) => {
      if (settled) {
        return;
      }

      settled = true;
      reject(toMultipartError(error));
      request.destroy();
    };

    request.on('data', (chunk: Buffer) => {
      totalBytes += chunk.length;

      if (totalBytes > options.maxBytes + multipartOverheadLimit) {
        fail(
          new AppError('FILE_TOO_LARGE', 'error.FILE_TOO_LARGE', 413, {
            maxBytes: options.maxBytes,
          }),
        );
      }
    });

    parser.on('file', (fieldName, stream, info) => {
      if (fieldName !== options.fieldName) {
        fail(new AppError('FILE_UPLOAD_INVALID', 'error.FILE_UPLOAD_INVALID', 400));
        stream.resume();
        return;
      }

      const chunks: Buffer[] = [];
      let fileSizeExceeded = false;

      stream.on('limit', () => {
        fileSizeExceeded = true;
      });
      stream.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });
      stream.on('error', fail);
      stream.on('end', () => {
        if (fileSizeExceeded || stream.truncated) {
          fail(
            new AppError('FILE_TOO_LARGE', 'error.FILE_TOO_LARGE', 413, {
              maxBytes: options.maxBytes,
            }),
          );
          return;
        }

        files.push({
          content: Buffer.concat(chunks),
          contentType: info.mimeType,
          fieldName,
          filename: info.filename,
        });
      });
    });

    parser.on('field', () => {
      fail(new AppError('FILE_UPLOAD_INVALID', 'error.FILE_UPLOAD_INVALID', 400));
    });
    parser.on('fieldsLimit', () => {
      fail(new AppError('FILE_UPLOAD_INVALID', 'error.FILE_UPLOAD_INVALID', 400));
    });
    parser.on('filesLimit', () => {
      fail(new AppError('FILE_UPLOAD_INVALID', 'error.FILE_UPLOAD_INVALID', 400));
    });
    parser.on('partsLimit', () => {
      fail(new AppError('FILE_UPLOAD_INVALID', 'error.FILE_UPLOAD_INVALID', 400));
    });
    parser.on('error', fail);
    parser.on('close', () => {
      if (settled) {
        return;
      }

      settled = true;
      resolve(files);
    });

    request.once('error', fail);
    request.pipe(parser);
  });
}

function createBusboyParser(contentType: string, maxBytes: number) {
  try {
    return busboy({
      headers: {
        'content-type': contentType,
      },
      limits: {
        fieldSize: 1024,
        fields: 0,
        fileSize: maxBytes,
        files: 2,
        parts: 2,
      },
    });
  } catch {
    throw new AppError('FILE_UPLOAD_INVALID', 'error.FILE_UPLOAD_INVALID', 400);
  }
}

function validateContentLength(contentLength: string, requestMaxBytes: number, maxBytes: number) {
  const declaredLength = Number(contentLength);

  if (Number.isFinite(declaredLength) && declaredLength > requestMaxBytes) {
    throw new AppError('FILE_TOO_LARGE', 'error.FILE_TOO_LARGE', 413, {
      maxBytes,
    });
  }
}

function toMultipartError(error: unknown) {
  if (error instanceof AppError) {
    return error;
  }

  return new AppError('FILE_UPLOAD_INVALID', 'error.FILE_UPLOAD_INVALID');
}
