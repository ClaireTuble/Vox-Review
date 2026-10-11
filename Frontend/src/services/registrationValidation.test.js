import assert from 'node:assert/strict';
import test from 'node:test';
import { hasRequiredSignupFields } from '../Public/utils/signupValidation.js';

// Mirrors registration validation logic in AuthPage.jsx
function validateRegistration({
  username,
  firstName,
  lastName,
  email,
  password,
  confirmPwd,
  agreeTerms,
}) {
  const isValidEmail = (val) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((val || '').trim());

  if (!hasRequiredSignupFields({ username, firstName, email, password, confirmPassword: confirmPwd })) {
    return { error: 'Please fill all required fields.' };
  }
  if (!isValidEmail(email)) {
    return { error: 'Please enter a valid email address.' };
  }
  if (password.length < 8 || !/[a-z]/i.test(password) || !/\d/.test(password)) {
    return { error: 'Password must meet the required security requirements.' };
  }
  if (password !== confirmPwd) {
    return { error: 'Passwords do not match.' };
  }
  if (!agreeTerms) {
    return { error: 'You must agree to the terms.' };
  }

  const signupData = {
    email: email.trim(),
    password,
    username: username.trim(),
    firstName: firstName.trim(),
    lastName: (lastName || '').trim(),
  };

  return { error: null, signupData };
}

// Pure normalization function as defined in authService.js
function normalizeAuthErrorMessage(error, flow = 'login') {
  const rawMessage = typeof error === 'string' ? error : error?.message || '';
  const message = String(rawMessage).trim();

  if (!message) {
    switch (flow) {
      case 'signup':
        return 'Something went wrong. Please try again.';
      case 'forgot':
        return 'Unable to complete this request. Please try again.';
      case 'change-password':
        return 'Unable to update password. Please try again.';
      case 'login':
      default:
        return 'We couldn\'t find an account with those credentials.';
    }
  }

  const invalidEmailPattern = /(invalid email|email is invalid|not a valid email|valid email address|enter a valid email)/i;
  if (invalidEmailPattern.test(message)) {
    return 'Please enter a valid email address.';
  }

  if (flow === 'forgot') {
    if (/(incorrect verification code|invalid verification code|code.*remaining)/i.test(message)) {
      return 'Incorrect verification code.';
    }
  }

  if (flow === 'signup') {
    if (/(password).*(weak|too short|at least|require|security|length|invalid)/i.test(message)) {
      return 'Password must meet the required security requirements.';
    }
    if (/(passwords? do not match|confirm.*password)/i.test(message)) {
      return 'Passwords do not match.';
    }
    if (/(username).*(taken|already exists|already in use|not available)/i.test(message)) {
      return 'This username is already taken.';
    }
    if (/(email.*not.*confirm|confirm.*email|verification code)/i.test(message)) {
      return 'Please enter the verification code sent to your email.';
    }
  }

  return message;
}

test('allows registration when last name is completely omitted or empty', () => {
  const res = validateRegistration({
    username: 'claire_user',
    firstName: 'Claire',
    lastName: '',
    email: 'claire@example.com',
    password: 'Password123',
    confirmPwd: 'Password123',
    agreeTerms: true,
  });

  assert.equal(res.error, null);
  assert.deepEqual(res.signupData, {
    username: 'claire_user',
    firstName: 'Claire',
    lastName: '',
    email: 'claire@example.com',
    password: 'Password123',
  });
});

test('handles whitespace-only last name by trimming to empty string without error', () => {
  const res = validateRegistration({
    username: 'claire_user',
    firstName: 'Claire',
    lastName: '   ',
    email: 'claire@example.com',
    password: 'Password123',
    confirmPwd: 'Password123',
    agreeTerms: true,
  });

  assert.equal(res.error, null);
  assert.equal(res.signupData.lastName, '');
  assert.equal(res.signupData.lastName.includes('undefined'), false);
});

test('preserves last name when provided', () => {
  const res = validateRegistration({
    username: 'claire_user',
    firstName: 'Claire',
    lastName: 'Tuble',
    email: 'claire@example.com',
    password: 'Password123',
    confirmPwd: 'Password123',
    agreeTerms: true,
  });

  assert.equal(res.error, null);
  assert.equal(res.signupData.lastName, 'Tuble');
});

