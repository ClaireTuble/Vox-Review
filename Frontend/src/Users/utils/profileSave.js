export function getProfileSaveChanges(savedProfile, draft, avatarAction = null) {
  const changes = [];
  const fields = [
    ["username", "Username", "@"],
    ["firstName", "First name", ""],
    ["lastName", "Last name", ""],
  ];

  fields.forEach(([key, label, prefix]) => {
    const currentValue = String(savedProfile?.[key] || "").trim();
    const nextValue = String(draft?.[key] || "").trim();
    if (currentValue !== nextValue) {
      changes.push({ label, prefix, currentValue, nextValue });
    }
  });

  if (avatarAction?.type === "upload") {
    changes.push({ label: "Profile picture", prefix: "", currentValue: "Current picture", nextValue: "New picture" });
  } else if (avatarAction?.type === "remove") {
    changes.push({ label: "Profile picture", prefix: "", currentValue: "Current picture", nextValue: "Removed" });
  }

  return changes;
}

export function getProfileDraftValidationError({ username, firstName }) {
  if (!String(username ?? "").trim() || !String(firstName ?? "").trim()) {
    return "Please fill out your username and first name.";
  }
  return null;
}

export async function persistProfileDraft({
  authService,
  username,
  firstName,
  lastName,
  avatarAction = null,
  onPersisted = () => {},
}) {
  const clean = (value) => String(value ?? "").trim();
  const normalizedUsername = clean(username);
  const normalizedFirstName = clean(firstName);
  const normalizedLastName = clean(lastName);
  let avatarUrl;

  if (avatarAction?.type === "upload") {
    const uploadResult = await authService.uploadAvatar(avatarAction.file);
    if (!uploadResult?.success || !uploadResult.avatarUrl) {
      throw new Error("Failed to upload profile picture.");
    }
    avatarUrl = uploadResult.avatarUrl;
  } else if (avatarAction?.type === "remove") {
    const removeResult = await authService.removeAvatar();
    if (!removeResult?.success) {
      throw new Error("Failed to remove custom profile picture.");
    }
    avatarUrl = null;
  }

  const profileResult = await authService.updateUserProfile({
    username: normalizedUsername,
    firstName: normalizedFirstName,
    lastName: normalizedLastName,
    ...(avatarAction ? { avatarUrl } : {}),
  });
  if (!profileResult?.success) {
    throw new Error("Profile update failed.");
  }
  if (!profileResult.user) {
    throw new Error("Profile update returned no updated user.");
  }

  onPersisted(profileResult.user);
  return profileResult.user;
}
