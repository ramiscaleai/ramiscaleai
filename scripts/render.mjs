#!/usr/bin/env node
// Rewrites the "Open-source contributions" section of the profile README from the GitHub API:
// PRs authored by the user in other owners' public repos, merged or still open (newest first).
// Usage: GH_TOKEN=... node scripts/render.mjs [README.md]   (GitHub Actions passes GITHUB_TOKEN)
import { readFile, writeFile } from "node:fs/promises";

const USER = process.env.PROFILE_USER || "ramiscaleai";
const START = "<!-- oss:start -->";
const END = "<!-- oss:end -->";
const API = "https://api.github.com";
const log = (...a) => console.error("[render]", ...a);

/** GET a GitHub API path as JSON; throws with the status on failure. */
export async function gh(pathname, fetchFn = fetch) {
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "profile-readme" };
  if (process.env.GH_TOKEN) headers.Authorization = `Bearer ${process.env.GH_TOKEN}`;
  const res = await fetchFn(`${API}${pathname}`, { headers });
  if (!res.ok) throw new Error(`GitHub ${pathname}: HTTP ${res.status}`);
  return res.json();
}

/** One table row from a search result; null for PRs closed without merging. */
export function toRow(item) {
  const merged = Boolean(item.pull_request?.merged_at);
  if (item.state === "closed" && !merged) return null;
  const repo = item.repository_url.replace(`${API}/repos/`, "");
  return { repo, title: item.title, url: item.html_url, merged, date: (item.pull_request?.merged_at || item.created_at).slice(0, 10) };
}

const fmtStars = (n) => (n >= 1000 ? `${Math.round(n / 100) / 10}k` : String(n));
const cell = (s) => String(s).replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");

/** Markdown table, newest first; stars come from a { repo: count } map. */
export function renderTable(rows, stars = {}) {
  if (rows.length === 0) return "_First pull requests are on their way._";
  const lines = rows.map((r) => {
    const star = stars[r.repo] ? ` ★${fmtStars(stars[r.repo])}` : "";
    const status = r.merged ? "✅ Merged" : "🔄 In review";
    return `| [${cell(r.repo)}](https://github.com/${r.repo})${star} | [${cell(r.title)}](${r.url}) | ${status} | ${r.date} |`;
  });
  return ["| Project | Contribution | Status | Date |", "|---|---|---|---|", ...lines].join("\n");
}

/** Replace the text between the markers; throws if the markers are missing. */
export function replaceSection(readme, body) {
  const a = readme.indexOf(START);
  const b = readme.indexOf(END);
  if (a < 0 || b < a) throw new Error(`markers ${START} / ${END} not found`);
  return `${readme.slice(0, a + START.length)}\n${body}\n${readme.slice(b)}`;
}

/** PRs by USER outside their own repos, plus star counts per repo. */
export async function collect(fetchFn = fetch) {
  const q = encodeURIComponent(`is:pr author:${USER} -user:${USER}`);
  const found = await gh(`/search/issues?q=${q}&sort=created&order=desc&per_page=100`, fetchFn);
  const rows = found.items.map(toRow).filter(Boolean);
  const stars = {};
  for (const repo of new Set(rows.map((r) => r.repo))) {
    stars[repo] = (await gh(`/repos/${repo}`, fetchFn)).stargazers_count;
  }
  return { rows, stars };
}

export async function main(file = process.argv[2] || "README.md", fetchFn = fetch) {
  const readme = await readFile(file, "utf8");
  const { rows, stars } = await collect(fetchFn);
  const next = replaceSection(readme, renderTable(rows, stars));
  if (next === readme) { log("no change"); return 0; }
  await writeFile(file, next);
  log(`updated ${file}: ${rows.length} contributions`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then((code) => { process.exitCode = code; }, (err) => { log("ERROR:", err.message); process.exitCode = 1; });
}
