// The site's GitHub repo is the database: content.json holds the page, and every publish is one commit.

function decodeBase64Utf8(b64) {
  const bytes = Uint8Array.from(atob(b64.replace(/\s/g, "")), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export class GitHubError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export function github(env) {
  const api = env.GITHUB_API || "https://api.github.com";
  const branch = env.GITHUB_BRANCH || "main";

  async function call(method, path, body) {
    const res = await fetch(`${api}/repos/${env.GITHUB_REPO}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${env.GITHUB_TOKEN}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "user-agent": "luttrell-website-editor",
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new GitHubError(`GitHub ${method} ${path.split("?")[0]} failed (${res.status})`, res.status);
    return res.json();
  }

  return {
    async readContent(ref = branch) {
      const file = await call("GET", `/contents/content.json?ref=${encodeURIComponent(ref)}`);
      return { content: JSON.parse(decodeBase64Utf8(file.content)), version: file.sha };
    },

    async history() {
      const commits = await call("GET", `/commits?path=content.json&sha=${encodeURIComponent(branch)}&per_page=40`);
      return commits.map((c) => ({
        sha: c.sha,
        title: c.commit.message.split("\n")[0],
        body: c.commit.message.split("\n").slice(2).join("\n").trim(),
        author: c.commit.author.name,
        date: c.commit.author.date,
      }));
    },

    // files: [{ path, text } | { path, base64 }]. Returns the commit sha and each file's blob sha, or throws 409 when
    // the branch moved underneath us (the ref update is not a fast-forward).
    async commit({ files, message, author }) {
      const ref = await call("GET", `/git/ref/heads/${branch}`);
      const head = ref.object.sha;
      const parent = await call("GET", `/git/commits/${head}`);
      const tree = [];
      const blobs = {};
      for (const f of files) {
        const blob = await call(
          "POST",
          "/git/blobs",
          f.base64 !== undefined ? { content: f.base64, encoding: "base64" } : { content: f.text, encoding: "utf-8" },
        );
        blobs[f.path] = blob.sha;
        tree.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha });
      }
      const newTree = await call("POST", "/git/trees", { base_tree: parent.tree.sha, tree });
      const commit = await call("POST", "/git/commits", { message, tree: newTree.sha, parents: [head], author });
      try {
        await call("PATCH", `/git/refs/heads/${branch}`, { sha: commit.sha, force: false });
      } catch (err) {
        if (err.status === 422) throw new GitHubError("The website changed while publishing", 409);
        throw err;
      }
      return { sha: commit.sha, blobs };
    },
  };
}
