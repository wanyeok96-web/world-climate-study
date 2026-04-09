/**
 * 교육용 단순화 기준으로 기대 Type 산출 후 CSV Type과 비교 (일회성 분석)
 */
var fs = require("fs");
var path = require("path");
var csvPath = path.join(__dirname, "..", "data", "기후데이터.CSV");

function parseLine(line) {
  var out = [];
  var cur = "";
  var i = 0;
  while (i < line.length) {
    var c = line[i];
    if (c === '"') {
      i++;
      while (i < line.length && line[i] !== '"') {
        cur += line[i];
        i++;
      }
      if (line[i] === '"') i++;
    } else if (c === ",") {
      out.push(cur);
      cur = "";
      i++;
    } else {
      cur += c;
      i++;
    }
  }
  out.push(cur);
  return out;
}

function loadCities() {
  var text = fs.readFileSync(csvPath, "utf8");
  var lines = text.split(/\r?\n/).filter(function (l) {
    return l.trim().length;
  });
  var header = parseLine(lines[0]);
  var cities = [];
  for (var r = 1; r < lines.length; r++) {
    var cols = parseLine(lines[r]);
    var T = [];
    var P = [];
    for (var m = 0; m < 12; m++) {
      T.push(parseFloat(cols[5 + m]));
      P.push(parseFloat(cols[17 + m]));
    }
    cities.push({
      lineNo: r + 1,
      idx: r,
      id: cols[0],
      kr: cols[1],
      typeCsv: cols[2].trim(),
      lat: parseFloat(cols[3]),
      T: T,
      P: P,
    });
  }
  return cities;
}

function sumIndices(arr, idxs) {
  var s = 0;
  for (var i = 0; i < idxs.length; i++) s += arr[idxs[i]];
  return s;
}

/** 겨울/여름 반년 합강수: 북반구 겨울 10~3월(인덱스 9,10,11,0,1,2), 여름 4~9월 */
function winterSummerPrecip(lat, P) {
  var wIdx, sIdx;
  if (lat < 0) {
    wIdx = [3, 4, 5, 6, 7, 8];
    sIdx = [0, 1, 2, 9, 10, 11];
  } else {
    wIdx = [0, 1, 2, 9, 10, 11];
    sIdx = [3, 4, 5, 6, 7, 8];
  }
  return { pw: sumIndices(P, wIdx), ps: sumIndices(P, sIdx) };
}

function minPrecipMonth(P) {
  var mn = Infinity;
  for (var i = 0; i < 12; i++) if (P[i] < mn) mn = P[i];
  return mn;
}

function classify(c) {
  var T = c.T;
  var P = c.P;
  var tMin = Math.min.apply(null, T);
  var tMax = Math.max.apply(null, T);
  var pAnn = P.reduce(function (a, b) {
    return a + b;
  }, 0);
  var minP = minPrecipMonth(P);
  var ws = winterSummerPrecip(c.lat, P);

  if (tMax < 10) {
    if (tMax >= 0) return "ET";
    return "EF";
  }
  if (pAnn < 500) {
    if (pAnn < 250) return "BW";
    return "BS";
  }
  if (tMin >= 18) {
    if (minP >= 60) return "Af";
    if (ws.pw < ws.ps) return "Aw";
    return "As";
  }
  if (tMin < -3 && tMax >= 10) {
    if (minP >= 20) return "Df";
    if (ws.pw < ws.ps) return "Dw";
    return "Ds";
  }
  if (minP >= 30) {
    if (tMax >= 22) return "Cfa";
    return "Cfb";
  }
  if (ws.pw < ws.ps) return "Cw";
  return "Cs";
}

/** 비교용: CSV Type을 동일 표기 체계로 정규화 (교육용 2글자·Cfa/Cfb) */
function normalizeCsvType(t) {
  t = String(t).trim();
  if (t === "Am") return "Am";
  if (/^Cfa/.test(t)) return "Cfa";
  if (/^Cfb/.test(t)) return "Cfb";
  if (/^Cs/.test(t)) return "Cs";
  if (/^Cw/.test(t)) return "Cw";
  if (/^Df/.test(t)) return "Df";
  if (/^Dw/.test(t)) return "Dw";
  if (/^Ds/.test(t)) return "Ds";
  if (/^Af|^Aw|^As/.test(t)) return t.substring(0, 2);
  if (t === "BW" || t === "BS" || t === "ET" || t === "EF") return t;
  if (t === "H") return "H";
  return t;
}

function main() {
  var cities = loadCities();
  var mismatches = [];
  for (var i = 0; i < cities.length; i++) {
    var c = cities[i];
    var exp = classify(c);
    var csvN = normalizeCsvType(c.typeCsv);
    if (csvN === "H") {
      if (exp !== "H") {
        mismatches.push({
          lineNo: c.lineNo,
          dataNo: c.idx,
          id: c.id,
          kr: c.kr,
          typeCsv: c.typeCsv,
          expected: exp,
          note: "CSV=H, 수치기준만 적용",
        });
      }
      continue;
    }
    if (csvN === "Am") {
      mismatches.push({
        lineNo: c.lineNo,
        dataNo: c.idx,
        id: c.id,
        kr: c.kr,
        typeCsv: c.typeCsv,
        expected: exp,
        note: "기준에 Am 부호 없음; 동일 수치로는 " + exp,
      });
      continue;
    }
    if (csvN !== exp) {
      mismatches.push({
        lineNo: c.lineNo,
        dataNo: c.idx,
        id: c.id,
        kr: c.kr,
        typeCsv: c.typeCsv,
        expected: exp,
      });
    }
  }
  console.log(JSON.stringify(mismatches, null, 2));
}

main();
