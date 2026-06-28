import { type ChangeEvent, type ComponentType, type CSSProperties, useRef, useState } from 'react';
import CropperBase, { type Area, type Point } from 'react-easy-crop';

import { ImageUpIcon, Trash2Icon } from 'lucide-react';

import { Button } from '@/shadcn/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shadcn/components/ui/dialog';
import { Input } from '@/shadcn/components/ui/input';
import { Label } from '@/shadcn/components/ui/label';
import { Slider } from '@/shadcn/components/ui/slider';

import { ConfirmActionDialog } from '@/components/ConfirmActionDialog';
import FormMessage from '@/components/FormMessage';

interface CropOutput {
  contentType?: string;
  fileName: string;
  height: number;
  width: number;
}

interface ImageCropDialogProps {
  accept?: string;
  aspect: number;
  cropShape?: 'rect' | 'round';
  description: string;
  error?: string | null;
  imageUrl: string | null;
  imageSelectDescription?: string;
  imageSelectLabel?: string;
  loading?: boolean;
  maxFileBytes?: number;
  onImageSelect: (file: File) => void;
  onOpenChange: (open: boolean) => void;
  onRemove?: () => Promise<void> | void;
  onSubmit: (file: File) => Promise<void> | void;
  output: CropOutput;
  open: boolean;
  removeLabel?: string;
  removeLoading?: boolean;
  showAdjustments?: boolean;
  showGrid?: boolean;
  submitLabel: string;
  title: string;
}

interface ImageCropDialogContentProps extends Omit<
  ImageCropDialogProps,
  'description' | 'onOpenChange' | 'open' | 'title'
> {
  loading: boolean;
}

interface ImageAdjustments {
  blur: number;
  brightness: number;
  opacity: number;
}

interface ImageCropperProps {
  aspect: number;
  crop: Point;
  cropShape: 'rect' | 'round';
  image: string;
  objectFit: 'contain' | 'cover' | 'horizontal-cover' | 'vertical-cover';
  onCropChange: (crop: Point) => void;
  onCropComplete: (croppedArea: Area, croppedAreaPixels: Area) => void;
  onZoomChange: (zoom: number) => void;
  roundCropAreaPixels: boolean;
  showGrid: boolean;
  style?: {
    mediaStyle?: CSSProperties;
  };
  zoom: number;
}

const defaultAdjustments: ImageAdjustments = {
  blur: 0,
  brightness: 100,
  opacity: 100,
};
const ImageCropper = CropperBase as unknown as ComponentType<ImageCropperProps>;

const Index = ({
  accept = 'image/png,image/jpeg,image/webp,image/gif',
  aspect,
  cropShape = 'rect',
  description,
  error,
  imageUrl,
  imageSelectDescription = 'JPEG, PNG, WebP, or GIF.',
  imageSelectLabel = 'Select image',
  loading = false,
  maxFileBytes,
  onImageSelect,
  onOpenChange,
  onRemove,
  onSubmit,
  output,
  open,
  removeLabel,
  removeLoading = false,
  showAdjustments = false,
  showGrid = true,
  submitLabel,
  title,
}: ImageCropDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <ImageCropDialogContent
          accept={accept}
          aspect={aspect}
          cropShape={cropShape}
          error={error}
          imageSelectDescription={imageSelectDescription}
          imageSelectLabel={imageSelectLabel}
          imageUrl={imageUrl}
          key={imageUrl ?? 'empty'}
          loading={loading}
          maxFileBytes={maxFileBytes}
          onImageSelect={onImageSelect}
          onRemove={onRemove}
          onSubmit={onSubmit}
          output={output}
          removeLabel={removeLabel}
          removeLoading={removeLoading}
          showAdjustments={showAdjustments}
          showGrid={showGrid}
          submitLabel={submitLabel}
        />
      </DialogContent>
    </Dialog>
  );
};

