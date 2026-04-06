/**
 * data/climate_data.csv → data/climate_data_embedded.js
 * 실행: 프로젝트 루트에서  npm run embed-data  또는  node data/embed_climate_data.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

var __dirname = path.dirname(fileURLToPath(import.meta.url));
var csvPath = path.join(__dirname, "climate_data.csv");
var outPath = path.join(__dirname, "climate_data_embedded.js");

if (!fs.existsSync(csvPath)) {
  console.error("파일이 없습니다:", csvPath);
  process.exit(1);
}

var raw = fs.readFileSync(csvPath, "utf8");
var normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

function escapeJsString(s) {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\n");
}

var out =
  "/** 자동 생성 — data/embed_climate_data.mjs (data/climate_data.csv). 수동 편집 금지. */\n" +
  "(function (w) {\n" +
  '  w.__CLIMATE_CSV_EMBEDDED__ = "' +
  escapeJsString(normalized) +
  '";\n' +
  "})(typeof window !== \"undefined\" ? window : this);\n";

fs.writeFileSync(outPath, out, "utf8");
console.log("생성 완료:", outPath, "(" + Buffer.byteLength(out, "utf8") + " bytes)");
