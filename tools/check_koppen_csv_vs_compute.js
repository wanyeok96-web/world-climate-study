/**
 * One-off: compare CSV Type (normalized) vs computeKoppenCode for every city.
 * Run: node tools/check_koppen_csv_vs_compute.js
 */
var fs = require("fs");
var path = require("path");

var csvPath = path.join(__dirname, "..", "data", "기후데이터.CSV");

function parseCsvLineSimple(line) {
  var out = [];
  var cur = "";
  var inQuote = false;
  for (var i = 0; i < line.length; i++) {
    var ch = line.charAt(i);
    if (ch === '"') {
      if (inQuote && line.charAt(i + 1) === '"') {
        cur += '"';
        i++;
      } else {
        inQuote = !inQuote;
      }
      continue;
    }
    if (ch === "," && !inQuote) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function cleanHeaderKey(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/_/g, "");
}

function csvNum(v) {
  var t = String(v == null ? "" : v)
    .trim()
    .replace(/,/g, "")
    .replace(/\s+/g, "");
  if (!t) return NaN;
  return parseFloat(t);
}

function parseCsvToCityData(text) {
  var lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  var rows = [];
  for (var i = 0; i < lines.length; i++) {
    var ln = lines[i].trim();
    if (!ln) continue;
    rows.push(parseCsvLineSimple(ln));
  }
  var hdr = rows[0].map(function (h) {
    return h.trim();
  });
  var idx = {};
  for (var hi = 0; hi < hdr.length; hi++) idx[cleanHeaderKey(hdr[hi])] = hi;
  var cities = [];
  for (var r = 1; r < rows.length; r++) {
    var row = rows[r];
    if (row.length < hdr.length) continue;
    var idRaw = String(row[idx.city] || "").trim();
    var temp = [];
    var precip = [];
    for (var m = 1; m <= 12; m++) {
      temp.push(csvNum(row[idx["t" + m]]));
      precip.push(csvNum(row[idx["p" + m]]));
    }
    cities.push({
      id: idRaw,
      code: String(row[idx.type] || "").trim(),
      temp: temp,
      precip: precip,
    });
  }
  return cities;
}

function annualPrecipTotal(arr) {
  var s = 0;
  for (var i = 0; i < arr.length; i++) s += arr[i];
  return Math.round(s);
}

function isSouthernHemisphereCity(city) {
  return city.temp[6] < city.temp[0];
}

function minMaxPrecipMonths(precip, idxs) {
  var minV = Infinity;
  var maxV = -Infinity;
  for (var i = 0; i < idxs.length; i++) {
    var v = precip[idxs[i]];
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
  }
  return { min: minV, max: maxV };
}

function koppenSeasonIndices(city) {
  if (isSouthernHemisphereCity(city)) {
    return { highSun: [10, 11, 0, 1, 2, 3], lowSun: [4, 5, 6, 7, 8, 9] };
  }
  return { highSun: [3, 4, 5, 6, 7, 8], lowSun: [9, 10, 11, 0, 1, 2] };
}

function cdSecondLetterFromSeasonality(city) {
  var p = city.precip;
  var g = koppenSeasonIndices(city);
  var hs = minMaxPrecipMonths(p, g.highSun);
  var ls = minMaxPrecipMonths(p, g.lowSun);
  var sDry = hs.min < 30 && ls.max >= 3 * hs.min;
  var wDry = ls.min < hs.max / 3;
  if (sDry && !wDry) return "s";
  if (wDry && !sDry) return "w";
  if (sDry && wDry) {
    var ratioS = ls.max / Math.max(1, hs.min);
    var ratioW = hs.max / Math.max(1, ls.min);
    return ratioS >= ratioW ? "s" : "w";
  }
  return "f";
}

function computeKoppenCode(city) {
  var t = city.temp;
  var pr = city.precip;
  var tMin = Math.min.apply(null, t);
  var tMax = Math.max.apply(null, t);
  var pAnn = annualPrecipTotal(pr);
  var pMin = Math.min.apply(null, pr);
  var tEst = (tMin + tMax) / 2;
  var denom = tEst + 10;

  if (tMin >= 18) {
    if (pMin >= 60) return "Af";
    var amThreshold = 100 - pAnn / 25;
    if (pMin > amThreshold) return "Am";
    return "Aw";
  }
  if (tMax < 10) {
    return tMin < 0 ? "EF" : "ET";
  }
  if (denom > 0) {
    var im = pAnn / denom;
    if (im < 25) {
      if (pAnn < 200) return "BWh";
      return "BSh";
    }
  }
  var L = tMin > -3 ? "C" : "D";
  var sec = cdSecondLetterFromSeasonality(city);
  if (L === "C") {
    if (sec === "s") return "C" + "s" + (tMax >= 22 ? "a" : "b");
    if (sec === "w") return "C" + "w" + (tMax >= 22 ? "a" : "b");
    return "Cf" + (tMax >= 22 ? "a" : "b");
  }
  if (sec === "w") return tMax >= 22 ? "Dwa" : "Dwb";
  if (sec === "s") return "D" + "s" + (tMax >= 22 ? "a" : "b");
  return tMin <= -38 ? "Dfd" : "Dfb";
}

function normalizeKoppenCodeFromCity(city) {
  if (!city || !city.temp || city.temp.length !== 12) return "Cfb";
  var raw = String(city.code || "").trim();
  var tMin = Math.min.apply(null, city.temp);
  var tMax = Math.max.apply(null, city.temp);
  var tEst = (tMin + tMax) / 2;
  if (!raw) return computeKoppenCode(city);
  var u = raw.toUpperCase();
  if (u === "BW") return tEst >= 18 ? "BWh" : "BWk";
  if (u === "BS") return tEst >= 18 ? "BSh" : "BSk";
  if (u === "CS") return tMax >= 22 ? "Csa" : "Csb";
  if (u === "H") return "H";
  return raw;
}

function main() {
  var text = fs.readFileSync(csvPath, "utf8");
  var cities = parseCsvToCityData(text);
  var cdMismatches = [];
  var anyFirstMismatch = [];
  var fullMismatch = [];
  var sameLetterDetailMismatch = [];

  cities.forEach(function (c) {
    var norm = normalizeKoppenCodeFromCity(c);
    var comp = computeKoppenCode(c);
    var n1 = norm.charAt(0);
    var c1 = comp.charAt(0);
    if (norm !== comp) {
      fullMismatch.push({
        id: c.id,
        typeCol: c.code,
        normalized: norm,
        computed: comp,
        tMin: Math.min.apply(null, c.temp),
        tMax: Math.max.apply(null, c.temp),
      });
    }
    if (n1 === c1 && norm !== comp) {
      sameLetterDetailMismatch.push({
        id: c.id,
        typeCol: c.code,
        normalized: norm,
        computed: comp,
      });
    }
    if ((n1 === "C" || n1 === "D") && (c1 === "C" || c1 === "D") && n1 !== c1) {
      cdMismatches.push({
        id: c.id,
        typeCol: c.code,
        normalized: norm,
        computed: comp,
        tMin: Math.min.apply(null, c.temp),
      });
    }
    if (n1 !== c1) {
      anyFirstMismatch.push({
        id: c.id,
        typeCol: c.code,
        normalized: norm,
        computed: comp,
        tMin: Math.min.apply(null, c.temp),
        tMax: Math.max.apply(null, c.temp),
      });
    }
  });

  console.log("=== Cities: " + cities.length + " ===\n");
  console.log(
    "비고: 아래 'computed'는 이 프로젝트 script.js의 computeKoppenCode()와 동일한 단순 공식입니다.\n" +
      "실제 쾨펜·출처별 경계는 다를 수 있으며, CSV Type은 교육용 표기일 수 있습니다.\n"
  );

  console.log(
    "A) 정규화 Type 문자열 ≠ compute 결과 문자열 (가장 넓은 불일치): " +
      fullMismatch.length
  );
  if (fullMismatch.length) {
    console.table(fullMismatch);
  }

  console.log(
    "\nB) 1차 문자는 같은데 세부만 다름 (예: Df vs Dfb, Cw vs Cwa): " +
      sameLetterDetailMismatch.length
  );
  if (sameLetterDetailMismatch.length) {
    console.table(sameLetterDetailMismatch);
  }

  console.log(
    "\nC) C/D 축만 다른 경우 (온대↔냉대): " + cdMismatches.length
  );
  if (cdMismatches.length) {
    console.table(cdMismatches);
  }

  console.log(
    "\nD) 1차 문자 전체 불일치 (A/B/C/D/E/H 등): " + anyFirstMismatch.length
  );
  if (anyFirstMismatch.length) {
    console.table(anyFirstMismatch);
  }
}

main();
