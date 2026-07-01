import { useState } from 'react';

interface ProfileListEditorOptions<TProfile> {
  normalizeForStorage: (profile: TProfile) => unknown;
  onValueChange: (value: string) => void;
  profiles: TProfile[];
}

export function useProfileListEditor<TProfile>({
  normalizeForStorage,
  onValueChange,
  profiles,
}: ProfileListEditorOptions<TProfile>) {
  const [activeProfileIndex, setActiveProfileIndex] = useState<number | null>(null);
  const activeProfile = activeProfileIndex === null ? null : (profiles[activeProfileIndex] ?? null);

  const updateProfiles = (nextProfiles: TProfile[]) => {
    onValueChange(JSON.stringify(nextProfiles.map(normalizeForStorage)));
  };

  const updateProfile = <TField extends keyof TProfile>(index: number, field: TField, fieldValue: TProfile[TField]) => {
    updateProfiles(
      profiles.map((profile, profileIndex) => (profileIndex === index ? { ...profile, [field]: fieldValue } : profile)),
    );
  };

  const openProfile = (index: number) => {
    setActiveProfileIndex(index);
  };

  const closeProfile = () => {
    setActiveProfileIndex(null);
  };

  const removeProfile = (index: number) => {
    updateProfiles(profiles.filter((_, profileIndex) => profileIndex !== index));

    if (activeProfileIndex === index) {
      setActiveProfileIndex(null);
    } else if (activeProfileIndex !== null && activeProfileIndex > index) {
      setActiveProfileIndex(activeProfileIndex - 1);
    }
  };

  return {
    activeProfile,
    activeProfileIndex,
    closeProfile,
    openProfile,
    removeProfile,
    updateProfile,
    updateProfiles,
  };
}
