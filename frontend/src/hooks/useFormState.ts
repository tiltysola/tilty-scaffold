import { type ChangeEvent, useCallback, useState } from 'react';

export function useFormState<T extends { [K in keyof T]: string }>(initialValue: T) {
  const [form, setForm] = useState(initialValue);

  const handleChange = useCallback(
    (field: keyof T) => (event: ChangeEvent<HTMLInputElement>) => {
      setForm((current) => ({
        ...current,
        [field]: event.target.value,
      }));
    },
    [],
  );

  return {
    form,
    handleChange,
    setForm,
  };
}
