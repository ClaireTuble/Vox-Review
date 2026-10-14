import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const authPage = await readFile(new URL("./AuthPage.jsx", import.meta.url), "utf8");
const loginForm = authPage.split("/* ─── REGISTER FORM")[0];
const registerForm = authPage.split("/* ─── REGISTER FORM")[1].split("/* ─── BRANDING PANEL")[0];

test("login and registration forms both expose the Google OAuth button and divider", () => {
  for (const formSource of [loginForm, registerForm]) {
    assert.match(formSource, /className="ap-divider"><span>or continue with<\/span>/);
    assert.match(formSource, /className="ap-google-btn" onClick=\{handleGoogleSignIn\}/);
    assert.match(formSource, /Continue with Google/);
    assert.match(formSource, /authService\.signInWithGoogle\(\)/);
  }
});

test("Google registration does not enter email verification while password signup still does", () => {
  const googleHandler = registerForm.match(
    /const handleGoogleSignIn = async \(\) => \{[\s\S]*?\n  \};/,
  )?.[0];
  const emailSignupHandler = registerForm.match(
    /const handleSubmit = async \(ev\) => \{[\s\S]*?\n  \};/,
  )?.[0];

  assert.ok(googleHandler);
  assert.doesNotMatch(googleHandler, /requestSignupVerification|setShowVerificationModal/);
  assert.ok(emailSignupHandler);
  assert.match(emailSignupHandler, /requestSignupVerification\(signupData\)/);
  assert.match(authPage, /pathMode === 'login'/);
  assert.match(authPage, /navigate\('\/after-login', \{ replace: true \}\)/);
});
