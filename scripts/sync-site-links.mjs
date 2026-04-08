#!/usr/bin/env node
/**
 * site.config.json의 URL을 읽어 프로젝트 루트의 *.html 안 플레이스홀더를 치환합니다.
 * 사용: node scripts/sync-site-links.mjs
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "fs";
import path from "path";
import { PROJECT_ROOT } from "./lib/paths.mjs";

const CONFIG_PATH = path.join(PROJECT_ROOT, "site.config.json");

function loadConfig() {
  if (!existsSync(CONFIG_PATH)) {
    console.error("site.config.json이 없습니다. site.config.example.json을 복사해 값을 채워 주세요.");
    process.exit(1);
  }
  return JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
}

function normalizePagesUrl(url) {
  if (!url || typeof url !== "string") return "";
  const t = url.trim();
  if (!t) return "";
  return t.endsWith("/") ? t.slice(0, -1) : t;
}

function patchHtml(content, { githubPagesBaseUrl, githubRepoUrl }) {
  let out = content;
  const pages = normalizePagesUrl(githubPagesBaseUrl);
  const repo = (githubRepoUrl && String(githubRepoUrl).trim()) || "";

  out = out.replaceAll("__SITE_GITHUB_PAGES__", pages ? pages + "/" : "__SITE_GITHUB_PAGES__");
  out = out.replaceAll("__SITE_GITHUB_REPO__", repo || "__SITE_GITHUB_REPO__");

  var warn = null;
  if (pages && out.includes("__SITE_GITHUB_PAGES__")) {
    warn = "__SITE_GITHUB_PAGES__ 치환 실패. HTML을 확인하세요.";
  }
  if (repo && out.includes("__SITE_GITHUB_REPO__")) {
    warn = "__SITE_GITHUB_REPO__ 치환 실패. HTML을 확인하세요.";
  }
  return { out, warn };
}

function main() {
  const config = loadConfig();
  const htmlFiles = readdirSync(PROJECT_ROOT).filter((f) => f.endsWith(".html"));

  if (!htmlFiles.length) {
    console.log("루트에 .html 파일이 없습니다.");
    return;
  }

  let changed = 0;
  for (const file of htmlFiles) {
    const fp = path.join(PROJECT_ROOT, file);
    const raw = readFileSync(fp, "utf8");
    const { out, warn } = patchHtml(raw, config);
    if (out !== raw) {
      writeFileSync(fp, out, "utf8");
      changed++;
      console.log("갱신:", file);
    }
    if (warn) console.warn("[경고]", file, warn);
  }

  if (!changed) console.log("변경할 내용이 없습니다. (이미 동기화됐거나 플레이스홀더가 없음)");
  else console.log("완료:", changed, "개 파일");
}

main();
