// Unit tests for the profile README renderer. Run: node --test profile/scripts/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { toRow, renderTable, replaceSection, main } from "./render.mjs";

const item = (over = {}) => ({
  repository_url: "https://api.github.com/repos/tokio-rs/tokio", title: "Fix a | b", html_url: "https://github.com/tokio-rs/tokio/pull/1",
  state: "open", created_at: "2026-11-03T00:00:00Z", pull_request: { merged_at: null }, ...over,
});

test("open and merged PRs become rows; closed-unmerged PRs are hidden", () => {
  assert.equal(toRow(item()).merged, false);
  assert.equal(toRow(item({ state: "closed", pull_request: { merged_at: "2026-11-05T00:00:00Z" } })).date, "2026-11-05");
  assert.equal(toRow(item({ state: "closed" })), null);
});

test("table shows stars, escapes pipes and labels status", () => {
  const md = renderTable([toRow(item())], { "tokio-rs/tokio": 33456 });
  assert.match(md, /\[tokio-rs\/tokio\]\(https:\/\/github.com\/tokio-rs\/tokio\) ★33\.5k/);
  assert.match(md, /Fix a \\\| b/);
  assert.match(md, /🔄 In review/);
  assert.equal(renderTable([]), "_First pull requests are on their way._");
});

test("only the marked section is replaced; missing markers throw", () => {
  const out = replaceSection("top\n<!-- oss:start -->\nold\n<!-- oss:end -->\nbottom", "NEW");
  assert.equal(out, "top\n<!-- oss:start -->\nNEW\n<!-- oss:end -->\nbottom");
  assert.throws(() => replaceSection("no markers", "x"), /markers/);
});

test("main rewrites README from a fake GitHub API", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "profile-"));
  const file = path.join(dir, "README.md");
  await writeFile(file, "hi\n<!-- oss:start -->\n<!-- oss:end -->\n");
  const fake = async (url) => ({ ok: true, json: async () => (url.includes("/search/") ? { items: [item()] } : { stargazers_count: 900 }) });
  assert.equal(await main(file, fake), 0);
  assert.match(await readFile(file, "utf8"), /tokio-rs\/tokio\)\s★900/);
});
