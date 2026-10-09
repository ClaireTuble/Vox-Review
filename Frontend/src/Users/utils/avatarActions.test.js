import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSupabaseUser } from '../../services/userProfileSync.js';
import { getProfileSaveChanges, persistProfileDraft } from './profileSave.js';

const savedProfile = {
  username: 'testuser',
  firstName: 'Test',
  lastName: 'User',
  avatarUrl: 'https://example.com/custom-avatar.jpg',
  googleAvatarUrl: 'https://example.com/google-avatar.jpg',
  isCustomAvatar: true,
};

function createAuthService() {
  const calls = [];
  return {
    calls,
    async uploadAvatar(file) {
      calls.push(['uploadAvatar', file]);
      return { success: true, avatarUrl: 'https://example.com/new-avatar.jpg' };
    },
    async removeAvatar() {
      calls.push(['removeAvatar']);
      return { success: true, avatarUrl: 'https://example.com/google-avatar.jpg' };
    },
    async updateUserProfile(updates) {
      calls.push(['updateUserProfile', updates]);
      return {
        success: true,
        user: {
          ...savedProfile,
          ...updates,
          avatarUrl: updates.avatarUrl === null
            ? 'https://example.com/google-avatar.jpg'
            : updates.avatarUrl || savedProfile.avatarUrl,
          isCustomAvatar: updates.avatarUrl !== null,
        },
      };
    },
  };
}

test('selecting an image creates a pending change without calling persistence APIs', () => {
  const authService = createAuthService();
  const file = { name: 'new-photo.png', type: 'image/png' };
  const pendingAvatar = { file, previewUrl: 'blob:local-preview' };
  const changes = getProfileSaveChanges(savedProfile, savedProfile, {
    type: 'upload',
    file: pendingAvatar.file,
  });

  assert.equal(pendingAvatar.previewUrl, 'blob:local-preview');
  assert.equal(changes.some((change) => change.label === 'Profile picture'), true);
  assert.deepEqual(authService.calls, []);
});

test('canceling the save confirmation leaves the draft pending and does not persist it', () => {
  const authService = createAuthService();
  const draft = { username: 'newuser', firstName: 'New', lastName: 'Name' };
  const changes = getProfileSaveChanges(savedProfile, draft, { type: 'upload', file: {} });

  assert.equal(changes.length, 4);
  assert.deepEqual(authService.calls, []);
});

test('confirming one save uploads the pending image and saves all profile fields', async () => {
  const authService = createAuthService();
  const file = { name: 'new-photo.png' };
  let sharedProfile = savedProfile;

  const updatedUser = await persistProfileDraft({
    authService,
    username: 'newuser',
    firstName: 'New',
    lastName: 'Name',
    avatarAction: { type: 'upload', file },
    onPersisted: (profile) => { sharedProfile = profile; },
  });

  assert.deepEqual(authService.calls, [
    ['uploadAvatar', file],
    ['updateUserProfile', {
      username: 'newuser',
      firstName: 'New',
      lastName: 'Name',
      avatarUrl: 'https://example.com/new-avatar.jpg',
    }],
  ]);
  assert.equal(updatedUser.avatarUrl, 'https://example.com/new-avatar.jpg');
  assert.equal(sharedProfile, updatedUser);
});

test('confirming removal deletes the custom avatar only at save time and retains Google fallback', async () => {
  const authService = createAuthService();
  const changes = getProfileSaveChanges(savedProfile, savedProfile, { type: 'remove' });
  assert.equal(changes.length, 1);
  assert.deepEqual(authService.calls, []);

  const updatedUser = await persistProfileDraft({
    authService,
    username: savedProfile.username,
    firstName: savedProfile.firstName,
    lastName: savedProfile.lastName,
    avatarAction: { type: 'remove' },
  });

  assert.deepEqual(authService.calls, [
    ['removeAvatar'],
    ['updateUserProfile', {
      username: 'testuser',
      firstName: 'Test',
      lastName: 'User',
      avatarUrl: null,
    }],
  ]);
  assert.equal(updatedUser.avatarUrl, 'https://example.com/google-avatar.jpg');
  assert.equal(updatedUser.isCustomAvatar, false);
});

test('personal information remains pending until persistence is explicitly confirmed', async () => {
  const authService = createAuthService();
  const draft = { username: 'newuser', firstName: 'New', lastName: 'Name' };
  assert.equal(getProfileSaveChanges(savedProfile, draft).length, 3);
  assert.deepEqual(authService.calls, []);

  await persistProfileDraft({ authService, ...draft });

  assert.deepEqual(authService.calls, [[
    'updateUserProfile',
    { username: 'newuser', firstName: 'New', lastName: 'Name' },
  ]]);
});

test('no-op profile save has no changes and does not call persistence APIs', () => {
  const authService = createAuthService();
  const changes = getProfileSaveChanges(savedProfile, savedProfile);

  assert.deepEqual(changes, []);
  assert.deepEqual(authService.calls, []);
});

test('failed persistence leaves the draft available for retry', async () => {
  const authService = createAuthService();
  let sharedProfile = savedProfile;
  authService.updateUserProfile = async () => {
    authService.calls.push(['updateUserProfile']);
    throw new Error('Profile update failed.');
  };
  const draft = { username: 'retry-user', firstName: 'Retry', lastName: 'User' };

  await assert.rejects(
    persistProfileDraft({
      authService,
      ...draft,
      avatarAction: { type: 'upload', file: { name: 'pending.png' } },
      onPersisted: (profile) => { sharedProfile = profile; },
    }),
    /Profile update failed/,
  );
  assert.deepEqual(authService.calls, [
    ['uploadAvatar', { name: 'pending.png' }],
    ['updateUserProfile'],
  ]);
  assert.equal(getProfileSaveChanges(savedProfile, draft, { type: 'upload' }).length, 3);
  assert.equal(sharedProfile, savedProfile);
});

test('avatar normalization preserves custom, Google, then initials precedence', () => {
  const googleAvatarUrl = 'https://example.com/google-avatar.jpg';
  const custom = normalizeSupabaseUser({
    user_metadata: {
      custom_avatar_url: 'https://example.com/custom-avatar.jpg',
      google_avatar_url: googleAvatarUrl,
    },
  });
  const google = normalizeSupabaseUser({
    user_metadata: { google_avatar_url: googleAvatarUrl },
  });
  const fallback = normalizeSupabaseUser({ user_metadata: {} });

  assert.equal(custom.avatarUrl, 'https://example.com/custom-avatar.jpg');
  assert.equal(custom.isCustomAvatar, true);
  assert.equal(custom.googleAvatarUrl, googleAvatarUrl);
  assert.equal(google.avatarUrl, googleAvatarUrl);
  assert.equal(google.isCustomAvatar, false);
  assert.equal(fallback.avatarUrl, null);
  assert.equal(fallback.isCustomAvatar, false);
});
