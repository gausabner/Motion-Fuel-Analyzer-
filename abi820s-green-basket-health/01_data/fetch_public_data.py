#!/usr/bin/env python3
"""
fetch_public_data.py - replaces the NASA POWER weather stand-ins with the REAL public data.

Why this exists: the build environment for this project could not reach the NASA POWER API, so
raw/external/nasa_power/* holds synthetic files that copy the published JSON layout exactly (the
header says "SYNTHETIC STAND-IN"). Run this script on a machine with internet access to download the
real daily series into the same paths, then re-run 02_sql/run_pipeline.py - no code changes are needed.

Sources (free, no API key):
  * NASA POWER daily point API (Agroclimatology community), one request per facility coordinate:
      https://power.larc.nasa.gov/api/temporal/daily/point
  * Namibia Statistics Agency, 2023 Population and Housing Census preliminary results (13 March 2024).
      raw/external/nsa/nsa_census2023_population_by_region.csv already holds the REAL published regional
      totals (they reconcile to the national total of 3,022,401). When the NSA publishes the final
      results, transcribe the new table into the same file and layout; --check-census validates it.

Usage:
  python fetch_public_data.py                  # download NASA POWER for the 10 GBHS facilities
  python fetch_public_data.py --check-census   # validate the census file only
"""
from __future__ import annotations

import argparse
import csv
import json
import time
import urllib.request
from pathlib import Path

import pandas as pd

RAW = Path(__file__).resolve().parent / "raw"
POWER_URL = ("https://power.larc.nasa.gov/api/temporal/daily/point?parameters=PRECTOTCORR,T2M_MAX,T2M_MIN,RH2M"
             "&community=AG&longitude={lon}&latitude={lat}&start=20210901&end=20260930&format=JSON")


def get(url: str, retries: int = 4) -> bytes:
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "GBHS-ABI820S/1.0"})
            with urllib.request.urlopen(req, timeout=120) as r:
                return r.read()
        except Exception as exc:  # network errors are retried with exponential back-off
            if i == retries - 1:
                raise
            print(f"  retry {i + 1} after error: {exc}")
            time.sleep(2 ** (i + 1))


def fetch_power():
    fac = pd.read_excel(RAW / "internal/master_data/GBHS_Master_Data.xlsx", sheet_name="Facilities", dtype=str)
    out = RAW / "external/nasa_power"
    for f in fac.itertuples():
        data = json.loads(get(POWER_URL.format(lon=f.longitude, lat=f.latitude)))
        (out / f"POWER_Point_Daily_{f.facility_code}.json").write_text(json.dumps(data))
        print(f"NASA POWER {f.facility_code}: {len(data['properties']['parameter']['PRECTOTCORR'])} days")
        time.sleep(1)  # be polite to the public API


def check_census():
    path = RAW / "external/nsa/nsa_census2023_population_by_region.csv"
    rows = list(csv.reader(path.read_text(encoding="utf-8").splitlines()))
    data = {r[0]: int(r[1].replace(" ", "").replace(",", "")) for r in rows if len(r) == 2 and r[1].replace(" ", "").isdigit()}
    national = data.pop("Namibia")
    total = sum(data.values())
    print(f"{len(data)} regions, sum {total:,} vs national {national:,}: {'OK' if total == national else 'MISMATCH'}")
    return total == national


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check-census", action="store_true", help="only validate the NSA census file")
    args = ap.parse_args()
    if not args.check_census:
        fetch_power()
    check_census()
    print("Done. Re-run 02_sql/run_pipeline.py to reload the warehouse.")


if __name__ == "__main__":
    main()
