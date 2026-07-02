import { type PointerEvent, type RefObject, type WheelEvent } from 'react';
import { createPortal } from 'react-dom';
import { useIntl } from 'react-intl';

import { XIcon } from 'lucide-react';

import { Button } from '@/shadcn/components/ui/button';

interface ImagePreviewOverlayProps {
  active: boolean;
  imageAlt: string;
  imageRef: RefObject<HTMLImageElement | null>;
  imageUrl: string;
  onClose: () => void;
  onWheel: (event: WheelEvent<HTMLDivElement>) => void;
  scale: number;
  title: string;
}

export function ImagePreviewOverlay({
  active,
  imageAlt,
  imageRef,
  imageUrl,
  onClose,
  onWheel,
  scale,
  title,
}: ImagePreviewOverlayProps) {
  const intl = useIntl();

  if (typeof document === 'undefined') {
    return null;
  }

  const handleOverlayPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();

    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  return createPortal(
    <div
      aria-label={title}
      aria-modal="true"
      className={`fixed inset-0 z-[80] grid place-items-center overflow-hidden p-6 opacity-0 transition-opacity duration-200 ease-out supports-backdrop-filter:backdrop-blur-sm ${
        active ? 'opacity-100' : ''
      }`}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={handleOverlayPointerDown}
      onWheel={onWheel}
      role="dialog"
      style={{
        background:
          'radial-gradient(circle at center, rgb(0 0 0 / 0.32) 0%, rgb(0 0 0 / 0.46) 55%, rgb(0 0 0 / 0.56) 100%)',
      }}
    >
      <Button
        aria-label={intl.formatMessage({ id: 'common.close.image.preview' })}
        className={`absolute right-5 top-5 rounded-full bg-black/25 text-white opacity-0 transition-opacity duration-200 hover:bg-black/45 hover:text-white ${
          active ? 'opacity-100' : ''
        }`}
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
        onPointerDown={(event) => event.stopPropagation()}
        size="icon"
        type="button"
        variant="ghost"
      >
        <XIcon />
      </Button>
      <img
        alt={imageAlt}
        className="max-h-[82dvh] max-w-[90vw] select-none object-contain transition-transform duration-200 ease-out"
        draggable={false}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        ref={imageRef}
        src={imageUrl}
        style={{ transform: `scale(${scale * (active ? 1 : 0.92)})` }}
      />
    </div>,
    document.body,
  );
}