const ImageCropDialogContent = ({
  accept,
  aspect,
  cropShape = 'rect',
  error,
  imageUrl,
  imageSelectDescription,
  imageSelectLabel,
  loading,
  maxFileBytes,
  onImageSelect,
  onRemove,
  onSubmit,
  output,
  removeLabel,
  removeLoading = false,
  showAdjustments = false,
  showGrid = true,
  submitLabel,
}: ImageCropDialogContentProps) => {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [cropError, setCropError] = useState<string | null>(null);
  const [adjustments, setAdjustments] = useState<ImageAdjustments>(defaultAdjustments);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const busy = loading || removeLoading;
  const maxFileSizeLabel = maxFileBytes ? formatFileSize(maxFileBytes) : null;
  const imageSelectHelp = maxFileSizeLabel
    ? `${imageSelectDescription} Maximum ${maxFileSizeLabel} after cropping.`
    : imageSelectDescription;
  const imageStyle = showAdjustments
    ? {
        mediaStyle: getImageAdjustmentStyle(adjustments),
      }
    : undefined;

  const handleCropComplete = (_croppedArea: Area, nextCroppedAreaPixels: Area) => {
    setCroppedAreaPixels(nextCroppedAreaPixels);
  };

  const handleZoomChange = (value: number[]) => {
    setZoom(value[0] ?? 1);
  };

  const handleAdjustmentChange = (key: keyof ImageAdjustments, value: number[]) => {
    setAdjustments((current) => ({
      ...current,
      [key]: value[0] ?? defaultAdjustments[key],
    }));
  };

  const handleSelectImage = () => {
    fileInputRef.current?.click();
  };

  const handleImageFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];

    event.currentTarget.value = '';

    if (!file) {
      return;
    }

    setCropError(null);
    onImageSelect(file);
  };

  const handleSubmit = async () => {
    if (!imageUrl || !croppedAreaPixels) {
      return;
    }

    setCropError(null);

    let file: File;

    try {
      file = await createCroppedImageFile(
        imageUrl,
        croppedAreaPixels,
        output,
        showAdjustments ? adjustments : undefined,
        maxFileBytes,
      );
    } catch (error) {
      setCropError(error instanceof Error ? error.message : 'Image could not be cropped.');
      return;
    }

    await onSubmit(file);
  };

  return (
    <>
      <div className="grid gap-4">
        <Input ref={fileInputRef} accept={accept} className="hidden" onChange={handleImageFileChange} type="file" />
        {imageUrl ? (
          <>
            <div className="relative h-80 overflow-hidden rounded-lg bg-muted">
              <ImageCropper
                aspect={aspect}
                crop={crop}
                cropShape={cropShape}
                image={imageUrl}
                objectFit="contain"
                onCropChange={setCrop}
                onCropComplete={handleCropComplete}
                onZoomChange={setZoom}
                roundCropAreaPixels
                showGrid={showGrid}
                style={imageStyle}
                zoom={zoom}
              />
            </div>
            <ImageAdjustmentSlider
              disabled={busy}
              label="Zoom"
              max={3}
              min={1}
              onValueChange={handleZoomChange}
              step={0.1}
              suffix="x"
              value={zoom}
            />
            {showAdjustments ? (
              <div className="grid gap-3">
                <ImageAdjustmentSlider
                  disabled={busy}
                  label="Opacity"
                  max={100}
                  min={0}
                  onValueChange={(value) => handleAdjustmentChange('opacity', value)}
                  suffix="%"
                  value={adjustments.opacity}
                />
                <ImageAdjustmentSlider
                  disabled={busy}
                  label="Brightness"
                  max={150}
                  min={50}
                  onValueChange={(value) => handleAdjustmentChange('brightness', value)}
                  suffix="%"
                  value={adjustments.brightness}
                />
                <ImageAdjustmentSlider
                  disabled={busy}
                  label="Blur"
                  max={16}
                  min={0}
                  onValueChange={(value) => handleAdjustmentChange('blur', value)}
                  suffix="px"
                  value={adjustments.blur}
                />
              </div>
            ) : null}
          </>
        ) : (
          <Button
            variant="outline"
            className="flex h-80 w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-muted/40 text-center transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={busy}
            onClick={handleSelectImage}
            type="button"
          >
            <span className="flex size-10 items-center justify-center rounded-full bg-background text-muted-foreground shadow-sm ring-1 ring-border">
              <ImageUpIcon className="size-5" />
            </span>
            <span className="grid gap-1">
              <span className="text-sm font-medium">{imageSelectLabel}</span>
              <span className="text-xs text-muted-foreground">{imageSelectHelp}</span>
            </span>
          </Button>
        )}
        <FormMessage message={cropError ?? error} variant="error" />
      </div>
      <DialogFooter className="flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        {onRemove ? (
          <div className="w-full sm:w-auto">
            <ConfirmActionDialog
              confirmLabel={removeLabel ?? 'Remove image'}
              description="This image will be removed immediately."
              onConfirm={onRemove}
              title="Remove image?"
            >
              <Button className="w-full sm:w-auto" disabled={busy} type="button" variant="destructive">
                <Trash2Icon />
                {removeLoading ? 'Removing' : (removeLabel ?? 'Remove image')}
              </Button>
            </ConfirmActionDialog>
          </div>
        ) : null}
        <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-1 sm:flex-row sm:flex-wrap sm:justify-end">
          {imageUrl ? (
            <Button
              className="w-full sm:w-auto"
              disabled={busy}
              onClick={handleSelectImage}
              type="button"
              variant="outline"
            >
              <ImageUpIcon />
              Choose
            </Button>
          ) : null}
          <DialogClose asChild>
            <Button className="w-full sm:w-auto" disabled={busy} type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <Button
            className="w-full sm:w-auto"
            disabled={busy || !croppedAreaPixels}
            onClick={handleSubmit}
            type="button"
          >
            <ImageUpIcon />
            {loading ? 'Uploading' : submitLabel}
          </Button>
        </div>
      </DialogFooter>
    </>
  );
};

