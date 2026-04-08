import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** 프로젝트 루트 (scripts/의 상위) */
export const PROJECT_ROOT = path.resolve(__dirname, "..", "..");

/**
 * .git이 있는 디렉터리 탐색
 * @param {string[]} startDirs - 순서대로 시도할 시작 경로
 */
export function findGitRoot(startDirs) {
  for (const start of startDirs) {
    const base = path.resolve(start);
    if (!existsSync(base)) continue;
    let dir = base;
    for (;;) {
      if (existsSync(path.join(dir, ".git"))) return dir;
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return null;
}

/**
 * site.config.json의 gitRoot(프로젝트 루트 기준 상대경로) 또는 자동 탐색
 */
export function resolveGitRoot(config) {
  const rel = config && typeof config.gitRoot === "string" ? config.gitRoot.trim() : "";
  if (rel) {
    const candidate = path.resolve(PROJECT_ROOT, rel);
    if (existsSync(path.join(candidate, ".git"))) return candidate;
    console.warn("[경고] site.config.json의 gitRoot에 .git이 없습니다:", candidate);
  }
  const fromProject = findGitRoot([PROJECT_ROOT, process.cwd()]);
  if (fromProject) return fromProject;
  return findGitRoot([path.join(PROJECT_ROOT, "world-climate-study")]);
}
