// Wiederverwendbarer GitHub-Contents-API-Client. Liest/schreibt Dateien
// im Repo direkt per Commit – kein eigener Server, keine Datenbank.
// Erwartet Umgebungsvariablen: GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO,
// GITHUB_BRANCH (optional, Default "main").

const API = "https://api.github.com";

function env() {
  const { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH } = process.env;
  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
    throw new Error("GitHub-Umgebungsvariablen fehlen (GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO).");
  }
  return {
    token: GITHUB_TOKEN,
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    branch: GITHUB_BRANCH || "main",
  };
}

async function githubFetch(path, options = {}) {
  const { token } = env();
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GitHub API ${res.status}: ${text}`);
  }
  return res.json();
}

async function getFile(filePath) {
  const { owner, repo, branch } = env();
  const data = await githubFetch(
    `/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath).replace(/%2F/g, "/")}?ref=${branch}`
  );
  const content = Buffer.from(data.content, "base64").toString("utf8");
  return { content, sha: data.sha };
}

async function putFile(filePath, content, sha, message) {
  const { owner, repo, branch } = env();
  return githubFetch(`/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath).replace(/%2F/g, "/")}`, {
    method: "PUT",
    body: JSON.stringify({
      message: message || `Inhalt aktualisiert über Dashboard: ${filePath}`,
      content: Buffer.from(content, "utf8").toString("base64"),
      sha,
      branch,
    }),
  });
}

async function putBinaryFile(filePath, base64Content, sha, message) {
  const { owner, repo, branch } = env();
  return githubFetch(`/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath).replace(/%2F/g, "/")}`, {
    method: "PUT",
    body: JSON.stringify({
      message: message || `Bild hochgeladen über Dashboard: ${filePath}`,
      content: base64Content,
      sha,
      branch,
    }),
  });
}

async function deleteFile(filePath, sha, message) {
  const { owner, repo, branch } = env();
  return githubFetch(`/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath).replace(/%2F/g, "/")}`, {
    method: "DELETE",
    body: JSON.stringify({
      message: message || `Eintrag gelöscht über Dashboard: ${filePath}`,
      sha,
      branch,
    }),
  });
}

export { getFile, putFile, putBinaryFile, deleteFile };
