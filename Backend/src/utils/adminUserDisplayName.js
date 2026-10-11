function cleanName(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function resolveAdminUserDisplayName({ publicFullName, userMetadata, email } = {}) {
  const metadata = userMetadata && typeof userMetadata === "object" ? userMetadata : {};
  const firstAndLastName = [
    cleanName(metadata.firstName),
    cleanName(metadata.lastName),
  ].filter(Boolean).join(" ");

  return cleanName(publicFullName) ||
    firstAndLastName ||
    cleanName(metadata.full_name) ||
    cleanName(metadata.name) ||
    cleanName(metadata.username) ||
    cleanName(email).split("@")[0] ||
    "User";
}
