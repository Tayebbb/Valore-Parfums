// ─── Input Validation Utilities ────────────────────────────
// Centralized validation for all API endpoints

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

// ─── String Validators ────────────────────────────────────
export function validateString(
  value: unknown,
  fieldName: string,
  options: {
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    pattern?: RegExp;
    trim?: boolean;
  } = {},
): ValidationResult {
  const errors: ValidationError[] = [];
  const { required = true, minLength, maxLength = 500, pattern, trim = true } = options;

  let str = String(value || "");
  if (trim) str = str.trim();

  if (required && !str) {
    errors.push({ field: fieldName, message: `${fieldName} is required` });
  }

  if (!required && !str) {
    return { valid: true, errors: [] };
  }

  if (minLength && str.length < minLength) {
    errors.push({
      field: fieldName,
      message: `${fieldName} must be at least ${minLength} characters`,
    });
  }

  if (maxLength && str.length > maxLength) {
    errors.push({
      field: fieldName,
      message: `${fieldName} must not exceed ${maxLength} characters`,
    });
  }

  if (pattern && !pattern.test(str)) {
    errors.push({
      field: fieldName,
      message: `${fieldName} format is invalid`,
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ─── Number Validators ────────────────────────────────────
export function validateNumber(
  value: unknown,
  fieldName: string,
  options: {
    required?: boolean;
    min?: number;
    max?: number;
    integer?: boolean;
  } = {},
): ValidationResult {
  const errors: ValidationError[] = [];
  const { required = true, min, max, integer = false } = options;

  const num = Number(value);

  if (required && !Number.isFinite(num)) {
    errors.push({ field: fieldName, message: `${fieldName} must be a valid number` });
    return { valid: false, errors };
  }

  if (!required && !Number.isFinite(num)) {
    return { valid: true, errors: [] };
  }

  if (integer && !Number.isInteger(num)) {
    errors.push({
      field: fieldName,
      message: `${fieldName} must be an integer`,
    });
  }

  if (min !== undefined && num < min) {
    errors.push({
      field: fieldName,
      message: `${fieldName} must be at least ${min}`,
    });
  }

  if (max !== undefined && num > max) {
    errors.push({
      field: fieldName,
      message: `${fieldName} must not exceed ${max}`,
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ─── Email Validators ────────────────────────────────────
export function validateEmail(value: unknown, fieldName: string = "email"): ValidationResult {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const str = String(value || "").trim();

  if (!str) {
    return {
      valid: false,
      errors: [{ field: fieldName, message: `${fieldName} is required` }],
    };
  }

  if (!emailRegex.test(str)) {
    return {
      valid: false,
      errors: [{ field: fieldName, message: `${fieldName} format is invalid` }],
    };
  }

  return { valid: true, errors: [] };
}

// ─── Phone Validators ────────────────────────────────────
export function validatePhone(value: unknown, fieldName: string = "phone"): ValidationResult {
  const str = String(value || "").trim();

  if (!str) {
    return {
      valid: false,
      errors: [{ field: fieldName, message: `${fieldName} is required` }],
    };
  }

  // Bangladesh phone format: 01xxxxxxxxx (11 digits)
  if (!/^01\d{9}$/.test(str)) {
    return {
      valid: false,
      errors: [{ field: fieldName, message: `${fieldName} must be 11 digits starting with 01` }],
    };
  }

  return { valid: true, errors: [] };
}

// ─── URL Validators ────────────────────────────────────
export function validateUrl(value: unknown, fieldName: string = "url"): ValidationResult {
  const str = String(value || "").trim();

  if (!str) {
    return {
      valid: false,
      errors: [{ field: fieldName, message: `${fieldName} is required` }],
    };
  }

  try {
    new URL(str);
    return { valid: true, errors: [] };
  } catch {
    return {
      valid: false,
      errors: [{ field: fieldName, message: `${fieldName} is not a valid URL` }],
    };
  }
}

// ─── Batch Validation ────────────────────────────────────
export function validateBatch(validations: ValidationResult[]): ValidationResult {
  const errors: ValidationError[] = [];

  for (const result of validations) {
    errors.push(...result.errors);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ─── Common Field Validator Sets ────────────────────────────────
export function validateOrderData(data: {
  customerName?: unknown;
  customerEmail?: unknown;
  customerPhone?: unknown;
  deliveryAddress?: unknown;
}): ValidationResult {
  const validations: ValidationResult[] = [
    validateString(data.customerName, "customerName", { minLength: 2, maxLength: 100 }),
    validateEmail(data.customerEmail, "customerEmail"),
    validatePhone(data.customerPhone, "customerPhone"),
  ];

  if (data.deliveryAddress) {
    validations.push(
      validateString(data.deliveryAddress, "deliveryAddress", { minLength: 10, maxLength: 300 }),
    );
  }

  return validateBatch(validations);
}

export function validatePerfumeData(data: {
  name?: unknown;
  brand?: unknown;
  marketPricePerMl?: unknown;
  purchasePricePerMl?: unknown;
  totalStockMl?: unknown;
}): ValidationResult {
  const validations: ValidationResult[] = [
    validateString(data.name, "name", { minLength: 2, maxLength: 200 }),
    validateString(data.brand, "brand", { minLength: 2, maxLength: 100 }),
    validateNumber(data.marketPricePerMl, "marketPricePerMl", { min: 0.1 }),
    validateNumber(data.purchasePricePerMl, "purchasePricePerMl", { min: 0.1 }),
    validateNumber(data.totalStockMl, "totalStockMl", { min: 0, integer: true }),
  ];

  return validateBatch(validations);
}

export function validateDecantSizeData(data: { ml?: unknown; label?: unknown }): ValidationResult {
  const validations: ValidationResult[] = [
    validateNumber(data.ml, "ml", { min: 1, max: 1000, integer: true }),
    validateString(data.label, "label", { minLength: 1, maxLength: 50 }),
  ];

  return validateBatch(validations);
}

export function validateVoucherData(data: {
  code?: unknown;
  discountValue?: unknown;
  discountType?: unknown;
  minOrderValue?: unknown;
}): ValidationResult {
  const errors: ValidationError[] = [];

  const codeValidation = validateString(data.code, "code", {
    minLength: 3,
    maxLength: 50,
    pattern: /^[A-Z0-9_-]+$/,
  });
  errors.push(...codeValidation.errors);

  const valueValidation = validateNumber(data.discountValue, "discountValue", { min: 0 });
  errors.push(...valueValidation.errors);

  const typeStr = String(data.discountType || "");
  if (!["percentage", "fixed"].includes(typeStr)) {
    errors.push({
      field: "discountType",
      message: "discountType must be 'percentage' or 'fixed'",
    });
  }

  if (data.minOrderValue !== undefined) {
    const minValidation = validateNumber(data.minOrderValue, "minOrderValue", { min: 0 });
    errors.push(...minValidation.errors);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
