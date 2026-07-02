import { type CSSProperties } from 'react';
import { type Area } from 'react-easy-crop';

export interface CropOutput {
  contentType?: string;
  fileName: string;
  height: number;
  width: number;
}

export interface ImageAdjustments {
  blur: number;
  brightness: number;
  opacity: number;
}

export interface ImageCropErrorMessages {
  compressionFailed: (size: string) => string;
  cropAreaInvalid: string;
  cropFailed: string;
  loadFailed: string;
}

export const defaultImageAdjustments: ImageAdjustments = {
  blur: 0,
  brightness: 100,
  opacity: 100,
};

export async function createCroppedImageFile(
  imageUrl: string,
  cropArea: Area,
  output: CropOutput,
  adjustments: ImageAdjustments | undefined,
  maxFileBytes: number | undefined,
  errorMessages: ImageCropErrorMessages,
) {
  const image = await loadImage(imageUrl, errorMessages.loadFailed);
  const sourceX = Math.max(0, Math.round(cropArea.x));
  const sourceY = Math.max(0, Math.round(cropArea.y));
  const sourceWidth = Math.min(Math.round(cropArea.width), image.naturalWidth - sourceX);
  const sourceHeight = Math.min(Math.round(cropArea.height), image.naturalHeight - sourceY);

  if (sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error(errorMessages.cropAreaInvalid);
  }

  const contentType = output.contentType ?? 'image/png';
  const blob = await createCompressedImageBlob({
    adjustments,
    contentType,
    errorMessages,
    image,
    maxFileBytes,
    output,
    sourceHeight,
    sourceWidth,
    sourceX,
    sourceY,
  });

  return new File([blob], getOutputFileName(output.fileName, blob.type || contentType), {
    type: blob.type || contentType,
  });
}

export function getImageAdjustmentStyle(adjustments: ImageAdjustments): CSSProperties {
  return {
    filter: getCanvasFilter(adjustments),
    opacity: adjustments.opacity / 100,
  };
}

function getCanvasFilter(adjustments: ImageAdjustments) {
  return `brightness(${adjustments.brightness}%) blur(${adjustments.blur}px)`;
}

async function createCompressedImageBlob({
  adjustments,
  contentType,
  errorMessages,
  image,
  maxFileBytes,
  output,
  sourceHeight,
  sourceWidth,
  sourceX,
  sourceY,
}: {
  adjustments?: ImageAdjustments;
  contentType: string;
  errorMessages: ImageCropErrorMessages;
  image: HTMLImageElement;
  maxFileBytes?: number;
  output: CropOutput;
  sourceHeight: number;
  sourceWidth: number;
  sourceX: number;
  sourceY: number;
}) {
  let smallestBlob: Blob | null = null;

  const canvas = createCroppedCanvas({
    adjustments,
    errorMessages,
    height: output.height,
    image,
    sourceHeight,
    sourceWidth,
    sourceX,
    sourceY,
    width: output.width,
  });

  for (const quality of getCompressionQualities(contentType)) {
    const blob = await createCanvasBlob(canvas, contentType, errorMessages.cropFailed, quality);

    if (!smallestBlob || blob.size < smallestBlob.size) {
      smallestBlob = blob;
    }

    if (!maxFileBytes || blob.size <= maxFileBytes) {
      return blob;
    }
  }

  throw new Error(
    smallestBlob
      ? errorMessages.compressionFailed(formatFileSize(maxFileBytes ?? smallestBlob.size))
      : errorMessages.cropFailed,
  );
}

function createCroppedCanvas({
  adjustments,
  errorMessages,
  height,
  image,
  sourceHeight,
  sourceWidth,
  sourceX,
  sourceY,
  width,
}: {
  adjustments?: ImageAdjustments;
  errorMessages: ImageCropErrorMessages;
  height: number;
  image: HTMLImageElement;
  sourceHeight: number;
  sourceWidth: number;
  sourceX: number;
  sourceY: number;
  width: number;
}) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error(errorMessages.cropFailed);
  }

  canvas.width = width;
  canvas.height = height;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';

  if (adjustments) {
    context.globalAlpha = adjustments.opacity / 100;
    context.filter = getCanvasFilter(adjustments);
  }

  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height);

  return canvas;
}

function getCompressionQualities(contentType: string) {
  if (contentType !== 'image/jpeg' && contentType !== 'image/webp') {
    return [undefined];
  }

  return [0.9, 0.8, 0.7, 0.6, 0.5];
}

function loadImage(source: string, loadFailedMessage: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(loadFailedMessage));
    image.src = source;
  });
}

function createCanvasBlob(canvas: HTMLCanvasElement, contentType: string, cropFailedMessage: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error(cropFailedMessage));
          return;
        }

        resolve(blob);
      },
      contentType,
      quality,
    );
  });
}

function getOutputFileName(fileName: string, contentType: string) {
  const extension = getFileExtension(contentType);

  if (!extension) {
    return fileName;
  }

  return fileName.includes('.') ? fileName.replace(/\.[^.]+$/, `.${extension}`) : `${fileName}.${extension}`;
}

function getFileExtension(contentType: string) {
  switch (contentType) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    default:
      return null;
  }
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  const megabytes = bytes / (1024 * 1024);
  const roundedMegabytes = Number.isInteger(megabytes) ? megabytes.toFixed(0) : megabytes.toFixed(1);

  return `${roundedMegabytes} MB`;
}
