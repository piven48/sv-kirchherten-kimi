import { isAuthenticated } from "../lib/auth.js";

export default async function handler(req, res) {
  const { SESSION_SECRET } = process.env;
  const loggedIn = SESSION_SECRET ? isAuthenticated(req.headers.cookie, SESSION_SECRET) : false;
  res.status(200).json({ loggedIn });
}
