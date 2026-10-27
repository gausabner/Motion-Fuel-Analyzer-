#!/usr/bin/env python3
"""
fetch_public_data.py - replaces the synthetic external stand-ins with the REAL public datasets.

Why this exists: the build environment for this project blocked outbound access to NASA, the World
Bank and FRED, so raw/external/* holds synthetic files that copy the published layouts exactly. Run
this script on a machine with internet access to download the real data into the same paths, then
re-run 02_sql/run_pipeline.py - no code changes are needed.

Sources (all free, no API key):
  * NASA POWER daily point API (Agroclimatology community), one request per farm coordinate
      https://power.larc.nasa.gov/api/temporal/daily/point
  * World Bank Commodity Price Data ("Pink Sheet"), monthly historical workbook
      https://www.worldbank.org/en/research/commodity-markets  -> "Monthly prices" (CMO-Historical-Data-Monthly.xlsx)
      The file URL changes with each monthly release: copy the current link and pass --pink-sheet-url.
  * FRED, Federal Reserve Bank of St. Louis: DEXSFUS (ZAR per USD), DEXUSEU (USD per EUR), DEXUSUK (USD per GBP)
      https://fred.stlouisfed.org/graph/fredgraph.csv?id=<SERIES>
  * NSA / MAFWLR crop estimates: published as PDF reports (no API). Transcribe the regional tables into
      raw/external/nsa/crop_estimates_by_region.csv using the same columns as the synthetic file.

Usage:
  python fetch_public_data.py --pink-sheet-url "<current CMO-Historical-Data-Monthly.xlsx link>"
"""
from __future__ import annotations

import argparse
import json
import time
import urllib.request
from pathlib import Path

import pandas as pd

RAW = Path(__file__).resolve().parent / "raw"
POWER_URL = ("https://power.larc.nasa.gov/api/temporal/daily/point?parameters=PRECTOTCORR,T2M_MAX,T2M_MIN,RH2M,ALLSKY_SFC_SW_DWN"
             "&community=AG&longitude={lon}&latitude={lat}&start=20201001&end=20260930&format=JSON")
FRED_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv?id={series}"
DEFAULT_PINK = ("https://thedocs.worldbank.org/en/doc/18675f1d1639c7a34d463f59263ba0a2-0050012025/related/"
                "CMO-Historical-Data-Monthly.xlsx")


def get(url: str, retries: int = 3) -> bytes:
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "GreenBasket-ABI820S/1.0"})
            with urllib.request.urlopen(req, timeout=120) as r:
                return r.read()
        except Exception as exc:  # network errors are retried with back-off
            if i == retries - 1:
                raise
            print(f"  retry {i + 1} after error: {exc}")
            time.sleep(2 ** (i + 1))


def fetch_power():
    farms = pd.read_excel(RAW / "internal/master_data/GB_Master_Data.xlsx", sheet_name="Farms")
    out = RAW / "external/nasa_power"
    for f in farms.itertuples():
        data = json.loads(get(POWER_URL.format(lon=f.longitude, lat=f.latitude)))
        (out / f"POWER_Point_Daily_{f.farm_code}.json").write_text(json.dumps(data))
        print(f"NASA POWER {f.farm_code}: {len(data['properties']['parameter']['PRECTOTCORR'])} days")
        time.sleep(1)  # be polite to the public API


def fetch_fred():
    for s in ("DEXSFUS", "DEXUSEU", "DEXUSUK"):
        (RAW / "external/fred" / f"{s}.csv").write_bytes(get(FRED_URL.format(series=s)))
        print(f"FRED {s} downloaded")


def fetch_pink_sheet(url: str):
    (RAW / "external/world_bank/CMO-Historical-Data-Monthly.xlsx").write_bytes(get(url))
    print("World Bank Pink Sheet downloaded (the ETL keeps months from 2020-01 onwards)")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--pink-sheet-url", default=DEFAULT_PINK)
    ap.add_argument("--skip", nargs="*", default=[], choices=["power", "fred", "pink"])
    args = ap.parse_args()
    if "power" not in args.skip:
        fetch_power()
    if "fred" not in args.skip:
        fetch_fred()
    if "pink" not in args.skip:
        fetch_pink_sheet(args.pink_sheet_url)
    print("Done. NSA crop estimates must be transcribed manually (see module docstring). Re-run 02_sql/run_pipeline.py.")


if __name__ == "__main__":
    main()
