import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getSupabaseConfigurationError,
  getSupabaseProjectOrigin,
} from './supabaseConfiguration.js';

test('requires a project URL and public anon key', () => {
  assert.match(getSupabaseConfigurationError('', 'public-key'), /SUPABASE_URL/);
  assert.match(getSupabaseConfigurationError('https://project.supabase.co', ''), /SUPABASE_ANON_KEY/);
});

test('rejects the Supabase example project placeholder', () => {
  assert.match(
    getSupabaseConfigurationError('https://example.supabase.co', 'public-key'),
    /placeholder VITE_SUPABASE_URL/,
  );
});

test('accepts a configured project and exposes only its origin for manifest permissions', () => {
  assert.equal(getSupabaseConfigurationError('https://project-123.supabase.co/', 'public-key'), null);
  assert.equal(
    getSupabaseProjectOrigin('https://project-123.supabase.co/path'),
    'https://project-123.supabase.co',
  );
});

test('an unconfigured client rejects cloud requests locally with a configuration error', async () => {
  const environment = globalThis.process.env;
  const previousUrl = environment.VITE_SUPABASE_URL;
  const previousKey = environment.VITE_SUPABASE_ANON_KEY;
  delete environment.VITE_SUPABASE_URL;
  delete environment.VITE_SUPABASE_ANON_KEY;

  try {
    const { supabase, supabaseConfigurationError } = await import('./supabase.js?missing-config-test');
    assert.match(supabaseConfigurationError, /SUPABASE_URL/);
    const { error } = await supabase.from('saved_analyses').select('*');
    assert.match(error.message, /Supabase is not configured/);
  } finally {
    if (previousUrl === undefined) delete environment.VITE_SUPABASE_URL;
    else environment.VITE_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete environment.VITE_SUPABASE_ANON_KEY;
    else environment.VITE_SUPABASE_ANON_KEY = previousKey;
  }
});
