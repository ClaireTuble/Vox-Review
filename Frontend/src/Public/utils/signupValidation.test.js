import assert from 'node:assert/strict';
import test from 'node:test';

import { hasRequiredSignupFields } from './signupValidation.js';

test('signup allows an empty optional last name when required fields are present', () => {
  assert.equal(hasRequiredSignupFields({
    username: 'claire',
    firstName: 'Claire',
    email: 'claire@example.com',
    password: 'password1',
    confirmPassword: 'password1',
    lastName: '',
  }), true);
});

test('signup still requires a non-blank first name', () => {
  assert.equal(hasRequiredSignupFields({
    username: 'claire',
    firstName: '   ',
    email: 'claire@example.com',
    password: 'password1',
    confirmPassword: 'password1',
    lastName: 'Tuble',
  }), false);
});
