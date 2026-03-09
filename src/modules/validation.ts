// Validation logic
export type FormValues = {
  classId: string;
  authToken: string;
};

export type FieldErrors = Partial<Record<keyof FormValues, string>>;
export type ValidationResult = {
  errors: string[];
  fieldErrors: FieldErrors;
};

// Use type-only re-exports for Svelte compatibility
export type { FormValues, FieldErrors, ValidationResult };


export const validateForm = (values: FormValues): ValidationResult => {
  const errors: string[] = [];
  const nextFieldErrors: FieldErrors = {};
  const setFieldError = (field: keyof FormValues, message: string): void => {
    if (!nextFieldErrors[field]) {
      nextFieldErrors[field] = message;
    }
  };
  if (!values.classId.trim()) {
    const message = '請輸入課程ID(class)。';
    errors.push(message);
    setFieldError('classId', message);
  }
  if (!values.authToken.trim()) {
    const message = '請輸入授權 Token。';
    errors.push(message);
    setFieldError('authToken', message);
  }
  return { errors, fieldErrors: nextFieldErrors };
};
