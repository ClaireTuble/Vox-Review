export function buildFullName(firstName, lastName, fallback = "") {
  const name = [firstName, lastName]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean)
    .join(" ");
  return name || (typeof fallback === "string" ? fallback.trim() : "");
}