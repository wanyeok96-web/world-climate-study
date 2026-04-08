(function () {
  "use strict";

  var MONTH_LABELS = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];

  /** fetch(data/기후데이터.CSV) 파싱 후 채워짐 */
  var CITY_DATA = [];

  var DEFAULT_QUIZ_SYMBOLS = [
    "Af",
    "Am",
    "Aw",
    "BWh",
    "BWk",
    "BSh",
    "BSk",
    "Csa",
    "Csb",
    "Cfb",
    "Cfa",
    "Cwa",
    "Cwb",
    "Dwa",
    "Dwb",
    "Dwc",
    "Dwd",
    "Dfa",
    "Dfb",
    "Dfc",
    "Dfd",
    "ET",
    "EF",
    "H",
  ];

  /** 위저드·동적 UI용 (loadClimateData 후 갱신) */
  var QUIZ_SYMBOLS = DEFAULT_QUIZ_SYMBOLS.slice();

  /**
   * Step 4 스피드 퀴즈: 단추 라벨 → 정답 코드 (CSV·3글자 코드와 매칭)
   */
  var STEP4_SYMBOL_ENTRIES = [
    { label: "Af", matchCodes: ["Af"] },
    { label: "Am", matchCodes: ["Am"] },
    { label: "Aw", matchCodes: ["Aw"] },
    { label: "BW", matchCodes: ["BWh", "BWk"] },
    { label: "BS", matchCodes: ["BSh", "BSk"] },
    { label: "Cs", matchCodes: ["Cs", "Csa", "Csb"] },
    { label: "Cfb", matchCodes: ["Cfb"] },
    { label: "Cfa", matchCodes: ["Cfa"] },
    { label: "Cw", matchCodes: ["Cw", "Cwb", "Cwa"] },
    { label: "Dw", matchCodes: ["Dwa", "Dwb", "Dwc", "Dwd"] },
    { label: "Df", matchCodes: ["Dfa", "Dfb", "Dfc", "Dfd"] },
    { label: "ET", matchCodes: ["ET"] },
    { label: "EF", matchCodes: ["EF"] },
    { label: "H", matchCodes: ["H"] },
  ];

  /** Step 2 연습하기: 표준 학습용 6도시 (순서 고정) */
  var PRACTICE_MODEL_CITY_IDS = ["singapore", "darwin", "london", "perth", "seoul", "rome"];

  /** Step 2 연습하기 문항 (데이터 로드 후 buildStandardPracticeQuizItems로 채움) */
  var PRACTICE_QUIZ_ITEMS = [];

  var practiceQuizState = { index: 0 };
  var practiceQuizMcq = { q1: null, q2: null, q3: null };
  var step3QuizMcq = { q1: null, q2: null, q3: null };
  var practiceChartInstance = null;

  var REGION_FALLBACK_VEG =
    "교육용 기후 데이터(data/기후데이터.CSV)입니다. 그래프와 쾨펜 기호를 중심으로 식생을 연결해 읽어 보세요.";
  var REGION_FALLBACK_LIFE =
    "기온·강수 패턴을 읽고 기후형과 주민생활(의식주)을 떠올리는 연습을 해 보세요.";

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

  function slugifyId(s) {
    return String(s || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "");
  }

  function parseCsvToCityData(text) {
    var lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    var rows = [];
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i].trim();
      if (!ln) continue;
      rows.push(parseCsvLineSimple(ln));
    }
    if (rows.length < 2) throw new Error("csv empty");
    var hdr = rows[0].map(function (h) {
      return h.trim();
    });
    var idx = {};
    for (var hi = 0; hi < hdr.length; hi++) idx[cleanHeaderKey(hdr[hi])] = hi;
    var need = ["city", "citykr", "type"];
    for (var ni = 0; ni < need.length; ni++) {
      if (idx[need[ni]] === undefined) throw new Error("missing col " + need[ni]);
    }
    var byId = {};
    for (var r = 1; r < rows.length; r++) {
      var row = rows[r];
      if (row.length < hdr.length) continue;
      var idRaw = String(row[idx.city] || "").trim();
      var id = slugifyId(idRaw) || idRaw || ("row_" + r);
      if (!id) continue;
      var temp = [];
      var precip = [];
      for (var m = 1; m <= 12; m++) {
        var tk = "t" + m;
        var pk = "p" + m;
        if (idx[tk] === undefined || idx[pk] === undefined) throw new Error("missing t/p");
        var tv = csvNum(row[idx[tk]]);
        var pv = csvNum(row[idx[pk]]);
        if (isNaN(tv) || isNaN(pv)) throw new Error("bad number " + id);
        temp.push(tv);
        precip.push(pv);
      }
      var latIdx = idx.lat !== undefined ? idx.lat : idx.latitude;
      var lonIdx = idx.lng !== undefined ? idx.lng : idx.lon !== undefined ? idx.lon : idx.longitude;
      var mapLat = latIdx !== undefined ? csvNum(row[latIdx]) : NaN;
      var mapLng = lonIdx !== undefined ? csvNum(row[lonIdx]) : NaN;
      if ((latIdx !== undefined || lonIdx !== undefined) && (isNaN(mapLat) || isNaN(mapLng))) {
        console.error("[CSV 좌표 오류] 도시 좌표를 숫자로 읽지 못했습니다:", idRaw || id, row[latIdx], row[lonIdx]);
      }
      byId[id] = {
        id: id,
        name: idRaw,
        nameKo: String(row[idx.citykr] || "").trim() || idRaw,
        code: String(row[idx.type] || "").trim(),
        mapLat: isNaN(mapLat) ? null : mapLat,
        mapLng: isNaN(mapLng) ? null : mapLng,
        temp: temp,
        precip: precip,
        regionVegetation: REGION_FALLBACK_VEG,
        regionLife: REGION_FALLBACK_LIFE,
      };
    }
    return Object.keys(byId)
      .sort()
      .map(function (k) {
        return byId[k];
      });
  }

  function cityIdExistsInData(id) {
    for (var i = 0; i < CITY_DATA.length; i++) {
      if (CITY_DATA[i].id === id) return true;
    }
    return false;
  }

  function buildStandardPracticeQuizItems() {
    PRACTICE_QUIZ_ITEMS = [];
    for (var i = 0; i < PRACTICE_MODEL_CITY_IDS.length; i++) {
      var pid = PRACTICE_MODEL_CITY_IDS[i];
      if (cityIdExistsInData(pid)) PRACTICE_QUIZ_ITEMS.push({ id: pid });
    }
    practiceQuizState.index = 0;
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

  function answerCodeForCity(city) {
    return normalizeKoppenCodeFromCity(city);
  }

  function displayCodeForCity(city) {
    if (!city) return "";
    var raw = String(city.code || "").trim();
    var u = raw.toUpperCase();
    if (u === "CS") return "Cs";
    if (u === "CW") return "Cw";
    if (u === "BS") return "BS";
    if (u === "BW") return "BW";
    return answerCodeForCity(city);
  }

  function rebuildQuizSymbolsFromCities() {
    var set = {};
    DEFAULT_QUIZ_SYMBOLS.forEach(function (s) {
      set[s] = true;
    });
    CITY_DATA.forEach(function (c) {
      set[answerCodeForCity(c)] = true;
    });
    QUIZ_SYMBOLS = Object.keys(set).sort();
  }

  function refreshWizFinalSelectOptions() {
    var sel = document.getElementById("wiz-final-select");
    if (!sel) return;
    sel.innerHTML = "";
    QUIZ_SYMBOLS.forEach(function (sym) {
      var opt = document.createElement("option");
      opt.value = sym;
      opt.textContent = sym;
      sel.appendChild(opt);
    });
    sel.dataset.built = "1";
  }

  /** CSV 텍스트를 파싱해 앱 상태를 채움. */
  function applyClimateCsvText(text) {
    CITY_DATA = parseCsvToCityData(text);
    buildStandardPracticeQuizItems();
    rebuildQuizSymbolsFromCities();
    refreshWizFinalSelectOptions();
    var grid = document.getElementById("game-symbol-grid");
    if (grid) {
      delete grid.dataset.built;
      delete grid.dataset.symRev;
    }
    var mapEl = document.getElementById("step3-leaflet-map");
    if (mapEl) {
      delete mapEl.dataset.leafletBuilt;
    }
    var sel3 = document.getElementById("city-select");
    if (sel3) delete sel3.dataset.ready;
    var ld = document.getElementById("app-loading");
    if (ld) {
      ld.hidden = true;
      ld.classList.remove("app-loading--error");
      ld.setAttribute("aria-hidden", "true");
      ld.setAttribute("aria-busy", "false");
    }
    document.body.classList.add("app-ready");
    initStep3();
    syncPracticeQuizChrome();
    if (currentStep === "2") {
      requestAnimationFrame(function () {
        renderPracticeQuizAfterShow();
      });
    }
  }

  function showClimateLoadError() {
    var ld = document.getElementById("app-loading");
    if (ld) {
      ld.classList.add("app-loading--error");
      ld.textContent =
        "데이터를 불러오지 못했습니다. 기후데이터.CSV 파일 경로와 형식(City, City_KR, Type, T1~T12, P1~P12)을 확인하세요.";
    }
  }

  function decodeCsvBytes(buf) {
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

  function fetchCsvText(url) {
    return fetch(url, { cache: "no-store" }).then(function (res) {
      if (!res.ok) throw new Error(String(res.status));
      return res.arrayBuffer().then(function (buf) {
        return decodeCsvBytes(buf);
      });
    });
  }

  function getEmbeddedClimateCsv() {
    if (typeof window === "undefined") return "";
    var s = window.__CLIMATE_CSV_EMBEDDED__;
    return typeof s === "string" && s.length > 0 ? s : "";
  }

  function tryApplyEmbeddedCsv() {
    var csv = getEmbeddedClimateCsv();
    if (!csv) return Promise.reject(new Error("no embedded csv"));
    try {
      applyClimateCsvText(csv);
      return Promise.resolve();
    } catch (e) {
      return Promise.reject(e);
    }
  }

  /** 메인 데이터 소스: data/기후데이터.CSV (fetch), 실패 시 임베드 폴백 */
  function loadClimateData() {
    var candidates = ["data/기후데이터.CSV", "data/기후데이터.csv"];
    var idx = 0;

    function tryFetchNext() {
      if (idx >= candidates.length) {
        return tryApplyEmbeddedCsv().catch(function () {
          showClimateLoadError();
        });
      }
      var u = candidates[idx++];
      return fetchCsvText(u)
        .then(function (text) {
          applyClimateCsvText(text);
        })
        .catch(function () {
          return tryFetchNext();
        });
    }

    return tryFetchNext();
  }

  var KOPPEN_SIDEBAR = {
    A: {
      title: "A — 열대 기후",
      paragraphs: [
        "최난월 평균기온이 18°C 이상으로, 연중 고온이 유지되는 지역입니다. 한철 한철의 기온 차는 작고 서리가 거의 없습니다.",
      ],
      bullets: [
        "기온 기준: 모든 달의 평균기온이 18°C 이상(교과서 정의에 따름).",
        "강수 패턴: 연중 다습(Af), 우기·건기(Am), 뚜렷한 건기(Aw)로 나뉩니다.",
        "세부 기호: Af(우림), Am(몬순·습윤), Aw(사바나) 등.",
      ],
    },
    B: {
      title: "B — 건조 기후",
      paragraphs: [
        "연간 증발잠재량에 비해 강수가 부족한 지역입니다. 위도에 따라 고온 사막·반건조(스텝)와 냉량 건조로 나뉩니다.",
      ],
      bullets: [
        "BWh/BWk: 사막(고온/냉량), BSh/BSk: 스텝(반건조).",
        "C·D와 달리 ‘건조도’를 먼저 판별하는 경우가 많습니다.",
        "실제 분류에서는 Thornthwaite·쾨펜의 연강수·연평균기온 공식으로 경계를 정합니다.",
      ],
    },
    C: {
      title: "C — 온대 기후",
      paragraphs: [
        "최난월 평균기온이 -3°C 초과이면서, 최난월 18°C 미만인 온화한 기후입니다. 냉대(E)와는 최난월 10°C 경계로 한대 여부도 함께 짚습니다.",
      ],
      bullets: [
        "해양성(Cfb), 지중해성(Csa/Csb), 동안 습윤·몬순(Cfa/Cwa) 등 강수 계절로 구분.",
        "최난월 -3°C 경계는 북반구 육상에서 C와 D를 가르는 대표 기준입니다.",
      ],
    },
    D: {
      title: "D — 냉대 기후",
      paragraphs: [
        "최난월이 춥고(-3°C 이하 등), 여름에는 따뜻한 달이 있어 숲이 자라는 한랭 기후입니다. 내륙성이 강한 지역에 넓게 분포합니다.",
      ],
      bullets: [
        "Df: 강수가 연중 비교적 고름, Dw: 겨울 건조(대륙성 몬순 쪽).",
        "최난월이 매우 낮으면 Dfd·Dwd 등 혹한형 기호가 붙을 수 있습니다.",
      ],
    },
    E: {
      title: "E — 한대 기후",
      paragraphs: [
        "최난월 평균기온이 10°C 미만인 달만 이어지거나, 만년설·툰드라가 지배하는 극지·고산 기후입니다.",
      ],
      bullets: [
        "ET: 툰드라, EF: 빙설기후 등으로 세분.",
        "숲이 자라기 어려운 짧은 무설기·저온이 특징입니다.",
      ],
    },
  };

  var climateDetails = {
    tropical: {
      title: "열대 기후",
      categories: [
        {
          title: "형성 요인",
          paragraphs: [
            "적도 부근 저위도에서는 연중 일사량이 크고, 적도 저기압대의 상승기류로 대기가 불안정해지기 쉬워 대류성 강수가 잦습니다. 난류의 영향을 받는 연안은 수증기가 풍부해 습도가 높게 유지되고, 연교차는 작아지는 경향이 있습니다.",
            "지형에 따라 강수가 달라집니다. 예를 들어 산지 바람막이로 내륙에 건조한 안무릎이 생기거나, 해안과 내륙의 강수량·건기 길이가 달라집니다.",
          ],
        },
        {
          title: "주요 종류",
          bullets: [
            "Af (열대 우림형): 연중 고온 다습, 우기·건기 구분이 거의 없거나 매우 짧음.",
            "Am (열대 몬순·습윤형): 짧은 건기가 있으나 연 강수량이 많고 몬순의 영향이 뚜렷함.",
            "Aw (열대 사바나형): 명확한 건기·우기, 건기에는 초원·관목 경관이 두드러짐.",
          ],
        },
        {
          title: "주요 특징 (기온, 강수 패턴)",
          paragraphs: [
            "기온: 연평균 기온이 높고, 한 해 동안의 기온 곡선이 완만하게 유지되는 것이 일반적입니다.",
            "강수: 지역에 따라 연중 고르게 내리거나, 특정 계절에 집중되어 우기·건기 대비가 큽니다. 기후 그래프에서는 ‘고온대가 길게 이어지는 모습 + 강수 막대의 계절 차이’를 함께 읽는 연습이 좋습니다.",
          ],
        },
        {
          title: "주민 생활(의식주)",
          bullets: [
            "의: 가볍고 통기성이 좋은 옷감, 강한 자외선·습기에 대비한 모자·양산, 우기에는 우의·방수 신발 등이 활용됩니다.",
            "식: 쌀·옥수수·카사바 등 작물과 열대 과일이 흔하며, 기후에 맞춘 발효·건조·향신료 활용 요리가 발달한 지역이 많습니다.",
            "주: 통풍과 차양을 살린 고깔지붕·깊은 처마, 목재·대나무 등 현지 자재를 쓴 가옥이 많습니다.",
          ],
        },
      ],
    },
    dry: {
      title: "건조 기후",
      categories: [
        {
          title: "형성 요인",
          paragraphs: [
            "부대양 고기압대의 내리막기류, 대륙 내부로의 수증기 유입 단절, 산맥의 바람막이(비무릎), 한류 연안의 냉각·건조 등이 겹치면 증발이 강수를 넘어서기 쉽습니다.",
            "위도와 고도에 따라 고온 건조(열사막)와 냉량 건조(고원·내륙의 저온 건조)로 나뉘며, 그 사이·주변에는 반건조한 스텝 지대가 이어지는 경우가 많습니다.",
          ],
        },
        {
          title: "주요 종류",
          bullets: [
            "BWh: 고온 사막 — 사하라 등 연중 강수가 극히 적은 열사막.",
            "BWk: 냉량 사막 — 고원·내륙의 저온 건조 지대.",
            "BSh / BSk: 반건조(스텝) — 초원·관목이 우세, 농업은 관개·내수에 의존하는 경우가 많음.",
          ],
        },
        {
          title: "주요 특징 (기온, 강수 패턴)",
          paragraphs: [
            "기온: 사막형은 낮 기온이 매우 높고 일교차가 크며, 냉량 건조형은 연중 기온이 낮거나 겨울이 길 수 있습니다.",
            "강수: 연 강수량이 적고 건기가 길며, 단발성 호우로 홍수가 나기도 합니다. 하천은 계절하천·오아시스와 연계해 이해하면 수월합니다.",
          ],
        },
        {
          title: "주민 생활(의식주)",
          bullets: [
            "의: 강한 자외선·모래바람에 대비한 두건·긴 소매, 사막의 큰 일교차에 맞춘 겹입기·보온 의복이 쓰입니다.",
            "식: 건조·염장 등 보존식이 중요하고, 관개·우물·오아시스를 거점으로 한 농업·목축이 이루어지는 지역이 많습니다.",
            "주: 두꺼운 벽과 작은 창으로 낮 열 유입을 줄이고, 흙·석재 등 열용량이 큰 자재와 지하 저장고로 주야 온도 차를 완화합니다.",
          ],
        },
      ],
    },
    temperate: {
      title: "온대 기후",
      categories: [
        {
          title: "형성 요인",
          paragraphs: [
            "중위도에서는 편서풍대와 이동성 저기압(전선)의 영향이 커져 사계절이 뚜렷해지고, 해양과 대륙의 열용량 차이로 해양성·대륙성이 갈립니다. 난류·한류 연안은 연안 기온과 습도에 차이를 줍니다.",
            "아시아 동쪽 등에서는 계절풍(몬순)이 강해 여름 우기·겨울 건조가 뚜렷하고, 지중해 연안은 겨울 우기·여름 건조의 지중해성 기압 배치가 나타납니다.",
          ],
        },
        {
          title: "주요 종류",
          bullets: [
            "Cfb / Cfc: 서안 해양성 — 연중 습윤에 가깝고 기온의 연교차가 상대적으로 작음.",
            "Cfa / Cwa: 동안(한쪽 해안) 습윤·동안 몬순 — 여름 강수가 두드러지는 경우가 많음.",
            "Csa / Csb: 지중해성 — 겨울에 강수가 잡히고 여름이 건조한 편.",
            "쾨펜에서는 한대(E)가 아니면서 최한월이 -3°C를 넘는 육상 온화 기후를 C로 묶는 경우가 많습니다.",
          ],
        },
        {
          title: "주요 특징 (기온, 강수 패턴)",
          paragraphs: [
            "기온: 대체로 봄·가을 전환과 여름·겨울 대비가 분명합니다. 해양의 완화 작용이 큰 곳은 겨울이 덜 춥고 여름이 덜 뜨거운 경향이 있습니다.",
            "강수: 연중 고르게 내리는 해양성, 여름 집중형 몬순형, 겨울 우기형 지중해형 등 그래프 모양으로 구분해 읽는 연습이 중요합니다.",
          ],
        },
        {
          title: "주민 생활(의식주)",
          bullets: [
            "의: 사계에 맞춘 겹입기·외투, 장마·눈·서리에 대비한 방수·방한복, 지역에 따라 황사·안개 대비용 마스크 등이 쓰입니다.",
            "식: 계절에 따라 나는 채소·과일, 벼농사·밀농사 등 기후대별 주작물과 저장·발효 식문화가 발달합니다.",
            "주: 단열을 강화한 벽체, 이중창, 난방·냉방 설비, 빗물·눈 배수를 고려한 지붕과 배수 시설이 중요합니다.",
          ],
        },
      ],
    },
    cold: {
      title: "냉대 기후",
      categories: [
        {
          title: "형성 요인",
          paragraphs: [
            "북반구 광대륙의 내륙·고위도에서는 겨울에 차가운 대륙 고기압이 강해지고, 여름에만 따뜻한 공기가 들어와 짧은 성장기가 생깁니다. 위도와 내륙성이 겹치면 혹한이 심해집니다.",
            "최한월 -3°C 이하 등으로 숲이 자라도 겨울이 길고 적설·동토가 흔하며, 위도·고도·해안 거리에 따라 Df(연중 비교적 습윤), Dw(겨울 건조·대륙성 몬순) 등으로 나뉩니다.",
          ],
        },
        {
          title: "주요 종류",
          bullets: [
            "Df: 강수가 연중 비교적 이어지는 냉대 습윤형 — 침엽·활엽 혼효림 등이 나타나는 지역이 많음.",
            "Dw: 겨울이 상대적으로 건조한 냉대형 — 동아시아 등에서 여름 몬순 강수가 두드러질 수 있음.",
            "Dfd·Dwd 등: 매우 추운 혹한형 — 성장기가 짧고 동토·영구동토대와 인접한 경우가 있음.",
          ],
        },
        {
          title: "주요 특징 (기온, 강수 패턴)",
          paragraphs: [
            "기온: 겨울 최저기온이 매우 낮고 봄·가을이 짧으며, 여름에도 고위도·내륙은 서늘한 달이 이어질 수 있습니다.",
            "강수: 적설이 강수의 한 형태로 중요합니다. 여름에 맑은 날이 많은 Dw형과 연중 분포가 고른 Df형을 강수 그래프로 비교해 볼 수 있습니다.",
          ],
        },
        {
          title: "주민 생활(의식주)",
          bullets: [
            "의: 두꺼운 외투·모자·장갑·방한화, 축열 속옷; 실내·이동 중 난방 환경에 맞춘 복장이 필요합니다.",
            "식: 보관이 쉬운 감자·양배추·곡물, 열이 든 수프·발효식, 냉장·동결 보관이 일상화된 지역이 많습니다.",
            "주: 단열·이중창·바람막이 현관, 난방(지역난방·개별난방), 지붕 적설 제거·배수, 동파 방지 배관 설계가 중요합니다.",
          ],
        },
      ],
    },
    polar: {
      title: "한대 기후",
      categories: [
        {
          title: "형성 요인",
          paragraphs: [
            "극고위도에서는 일사의 입사각이 작고 일조 시간·일사량의 계절 차이가 극단적입니다. 눈과 얼음의 높은 반사율(알베도)이 복사 균형을 더욱 싸늘하게 만듭니다.",
            "극저기압대·극동방기류 등과 맞물려 강풍·저온이 이어지고, 해안과 내륙·고도에 따라 무설기 길이와 식생이 달라집니다.",
          ],
        },
        {
          title: "주요 종류",
          bullets: [
            "ET: 툰드라 기후 — 짧은 무설기에 이끼·지의·저지 관목이 자라고 나무는 거의 자라기 어렵습니다.",
            "EF: 빙설 기후 — 만년설·빙하가 지배하고 식생이 거의 없거나 극히 빈약합니다.",
            "고산지에서는 위도와 관계없이 한대에 가까운 경관이 나타나기도 합니다.",
          ],
        },
        {
          title: "주요 특징 (기온, 강수 패턴)",
          paragraphs: [
            "기온: 연평균이 매우 낮고 겨울은 혹한, 여름도 서늘한 경우가 많습니다. 일교차·연교차가 지역에 따라 크게 달라질 수 있습니다.",
            "강수: 연 강수량은 많지 않은 편이나 눈으로 쌓이는 형태가 중요하며, 해안은 증발원이 있어 구름·강수가 상대적으로 늘 수 있습니다.",
          ],
        },
        {
          title: "주민 생활(의식주)",
          bullets: [
            "의: 방풍·보온이 강한 다층 의복, 고글·얼굴 보호대; 실내외 온도 차가 클 때의 착탈이 잦습니다.",
            "식: 열량이 높은 식사, 보존·건조·냉동 식품, 수렵·어업·축산에 기댄 전통이 강한 공동체가 많습니다.",
            "주: 단열이 매우 강한 벽체, 이중·삼중 창, 바람막이, 에너지 효율 높은 난방, 설원·빙판을 고려한 도로·이동 수단이 필요합니다.",
          ],
        },
      ],
    },
  };

  var modalRoot = document.getElementById("modal-root");
  var modalTitle = document.getElementById("modal-title");
  var modalBody = document.getElementById("modal-body");
  var step4ResultModal = document.getElementById("step4-result-modal");
  var step4ResultView = document.getElementById("step4-result-view");
  var step4WrongView = document.getElementById("step4-wrong-view");
  var step4ResultTitle = document.getElementById("step4-result-title");
  var step4ResultScore = document.getElementById("step4-result-score");
  var step4ResultConfig = document.getElementById("step4-result-config");
  var step4ResultImage = document.getElementById("step4-result-image");
  var step4ResultMessage = document.getElementById("step4-result-message");
  var step4WrongList = document.getElementById("step4-wrong-list");
  var stepButtons = document.querySelectorAll(".step-pill");
  var panels = {
    1: document.getElementById("panel-step1"),
    2: document.getElementById("panel-step2"),
    3: document.getElementById("panel-step3"),
    4: document.getElementById("panel-step4"),
  };

  var currentStep = "1";
  var chartInstance = null;
  var gameChartInstance = null;
  /** Step 3: 기온/최건월 입력 포커스 — 그래프 가이드 전환용 */
  var step3InputFocus = { temp: false, precip: false };
  var step3FocusSyncTimer = null;

  var step4Game = {
    timerId: null,
    active: false,
    inputLocked: false,
    configuredSeconds: 200,
    configuredGoalScore: 50,
    timeLeft: 200,
    score: 0,
    lastCityIdx: -1,
    currentCityIndex: -1,
    history: [],
    historyCursor: -1,
    roundsDone: 0,
    maxRounds: 4,
    awaitingNextAfterModal: false,
    wrongAnswers: [],
  };

  function escapeHtml(s) {
    var div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }

  function renderCategoryCard(cat) {
    var inner = [];
    if (cat.paragraphs && cat.paragraphs.length) {
      cat.paragraphs.forEach(function (p) {
        inner.push("<p>" + escapeHtml(p) + "</p>");
      });
    }
    if (cat.bullets && cat.bullets.length) {
      inner.push("<ul>");
      cat.bullets.forEach(function (b) {
        inner.push("<li>" + escapeHtml(b) + "</li>");
      });
      inner.push("</ul>");
    }
    if (!inner.length) inner.push("<p>" + escapeHtml("(내용 없음)") + "</p>");
    return (
      '<article class="modal-category-card">' +
      '<h3 class="modal-category-heading">' +
      escapeHtml(cat.title) +
      "</h3>" +
      '<div class="modal-category-body">' +
      inner.join("") +
      "</div>" +
      "</article>"
    );
  }

  function renderKoppenSidebarBody(data) {
    var parts = [];
    if (data.paragraphs) {
      data.paragraphs.forEach(function (p) {
        parts.push("<p>" + escapeHtml(p) + "</p>");
      });
    }
    if (data.bullets) {
      parts.push("<ul>");
      data.bullets.forEach(function (b) {
        parts.push("<li>" + escapeHtml(b) + "</li>");
      });
      parts.push("</ul>");
    }
    return parts.join("");
  }

  function setActiveKoppenChip(letter) {
    document.querySelectorAll(".koppen-chip").forEach(function (btn) {
      var on = btn.getAttribute("data-koppen") === letter;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    var data = KOPPEN_SIDEBAR[letter];
    if (!data) return;
    var h = document.getElementById("koppen-sidebar-heading");
    var b = document.getElementById("koppen-sidebar-body");
    if (h) h.textContent = data.title;
    if (b) b.innerHTML = renderKoppenSidebarBody(data);
  }

  function openModal(key) {
    var data = climateDetails[key];
    if (!data || !modalRoot || !modalTitle || !modalBody) return;
    modalTitle.textContent = data.title;
    modalBody.className = "modal-body modal-body--categories";
    modalBody.innerHTML = data.categories.map(renderCategoryCard).join("");
    modalRoot.hidden = false;
    modalRoot.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    var closeBtn = modalRoot.querySelector(".modal-close");
    if (closeBtn) closeBtn.focus();
  }

  function closeModal() {
    if (!modalRoot) return;
    modalRoot.hidden = true;
    modalRoot.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  function getCityById(id) {
    for (var i = 0; i < CITY_DATA.length; i++) {
      if (CITY_DATA[i].id === id) return CITY_DATA[i];
    }
    return CITY_DATA.length ? CITY_DATA[0] : null;
  }

  function getCurrentCity() {
    if (!CITY_DATA.length) return null;
    var sel = document.getElementById("city-select");
    var id = sel && sel.value ? sel.value : CITY_DATA[0].id;
    return getCityById(id);
  }

  /** CSV code·쾨펜 1차 기준 지도 마커 채색 (교육용) */
  function mapClimateFillColor(city) {
    if (!city) return "#999999";
    var raw = String(city.code || "").trim().toUpperCase();
    if (raw === "H") return "#FFFFFF";
    var ac = answerCodeForCity(city);
    var L1 = ac.charAt(0);
    if (L1 === "A") return "#FF0000";
    if (L1 === "B") return "#FFA500";
    if (L1 === "C") return "#FFFF00";
    if (L1 === "D") return "#0000FF";
    if (L1 === "E") return "#800080";
    return "#999999";
  }

  function mapClimateStrokeColor(city) {
    if (!city) return "#ffffff";
    var raw = String(city.code || "").trim().toUpperCase();
    if (raw === "H" || answerCodeForCity(city).charAt(0) === "C") return "#555555";
    return "#ffffff";
  }

  function isHighlandAnswerCity(city) {
    return !!(city && answerCodeForCity(city) === "H");
  }

  function highlandLatitudeHintText(city) {
    if (!city || typeof city.mapLat !== "number") return "";
    var lat = city.mapLat;
    var hemi = lat >= 0 ? "북위" : "남위";
    var av = Math.abs(lat);
    return (
      "이 지점은 위도 " +
      hemi +
      " " +
      av.toFixed(1) +
      "°로 저위도에 가깝지만, 고산 기후(H)는 해발 고도 때문에 기온이 낮게 나타날 수 있습니다. 위도만으로 열대·온대를 판단하지 말고 그래프 전체를 보세요."
    );
  }

  function updatePracticeHighlandHint(city) {
    var el = document.getElementById("practice-highland-hint");
    if (!el) return;
    if (isHighlandAnswerCity(city)) {
      el.hidden = false;
      el.textContent = highlandLatitudeHintText(city);
    } else {
      el.hidden = true;
      el.textContent = "";
    }
  }

  function updateStep3HighlandHint(city) {
    var el = document.getElementById("s3-highland-hint");
    if (!el) return;
    if (isHighlandAnswerCity(city)) {
      el.hidden = false;
      el.textContent = highlandLatitudeHintText(city);
    } else {
      el.hidden = true;
      el.textContent = "";
    }
  }

  function updateGameHighlandHint(city) {
    var el = document.getElementById("game-highland-hint");
    if (!el) return;
    if (city && isHighlandAnswerCity(city)) {
      el.hidden = false;
      el.textContent = highlandLatitudeHintText(city);
    } else {
      el.hidden = true;
      el.textContent = "";
    }
  }

  function clearGameHighlandHint() {
    updateGameHighlandHint(null);
  }

  /** Step 3: Leaflet + OSM 타일 */
  var step3Leaflet = { map: null, markers: null };
  /** 마커 클릭 시 이동할 줌(초기/선택 시 공통) */
  var STEP3_MARKER_FOCUS_ZOOM = 3;

  function invalidateStep3LeafletMap() {
    if (step3Leaflet.map) {
      step3Leaflet.map.invalidateSize({ animate: false });
    }
  }

  function syncStep3MapMarkers(selectedId) {
    var selectedCity = getCityById(selectedId);
    if (
      step3Leaflet.map &&
      selectedCity &&
      typeof selectedCity.mapLat === "number" &&
      typeof selectedCity.mapLng === "number"
    ) {
      step3Leaflet.map.setView([selectedCity.mapLat, selectedCity.mapLng], STEP3_MARKER_FOCUS_ZOOM, { animate: true });
    }
    if (step3Leaflet.markers) {
      Object.keys(step3Leaflet.markers).forEach(function (id) {
        var m = step3Leaflet.markers[id];
        var on = id === selectedId;
        var c = getCityById(id);
        var fill = on ? "#007aff" : mapClimateFillColor(c);
        var stroke = on ? "#ffffff" : mapClimateStrokeColor(c);
        m.setStyle({
          fillColor: fill,
          color: stroke,
          weight: on ? 3 : 2,
          radius: on ? 7 : 5,
        });
        if (on && typeof m.bringToFront === "function") m.bringToFront();
      });
    }
  }

  function buildStep3MapMarkers() {
    var el = document.getElementById("step3-leaflet-map");
    if (!el || el.dataset.leafletBuilt === "2") return;
    if (typeof L === "undefined") {
      el.innerHTML =
        '<p class="step3-leaflet-fallback">지도 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 페이지를 새로고침해 보세요.</p>';
      return;
    }
    el.innerHTML = "";
    el.dataset.leafletBuilt = "2";
    var map = L.map(el, {
      scrollWheelZoom: true,
      zoomControl: true,
      worldCopyJump: true,
      minZoom: 0,
      maxZoom: 12,
      maxBounds: [
        [-85, -180],
        [85, 180],
      ],
      maxBoundsViscosity: 1.0,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 12,
      noWrap: true,
    }).addTo(map);
    step3Leaflet.map = map;
    var markers = {};
    var latLngs = [];
    CITY_DATA.forEach(function (c) {
      if (typeof c.mapLat !== "number" || typeof c.mapLng !== "number") {
        console.error("[지도 마커 생략] 좌표가 없거나 잘못된 도시:", c && c.id ? c.id : "(unknown)");
        return;
      }
      var ll = [c.mapLat, c.mapLng];
      latLngs.push(ll);
      var marker = L.circleMarker(ll, {
        radius: 5,
        weight: 2,
        color: mapClimateStrokeColor(c),
        fillColor: mapClimateFillColor(c),
        fillOpacity: 0.92,
      });
      marker.bindTooltip(c.nameKo, { direction: "auto" });
      marker.on("click", function () {
        map.flyTo(ll, STEP3_MARKER_FOCUS_ZOOM, { duration: 0.5, easeLinearity: 0.25 });
        var sel = document.getElementById("city-select");
        if (!sel) return;
        sel.value = c.id;
        sel.dispatchEvent(new Event("change", { bubbles: true }));
      });
      marker.addTo(map);
      markers[c.id] = marker;
    });
    step3Leaflet.markers = markers;
    if (latLngs.length) {
      map.fitBounds(L.latLngBounds(latLngs), { padding: [32, 32], maxZoom: 3 });
    } else {
      map.setView([20, 0], 0);
    }
  }

  function annualPrecipTotal(arr) {
    var s = 0;
    for (var i = 0; i < arr.length; i++) s += arr[i];
    return Math.round(s);
  }

  /** 7월(인덱스 6) 평균기온이 1월(0)보다 낮으면 남반구(달력 월 기준)로 간주 */
  function isSouthernHemisphereCity(city) {
    if (!city || !city.temp || city.temp.length < 12) return false;
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

  /**
   * C/D 2차(교과서형): 고일사반 최건월 &lt; 30mm 이고 겨울철 최다우가 여름철 최건의 3배 이상이면 s(여름 건조).
   * 겨울철 최건이 고일사반 최다우의 1/3 미만이면 w(겨울 건조). 둘 다이면 상대적으로 더 뚜렷한 쪽을 택함.
   */
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

  /**
   * 월별 교육용 자료로부터 쾨펜 코드 도출(A: Am/Aw는 f_min &gt; 100 − P_ann/25 규칙).
   * Cf·Cfa/Cfb는 최난월 22°C 기준으로 a/b.
   */
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

  var WIZ_TEMP_TOL = 1;

  function guidelineLineDataset(y, color, dash) {
    return {
      type: "line",
      label: "",
      data: new Array(12).fill(y),
      borderColor: color,
      backgroundColor: "transparent",
      borderWidth: 1.5,
      borderDash: dash,
      pointRadius: 0,
      pointHoverRadius: 0,
      fill: false,
      tension: 0,
      yAxisID: "y",
      order: 0,
      skipLegend: true,
    };
  }

  function precipGuideLineDataset(mm, color, dash) {
    return {
      type: "line",
      label: "",
      data: new Array(12).fill(mm),
      borderColor: color,
      backgroundColor: "transparent",
      borderWidth: 1.5,
      borderDash: dash,
      pointRadius: 0,
      pointHoverRadius: 0,
      fill: false,
      tension: 0,
      yAxisID: "y1",
      order: 0,
      skipLegend: true,
    };
  }

  function monthIndexOfMinTemp(city) {
    var arr = city.temp;
    var m = Math.min.apply(null, arr);
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] === m) return i;
    }
    return 0;
  }

  function monthIndexOfMaxTemp(city) {
    var arr = city.temp;
    var m = Math.max.apply(null, arr);
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] === m) return i;
    }
    return 0;
  }

  /**
   * Step 2~4 공통: 축 눈금 규칙 (쾨펜 1차 기호 기준)
   * A·B·C: 기온 -20~40°C(10°), 강수 0~600mm(100)
   * D·E: 기온 -40~40°C(10°), 강수 0~400mm(100)
   */
  function getClimateChartAxisProfile(city) {
    var L = city ? answerCodeForCity(city).charAt(0) : "C";
    if (L === "D" || L === "E") {
      return { tempMin: -40, tempMax: 40, tempStepSize: 10, rainMax: 400, rainStepSize: 100 };
    }
    if (L === "A" || L === "B" || L === "C" || L === "H") {
      return { tempMin: -20, tempMax: 40, tempStepSize: 10, rainMax: 600, rainStepSize: 100 };
    }
    return { tempMin: -20, tempMax: 40, tempStepSize: 10, rainMax: 600, rainStepSize: 100 };
  }

  function buildChartConfig(city, hideTitle, chartOpts) {
    chartOpts = chartOpts || {};
    var showGuidelines = !!chartOpts.guidelines;
    var tempScaffoldMode = !!chartOpts.tempScaffoldMode;
    var precipScaffold = !!chartOpts.precipScaffold;
    var userMarkers = chartOpts.userMarkers;
    var ax = getClimateChartAxisProfile(city);

    var datasets = [];
    if (showGuidelines) {
      if (tempScaffoldMode) {
        datasets.push(guidelineLineDataset(18, "rgba(192, 57, 43, 0.34)", [6, 4]));
        datasets.push(guidelineLineDataset(-3, "rgba(192, 57, 43, 0.4)", [8, 4]));
        datasets.push(guidelineLineDataset(22, "rgba(88, 86, 214, 0.42)", [4, 6]));
      } else {
        datasets.push(guidelineLineDataset(18, "rgba(192, 57, 43, 0.75)", [5, 5]));
        datasets.push(guidelineLineDataset(10, "rgba(192, 57, 43, 0.5)", [3, 4]));
        datasets.push(guidelineLineDataset(-3, "rgba(192, 57, 43, 0.6)", [8, 4]));
      }
    }
    if (precipScaffold) {
      datasets.push(precipGuideLineDataset(60, "rgba(10, 132, 255, 0.38)", [10, 5]));
      datasets.push(precipGuideLineDataset(30, "rgba(10, 132, 255, 0.3)", [6, 6]));
      datasets.push(precipGuideLineDataset(20, "rgba(10, 132, 255, 0.24)", [2, 5]));
    }
    datasets.push({
      type: "bar",
      label: "강수 (mm)",
      data: city.precip,
      backgroundColor: "rgba(0, 122, 255, 0.35)",
      borderColor: "rgba(0, 122, 255, 0.5)",
      borderWidth: 1,
      borderRadius: 6,
      yAxisID: "y1",
      order: 1,
    });
    datasets.push({
      type: "line",
      label: "기온 (°C)",
      data: city.temp,
      borderColor: "#FF3B30",
      backgroundColor: "transparent",
      borderWidth: 2.5,
      tension: 0.35,
      fill: false,
      yAxisID: "y",
      pointRadius: 3,
      pointBackgroundColor: "#FF3B30",
      pointBorderColor: "#FFFFFF",
      pointBorderWidth: 1.5,
      order: 2,
    });
    if (userMarkers && city && city.temp && city.temp.length === 12) {
      var ic = monthIndexOfMinTemp(city);
      var iw = monthIndexOfMaxTemp(city);
      var hasC = !isNaN(userMarkers.coldest);
      var hasW = !isNaN(userMarkers.warmest);
      if (hasC || hasW) {
        var markerData = new Array(12).fill(null);
        if (hasC) markerData[ic] = userMarkers.coldest;
        if (hasW) markerData[iw] = userMarkers.warmest;
        datasets.push({
          type: "line",
          label: "내가 읽은 기온",
          data: markerData,
          borderColor: "transparent",
          backgroundColor: "transparent",
          borderWidth: 0,
          pointBackgroundColor: "#34C759",
          pointBorderColor: "#ffffff",
          pointBorderWidth: 2,
          pointRadius: 6,
          pointHoverRadius: 8,
          showLine: false,
          spanGaps: false,
          tension: 0,
          fill: false,
          yAxisID: "y",
          order: 3,
          skipLegend: false,
        });
      }
    }

    return {
      type: "bar",
      data: {
        labels: MONTH_LABELS,
        datasets: datasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: {
            display: !hideTitle,
            position: "top",
            labels: {
              font: {
                family: "Pretendard, -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', sans-serif",
                size: 11,
              },
              boxWidth: 12,
              filter: function (legendItem, chartData) {
                var ds = chartData.datasets[legendItem.datasetIndex];
                return !ds.skipLegend;
              },
            },
          },
          title: {
            display: !!(city && !hideTitle),
            text: city ? city.nameKo : "",
            font: {
              family: "Pretendard, -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', sans-serif",
              size: 14,
              weight: "600",
            },
            color: "#1c1c1e",
            padding: { bottom: 8 },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: { size: 10 }, maxRotation: 0 },
          },
          y: {
            type: "linear",
            position: "left",
            min: ax.tempMin,
            max: ax.tempMax,
            title: { display: true, text: "°C", font: { size: 11 } },
            grid: { color: "rgba(60,60,67,0.08)" },
            ticks: {
              font: { size: 10 },
              stepSize: ax.tempStepSize,
            },
          },
          y1: {
            type: "linear",
            position: "right",
            min: 0,
            max: ax.rainMax,
            title: { display: true, text: "mm", font: { size: 11 } },
            grid: { drawOnChartArea: false },
            ticks: {
              font: { size: 10 },
              stepSize: ax.rainStepSize,
            },
          },
        },
      },
    };
  }

  function destroyChart() {
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
  }

  function refreshStep3ClimateChart() {
    var p = document.getElementById("panel-step3");
    if (!p || p.hidden) return;
    updateMainChart();
  }

  function scheduleStep3FocusSync() {
    clearTimeout(step3FocusSyncTimer);
    step3FocusSyncTimer = setTimeout(function () {
      var a = document.activeElement;
      step3InputFocus.temp = !!(a && (a.id === "s3-t-coldest" || a.id === "s3-t-warmest"));
      step3InputFocus.precip = !!(a && a.id === "s3-p-driest");
      refreshStep3ClimateChart();
    }, 60);
  }

  function hideStep3ReportCard() {
    var card = document.getElementById("s3-report-card");
    if (!card) return;
    var chk = card.querySelector(".s3-report-check");
    if (chk) chk.classList.remove("s3-report-check--animate");
    card.classList.remove("s3-report-card--visible");
    card.hidden = true;
  }

  function showStep3ReportCard() {
    var city = getCurrentCity();
    if (!city) return;
    var tcIn = document.getElementById("s3-t-coldest");
    var pdIn = document.getElementById("s3-p-driest");
    var body = document.getElementById("s3-report-body");
    var card = document.getElementById("s3-report-card");
    if (!card || !body) return;
    var ar = actualTempRange(city);
    var tc = tcIn && tcIn.value !== "" ? parseFloat(tcIn.value) : ar.coldest;
    var pd = pdIn && pdIn.value !== "" ? parseFloat(pdIn.value) : Math.min.apply(null, city.precip);
    var sym = answerCodeForCity(city);
    body.textContent =
      "내가 분석한 결과: " +
      city.nameKo +
      "은(는) 최한월 " +
      tc +
      "°, 최건월 " +
      pd +
      "mm이므로 " +
      sym +
      "입니다.";
    card.classList.remove("s3-report-card--visible");
    card.hidden = false;
    var chk = card.querySelector(".s3-report-check");
    if (chk) {
      chk.classList.remove("s3-report-check--animate");
      void chk.offsetWidth;
      chk.classList.add("s3-report-check--animate");
    }
    requestAnimationFrame(function () {
      card.classList.add("s3-report-card--visible");
    });
  }

  function flashGameCombo() {
    var el = document.getElementById("game-combo-flash");
    if (!el) return;
    el.classList.remove("game-combo-flash--pop");
    void el.offsetWidth;
    el.classList.add("game-combo-flash--pop");
    window.setTimeout(function () {
      el.classList.remove("game-combo-flash--pop");
    }, 720);
  }

  function updateMainChart() {
    var canvas = document.getElementById("climateChart");
    if (!canvas || typeof Chart === "undefined") return;
    var city = getCurrentCity();
    if (!city) return;
    var tcIn = document.getElementById("s3-t-coldest");
    var twIn = document.getElementById("s3-t-warmest");
    var pdIn = document.getElementById("s3-p-driest");
    var tempScaffold =
      step3InputFocus.temp ||
      (tcIn && tcIn.value !== "") ||
      (twIn && twIn.value !== "");
    var precipScaffold = step3InputFocus.precip || (pdIn && pdIn.value !== "");
    var tc = tcIn && tcIn.value !== "" ? parseFloat(tcIn.value) : NaN;
    var tw = twIn && twIn.value !== "" ? parseFloat(twIn.value) : NaN;
    var userMarkers = !isNaN(tc) || !isNaN(tw) ? { coldest: tc, warmest: tw } : null;
    destroyChart();
    chartInstance = new Chart(
      canvas.getContext("2d"),
      buildChartConfig(city, false, {
        guidelines: true,
        tempScaffoldMode: tempScaffold,
        precipScaffold: precipScaffold,
        userMarkers: userMarkers,
      })
    );
  }

  function destroyPracticeChart() {
    if (practiceChartInstance) {
      practiceChartInstance.destroy();
      practiceChartInstance = null;
    }
  }

  function updatePracticeQuizChart(city) {
    var canvas = document.getElementById("practiceQuizChart");
    if (!canvas || typeof Chart === "undefined" || !city) return;
    destroyPracticeChart();
    var cfg = buildChartConfig(city, true, { guidelines: true });
    cfg.options.plugins.legend.display = true;
    cfg.options.plugins.title.display = false;
    practiceChartInstance = new Chart(canvas.getContext("2d"), cfg);
  }

  function resetPracticeMcqUi() {
    practiceQuizMcq.q1 = null;
    practiceQuizMcq.q2 = null;
    practiceQuizMcq.q3 = null;
    resetPracticeGuideBoard();
    syncPracticeMcqGates();
  }

  function updatePracticeAnswerCheck() {
    var box = document.getElementById("practice-answer-result");
    if (!box) return;
    var p = practiceQuizMcq;
    if (!p.q1 || !p.q2 || !p.q3) {
      box.textContent = "Q1~Q3을 모두 고르면 여기에 결과가 표시됩니다.";
      return;
    }
    var item = PRACTICE_QUIZ_ITEMS[practiceQuizState.index];
    if (!item) return;
    var prCity = getCityById(item.id);
    if (!prCity) return;
    var exp = expectedKoppenMcqForCity(prCity);
    if (!exp) {
      box.textContent = "이 문항은 자동 채점 형식에 없습니다.";
      return;
    }
    var allOk = p.q1 === exp.q1 && p.q2 === exp.q2 && p.q3 === exp.q3;
    if (allOk) {
      box.textContent = "정답입니다.";
    } else {
      var hints = buildMcqMismatchReasons(prCity, p, exp);
      box.textContent = "오답입니다. " + hints.join(" ");
    }
  }

  function syncPracticeQuizChrome() {
    var n = PRACTICE_QUIZ_ITEMS.length;
    var idx = practiceQuizState.index;
    var counter = document.getElementById("practice-quiz-counter");
    var cityEl = document.getElementById("practice-quiz-city");
    var prevBtn = document.getElementById("practice-quiz-prev");
    var nextBtn = document.getElementById("practice-quiz-next");

    if (!n) {
      if (counter) counter.textContent = "문제 0 / 0";
      if (cityEl) cityEl.textContent = "데이터를 불러오는 중이거나 없습니다.";
      if (prevBtn) prevBtn.disabled = true;
      if (nextBtn) nextBtn.disabled = true;
      destroyPracticeChart();
      refreshPracticeGuideForCity(null);
      return;
    }
    if (idx >= n) practiceQuizState.index = idx = n - 1;
    var item = PRACTICE_QUIZ_ITEMS[idx];
    var city = item ? getCityById(item.id) : null;
    if (!city) {
      if (cityEl) cityEl.textContent = "도시를 찾을 수 없습니다.";
      destroyPracticeChart();
      refreshPracticeGuideForCity(null);
      return;
    }

    if (counter) counter.textContent = "문제 " + (idx + 1) + " / " + n;
    if (cityEl) cityEl.textContent = city.nameKo;

    if (prevBtn) prevBtn.disabled = idx <= 0;
    if (nextBtn) nextBtn.disabled = idx >= n - 1;

    resetPracticeMcqUi();
    updatePracticeQuizChart(city);
    updatePracticeHighlandHint(city);
    refreshPracticeGuideForCity(city);
  }

  var ANNUAL_RANGE_LABELS = {
    ge500: "500 mm 이상",
    mid: "250 mm 이상 ~ 500 mm 미만",
    low: "0 ~ 250 mm 미만",
  };

  function setPracticeAnnualChoice(key) {
    var hid = document.getElementById("practice-p-annual");
    var textEl = document.getElementById("practice-annual-trigger-text");
    if (hid) hid.value = "";
    if (!key) {
      if (textEl) textEl.textContent = "구간선택하기";
      document.querySelectorAll(".practice-annual-opt").forEach(function (b) {
        b.classList.remove("is-selected");
        b.setAttribute("aria-checked", "false");
      });
      return;
    }
    var btn = document.querySelector('.practice-annual-opt[data-practice-annual="' + key + '"]');
    if (!btn) return;
    var mm = btn.getAttribute("data-practice-mm");
    if (hid && mm) hid.value = mm;
    if (textEl) textEl.textContent = ANNUAL_RANGE_LABELS[key] || "선택됨";
    document.querySelectorAll(".practice-annual-opt").forEach(function (b) {
      var on = b.getAttribute("data-practice-annual") === key;
      b.classList.toggle("is-selected", on);
      b.setAttribute("aria-checked", on ? "true" : "false");
    });
  }

  function closePracticeAnnualPanel() {
    var panel = document.getElementById("practice-annual-panel");
    var trg = document.getElementById("practice-annual-trigger");
    if (panel) panel.hidden = true;
    if (trg) trg.setAttribute("aria-expanded", "false");
  }

  function clearPracticeAnnualUi() {
    setPracticeAnnualChoice(null);
    closePracticeAnnualPanel();
  }

  function clearPracticeQuizInputs() {
    ["practice-t-coldest", "practice-t-warmest", "practice-p-driest"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = "";
    });
    clearPracticeAnnualUi();
  }

  function initPracticeAnnualAccordion() {
    var root = document.getElementById("practice-annual-accordion");
    if (!root || root.dataset.wired) return;
    root.dataset.wired = "1";

    var trg = document.getElementById("practice-annual-trigger");
    if (trg) {
      trg.addEventListener("click", function () {
        var panel = document.getElementById("practice-annual-panel");
        if (!panel) return;
        var willOpen = panel.hidden;
        panel.hidden = !willOpen;
        trg.setAttribute("aria-expanded", willOpen ? "true" : "false");
      });
    }

    root.addEventListener("click", function (e) {
      var opt = e.target.closest(".practice-annual-opt");
      if (!opt || !root.contains(opt)) return;
      var key = opt.getAttribute("data-practice-annual");
      if (!key) return;
      setPracticeAnnualChoice(key);
      closePracticeAnnualPanel();
    });
  }

  function renderPracticeQuizAfterShow() {
    syncPracticeQuizChrome();
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        if (practiceChartInstance) practiceChartInstance.resize();
      });
    });
  }

  function goPracticeQuiz(delta) {
    var n = PRACTICE_QUIZ_ITEMS.length;
    var next = practiceQuizState.index + delta;
    if (next < 0 || next >= n) return;
    practiceQuizState.index = next;
    clearPracticeQuizInputs();
    syncPracticeQuizChrome();
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        if (practiceChartInstance) practiceChartInstance.resize();
      });
    });
  }

  /**
   * CITY_DATA.code → Step 3 MCQ 정답 (연습하기와 동일). 3차(a/b)는 Cfa·Cfb만.
   */
  /** Cfa·Cfb만 3차(a/b) 문항 사용 (교재: Cf 계열만 3차 구분) */
  function cityNeedsMcqThirdStep(code) {
    if (!code || typeof code !== "string" || code.length < 3) return false;
    return code.charAt(0) === "C" && code.charAt(1) === "f" && (code.charAt(2) === "a" || code.charAt(2) === "b");
  }

  function koppenCodeToMcqAnswer(code) {
    if (!code || typeof code !== "string") return null;
    var c = code.trim();
    if (c.toUpperCase() === "H") return { q1: "H", q2: "pass", q3: "pass" };
    if (c.length < 2) return null;
    var L1 = c.charAt(0);
    if (L1 === "A") {
      var a2 = c.charAt(1).toLowerCase();
      if ("fmw".indexOf(a2) < 0) return null;
      return { q1: "A", q2: a2, q3: "pass" };
    }
    if (L1 === "B") {
      if (c.length < 3) return null;
      var bw = c.charAt(1);
      if (bw !== "W" && bw !== "S") return null;
      return { q1: "B", q2: bw, q3: "pass" };
    }
    if (L1 === "C") {
      var c2 = c.charAt(1);
      var c3 = c.length > 2 ? c.charAt(2).toLowerCase() : "";
      if (c2 === "f") {
        if (c3 === "a" || c3 === "b") return { q1: "C", q2: "f", q3: c3 };
        return { q1: "C", q2: "f", q3: "pass" };
      }
      if (c2 === "s" || c2 === "w") {
        return { q1: "C", q2: c2, q3: "pass" };
      }
      return null;
    }
    if (L1 === "D") {
      var d2 = c.charAt(1);
      if (d2 === "w") return { q1: "D", q2: "w", q3: "pass" };
      if (d2 === "f") return { q1: "D", q2: "f", q3: "pass" };
      if (d2 === "s") return { q1: "D", q2: "s", q3: "pass" };
      return null;
    }
    if (L1 === "E") {
      var e2 = c.charAt(1);
      if (e2 !== "T" && e2 !== "F") return null;
      return { q1: "E", q2: e2, q3: "pass" };
    }
    return null;
  }

  function expectedKoppenMcqForCity(city) {
    return koppenCodeToMcqAnswer(answerCodeForCity(city));
  }

  /** Step 2 연습하기: 단계별 가이드 카드 상태 */
  var practiceGuideState = {
    L1: null,
    L2: null,
    L3: null,
    locked1: false,
    locked2: false,
    locked3: false,
  };

  function getPracticeGuideCity() {
    if (!PRACTICE_QUIZ_ITEMS.length) return null;
    return getCityById(PRACTICE_QUIZ_ITEMS[practiceQuizState.index].id);
  }

  function fmtGuideTemp(x) {
    var n = Number(x);
    return (Math.round(n * 10) / 10).toFixed(1);
  }

  function practiceGuideMonthStats(city) {
    var t = city.temp;
    var p = city.precip;
    var tMin = Math.min.apply(null, t);
    var tMax = Math.max.apply(null, t);
    var iMin = 0;
    var iMax = 0;
    var i;
    for (i = 0; i < 12; i++) {
      if (t[i] === tMin) iMin = i;
      if (t[i] === tMax) iMax = i;
    }
    var pAnn = annualPrecipTotal(p);
    var pMin = Math.min.apply(null, p);
    var ipMin = 0;
    for (i = 0; i < 12; i++) {
      if (p[i] === pMin) ipMin = i;
    }
    return { tMin: tMin, tMax: tMax, iMin: iMin, iMax: iMax, pAnn: pAnn, pMin: pMin, ipMin: ipMin };
  }

  /** 교사용 가이드: 1차 판단 (H 표기 우선 → A → E → B → C → D) */
  function teacherDeriveL1(city) {
    var code = answerCodeForCity(city);
    if (code === "H" || String(city.code || "").trim().toUpperCase() === "H") return "H";
    var st = practiceGuideMonthStats(city);
    if (st.tMin >= 18) return "A";
    if (st.tMax < 10) return "E";
    if (st.pAnn < 500) return "B";
    if (st.tMin >= -3) return "C";
    return "D";
  }

  function teacherFThresholdForL1(L1) {
    if (L1 === "A") return 60;
    if (L1 === "C") return 30;
    if (L1 === "D") return 20;
    return 0;
  }

  /** A·C·D 2차: f(최건월 기준) 또는 m/s/w (A는 m·w, C·D는 계절성) */
  function teacherSecondLetterACD(city, L1) {
    var st = practiceGuideMonthStats(city);
    var th = teacherFThresholdForL1(L1);
    if (st.pMin >= th) return "f";
    if (L1 === "A") {
      var amTh = 100 - st.pAnn / 25;
      return st.pMin > amTh ? "m" : "w";
    }
    return cdSecondLetterFromSeasonality(city);
  }

  function practiceGuideFillRationale(el, lines) {
    if (!el) return;
    el.innerHTML = "";
    el.hidden = false;
    for (var i = 0; i < lines.length; i++) {
      var p = document.createElement("p");
      p.className = "practice-guide-rationale-line";
      p.textContent = lines[i];
      el.appendChild(p);
    }
  }

  function practiceGuideSetL1ChipsDisabled(disabled) {
    document.querySelectorAll("#practice-guide-l1-chips .practice-guide-chip").forEach(function (b) {
      b.disabled = !!disabled;
    });
  }

  function practiceGuideClearChipRow(container) {
    if (!container) return;
    container.innerHTML = "";
  }

  function practiceGuideAppendChip(container, label, val, attr, selectedVal) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "practice-guide-chip";
    btn.textContent = label;
    btn.setAttribute(attr, val);
    if (selectedVal === val) btn.classList.add("is-selected");
    container.appendChild(btn);
  }

  function practiceGuideSelectChip(container, attr, val) {
    if (!container) return;
    container.querySelectorAll(".practice-guide-chip").forEach(function (b) {
      var on = b.getAttribute(attr) === val;
      b.classList.toggle("is-selected", on);
    });
  }

  function buildPracticeGuideRationale1(city, userL1) {
    var st = practiceGuideMonthStats(city);
    var exp = expectedKoppenMcqForCity(city);
    var t1 = teacherDeriveL1(city);
    var lines = [];
    lines.push(
      "【자료에서 읽은 값】 최한월 " +
        MONTH_LABELS[st.iMin] +
        " " +
        fmtGuideTemp(st.tMin) +
        "℃, 최난월(가장 따뜻한 달) " +
        MONTH_LABELS[st.iMax] +
        " " +
        fmtGuideTemp(st.tMax) +
        "℃, 연강수 약 " +
        st.pAnn +
        "mm, 최건월 " +
        MONTH_LABELS[st.ipMin] +
        " " +
        Math.round(st.pMin) +
        "mm."
    );
    if (exp && exp.q1 === "H") {
      lines.push("이 지점은 교육 자료에서 고산 기후(H)로 제시됩니다. 해발·지형 요건을 함께 기억해 두세요.");
    } else {
      lines.push(
        "판단 순서에 따르면: " +
          (t1 === "A"
            ? "최한월이 18℃ 이상이어서 열대(A) 성격입니다."
            : t1 === "E"
              ? "최난월 평균이 10℃ 미만이라 한대(E)에 해당합니다."
              : t1 === "B"
                ? "연강수가 500mm 미만이라 건조(B) 기후로 분류합니다."
                : t1 === "C"
                  ? "연강수가 500mm 이상이고 최한월이 −3℃ 이상~18℃ 미만이면 온대(C)입니다."
                  : "최한월이 −3℃ 미만이면 냉대(D)입니다.")
      );
    }
    if (exp && userL1 === exp.q1) {
      lines.push("✓ 선택하신 1차 기호는 자료 표기와 같습니다.");
    } else if (exp) {
      lines.push("자료의 1차 기호는 「" + exp.q1 + "」입니다. 위 수치와 기준을 다시 대조해 보세요.");
    }
    return lines;
  }

  function buildPracticeGuideRationale2(city) {
    var st = practiceGuideMonthStats(city);
    var exp = expectedKoppenMcqForCity(city);
    var lines = [];
    if (!exp) return lines;
    if (exp.q1 === "H") {
      lines.push("고산(H)은 2차 기호 없이 바로 기호 H로 둡니다.");
      return lines;
    }
    if (exp.q1 === "B") {
      lines.push(
        "B(건조) 2차: 연강수 " +
          st.pAnn +
          "mm — " +
          (st.pAnn < 250
            ? "250mm 미만이면 사막형 W"
            : "250mm 이상 500mm 미만이면 스텝형 S") +
          "."
      );
    } else if (exp.q1 === "E") {
      lines.push(
        "E(한대) 2차: 최난월(가장 따뜻한 달) " +
          fmtGuideTemp(st.tMax) +
          "℃ — " +
          (st.tMax >= 0 ? "0℃ 이상 10℃ 미만이면 툰드라 T" : "0℃ 미만이면 빙설 F") +
          "."
      );
    } else if (exp.q1 === "A" || exp.q1 === "C" || exp.q1 === "D") {
      var th = teacherFThresholdForL1(exp.q1);
      var derived = teacherSecondLetterACD(city, exp.q1);
      if (st.pMin >= th) {
        lines.push(
          exp.q1 +
            "권 습윤(f): 최건월 강수가 " +
            Math.round(st.pMin) +
            "mm로, 기준(" +
            th +
            "mm) 이상이면 f(연중 습윤)로 봅니다."
        );
      } else if (exp.q1 === "A") {
        lines.push(
          "열대에서 건기가 있으면: 몬순 임계 " +
            (100 - st.pAnn / 25).toFixed(1) +
            "mm와 비교해 m 또는 w를 고릅니다. (자료 표기 2차: " +
            exp.q2 +
            ")"
        );
      } else {
        lines.push(
          "최건월이 " +
            th +
            "mm 미만이면 여름·겨울 강수 차이로 s(여름건조)·w(겨울건조) 등을 판별합니다. (단계별 근사 결과: " +
            derived +
            ", 자료 표기: " +
            exp.q2 +
            ")"
        );
      }
    }
    if (exp.q2 === "pass") {
      lines.push("이 경우 2차는 패스입니다.");
    } else {
      lines.push("자료에 따른 2차 기호: 「" + exp.q2 + "」.");
    }
    return lines;
  }

  function buildPracticeGuideRationale3(city) {
    var st = practiceGuideMonthStats(city);
    var exp = expectedKoppenMcqForCity(city);
    var lines = [];
    if (!exp || exp.q3 === "pass") {
      lines.push("C의 f(습윤 온대)가 아니면 3차 a/b 구분은 없습니다.");
      return lines;
    }
    lines.push(
      "Cf의 3차: 최난월(가장 따뜻한 달) " +
        fmtGuideTemp(st.tMax) +
        "℃ — 22℃ 이상이면 a, 미만이면 b입니다."
    );
    lines.push("자료 표기 3차: 「" + exp.q3 + "」.");
    return lines;
  }

  function practiceGuideSyncMcqFromState() {
    practiceQuizMcq.q1 = practiceGuideState.L1;
    practiceQuizMcq.q2 = practiceGuideState.L2;
    practiceQuizMcq.q3 = practiceGuideState.L3;
  }

  function resetPracticeGuideBoard() {
    practiceGuideState.L1 = null;
    practiceGuideState.L2 = null;
    practiceGuideState.L3 = null;
    practiceGuideState.locked1 = false;
    practiceGuideState.locked2 = false;
    practiceGuideState.locked3 = false;

    practiceGuideSetL1ChipsDisabled(false);
    document.querySelectorAll("#practice-guide-l1-chips .practice-guide-chip").forEach(function (b) {
      b.classList.remove("is-selected");
    });

    var r1 = document.getElementById("practice-guide-1-rationale");
    var r2 = document.getElementById("practice-guide-2-rationale");
    var r3 = document.getElementById("practice-guide-3-rationale");
    if (r1) r1.hidden = true;
    if (r2) r2.hidden = true;
    if (r3) r3.hidden = true;

    var gate2 = document.getElementById("practice-guide-2-gate");
    var gate3 = document.getElementById("practice-guide-3-gate");
    var body2 = document.getElementById("practice-guide-2-body");
    var body3 = document.getElementById("practice-guide-3-body");
    if (gate2) gate2.hidden = false;
    if (gate3) gate3.hidden = false;
    if (body2) body2.hidden = true;
    if (body3) body3.hidden = true;

    practiceGuideClearChipRow(document.getElementById("practice-guide-l2-chips"));
    practiceGuideClearChipRow(document.getElementById("practice-guide-l3-chips"));

    var c2 = document.getElementById("practice-guide-card-2");
    var c3 = document.getElementById("practice-guide-card-3");
    if (c2) {
      c2.classList.add("practice-guide-card--waiting");
      c2.classList.remove("is-unlocked");
    }
    if (c3) {
      c3.classList.add("practice-guide-card--waiting");
      c3.classList.remove("is-unlocked");
    }

    var b1 = document.getElementById("practice-guide-btn-1");
    var b2 = document.getElementById("practice-guide-btn-2");
    var b3 = document.getElementById("practice-guide-btn-3");
    if (b1) b1.disabled = true;
    if (b2) {
      b2.hidden = true;
      b2.disabled = true;
    }
    if (b3) {
      b3.hidden = true;
      b3.disabled = true;
    }

    var vb = document.getElementById("practice-guide-verify-btn");
    if (vb) vb.disabled = true;
    var rb = document.getElementById("practice-guide-result-box");
    if (rb) rb.hidden = true;
    var vr = document.getElementById("practice-guide-verify-result");
    if (vr) vr.textContent = "";

    var h1 = document.getElementById("practice-guide-1-hint");
    if (h1) h1.textContent = "기호를 고른 뒤 「1차 확정」을 누르세요.";
  }

  function refreshPracticeGuideForCity(city) {
    resetPracticeGuideBoard();
    var h1 = document.getElementById("practice-guide-1-hint");
    var grid = document.getElementById("practice-guide-grid");
    if (!city) {
      if (h1) h1.textContent = "도시 데이터가 없습니다.";
      if (grid) grid.setAttribute("aria-busy", "true");
      return;
    }
    if (grid) grid.removeAttribute("aria-busy");
    if (h1) h1.textContent = "「" + city.nameKo + "」 월별 자료를 보고 1차 기호를 고른 뒤 확정하세요.";
  }

  function practiceGuideUnlockCard2(city) {
    var gate = document.getElementById("practice-guide-2-gate");
    var body = document.getElementById("practice-guide-2-body");
    var lead = document.getElementById("practice-guide-2-lead");
    var chips = document.getElementById("practice-guide-l2-chips");
    var btn = document.getElementById("practice-guide-btn-2");
    var card = document.getElementById("practice-guide-card-2");
    if (gate) gate.hidden = true;
    if (body) body.hidden = false;
    if (card) {
      card.classList.remove("practice-guide-card--waiting");
      card.classList.add("is-unlocked");
    }
    practiceGuideClearChipRow(chips);
    practiceGuideState.L2 = null;

    var L1 = practiceGuideState.L1;
    if (L1 === "H") {
      if (lead) lead.textContent = "고산(H)은 2차 기호가 없습니다. 아래 버튼으로 이 단계를 마칩니다.";
      if (btn) {
        btn.hidden = false;
        btn.disabled = false;
      }
      return;
    }

    if (lead) {
      if (L1 === "B") {
        lead.textContent =
          "B(건조): 연강수로 구분합니다. S = 연강수 250~500mm(스텝), W = 250mm 미만(사막).";
      } else if (L1 === "E") {
        lead.textContent =
          "E(한대): 최난월(가장 따뜻한 달) 평균기온으로 T(0~10℃)·F(0℃ 미만)를 고릅니다.";
      } else {
        lead.textContent =
          "A·C·D: f = 최건월 강수가 기준 이상(습윤). A는 60mm, C는 30mm, D는 20mm 이상이면 f. 그 밖의 경우 m·s·w 중 해당하는 것을 고릅니다.";
      }
    }

    if (L1 === "B") {
      practiceGuideAppendChip(chips, "S (스텝)", "S", "data-pg-l2", null);
      practiceGuideAppendChip(chips, "W (사막)", "W", "data-pg-l2", null);
    } else if (L1 === "E") {
      practiceGuideAppendChip(chips, "T (툰드라)", "T", "data-pg-l2", null);
      practiceGuideAppendChip(chips, "F (빙설)", "F", "data-pg-l2", null);
    } else if (L1 === "A" || L1 === "C" || L1 === "D") {
      ["f", "m", "s", "w"].forEach(function (sym) {
        practiceGuideAppendChip(chips, sym, sym, "data-pg-l2", null);
      });
    }

    if (btn) {
      btn.hidden = false;
      btn.disabled = L1 !== "H";
    }
  }

  function practiceGuideUnlockCard3() {
    var gate = document.getElementById("practice-guide-3-gate");
    var body = document.getElementById("practice-guide-3-body");
    var lead = document.getElementById("practice-guide-3-lead");
    var chips = document.getElementById("practice-guide-l3-chips");
    var btn = document.getElementById("practice-guide-btn-3");
    var card = document.getElementById("practice-guide-card-3");
    if (gate) gate.hidden = true;
    if (body) body.hidden = false;
    if (card) {
      card.classList.remove("practice-guide-card--waiting");
      card.classList.add("is-unlocked");
    }
    practiceGuideClearChipRow(chips);
    practiceGuideState.L3 = null;

    var isCf = practiceGuideState.L1 === "C" && practiceGuideState.L2 === "f";
    if (isCf) {
      if (lead) lead.textContent = "습윤 온대 Cf: 최난월(가장 따뜻한 달) 22℃ 이상이면 a, 미만이면 b.";
      practiceGuideAppendChip(chips, "a", "a", "data-pg-l3", null);
      practiceGuideAppendChip(chips, "b", "b", "data-pg-l3", null);
      if (btn) {
        btn.textContent = "3차 확정";
        btn.hidden = false;
        btn.disabled = true;
      }
    } else {
      if (lead)
        lead.textContent =
          "C의 f(습윤 온대)가 아니면 3차 구분은 없습니다. 아래 버튼으로 이 단계를 건너뜁니다.";
      if (btn) {
        btn.textContent = "3차 없음 · 확정";
        btn.hidden = false;
        btn.disabled = false;
      }
    }
  }

  function practiceGuideUpdateVerifyButton() {
    var btn = document.getElementById("practice-guide-verify-btn");
    if (!btn) return;
    btn.disabled = !(practiceGuideState.locked1 && practiceGuideState.locked2 && practiceGuideState.locked3);
  }

  function practiceGuideRunVerify() {
    var city = getPracticeGuideCity();
    var out = document.getElementById("practice-guide-verify-result");
    var box = document.getElementById("practice-guide-result-box");
    if (!city || !out || !box) return;
    var exp = expectedKoppenMcqForCity(city);
    var code = answerCodeForCity(city);
    if (!exp) {
      out.textContent = "이 지점은 자동 채점 형식에 없습니다.";
      box.hidden = false;
      return;
    }
    var u1 = practiceGuideState.L1;
    var u2 = practiceGuideState.L2;
    var u3 = practiceGuideState.L3;
    var ok = u1 === exp.q1 && u2 === exp.q2 && u3 === exp.q3;
    var parts = [];
    parts.push(
      ok
        ? "축하합니다. 선택하신 1·2·3차 조합이 자료 표기와 일치합니다."
        : "선택과 자료 표기가 다릅니다. 각 카드의 근거 설명을 다시 읽어 보세요."
    );
    parts.push(
      "자료의 쾨펜 기호: " +
        code +
        " (1차 " +
        exp.q1 +
        ", 2차 " +
        exp.q2 +
        ", 3차 " +
        exp.q3 +
        ")"
    );
    parts.push(
      "나의 선택: 1차 " +
        u1 +
        ", 2차 " +
        u2 +
        ", 3차 " +
        u3
    );
    out.textContent = parts.join("\n\n");
    box.hidden = false;
  }

  function initPracticeGuideWizard() {
    if (document.body.dataset.practiceGuideWired) return;
    document.body.dataset.practiceGuideWired = "1";

    var l1root = document.getElementById("practice-guide-l1-chips");
    if (l1root) {
      l1root.addEventListener("click", function (e) {
        if (practiceGuideState.locked1) return;
        var chip = e.target.closest(".practice-guide-chip[data-pg-l1]");
        if (!chip || !l1root.contains(chip)) return;
        var v = chip.getAttribute("data-pg-l1");
        practiceGuideState.L1 = v;
        practiceGuideSelectChip(l1root, "data-pg-l1", v);
        var b1 = document.getElementById("practice-guide-btn-1");
        if (b1) b1.disabled = false;
      });
    }

    document.getElementById("practice-guide-btn-1") &&
      document.getElementById("practice-guide-btn-1").addEventListener("click", function () {
        if (practiceGuideState.locked1 || !practiceGuideState.L1) return;
        var city = getPracticeGuideCity();
        if (!city) return;
        practiceGuideState.locked1 = true;
        practiceGuideSetL1ChipsDisabled(true);
        var b1 = document.getElementById("practice-guide-btn-1");
        if (b1) b1.disabled = true;
        practiceGuideFillRationale(
          document.getElementById("practice-guide-1-rationale"),
          buildPracticeGuideRationale1(city, practiceGuideState.L1)
        );
        practiceGuideUnlockCard2(city);
      });

    var l2root = document.getElementById("practice-guide-l2-chips");
    if (l2root) {
      l2root.addEventListener("click", function (e) {
        if (practiceGuideState.locked2) return;
        var chip = e.target.closest(".practice-guide-chip[data-pg-l2]");
        if (!chip || !l2root.contains(chip)) return;
        var v = chip.getAttribute("data-pg-l2");
        practiceGuideState.L2 = v;
        practiceGuideSelectChip(l2root, "data-pg-l2", v);
        var b2 = document.getElementById("practice-guide-btn-2");
        if (b2 && practiceGuideState.L1 !== "H") b2.disabled = false;
      });
    }

    document.getElementById("practice-guide-btn-2") &&
      document.getElementById("practice-guide-btn-2").addEventListener("click", function () {
        if (practiceGuideState.locked2) return;
        var L1 = practiceGuideState.L1;
        if (L1 === "H") {
          practiceGuideState.L2 = "pass";
        } else if (!practiceGuideState.L2) {
          return;
        }
        var city = getPracticeGuideCity();
        if (!city) return;
        practiceGuideState.locked2 = true;
        var b2 = document.getElementById("practice-guide-btn-2");
        if (b2) b2.disabled = true;
        l2root &&
          l2root.querySelectorAll(".practice-guide-chip").forEach(function (b) {
            b.disabled = true;
          });
        practiceGuideFillRationale(
          document.getElementById("practice-guide-2-rationale"),
          buildPracticeGuideRationale2(city)
        );
        practiceGuideUnlockCard3();
      });

    var l3root = document.getElementById("practice-guide-l3-chips");
    if (l3root) {
      l3root.addEventListener("click", function (e) {
        if (practiceGuideState.locked3) return;
        var chip = e.target.closest(".practice-guide-chip[data-pg-l3]");
        if (!chip || !l3root.contains(chip)) return;
        var v = chip.getAttribute("data-pg-l3");
        practiceGuideState.L3 = v;
        practiceGuideSelectChip(l3root, "data-pg-l3", v);
        var b3 = document.getElementById("practice-guide-btn-3");
        if (b3) b3.disabled = false;
      });
    }

    document.getElementById("practice-guide-btn-3") &&
      document.getElementById("practice-guide-btn-3").addEventListener("click", function () {
        if (practiceGuideState.locked3) return;
        var isCf = practiceGuideState.L1 === "C" && practiceGuideState.L2 === "f";
        if (isCf && !practiceGuideState.L3) return;
        if (!isCf) practiceGuideState.L3 = "pass";
        var city = getPracticeGuideCity();
        if (!city) return;
        practiceGuideState.locked3 = true;
        var b3 = document.getElementById("practice-guide-btn-3");
        if (b3) b3.disabled = true;
        l3root &&
          l3root.querySelectorAll(".practice-guide-chip").forEach(function (b) {
            b.disabled = true;
          });
        practiceGuideFillRationale(
          document.getElementById("practice-guide-3-rationale"),
          buildPracticeGuideRationale3(city)
        );
        practiceGuideSyncMcqFromState();
        practiceGuideUpdateVerifyButton();
      });

    document.getElementById("practice-guide-verify-btn") &&
      document.getElementById("practice-guide-verify-btn").addEventListener("click", practiceGuideRunVerify);

    document.getElementById("practice-guide-reset-btn") &&
      document.getElementById("practice-guide-reset-btn").addEventListener("click", function () {
        var city = getPracticeGuideCity();
        refreshPracticeGuideForCity(city);
      });
  }

  function syncPracticeMcqGates() {
    var seg2 = document.getElementById("practice-seg-q2");
    if (!seg2) return;
    if (!PRACTICE_QUIZ_ITEMS.length) {
      if (seg2) {
        seg2.querySelectorAll(".seg-btn").forEach(function (b) {
          b.disabled = true;
        });
      }
      syncPracticeThirdQuestionUi();
      return;
    }
    var city = getCityById(PRACTICE_QUIZ_ITEMS[practiceQuizState.index].id);
    if (!city) {
      syncPracticeThirdQuestionUi();
      return;
    }
    var isH = answerCodeForCity(city) === "H";
    if (seg2) {
      seg2.querySelectorAll(".seg-btn").forEach(function (b) {
        var v = b.getAttribute("data-practice-q2");
        if (v === "pass") {
          b.disabled = !isH;
        } else {
          b.disabled = isH;
        }
      });
      if (isH) {
        if (practiceQuizMcq.q2 != null && practiceQuizMcq.q2 !== "pass") {
          practiceQuizMcq.q2 = null;
          setSegGroup(seg2, "data-practice-q2", null);
        }
      } else if (practiceQuizMcq.q2 === "pass") {
        practiceQuizMcq.q2 = null;
        setSegGroup(seg2, "data-practice-q2", null);
      }
    }
    syncPracticeThirdQuestionUi();
  }

  function syncStep3McqGates() {
    var seg2 = document.getElementById("s3-seg-q2");
    var cur = getCurrentCity();
    if (!cur) {
      if (seg2) {
        seg2.querySelectorAll(".seg-btn").forEach(function (b) {
          b.disabled = true;
        });
      }
      syncStep3ThirdQuestionUi();
      return;
    }
    var isH = answerCodeForCity(cur) === "H";
    if (seg2) {
      seg2.querySelectorAll(".seg-btn").forEach(function (b) {
        var v = b.getAttribute("data-s3-q2");
        if (v === "pass") b.disabled = !isH;
        else b.disabled = isH;
      });
      if (isH) {
        if (step3QuizMcq.q2 != null && step3QuizMcq.q2 !== "pass") {
          step3QuizMcq.q2 = null;
          setSegGroup(seg2, "data-s3-q2", null);
        }
      } else if (step3QuizMcq.q2 === "pass") {
        step3QuizMcq.q2 = null;
        setSegGroup(seg2, "data-s3-q2", null);
      }
    }
    syncStep3ThirdQuestionUi();
  }

  function syncPracticeThirdQuestionUi() {
    var row = document.getElementById("practice-q3-row");
    var seg = document.getElementById("practice-seg-q3");
    if (!seg) {
      return;
    }
    if (!PRACTICE_QUIZ_ITEMS.length) {
      updatePracticeAnswerCheck();
      return;
    }
    var city = getCityById(PRACTICE_QUIZ_ITEMS[practiceQuizState.index].id);
    if (!city) {
      updatePracticeAnswerCheck();
      return;
    }
    var gate = cityNeedsMcqThirdStep(answerCodeForCity(city));
    if (row) row.classList.toggle("is-q3-gated-off", !gate);
    seg.querySelectorAll(".seg-btn").forEach(function (b) {
      var v = b.getAttribute("data-practice-q3");
      b.disabled = !gate && (v === "a" || v === "b");
    });
    if (!gate) {
      if (practiceQuizMcq.q3 === "a" || practiceQuizMcq.q3 === "b") {
        practiceQuizMcq.q3 = null;
        setSegGroup(seg, "data-practice-q3", null);
      }
    } else {
      var exp = expectedKoppenMcqForCity(city);
      if (exp && exp.q3 !== "pass" && practiceQuizMcq.q3 === "pass") {
        practiceQuizMcq.q3 = null;
        setSegGroup(seg, "data-practice-q3", null);
      }
    }
    updatePracticeAnswerCheck();
  }

  function syncStep3ThirdQuestionUi() {
    var card = document.getElementById("s3-q3-card");
    var seg = document.getElementById("s3-seg-q3");
    if (!seg) {
      updateStep3AnswerCheck();
      return;
    }
    var cur = getCurrentCity();
    if (!cur) {
      updateStep3AnswerCheck();
      return;
    }
    var gate = cityNeedsMcqThirdStep(answerCodeForCity(cur));
    if (card) card.classList.toggle("is-q3-gated-off", !gate);
    seg.querySelectorAll(".seg-btn").forEach(function (b) {
      var v = b.getAttribute("data-s3-q3");
      b.disabled = !gate && (v === "a" || v === "b");
    });
    if (!gate) {
      if (step3QuizMcq.q3 === "a" || step3QuizMcq.q3 === "b") {
        step3QuizMcq.q3 = null;
        setSegGroup(seg, "data-s3-q3", null);
      }
    } else {
      var exp = expectedKoppenMcqForCity(cur);
      if (exp && exp.q3 !== "pass" && step3QuizMcq.q3 === "pass") {
        step3QuizMcq.q3 = null;
        setSegGroup(seg, "data-s3-q3", null);
      }
    }
    updateStep3AnswerCheck();
  }

  function setStep3AnnualChoice(key) {
    var root = document.getElementById("s3-annual-accordion");
    var hid = document.getElementById("s3-p-annual");
    var textEl = document.getElementById("s3-annual-trigger-text");
    if (hid) hid.value = "";
    if (!key) {
      if (textEl) textEl.textContent = "구간선택하기";
      if (root) {
        root.querySelectorAll(".practice-annual-opt").forEach(function (b) {
          b.classList.remove("is-selected");
          b.setAttribute("aria-checked", "false");
        });
      }
      return;
    }
    var btn = root ? root.querySelector('[data-s3-annual="' + key + '"]') : null;
    if (!btn) return;
    var mm = btn.getAttribute("data-s3-mm");
    if (hid && mm) hid.value = mm;
    if (textEl) textEl.textContent = ANNUAL_RANGE_LABELS[key] || "선택됨";
    if (root) {
      root.querySelectorAll(".practice-annual-opt").forEach(function (b) {
        var on = b.getAttribute("data-s3-annual") === key;
        b.classList.toggle("is-selected", on);
        b.setAttribute("aria-checked", on ? "true" : "false");
      });
    }
  }

  function closeStep3AnnualPanel() {
    var panel = document.getElementById("s3-annual-panel");
    var trg = document.getElementById("s3-annual-trigger");
    if (panel) panel.hidden = true;
    if (trg) trg.setAttribute("aria-expanded", "false");
  }

  function clearStep3AnnualUi() {
    setStep3AnnualChoice(null);
    closeStep3AnnualPanel();
  }

  function clearStep3QuizInputs() {
    ["s3-t-coldest", "s3-t-warmest", "s3-p-driest"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = "";
    });
    clearStep3AnnualUi();
  }

  function resetStep3QuizPanel() {
    step3QuizMcq.q1 = null;
    step3QuizMcq.q2 = null;
    step3QuizMcq.q3 = null;
    step3InputFocus.temp = false;
    step3InputFocus.precip = false;
    setSegGroup(document.getElementById("s3-seg-q1"), "data-s3-q1", null);
    setSegGroup(document.getElementById("s3-seg-q2"), "data-s3-q2", null);
    setSegGroup(document.getElementById("s3-seg-q3"), "data-s3-q3", null);
    clearStep3QuizInputs();
    hideStep3ReportCard();
    refreshStep3AccuracyHint();
    syncStep3McqGates();
    refreshStep3ClimateChart();
  }

  function refreshStep3AccuracyHint() {
    var tcIn = document.getElementById("s3-t-coldest");
    var twIn = document.getElementById("s3-t-warmest");
    var pAn = document.getElementById("s3-p-annual");
    var acc = document.getElementById("s3-accuracy-hint");
    var city = getCurrentCity();
    var tc = tcIn && tcIn.value !== "" ? parseFloat(tcIn.value) : NaN;
    var tw = twIn && twIn.value !== "" ? parseFloat(twIn.value) : NaN;
    var pa = pAn && pAn.value !== "" ? parseFloat(pAn.value) : NaN;
    if (!acc) return;
    if (!city) {
      acc.textContent = "";
      var sh0 = document.getElementById("s3-southern-hint");
      if (sh0) {
        sh0.hidden = true;
        sh0.textContent = "";
      }
      return;
    }
    var parts = checkTempAccuracy(city, tc, tw);
    var annData = sumPrecip(city.precip);
    if (!isNaN(pa)) {
      parts +=
        " 연강수: 자료 약 " +
        annData +
        " mm" +
        (Math.abs(pa - annData) <= Math.max(20, annData * 0.08)
          ? " (입력이 자료와 가깝습니다)."
          : " (자료와 차이가 크면 구간 또는 12개월 합을 다시 확인해 보세요).");
    }
    acc.textContent = parts;
    var sh = document.getElementById("s3-southern-hint");
    if (sh) {
      if (isSouthernHemisphereCity(city)) {
        sh.hidden = false;
        sh.textContent = "기온 곡선이 아래로 볼록(U자형)하네요. 남반구임을 유의하세요!";
      } else {
        sh.hidden = true;
        sh.textContent = "";
      }
    }
    updateStep3HighlandHint(city);
  }

  function refreshStep3RegionInsight() {
    var placeholder = document.getElementById("s3-explore-placeholder");
    var detail = document.getElementById("s3-explore-detail");
    var veg = document.getElementById("s3-region-vegetation");
    var life = document.getElementById("s3-region-life");
    var cityLine = document.getElementById("s3-explore-cityline");
    if (!placeholder || !detail || !veg || !life) return;
    function showPlaceholderOnly() {
      placeholder.hidden = false;
      detail.hidden = true;
      veg.textContent = "";
      life.textContent = "";
      if (cityLine) cityLine.textContent = "";
    }
    var p = step3QuizMcq;
    if (!p.q1 || !p.q2 || !p.q3) {
      showPlaceholderOnly();
      return;
    }
    var curCity = getCurrentCity();
    if (!curCity) {
      showPlaceholderOnly();
      return;
    }
    var exp = expectedKoppenMcqForCity(curCity);
    if (!exp) {
      showPlaceholderOnly();
      return;
    }
    var allOk = p.q1 === exp.q1 && p.q2 === exp.q2 && p.q3 === exp.q3;
    if (!allOk) {
      showPlaceholderOnly();
      return;
    }
    var city = curCity;
    placeholder.hidden = true;
    detail.hidden = false;
    if (cityLine) cityLine.textContent = city.nameKo + " — 식생과 주민생활";
    veg.textContent = city.regionVegetation || "이 도시에 대한 식생 설명을 준비 중입니다.";
    life.textContent = city.regionLife || "이 도시에 대한 주민생활 설명을 준비 중입니다.";
  }

  function updateStep3AnswerCheck() {
    var box = document.getElementById("s3-answer-result");
    if (!box) return;
    var p = step3QuizMcq;
    if (!p.q1 || !p.q2 || !p.q3) {
      box.textContent = "Q1~Q3을 모두 고르면 여기에 결과가 표시됩니다.";
      hideStep3ReportCard();
      refreshStep3RegionInsight();
      return;
    }
    var cur = getCurrentCity();
    if (!cur) {
      box.textContent = "도시 데이터가 없습니다.";
      hideStep3ReportCard();
      refreshStep3RegionInsight();
      return;
    }
    var exp = expectedKoppenMcqForCity(cur);
    if (!exp) {
      box.textContent = "이 도시 기호는 현재 Q1~Q3 형식으로 자동 채점되지 않습니다.";
      hideStep3ReportCard();
      refreshStep3RegionInsight();
      return;
    }
    var allOk = p.q1 === exp.q1 && p.q2 === exp.q2 && p.q3 === exp.q3;
    if (allOk) {
      box.textContent = "정답입니다.";
      showStep3ReportCard();
    } else {
      hideStep3ReportCard();
      var hints = buildMcqMismatchReasons(cur, p, exp);
      box.textContent = "오답입니다. " + hints.join(" ");
    }
    refreshStep3RegionInsight();
  }

  function initStep3AnnualAccordion() {
    var root = document.getElementById("s3-annual-accordion");
    if (!root || root.dataset.wired) return;
    root.dataset.wired = "1";

    var trg = document.getElementById("s3-annual-trigger");
    if (trg) {
      trg.addEventListener("click", function () {
        var panel = document.getElementById("s3-annual-panel");
        if (!panel) return;
        var willOpen = panel.hidden;
        panel.hidden = !willOpen;
        trg.setAttribute("aria-expanded", willOpen ? "true" : "false");
      });
    }

    root.addEventListener("click", function (e) {
      var opt = e.target.closest(".practice-annual-opt");
      if (!opt || !root.contains(opt)) return;
      var key = opt.getAttribute("data-s3-annual");
      if (!key) return;
      setStep3AnnualChoice(key);
      closeStep3AnnualPanel();
      refreshStep3AccuracyHint();
    });
  }

  function destroyGameChart() {
    if (gameChartInstance) {
      gameChartInstance.destroy();
      gameChartInstance = null;
    }
  }

  function actualTempRange(city) {
    return {
      coldest: Math.min.apply(null, city.temp),
      warmest: Math.max.apply(null, city.temp),
    };
  }

  function sumPrecip(arr) {
    return annualPrecipTotal(arr);
  }

  function driestMonthInfo(city) {
    var p = city.precip;
    var min = Math.min.apply(null, p);
    var idx = p.indexOf(min);
    return { mm: min, month: MONTH_LABELS[idx] };
  }

  function checkTempAccuracy(city, userTc, userTw) {
    var a = actualTempRange(city);
    var okC = Math.abs(userTc - a.coldest) <= WIZ_TEMP_TOL;
    var okW = Math.abs(userTw - a.warmest) <= WIZ_TEMP_TOL;
    var parts = [];
    if (!isNaN(userTc) && !isNaN(userTw)) {
      if (okC && okW) {
        parts.push("입력값이 자료와 잘 맞습니다.");
      } else {
        parts.push("입력이 자료와 " + WIZ_TEMP_TOL + "°C 넘게 차이 나는 항목이 있으면 그래프를 다시 읽어 보세요.");
      }
    }
    return parts.join(" ");
  }

  function buildMcqMismatchReasons(city, userMcq, exp) {
    var lines = [];
    var tR = actualTempRange(city);
    var pAnn = sumPrecip(city.precip);
    var pMin = Math.min.apply(null, city.precip);
    var canonical = displayCodeForCity(city);
    var thrAm = 100 - pAnn / 25;
    if (userMcq.q1 !== exp.q1) {
      if (exp.q1 === "C" && userMcq.q1 === "D") {
        lines.push(
          "최한월 기온이 −3°C를 넘습니다(" +
            tR.coldest +
            "°C). 따라서 냉대(D)가 아니라 온대(C) 기후에 속합니다."
        );
      } else if (exp.q1 === "D" && userMcq.q1 === "C") {
        lines.push(
          "최한월이 −3°C 이하(" + tR.coldest + "°C)이면 육상 쾨펜 구분상 냉대(D)입니다. 온대(C)로 보기 어렵습니다."
        );
      } else if (exp.q1 === "A") {
        lines.push(
          "가장 추운 달의 평균기온이 " + tR.coldest + "°C로 18°C 이상이어야 열대(A)로 분류됩니다."
        );
      } else if (exp.q1 === "B") {
        lines.push(
          "연강수 " + pAnn + " mm와 기온 관계(드 마통형 지수)상 건조(B) 기후에 해당합니다."
        );
      } else if (exp.q1 === "E") {
        lines.push(
          "가장 따뜻한 달도 " + tR.warmest + "°C로 10°C 미만이라 한대(E)로 판정됩니다."
        );
      } else if (exp.q1 === "H") {
        lines.push(
          "저위도라도 해발이 높으면 연평균 기온이 낮아져 고산 기후(H)로 구분합니다. 위도만 보고 열대(A)로 오인하지 않도록 그래프를 다시 보세요."
        );
      } else {
        lines.push("1차 정답은 「" + exp.q1 + "」입니다. 최한·최난월과 연강수를 다시 확인해 보세요.");
      }
    }
    if (userMcq.q2 !== exp.q2) {
      if (exp.q1 === "A" && userMcq.q1 === "A") {
        if (exp.q2 === "f") {
          lines.push("최건월 강수가 60 mm 이상이면 우림형(Af)입니다.");
        } else if (exp.q2 === "m") {
          lines.push(
            "최건월 " +
              pMin +
              " mm는 60 mm 미만이지만, 100 − 연강수÷25 ≈ " +
              thrAm.toFixed(1) +
              " mm보다 많아 몬순형(Am)으로 구분됩니다."
          );
        } else if (exp.q2 === "w") {
          lines.push(
            "최건월 " +
              pMin +
              " mm가 60 mm 미만이고, 100 − 연강수÷25 ≈ " +
              thrAm.toFixed(1) +
              " mm 이하의 조건을 만족해 사바나형(Aw)입니다."
          );
        }
      } else if (userMcq.q1 === exp.q1) {
        lines.push(
          "2차 정답은 「" +
            exp.q2 +
            "」입니다. 자료로 산출한 쾨펜 코드는 " +
            canonical +
            "이며, 고·저일사반의 최건·최다우 관계(약 3배·1/3 기준)를 다시 짚어 보세요."
        );
      }
    }
    if (userMcq.q3 !== exp.q3 && exp.q3 !== "pass") {
      lines.push(
        "Cf 계열에서는 최난월 " +
          tR.warmest +
          "°C가 22°C " +
          (exp.q3 === "a" ? "이상이면 (a), " : "미만이면 (b)로 ") +
          "갈립니다."
      );
    }
    if (!lines.length) {
      lines.push("그래프와 강수 막대를 다시 읽고 1·2·3차 조합을 맞춰 보세요.");
    }
    return lines;
  }

  function studentMainLetter(tc, tw, pAnn) {
    if (isNaN(tc) || isNaN(tw) || isNaN(pAnn)) return null;
    if (tc >= 18) return "A";
    if (tw < 10) return "E";
    if (tc <= -3 && tw >= 10) return "D";
    var tEst = (tc + tw) / 2;
    var denom = tEst + 10;
    if (denom <= 0) return "E";
    var im = pAnn / denom;
    if (im < 25) return "B";
    return "C";
  }

  function wizMainLetterDescription(L) {
    var map = {
      A: "열대 — 최한월 18°C 이상으로 연중 고온대입니다.",
      B: "건조 — 연강수가 기온 대비 부족한 편(드 마통형 지수로 자동 판정).",
      C: "온대 — 한대·냉대·건조에 해당하지 않는 육상 온화 기후대입니다.",
      D: "냉대 — 한대가 아니면서 최한월이 -3°C 이하인 대륙성 기후입니다.",
      E: "한대 — 최난월이 10°C 미만입니다.",
    };
    return map[L] || "";
  }

  var wizToastTimer = null;
  function showWizToast(text, kind) {
    var el = document.getElementById("wiz-toast");
    if (!el) return;
    el.textContent = text;
    el.className = "wiz-toast wiz-toast--" + (kind === "ok" ? "ok" : "bad");
    el.hidden = false;
    el.setAttribute("aria-hidden", "false");
    requestAnimationFrame(function () {
      el.classList.add("wiz-toast--visible");
    });
    clearTimeout(wizToastTimer);
    wizToastTimer = setTimeout(function () {
      el.classList.remove("wiz-toast--visible");
      el.setAttribute("aria-hidden", "true");
      setTimeout(function () {
        el.hidden = true;
      }, 320);
    }, 2600);
  }

  function tryBuildStudentCode() {
    var L1 = wizState.mainLetter;
    var L2 = wizState.secondLetter;
    var L3 = wizState.thirdLetter;
    var tcIn = document.getElementById("wiz-t-coldest");
    var twIn = document.getElementById("wiz-t-warmest");
    var tc = tcIn && tcIn.value !== "" ? parseFloat(tcIn.value) : NaN;
    var tw = twIn && twIn.value !== "" ? parseFloat(twIn.value) : NaN;
    if (!L1) return null;
    if (L1 === "A" && L2) return L1 + L2;
    if (L1 === "B" && wizState.bWs && wizState.bHk) return "B" + wizState.bWs + wizState.bHk;
    if (L1 === "C" && L2 === "f" && L3) return "Cf" + L3;
    if (L1 === "C" && L2 === "s") return !isNaN(tw) && tw >= 22 ? "Csa" : "Csb";
    if (L1 === "C" && L2 === "w") return !isNaN(tw) && tw >= 22 ? "Cwa" : "Cwb";
    if (L1 === "D" && L2 === "w") return !isNaN(tw) && tw >= 22 ? "Dwa" : "Dwb";
    if (L1 === "D" && L2 === "f" && !isNaN(tc)) return tc <= -38 ? "Dfd" : "Dfb";
    if (L1 === "D" && L2 === "s") return "Dfb";
    if (L1 === "E" && wizState.eTf) return "E" + wizState.eTf;
    return null;
  }

  function syncFinalSelectFromWizard() {
    var sel = document.getElementById("wiz-final-select");
    if (!sel) return;
    var built = tryBuildStudentCode();
    if (built && QUIZ_SYMBOLS.indexOf(built) >= 0) {
      sel.value = built;
      return;
    }
    if (built) {
      for (var i = 0; i < QUIZ_SYMBOLS.length; i++) {
        if (QUIZ_SYMBOLS[i].indexOf(built) === 0) {
          sel.value = QUIZ_SYMBOLS[i];
          return;
        }
      }
    }
  }

  function prepareStep2ForMainLetter() {
    var acd = document.getElementById("wiz-step2-acd");
    var bEl = document.getElementById("wiz-step2-b");
    var eEl = document.getElementById("wiz-step2-e");
    var intro = document.getElementById("wiz-step2-intro");
    var L = wizState.mainLetter;
    if (acd) acd.hidden = true;
    if (bEl) bEl.hidden = true;
    if (eEl) eEl.hidden = true;
    wizState.bWs = null;
    wizState.bHk = null;
    wizState.eTf = null;
    wizState.secondLetter = null;
    setSegGroup(document.getElementById("wiz-seg-second-letter"), "data-wiz-second", null);
    if (intro) intro.textContent = "선택한 기후대 「" + L + "」에 맞춰 2단계를 진행합니다.";
    if (L === "A" || L === "C" || L === "D") {
      acd.hidden = false;
      var pd = document.getElementById("wiz-p-driest");
      if (pd) pd.value = "";
    } else if (L === "B") {
      bEl.hidden = false;
      setSegGroup(document.getElementById("wiz-seg-b-ws"), "data-bws", null);
      setSegGroup(document.getElementById("wiz-seg-b-hk"), "data-bhk", null);
    } else if (L === "E") {
      eEl.hidden = false;
      setSegGroup(document.getElementById("wiz-seg-e-tf"), "data-etf", null);
    }
  }

  function wizNeedsCfStep() {
    return wizState.mainLetter === "C" && wizState.secondLetter === "f";
  }

  function updateWizSynthesis() {
    var box = document.getElementById("wiz-synthesis");
    if (!box) return;
    var tcIn = document.getElementById("wiz-t-coldest");
    var twIn = document.getElementById("wiz-t-warmest");
    var pAn = document.getElementById("wiz-p-annual");
    var tc = tcIn && tcIn.value !== "" ? parseFloat(tcIn.value) : NaN;
    var tw = twIn && twIn.value !== "" ? parseFloat(twIn.value) : NaN;
    var pa = pAn && pAn.value !== "" ? parseFloat(pAn.value) : NaN;
    var pdEl = document.getElementById("wiz-p-driest");
    var pd = pdEl && pdEl.value !== "" ? parseFloat(pdEl.value) : NaN;
    var L1 = wizState.mainLetter || "—";
    var L2 = wizState.secondLetter;
    var bCode = wizState.bWs && wizState.bHk ? "B" + wizState.bWs + wizState.bHk : null;
    var eCode = wizState.eTf ? "E" + wizState.eTf : null;
    var seg2 =
      L2 ||
      (bCode ? bCode : eCode ? eCode : "—");
    var L3line =
      wizState.thirdLetter === "a"
        ? "a (Cfa)"
        : wizState.thirdLetter === "b"
          ? "b (Cfb)"
          : wizState.mainLetter === "C" && wizState.secondLetter === "f"
            ? "— (3단계에서 선택)"
            : "해당 없음";
    var built = tryBuildStudentCode();
    var builtLine = built ? "<strong>" + built + "</strong>" : "아직 조합이 완성되지 않았습니다.";

    box.innerHTML =
      "<p class=\"wiz-synth-title\">분석 요약</p>" +
      "<ol class=\"wiz-synth-list\">" +
      "<li><strong>① 1차</strong> — 선택 기후대 <strong>" +
      L1 +
      "</strong> · 입력: 최한월 " +
      (isNaN(tc) ? "—" : tc + "°C") +
      ", 최난월 " +
      (isNaN(tw) ? "—" : tw + "°C") +
      ", 연강수 " +
      (isNaN(pa) ? "—" : pa + " mm") +
      "</li>" +
      "<li><strong>② 2차</strong> — 두 번째 문자·조합: <strong>" +
      seg2 +
      "</strong>" +
      (wizState.mainLetter === "A" || wizState.mainLetter === "C" || wizState.mainLetter === "D"
        ? " · 최건월 입력 " + (isNaN(pd) ? "—" : pd + " mm")
        : "") +
      "</li>" +
      "<li><strong>③ 3차(Cf)</strong> — " +
      L3line +
      "</li>" +
      "</ol>" +
      "<p class=\"wiz-synth-foot\">조합 결과(참고): " +
      builtLine +
      " · 「최종 결과 확인」으로 정답과 비교합니다.</p>";
  }

  function populateFinalSelect() {
    refreshWizFinalSelectOptions();
  }

  var wizState = {
    step: 1,
    mainLetter: null,
    secondLetter: null,
    bWs: null,
    bHk: null,
    eTf: null,
    thirdLetter: null,
    usedCfStep: false,
  };

  function updateComboPreview() {
    var el = document.getElementById("wiz-combo-preview");
    if (!el) return;
    var L = wizState.mainLetter;
    if (!L) {
      el.textContent = "내가 조합한 기호: —";
      return;
    }
    if (L === "B" && wizState.bWs && wizState.bHk) {
      el.textContent = "내가 조합한 기호: B " + wizState.bWs + " " + wizState.bHk;
      return;
    }
    if (L === "E" && wizState.eTf) {
      el.textContent = "내가 조합한 기호: E " + wizState.eTf;
      return;
    }
    var parts = [L];
    if (wizState.secondLetter) parts.push(wizState.secondLetter);
    if (wizState.thirdLetter) parts.push(wizState.thirdLetter);
    el.textContent = "내가 조합한 기호: " + parts.join(" ");
  }

  function refreshWizStep1NextEnabled() {
    var tcIn = document.getElementById("wiz-t-coldest");
    var twIn = document.getElementById("wiz-t-warmest");
    var pAn = document.getElementById("wiz-p-annual");
    var nx = document.getElementById("wiz-next-1");
    if (!nx) return;
    var tc = tcIn && tcIn.value !== "" ? parseFloat(tcIn.value) : NaN;
    var tw = twIn && twIn.value !== "" ? parseFloat(twIn.value) : NaN;
    var pa = pAn && pAn.value !== "" ? parseFloat(pAn.value) : NaN;
    var ok = !isNaN(tc) && !isNaN(tw) && !isNaN(pa) && !!wizState.mainLetter;
    nx.disabled = !ok;
  }

  function initStep2Practice() {
    if (document.body.dataset.practiceQuizWired) return;
    document.body.dataset.practiceQuizWired = "1";

    var prevBtn = document.getElementById("practice-quiz-prev");
    var nextBtn = document.getElementById("practice-quiz-next");
    if (prevBtn) prevBtn.addEventListener("click", function () { goPracticeQuiz(-1); });
    if (nextBtn) nextBtn.addEventListener("click", function () { goPracticeQuiz(1); });

    initPracticeGuideWizard();

    initPracticeAnnualAccordion();
  }

  function setSegGroup(container, dataAttr, selectedVal) {
    if (!container) return;
    container.querySelectorAll(".seg-btn").forEach(function (btn) {
      var v = btn.getAttribute(dataAttr);
      var on = selectedVal != null && v === selectedVal;
      btn.classList.toggle("is-selected", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function bindSegGroup(container, attrName, onPick) {
    if (!container) return;
    container.addEventListener("click", function (e) {
      var btn = e.target.closest(".seg-btn");
      if (!btn || !container.contains(btn)) return;
      var v = btn.getAttribute(attrName);
      if (!v) return;
      setSegGroup(container, attrName, v);
      onPick(v);
    });
  }

  function showWizardPanel(step) {
    wizState.step = step;
    for (var i = 1; i <= 4; i++) {
      var el = document.getElementById("wiz-panel-" + i);
      if (el) el.hidden = i !== step;
    }
    var prog = document.getElementById("wizard-progress");
    if (prog) prog.textContent = step + " / 4";
  }

  function refreshStep1AccuracyOnly() {
    var tcIn = document.getElementById("wiz-t-coldest");
    var twIn = document.getElementById("wiz-t-warmest");
    var pAn = document.getElementById("wiz-p-annual");
    var acc = document.getElementById("wiz-accuracy-1");
    var city = getCurrentCity();
    var tc = tcIn && tcIn.value !== "" ? parseFloat(tcIn.value) : NaN;
    var tw = twIn && twIn.value !== "" ? parseFloat(twIn.value) : NaN;
    var pa = pAn && pAn.value !== "" ? parseFloat(pAn.value) : NaN;
    if (!acc) return;
    if (!city) {
      acc.textContent = "";
      return;
    }
    var parts = checkTempAccuracy(city, tc, tw);
    var annData = sumPrecip(city.precip);
    if (!isNaN(pa)) {
      parts +=
        " 연강수: 자료 약 " +
        annData +
        " mm" +
        (Math.abs(pa - annData) <= Math.max(20, annData * 0.08)
          ? " (입력이 자료와 가깝습니다)."
          : " (자료와 차이가 크면 12개월을 다시 합산해 보세요).");
    }
    acc.textContent = parts;
  }

  function resetWizardFull() {
    var tcIn = document.getElementById("wiz-t-coldest");
    var twIn = document.getElementById("wiz-t-warmest");
    var pAn = document.getElementById("wiz-p-annual");
    var pd = document.getElementById("wiz-p-driest");
    if (tcIn) tcIn.value = "";
    if (twIn) twIn.value = "";
    if (pAn) pAn.value = "";
    if (pd) pd.value = "";
    wizState.mainLetter = null;
    wizState.secondLetter = null;
    wizState.bWs = null;
    wizState.bHk = null;
    wizState.eTf = null;
    wizState.thirdLetter = null;
    wizState.usedCfStep = false;
    setSegGroup(document.getElementById("wiz-seg-main-letter"), "data-wiz-main", null);
    setSegGroup(document.getElementById("wiz-seg-second-letter"), "data-wiz-second", null);
    setSegGroup(document.getElementById("wiz-seg-b-ws"), "data-bws", null);
    setSegGroup(document.getElementById("wiz-seg-b-hk"), "data-bhk", null);
    setSegGroup(document.getElementById("wiz-seg-e-tf"), "data-etf", null);
    setSegGroup(document.getElementById("wiz-seg-cf-ab"), "data-cfab", null);
    var nx1 = document.getElementById("wiz-next-1");
    if (nx1) nx1.disabled = true;
    var fb = document.getElementById("wiz-feedback-1");
    if (fb) {
      fb.textContent = "여기에는 자동 판정이 표시되지 않습니다. Step 2 「연습하기」에서 참고해 보세요.";
    }
    var fr = document.getElementById("wiz-final-result");
    if (fr) {
      fr.textContent = "";
      fr.classList.remove("verdict-ok", "verdict-bad");
    }
    var fs = document.getElementById("wiz-final-select");
    if (fs) fs.selectedIndex = 0;
    refreshStep1AccuracyOnly();
    updateComboPreview();
    refreshWizStep1NextEnabled();
    showWizardPanel(1);
  }

  function initCitySelect(selectId, onChange) {
    var sel = document.getElementById(selectId);
    if (!sel || sel.dataset.ready) return;
    if (!CITY_DATA.length) return;
    sel.dataset.ready = "1";
    sel.innerHTML = "";
    var sorted = CITY_DATA.slice().sort(function (a, b) {
      var ak = String(a && a.nameKo ? a.nameKo : "");
      var bk = String(b && b.nameKo ? b.nameKo : "");
      return ak.localeCompare(bk, "ko-KR");
    });
    sorted.forEach(function (c) {
      var opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.nameKo;
      sel.appendChild(opt);
    });
    sel.addEventListener("change", onChange);
  }

  function initStep3() {
    initCitySelect("city-select", function (e) {
      resetStep3QuizPanel();
      syncStep3MapMarkers(e.target.value);
      refreshStep1AccuracyOnly();
    });
    var sel = document.getElementById("city-select");
    if (!sel) return;
    resetStep3QuizPanel();

    if (document.body.dataset.step3QuizWired) return;
    document.body.dataset.step3QuizWired = "1";

    initStep3AnnualAccordion();
    buildStep3MapMarkers();
    syncStep3MapMarkers(sel.value);

    var panel3 = document.getElementById("panel-step3");
    if (panel3 && !panel3.dataset.step3UxWired) {
      panel3.dataset.step3UxWired = "1";
      panel3.addEventListener("focusin", function (e) {
        var t = e.target;
        if (!t || !t.id) return;
        if (t.id === "s3-t-coldest" || t.id === "s3-t-warmest") {
          step3InputFocus.temp = true;
          refreshStep3ClimateChart();
        }
        if (t.id === "s3-p-driest") {
          step3InputFocus.precip = true;
          refreshStep3ClimateChart();
        }
      });
      panel3.addEventListener("focusout", function () {
        scheduleStep3FocusSync();
      });
    }

    var repClose = document.getElementById("s3-report-close");
    if (repClose && !repClose.dataset.wired) {
      repClose.dataset.wired = "1";
      repClose.addEventListener("click", hideStep3ReportCard);
    }

    var tcIn = document.getElementById("s3-t-coldest");
    var twIn = document.getElementById("s3-t-warmest");
    var pAn = document.getElementById("s3-p-annual");
    var pdIn = document.getElementById("s3-p-driest");

    function onS3NumericInput() {
      refreshStep3AccuracyHint();
      refreshStep3ClimateChart();
    }
    if (tcIn) tcIn.addEventListener("input", onS3NumericInput);
    if (twIn) twIn.addEventListener("input", onS3NumericInput);
    if (pAn) pAn.addEventListener("input", onS3NumericInput);
    if (pdIn) pdIn.addEventListener("input", onS3NumericInput);

    bindSegGroup(document.getElementById("s3-seg-q1"), "data-s3-q1", function (v) {
      step3QuizMcq.q1 = v;
      syncStep3McqGates();
    });
    bindSegGroup(document.getElementById("s3-seg-q2"), "data-s3-q2", function (v) {
      step3QuizMcq.q2 = v;
      updateStep3AnswerCheck();
    });
    bindSegGroup(document.getElementById("s3-seg-q3"), "data-s3-q3", function (v) {
      step3QuizMcq.q3 = v;
      updateStep3AnswerCheck();
    });
  }

  /* ——— Step 4 스피드 퀴즈 (분석 위자드와 상태 분리) ——— */

  function updateGameHud() {
    var scoreEl = document.getElementById("game-score");
    var timeEl = document.getElementById("game-timer");
    var goalEl = document.getElementById("game-goal-score");
    if (scoreEl) scoreEl.textContent = String(step4Game.score);
    if (timeEl) timeEl.textContent = String(step4Game.timeLeft);
    if (goalEl) goalEl.textContent = String(step4Game.configuredGoalScore);
  }

  function updateStep4ControlState() {
    var startBtn = document.getElementById("btn-game-start");
    var prevBtn = document.getElementById("btn-game-prev");
    var nextBtn = document.getElementById("btn-game-next");
    var stopBtn = document.getElementById("btn-game-stop");
    var timeUpBtn = document.getElementById("btn-game-time-up");
    var timeDownBtn = document.getElementById("btn-game-time-down");
    var goalUpBtn = document.getElementById("btn-game-goal-up");
    var goalDownBtn = document.getElementById("btn-game-goal-down");
    var minSeconds = 30;
    var maxSeconds = 600;
    var minGoal = 10;
    var maxGoal = 300;

    if (startBtn) startBtn.disabled = step4Game.active;
    if (stopBtn) stopBtn.disabled = !step4Game.active;
    if (prevBtn) prevBtn.disabled = !step4Game.active || step4Game.inputLocked || step4Game.historyCursor <= 0;
    if (nextBtn) nextBtn.disabled = !step4Game.active || step4Game.inputLocked;

    if (timeUpBtn) timeUpBtn.disabled = step4Game.active || step4Game.configuredSeconds >= maxSeconds;
    if (timeDownBtn) timeDownBtn.disabled = step4Game.active || step4Game.configuredSeconds <= minSeconds;
    if (goalUpBtn) goalUpBtn.disabled = step4Game.active || step4Game.configuredGoalScore >= maxGoal;
    if (goalDownBtn) goalDownBtn.disabled = step4Game.active || step4Game.configuredGoalScore <= minGoal;
  }

  function adjustStep4ConfiguredTime(deltaSeconds) {
    if (step4Game.active) return;
    var minSeconds = 30;
    var maxSeconds = 600;
    var next = step4Game.configuredSeconds + deltaSeconds;
    if (next < minSeconds) next = minSeconds;
    if (next > maxSeconds) next = maxSeconds;
    step4Game.configuredSeconds = next;
    step4Game.timeLeft = next;
    updateGameHud();
    updateStep4ControlState();
  }

  function adjustStep4ConfiguredGoal(deltaScore) {
    if (step4Game.active) return;
    var minGoal = 10;
    var maxGoal = 300;
    var next = step4Game.configuredGoalScore + deltaScore;
    if (next < minGoal) next = minGoal;
    if (next > maxGoal) next = maxGoal;
    step4Game.configuredGoalScore = next;
    updateGameHud();
    updateStep4ControlState();
  }

  function setStep4ResultModalView(view) {
    if (step4ResultView) step4ResultView.hidden = view !== "result";
    if (step4WrongView) step4WrongView.hidden = view !== "wrong";
  }

  function sumArr(arr) {
    var s = 0;
    for (var i = 0; i < arr.length; i++) s += arr[i];
    return s;
  }

  function recordStep4WrongAnswer(city, selectedCode, correctCode) {
    if (!city) return;
    var coldest = Math.min.apply(null, city.temp);
    var warmest = Math.max.apply(null, city.temp);
    var annualPrecip = sumArr(city.precip);
    step4Game.wrongAnswers.push({
      cityKo: city.nameKo || city.name || "-",
      selected: selectedCode || "-",
      correct: correctCode || "-",
      coldest: coldest,
      warmest: warmest,
      annualPrecip: annualPrecip,
    });
  }

  function renderStep4WrongAnswerList() {
    if (!step4WrongList) return;
    if (!step4Game.wrongAnswers.length) {
      step4WrongList.innerHTML = '<p class="step4-wrong-item-meta">아직 오답이 없습니다. 계속 도전해보세요!</p>';
      return;
    }
    var html = [];
    for (var i = 0; i < step4Game.wrongAnswers.length; i++) {
      var w = step4Game.wrongAnswers[i];
      html.push(
        '<article class="step4-wrong-item">' +
          '<p class="step4-wrong-item-title">' + escapeHtml(String(i + 1)) + ". " + escapeHtml(w.cityKo) + "</p>" +
          '<p class="step4-wrong-item-meta">내 선택: <strong>' + escapeHtml(w.selected) + "</strong> / 정답: <strong>" + escapeHtml(w.correct) + "</strong></p>" +
          '<p class="step4-wrong-item-meta">요약: 최한월 ' + escapeHtml(w.coldest.toFixed(1)) + "°C · 최난월 " + escapeHtml(w.warmest.toFixed(1)) + "°C · 연강수량 " + escapeHtml(String(Math.round(w.annualPrecip))) + "mm</p>" +
        "</article>"
      );
    }
    step4WrongList.innerHTML = html.join("");
  }

  function closeStep4ResultModal() {
    if (!step4ResultModal) return;
    step4ResultModal.hidden = true;
    step4ResultModal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    setStep4ResultModalView("result");
  }

  function openStep4ResultModal(score, roundNo) {
    if (!step4ResultModal || !step4ResultScore || !step4ResultImage || !step4ResultMessage) return;
    var ok = score >= step4Game.configuredGoalScore;
    if (step4ResultTitle) {
      step4ResultTitle.textContent = roundNo ? String(roundNo) + "세트 종료" : "최종 결과";
    }
    step4ResultScore.textContent = "당신의 최종 점수는 " + score + "점입니다!";
    if (step4ResultConfig) {
      step4ResultConfig.textContent =
        "설정 시간: " + step4Game.configuredSeconds + "초 · 설정 목표 점수: " + step4Game.configuredGoalScore + "점";
    }
    step4ResultImage.src = ok ? "images/step4-success.png" : "images/step4-try-again.png";
    step4ResultImage.alt = ok ? "성공 결과 이미지" : "재도전 결과 이미지";
    step4ResultMessage.textContent = ok
      ? "대단해요! 당신이 바로 주니어 쾨펜~!"
      : "조금 더 노력해볼까요? 다시 도전해보세요!";
    setStep4ResultModalView("result");
    step4ResultModal.hidden = false;
    step4ResultModal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function setGameSymbolButtonsDisabled(disabled) {
    document.querySelectorAll("#game-symbol-grid .game-symbol-card").forEach(function (b) {
      b.disabled = disabled;
    });
  }

  function step4GuessMatchesCity(buttonLabel, cityCode) {
    for (var i = 0; i < STEP4_SYMBOL_ENTRIES.length; i++) {
      var e = STEP4_SYMBOL_ENTRIES[i];
      if (e.label !== buttonLabel) continue;
      for (var j = 0; j < e.matchCodes.length; j++) {
        if (e.matchCodes[j] === cityCode) return true;
      }
      return false;
    }
    return false;
  }

  function buildGameSymbolGrid() {
    var grid = document.getElementById("game-symbol-grid");
    if (!grid || (grid.dataset.built === "1" && grid.dataset.symRev === "6")) return;
    grid.dataset.built = "1";
    grid.dataset.symRev = "6";
    grid.innerHTML = "";
    STEP4_SYMBOL_ENTRIES.forEach(function (entry) {
      var label = entry.label;
      var b = document.createElement("button");
      b.type = "button";
      b.className = "game-symbol-card";
      b.textContent = label;
      b.setAttribute("data-symbol", label);
      b.disabled = true;
      b.addEventListener("click", function () {
        onGameSymbolPick(label);
      });
      grid.appendChild(b);
    });
  }

  function showStep4QuestionByCityIndex(idx, recordHistory) {
    if (idx < 0 || idx >= CITY_DATA.length) return;
    step4Game.lastCityIdx = idx;
    step4Game.currentCityIndex = idx;
    if (recordHistory) {
      if (step4Game.historyCursor < step4Game.history.length - 1) {
        step4Game.history = step4Game.history.slice(0, step4Game.historyCursor + 1);
      }
      step4Game.history.push(idx);
      step4Game.historyCursor = step4Game.history.length - 1;
    }
    updateStep4ControlState();
    var city = CITY_DATA[idx];
    var canvas = document.getElementById("step4QuizChart");
    if (!canvas || typeof Chart === "undefined") return;
    destroyGameChart();
    var cfg = buildChartConfig(city, true, { guidelines: false });
    cfg.options.plugins.legend.display = true;
    cfg.options.plugins.title.display = false;
    gameChartInstance = new Chart(canvas.getContext("2d"), cfg);
    updateGameHighlandHint(city);
  }

  function pickRandomGameQuestion() {
    var n = CITY_DATA.length;
    if (!n) return;
    var idx;
    var guard = 0;
    do {
      idx = Math.floor(Math.random() * n);
      guard++;
    } while (n > 1 && idx === step4Game.lastCityIdx && guard < 12);
    showStep4QuestionByCityIndex(idx, true);
  }

  function onGameSymbolPick(sym) {
    if (!step4Game.active || step4Game.inputLocked || step4Game.currentCityIndex < 0) return;
    var city = CITY_DATA[step4Game.currentCityIndex];
    var ok = step4GuessMatchesCity(sym, answerCodeForCity(city));
    var stage = document.getElementById("game-stage");
    var msg = document.getElementById("game-status-msg");
    step4Game.roundsDone += 1;

    if (ok) {
      var gain = 10;
      step4Game.score += gain;
      updateGameHud();
      if (msg) {
        msg.textContent = "정답! +" + gain + "점";
      }
      flashGameCombo();
      if (stage) {
        stage.classList.remove("game-stage--shake-wrong");
        stage.classList.add("game-stage--flash-ok");
        window.setTimeout(function () {
          stage.classList.remove("game-stage--flash-ok");
        }, 480);
      }
      pickRandomGameQuestion();
    } else {
      recordStep4WrongAnswer(city, sym, displayCodeForCity(city));
      if (msg) {
        msg.textContent =
          "오답 — 정답 기호는 " + displayCodeForCity(city) + " 입니다. 잠시 후 다음 문제로 넘어갑니다.";
      }
      if (navigator.vibrate) {
        navigator.vibrate([16, 36, 14, 38, 18, 42, 22]);
      }
      if (stage) {
        stage.classList.remove("game-stage--flash-ok");
        stage.classList.add("game-stage--shake-wrong");
      }
      var gameShell = document.querySelector("#panel-step4 .game-shell");
      if (gameShell) {
        gameShell.classList.remove("game-shell--shake");
        void gameShell.offsetWidth;
        gameShell.classList.add("game-shell--shake");
        window.setTimeout(function () {
          gameShell.classList.remove("game-shell--shake");
        }, 520);
      }
      step4Game.inputLocked = true;
      setGameSymbolButtonsDisabled(true);
      updateStep4ControlState();
      window.setTimeout(function () {
        if (stage) stage.classList.remove("game-stage--shake-wrong");
        step4Game.inputLocked = false;
        if (step4Game.active) {
          setGameSymbolButtonsDisabled(false);
          pickRandomGameQuestion();
          if (msg) msg.textContent = "다음 문제입니다.";
          updateStep4ControlState();
        }
      }, 1400);
    }
  }

  function goToNextStep4Question() {
    if (!step4Game.active || step4Game.inputLocked) return;
    pickRandomGameQuestion();
    var msg = document.getElementById("game-status-msg");
    if (msg) msg.textContent = "다음 문제입니다.";
  }

  function goToPrevStep4Question() {
    if (!step4Game.active || step4Game.inputLocked) return;
    if (step4Game.historyCursor <= 0) return;
    step4Game.historyCursor -= 1;
    var prevIdx = step4Game.history[step4Game.historyCursor];
    showStep4QuestionByCityIndex(prevIdx, false);
    var msg = document.getElementById("game-status-msg");
    if (msg) msg.textContent = "이전 문제입니다.";
  }

  function openStep4WrongListView() {
    renderStep4WrongAnswerList();
    setStep4ResultModalView("wrong");
  }

  function restartStep4FromModal() {
    step4Game.awaitingNextAfterModal = false;
    closeStep4ResultModal();
    startStep4Game();
  }

  function tickStep4Timer() {
    step4Game.timeLeft -= 1;
    updateGameHud();
    if (step4Game.timeLeft <= 0) {
      endStep4Game("time");
    }
  }

  function endStep4Game(reason) {
    if (step4Game.timerId) {
      clearInterval(step4Game.timerId);
      step4Game.timerId = null;
    }
    if (!step4Game.active) return;
    step4Game.active = false;
    step4Game.inputLocked = false;

    destroyGameChart();
    setGameSymbolButtonsDisabled(true);
    step4Game.timeLeft = step4Game.configuredSeconds;
    step4Game.history = [];
    step4Game.historyCursor = -1;
    step4Game.roundsDone = 0;
    step4Game.awaitingNextAfterModal = false;
    updateGameHud();
    updateStep4ControlState();

    var msg = document.getElementById("game-status-msg");
    if (msg) {
      if (reason === "manual") {
        msg.textContent = "게임을 중단했습니다. 이번 점수 " + step4Game.score + "점";
      } else {
        msg.textContent = "시간 종료! 최종 점수 " + step4Game.score + "점";
      }
    }
    openStep4ResultModal(step4Game.score, null);
    clearGameHighlandHint();
  }

  function stopStep4GameQuiet() {
    if (step4Game.timerId) {
      clearInterval(step4Game.timerId);
      step4Game.timerId = null;
    }
    step4Game.active = false;
    step4Game.inputLocked = false;
    destroyGameChart();
    setGameSymbolButtonsDisabled(true);
    step4Game.timeLeft = step4Game.configuredSeconds;
    step4Game.history = [];
    step4Game.historyCursor = -1;
    step4Game.roundsDone = 0;
    step4Game.awaitingNextAfterModal = false;
    step4Game.wrongAnswers = [];
    updateGameHud();
    updateStep4ControlState();
    closeStep4ResultModal();
    clearGameHighlandHint();
  }

  function startStep4Game() {
    if (step4Game.active) return;
    if (!CITY_DATA.length) {
      var m0 = document.getElementById("game-status-msg");
      if (m0) m0.textContent = "도시 데이터가 없어 게임을 시작할 수 없습니다.";
      return;
    }
    buildGameSymbolGrid();
    closeStep4ResultModal();
    step4Game.active = true;
    step4Game.inputLocked = false;
    step4Game.timeLeft = step4Game.configuredSeconds;
    step4Game.score = 0;
    step4Game.lastCityIdx = -1;
    step4Game.currentCityIndex = -1;
    step4Game.history = [];
    step4Game.historyCursor = -1;
    step4Game.roundsDone = 0;
    step4Game.awaitingNextAfterModal = false;
    step4Game.wrongAnswers = [];
    updateGameHud();

    updateStep4ControlState();

    setGameSymbolButtonsDisabled(false);
    pickRandomGameQuestion();

    var msg = document.getElementById("game-status-msg");
    if (msg) msg.textContent = step4Game.maxRounds + "세트 동안 최대한 많이 맞혀 보세요!";

    step4Game.timerId = setInterval(tickStep4Timer, 1000);
  }

  function initStep4() {
    buildGameSymbolGrid();
    if (!document.body.dataset.step4Wired) {
      document.body.dataset.step4Wired = "1";
      var bs = document.getElementById("btn-game-start");
      var bp = document.getElementById("btn-game-prev");
      var bn = document.getElementById("btn-game-next");
      var bt = document.getElementById("btn-game-stop");
      var btUp = document.getElementById("btn-game-time-up");
      var btDown = document.getElementById("btn-game-time-down");
      var bgUp = document.getElementById("btn-game-goal-up");
      var bgDown = document.getElementById("btn-game-goal-down");
      var reviewBtn = document.getElementById("btn-step4-review-wrong");
      var restartBtn = document.getElementById("btn-step4-restart");
      var modalCloseBtn = document.getElementById("btn-step4-modal-close");
      if (bs) bs.addEventListener("click", startStep4Game);
      if (bp) bp.addEventListener("click", goToPrevStep4Question);
      if (bn) bn.addEventListener("click", goToNextStep4Question);
      if (bt) bt.addEventListener("click", function () { endStep4Game("manual"); });
      if (btUp) btUp.addEventListener("click", function () { adjustStep4ConfiguredTime(10); });
      if (btDown) btDown.addEventListener("click", function () { adjustStep4ConfiguredTime(-10); });
      if (bgUp) bgUp.addEventListener("click", function () { adjustStep4ConfiguredGoal(10); });
      if (bgDown) bgDown.addEventListener("click", function () { adjustStep4ConfiguredGoal(-10); });
      if (reviewBtn) reviewBtn.addEventListener("click", openStep4WrongListView);
      if (restartBtn) restartBtn.addEventListener("click", restartStep4FromModal);
      if (modalCloseBtn) modalCloseBtn.addEventListener("click", closeStep4ResultModal);
    }
    if (!step4Game.active) {
      setGameSymbolButtonsDisabled(true);
    }
    step4Game.timeLeft = step4Game.configuredSeconds;
    updateGameHud();
    updateStep4ControlState();
  }

  function setStep(n) {
    var num = String(n);
    if (currentStep === "4" && num !== "4") {
      stopStep4GameQuiet();
    }

    stepButtons.forEach(function (btn) {
      var target = btn.getAttribute("data-step-target");
      var active = target === num;
      btn.classList.toggle("is-active", active);
      if (active) btn.setAttribute("aria-current", "page");
      else btn.removeAttribute("aria-current");
    });

    Object.keys(panels).forEach(function (k) {
      var el = panels[k];
      if (!el) return;
      var show = k === num;
      el.hidden = !show;
      el.classList.toggle("is-visible", show);
    });

    if (num === "2") {
      requestAnimationFrame(function () {
        renderPracticeQuizAfterShow();
      });
    }
    if (num === "3") {
      initStep3();
      buildStep3MapMarkers();
      var s3grid = document.querySelector("#panel-step3 .step3-layout-grid");
      if (s3grid) {
        s3grid.classList.remove("step3-layout-grid--enter");
        void s3grid.offsetWidth;
        s3grid.classList.add("step3-layout-grid--enter");
      }
      refreshStep3ClimateChart();
      var selStep3 = document.getElementById("city-select");
      if (selStep3) syncStep3MapMarkers(selStep3.value);
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          if (chartInstance) chartInstance.resize();
          invalidateStep3LeafletMap();
        });
      });
    }
    if (num === "4") {
      initStep4();
    }

    currentStep = num;
  }

  document.querySelectorAll(".climate-card").forEach(function (card) {
    function onActivate() {
      var key = card.getAttribute("data-climate");
      if (key) openModal(key);
    }
    card.addEventListener("click", onActivate);
    card.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onActivate();
      }
    });
  });

  document.querySelectorAll(".koppen-chip").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var letter = btn.getAttribute("data-koppen");
      if (letter) setActiveKoppenChip(letter);
    });
  });

  stepButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      var target = btn.getAttribute("data-step-target");
      if (target) setStep(target);
    });
  });

  if (modalRoot) {
    modalRoot.addEventListener("click", function (e) {
      if (e.target.closest("[data-modal-close]")) closeModal();
    });
  }
  if (step4ResultModal) {
    step4ResultModal.addEventListener("click", function (e) {
      if (e.target.classList && e.target.classList.contains("step4-result-backdrop")) {
        closeStep4ResultModal();
      }
    });
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      if (modalRoot && !modalRoot.hidden) closeModal();
      if (step4ResultModal && !step4ResultModal.hidden) closeStep4ResultModal();
    }
  });

  document.addEventListener("click", function (e) {
    var hintBtn = e.target.closest(".hint-reveal-btn[data-hint-target]");
    if (!hintBtn) return;
    var id = hintBtn.getAttribute("data-hint-target");
    var panel = id ? document.getElementById(id) : null;
    if (!panel) return;
    var willOpen = panel.hidden;
    panel.hidden = !willOpen;
    hintBtn.setAttribute("aria-expanded", willOpen ? "true" : "false");
  });

  document.querySelectorAll(".inline-step-link[data-goto-step]").forEach(function (a) {
    a.addEventListener("click", function (e) {
      e.preventDefault();
      var s = a.getAttribute("data-goto-step");
      if (s) setStep(s);
    });
  });

  initStep2Practice();
  loadClimateData();
})();
