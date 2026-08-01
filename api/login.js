import { createSessionCookie } from "../lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  const { password } = req.body || {};

  const { DASHBOARD_PASSWORD, SESSION_SECRET } = process.env;
  if (!DASHBOARD_PASSWORD || !SESSION_SECRET) {
    res.status(500).json({ error: "Dashboard ist nicht konfiguriert (fehlende Umgebungsvariablen)." });
    return;
  }

  const validPassword = (password || "") === DASHBOARD_PASSWORD;

  if (!validPassword) {
    res.status(401).json({ error: "Passwort ist falsch." });
    return;
  }

  res.setHeader("Set-Cookie", createSessionCookie(SESSION_SECRET));
  res.status(200).json({ ok: true });
}
