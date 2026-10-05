import assert from 'node:assert/strict';
import test from 'node:test';
import { createUnsavedChangesGuard } from './unsavedChangesGuard.js';
import { getProfileSaveChanges } from './profileSave.js';

test('runs an action immediately when there are no unsaved changes', () => {
  const guard = createUnsavedChangesGuard();
  let actionCount = 0;
  let confirmationCount = 0;

  const completed = guard.request(
    () => { actionCount += 1; },
    false,
    () => { confirmationCount += 1; },
  );

  assert.equal(completed, true);
  assert.equal(actionCount, 1);
  assert.equal(confirmationCount, 0);
});

test('retains the intended action until confirmed and discards before running it', () => {
  const guard = createUnsavedChangesGuard();
  const sequence = [];
  guard.request(
    () => { sequence.push('navigate-to-saved'); },
    true,
    () => { sequence.push('show-confirmation'); },
  );

  assert.deepEqual(sequence, ['show-confirmation']);
  guard.confirm(() => { sequence.push('discard-draft'); });
  assert.deepEqual(sequence, ['show-confirmation', 'discard-draft', 'navigate-to-saved']);
});

test('canceling clears the pending action without discarding changes', () => {
  const guard = createUnsavedChangesGuard();
  let actionCount = 0;
  let discardCount = 0;
  guard.request(() => { actionCount += 1; }, true, () => {});
  guard.cancel();
  guard.confirm(() => { discardCount += 1; });

  assert.equal(actionCount, 0);
  assert.equal(discardCount, 0);
});

test('preserves logout as the requested action after confirmation', () => {
  const guard = createUnsavedChangesGuard();
  const sequence = [];
  guard.request(() => { sequence.push('open-logout-confirmation'); }, true, () => {});
  assert.deepEqual(sequence, []);
  guard.confirm(() => { sequence.push('discard-draft'); });
  assert.deepEqual(sequence, ['discard-draft', 'open-logout-confirmation']);
});

test('preserves back-to-settings as the requested action after confirmation', () => {
  const guard = createUnsavedChangesGuard();
  const sequence = [];
  guard.request(() => { sequence.push('navigate-to-settings-main'); }, true, () => {
    sequence.push('show-unsaved-modal');
  });
  assert.deepEqual(sequence, ['show-unsaved-modal']);
  guard.confirm(() => { sequence.push('discard-draft'); });
  assert.deepEqual(sequence, ['show-unsaved-modal', 'discard-draft', 'navigate-to-settings-main']);
});

test('preserves analyze navigation as the requested action after confirmation', () => {
  const guard = createUnsavedChangesGuard();
  const sequence = [];
  guard.request(() => { sequence.push('navigate-to-analyze'); }, true, () => {
    sequence.push('show-unsaved-modal');
  });
  assert.deepEqual(sequence, ['show-unsaved-modal']);
  guard.confirm(() => { sequence.push('discard-draft'); });
  assert.deepEqual(sequence, ['show-unsaved-modal', 'discard-draft', 'navigate-to-analyze']);
});

test('no-op when field is edited and reverted to original saved value', () => {
  const savedProfile = { username: 'johndoe', firstName: 'John', lastName: 'Doe' };
  const editedDraft = { username: 'johndoe', firstName: 'Johnny', lastName: 'Doe' };
  const revertedDraft = { username: 'johndoe', firstName: 'John', lastName: 'Doe' };

  assert.equal(getProfileSaveChanges(savedProfile, editedDraft).length, 1);
  assert.equal(getProfileSaveChanges(savedProfile, revertedDraft).length, 0);
});

test('no-op when avatar selection is reverted without custom avatar in saved profile', () => {
  const savedProfile = { username: 'johndoe', firstName: 'John', lastName: 'Doe', avatarUrl: null, isCustomAvatar: false };
  const pendingAvatarAction = { type: 'upload', file: { name: 'test.jpg' } };

  assert.equal(getProfileSaveChanges(savedProfile, savedProfile, pendingAvatarAction).length, 1);
  assert.equal(getProfileSaveChanges(savedProfile, savedProfile, null).length, 0);
});
