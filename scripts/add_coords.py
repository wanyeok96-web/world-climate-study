import csv
import io
import time
from pathlib import Path

import requests


CSV_PATH = Path(r"c:\Users\com\Desktop\어나더 지오엑스\2. 세계의 기후\data\기후데이터.CSV")


def decode_bytes(raw: bytes) -> str:
    for enc in ("utf-8-sig", "cp949", "euc-kr"):
        try:
            return raw.decode(enc)
        except Exception:
            pass
    return raw.decode("utf-8", errors="replace")


def geocode_city(name: str):
    q = name.replace("_", " ")
    url = "https://nominatim.openstreetmap.org/search"
    params = {"q": q, "format": "jsonv2", "limit": 1}
    resp = requests.get(url, params=params, headers={"User-Agent": "geoex-csv-updater/1.0"}, timeout=20)
    resp.raise_for_status()
    arr = resp.json()
    if not arr:
        return None
    return float(arr[0]["lat"]), float(arr[0]["lon"])


def main():
    raw = CSV_PATH.read_bytes()
    text = decode_bytes(raw)
    rows = list(csv.DictReader(io.StringIO(text)))
    if not rows:
        raise RuntimeError("CSV has no data rows.")

    manual = {
        "Amundsen-Scott": (-90.0, 0.0),
        "McMurdo": (-77.8419, 166.6863),
        "Vostok": (-78.4645, 106.8372),
        "Barrow": (71.2906, -156.7886),
        "Nuuk": (64.1835, -51.7216),
        "Iqaluit": (63.7467, -68.5170),
        "Longyearbyen": (78.2232, 15.6469),
    }

    misses = []
    for row in rows:
        city = (row.get("City") or "").strip()
        latlon = manual.get(city)
        if latlon is None:
            try:
                latlon = geocode_city(city)
                time.sleep(1.1)
            except Exception:
                latlon = None
        if latlon is None:
            row["Lat"] = ""
            row["Lon"] = ""
            misses.append(city)
        else:
            row["Lat"] = f"{latlon[0]:.4f}"
            row["Lon"] = f"{latlon[1]:.4f}"

    fields = list(rows[0].keys())
    if "Lat" in fields:
        fields.remove("Lat")
    if "Lon" in fields:
        fields.remove("Lon")

    out_fields = []
    for f in fields:
        out_fields.append(f)
        if f == "Type":
            out_fields.extend(["Lat", "Lon"])

    out = io.StringIO()
    writer = csv.DictWriter(out, fieldnames=out_fields, lineterminator="\n")
    writer.writeheader()
    for row in rows:
        writer.writerow({k: row.get(k, "") for k in out_fields})

    CSV_PATH.write_text(out.getvalue(), encoding="utf-8-sig")
    print(f"updated {len(rows)} rows, misses={len(misses)}")
    if misses:
        print("misses:", ", ".join(misses))


if __name__ == "__main__":
    main()
