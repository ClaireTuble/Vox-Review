export function hasRequiredSignupFields({ username, firstName, email, password, confirmPassword }) {
  return Boolean(username?.trim() && firstName?.trim() && email?.trim() && password && confirmPassword);
}
