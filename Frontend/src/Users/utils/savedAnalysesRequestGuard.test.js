import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  createSavedAnalysesRequestGuard,
  getSavedAnalysesForUser,
} from './savedAnalysesRequestGuard.js';

function deferred() {
  let resolve;
  const promise = new Promise((complete) => { resolve = complete; });
  return { promise, resolve };
}

test('switching User A to signed out to User B hides each prior account immediately', () => {
  const guard = createSavedAnalysesRequestGuard();
  const userARecords = [{ id: 'a-record' }];
  const userBRecords = [{ id: 'b-record' }];
  let displayed = { userId: 'user-a', items: userARecords };

  guard.setActiveUser(null);
  assert.deepEqual(getSavedAnalysesForUser(displayed, null), []);

  guard.setActiveUser('user-b');
  assert.deepEqual(getSavedAnalysesForUser(displayed, 'user-b'), []);
  displayed = { userId: 'user-b', items: userBRecords };
  assert.deepEqual(getSavedAnalysesForUser(displayed, 'user-b'), userBRecords);
  assert.deepEqual(userARecords, [{ id: 'a-record' }]);
});

test('a delayed User A response cannot overwrite User B records after account switching', async () => {
  const guard = createSavedAnalysesRequestGuard();
  const requestA = deferred();
  const requestB = deferred();
  let displayed = { userId: null, items: [] };

  guard.setActiveUser('user-a');
  const ticketA = guard.begin('user-a');
  const responseA = requestA.promise.then((items) => {
    if (ticketA.isCurrent()) displayed = { userId: 'user-a', items };
  });

  guard.setActiveUser(null);
  assert.deepEqual(getSavedAnalysesForUser(displayed, null), []);
  guard.setActiveUser('user-b');
  const ticketB = guard.begin('user-b');
  const responseB = requestB.promise.then((items) => {
    if (ticketB.isCurrent()) displayed = { userId: 'user-b', items };
  });

  requestB.resolve([{ id: 'b-record' }]);
  await responseB;
  requestA.resolve([{ id: 'a-record' }]);
  await responseA;

  assert.deepEqual(displayed, { userId: 'user-b', items: [{ id: 'b-record' }] });
  assert.deepEqual(getSavedAnalysesForUser(displayed, 'user-b'), [{ id: 'b-record' }]);
});

test('logout clears only the in-memory view and invalidates outstanding requests', () => {
  const guard = createSavedAnalysesRequestGuard();
  const cloudRecords = [{ id: 'saved-cloud-record' }];
  const loggedInState = { userId: 'user-a', items: cloudRecords };

  guard.setActiveUser('user-a');
  assert.deepEqual(getSavedAnalysesForUser(loggedInState, 'user-a'), cloudRecords);
  const pendingRequest = guard.begin('user-a');
  guard.setActiveUser(null);
  const loggedOutState = { userId: null, items: [] };

  assert.deepEqual(getSavedAnalysesForUser(loggedOutState, null), []);
  assert.equal(pendingRequest.isCurrent(), false);
  assert.deepEqual(cloudRecords, [{ id: 'saved-cloud-record' }]);
});

test('SavedAnalysesView receives and keys reads by the authenticated user ID', async () => {
  const [component, popup] = await Promise.all([
    readFile(new URL('../components/SavedAnalysesView.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../pages/PopupPage.jsx', import.meta.url), 'utf8'),
  ]);
  assert.match(popup, /currentUserId=\{currentUser\?\.id \|\| null\}/);
  assert.match(component, /currentUserId = null/);
  assert.match(component, /requestGuardRef\.current\.setActiveUser/);
  assert.match(component, /getSavedAnalysesForUser\(savedItemsState, savedUserId\)/);
  assert.match(component, /request\.isCurrent\(\)/);
  assert.match(component, /supabaseConfigurationError/);
  assert.match(component, /Saved Analyses configuration error/);
  assert.match(component, /if \(!savedUserId\)/);
});
