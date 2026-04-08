#!/usr/bin/env node
/**
 * 링크 동기화 후 GitHub로 푸시 (한 번에 실행)
 * 사용: node scripts/publish-site.mjs ["커밋 메시지"]
 */
import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const node = process.execPath;
const msg = process.argv.slice(2);

const sync = spawnSync(node, [path.join(__dirname, "sync-site-links.mjs")], { stdio: "inherit" });
if (sync.status !== 0) process.exit(sync.status ?? 1);

const pushArgs = [path.join(__dirname, "push-to-github.mjs"), ...msg];
const push = spawnSync(node, pushArgs, { stdio: "inherit" });
process.exit(push.status ?? 0);
