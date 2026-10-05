import assert from 'node:assert/strict';
import test from 'node:test';

function getGuestHeaderViewModel(isLoggedIn, currentUser) {
  if (!isLoggedIn) {
    return {
      displayName: 'Guest User',
      secondaryText: 'Sign in to manage your account',
      isGuest: true,
      showPlaceholderUsername: false,
      hasSavedCount: false,
    };
  }

  const displayName = currentUser?.firstName || currentUser?.lastName
    ? `${currentUser?.firstName || ''} ${currentUser?.lastName || ''}`.trim()
    : currentUser?.fullName || (currentUser?.username ? `@${currentUser.username}` : (currentUser?.email?.split('@')[0] ? `@${currentUser.email.split('@')[0]}` : 'User'));

  return {
    displayName,
    secondaryText: currentUser?.email || '',
    username: currentUser?.username ? `@${currentUser.username}` : null,
    isGuest: false,
    showPlaceholderUsername: false,
    hasSavedCount: true,
  };
}

function getSavedTabLabel(isLoggedIn, savedCount = 0) {
  return isLoggedIn ? `Saved (${savedCount})` : 'Saved';
}

test('guest mode account header displays "Guest User" and secondary text', () => {
  const model = getGuestHeaderViewModel(false, null);
  assert.equal(model.displayName, 'Guest User');
  assert.equal(model.secondaryText, 'Sign in to manage your account');
  assert.equal(model.isGuest, true);
  assert.notEqual(model.displayName, '@user');
  assert.notEqual(model.displayName, 'User');
  assert.notEqual(model.displayName, 'Claire');
});

test('guest mode account header does not leak previous or placeholder user fields', () => {
  const model = getGuestHeaderViewModel(false, { username: 'claire_test', email: 'claire@example.com' });
  assert.equal(model.displayName, 'Guest User');
  assert.equal(model.secondaryText, 'Sign in to manage your account');
  assert.equal(model.isGuest, true);
});

test('authenticated mode displays actual user identity and email', () => {
  const model = getGuestHeaderViewModel(true, {
    firstName: 'Claire',
    lastName: 'Tuble',
    username: 'clairet',
    email: 'claire@example.com',
  });
  assert.equal(model.displayName, 'Claire Tuble');
  assert.equal(model.secondaryText, 'claire@example.com');
  assert.equal(model.username, '@clairet');
  assert.equal(model.isGuest, false);
});

test('saved tab label removes numeric count in guest mode', () => {
  assert.equal(getSavedTabLabel(false, 0), 'Saved');
  assert.equal(getSavedTabLabel(false, 3), 'Saved');
  assert.equal(getSavedTabLabel(false, 4), 'Saved');
  assert.equal(getSavedTabLabel(false, 100), 'Saved');
});

test('saved tab label preserves numeric count when authenticated', () => {
  assert.equal(getSavedTabLabel(true, 0), 'Saved (0)');
  assert.equal(getSavedTabLabel(true, 3), 'Saved (3)');
  assert.equal(getSavedTabLabel(true, 4), 'Saved (4)');
  assert.equal(getSavedTabLabel(true, 10), 'Saved (10)');
});
