import { INVALID_AUTH_TOKEN_MESSAGE, normalizeAuthToken } from './auth';

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
  } else if (!normalizeAuthToken(values.authToken)) {
    errors.push(INVALID_AUTH_TOKEN_MESSAGE);
    setFieldError('authToken', INVALID_AUTH_TOKEN_MESSAGE);
  }
  return { errors, fieldErrors: nextFieldErrors };
};
