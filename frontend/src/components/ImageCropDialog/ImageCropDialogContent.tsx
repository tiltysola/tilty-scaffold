import { type ChangeEvent, type ComponentType, type CSSProperties, useRef, useState } from 'react';
import CropperBase, { type Area, type Point } from 'react-easy-crop';
import { useIntl } from 'react-intl';

import { ImageUpIcon, Trash2Icon } from 'lucide-react';

import { Button } from '@/shadcn/components/ui/button';
import { Input } from '@/shadcn/components/ui/input';

import { AppDialogBody, AppDialogClose, AppDialogFooter } from '@/components/AppDialog';
import { ConfirmActionDialog } from '@/components/ConfirmActionDialog';
import FormMessage from '@/components/FormMessage';

import { ImageAdjustmentSlider } from './ImageAdjustmentSlider';
import {
  createCroppedImageFile,
  type CropOutput,
  defaultImageAdjustments,
  formatFileSize,
  getImageAdjustmentStyle,
  type ImageAdjustments,
  type ImageCropErrorMessages,
} from './utils';

interface ImageCropDialogContentProps {
  accept: string;
  aspect: number;
  cropShape?: 'rect' | 'round';
  error?: string | null;
  imageSelectDescription: string;
  imageSelectLabel: string;
  imageUrl: string | null;
  loading: boolean;
  maxFileBytes?: number;
  onImageSelect: (file: File) => void;
  onRemove?: () => Promise<void> | void;
  onSubmit: (file: File) => Promise<void> | void;
  output: CropOutput;
  removeLabel?: string;
  removeLoading?: boolean;
  showAdjustments?: boolean;
  showGrid?: boolean;
  submitLabel: string;
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

const ImageCropper = CropperBase as unknown as ComponentType<ImageCropperProps>;

export function ImageCropDialogContent({
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
}: ImageCropDialogContentProps) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [cropError, setCropError] = useState<string | null>(null);
  const [adjustments, setAdjustments] = useState<ImageAdjustments>(defaultImageAdjustments);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const intl = useIntl();
  const busy = loading || removeLoading;
  const maxFileSizeLabel = maxFileBytes ? formatFileSize(maxFileBytes) : null;
  const imageSelectHelp = maxFileSizeLabel
    ? intl.formatMessage(
        { id: 'profile.image.help.with.max.size' },
        { description: imageSelectDescription, size: maxFileSizeLabel },
      )
    : imageSelectDescription;
  const imageStyle = showAdjustments
    ? {
        mediaStyle: getImageAdjustmentStyle(adjustments),
      }
    : undefined;
  const errorMessages: ImageCropErrorMessages = {
    compressionFailed: (size) => intl.formatMessage({ id: 'profile.image.compress.failed.below' }, { size }),
    cropAreaInvalid: intl.formatMessage({ id: 'profile.image.crop.area.invalid' }),
    cropFailed: intl.formatMessage({ id: 'profile.image.crop.failed' }),
    loadFailed: intl.formatMessage({ id: 'profile.image.load.failed' }),
  };

  const handleCropComplete = (_croppedArea: Area, nextCroppedAreaPixels: Area) => {
    setCroppedAreaPixels(nextCroppedAreaPixels);
  };

  const handleZoomChange = (value: number[]) => {
    setZoom(value[0] ?? 1);
  };

  const handleAdjustmentChange = (key: keyof ImageAdjustments, value: number[]) => {
    setAdjustments((current) => ({
      ...current,
      [key]: value[0] ?? defaultImageAdjustments[key],
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
        errorMessages,
      );
    } catch (error) {
      setCropError(error instanceof Error ? error.message : intl.formatMessage({ id: 'profile.image.crop.failed' }));
      return;
    }

    await onSubmit(file);
  };

  return (
    <>
      <AppDialogBody contentClassName="grid gap-4">
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
              label={intl.formatMessage({ id: 'profile.image.zoom' })}
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
                  label={intl.formatMessage({ id: 'profile.image.opacity' })}
                  max={100}
                  min={0}
                  onValueChange={(value) => handleAdjustmentChange('opacity', value)}
                  suffix="%"
                  value={adjustments.opacity}
                />
                <ImageAdjustmentSlider
                  disabled={busy}
                  label={intl.formatMessage({ id: 'profile.image.brightness' })}
                  max={150}
                  min={50}
                  onValueChange={(value) => handleAdjustmentChange('brightness', value)}
                  suffix="%"
                  value={adjustments.brightness}
                />
                <ImageAdjustmentSlider
                  disabled={busy}
                  label={intl.formatMessage({ id: 'profile.image.blur' })}
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
      </AppDialogBody>
      <AppDialogFooter className="flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        {onRemove ? (
          <div className="w-full sm:w-auto">
            <ConfirmActionDialog
              confirmLabel={removeLabel ?? intl.formatMessage({ id: 'profile.image.remove.image' })}
              description={intl.formatMessage({ id: 'profile.image.remove.description' })}
              onConfirm={onRemove}
              title={intl.formatMessage({ id: 'profile.image.remove.title' })}
            >
              <Button className="w-full sm:w-auto" disabled={busy} type="button" variant="destructive">
                <Trash2Icon />
                {removeLoading
                  ? intl.formatMessage({ id: 'common.removing' })
                  : (removeLabel ?? intl.formatMessage({ id: 'profile.image.remove.image' }))}
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
              {intl.formatMessage({ id: 'common.choose' })}
            </Button>
          ) : null}
          <AppDialogClose asChild>
            <Button className="w-full sm:w-auto" disabled={busy} type="button" variant="outline">
              {intl.formatMessage({ id: 'common.cancel' })}
            </Button>
          </AppDialogClose>
          <Button
            className="w-full sm:w-auto"
            disabled={busy || !croppedAreaPixels}
            onClick={handleSubmit}
            type="button"
          >
            <ImageUpIcon />
            {loading ? intl.formatMessage({ id: 'common.uploading' }) : submitLabel}
          </Button>
        </div>
      </AppDialogFooter>
    </>
  );
}
