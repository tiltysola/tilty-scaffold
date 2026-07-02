import { useCallback, useEffect, useState } from 'react';
import { useIntl } from 'react-intl';

import { toast } from 'sonner';

import { getApiErrorMessage } from '@/lib/api';
import {
  type AuthUser,
  deleteAvatar,
  deleteProfileBackground,
  deleteProfileBanner,
  uploadAvatar,
  uploadProfileBackground,
  uploadProfileBanner,
} from '@/lib/auth';
import { createImageObjectUrl } from '@/lib/image-upload';

type ProfileImageMutation = (file: File) => Promise<AuthUser>;
type ProfileImageRemoveMutation = () => Promise<AuthUser>;

interface ProfileImageCropUploadMessages {
  removed: string;
  removeFailed: string;
  typeError: string;
  updated: string;
  uploadFailed: string;
}

interface ProfileImageCropUploadOptions {
  enabled: boolean;
  messages: ProfileImageCropUploadMessages;
  onUserUpdated: (user: AuthUser) => void;
  remove: ProfileImageRemoveMutation;
  upload: ProfileImageMutation;
}

interface UseProfileImageUploadsOptions {
  enabled: boolean;
  onUserUpdated: (user: AuthUser) => void;
}

function useProfileImageCropUpload({
  enabled,
  messages,
  onUserUpdated,
  remove,
  upload,
}: ProfileImageCropUploadOptions) {
  const [cropImageUrl, setCropImageUrl] = useState<string | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [open, setOpen] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadPending, setUploadPending] = useState(false);
  const busy = uploadPending || deletePending;

  const reset = useCallback(() => {
    setCropImageUrl(null);
    setUploadError(null);
  }, []);

  const openDialog = useCallback(() => {
    if (!enabled) {
      return;
    }

    setUploadError(null);
    setOpen(true);
  }, [enabled]);

  const handleImageSelect = useCallback(
    (file: File) => {
      const imageUrl = createImageObjectUrl(file, setUploadError, messages.typeError);

      if (!imageUrl) {
        setCropImageUrl(null);
        return;
      }

      setCropImageUrl(imageUrl);
    },
    [messages.typeError],
  );

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        setOpen(true);
        return;
      }

      if (busy) {
        return;
      }

      setOpen(false);
      reset();
    },
    [busy, reset],
  );

  const handleRemove = useCallback(async () => {
    setDeletePending(true);

    try {
      const updatedUser = await remove();

      onUserUpdated(updatedUser);
      setOpen(false);
      reset();
      toast.success(messages.removed);
    } catch (error) {
      toast.error(getApiErrorMessage(error, messages.removeFailed));
    } finally {
      setDeletePending(false);
    }
  }, [messages.removeFailed, messages.removed, onUserUpdated, remove, reset]);

  const handleSubmit = useCallback(
    async (file: File) => {
      setUploadPending(true);
      setUploadError(null);

      try {
        const updatedUser = await upload(file);

        onUserUpdated(updatedUser);
        setOpen(false);
        reset();
        toast.success(messages.updated);
      } catch (error) {
        const message = getApiErrorMessage(error, messages.uploadFailed);

        setUploadError(message);
        toast.error(message);
      } finally {
        setUploadPending(false);
      }
    },
    [messages.updated, messages.uploadFailed, onUserUpdated, reset, upload],
  );

  useEffect(() => {
    return () => {
      if (cropImageUrl) {
        URL.revokeObjectURL(cropImageUrl);
      }
    };
  }, [cropImageUrl]);

  return {
    busy,
    cropImageUrl,
    deletePending,
    handleImageSelect,
    handleOpenChange,
    handleRemove,
    handleSubmit,
    open,
    openDialog,
    uploadError,
    uploadPending,
  };
}

export function useProfileImageUploads({ enabled, onUserUpdated }: UseProfileImageUploadsOptions) {
  const intl = useIntl();
  const typeError = intl.formatMessage({ id: 'profile.image.type.error' });
  const avatarLabel = intl.formatMessage({ id: 'profile.avatar' });
  const bannerLabel = intl.formatMessage({ id: 'profile.banner' });
  const backgroundLabel = intl.formatMessage({ id: 'profile.background' });
  const avatar = useProfileImageCropUpload({
    enabled,
    messages: {
      removed: intl.formatMessage({ id: 'profile.avatar.removed' }),
      removeFailed: intl.formatMessage({ id: 'profile.image.remove.failed' }, { label: avatarLabel }),
      typeError,
      updated: intl.formatMessage({ id: 'profile.avatar.updated' }),
      uploadFailed: intl.formatMessage({ id: 'profile.avatar.upload.failed' }),
    },
    onUserUpdated,
    remove: deleteAvatar,
    upload: uploadAvatar,
  });
  const profileBanner = useProfileImageCropUpload({
    enabled,
    messages: {
      removed: intl.formatMessage({ id: 'profile.banner.removed' }),
      removeFailed: intl.formatMessage({ id: 'profile.image.remove.failed' }, { label: bannerLabel }),
      typeError,
      updated: intl.formatMessage({ id: 'profile.banner.updated' }),
      uploadFailed: intl.formatMessage({ id: 'profile.image.upload.failed' }, { label: bannerLabel }),
    },
    onUserUpdated,
    remove: deleteProfileBanner,
    upload: uploadProfileBanner,
  });
  const profileBackground = useProfileImageCropUpload({
    enabled,
    messages: {
      removed: intl.formatMessage({ id: 'profile.background.removed' }),
      removeFailed: intl.formatMessage({ id: 'profile.image.remove.failed' }, { label: backgroundLabel }),
      typeError,
      updated: intl.formatMessage({ id: 'profile.background.updated' }),
      uploadFailed: intl.formatMessage({ id: 'profile.image.upload.failed' }, { label: backgroundLabel }),
    },
    onUserUpdated,
    remove: deleteProfileBackground,
    upload: uploadProfileBackground,
  });

  return {
    avatar,
    profileBackground,
    profileBanner,
  };
}
