// Wiederverwendbare Auth-Bausteine für das Inline-Dashboard.
// Keine Datenbank, kein Framework – ein Admin-Login pro Projekt,
// konfiguriert über Umgebungsvariablen. Framework-unabhängig (nimmt
// nur den rohen Cookie-Header entgegen), daher 1:1 auf Vercel,
// Netlify oder jede andere Node-Serverless-Plattform übertragbar.

import crypto from "crypto";

const COOKIE_NAME = "dashboard_session";
const SESSION_HOURS = 12;

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function sign(payload, secret) {
  const json = JSON.stringify(payload);
  const body = base64url(json);
  const hmac = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${hmac}`;
}

function verify(token, secret) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [body, hmac] = token.split(".");
  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  const a = Buffer.from(hmac || "");
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function createSessionCookie(secret) {
  const token = sign({ exp: Date.now() + SESSION_HOURS * 60 * 60 * 1000 }, secret);
  const maxAge = SESSION_HOURS * 60 * 60;
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  header.split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx === -1) return;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    out[key] = decodeURIComponent(val);
  });
  return out;
}

function isAuthenticated(cookieHeader, secret) {
  const cookies = parseCookies(cookieHeader);
  const token = cookies[COOKIE_NAME];
  return verify(token, secret) !== null;
}

export {
  COOKIE_NAME,
  createSessionCookie,
  clearSessionCookie,
  parseCookies,
  isAuthenticated,
};
