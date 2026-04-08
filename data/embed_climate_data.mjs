/**
 * data/기후데이터.CSV → data/climate_data_embedded.js
 * 실행: 프로젝트 루트에서  npm run embed-data  또는  node data/embed_climate_data.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

var __dirname = path.dirname(fileURLToPath(import.meta.url));
var csvPath = path.join(__dirname, "기후데이터.CSV");
var outPath = path.join(__dirname, "climate_data_embedded.js");

if (!fs.existsSync(csvPath)) {
  console.error("파일이 없습니다:", csvPath);
  process.exit(1);
}

var rawBuf = fs.readFileSync(csvPath);

function decodeCsvBuffer(buf) {
  var bytes = new Uint8Array(buf);
  function scoreHangul(s) {
    var m = s.match(/[가-힣]/g);
    return m ? m.length : 0;
  }
  function hasReplacementChar(s) {
    return s.indexOf("\uFFFD") >= 0;
  }
  var utf8 = "";
  try {
    utf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch (e) {
    utf8 = "";
  }
  var euckr = "";
  try {
    euckr = new TextDecoder("euc-kr", { fatal: false }).decode(bytes);
  } catch (e2) {
    euckr = "";
  }
  var utfScore = scoreHangul(utf8) - (hasReplacementChar(utf8) ? 9999 : 0);
  var krScore = scoreHangul(euckr) - (hasReplacementChar(euckr) ? 9999 : 0);
  return krScore > utfScore ? euckr : utf8;
}

var raw = decodeCsvBuffer(rawBuf);
var normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

function escapeJsString(s) {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\n");
}

var out =
  "/** 자동 생성 — data/embed_climate_data.mjs (data/기후데이터.CSV). 수동 편집 금지. */\n" +
  "(function (w) {\n" +
  '  w.__CLIMATE_CSV_EMBEDDED__ = "' +
  escapeJsString(normalized) +
  '";\n' +
  "})(typeof window !== \"undefined\" ? window : this);\n";

fs.writeFileSync(outPath, out, "utf8");
console.log("생성 완료:", outPath, "(" + Buffer.byteLength(out, "utf8") + " bytes)");
