#!/usr/bin/env node
/**
 * git add → commit → push (GitHub에 반영). GitHub Pages는 보통 push 후 자동 갱신됩니다.
 * 사용: node scripts/push-to-github.mjs ["커밋 메시지"]
 */
import { execSync, spawnSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { PROJECT_ROOT, resolveGitRoot } from "./lib/paths.mjs";

const CONFIG_PATH = path.join(PROJECT_ROOT, "site.config.json");

function loadConfig() {
  if (!existsSync(CONFIG_PATH)) return {};
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return {};
  }
}

function run(cmd, cwd) {
  execSync(cmd, { cwd, stdio: "inherit", shell: true });
}

function main() {
  const config = loadConfig();
  const gitRoot = resolveGitRoot(config);

  if (!gitRoot) {
    console.error(
      ".git을 찾지 못했습니다.\n" +
        "  - 프로젝트 상위 폴더에 저장소를 두었거나\n" +
        "  - site.config.json에 \"gitRoot\": \"저장소폴더명\" 을 넣어 주세요.\n" +
        "예: \"gitRoot\": \"world-climate-study\""
    );
    process.exit(1);
  }

  const msgArg = process.argv.slice(2).join(" ").trim();
  const msg =
    msgArg ||
    "Update site " + new Date().toISOString().slice(0, 19).replace("T", " ");

  console.log("Git 루트:", gitRoot);

  var pr = path.resolve(PROJECT_ROOT);
  var gr = path.resolve(gitRoot);
  if (pr !== gr && !pr.startsWith(gr + path.sep)) {
    console.warn(
      "[경고] index.html 등이 있는 폴더가 Git 루트와 다릅니다.\n" +
        "  프로젝트: " +
        pr +
        "\n" +
        "  Git 루트: " +
        gr +
        "\n" +
        "  → 이 push에는 위 프로젝트 파일이 포함되지 않을 수 있습니다. 저장소를 HTML이 있는 폴더로 두거나 site.config.json의 gitRoot를 조정하세요."
    );
  }

  run("git add -A", gitRoot);

  var commit = spawnSync("git", ["commit", "-m", msg], {
    cwd: gitRoot,
    stdio: "inherit",
    shell: false,
  });
  if (commit.status !== 0) {
    console.log("커밋할 변경이 없거나 커밋에 실패했습니다. push만 시도합니다.");
  }

  run("git push", gitRoot);
  console.log("완료.");
}

main();