function ImageAdjustmentSlider({
  disabled,
  label,
  max,
  min,
  onValueChange,
  step = 1,
  suffix,
  value,
}: {
  disabled?: boolean;
  label: string;
  max: number;
  min: number;
  onValueChange: (value: number[]) => void;
  step?: number;
  suffix: string;
  value: number;
}) {
  const id = `image${label.replaceAll(' ', '')}`;
  const displayValue = step < 1 ? value.toFixed(1) : Math.round(value).toString();

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        <span className="text-xs tabular-nums text-muted-foreground">
          {displayValue}
          {suffix}
        </span>
      </div>
      <Slider
        disabled={disabled}
        id={id}
        max={max}
        min={min}
        onValueChange={onValueChange}
        step={step}
        value={[value]}
      />
    </div>
  );
}

async function createCroppedImageFile(
  imageUrl: string,
  cropArea: Area,
  output: CropOutput,
  adjustments?: ImageAdjustments,
  maxFileBytes?: number,
) {
  const image = await loadImage(imageUrl);
  const sourceX = Math.max(0, Math.round(cropArea.x));
  const sourceY = Math.max(0, Math.round(cropArea.y));
  const sourceWidth = Math.min(Math.round(cropArea.width), image.naturalWidth - sourceX);
  const sourceHeight = Math.min(Math.round(cropArea.height), image.naturalHeight - sourceY);

  if (sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error('Image crop area is invalid.');
  }

  const contentType = output.contentType ?? 'image/png';
  const blob = await createCompressedImageBlob({
    adjustments,
    contentType,
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

function getImageAdjustmentStyle(adjustments: ImageAdjustments): CSSProperties {
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
    height: output.height,
    image,
    sourceHeight,
    sourceWidth,
    sourceX,
    sourceY,
    width: output.width,
  });

  for (const quality of getCompressionQualities(contentType)) {
    const blob = await createCanvasBlob(canvas, contentType, quality);

    if (!smallestBlob || blob.size < smallestBlob.size) {
      smallestBlob = blob;
    }

    if (!maxFileBytes || blob.size <= maxFileBytes) {
      return blob;
    }
  }

  throw new Error(
    smallestBlob
      ? `Image could not be compressed below ${formatFileSize(maxFileBytes ?? smallestBlob.size)}.`
      : 'Image could not be cropped.',
  );
}

function createCroppedCanvas({
  adjustments,
  height,
  image,
  sourceHeight,
  sourceWidth,
  sourceX,
  sourceY,
  width,
}: {
  adjustments?: ImageAdjustments;
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
    throw new Error('Image could not be cropped.');
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

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Image could not be loaded.'));
    image.src = source;
  });
}

function createCanvasBlob(canvas: HTMLCanvasElement, contentType: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Image could not be cropped.'));
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

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  const megabytes = bytes / (1024 * 1024);
  const roundedMegabytes = Number.isInteger(megabytes) ? megabytes.toFixed(0) : megabytes.toFixed(1);

  return `${roundedMegabytes} MB`;
}

export default Index;
