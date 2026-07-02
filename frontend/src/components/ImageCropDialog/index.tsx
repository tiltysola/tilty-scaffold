import { useIntl } from 'react-intl';

import { AppDialogContent, AppDialogHeader, AppDialogRoot } from '@/components/AppDialog';

import { ImageCropDialogContent } from './ImageCropDialogContent';
import { type CropOutput } from './utils';

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

const Index = ({
  accept = 'image/png,image/jpeg,image/webp,image/gif',
  aspect,
  cropShape = 'rect',
  description,
  error,
  imageUrl,
  imageSelectDescription,
  imageSelectLabel,
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
  const intl = useIntl();

  return (
    <AppDialogRoot open={open} onOpenChange={onOpenChange}>
      <AppDialogContent className="sm:max-w-lg">
        <AppDialogHeader description={description} title={title} />
        <ImageCropDialogContent
          accept={accept}
          aspect={aspect}
          cropShape={cropShape}
          error={error}
          imageSelectDescription={imageSelectDescription ?? intl.formatMessage({ id: 'profile.image.help' })}
          imageSelectLabel={imageSelectLabel ?? intl.formatMessage({ id: 'profile.image.select' })}
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
      </AppDialogContent>
    </AppDialogRoot>
  );
};

export default Index;
