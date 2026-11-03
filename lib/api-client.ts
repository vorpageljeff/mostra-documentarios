// The Vercel SPA declares its backend origin on <html>. Sites stays same-origin.
export function apiBase() {
  return typeof document === "undefined"
    ? ""
    : document.documentElement.dataset.apiBase || "";
}
export const sessionKey = "mostra-session:v1";
export function sessionToken() {
  try {
    return sessionStorage.getItem(sessionKey);
  } catch {
    return null;
  }
}
export function saveSession(token: string | null) {
  try {
    if (token) sessionStorage.setItem(sessionKey, token);
    else sessionStorage.removeItem(sessionKey);
  } catch {
    throw new Error(
      "Permita o armazenamento da sessão neste navegador para entrar.",
    );
  }
}
