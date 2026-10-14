import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildProfileUser,
  normalizeSupabaseUser,
  shouldRefreshProfileForAuthChange,
} from './userProfileSync.js';

test('profile refresh preserves the fetched public avatar URL through normalization', () => {
  const user = buildProfileUser({
    id: 'user-1',
    email: 'person@example.com',
    username: 'person',
    avatarUrl: 'https://cdn.example.com/custom.png',
    isCustomAvatar: true,
  });

  assert.equal(user.avatarUrl, 'https://cdn.example.com/custom.png');
});

test('a null public avatar falls back to the existing Google avatar metadata', () => {
  const user = buildProfileUser(
    {
      id: 'google-user',
      email: 'person@example.com',
      avatarUrl: null,
    },
    {
      id: 'google-user',
      user_metadata: {
        picture: 'https://google.example.com/avatar.png',
      },
    },
  );

  assert.equal(user.avatarUrl, 'https://google.example.com/avatar.png');
});

test('custom avatar remains stable when a normalized user is restored again', () => {
  const restoredUser = normalizeSupabaseUser({
    id: 'user-1',
    email: 'person@example.com',
    user_metadata: {
      custom_avatar_url: 'https://cdn.example.com/custom.png',
      picture: 'https://google.example.com/avatar.png',
    },
  });

  assert.equal(
    normalizeSupabaseUser(restoredUser).avatarUrl,
    'https://cdn.example.com/custom.png',
  );
});

test('removing a custom avatar restores the Google avatar returned by the profile API', () => {
  const user = buildProfileUser(
    {
      id: 'google-user',
      email: 'person@example.com',
      avatarUrl: 'https://google.example.com/avatar.png',
      googleAvatarUrl: 'https://google.example.com/avatar.png',
      isCustomAvatar: false,
    },
    {
      id: 'google-user',
      avatarUrl: 'https://cdn.example.com/old-custom.png',
      user_metadata: {
        custom_avatar_url: 'https://cdn.example.com/old-custom.png',
        picture: 'https://google.example.com/avatar.png',
      },
    },
  );

  assert.equal(user.avatarUrl, 'https://google.example.com/avatar.png');
});

test('email/password users without an avatar resolve to the initial-letter fallback', () => {
  const user = normalizeSupabaseUser({
    id: 'email-user',
    email: 'ellen@example.com',
    user_metadata: { firstName: 'Ellen' },
  });

  assert.equal(user.avatarUrl, null);
  assert.equal((user.firstName || user.username || user.email || 'U').charAt(0).toUpperCase(), 'E');
});

test('profile-only session changes do not trigger another profile refresh', () => {
  let previousSession = null;
  let refreshCount = 0;
  const profileAvatars = [
    'https://google.example.com/avatar.png',
    'https://cdn.example.com/custom.png',
    'https://google.example.com/avatar.png',
    null,
  ];

  for (const avatarUrl of profileAvatars) {
    const nextSession = {
      token: 'same-auth-token',
      user: { id: 'user-1', avatarUrl },
    };
    if (shouldRefreshProfileForAuthChange(previousSession, nextSession)) {
      refreshCount += 1;
    }
    previousSession = nextSession;
  }

  assert.equal(refreshCount, 1);
});

test('a different authenticated user refreshes once, but token rotation does not', () => {
  const previousSession = {
    token: 'old-token',
    user: { id: 'user-1' },
  };

  assert.equal(
    shouldRefreshProfileForAuthChange(previousSession, {
      token: 'new-token',
      user: { id: 'user-1' },
    }),
    false,
  );
  assert.equal(
    shouldRefreshProfileForAuthChange(previousSession, {
      token: 'another-token',
      user: { id: 'user-2' },
    }),
    true,
  );
  assert.equal(shouldRefreshProfileForAuthChange(previousSession, null), false);
});

test('normalizing a user with blank or omitted last name produces clean profile name without duplicate spaces or undefined', () => {
  const userWithoutLast = normalizeSupabaseUser({
    id: 'user-no-last',
    email: 'claire@example.com',
    user_metadata: {
      username: 'clairet',
      firstName: 'Claire',
      lastName: '',
    },
  });

  assert.equal(userWithoutLast.firstName, 'Claire');
  assert.equal(userWithoutLast.lastName, '');
  assert.equal(userWithoutLast.name, 'Claire');
  assert.equal(userWithoutLast.name.includes('undefined'), false);
  assert.equal(userWithoutLast.name.includes('  '), false);

  const userOmittedLast = normalizeSupabaseUser({
    id: 'user-omitted-last',
    email: 'claire@example.com',
    user_metadata: {
      username: 'clairet',
      firstName: 'Claire',
    },
  });

  assert.equal(userOmittedLast.firstName, 'Claire');
  assert.equal(userOmittedLast.lastName, '');
  assert.equal(userOmittedLast.name, 'Claire');
  assert.equal(userOmittedLast.name.includes('undefined'), false);
  assert.equal(userOmittedLast.name.includes('  '), false);

  const userWhitespaceLast = normalizeSupabaseUser({
    id: 'user-whitespace-last',
    email: 'claire@example.com',
    user_metadata: {
      username: 'clairet',
      firstName: 'Claire',
      lastName: '   ',
    },
  });

  assert.equal(userWhitespaceLast.firstName, 'Claire');
  assert.equal(userWhitespaceLast.name, 'Claire');
  assert.equal(userWhitespaceLast.name.includes('undefined'), false);
  assert.equal(userWhitespaceLast.name.includes('  '), false);
});