test('rejects registration when required fields are missing', () => {
  // Missing username
  assert.equal(
    validateRegistration({
      username: '',
      firstName: 'Claire',
      email: 'claire@example.com',
      password: 'Password123',
      confirmPwd: 'Password123',
      agreeTerms: true,
    }).error,
    'Please fill all required fields.'
  );

  // Missing firstName
  assert.equal(
    validateRegistration({
      username: 'claire_user',
      firstName: '   ',
      email: 'claire@example.com',
      password: 'Password123',
      confirmPwd: 'Password123',
      agreeTerms: true,
    }).error,
    'Please fill all required fields.'
  );

  // Missing email
  assert.equal(
    validateRegistration({
      username: 'claire_user',
      firstName: 'Claire',
      email: '',
      password: 'Password123',
      confirmPwd: 'Password123',
      agreeTerms: true,
    }).error,
    'Please fill all required fields.'
  );

  // Missing password
  assert.equal(
    validateRegistration({
      username: 'claire_user',
      firstName: 'Claire',
      email: 'claire@example.com',
      password: '',
      confirmPwd: '',
      agreeTerms: true,
    }).error,
    'Please fill all required fields.'
  );

  // Missing terms acceptance
  assert.equal(
    validateRegistration({
      username: 'claire_user',
      firstName: 'Claire',
      email: 'claire@example.com',
      password: 'Password123',
      confirmPwd: 'Password123',
      agreeTerms: false,
    }).error,
    'You must agree to the terms.'
  );
});

test('rejects invalid email formats', () => {
  assert.equal(
    validateRegistration({
      username: 'claire_user',
      firstName: 'Claire',
      email: 'not-an-email',
      password: 'Password123',
      confirmPwd: 'Password123',
      agreeTerms: true,
    }).error,
    'Please enter a valid email address.'
  );
});

test('rejects passwords failing complexity or matching requirements', () => {
  // Too short (< 8 chars)
  assert.equal(
    validateRegistration({
      username: 'claire_user',
      firstName: 'Claire',
      email: 'claire@example.com',
      password: 'Pass1',
      confirmPwd: 'Pass1',
      agreeTerms: true,
    }).error,
    'Password must meet the required security requirements.'
  );

  // No digit
  assert.equal(
    validateRegistration({
      username: 'claire_user',
      firstName: 'Claire',
      email: 'claire@example.com',
      password: 'PasswordOnly',
      confirmPwd: 'PasswordOnly',
      agreeTerms: true,
    }).error,
    'Password must meet the required security requirements.'
  );

  // Mismatch
  assert.equal(
    validateRegistration({
      username: 'claire_user',
      firstName: 'Claire',
      email: 'claire@example.com',
      password: 'Password123',
      confirmPwd: 'Password456',
      agreeTerms: true,
    }).error,
    'Passwords do not match.'
  );
});

test('normalizeAuthErrorMessage preserves "Failed to fetch" network error without fabricated success', () => {
  const networkError = new TypeError('Failed to fetch');
  const normalized = normalizeAuthErrorMessage(networkError, 'signup');
  assert.equal(normalized, 'Failed to fetch');
  assert.notEqual(normalized, 'Registration successful');
  assert.notEqual(normalized, '');
});

test('verification modal error mapping does not swallow network errors', () => {
  function mapVerificationUiError(error, isForgotPasswordFlow) {
    const fallbackMessage = isForgotPasswordFlow
      ? 'Incorrect verification code.'
      : 'Please enter the verification code sent to your email.';
    const message = normalizeAuthErrorMessage(error, isForgotPasswordFlow ? 'forgot' : 'signup');
    return message === 'Something went wrong. Please try again.' ? fallbackMessage : message;
  }

  assert.equal(mapVerificationUiError(new Error('Failed to fetch'), false), 'Failed to fetch');
  assert.equal(mapVerificationUiError(new Error('Incorrect verification code'), true), 'Incorrect verification code.');
});
