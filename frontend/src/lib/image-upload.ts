const allowedImageMimeTypes = new Set(['image/gif', 'image/jpeg', 'image/png', 'image/webp']);

export function createImageObjectUrl(file: File, setError: (message: string | null) => void, typeErrorMessage: string) {
  if (file.type && !allowedImageMimeTypes.has(file.type)) {
    setError(typeErrorMessage);
    return null;
  }

  setError(null);
  return URL.createObjectURL(file);
}
