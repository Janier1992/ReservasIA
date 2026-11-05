/**
 * Pista de si este navegador puede tener una sesión abierta.
 *
 * Al abrir la app, el SDK de InsForge intenta recuperar la sesión llamando a
 * /api/auth/refresh. Para un visitante que nunca entró, esa llamada siempre
 * responde 401 y el navegador lo muestra como error en la consola. Con esta
 * pista solo se intenta cuando hay algo que recuperar.
 *
 * Señales de que puede haber sesión (basta una):
 * - la cookie de CSRF que InsForge deja al iniciar sesión;
 * - la marca propia que se guarda mientras hay un usuario adentro;
 * - el código de un inicio de sesión con Google en la dirección.
 */

const CSRF_COOKIE = "insforge_csrf_token";
const SESSION_MARK_KEY = "reservasia:had-session";
const OAUTH_CODE_PARAM = "insforge_code";

// Se lee al cargar el módulo, antes de que el SDK limpie el código de la dirección.
const startedWithOAuthCode =
  typeof window !== "undefined" && new URLSearchParams(window.location.search).has(OAUTH_CODE_PARAM);

function hasCsrfCookie(): boolean {
  return typeof document !== "undefined" && document.cookie.split(";").some((c) => c.trim().startsWith(`${CSRF_COOKIE}=`));
}

function hasSessionMark(): boolean {
  try {
    return window.localStorage.getItem(SESSION_MARK_KEY) === "1";
  } catch {
    return false;
  }
}

export function mayHaveSession(): boolean {
  return startedWithOAuthCode || hasCsrfCookie() || hasSessionMark();
}

/** Guarda o borra la marca según haya o no un usuario adentro. */
export function rememberSession(signedIn: boolean): void {
  try {
    if (signedIn) window.localStorage.setItem(SESSION_MARK_KEY, "1");
    else window.localStorage.removeItem(SESSION_MARK_KEY);
  } catch {
    // Sin almacenamiento (modo privado estricto): queda la cookie como señal.
  }
}
