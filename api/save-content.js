import { dump as dumpYaml } from "js-yaml";
import { isAuthenticated } from "../lib/auth.js";
import { getFile, putFile, putBinaryFile, deleteFile } from "../lib/github.js";

// Text-Inhalte (writes/deletes) dürfen nur unter src/content/ liegen,
// Bild-Uploads nur unter public/uploads/ – strikt getrennt, damit ein
// manipulierter Request nicht beliebige Repo-Dateien überschreiben kann.
function assertAllowed(filePath, prefix) {
  const ok = typeof filePath === "string" && !filePath.includes("..") && filePath.startsWith(prefix);
  if (!ok) {
    throw new Error(`Pfad nicht erlaubt: ${filePath}`);
  }
}

function assertAllowedForDelete(filePath) {
  const ok = typeof filePath === "string" && !filePath.includes("..") &&
    (filePath.startsWith("src/content/") || filePath.startsWith("public/uploads/"));
  if (!ok) {
    throw new Error(`Pfad nicht erlaubt: ${filePath}`);
  }
}

export const config = {
  api: {
    bodyParser: { sizeLimit: "4mb" },
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  const { SESSION_SECRET } = process.env;
  if (!SESSION_SECRET || !isAuthenticated(req.headers.cookie, SESSION_SECRET)) {
    res.status(401).json({ error: "Nicht eingeloggt." });
    return;
  }

  const body = req.body || {};
  const writes = Array.isArray(body.writes) ? body.writes : [];
  const deletes = Array.isArray(body.deletes) ? body.deletes : [];
  const uploads = Array.isArray(body.uploads) ? body.uploads : [];

  try {
    for (const { file, data } of writes) {
      assertAllowed(file, "src/content/");
      const yamlText = dumpYaml(data, { lineWidth: -1, noRefs: true });
      let sha;
      try {
        const existing = await getFile(file);
        sha = existing.sha;
      } catch {
        sha = undefined; // Datei existiert noch nicht -> wird neu angelegt
      }
      await putFile(file, yamlText, sha);
    }

    for (const { file, base64 } of uploads) {
      assertAllowed(file, "public/uploads/");
      let sha;
      try {
        const existing = await getFile(file);
        sha = existing.sha;
      } catch {
        sha = undefined;
      }
      await putBinaryFile(file, base64, sha);
    }

    for (const file of deletes) {
      assertAllowedForDelete(file);
      const existing = await getFile(file);
      await deleteFile(file, existing.sha);
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message || "Speichern fehlgeschlagen." });
  }
}
