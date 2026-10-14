import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const profileView = await readFile(new URL('./ProfileView.jsx', import.meta.url), 'utf8');
const popupHtmlUrl = new URL('../../../extension/popup.html', import.meta.url);
const popupHtml = await readFile(popupHtmlUrl, 'utf8');
const popupScriptPath = popupHtml.match(/<script[^>]+src=["']([^"']+)["']/)?.[1];
assert.ok(popupScriptPath, 'Extension popup.html must reference its JavaScript bundle.');
const popupBundle = await readFile(new URL(popupScriptPath, popupHtmlUrl), 'utf8');

function getInputMarkup(id) {
  const idIndex = profileView.indexOf(`id="${id}"`);
  const inputStart = profileView.lastIndexOf('<input', idIndex);
  const inputEnd = profileView.indexOf('/>', idIndex);
  return idIndex < 0 || inputStart < 0 || inputEnd < 0
    ? ''
    : profileView.slice(inputStart, inputEnd + 2);
}

test('extension popup profile form allows Last Name to be blank', () => {
  assert.equal(popupScriptPath, './assets/popup.js');

  const lastNameField = getInputMarkup('edit-lastname');
  const profileForm = profileView.match(/<form(?=[^>]*onSubmit=\{handleSaveProfile\})[^>]*>/)?.[0];
  const formIndex = popupBundle.indexOf('className:`pf-form`');
  const formStart = popupBundle.lastIndexOf('(`form`,{', formIndex);
  const formEnd = popupBundle.indexOf('className:`pf-save-btn`', formStart);
  const builtProfileForm = popupBundle.slice(formStart, formEnd);

  assert.ok(lastNameField);
  assert.doesNotMatch(lastNameField, /\brequired\b/);
  assert.match(profileView, /Last Name \(Optional\)/);
  assert.ok(profileForm);
  assert.match(profileForm, /\bnoValidate\b/);
  assert.ok(formStart >= 0);
  assert.ok(formEnd > formStart);
  assert.match(builtProfileForm, /className:`pf-form`,noValidate:!0/);
  assert.match(builtProfileForm, /id:`edit-lastname`[^}]*placeholder:`Enter your last name`/);
  assert.doesNotMatch(builtProfileForm, /id:`edit-lastname`[^}]*required/);
  assert.match(builtProfileForm, /id:`edit-username`[^}]*required:!0/);
  assert.match(builtProfileForm, /id:`edit-firstname`[^}]*required:!0/);
  assert.match(builtProfileForm, /let \w+=\w+\(\{username:\w+,firstName:\w+\}\);if\(\w+\)/);
  assert.match(popupBundle, /Please fill out your username and first name\./);
});
