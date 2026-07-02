import { type ReactNode, useCallback, useEffect, useRef, useState, type WheelEvent } from 'react';

import { EyeIcon } from 'lucide-react';

import { ImagePreviewOverlay } from './ImagePreviewOverlay';

const previewMinScale = 0.5;
const previewMaxScale = 4;
const previewScaleStep = 0.15;
const previewTransitionMs = 180;

export function ImagePreviewDialog({
  children,
  imageAlt,
  imageUrl,
  open,
  onOpenChange,
  title,
}: {
  children: ReactNode;
  imageAlt: string;
  imageUrl: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
}) {
  const [previewRendered, setPreviewRendered] = useState(open);
  const [previewActive, setPreviewActive] = useState(false);
  const [previewScale, setPreviewScale] = useState(1);
  const closeTimerRef = useRef<number | null>(null);
  const previewImageRef = useRef<HTMLImageElement | null>(null);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const handleClosePreview = useCallback(() => {
    clearCloseTimer();
    setPreviewActive(false);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      setPreviewRendered(false);
      onOpenChange(false);
    }, previewTransitionMs);
  }, [clearCloseTimer, onOpenChange]);

  useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);

  useEffect(() => {
    if (open) {
      return;
    }

    const animationFrame = window.requestAnimationFrame(() => setPreviewActive(false));
    const closeTimer = window.setTimeout(() => setPreviewRendered(false), previewTransitionMs);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(closeTimer);
    };
  }, [open]);

  useEffect(() => {
    if (!previewRendered) {
      return;
    }

    const bodyOverflow = document.body.style.overflow;
    const handlePointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target;

      if (!(target instanceof Node) || previewImageRef.current?.contains(target)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      handleClosePreview();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleClosePreview();
      }
    };

    document.body.style.overflow = 'hidden';
    document.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = bodyOverflow;
      document.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleClosePreview, previewRendered]);

  const handleOpenPreview = () => {
    clearCloseTimer();
    setPreviewScale(1);
    setPreviewActive(false);
    setPreviewRendered(true);
    window.requestAnimationFrame(() => setPreviewActive(true));
    onOpenChange(true);
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    setPreviewScale((currentScale) => {
      const direction = event.deltaY < 0 ? 1 : -1;
      const nextScale = currentScale + direction * previewScaleStep;

      return Math.min(previewMaxScale, Math.max(previewMinScale, nextScale));
    });
  };

  return (
    <>
      <button
        aria-label={title}
        className="group relative flex size-full items-center justify-center overflow-hidden rounded-full outline-none transition hover:ring-2 hover:ring-ring/30 focus-visible:ring-2 focus-visible:ring-ring/50"
        onClick={handleOpenPreview}
        type="button"
      >
        {children}
        <span className="absolute inset-0 grid place-items-center bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <EyeIcon className="size-4" />
        </span>
      </button>
      {previewRendered ? (
        <ImagePreviewOverlay
          active={previewActive}
          imageAlt={imageAlt}
          imageRef={previewImageRef}
          imageUrl={imageUrl}
          onClose={handleClosePreview}
          onWheel={handleWheel}
          scale={previewScale}
          title={title}
        />
      ) : null}
    </>
  );
}

export function ImagePreviewTrigger({
  children,
  imageAlt,
  imageUrl,
  onOpenChange,
  open,
  title,
}: {
  children: ReactNode;
  imageAlt: string;
  imageUrl?: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  title: string;
}) {
  if (!imageUrl) {
    return <span className="flex size-full items-center justify-center rounded-full">{children}</span>;
  }

  return (
    <ImagePreviewDialog imageAlt={imageAlt} imageUrl={imageUrl} onOpenChange={onOpenChange} open={open} title={title}>
      {children}
    </ImagePreviewDialog>
  );
}

export function ImagePreviewMedia({ fallbackIcon, imageUrl }: { fallbackIcon: ReactNode; imageUrl?: string }) {
  if (imageUrl) {
    return <img alt="" className="size-full object-cover" src={imageUrl} />;
  }

  return fallbackIcon;
}
