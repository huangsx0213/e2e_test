import React, { useEffect, useRef, useState } from 'react';

type BaseProps = {
  value: string;
  onSave: (value: string) => void | Promise<void>;
  debounceMs?: number;
};

type InputProps = BaseProps &
  Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'defaultValue' | 'onChange'> & {
    multiline?: false;
  };

type TextareaProps = BaseProps &
  Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'defaultValue' | 'onChange'> & {
    multiline: true;
  };

type AutosaveTextFieldProps = InputProps | TextareaProps;

export function AutosaveTextField(props: AutosaveTextFieldProps) {
  const { value, onSave, debounceMs = 250, multiline = false, ...rest } = props;
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);
  const timerRef = useRef<number | null>(null);
  const draftRef = useRef(value);
  const saveRef = useRef(onSave);

  useEffect(() => {
    saveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    if (!focused) {
      setDraft(value);
      draftRef.current = value;
    }
  }, [value, focused]);

  const flush = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (draftRef.current !== value) {
      const nextValue = draftRef.current;
      void saveRef.current(nextValue);
    }
  };

  useEffect(() => {
    if (!focused) return;

    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }

    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      if (draftRef.current !== value) {
        void saveRef.current(draftRef.current);
      }
    }, debounceMs);

    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [draft, focused, debounceMs, value]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
      if (draftRef.current !== value) {
        void saveRef.current(draftRef.current);
      }
    };
  }, [value]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const nextValue = event.target.value;
    draftRef.current = nextValue;
    setDraft(nextValue);
  };

  const handleBlur = () => {
    setFocused(false);
    flush();
  };

  const commonProps = {
    ...rest,
    value: draft,
    onChange: handleChange,
    onFocus: () => setFocused(true),
    onBlur: handleBlur,
  };

  if (multiline) {
    return <textarea {...(commonProps as React.TextareaHTMLAttributes<HTMLTextAreaElement>)} />;
  }

  return <input {...(commonProps as React.InputHTMLAttributes<HTMLInputElement>)} />;
}
