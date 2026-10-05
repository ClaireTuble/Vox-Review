import assert from "node:assert/strict";
import test from "node:test";
import {
  ensureAvatarsBucket,
  isAllowedAvatarMimeType,
  resolveUserAvatar,
  uploadAvatar,
  removeAvatar,
} from "./userProfileController.js";

test("User Profile Avatar & OAuth picture unit tests", async (t) => {
  await t.test("1. Google OAuth user receives Google avatar by default", () => {
    const authUser = {
      id: "auth-google-1",
      email: "googleuser@gmail.com",
      user_metadata: {
        avatar_url: "https://lh3.googleusercontent.com/a/google-pic-123",
        picture: "https://lh3.googleusercontent.com/a/google-pic-123",
        full_name: "Google User",
      },
      identities: [
        {
          provider: "google",
          identity_data: {
            avatar_url: "https://lh3.googleusercontent.com/a/google-pic-123",
          },
        },
      ],
    };
    const userRow = {
      user_id: 1,
      auth_user_id: "auth-google-1",
      email: "googleuser@gmail.com",
      avatar_url: null,
    };

    const result = resolveUserAvatar(userRow, authUser);
    assert.equal(result.avatarUrl, "https://lh3.googleusercontent.com/a/google-pic-123");
    assert.equal(result.isCustom, false);
    assert.equal(result.googleAvatarUrl, "https://lh3.googleusercontent.com/a/google-pic-123");
  });

  await t.test("2. Custom uploaded picture takes priority over Google avatar", () => {
    const authUser = {
      id: "auth-google-2",
      email: "googleuser2@gmail.com",
      user_metadata: {
        avatar_url: "https://lh3.googleusercontent.com/a/google-pic-original",
        picture: "https://lh3.googleusercontent.com/a/google-pic-original",
        custom_avatar_url: "https://supabase.co/storage/v1/object/public/avatars/custom-avatar-456.png",
      },
    };
    const userRow = {
      user_id: 2,
      auth_user_id: "auth-google-2",
      email: "googleuser2@gmail.com",
      avatar_url: "https://supabase.co/storage/v1/object/public/avatars/custom-avatar-456.png",
    };

    const result = resolveUserAvatar(userRow, authUser);
    assert.equal(result.avatarUrl, "https://supabase.co/storage/v1/object/public/avatars/custom-avatar-456.png");
    assert.equal(result.isCustom, true);
    assert.equal(result.googleAvatarUrl, "https://lh3.googleusercontent.com/a/google-pic-original");
  });

  await t.test("3. Removing custom picture falls back to Google avatar for Google users", () => {
    const authUser = {
      id: "auth-google-3",
      email: "googleuser3@gmail.com",
      user_metadata: {
        avatar_url: "https://lh3.googleusercontent.com/a/google-pic-fallback",
        picture: "https://lh3.googleusercontent.com/a/google-pic-fallback",
        custom_avatar_url: null, // Custom avatar removed
      },
    };
    const userRow = {
      user_id: 3,
      auth_user_id: "auth-google-3",
      email: "googleuser3@gmail.com",
      avatar_url: null, // Cleared in DB
    };

    const result = resolveUserAvatar(userRow, authUser);
    assert.equal(result.avatarUrl, "https://lh3.googleusercontent.com/a/google-pic-fallback");
    assert.equal(result.isCustom, false);
    assert.equal(result.googleAvatarUrl, "https://lh3.googleusercontent.com/a/google-pic-fallback");
  });

  await t.test("4. Email/password users with no avatar fall back to null (initial letter)", () => {
    const authUser = {
      id: "auth-email-4",
      email: "emailuser@voxreview.ai",
      user_metadata: {
        firstName: "Claire",
        lastName: "Tuble",
        username: "claire",
      },
    };
    const userRow = {
      user_id: 4,
      auth_user_id: "auth-email-4",
      email: "emailuser@voxreview.ai",
      avatar_url: null,
    };

    const result = resolveUserAvatar(userRow, authUser);
    assert.equal(result.avatarUrl, null);
    assert.equal(result.isCustom, false);
    assert.equal(result.googleAvatarUrl, null);
  });

  await t.test("5. Removing custom picture falls back to null for email/password users", () => {
    const authUser = {
      id: "auth-email-5",
      email: "emailuser5@voxreview.ai",
      user_metadata: {
        firstName: "John",
        lastName: "Doe",
        custom_avatar_url: null,
      },
    };
    const userRow = {
      user_id: 5,
      auth_user_id: "auth-email-5",
      email: "emailuser5@voxreview.ai",
      avatar_url: null,
    };

    const result = resolveUserAvatar(userRow, authUser);
    assert.equal(result.avatarUrl, null);
    assert.equal(result.isCustom, false);
  });

  await t.test("6. Upload validation rejects invalid image MIME types", async () => {
    let statusCode = null;
    let jsonBody = null;

    const req = {
      authUser: { id: "test-user-id" },
      body: {
        dataUrl: "data:application/pdf;base64,JVBERi0xLjQKJ",
        mimeType: "application/pdf",
      },
    };
    const res = {
      status: (code) => {
        statusCode = code;
        return {
          json: (data) => {
            jsonBody = data;
            return data;
          },
        };
      },
    };

    await uploadAvatar(req, res);
    assert.equal(statusCode, 400);
    assert.equal(jsonBody.success, false);
    assert.match(jsonBody.error, /Invalid file type/);
  });

  await t.test("7. Upload validation rejects empty or missing image data", async () => {
    let statusCode = null;
    let jsonBody = null;

    const req = {
      authUser: { id: "test-user-id" },
      body: {},
    };
    const res = {
      status: (code) => {
        statusCode = code;
        return {
          json: (data) => {
            jsonBody = data;
            return data;
          },
        };
      },
    };

    await uploadAvatar(req, res);
    assert.equal(statusCode, 400);
    assert.equal(jsonBody.success, false);
    assert.match(jsonBody.error, /No image data provided/);
  });

  await t.test("8. Avatar MIME validation matches the avatars bucket", () => {
    for (const mimeType of ["image/jpeg", "image/png", "image/webp", "image/gif"]) {
      assert.equal(isAllowedAvatarMimeType(mimeType), true, `${mimeType} should be accepted`);
    }
    assert.equal(isAllowedAvatarMimeType("image/jpg"), false);
  });

  await t.test("9. Upload validation rejects images larger than 5 MB", async () => {
    let statusCode = null;
    let jsonBody = null;
    const oversizedImage = Buffer.alloc(5 * 1024 * 1024 + 1).toString("base64");
    const req = {
      authUser: { id: "test-user-id" },
      body: { imageBase64: oversizedImage, mimeType: "image/jpeg" },
    };
    const res = {
      status: (code) => {
        statusCode = code;
        return {
          json: (data) => {
            jsonBody = data;
            return data;
          },
        };
      },
    };

    await uploadAvatar(req, res);
    assert.equal(statusCode, 400);
    assert.equal(jsonBody.success, false);
    assert.match(jsonBody.error, /5MB maximum limit/);
  });

  await t.test("10. Missing avatars bucket returns an error without creating it", async () => {
    let createBucketCalled = false;
    const adminSupabase = {
      storage: {
        listBuckets: async () => ({ data: [], error: null }),
        createBucket: async () => {
          createBucketCalled = true;
        },
      },
    };

    await assert.rejects(
      ensureAvatarsBucket(adminSupabase),
      /Avatar storage configuration error: required "avatars" bucket is missing/
    );
    assert.equal(createBucketCalled, false);
  });
});
