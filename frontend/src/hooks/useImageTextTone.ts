import { type RefObject, useEffect, useState } from 'react';

import { FastAverageColor } from 'fast-average-color';

export type ImageTextTone = 'dark' | 'default' | 'light';

interface ImageTextToneSample {
  imageUrl: string;
  tone: ImageTextTone;
}

interface ImageTextToneOptions {
  containerRef?: RefObject<HTMLElement | null>;
  targetRef?: RefObject<HTMLElement | null>;
}

interface HeaderTextSampleTarget {
  container: HTMLElement | null;
  target: HTMLElement | null;
}

interface ImageSampleArea {
  height: number;
  width: number;
  x: number;
  y: number;
}

const sampleWidth = 48;
const sampleHeight = 24;
const samplePadding = 6;

export function useImageTextTone(imageUrl: string | null, options: ImageTextToneOptions = {}) {
  const { containerRef, targetRef } = options;
  const [sample, setSample] = useState<ImageTextToneSample | null>(null);

  useEffect(() => {
    if (!imageUrl) {
      return;
    }

    let isActive = true;
    let resizeObserver: ResizeObserver | null = null;
    const averageColor = new FastAverageColor();
    const image = new Image();
    const updateTone = () => {
      if (!isActive) {
        return;
      }

      setSample({
        imageUrl,
        tone: getReadableTextTone(averageColor, image, {
          container: containerRef?.current ?? null,
          target: targetRef?.current ?? null,
        }),
      });
    };

    image.crossOrigin = 'anonymous';
    image.onload = () => {
      if (!isActive) {
        return;
      }

      updateTone();

      if (typeof ResizeObserver === 'undefined') {
        return;
      }

      const observedElements = [containerRef?.current, targetRef?.current].filter((element): element is HTMLElement =>
        Boolean(element),
      );

      if (observedElements.length === 0) {
        return;
      }

      resizeObserver = new ResizeObserver(updateTone);
      observedElements.forEach((element) => resizeObserver?.observe(element));
    };
    image.onerror = () => {
      if (!isActive) {
        return;
      }

      setSample({
        imageUrl,
        tone: 'default',
      });
    };
    image.src = imageUrl;

    return () => {
      isActive = false;
      resizeObserver?.disconnect();
      averageColor.destroy();
    };
  }, [containerRef, imageUrl, targetRef]);

  if (!imageUrl || sample?.imageUrl !== imageUrl) {
    return 'default';
  }

  return sample.tone;
}

function getReadableTextTone(
  averageColor: FastAverageColor,
  image: HTMLImageElement,
  sampleTarget: HeaderTextSampleTarget,
): ImageTextTone {
  try {
    const canvas = createHeaderTextSampleCanvas(image, sampleTarget);

    if (!canvas) {
      return 'default';
    }

    const result = averageColor.getColor(canvas, {
      mode: 'precision',
      silent: true,
    });

    return result.isDark ? 'light' : 'dark';
  } catch {
    return 'default';
  }
}

function createHeaderTextSampleCanvas(image: HTMLImageElement, sampleTarget: HeaderTextSampleTarget) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });

  if (!context || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
    return null;
  }

  canvas.width = sampleWidth;
  canvas.height = sampleHeight;

  const source = getHeaderTextSampleArea(image.naturalWidth, image.naturalHeight, sampleTarget);

  context.fillStyle = getCompositeBackgroundColor();
  context.fillRect(0, 0, sampleWidth, sampleHeight);
  context.drawImage(image, source.x, source.y, source.width, source.height, 0, 0, sampleWidth, sampleHeight);

  return canvas;
}

function getHeaderTextSampleArea(
  imageWidth: number,
  imageHeight: number,
  sampleTarget: HeaderTextSampleTarget,
): ImageSampleArea {
  return (
    getMeasuredHeaderTextSampleArea(imageWidth, imageHeight, sampleTarget) ??
    getFallbackHeaderTextSampleArea(imageWidth, imageHeight)
  );
}

function getMeasuredHeaderTextSampleArea(
  imageWidth: number,
  imageHeight: number,
  { container, target }: HeaderTextSampleTarget,
): ImageSampleArea | null {
  if (!container || !target) {
    return null;
  }

  const containerRect = container.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();

  if (containerRect.width <= 0 || containerRect.height <= 0 || targetRect.width <= 0 || targetRect.height <= 0) {
    return null;
  }

  const imageScale = Math.max(containerRect.width / imageWidth, containerRect.height / imageHeight);
  const renderedWidth = imageWidth * imageScale;
  const renderedHeight = imageHeight * imageScale;
  const imageOffsetX = (containerRect.width - renderedWidth) / 2;
  const imageOffsetY = (containerRect.height - renderedHeight) / 2;
  const targetLeft = targetRect.left - containerRect.left - samplePadding;
  const targetTop = targetRect.top - containerRect.top - samplePadding;
  const targetRight = targetRect.right - containerRect.left + samplePadding;
  const targetBottom = targetRect.bottom - containerRect.top + samplePadding;

  return clampImageSampleArea(
    {
      height: (targetBottom - targetTop) / imageScale,
      width: (targetRight - targetLeft) / imageScale,
      x: (targetLeft - imageOffsetX) / imageScale,
      y: (targetTop - imageOffsetY) / imageScale,
    },
    imageWidth,
    imageHeight,
  );
}

function getFallbackHeaderTextSampleArea(imageWidth: number, imageHeight: number): ImageSampleArea {
  const width = Math.max(1, Math.round(imageWidth * 0.3));
  const height = Math.max(1, Math.round(imageHeight * 0.32));
  const x = Math.max(0, Math.round(imageWidth * 0.08));
  const y = Math.max(0, Math.round((imageHeight - height) / 2));

  return {
    height,
    width,
    x,
    y,
  };
}

function clampImageSampleArea(area: ImageSampleArea, imageWidth: number, imageHeight: number): ImageSampleArea | null {
  const x = clamp(Math.round(area.x), 0, imageWidth - 1);
  const y = clamp(Math.round(area.y), 0, imageHeight - 1);
  const right = clamp(Math.round(area.x + area.width), x + 1, imageWidth);
  const bottom = clamp(Math.round(area.y + area.height), y + 1, imageHeight);

  if (right <= x || bottom <= y) {
    return null;
  }

  return {
    height: bottom - y,
    width: right - x,
    x,
    y,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getCompositeBackgroundColor() {
  if (typeof document === 'undefined') {
    return '#ffffff';
  }

  return document.documentElement.classList.contains('dark') ? '#09090b' : '#ffffff';
}
