#!/usr/bin/env python3
"""
generate_synthetic_data.py
==========================
ABI820S group project - Green Basket cc, Agriculture Division.

Generates the raw source-system extracts used by the data warehouse:

INTERNAL (synthetic - Green Basket cc is a fictitious company)
  S1  Farm production logs      raw/internal/farm_logs/harvest_log_<farm>.csv (14 files, 3 templates)
                                raw/internal/farm_logs/planting_register.csv
  S2  Master data workbook      raw/internal/master_data/GB_Master_Data.xlsx
                                raw/internal/master_data/master_data_delta_2026-10-05.xlsx
  S3  Sales ERP extracts        raw/internal/erp/sales_invoice_lines_FY<yyyy>.csv.gz (6 files)
  S4  Stock system              raw/internal/stock/stock_movements_monthly.csv
  S5  Cost ledger               raw/internal/finance/cost_ledger.csv.gz

EXTERNAL (synthetic stand-ins that copy the published file layouts; see
fetch_public_data.py for the real downloads, which were blocked from the build
environment)
  S6  NASA POWER daily weather   raw/external/nasa_power/POWER_Point_Daily_<farm>.json
  S7  World Bank Pink Sheet      raw/external/world_bank/CMO-Historical-Data-Monthly.xlsx
  S8  FRED exchange rates        raw/external/fred/DEXSFUS.csv, DEXUSEU.csv, DEXUSUK.csv
  S9  NSA / MAFWLR crop estimates raw/external/nsa/crop_estimates_by_region.csv

Data-quality defects are injected deliberately (duplicates, mixed date formats,
unit errors, code variants, missing values, late-arriving customers, ...).
Every injected defect is counted in raw/generator_manifest.json so that the ETL
reconciliation can prove what it detected.

Usage:
    python generate_synthetic_data.py --out raw            # default seed 20261028
Requires: numpy, pandas, openpyxl
"""
from __future__ import annotations

import argparse
import gzip
import json
import math
import platform
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

SEED_DEFAULT = 20261028
BUSINESS_START = date(2021, 4, 1)   # first day of FY2022 (fiscal year = 1 Apr - 31 Mar)
CUTOFF = date(2026, 9, 30)          # data extracted at month-end before submission
WEATHER_START = date(2020, 10, 1)   # start of the 2020/21 agricultural season
PRICE_START = date(2020, 1, 1)
DELTA_DATE = date(2026, 10, 5)      # "day-2" master-data delta used to demo incremental SCD2


# ----------------------------------------------------------------------------
# Calendar helpers
# ----------------------------------------------------------------------------
def fiscal_year(d: date) -> int:
    """Green Basket fiscal year runs 1 April - 31 March and is named by its end year."""
    return d.year + 1 if d.month >= 4 else d.year


def season_start_year(d: date) -> int:
    """Agricultural season runs 1 October - 30 September (e.g. 2023/24)."""
    return d.year if d.month >= 10 else d.year - 1


def season_label(y: int) -> str:
    return f"{y}/{str(y + 1)[-2:]}"


def month_start(d: date) -> date:
    return d.replace(day=1)


def month_end(d: date) -> date:
    nxt = (d.replace(day=28) + timedelta(days=4)).replace(day=1)
    return nxt - timedelta(days=1)


def add_months(d: date, n: int) -> date:
    y, m = divmod(d.month - 1 + n, 12)
    return date(d.year + y, m + 1, 1)


def daterange(a: date, b: date):
    for i in range((b - a).days + 1):
        yield a + timedelta(days=i)


def rand_date(rng, a: date, b: date) -> date:
    return a + timedelta(days=int(rng.integers(0, (b - a).days + 1)))


def rand_date_or_none(rng, a: date, b: date):
    return None if a > b else rand_date(rng, a, b)


def next_working_day(d: date) -> date:
    while d.weekday() == 6:  # Sunday
        d += timedelta(days=1)
    return d


# ----------------------------------------------------------------------------
# Reference data: geography
# ----------------------------------------------------------------------------
# ISO 3166-2:NA codes. Zone is the division's management zone (drives RLS).
REGIONS = [
    # code,   name,           zone, zone name,      capital,        aliases seen in sources
    ("NA-CA", "Zambezi",      "NE", "North-East",   "Katima Mulilo", ["Zambezi (Caprivi)", "Caprivi", "ZAMBEZI"]),
    ("NA-ER", "Erongo",       "CE", "Central",      "Swakopmund",    ["ERONGO", "Erongo Region"]),
    ("NA-HA", "Hardap",       "SO", "South",        "Mariental",     ["HARDAP"]),
    ("NA-KA", "//Kharas",     "SO", "South",        "Keetmanshoop",  ["Karas", "//Karas", "Kharas", "!Karas"]),
    ("NA-KE", "Kavango East", "NE", "North-East",   "Rundu",         ["Kavango-East", "Kavango E", "KAVANGO EAST"]),
    ("NA-KW", "Kavango West", "NE", "North-East",   "Nkurenkuru",    ["Kavango-West", "Kavango W"]),
    ("NA-KH", "Khomas",       "CE", "Central",      "Windhoek",      ["KHOMAS"]),
    ("NA-KU", "Kunene",       "NW", "North-West",   "Opuwo",         ["KUNENE"]),
    ("NA-OW", "Ohangwena",    "NC", "North-Central", "Eenhana",      ["OHANGWENA"]),
    ("NA-OH", "Omaheke",      "CE", "Central",      "Gobabis",       ["OMAHEKE"]),
    ("NA-OS", "Omusati",      "NC", "North-Central", "Outapi",       ["OMUSATI"]),
    ("NA-ON", "Oshana",       "NC", "North-Central", "Oshakati",     ["OSHANA"]),
    ("NA-OT", "Oshikoto",     "NC", "North-Central", "Omuthiya",     ["OSHIKOTO"]),
    ("NA-OD", "Otjozondjupa", "CE", "Central",      "Otjiwarongo",   ["OTJOZONDJUPA", "Otjozondjupa Region"]),
]
REGION_BY_CODE = {r[0]: r for r in REGIONS}
ZONE_OF_REGION = {r[0]: r[2] for r in REGIONS}

TOWNS = {
    "NA-KH": ["Windhoek"],
    "NA-ER": ["Swakopmund", "Walvis Bay", "Omaruru", "Karibib", "Henties Bay"],
    "NA-HA": ["Mariental", "Rehoboth", "Maltahohe"],
    "NA-KA": ["Keetmanshoop", "Luderitz", "Karasburg", "Oranjemund", "Noordoewer"],
    "NA-KE": ["Rundu", "Divundu"],
    "NA-KW": ["Nkurenkuru", "Mpungu"],
    "NA-CA": ["Katima Mulilo", "Bukalo"],
    "NA-OW": ["Eenhana", "Okongo", "Helao Nafidi"],
    "NA-OS": ["Outapi", "Okahao", "Oshikuku", "Tsandi"],
    "NA-ON": ["Oshakati", "Ongwediva", "Ondangwa"],
    "NA-OT": ["Tsumeb", "Omuthiya", "Oniipa"],
    "NA-OD": ["Otjiwarongo", "Grootfontein", "Okahandja", "Otavi"],
    "NA-OH": ["Gobabis"],
    "NA-KU": ["Opuwo", "Outjo", "Khorixas"],
}
REGION_CUSTOMER_WEIGHT = {
    "NA-KH": 0.22, "NA-ER": 0.11, "NA-ON": 0.10, "NA-OW": 0.07, "NA-OS": 0.07, "NA-OT": 0.06,
    "NA-OD": 0.07, "NA-KE": 0.06, "NA-CA": 0.04, "NA-KA": 0.05, "NA-HA": 0.04, "NA-KW": 0.03,
    "NA-KU": 0.04, "NA-OH": 0.04,
}

# ----------------------------------------------------------------------------
# Reference data: crops, products, cost categories
# ----------------------------------------------------------------------------
CATEGORIES = {
    "CER": ("Cereals & grains", "Field crops"),
    "VEG": ("Vegetables", "Horticulture"),
    "FRU": ("Fruit", "Horticulture"),
}

# perish: days of shelf life; storage; NAB controlled product?
CROPS = {
    "MZW": dict(name="White maize", cat="CER", sci="Zea mays", nab="Y", storage="Silo", shelf=365, cull=0.02),
    "WHT": dict(name="Wheat", cat="CER", sci="Triticum aestivum", nab="Y", storage="Silo", shelf=365, cull=0.02),
    "MAH": dict(name="Mahangu (pearl millet)", cat="CER", sci="Pennisetum glaucum", nab="Y", storage="Bag store", shelf=270, cull=0.03),
    "TOM": dict(name="Tomatoes", cat="VEG", sci="Solanum lycopersicum", nab="Y", storage="Ambient packhouse", shelf=10, cull=0.08),
    "ONI": dict(name="Onions", cat="VEG", sci="Allium cepa", nab="Y", storage="Ventilated store", shelf=120, cull=0.05),
    "POT": dict(name="Potatoes", cat="VEG", sci="Solanum tuberosum", nab="Y", storage="Cold room", shelf=60, cull=0.06),
    "CAB": dict(name="Cabbage", cat="VEG", sci="Brassica oleracea var. capitata", nab="Y", storage="Cold room", shelf=21, cull=0.05),
    "BUT": dict(name="Butternut", cat="VEG", sci="Cucurbita moschata", nab="Y", storage="Ambient packhouse", shelf=90, cull=0.05),
    "WML": dict(name="Watermelon", cat="FRU", sci="Citrullus lanatus", nab="Y", storage="Ambient packhouse", shelf=21, cull=0.05),
    "GRP": dict(name="Table grapes", cat="FRU", sci="Vitis vinifera", nab="N", storage="Cold chain", shelf=45, cull=0.05),
}

# product: code, crop, name, grade, pack, uom, kg_per_uom, share (of saleable kg), class
PRODUCTS = [
    ("MZW-WM1-BLK", "MZW", "White Maize WM1 Bulk", "WM1", "Bulk", "t", 1000, 0.62, "grain_bulk"),
    ("MZW-WM2-BLK", "MZW", "White Maize WM2 Bulk", "WM2", "Bulk", "t", 1000, 0.28, "grain_bulk"),
    ("MZW-WM1-B50", "MZW", "White Maize WM1 50kg Bag", "WM1", "50kg bag", "bag", 50, 0.10, "grain_bag"),
    ("WHT-B1-BLK", "WHT", "Wheat B1 Bulk", "B1", "Bulk", "t", 1000, 0.76, "grain_bulk"),
    ("WHT-B3-BLK", "WHT", "Wheat B3 Bulk", "B3", "Bulk", "t", 1000, 0.24, "grain_bulk"),
    ("MAH-GR-B50", "MAH", "Mahangu Grain 50kg Bag", "Standard", "50kg bag", "bag", 50, 0.60, "grain_bag"),
    ("MAH-GR-B20", "MAH", "Mahangu Grain 20kg Bag", "Standard", "20kg bag", "bag", 20, 0.40, "grain_bag"),
    ("TOM-C1-C10", "TOM", "Tomatoes Class 1 10kg Crate", "Class 1", "10kg crate", "crate", 10, 0.76, "veg_c1"),
    ("TOM-C2-C10", "TOM", "Tomatoes Class 2 10kg Crate", "Class 2", "10kg crate", "crate", 10, 0.24, "veg_c2"),
    ("ONI-C1-P10", "ONI", "Onions Class 1 10kg Pocket", "Class 1", "10kg pocket", "pocket", 10, 0.79, "veg_c1"),
    ("ONI-C2-B25", "ONI", "Onions Class 2 25kg Bag", "Class 2", "25kg bag", "bag", 25, 0.21, "veg_c2"),
    ("POT-C1-P10", "POT", "Potatoes Class 1 10kg Pocket", "Class 1", "10kg pocket", "pocket", 10, 0.77, "veg_c1"),
    ("POT-C2-P07", "POT", "Potatoes Class 2 7kg Pocket", "Class 2", "7kg pocket", "pocket", 7, 0.23, "veg_c2"),
    ("CAB-C1-HD", "CAB", "Cabbage Class 1 per Head", "Class 1", "Head (~2.5kg)", "head", 2.5, 0.82, "veg_c1"),
    ("CAB-C2-BAG", "CAB", "Cabbage Class 2 Bag of 10", "Class 2", "Bag of 10 (~22kg)", "bag", 22, 0.18, "veg_c2"),
    ("BUT-C1-P10", "BUT", "Butternut Class 1 10kg Pocket", "Class 1", "10kg pocket", "pocket", 10, 0.74, "veg_c1"),
    ("BUT-C2-BIN", "BUT", "Butternut Class 2 Bulk Bin", "Class 2", "400kg bin", "bin", 400, 0.26, "veg_c2"),
    ("WML-C1-UNIT", "WML", "Watermelon Class 1 per Unit", "Class 1", "Unit (~8kg)", "unit", 8, 0.73, "melon"),
    ("WML-C2-BIN", "WML", "Watermelon Class 2 Bulk Bin", "Class 2", "500kg bin", "bin", 500, 0.27, "melon"),
    ("GRP-EXP-C45", "GRP", "Table Grapes Export 4.5kg Carton", "Export", "4.5kg carton", "carton", 4.5, 0.82, "fruit_export"),
    ("GRP-LOC-B05", "GRP", "Table Grapes Local 5kg Box", "Local", "5kg box", "box", 5, 0.18, "fruit_local"),
]
PRODUCT_BY_CODE = {p[0]: p for p in PRODUCTS}
PRODUCTS_OF_CROP = defaultdict(list)
for _p in PRODUCTS:
    PRODUCTS_OF_CROP[_p[1]].append(_p)

COST_CATEGORIES = [
    # code, name, group, behaviour, gl, qty_uom, ledger text variants
    ("CC01", "Seed & planting material", "Direct inputs", "Variable", "5100", "", ["Seed", "Seeds & seedlings", "SEED"]),
    ("CC02", "Fertiliser", "Direct inputs", "Variable", "5110", "kg", ["Fertilizer", "FERTILISER", "Fert."]),
    ("CC03", "Crop protection chemicals", "Direct inputs", "Variable", "5120", "l", ["Chemicals", "Agrochemicals", "Crop protection"]),
    ("CC04", "Seasonal labour", "Labour", "Variable", "5200", "hours", ["Casual labour", "Seasonal Labour", "Labour - seasonal"]),
    ("CC05", "Permanent labour", "Labour", "Fixed", "5210", "", ["Salaries & wages", "Permanent Labour"]),
    ("CC06", "Fuel & lubricants", "Energy & water", "Variable", "5300", "l", ["Diesel", "Fuel", "Fuel and lubricants"]),
    ("CC07", "Electricity (irrigation pumping)", "Energy & water", "Variable", "5310", "kWh", ["Electricity", "Electricity - pumping", "ELEC"]),
    ("CC08", "Water levies", "Energy & water", "Variable", "5320", "m3", ["Water", "Water levy"]),
    ("CC09", "Mechanisation & repairs", "Mechanisation", "Semi-variable", "5400", "", ["Repairs & maintenance", "Mechanisation", "R&M"]),
    ("CC10", "Packaging materials", "Packaging & logistics", "Variable", "5500", "", ["Packaging", "Packing material"]),
    ("CC11", "Inbound transport", "Packaging & logistics", "Variable", "5510", "", ["Transport in", "Freight inwards"]),
    ("CC12", "Administration & overheads", "Overheads", "Fixed", "6100", "", ["Admin", "Overheads"]),
    ("CC13", "Insurance", "Overheads", "Fixed", "6110", "", ["Insurance premium"]),
    ("CC14", "Security", "Overheads", "Fixed", "6120", "", ["Security services"]),
]
CC_BY_CODE = {c[0]: c for c in COST_CATEGORIES}

# Cost rates N$/ha per crop cycle at 2021 prices (keys are cost-category codes);
# FERT_KG is the fertiliser application rate (kg/ha) at fert_index = 1.
COST_RATES = {
    ("MZW", True):  dict(CC01=4200, CC02=9500, CC03=2800, CC04=1500, CC06=2600, CC07=4800, CC08=900, CC09=2200, CC10=600, CC11=700, FERT_KG=650),
    ("MZW", False): dict(CC01=3200, CC02=4200, CC03=1600, CC04=900, CC06=1900, CC09=1600, CC10=300, CC11=500, FERT_KG=300),
    ("WHT", True):  dict(CC01=3800, CC02=8800, CC03=2400, CC04=1200, CC06=2400, CC07=5200, CC08=1000, CC09=2000, CC10=300, CC11=600, FERT_KG=600),
    ("MAH", False): dict(CC01=600, CC02=1200, CC03=300, CC04=2800, CC06=700, CC09=600, CC10=400, CC11=300, FERT_KG=100),
    ("TOM", True):  dict(CC01=38000, CC02=22000, CC03=28000, CC04=65000, CC06=6000, CC07=14000, CC08=3000, CC09=5000, CC10=42000, CC11=8000, FERT_KG=1800),
    ("ONI", True):  dict(CC01=18000, CC02=15000, CC03=12000, CC04=32000, CC06=4500, CC07=9000, CC08=2200, CC09=4000, CC10=18000, CC11=5000, FERT_KG=1300),
    ("POT", True):  dict(CC01=45000, CC02=18000, CC03=15000, CC04=25000, CC06=6000, CC07=10000, CC08=2500, CC09=6000, CC10=15000, CC11=5000, FERT_KG=1500),
    ("CAB", True):  dict(CC01=14000, CC02=12000, CC03=9000, CC04=26000, CC06=3500, CC07=8000, CC08=2000, CC09=3000, CC10=9000, CC11=4000, FERT_KG=1100),
    ("BUT", True):  dict(CC01=6000, CC02=8000, CC03=6000, CC04=14000, CC06=3000, CC07=6000, CC08=1500, CC09=3000, CC10=7000, CC11=3000, FERT_KG=700),
    ("WML", True):  dict(CC01=7000, CC02=7000, CC03=5000, CC04=12000, CC06=2500, CC07=5500, CC08=1200, CC09=2500, CC10=3000, CC11=3000, FERT_KG=600),
    ("WML", False): dict(CC01=6000, CC02=4000, CC03=3500, CC04=9000, CC06=2000, CC09=2000, CC10=2500, CC11=2500, FERT_KG=300),
    ("GRP", True):  dict(CC01=3000, CC02=14000, CC03=30000, CC04=120000, CC06=8000, CC07=18000, CC08=4000, CC09=6000, CC10=95000, CC11=25000, FERT_KG=900),
}

# ----------------------------------------------------------------------------
# Farms (fictitious farm units at real Namibian locations)
# ----------------------------------------------------------------------------
FARMS = [
    dict(code="GB-ZAM-01", name="Liselo Floodplain Farm", region="NA-CA", town="Katima Mulilo", lat=-17.55, lon=24.20, elev=950,
         total_ha=1250, cultivated_ha=420, irrigation="Centre pivot", water="Zambezi River", manager="MGR-101", gap="N",
         est=2009, template="A", rain=650, climate="north", mgmt=1.04),
    dict(code="GB-KAE-01", name="Mashare Riverside Farm", region="NA-KE", town="Rundu", lat=-17.90, lon=20.18, elev=1080,
         total_ha=1600, cultivated_ha=520, irrigation="Centre pivot", water="Kavango River", manager="MGR-102", gap="N",
         est=2006, template="A", rain=560, climate="north", mgmt=1.00),
    dict(code="GB-KAE-02", name="Ndonga Linena Blok", region="NA-KE", town="Ndonga Linena", lat=-17.97, lon=20.62, elev=1060,
         total_ha=600, cultivated_ha=180, irrigation="Drip", water="Kavango River", manager="MGR-103", gap="N",
         est=2012, template="A", rain=560, climate="north", mgmt=0.95),
    dict(code="GB-KAW-01", name="Nkurenkuru Valley Farm", region="NA-KW", town="Nkurenkuru", lat=-17.62, lon=18.60, elev=1090,
         total_ha=1800, cultivated_ha=600, irrigation="Dryland", water="Rain-fed", manager="MGR-105", gap="N",
         est=2014, template="A", rain=520, climate="north", mgmt=0.97),
    dict(code="GB-OMS-01", name="Outapi Canal Farm", region="NA-OS", town="Outapi", lat=-17.50, lon=14.98, elev=1110,
         total_ha=450, cultivated_ha=140, irrigation="Flood (canal)", water="Calueque-Oshakati canal", manager="MGR-106", gap="N",
         est=2010, template="A", rain=380, climate="north", mgmt=1.00),
    dict(code="GB-OHA-01", name="Eenhana Dryland Farm", region="NA-OW", town="Eenhana", lat=-17.47, lon=16.33, elev=1120,
         total_ha=1400, cultivated_ha=380, irrigation="Dryland", water="Rain-fed", manager="MGR-107", gap="N",
         est=2011, template="A", rain=470, climate="north", mgmt=0.96),
    dict(code="GB-OSH-01", name="Ongwediva Horticulture Hub", region="NA-ON", town="Ongwediva", lat=-17.78, lon=15.77, elev=1100,
         total_ha=120, cultivated_ha=45, irrigation="Drip + shade-net", water="NamWater pipeline", manager="MGR-118", gap="N",
         est=2016, template="A", rain=430, climate="north", mgmt=1.06),
    dict(code="GB-OSK-01", name="Tsumeb Triangle Farm", region="NA-OT", town="Tsumeb", lat=-19.25, lon=17.70, elev=1300,
         total_ha=2200, cultivated_ha=520, irrigation="Dryland", water="Rain-fed + borehole pivots", manager="MGR-108", gap="N",
         est=2003, template="B", rain=560, climate="central", mgmt=1.02),
    dict(code="GB-OTJ-01", name="Grootfontein Plains Farm", region="NA-OD", town="Grootfontein", lat=-19.57, lon=18.12, elev=1460,
         total_ha=2600, cultivated_ha=520, irrigation="Dryland", water="Rain-fed", manager="MGR-104", gap="N",
         est=2001, template="B", rain=560, climate="central", mgmt=0.93),
    dict(code="GB-OTJ-02", name="Otavi Valley Farm", region="NA-OD", town="Otavi", lat=-19.64, lon=17.34, elev=1420,
         total_ha=1500, cultivated_ha=470, irrigation="Centre pivot", water="Karst aquifer boreholes", manager="MGR-109", gap="N",
         est=2005, template="B", rain=580, climate="central", mgmt=1.05),
    dict(code="GB-HAR-01", name="Hardap Dam Irrigation Farm", region="NA-HA", town="Mariental", lat=-24.55, lon=17.93, elev=1100,
         total_ha=900, cultivated_ha=260, irrigation="Flood (canal)", water="Hardap Dam scheme", manager="MGR-110", gap="N",
         est=2008, template="C", rain=210, climate="south", mgmt=1.00),
    dict(code="GB-KHA-01", name="Aussenkehr Orange River Vineyards", region="NA-KA", town="Aussenkehr", lat=-28.46, lon=17.46, elev=230,
         total_ha=650, cultivated_ha=150, irrigation="Drip", water="Orange River", manager="MGR-111", gap="Y",
         est=2004, template="C", rain=55, climate="south_hot", mgmt=1.04),
    dict(code="GB-KHA-02", name="Noordoewer River Farm", region="NA-KA", town="Noordoewer", lat=-28.75, lon=17.62, elev=180,
         total_ha=400, cultivated_ha=95, irrigation="Drip", water="Orange River", manager="MGR-112", gap="Y",
         est=2013, template="C", rain=60, climate="south_hot", mgmt=0.98),
    dict(code="GB-ERO-01", name="Omaruru River Farm", region="NA-ER", town="Omaruru", lat=-21.43, lon=15.93, elev=1220,
         total_ha=300, cultivated_ha=40, irrigation="Drip", water="Omaruru River aquifer", manager="MGR-113", gap="N",
         est=2015, template="B", rain=290, climate="central", mgmt=0.99),
]
FARM_BY_CODE = {f["code"]: f for f in FARMS}

# SCD history of farm attributes (effective date = first day the new value applies)
FARM_CHANGES = [
    ("GB-OTJ-01", "farm_manager_code", "MGR-104", "MGR-131", date(2022, 3, 1)),
    ("GB-KAE-02", "farm_name", "Ndonga Linena Blok", "Ndonga Linena Block", date(2022, 7, 15)),  # Type 1 correction
    ("GB-KAW-01", "irrigation_type", "Dryland", "Centre pivot", date(2023, 8, 1)),
    ("GB-KAW-01", "cultivated_ha", "600", "450", date(2023, 8, 1)),
    ("GB-KAW-01", "water_source", "Rain-fed", "Kavango River", date(2023, 8, 1)),
    ("GB-HAR-01", "globalgap_certified", "N", "Y", date(2023, 10, 1)),
    ("GB-ZAM-01", "cultivated_ha", "420", "560", date(2024, 4, 1)),
    ("GB-OMS-01", "irrigation_type", "Flood (canal)", "Drip", date(2024, 6, 1)),
    ("GB-OSH-01", "farm_manager_code", "MGR-118", "MGR-152", date(2025, 2, 1)),
]
FARM_DELTA_CHANGES = [  # arrive in the day-2 delta file (after the main extract)
    ("GB-ERO-01", "irrigation_type", "Drip", "Drip + shade-net", date(2026, 10, 1)),
]

# Crop plans: crop, irrigated (True / False / "farm" = follows the farm's SCD irrigation_type),
# ha range per cycle (dry, irrigated) and cycle slots.
PLANS = {
    "GB-ZAM-01": [("MZW", True, (130, 160), ["S"]), ("WHT", True, (80, 100), ["W"]), ("CAB", True, (5, 8), ["1", "2", "3"]), ("TOM", True, (5, 7), ["A", "B"])],
    "GB-KAE-01": [("MZW", True, (150, 190), ["S"]), ("WHT", True, (100, 130), ["W"]), ("POT", True, (15, 25), ["A", "B"]), ("ONI", True, (20, 30), ["S"])],
    "GB-KAE-02": [("MZW", True, (60, 80), ["S"]), ("BUT", True, (10, 15), ["A", "B"]), ("WML", True, (12, 18), ["S"]), ("CAB", True, (5, 8), ["1", "2", "3"])],
    "GB-KAW-01": [("MZW", "farm", (200, 260), ["S"]), ("MAH", False, (80, 120), ["S"]), ("WML", "farm", (8, 12), ["S"])],
    "GB-OMS-01": [("TOM", True, (8, 12), ["A", "B"]), ("ONI", True, (15, 20), ["S"]), ("CAB", True, (6, 10), ["1", "2", "3"]),
                  ("BUT", True, (8, 12), ["A", "B"]), ("WML", True, (10, 15), ["S"]), ("MZW", True, (30, 50), ["S"])],
    "GB-OHA-01": [("MAH", False, (150, 220), ["S"]), ("MZW", False, (80, 120), ["S"])],
    "GB-OSH-01": [("TOM", True, (6, 9), ["A", "B"]), ("CAB", True, (5, 7), ["1", "2", "3"]), ("ONI", True, (8, 12), ["S"])],
    "GB-OSK-01": [("MZW", False, (300, 400), ["S"]), ("WHT", True, (60, 80), ["W"])],
    "GB-OTJ-01": [("MZW", False, (400, 500), ["S"])],
    "GB-OTJ-02": [("MZW", True, (180, 220), ["S"]), ("WHT", True, (150, 180), ["W"]), ("POT", True, (20, 30), ["A", "B"])],
    "GB-HAR-01": [("GRP", True, (40, 45), ["V"]), ("ONI", True, (25, 35), ["S"]), ("BUT", True, (10, 15), ["A", "B"]),
                  ("MZW", True, (40, 60), ["S"]), ("WHT", True, (40, 60), ["W"])],
    "GB-KHA-01": [("GRP", True, (110, 125), ["V"]), ("ONI", True, (10, 15), ["S"])],
    "GB-KHA-02": [("GRP", True, (55, 65), ["V"]), ("ONI", True, (15, 20), ["S"]), ("BUT", True, (8, 12), ["A"])],
    "GB-ERO-01": [("TOM", True, (6, 8), ["A", "B"]), ("ONI", True, (8, 10), ["S"]), ("BUT", True, (6, 8), ["A"]), ("CAB", True, (4, 6), ["1", "3"])],
}

# Planting windows: (crop, slot, irrigated) -> ((m1, d1), (m2, d2), year offset of window end)
# first-harvest delay (days) range; pattern once/multi; capacity ha/day (once) or (duration, interval) (multi)
CALENDAR = {
    ("MZW", "S", True):  dict(win=((11, 15), (12, 15)), delay=(150, 165), pattern="once", cap=25),
    ("MZW", "S", False): dict(win=((11, 25), (12, 31)), delay=(165, 185), pattern="once", cap=25),
    ("WHT", "W", True):  dict(win=((5, 10), (6, 10)), delay=(145, 160), pattern="once", cap=30),
    ("MAH", "S", False): dict(win=((12, 1), (1, 15)), delay=(130, 150), pattern="once", cap=5),
    ("TOM", "A", True):  dict(win=((2, 1), (3, 10)), delay=(75, 90), pattern="multi", dur=(50, 70), every=(2, 3)),
    ("TOM", "B", True):  dict(win=((7, 20), (8, 25)), delay=(75, 90), pattern="multi", dur=(50, 70), every=(2, 3)),
    ("ONI", "S", True):  dict(win=((3, 15), (4, 30)), delay=(140, 160), pattern="once", cap=2.5),
    ("POT", "A", True):  dict(win=((2, 1), (2, 28)), delay=(100, 115), pattern="once", cap=3),
    ("POT", "B", True):  dict(win=((7, 15), (8, 15)), delay=(100, 115), pattern="once", cap=3),
    ("CAB", "1", True):  dict(win=((1, 10), (1, 31)), delay=(80, 95), pattern="multi", dur=(18, 30), every=(3, 5)),
    ("CAB", "2", True):  dict(win=((5, 1), (5, 25)), delay=(80, 95), pattern="multi", dur=(18, 30), every=(3, 5)),
    ("CAB", "3", True):  dict(win=((9, 1), (9, 25)), delay=(80, 95), pattern="multi", dur=(18, 30), every=(3, 5)),
    ("BUT", "A", True):  dict(win=((1, 5), (1, 31)), delay=(95, 110), pattern="once", cap=3),
    ("BUT", "B", True):  dict(win=((9, 10), (10, 10)), delay=(95, 110), pattern="once", cap=3),
    ("WML", "S", True):  dict(win=((9, 10), (10, 15)), delay=(80, 95), pattern="multi", dur=(20, 35), every=(4, 7)),
    ("WML", "S", False): dict(win=((11, 20), (12, 20)), delay=(80, 95), pattern="multi", dur=(20, 35), every=(4, 7)),
    ("GRP", "V", True):  dict(win=((8, 1), (8, 20)), delay=(95, 105), pattern="multi", dur=(35, 55), every=(2, 4)),
}

BASE_YIELD = {  # t/ha
    "MZW_irr": 8.6, "MZW_dry_north": 1.9, "MZW_dry_central": 4.4,
    "WHT": 6.2, "MAH": 1.1, "TOM": 56.0, "ONI": 48.0, "POT": 38.0, "CAB": 55.0, "BUT": 20.0,
    "WML_irr": 32.0, "WML_dry": 16.0, "GRP": 24.0,
}
VEG_IRRIGATION_MULT = {"Drip": 1.0, "Drip + shade-net": 1.22, "Flood (canal)": 0.84, "Centre pivot": 0.92, "Dryland": 0.5}

# Season rainfall factor (national) - synthetic, loosely shaped on the 2023/24 El Nino
# drought and the above-average 2024/25 season reported by MAFWLR/IPC.
SEASON_RAIN_FACTOR = {2020: 1.10, 2021: 1.00, 2022: 0.86, 2023: 0.50, 2024: 1.22, 2025: 0.93, 2026: 1.0}

RAIN_SHARE = {  # monthly share of annual rainfall, Jan..Dec
    "north":     [0.21, 0.23, 0.19, 0.08, 0.015, 0.0, 0.0, 0.0, 0.015, 0.03, 0.08, 0.15],
    "central":   [0.20, 0.24, 0.20, 0.08, 0.02, 0.0, 0.0, 0.0, 0.01, 0.03, 0.08, 0.14],
    "south":     [0.17, 0.22, 0.22, 0.10, 0.03, 0.01, 0.01, 0.01, 0.02, 0.04, 0.07, 0.10],
    "south_hot": [0.14, 0.18, 0.20, 0.12, 0.05, 0.04, 0.04, 0.03, 0.03, 0.04, 0.06, 0.07],
}
TEMP_CLIMATE = {  # (Tmax mean, Tmax amplitude, hottest day-of-year, Tmin mean, Tmin amplitude)
    "north": (31.0, 4.0, 305, 15.0, 7.5),
    "central": (29.5, 5.0, 330, 13.5, 7.5),
    "south": (30.5, 6.5, 15, 14.0, 8.0),
    "south_hot": (32.0, 7.0, 20, 15.5, 7.0),
}


# ----------------------------------------------------------------------------
# Market prices (synthetic stand-in calibrated to approximate published levels)
# ----------------------------------------------------------------------------
ANNUAL_PRICE_ANCHORS = {  # USD per mt (crude: USD/bbl)
    "MAIZE": {2019: 170, 2020: 165, 2021: 259, 2022: 319, 2023: 253, 2024: 191, 2025: 200, 2026: 205, 2027: 207},
    "WHEAT_US_HRW": {2019: 202, 2020: 232, 2021: 315, 2022: 430, 2023: 340, 2024: 271, 2025: 240, 2026: 245, 2027: 248},
    "SORGHUM": {2019: 160, 2020: 170, 2021: 265, 2022: 305, 2023: 245, 2024: 200, 2025: 205, 2026: 210, 2027: 212},
    "UREA": {2019: 245, 2020: 229, 2021: 483, 2022: 700, 2023: 358, 2024: 338, 2025: 400, 2026: 380, 2027: 370},
    "DAP": {2019: 306, 2020: 312, 2021: 601, 2022: 772, 2023: 550, 2024: 570, 2025: 650, 2026: 620, 2027: 600},
    "CRUDE_BRENT": {2019: 64, 2020: 42, 2021: 71, 2022: 99, 2023: 82, 2024: 80, 2025: 69, 2026: 65, 2027: 66},
}
PINK_SHEET_COLUMNS = {  # our series code -> (header text as in the Pink Sheet, unit text)
    "CRUDE_BRENT": ("Crude oil, Brent", "($/bbl)"),
    "MAIZE": ("Maize", "($/mt)"),
    "SORGHUM": ("Sorghum", "($/mt)"),
    "WHEAT_US_HRW": ("Wheat, US HRW", "($/mt)"),
    "DAP": ("DAP", "($/mt)"),
    "UREA": ("Urea ", "($/mt)"),
}
FX_ANCHORS = {
    "DEXSFUS": {2019: 14.45, 2020: 16.46, 2021: 14.79, 2022: 16.36, 2023: 18.45, 2024: 18.33, 2025: 17.90, 2026: 17.25, 2027: 17.2},
    "DEXUSEU": {2019: 1.12, 2020: 1.142, 2021: 1.183, 2022: 1.053, 2023: 1.081, 2024: 1.082, 2025: 1.13, 2026: 1.16, 2027: 1.16},
    "DEXUSUK": {2019: 1.277, 2020: 1.284, 2021: 1.375, 2022: 1.237, 2023: 1.244, 2024: 1.278, 2025: 1.32, 2026: 1.34, 2027: 1.34},
}


def monthly_series(anchors: dict, start: date, end: date, rng, noise_sd: float, shocks: dict | None = None,
                   seasonal: list | None = None) -> pd.Series:
    """Piecewise-linear path through annual means (placed at 1 July) + seasonality + AR(1) noise."""
    months = pd.date_range(start, end, freq="MS")
    xs = np.array([date(y, 7, 1).toordinal() for y in sorted(anchors)])
    ys = np.array([anchors[y] for y in sorted(anchors)], dtype=float)
    base = np.interp([d.toordinal() for d in months.date], xs, ys)
    e = np.zeros(len(months))
    for i in range(1, len(months)):
        e[i] = 0.6 * e[i - 1] + rng.normal(0, noise_sd)
    vals = base * np.exp(e)
    if seasonal:
        vals = vals * np.array([seasonal[d.month - 1] for d in months.date])
    if shocks:
        for (y, m), f in shocks.items():
            idx = [i for i, d in enumerate(months.date) if d.year == y and d.month == m]
            for i in idx:
                vals[i] *= f
    return pd.Series(np.round(vals, 2), index=months.date)


# ----------------------------------------------------------------------------
# Generator
# ----------------------------------------------------------------------------
class Generator:
    def __init__(self, out: Path, seed: int):
        self.out = out
        self.rng = np.random.default_rng(seed)
        self.seed = seed
        self._fx_cache, self._wb_cache = {}, {}
        self.manifest: dict = {"seed": seed, "numpy_version": np.__version__, "pandas_version": pd.__version__,
                               "python_version": platform.python_version(), "business_start": str(BUSINESS_START),
                               "cutoff": str(CUTOFF), "injected_defects": {}, "row_counts": {}, "truth": {}}

    # ---------------------------------------------------------------- utils
    def note(self, key: str, value):
        self.manifest["injected_defects"][key] = value

    def count(self, key: str, value):
        self.manifest["row_counts"][key] = int(value)

    def farm_state(self, farm_code: str, d: date) -> dict:
        """Farm attribute values valid on date d (replays FARM_CHANGES)."""
        f = FARM_BY_CODE[farm_code]
        state = dict(farm_name=f["name"], irrigation_type=f["irrigation"], cultivated_ha=str(f["cultivated_ha"]),
                     water_source=f["water"], farm_manager_code=f["manager"], globalgap_certified=f["gap"])
        for code, attr, _old, new, eff in FARM_CHANGES:
            if code == farm_code and eff <= d:
                state[attr] = new
        return state

    # ------------------------------------------------------------ 1 weather
    def gen_weather(self):
        rng = self.rng
        days = pd.date_range(WEATHER_START, CUTOFF, freq="D")
        dts = days.date
        n = len(days)
        months = days.month.values
        doy = days.dayofyear.values
        sy = np.where(months >= 10, days.year.values, days.year.values - 1)
        self.weather = {}
        region_noise = {(r[0], y): rng.normal(1.0, 0.10) for r in REGIONS for y in SEASON_RAIN_FACTOR}
        for f in FARMS:
            share = np.array(RAIN_SHARE[f["climate"]])
            share = share / share.sum()
            dim = days.days_in_month.values
            mean_daily = f["rain"] * share[months - 1] / dim
            p_wet = np.clip(mean_daily / 9.0, 0.0, 0.55)
            sf = np.array([SEASON_RAIN_FACTOR[y] * region_noise[(f["region"], y)] for y in sy])
            wet = rng.random(n) < p_wet * np.clip(0.55 + 0.45 * sf, 0.3, 1.4)
            amt_mean = np.where(p_wet > 0, mean_daily / np.maximum(p_wet, 1e-6), 0.0)
            amounts = rng.gamma(0.85, np.maximum(amt_mean, 0.01) / 0.85) * np.clip(sf, 0.2, 2.0) ** 0.6
            rain = np.where(wet, amounts, 0.0)
            rain = np.round(np.minimum(rain, 160.0), 2)
            tmx_mean, tmx_amp, hot_doy, tmn_mean, tmn_amp = TEMP_CLIMATE[f["climate"]]
            ar = np.zeros(n)
            for i in range(1, n):
                ar[i] = 0.7 * ar[i - 1] + rng.normal(0, 1.4)
            drought = np.where(sf < 0.7, 1.2, 0.0)
            tmax = tmx_mean + tmx_amp * np.cos(2 * np.pi * (doy - hot_doy) / 365.25) + ar - 2.8 * wet + drought
            tmin = tmn_mean + tmn_amp * np.cos(2 * np.pi * (doy - 20) / 365.25) + 0.5 * ar + 1.0 * wet
            tmin = np.minimum(tmin, tmax - 6.0)
            rh = np.clip(35 + 40 * wet + 25 * share[months - 1] * 4 + rng.normal(0, 6, n), 8, 98)
            sw = np.clip(24 + 4 * np.cos(2 * np.pi * (doy - 350) / 365.25) - 7 * wet + rng.normal(0, 1.5, n), 6, 33)
            self.weather[f["code"]] = pd.DataFrame(
                {"date": dts, "PRECTOTCORR": rain, "T2M_MAX": np.round(tmax, 2), "T2M_MIN": np.round(tmin, 2),
                 "RH2M": np.round(rh, 2), "ALLSKY_SFC_SW_DWN": np.round(sw, 2)}).set_index("date")

    def season_rain_ratio(self, farm_code: str, sy: int) -> float:
        """Nov-Mar rainfall of season sy at the farm relative to its climatological normal."""
        w = self.weather[farm_code]
        f = FARM_BY_CODE[farm_code]
        a, b = date(sy, 11, 1), date(sy + 1, 3, 31)
        obs = w.loc[(w.index >= a) & (w.index <= b), "PRECTOTCORR"].sum()
        share = np.array(RAIN_SHARE[f["climate"]])
        share = share / share.sum()
        normal = f["rain"] * (share[10] + share[11] + share[0] + share[1] + share[2])
        return float(obs / normal) if normal > 0 else 1.0

    def heat_days(self, farm_code: str, a: date, b: date, threshold: float = 35.0) -> int:
        w = self.weather[farm_code]
        sel = w.loc[(w.index >= a) & (w.index <= b), "T2M_MAX"]
        return int((sel >= threshold).sum())

    # ------------------------------------------------------- 2 prices & FX
    def gen_prices(self):
        rng = self.rng
        end = date(2026, 9, 1)
        shocks = {(2022, 3): 1.08, (2022, 4): 1.10, (2022, 5): 1.12, (2022, 6): 1.04}
        self.prices = {}
        self.prices["MAIZE"] = monthly_series(ANNUAL_PRICE_ANCHORS["MAIZE"], PRICE_START, end, rng, 0.025, shocks,
                                              [0.98, 0.99, 1.0, 1.02, 1.04, 1.05, 1.03, 1.0, 0.97, 0.96, 0.97, 0.98])
        self.prices["WHEAT_US_HRW"] = monthly_series(ANNUAL_PRICE_ANCHORS["WHEAT_US_HRW"], PRICE_START, end, rng, 0.03,
                                                     {(2022, 3): 1.18, (2022, 4): 1.15, (2022, 5): 1.20, (2022, 6): 1.05})
        self.prices["SORGHUM"] = monthly_series(ANNUAL_PRICE_ANCHORS["SORGHUM"], PRICE_START, end, rng, 0.025, shocks)
        self.prices["UREA"] = monthly_series(ANNUAL_PRICE_ANCHORS["UREA"], PRICE_START, end, rng, 0.05,
                                             {(2022, 3): 1.25, (2022, 4): 1.30, (2022, 5): 1.10, (2021, 11): 1.25, (2021, 12): 1.2})
        self.prices["DAP"] = monthly_series(ANNUAL_PRICE_ANCHORS["DAP"], PRICE_START, end, rng, 0.04, {(2022, 4): 1.12})
        self.prices["CRUDE_BRENT"] = monthly_series(ANNUAL_PRICE_ANCHORS["CRUDE_BRENT"], PRICE_START, end, rng, 0.05,
                                                    {(2022, 6): 1.15, (2022, 3): 1.12})
        # daily FX (business days) -> monthly averages kept for internal use
        bdays = pd.bdate_range(PRICE_START, CUTOFF)
        self.fx_daily = {}
        for series, anchors in FX_ANCHORS.items():
            xs = np.array([date(y, 7, 1).toordinal() for y in sorted(anchors)])
            ys = np.array([anchors[y] for y in sorted(anchors)], dtype=float)
            base = np.interp([d.toordinal() for d in bdays.date], xs, ys)
            e = np.zeros(len(bdays))
            sd = 0.0045 if series == "DEXSFUS" else 0.0028
            for i in range(1, len(bdays)):
                e[i] = 0.97 * e[i - 1] + rng.normal(0, sd)
            vals = np.round(base * np.exp(e), 4)
            self.fx_daily[series] = pd.Series(vals, index=bdays.date)
        fxm = {}
        for series, s in self.fx_daily.items():
            df = s.to_frame("v")
            df["m"] = [month_start(d) for d in df.index]
            fxm[series] = df.groupby("m")["v"].mean()
        self.fx_month = pd.DataFrame(fxm)  # index: month start
        # NAD per unit of currency (NAD is pegged 1:1 to ZAR)
        self.nad_per = {
            "NAD": pd.Series(1.0, index=self.fx_month.index),
            "ZAR": pd.Series(1.0, index=self.fx_month.index),
            "USD": self.fx_month["DEXSFUS"],
            "EUR": self.fx_month["DEXSFUS"] * self.fx_month["DEXUSEU"],
            "GBP": self.fx_month["DEXSFUS"] * self.fx_month["DEXUSUK"],
        }

    def fx(self, ccy: str, d: date) -> float:
        key = (ccy, d.year, d.month)
        if key not in self._fx_cache:
            self._fx_cache[key] = float(self.nad_per[ccy].loc[month_start(d)])
        return self._fx_cache[key]

    def wb_price(self, series: str, d: date) -> float:
        key = (series, d.year, d.month)
        if key not in self._wb_cache:
            self._wb_cache[key] = float(self.prices[series].loc[month_start(d)])
        return self._wb_cache[key]

    def input_index(self, kind: str, d: date) -> float:
        """Price index for inputs relative to the 2021 average (1.0 = 2021 level)."""
        if kind == "fert":
            u = self.wb_price("UREA", d) / 483 * 0.5 + self.wb_price("DAP", d) / 601 * 0.5
            return 0.55 + 0.45 * u  # local fertiliser prices move less than world prices
        if kind == "fuel":
            return 0.6 + 0.4 * self.wb_price("CRUDE_BRENT", d) / 71
        years = (d - date(2021, 7, 1)).days / 365.25
        if kind == "elec":
            return 1.07 ** years
        if kind == "labour":
            return 1.06 ** years
        return 1.045 ** years  # CPI

    # Local price paths (N$/kg) --------------------------------------------
    def local_grain_price(self, crop: str, d: date) -> float:
        """Producer price N$/kg: import parity from World Bank price x FX + regional drought premium."""
        fx = self.fx("USD", d)
        y, m = d.year, d.month
        if crop == "MZW":
            premium = 0.95
            if (y == 2022) or (y == 2023 and m <= 3):
                premium = 0.92
            elif (y == 2023 and m > 3) or (y == 2024 and m < 3):
                premium = 0.87
            elif (y == 2024 and m >= 3) or (y == 2025 and m <= 3):
                premium = 1.34  # 2023/24 regional drought pushed SAFEX-linked white maize prices up
            elif y == 2025:
                premium = 1.20
            elif y >= 2026:
                premium = 1.12
            return (self.wb_price("MAIZE", d) * fx + 1900 + 30 * (y - 2021)) * premium / 1000
        if crop == "WHT":
            return (self.wb_price("WHEAT_US_HRW", d) * fx + 1500 + 25 * (y - 2021)) / 1000
        if crop == "MAH":
            drought = 1.25 if (y == 2024 or (y == 2025 and m <= 4)) else 1.0
            return (self.wb_price("SORGHUM", d) * fx * 2.6 + 2200) * drought / 1000
        raise ValueError(crop)

    VEG_BASE = {"TOM": 11.0, "ONI": 8.5, "POT": 9.0, "CAB": 2.6, "BUT": 7.0, "WML": 4.6, "GRP": 22.0}
    VEG_SEASONAL = {
        "TOM": [1.25, 1.22, 1.12, 1.0, 0.92, 0.86, 0.85, 0.88, 0.95, 1.02, 1.1, 1.2],
        "ONI": [1.18, 1.2, 1.15, 1.08, 1.02, 0.98, 0.95, 0.9, 0.86, 0.88, 0.92, 1.05],
        "POT": [1.08, 1.06, 1.02, 0.98, 0.95, 0.96, 0.98, 1.0, 1.02, 1.0, 0.98, 1.04],
        "CAB": [1.2, 1.15, 1.05, 0.98, 0.92, 0.9, 0.9, 0.92, 0.96, 1.0, 1.06, 1.15],
        "BUT": [1.05, 1.02, 0.98, 0.95, 0.96, 1.0, 1.02, 1.04, 1.05, 1.02, 1.0, 1.02],
        "WML": [0.92, 0.95, 1.0, 1.08, 1.15, 1.2, 1.2, 1.15, 1.08, 1.0, 0.95, 0.9],
        "GRP": [1.0] * 12,
    }
    CLASS2_FACTOR = 0.64
    CHANNEL_PRICE = {"Miller/Processor": 0.985, "Wholesale": 0.93, "Retail": 1.0, "Informal market": 1.03,
                     "Institutional": 0.97, "Export": 1.0}

    def price_per_kg_nad(self, product: tuple, d: date, channel: str) -> float:
        code, crop = product[0], product[1]
        if crop in ("MZW", "WHT", "MAH"):
            p = self.local_grain_price(crop, d)
            if product[3] in ("WM2", "B3"):
                p *= 0.90 if crop == "MZW" else 0.86
            if product[4] in ("50kg bag", "20kg bag"):
                p = p * 1.18 + 0.35  # bagging & smaller lots
        elif code == "GRP-EXP-C45":
            sy = season_start_year(d)
            eur = {2020: 2.0, 2021: 2.05, 2022: 2.15, 2023: 2.30, 2024: 2.25, 2025: 2.35, 2026: 2.40}[sy]
            p = eur * self.fx("EUR", d)
        else:
            years = (d - date(2021, 7, 1)).days / 365.25
            infl = 1.05 ** years
            if d.year == 2022:
                infl *= 1.06
            if d.year == 2024:
                infl *= 1.04
            p = self.VEG_BASE[crop] * self.VEG_SEASONAL[crop][d.month - 1] * infl
            if product[3] == "Class 2" or code == "WML-C2-BIN":
                p *= self.CLASS2_FACTOR
        return p * self.CHANNEL_PRICE[channel]

    # --------------------------------------------------- 3 customers (S2)
    def gen_customers(self):
        rng = self.rng
        words = ["Etosha", "Namib", "Kalahari", "Omuramba", "Ombili", "Ekuta", "Okavango", "Sossus", "Brandberg",
                 "Waterberg", "Fish River", "Desert Rose", "Camelthorn", "Mopane", "Makalani", "Welwitschia", "Kudu",
                 "Oryx", "Sunrise", "Greenleaf", "Harvest Moon", "Ondjila", "Efundja", "Omake", "Spitzkoppe", "Mukwe"]
        sfx = ["CC", "(Pty) Ltd", "Trading CC", "Investments CC"]
        regions = list(REGION_CUSTOMER_WEIGHT)
        rw = np.array([REGION_CUSTOMER_WEIGHT[r] for r in regions])
        rw = rw / rw.sum()
        used = set()
        customers = []

        def uniq(name):
            base, i = name, 2
            while name in used:
                name = f"{base} {i}"
                i += 1
            used.add(name)
            return name

        def add(channel, ctype, name, region, town, country, ccy, terms, key=False):
            code = f"C{len(customers) + 1:05d}"
            customers.append(dict(customer_code=code, customer_name=name, customer_type=ctype, channel=channel,
                                  town=town, region=region, country_code=country, currency_code=ccy,
                                  credit_terms_days=terms, key_account="Y" if key else "N"))

        def pick_region():
            r = regions[int(rng.choice(len(regions), p=rw))]
            return r, TOWNS[r][int(rng.integers(0, len(TOWNS[r])))]

        miller_regions = ["NA-KH", "NA-KH", "NA-KH", "NA-ON", "NA-OD", "NA-OD", "NA-KE", "NA-CA"]
        for r in miller_regions:
            town = TOWNS[r][0]
            pat = rng.choice(["{t} Roller Mills {s}", "{w} Grain Processors {s}", "{t} Milling Company {s}"])
            name = uniq(pat.format(t=town, w=words[int(rng.integers(0, len(words)))], s=sfx[int(rng.integers(0, 2))]))
            add("Miller/Processor", "Business", name, r, town, "NA", "NAD", 60, key=True)
        for _ in range(30):
            r, town = pick_region()
            pat = rng.choice(["{t} Fresh Produce Wholesalers {s}", "{t} Agri Traders {s}", "{w} Food Distributors {s}",
                              "{t} Bulk Foods {s}", "{w} Wholesale {s}"])
            name = uniq(pat.format(t=town, w=words[int(rng.integers(0, len(words)))], s=sfx[int(rng.integers(0, len(sfx)))]))
            add("Wholesale", "Business", name, r, town, "NA", "NAD", 30)
        for _ in range(72):
            r, town = pick_region()
            pat = rng.choice(["{w} FreshMart {t}", "{t} Family Grocer", "{w} Supermarket {t}", "Corner Fresh {t}",
                              "{w} Food Store {t}", "{t} Mini Market", "{w} Superette {t}"])
            name = uniq(pat.format(t=town, w=words[int(rng.integers(0, len(words)))]))
            add("Retail", "Business", name, r, town, "NA", "NAD", 30)
        inst_types = ["Regional Hospital Kitchen", "School Hostel Kitchen", "Correctional Facility Kitchen", "Training Centre Kitchen"]
        for i in range(14):
            r, town = pick_region()
            name = uniq(f"Institutional - {inst_types[i % 4]} {i + 1:02d} ({town})")
            add("Institutional", "Government institution", name, r, town, "NA", "NAD", 45)
        markets = {"NA-ON": "Oshakati Open Market", "NA-KH": "Soweto Market Windhoek", "NA-OW": "Eenhana Open Market",
                   "NA-OS": "Outapi Open Market", "NA-KE": "Rundu Open Market", "NA-CA": "Katima Mulilo Market",
                   "NA-ER": "Kuisebmond Market Walvis Bay", "NA-OD": "Okahandja Open Market", "NA-OT": "Tsumeb Market",
                   "NA-KA": "Keetmanshoop Market", "NA-HA": "Mariental Market", "NA-KW": "Nkurenkuru Market",
                   "NA-KU": "Opuwo Open Market", "NA-OH": "Gobabis Market"}
        for i in range(104):
            r, town = pick_region()
            name = uniq(f"Informal Trader {r[3:]}-{i + 1:03d} ({markets[r]})")
            add("Informal market", "Informal trader", name, r, town, "NA", "NAD", 0)
        exports = [("Cape Fresh Importers (Pty) Ltd", "Cape Town", "ZA", "ZAR"),
                   ("Highveld Fruit Distributors (Pty) Ltd", "Johannesburg", "ZA", "ZAR"),
                   ("Northern Cape Produce Agents (Pty) Ltd", "Upington", "ZA", "ZAR"),
                   ("Gaborone Produce Importers (Pty) Ltd", "Gaborone", "BW", "USD"),
                   ("Cunene Frescos Importacao Lda", "Ondjiva", "AO", "USD"),
                   ("Lubango Agro Comercio Lda", "Lubango", "AO", "USD"),
                   ("Albion Fresh Imports Ltd", "London", "GB", "GBP"),
                   ("Midlands Fruit Trading Ltd", "Birmingham", "GB", "GBP"),
                   ("Maasvlakte Fruit Import BV", "Rotterdam", "NL", "EUR"),
                   ("Westland Versimport BV", "Barendrecht", "NL", "EUR"),
                   ("Hanse Fruchtimport GmbH", "Hamburg", "DE", "EUR"),
                   ("Gulf Fresh Trading LLC", "Dubai", "AE", "USD")]
        for name, town, ctry, ccy in exports:
            add("Export", "Export", uniq(name), "", town, ctry, ccy, 60, key=True)

        cust = pd.DataFrame(customers)
        n = len(cust)
        # commercial size weight (Pareto) -> a few large accounts
        cust["size_w"] = rng.pareto(1.3, n) + 0.3
        # key accounts: largest wholesale/retail customers
        for ch in ("Wholesale", "Retail"):
            idx = cust.index[cust.channel == ch]
            top = cust.loc[idx].sort_values("size_w", ascending=False).index[:4]
            cust.loc[top, "key_account"] = "Y"
            cust.loc[top, "size_w"] *= 1.5
        # onboarding / churn
        onboard = []
        for i in range(n):
            if rng.random() < 0.16 and cust.loc[i, "channel"] not in ("Miller/Processor",):
                onboard.append(rand_date(rng, date(2021, 6, 1), date(2026, 3, 31)))
            else:
                onboard.append(rand_date(rng, date(2008, 1, 1), date(2021, 3, 31)))
        cust["onboarding_date"] = onboard
        churn = [None] * n
        cand = [i for i in range(n) if cust.loc[i, "channel"] in ("Retail", "Informal market", "Wholesale")]
        for i in rng.choice(cand, size=24, replace=False):
            start = max(cust.loc[i, "onboarding_date"], date(2021, 9, 1))
            if start < date(2026, 3, 1):
                churn[i] = rand_date(rng, start + timedelta(days=120), date(2026, 6, 30))
        cust["churn_date"] = churn
        cust["status"] = ["Inactive" if c is not None else "Active" for c in churn]

        # SCD2 change history for channel / credit terms / key account
        changes = []
        informal = cust.index[cust.channel == "Informal market"].tolist()
        for i in rng.choice(informal, size=12, replace=False):  # traders formalise into small retailers
            eff = rand_date_or_none(rng, max(cust.loc[i, "onboarding_date"], date(2021, 10, 1)) + timedelta(days=60), date(2026, 3, 1))
            if eff is None or (cust.loc[i, "churn_date"] is not None and eff >= cust.loc[i, "churn_date"]):
                continue
            changes.append((cust.loc[i, "customer_code"], "channel", "Informal market", "Retail", eff))
            changes.append((cust.loc[i, "customer_code"], "credit_terms_days", "0", "14", eff))
        retail = cust.index[cust.channel == "Retail"].tolist()
        for i in rng.choice(retail, size=6, replace=False):  # retailers growing into wholesale
            eff = rand_date_or_none(rng, max(cust.loc[i, "onboarding_date"], date(2021, 10, 1)) + timedelta(days=60), date(2026, 3, 1))
            if eff is None or (cust.loc[i, "churn_date"] is not None and eff >= cust.loc[i, "churn_date"]):
                continue
            changes.append((cust.loc[i, "customer_code"], "channel", "Retail", "Wholesale", eff))
        for i in rng.choice(cust.index[cust.channel.isin(["Retail", "Wholesale"])].tolist(), size=14, replace=False):
            eff = rand_date_or_none(rng, max(cust.loc[i, "onboarding_date"], date(2021, 6, 1)) + timedelta(days=30), date(2026, 6, 1))
            if eff is None:
                continue
            changes.append((cust.loc[i, "customer_code"], "credit_terms_days", "30", str(int(rng.choice([7, 14, 45, 60]))), eff))
        for i in rng.choice(cust.index[(cust.channel.isin(["Wholesale", "Retail"])) & (cust.key_account == "N")].tolist(), size=6, replace=False):
            eff = rand_date(rng, max(date(2022, 1, 1), cust.loc[i, "onboarding_date"] + timedelta(days=30)), date(2026, 5, 1)) \
                if cust.loc[i, "onboarding_date"] < date(2026, 3, 1) else None
            if eff is None:
                continue
            changes.append((cust.loc[i, "customer_code"], "key_account", "N", "Y", eff))
            cust.loc[i, "size_w"] *= 1.4
        changes.sort(key=lambda c: (c[0], c[4], c[1]))
        # make sequences consistent (old value = previous new value)
        fixed, last = [], {}
        for code, attr, old, new, eff in changes:
            key = (code, attr)
            row = cust.loc[cust.customer_code == code].iloc[0]
            if key not in last:
                if attr == "credit_terms_days":
                    old = str(row["credit_terms_days"])
                elif attr == "channel":
                    old = row["channel"]
                elif attr == "key_account":
                    old = row["key_account"]
            else:
                old = last[key]
            if old == new:
                continue
            last[key] = new
            fixed.append((code, attr, old, new, eff))
        self.customer_changes = fixed
        self.cust = cust  # values here are the INITIAL values; current values = after changes
        self.count("customers", n)

    def customer_attr(self, i: int, attr: str, d: date):
        code = self.cust.loc[i, "customer_code"]
        val = self.cust.loc[i, attr]
        for c, a, _o, new, eff in self.customer_changes:
            if c == code and a == attr and eff <= d:
                val = new
        return val

    # ------------------------------------------- 4 crop cycles (planting register)
    def irrigated_flag(self, farm_code: str, flag, d: date) -> bool:
        if flag == "farm":
            return self.farm_state(farm_code, d)["irrigation_type"] != "Dryland"
        return bool(flag)

    def base_yield(self, farm_code: str, crop: str, irrigated: bool, state: dict) -> float:
        f = FARM_BY_CODE[farm_code]
        if crop == "MZW":
            if irrigated:
                return BASE_YIELD["MZW_irr"]
            return BASE_YIELD["MZW_dry_central"] if f["climate"] == "central" else BASE_YIELD["MZW_dry_north"]
        if crop == "WML":
            return BASE_YIELD["WML_irr"] * VEG_IRRIGATION_MULT.get(state["irrigation_type"], 1.0) if irrigated else BASE_YIELD["WML_dry"]
        if crop in ("TOM", "ONI", "POT", "CAB", "BUT"):
            irr = state["irrigation_type"] if state["irrigation_type"] != "Dryland" else "Centre pivot"
            return BASE_YIELD[crop] * VEG_IRRIGATION_MULT[irr]
        return BASE_YIELD[crop]

    def mgmt_factor(self, farm_code: str, d: date) -> float:
        f = FARM_BY_CODE[farm_code]
        m = f["mgmt"]
        state = self.farm_state(farm_code, d)
        if farm_code == "GB-OTJ-01" and state["farm_manager_code"] == "MGR-131":
            m = 1.03
        if farm_code == "GB-OSH-01" and state["farm_manager_code"] == "MGR-152":
            m = 1.02
        return m

    def gen_cycles(self):
        rng = self.rng
        cycles, blocks = [], []
        varieties = {"MZW": ["Hybrid WM-A", "Hybrid WM-B", "Hybrid WM-C"], "WHT": ["Spring wheat SW-1", "Spring wheat SW-2"],
                     "MAH": ["Okashana 2", "Kangara"], "TOM": ["Determinate T-1", "Indeterminate T-2"],
                     "ONI": ["Short-day Granex", "Texas Grano"], "POT": ["Mondial", "Sifra"], "CAB": ["Drumhead", "Conquistador"],
                     "BUT": ["Waltham", "Atlas"], "WML": ["Sugar Baby", "Crimson Sweet"],
                     "GRP": ["Crimson Seedless", "Sugraone", "Prime", "Thompson Seedless"]}
        grape_ha = {}
        for farm_code, plan in PLANS.items():
            f = FARM_BY_CODE[farm_code]
            for crop, irr_flag, (ha_lo, ha_hi), slots in plan:
                for slot in slots:
                    for Y in range(2020, 2027):
                        # decide irrigation state at the window start
                        if crop == "MAH":
                            irrigated = False
                        else:
                            probe = date(Y, 11, 15) if slot in ("S",) else date(Y, 6, 1)
                            irrigated = self.irrigated_flag(farm_code, irr_flag, probe)
                        cal = CALENDAR.get((crop, slot, irrigated)) or CALENDAR.get((crop, slot, True))
                        (m1, d1), (m2, d2) = cal["win"]
                        a = date(Y, m1, d1)
                        b = date(Y + (1 if m2 < m1 else 0), m2, d2)
                        planting = rand_date(rng, a, b)
                        if planting > CUTOFF:
                            continue
                        state = self.farm_state(farm_code, planting)
                        irrigated = self.irrigated_flag(farm_code, irr_flag, planting) if crop != "MAH" else False
                        cal = CALENDAR.get((crop, slot, irrigated)) or CALENDAR.get((crop, slot, True))
                        delay = int(rng.integers(cal["delay"][0], cal["delay"][1] + 1))
                        if crop == "GRP" and farm_code == "GB-HAR-01":
                            delay += 25
                        first_harvest = planting + timedelta(days=delay)
                        if first_harvest < BUSINESS_START:
                            continue
                        # area
                        if crop == "GRP":
                            if farm_code not in grape_ha:
                                grape_ha[farm_code] = float(rng.uniform(ha_lo, ha_hi))
                            ha = grape_ha[farm_code] * (1.02 ** (Y - 2021))
                        elif crop == "MZW" and farm_code == "GB-KAW-01" and irrigated:
                            ha = float(rng.uniform(120, 150))
                        elif crop == "MZW" and farm_code == "GB-ZAM-01" and planting >= date(2024, 4, 1):
                            ha = float(rng.uniform(180, 220))
                        else:
                            ha = float(rng.uniform(ha_lo, ha_hi))
                        # yield drivers
                        sy = season_start_year(first_harvest) if crop in ("WHT", "ONI", "POT", "TOM", "CAB", "BUT", "WML", "GRP") else season_start_year(planting)
                        ratio = self.season_rain_ratio(farm_code, season_start_year(planting) if crop in ("MZW", "MAH", "WML") else sy)
                        flower_a = planting + timedelta(days=int(delay * 0.45))
                        flower_b = planting + timedelta(days=int(delay * 0.75))
                        hd = self.heat_days(farm_code, flower_a, min(flower_b, CUTOFF)) if flower_a <= CUTOFF else 0
                        fert_index = float(np.clip(rng.normal(1.0, 0.12), 0.7, 1.3))
                        base = self.base_yield(farm_code, crop, irrigated, state)
                        mg = self.mgmt_factor(farm_code, planting)
                        if not irrigated:
                            f_rain = float(np.clip(0.15 + 0.85 * ratio ** 0.9, 0.1, 1.25))
                        else:
                            f_rain = float(np.clip(1 + 0.04 * (ratio - 1), 0.95, 1.05))
                        heat_sens = 0.007 if crop in ("MZW", "WHT", "MAH") else (0.002 if crop == "GRP" else 0.004)
                        f_heat = max(0.6, 1 - heat_sens * hd)
                        f_fert = 1 + (0.30 if crop in ("MZW", "WHT", "MAH") else 0.20) * (fert_index - 1)
                        cyc_yield = base * mg * f_rain * f_heat * f_fert * float(rng.lognormal(0, 0.06))
                        plan_yield = round(base * mg * float(rng.uniform(0.95, 1.05)), 1)
                        cycle_id = f"{farm_code}/{crop}/{Y}{slot}"
                        cycles.append(dict(cycle_id=cycle_id, farm_code=farm_code, crop=crop, slot=slot, year=Y,
                                           planting_date=planting, first_harvest=first_harvest, irrigated=irrigated,
                                           irrigation_type=state["irrigation_type"], planted_ha=ha, rain_ratio=ratio,
                                           heat_days=hd, fert_index=fert_index, mgmt=mg, yield_t_ha=cyc_yield,
                                           plan_yield=plan_yield, pattern=cal["pattern"], cal=cal,
                                           variety=varieties[crop][int(rng.integers(0, len(varieties[crop])))]))
                        # blocks
                        if crop in ("MZW", "WHT", "MAH"):
                            nb = max(2, math.ceil(ha / 40))
                            prefix = "P" if irrigated else "L"
                        elif crop == "GRP":
                            nb = max(3, math.ceil(ha / 10))
                            prefix = "V"
                        else:
                            nb = int(min(4, max(1, math.ceil(ha / 4))))
                            prefix = "B"
                        shares = rng.dirichlet([6] * nb)
                        slot_no = {"S": 0, "W": 0, "V": 0, "A": 1, "B": 2, "1": 1, "2": 2, "3": 3}[slot]
                        for k in range(nb):
                            bha = ha * float(shares[k])
                            fail = False
                            if not irrigated and ratio < 0.6:
                                fail = rng.random() < 0.25
                                harvested = 0.0 if fail else bha * float(rng.uniform(0.75, 0.95))
                            else:
                                harvested = bha * float(rng.uniform(0.97, 1.0))
                            byield = 0.0 if fail else cyc_yield * float(rng.lognormal(0, 0.05))
                            blocks.append(dict(cycle_id=cycle_id, farm_code=farm_code, crop=crop,
                                               block_id=f"{prefix}{slot_no}{k + 1:02d}" if slot_no else f"{prefix}{k + 1:02d}",
                                               planted_ha=round(bha, 2), harvested_ha=round(harvested, 2), failed=fail,
                                               yield_t_ha=byield, kg_total=byield * harvested * 1000))
        self.cycles = pd.DataFrame(cycles)
        self.blocks = pd.DataFrame(blocks)
        self.count("crop_cycles", len(self.cycles))
        self.count("planting_blocks", len(self.blocks))

    # ------------------------------------------------------ 5 harvest events
    def gen_harvest(self):
        rng = self.rng
        rows, planned = [], {}
        cyc = self.cycles.set_index("cycle_id")
        for b in self.blocks.itertuples(index=False):
            c = cyc.loc[b.cycle_id]
            if b.failed or b.kg_total <= 0:
                continue
            cal = c["cal"]
            # blocks of a cycle are harvested sequentially (once-over) or in parallel (multi-pick)
            idx_in_cycle = int(b.block_id[-2:]) - 1
            if c["pattern"] == "once":
                cap = cal["cap"] * float(rng.uniform(0.8, 1.2))
                ndays = max(1, math.ceil(b.harvested_ha / cap))
                start = c["first_harvest"] + timedelta(days=int(idx_in_cycle * max(1, ndays * 0.8)))
                dates, d = [], next_working_day(start)
                while len(dates) < ndays:
                    dates.append(d)
                    d = next_working_day(d + timedelta(days=1))
                w = rng.dirichlet([8] * ndays)
            else:
                dur = int(rng.integers(cal["dur"][0], cal["dur"][1] + 1))
                start = c["first_harvest"] + timedelta(days=int(rng.integers(0, 4)))
                dates, d = [], next_working_day(start)
                while (d - start).days <= dur:
                    dates.append(d)
                    d = next_working_day(d + timedelta(days=int(rng.integers(cal["every"][0], cal["every"][1] + 1))))
                t = (np.arange(len(dates)) + 0.5) / len(dates)
                w = t ** 1.2 * (1 - t) ** 1.8
                w = w * rng.lognormal(0, 0.15, len(dates))
                w = w / w.sum()
            planned[(b.cycle_id, b.block_id)] = (dates[0], dates[-1])
            for d, wi in zip(dates, w):
                rows.append((b.farm_code, d, b.crop, b.block_id, b.cycle_id, float(b.kg_total * wi)))
        self.blocks["planned_first"] = [planned.get((c, b), (None, None))[0] for c, b in zip(self.blocks.cycle_id, self.blocks.block_id)]
        self.blocks["planned_last"] = [planned.get((c, b), (None, None))[1] for c, b in zip(self.blocks.cycle_id, self.blocks.block_id)]
        h = pd.DataFrame(rows, columns=["farm_code", "harvest_date", "crop", "block_id", "cycle_id", "kg"])
        h = h[h.harvest_date <= CUTOFF].copy()
        h["kg"] = h["kg"].round(1)
        h = h[h.kg > 0]
        self.harvest = h.reset_index(drop=True)
        self.count("harvest_events_clean", len(self.harvest))
        # cycle status as at cutoff
        agg = self.harvest.groupby("cycle_id").agg(first=("harvest_date", "min"), last=("harvest_date", "max"), kg=("kg", "sum"))
        self.cycles = self.cycles.merge(agg, left_on="cycle_id", right_index=True, how="left")

    # ---------------------------------------------------------- 6 costs (S5)
    def gen_costs(self):
        rng = self.rng
        rows = []
        pid = 0
        cyc = self.cycles
        for c in cyc.itertuples(index=False):
            rates = COST_RATES.get((c.crop, bool(c.irrigated))) or COST_RATES.get((c.crop, True))
            ha = c.planted_ha
            # cycle end for cost timing
            end = c.last if isinstance(c.last, date) else c.first_harvest + timedelta(days=30)
            if c.pattern == "multi":
                end = max(end, c.first_harvest + timedelta(days=c.cal["dur"][1]))
            start = c.planting_date - timedelta(days=10)
            span = max(30, (end - start).days)
            for cc, rate in rates.items():
                if cc == "FERT_KG":
                    continue
                amount_total = rate * ha
                if cc == "CC02":
                    amount_total *= c.fert_index
                if cc == "CC07":
                    amount_total *= float(np.clip(1.25 - 0.25 * c.rain_ratio, 0.85, 1.25))  # dry seasons pump more
                if cc == "CC10":
                    amount_total *= float(np.clip((c.yield_t_ha / max(c.plan_yield, 0.1)), 0.3, 1.5))  # packaging follows volume
                if cc == "CC01":
                    times = [c.planting_date + timedelta(days=int(rng.integers(-10, 3)))]
                elif cc == "CC02":
                    times = [c.planting_date + timedelta(days=int(rng.integers(-7, 3))),
                             c.planting_date + timedelta(days=int(rng.integers(25, 60)))]
                    if rng.random() < 0.5:
                        times.append(c.planting_date + timedelta(days=int(rng.integers(60, 90))))
                elif cc == "CC03":
                    times = [c.planting_date + timedelta(days=int(x)) for x in sorted(rng.integers(15, max(16, span - 10), int(rng.integers(3, 6))))]
                elif cc in ("CC04", "CC06", "CC07"):
                    times = []
                    m = month_start(start)
                    while m <= end:
                        times.append(month_end(m))
                        m = add_months(m, 1)
                elif cc == "CC08":
                    times = [start + timedelta(days=int(x)) for x in np.linspace(20, span, max(1, span // 90))]
                elif cc in ("CC09", "CC11"):
                    times = [start + timedelta(days=int(x)) for x in sorted(rng.integers(0, span, int(rng.integers(2, 5))))]
                elif cc == "CC10":
                    times = [c.first_harvest + timedelta(days=int(rng.integers(-14, 10)))]
                    if c.pattern == "multi":
                        times.append(c.first_harvest + timedelta(days=int(c.cal["dur"][0] / 2)))
                else:
                    times = [start]
                if cc in ("CC04",) and c.crop in ("TOM", "GRP", "CAB", "ONI", "POT"):
                    weights = np.array([2.5 if t >= c.first_harvest else 1.0 for t in times])
                else:
                    weights = np.ones(len(times))
                weights = weights * rng.lognormal(0, 0.1, len(times))
                weights = weights / weights.sum()
                for t, wgt in zip(times, weights):
                    if t > CUTOFF or t < date(2020, 10, 1):
                        continue
                    kind = {"CC02": "fert", "CC06": "fuel", "CC07": "elec", "CC04": "labour"}.get(cc, "cpi")
                    amt = amount_total * wgt * self.input_index(kind, t) * float(rng.lognormal(0, 0.04))
                    qty, uom = None, CC_BY_CODE[cc][5]
                    if cc == "CC02":
                        qty = rates["FERT_KG"] * ha * c.fert_index * wgt
                    elif cc == "CC03":
                        qty = amt / (420 * self.input_index("cpi", t))
                    elif cc == "CC04":
                        qty = amt / (28 * self.input_index("labour", t))
                    elif cc == "CC06":
                        qty = amt / (16.5 * self.input_index("fuel", t))
                    elif cc == "CC07":
                        qty = amt / (2.1 * self.input_index("elec", t))
                    elif cc == "CC08":
                        qty = amt / 1.8
                    pid += 1
                    rows.append(dict(posting_id=f"JNL-{t.year}-{pid:07d}", posting_date=t, farm_code=c.farm_code,
                                     cost_centre=c.cycle_id, crop=c.crop, cost_category=cc, amount_nad=round(amt, 2),
                                     input_qty=None if qty is None else round(qty, 1), input_uom=uom if qty is not None else "",
                                     supplier_code=f"SUP-{int(rng.integers(1, 140)):03d}"))
        # monthly farm overheads (not crop specific)
        overhead_base = {"CC05": 95000, "CC12": 42000, "CC13": 18000, "CC14": 21000}
        for f in FARMS:
            scale = (f["cultivated_ha"] / 400) ** 0.6
            m = month_start(BUSINESS_START)
            while m <= CUTOFF:
                for cc, base in overhead_base.items():
                    kind = "labour" if cc == "CC05" else "cpi"
                    amt = base * scale * self.input_index(kind, m) * float(rng.lognormal(0, 0.05))
                    pid += 1
                    rows.append(dict(posting_id=f"JNL-{m.year}-{pid:07d}", posting_date=month_end(m), farm_code=f["code"],
                                     cost_centre=f"{f['code']}/OVERHEAD", crop="", cost_category=cc, amount_nad=round(amt, 2),
                                     input_qty=None, input_uom="", supplier_code="" if cc in ("CC05", "CC12") else f"SUP-{int(rng.integers(1, 140)):03d}"))
                m = add_months(m, 1)
        costs = pd.DataFrame(rows)
        costs = costs[costs.posting_date >= BUSINESS_START].reset_index(drop=True)
        self.costs = costs
        self.count("cost_postings_clean", len(costs))
        # actual cost per kg by crop & harvest season (completed cycles) -> standard costs
        cc_cycle = costs[costs.crop != ""].groupby("cost_centre")["amount_nad"].sum()
        cyc = self.cycles.copy()
        cyc["cost"] = cyc.cycle_id.map(cc_cycle).fillna(0)
        cyc = cyc[cyc["kg"].fillna(0) > 0]
        cyc["season"] = [season_start_year(d) for d in cyc["first"]]
        cpk = cyc.groupby(["crop", "season"]).apply(lambda g: g.cost.sum() / g.kg.sum(), include_groups=False)
        self.cost_per_kg = cpk.to_dict()

    def std_cost_per_kg(self, crop: str, d: date) -> float:
        fy = fiscal_year(d)
        # standard set at the start of each FY from the previous season's actuals (+4% inflation)
        for sy in (fy - 2, fy - 1, fy - 3, fy):
            v = self.cost_per_kg.get((crop, sy))
            if v and np.isfinite(v):
                return round(float(v) * 1.04, 2)
        return {"MZW": 3.2, "WHT": 4.0, "MAH": 6.0}.get(crop, 3.0)

    # --------------------------------------------- 7 stock flows & sales (S3, S4)
    CHANNEL_MIX = {
        "grain_bulk": {"Miller/Processor": 0.85, "Wholesale": 0.15},
        "grain_bag": {"Wholesale": 0.45, "Retail": 0.25, "Informal market": 0.18, "Institutional": 0.12},
        "veg_c1": {"Retail": 0.46, "Wholesale": 0.28, "Informal market": 0.14, "Institutional": 0.08, "Export": 0.04},
        "veg_c2": {"Informal market": 0.50, "Wholesale": 0.35, "Institutional": 0.15},
        "fruit_export": {"Export": 1.0},
        "fruit_local": {"Retail": 0.60, "Wholesale": 0.40},
        "melon": {"Retail": 0.30, "Wholesale": 0.30, "Informal market": 0.40},
    }
    LINE_KG = {  # (product class, channel) -> mean kg per invoice line
        ("grain_bulk", "Miller/Processor"): 30000, ("grain_bulk", "Wholesale"): 14000,
        ("grain_bag", "Wholesale"): 3200, ("grain_bag", "Retail"): 700, ("grain_bag", "Informal market"): 220,
        ("grain_bag", "Institutional"): 1200,
        ("veg_c1", "Retail"): 380, ("veg_c1", "Wholesale"): 1900, ("veg_c1", "Informal market"): 110,
        ("veg_c1", "Institutional"): 560, ("veg_c1", "Export"): 16000,
        ("veg_c2", "Informal market"): 140, ("veg_c2", "Wholesale"): 1700, ("veg_c2", "Institutional"): 650,
        ("fruit_export", "Export"): 18900, ("fruit_local", "Retail"): 260, ("fruit_local", "Wholesale"): 1100,
        ("melon", "Retail"): 520, ("melon", "Wholesale"): 2300, ("melon", "Informal market"): 230,
    }
    EXPORT_DEST = {"GRP": {"ZA": 0.15, "GB": 0.30, "NL": 0.30, "DE": 0.10, "AE": 0.15},
                   "VEG": {"AO": 0.60, "BW": 0.30, "ZA": 0.10}}

    def gen_stock_and_sales(self):
        rng = self.rng
        cust = self.cust
        months = []
        m = month_start(BUSINESS_START)
        while m <= CUTOFF:
            months.append(m)
            m = add_months(m, 1)
        # harvest kg by farm-crop-month
        h = self.harvest.copy()
        h["month"] = [month_start(d) for d in h.harvest_date]
        hm = h.groupby(["farm_code", "crop", "month"])["kg"].sum().to_dict()
        # customer static arrays
        cust_region = cust["region"].tolist()
        cust_zone = [ZONE_OF_REGION.get(r, "EX") for r in cust_region]
        cust_country = cust["country_code"].tolist()
        size_w = cust["size_w"].to_numpy()
        onboard = cust["onboarding_date"].tolist()
        churn = cust["churn_date"].tolist()
        changed = defaultdict(list)
        for c, a, _o, new, eff in self.customer_changes:
            changed[c].append((a, new, eff))
        codes = cust["customer_code"].tolist()

        def channel_at(i, d):
            ch = cust.at[i, "channel"]
            for a, new, eff in changed.get(codes[i], []):
                if a == "channel" and eff <= d:
                    ch = new
            return ch

        def key_at(i, d):
            k = cust.at[i, "key_account"]
            for a, new, eff in changed.get(codes[i], []):
                if a == "key_account" and eff <= d:
                    k = new
            return k

        lines = []      # sales lines (truth)
        stock_rows = []
        opening = defaultdict(float)
        # carry-over grain stocks from the 2020 harvest at 1 April 2021
        for farm_code, plan in PLANS.items():
            for crop, *_ in plan:
                if crop in ("MZW", "WHT"):
                    exp = self.cycles[(self.cycles.farm_code == farm_code) & (self.cycles.crop == crop)]
                    if len(exp):
                        typical = float((exp.planted_ha * exp.yield_t_ha).median()) * 1000
                        frac = 0.18 if crop == "MZW" else 0.35
                        for p in PRODUCTS_OF_CROP[crop]:
                            opening[(farm_code, p[0])] = round(typical * frac * p[7], 1)
        line_id = 0
        for mth in months:
            mid = mth + timedelta(days=14)
            m_end = month_end(mth)
            # active customers by channel for this month
            active = defaultdict(list)
            for i in range(len(codes)):
                if onboard[i] > m_end:
                    continue
                if churn[i] is not None and churn[i] <= mth:
                    continue
                active[channel_at(i, mid)].append(i)
            work_days = [d for d in daterange(mth, m_end) if d.weekday() != 6]
            for farm_code, plan in PLANS.items():
                fstate = self.farm_state(farm_code, mid)
                certified = fstate["globalgap_certified"] == "Y"
                f_region = FARM_BY_CODE[farm_code]["region"]
                f_zone = ZONE_OF_REGION[f_region]
                for crop in sorted({p[0] for p in plan}):
                    harvest_kg = hm.get((farm_code, crop, mth), 0.0)
                    net = harvest_kg * (1 - CROPS[crop]["cull"])
                    prods = PRODUCTS_OF_CROP[crop]
                    shares = {p[0]: p[7] for p in prods}
                    if crop == "GRP" and not certified:
                        shares = {"GRP-EXP-C45": 0.0, "GRP-LOC-B05": 1.0}
                    for p in prods:
                        pcode, pclass = p[0], p[8]
                        received = round(net * shares[pcode], 1)
                        op = opening[(farm_code, pcode)]
                        avail = op + received
                        if avail <= 0.5 and op <= 0:
                            continue
                        # dispatch & shrinkage policy
                        if crop in ("MZW", "WHT"):
                            frac = 0.20 + (0.08 if mth.month in (1, 2, 3) else 0.0) + float(rng.normal(0, 0.03))
                            shrink_rate = 0.003
                        elif crop == "MAH":
                            frac, shrink_rate = 0.30 + float(rng.normal(0, 0.04)), 0.004
                        elif crop in ("ONI", "POT", "BUT"):
                            frac, shrink_rate = 0.62 + float(rng.normal(0, 0.05)), 0.025
                        elif crop == "GRP":
                            frac, shrink_rate = 0.97, 0.02
                        else:
                            frac = 0.91 + float(rng.normal(0, 0.02))
                            shrink_rate = 0.06 + (0.02 if mth.month in (11, 12, 1, 2) else 0.0)
                        frac = float(np.clip(frac, 0.05, 0.99))
                        target = avail * frac
                        shrink = round(avail * shrink_rate, 1)
                        if target < 30:
                            target = 0.0
                        dispatched = 0.0
                        if target > 0:
                            mix = dict(self.CHANNEL_MIX[pclass])
                            if pclass == "veg_c1" and crop not in ("ONI", "POT"):
                                mix.pop("Export", None)
                            tot = sum(mix.values())
                            for ch, wch in mix.items():
                                ch_kg = target * wch / tot * float(rng.lognormal(0, 0.08))
                                pool = active.get(ch, [])
                                if ch == "Export":
                                    dest = self.EXPORT_DEST["GRP" if crop == "GRP" else "VEG"]
                                    pool = [i for i in pool if cust_country[i] in dest]
                                if not pool or ch_kg < 20:
                                    continue
                                pool = np.array(pool)
                                wts = size_w[pool].copy()
                                for j, i in enumerate(pool):
                                    if ch == "Export":
                                        dest = self.EXPORT_DEST["GRP" if crop == "GRP" else "VEG"]
                                        wts[j] *= dest[cust_country[i]] / max(1, sum(1 for k in pool if cust_country[k] == cust_country[i]))
                                    elif cust_region[i] == f_region:
                                        wts[j] *= 3.0
                                    elif cust_zone[i] == f_zone:
                                        wts[j] *= 2.0
                                    elif cust_region[i] == "NA-KH":
                                        wts[j] *= 1.5
                                wts = wts / wts.sum()
                                mean_kg = self.LINE_KG[(pclass, ch)]
                                remaining = ch_kg
                                while remaining > 1:
                                    kg = min(remaining, float(rng.lognormal(math.log(mean_kg), 0.45)))
                                    if remaining - kg < mean_kg * 0.15:
                                        kg = remaining
                                    kgu = p[6]
                                    if p[5] == "t":
                                        qty = round(kg / 1000.0, 3)
                                        kg_line = qty * 1000.0
                                    else:
                                        qty = max(1, int(round(kg / kgu)))
                                        kg_line = qty * kgu
                                    if dispatched + kg_line > avail - shrink:
                                        break
                                    remaining -= kg
                                    ci = int(rng.choice(pool, p=wts))
                                    d = work_days[int(rng.integers(0, len(work_days)))]
                                    line_id += 1
                                    lines.append((line_id, d, ci, farm_code, pcode, ch, qty, kg_line))
                                    dispatched += kg_line
                        closing = round(avail - dispatched - shrink, 1)
                        if closing < 0:
                            shrink = round(max(0.0, shrink + closing), 1)
                            closing = 0.0
                        stock_rows.append(dict(farm_code=farm_code, product_code=pcode, period=mth, opening_kg=round(op, 1),
                                               received_kg=received, dispatched_kg=round(dispatched, 1),
                                               shrinkage_kg=shrink, closing_kg=closing))
                        opening[(farm_code, pcode)] = closing
        self.stock = pd.DataFrame(stock_rows)
        self.count("stock_rows_clean", len(self.stock))

        # ---- price, discount, cost, freight, currency for each line
        L = pd.DataFrame(lines, columns=["line_id", "dispatch_date", "cust_idx", "farm_code", "product_code", "channel", "qty", "kg"])
        recs = []
        for r in L.itertuples(index=False):
            p = PRODUCT_BY_CODE[r.product_code]
            i = r.cust_idx
            d = r.dispatch_date
            ccy = cust.at[i, "currency_code"]
            p_kg = self.price_per_kg_nad(p, d, r.channel)
            if key_at(i, d) == "Y":
                p_kg *= 0.985
            p_kg *= float(rng.lognormal(0, 0.03))
            unit_price_nad = p_kg * p[6]
            unit_price = unit_price_nad / self.fx(ccy, d)
            disc = 0.0
            if r.channel in ("Miller/Processor", "Wholesale") and rng.random() < 0.3:
                disc = float(rng.choice([2.0, 2.5, 3.0, 5.0]))
            elif key_at(i, d) == "Y" and r.channel != "Export":
                disc = 3.0
            if r.channel == "Export":
                fr = 0.95
            elif cust_region[i] == FARM_BY_CODE[r.farm_code]["region"]:
                fr = 0.12
            elif cust_zone[i] == ZONE_OF_REGION[FARM_BY_CODE[r.farm_code]["region"]]:
                fr = 0.22
            else:
                fr = 0.45
            freight = r.kg * fr * self.input_index("fuel", d) * float(rng.lognormal(0, 0.05))
            std = self.std_cost_per_kg(p[1], d) * p[6]
            recs.append((round(unit_price, 2), ccy, disc, round(std, 2), round(freight, 2)))
        L[["unit_price", "currency_code", "discount_pct", "unit_std_cost_nad", "freight_nad"]] = pd.DataFrame(recs, index=L.index)
        L["customer_code"] = [codes[i] for i in L.cust_idx]
        # invoice date: normally = dispatch date; month-end cut-off -> next working day (next month)
        inv_dates, cutoff_shift = [], 0
        for d in L.dispatch_date:
            if d >= month_end(d) - timedelta(days=1) and rng.random() < 0.35:
                nd = next_working_day(d + timedelta(days=(month_end(d) - d).days + 1))
                inv_dates.append(nd)
                cutoff_shift += 1
            else:
                inv_dates.append(d)
        L["invoice_date"] = inv_dates
        L = L[L.invoice_date <= CUTOFF].copy()  # lines invoiced after the extract date are not in the ERP yet
        self.note("sales_cutoff_shifted_lines", int(sum(1 for a, b in zip(L.dispatch_date, L.invoice_date) if a != b)))
        # sales reps (pseudonymised) by farm zone x channel
        rep_map, zones, chans = {}, ["NC", "NE", "CE", "SO", "NW"], list(self.CHANNEL_PRICE)
        for zi, z in enumerate(zones):
            for ci, ch in enumerate(chans):
                rep_map[(z, ch)] = f"SR-{(zi * 7 + ci * 3) % 12 + 1:02d}"
        L["sales_rep_code"] = [rep_map[(ZONE_OF_REGION[FARM_BY_CODE[f]['region']], ch)] for f, ch in zip(L.farm_code, L.channel)]
        # invoice numbering: group by (invoice_date, customer, farm)
        L = L.sort_values(["invoice_date", "customer_code", "farm_code", "product_code"]).reset_index(drop=True)
        L["fy"] = [fiscal_year(d) for d in L.invoice_date]
        inv_key = list(zip(L.invoice_date, L.customer_code, L.farm_code))
        inv_no, line_no, seq, cur, ln = [], [], defaultdict(int), None, 0
        for k, fy in zip(inv_key, L.fy):
            if k != cur:
                seq[fy] += 1
                cur, ln = k, 0
            ln += 1
            inv_no.append(f"INV{fy}-{seq[fy]:06d}")
            line_no.append(ln)
        L["invoice_no"] = inv_no
        L["line_no"] = line_no
        L["doc_type"] = "INV"
        L["ref_invoice_no"] = ""
        # credit notes (quality claims) ~0.6% of perishable lines
        cand = L[L.product_code.str[:3].isin(["TOM", "CAB", "GRP", "WML", "POT"])].sample(frac=0.0075, random_state=int(rng.integers(0, 1e9)))
        crn = cand.copy()
        crn["invoice_date"] = [next_working_day(d + timedelta(days=int(rng.integers(1, 8)))) for d in crn.invoice_date]
        crn = crn[crn.invoice_date <= CUTOFF].copy()
        frac = rng.uniform(0.05, 1.0, len(crn))
        crn["qty"] = [-(round(q * f_, 3) if PRODUCT_BY_CODE[p][5] == "t" else max(1, int(round(q * f_))))
                      for q, f_, p in zip(crn.qty, frac, crn.product_code)]
        crn["kg"] = [q * (1000 if PRODUCT_BY_CODE[p][5] == "t" else PRODUCT_BY_CODE[p][6]) for q, p in zip(crn.qty, crn.product_code)]
        crn["freight_nad"] = 0.0
        crn["discount_pct"] = 0.0
        crn["ref_invoice_no"] = crn["invoice_no"]
        crn["doc_type"] = "CRN"
        crn["fy"] = [fiscal_year(d) for d in crn.invoice_date]
        crn = crn.sort_values("invoice_date")
        cseq = defaultdict(int)
        nos = []
        for fy in crn.fy:
            cseq[fy] += 1
            nos.append(f"CRN{fy}-{cseq[fy]:06d}")
        crn["invoice_no"] = nos
        crn["line_no"] = 1
        self.sales = pd.concat([L, crn], ignore_index=True).sort_values(["invoice_date", "invoice_no", "line_no"]).reset_index(drop=True)
        self.count("sales_lines_clean", len(self.sales))
        self.count("sales_credit_note_lines", len(crn))

    # ----------------------------------------------- 8 NSA crop estimates (S9)
    def gen_crop_estimates(self):
        rng = self.rng
        h = self.harvest.copy()
        h["season"] = [season_start_year(d) for d in h.harvest_date]
        h["region"] = h.farm_code.map(lambda c: FARM_BY_CODE[c]["region"])
        gb = h.groupby(["region", "crop", "season"])["kg"].sum() / 1000
        cyc = self.cycles.dropna(subset=["first"]).copy()
        cyc["season"] = [season_start_year(d) for d in cyc["first"]]
        cyc["region"] = cyc.farm_code.map(lambda c: FARM_BY_CODE[c]["region"])
        gb_ha = cyc.groupby(["region", "crop", "season"])["planted_ha"].sum()
        rows = []
        mult = {}
        for (region, crop, season), prod_t in gb.items():
            if season < 2020 or season > 2025:
                continue
            k = mult.setdefault((region, crop), float(rng.uniform(1.8, 5.0)))
            m_ = k * float(rng.uniform(0.9, 1.1))
            area = float(gb_ha.get((region, crop, season), 0)) * m_ * float(rng.uniform(0.9, 1.1))
            prod = prod_t * m_
            rows.append((season, region, crop, "Commercial", area, prod))
        communal = {("NA-OW", "MAH"): 60000, ("NA-OS", "MAH"): 55000, ("NA-ON", "MAH"): 20000, ("NA-OT", "MAH"): 40000,
                    ("NA-KE", "MAH"): 25000, ("NA-KW", "MAH"): 30000, ("NA-CA", "MAH"): 12000, ("NA-KU", "MAH"): 5000,
                    ("NA-CA", "MZW"): 22000, ("NA-KE", "MZW"): 15000, ("NA-KW", "MZW"): 12000, ("NA-OW", "MZW"): 6000,
                    ("NA-OS", "MZW"): 4000, ("NA-OT", "MZW"): 5000}
        for (region, crop), area0 in communal.items():
            for season in range(2020, 2026):
                sf = SEASON_RAIN_FACTOR[season] * float(rng.normal(1, 0.08))
                area = area0 * (0.8 + 0.2 * min(sf, 1.2)) * float(rng.uniform(0.92, 1.08))
                y0 = 0.36 if crop == "MAH" else 0.55
                yld = y0 * float(np.clip(0.15 + 0.85 * sf ** 0.9, 0.1, 1.3)) * float(rng.lognormal(0, 0.05))
                rows.append((season, region, crop, "Communal", area, area * yld))
        for region in ("NA-OW", "NA-OS", "NA-KE", "NA-CA"):  # sorghum: not grown by Green Basket (unmapped crop)
            for season in range(2020, 2026):
                area = float(rng.uniform(1500, 6000))
                rows.append((season, region, "SORGHUM", "Communal", area, area * 0.3 * SEASON_RAIN_FACTOR[season]))
        est = pd.DataFrame(rows, columns=["season", "region", "crop", "sector", "area_ha", "production_t"])
        est["yield"] = est.production_t / est.area_ha.replace(0, np.nan)
        self.crop_est = est
        self.count("crop_estimate_rows", len(est))

    # ------------------------------------------------------------- writers
    def write_all(self):
        rng = self.rng
        out = self.out
        for sub in ["internal/farm_logs", "internal/master_data", "internal/erp", "internal/stock", "internal/finance",
                    "external/nasa_power", "external/world_bank", "external/fred", "external/nsa"]:
            (out / sub).mkdir(parents=True, exist_ok=True)
        self.write_master_data(out / "internal/master_data")
        self.write_planting_register(out / "internal/farm_logs")
        self.write_harvest_logs(out / "internal/farm_logs")
        self.write_sales(out / "internal/erp")
        self.write_stock(out / "internal/stock")
        self.write_costs(out / "internal/finance")
        self.write_weather(out / "external/nasa_power")
        self.write_pink_sheet(out / "external/world_bank")
        self.write_fred(out / "external/fred")
        self.write_crop_estimates(out / "external/nsa")
        # ground truth used only to validate the pipeline (never loaded as a source)
        truth = self.manifest["truth"]
        truth["harvest_kg_total"] = round(float(self.harvest.kg.sum()), 1)
        truth["sales_lines"] = int(len(self.sales))
        truth["sales_net_revenue_nad_approx"] = None
        truth["cost_amount_nad_total"] = round(float(self.costs.amount_nad.sum()), 2)
        truth["cycles"] = int(len(self.cycles))
        truth["season_rain_factor"] = {season_label(k): v for k, v in SEASON_RAIN_FACTOR.items()}
        truth["yield_model"] = ("yield = base(crop, irrigation) x mgmt(farm, manager) x f_rain(dryland only) x "
                                "f_heat(days Tmax>=35C in flowering window) x f_fert(fertiliser index) x lognormal noise")
        with open(out / "generator_manifest.json", "w") as fh:
            json.dump(self.manifest, fh, indent=2, default=str)

    def write_master_data(self, d: Path):
        rng = self.rng
        # Regions sheet
        regions = pd.DataFrame([dict(region_code=r[0], region_name=r[1], zone_code=r[2], zone_name=r[3], capital_town=r[4],
                                     known_aliases="; ".join(r[5])) for r in REGIONS])
        cats = pd.DataFrame([dict(category_code=k, category_name=v[0], sector=v[1]) for k, v in CATEGORIES.items()])
        crops = pd.DataFrame([dict(crop_code=k, crop_name=v["name"], category_code=v["cat"], scientific_name=v["sci"],
                                   nab_controlled=v["nab"], storage_type=v["storage"], shelf_life_days=v["shelf"],
                                   typical_cull_pct=v["cull"] * 100) for k, v in CROPS.items()])
        prods = pd.DataFrame([dict(product_code=p[0], product_name=p[2], crop_code=p[1], grade=p[3], pack_type=p[4],
                                   sales_uom=p[5], net_weight_kg=p[6], is_export_grade="Y" if p[3] == "Export" else "N",
                                   active="Y") for p in PRODUCTS])
        prods.loc[prods.product_code == "BUT-C2-BIN", "net_weight_kg"] = None  # DQ: missing weight
        self.note("master_product_missing_weight", 1)
        # Farms: CURRENT snapshot (as at 30 Sep 2026) + full change history
        farms = []
        for f in FARMS:
            st = self.farm_state(f["code"], CUTOFF)
            region_name = REGION_BY_CODE[f["region"]][1]
            farms.append(dict(farm_code=f["code"], farm_name=st["farm_name"], region=region_name, town=f["town"],
                              latitude=f["lat"], longitude=f["lon"], elevation_m=f["elev"], total_ha=f["total_ha"],
                              cultivated_ha=int(st["cultivated_ha"]), irrigation_type=st["irrigation_type"],
                              water_source=st["water_source"], farm_manager_code=st["farm_manager_code"],
                              globalgap_certified=st["globalgap_certified"], established_year=f["est"],
                              harvest_log_template=f["template"]))
        farms = pd.DataFrame(farms)
        # DQ: region spelling variants in master
        variants = {"Kavango East": "Kavango-East", "//Kharas": "Karas", "Zambezi": "Zambezi (Caprivi)"}
        n_var = 0
        for i in farms.index:
            if farms.at[i, "region"] in variants and rng.random() < 0.7:
                farms.at[i, "region"] = variants[farms.at[i, "region"]]
                n_var += 1
        self.note("master_farm_region_spelling_variants", n_var)
        farm_hist = pd.DataFrame([dict(change_id=i + 1, farm_code=c, attribute=a, old_value=o, new_value=n,
                                       effective_date=e, approved_by_role="Agricultural Operations Manager")
                                  for i, (c, a, o, n, e) in enumerate(FARM_CHANGES)])
        # Customers: CURRENT snapshot
        cust = self.cust.copy()
        cur = []
        for i in cust.index:
            row = cust.loc[i]
            region_name = REGION_BY_CODE[row.region][1] if row.region else ""
            cur.append(dict(customer_code=row.customer_code, customer_name=row.customer_name, customer_type=row.customer_type,
                            channel=self.customer_attr(i, "channel", CUTOFF), town=row.town, region=region_name,
                            country_code=row.country_code, currency_code=row.currency_code,
                            credit_terms_days=int(self.customer_attr(i, "credit_terms_days", CUTOFF)),
                            key_account=self.customer_attr(i, "key_account", CUTOFF),
                            onboarding_date=row.onboarding_date, status=row.status))
        cur = pd.DataFrame(cur)
        # DQ: casing / whitespace issues in names (Type 1 clean-up), region spelling variants, 2 missing regions
        idx = rng.choice(cur.index[cur.customer_type == "Business"], size=9, replace=False)
        for k, i in enumerate(idx):
            cur.at[i, "customer_name"] = (cur.at[i, "customer_name"].upper() if k % 2 == 0 else "  " + cur.at[i, "customer_name"] + " ")
        self.note("master_customer_name_format_issues", len(idx))
        nv = 0
        for i in cur.index:
            rn = cur.at[i, "region"]
            for r in REGIONS:
                if rn == r[1] and rng.random() < 0.08:
                    cur.at[i, "region"] = r[5][int(rng.integers(0, len(r[5])))]
                    nv += 1
        self.note("master_customer_region_spelling_variants", nv)
        miss = rng.choice(cur.index[cur.customer_type == "Informal trader"], size=2, replace=False)
        cur.loc[miss, "region"] = ""
        self.note("master_customer_missing_region", 2)
        # DQ: duplicate customer records (same business, second code) - steward-approved merge list
        dup_rows, merges = [], []
        dup_src = rng.choice(cur.index[cur.channel.isin(["Wholesale", "Retail"])], size=3, replace=False)
        self.dup_map = {}
        for k, i in enumerate(dup_src):
            new_code = f"C{len(cur) + len(dup_rows) + 1:05d}"
            r = cur.loc[i].to_dict()
            r["customer_code"] = new_code
            r["customer_name"] = r["customer_name"].upper().replace("(PTY) LTD", "PTY LTD").strip()
            r["onboarding_date"] = date(2022, 3 + 2 * k, 1)
            dup_rows.append(r)
            merges.append(dict(duplicate_code=new_code, survivor_code=cur.at[i, "customer_code"],
                               merge_date=date(2023, 3 + k, 1), reason="Duplicate account created at branch level"))
            self.dup_map[cur.at[i, "customer_code"]] = (new_code, date(2022, 3 + 2 * k, 1), date(2023, 3 + k, 1))
        cur = pd.concat([cur, pd.DataFrame(dup_rows)], ignore_index=True)
        self.note("master_duplicate_customers", len(dup_rows))
        cust_hist = pd.DataFrame([dict(change_id=i + 1, customer_code=c, attribute=a, old_value=o, new_value=n, effective_date=e,
                                       approved_by_role="Credit Controller" if a == "credit_terms_days" else "Sales Manager")
                                  for i, (c, a, o, n, e) in enumerate(self.customer_changes)])
        # Late-arriving customers: 5 codes used by the ERP but missing from the main master extract
        n_lines = self.sales.groupby("customer_code").size()
        recent = cur.index[(cur.customer_type.isin(["Business", "Informal trader"])) &
                           (pd.to_datetime(cur.onboarding_date) >= pd.Timestamp("2025-01-01")) &
                           (cur.customer_code.map(n_lines).fillna(0) >= 5)]
        if len(recent) < 5:
            recent = cur.index[(cur.customer_code.map(n_lines).fillna(0) >= 5) & (cur.customer_type == "Informal trader")]
        late = rng.choice(recent, size=5, replace=False)
        late_rows = cur.loc[late].copy()
        cur = cur.drop(index=late).reset_index(drop=True)
        self.late_customers = late_rows.customer_code.tolist()
        self.note("late_arriving_customers", self.late_customers)
        cost_cats = pd.DataFrame([dict(cost_category_code=c[0], cost_category_name=c[1], cost_group=c[2], cost_behaviour=c[3],
                                       gl_account=c[4], quantity_uom=c[5], ledger_aliases="; ".join(c[6])) for c in COST_CATEGORIES])
        with pd.ExcelWriter(d / "GB_Master_Data.xlsx", engine="openpyxl") as xw:
            pd.DataFrame({"README": [
                "Green Basket cc - Agriculture Division master data extract (FICTITIOUS company; synthetic data).",
                f"Extract date: {CUTOFF}. Farms/Customers sheets hold CURRENT values; *_History sheets hold attribute changes.",
                "Natural persons are pseudonymised at source: informal traders, managers, clerks and sales reps carry codes only.",
            ]}).to_excel(xw, sheet_name="README", index=False)
            regions.to_excel(xw, sheet_name="Regions", index=False)
            cats.to_excel(xw, sheet_name="Crop_Categories", index=False)
            crops.to_excel(xw, sheet_name="Crops", index=False)
            prods.to_excel(xw, sheet_name="Products", index=False)
            farms.to_excel(xw, sheet_name="Farms", index=False)
            farm_hist.to_excel(xw, sheet_name="Farm_History", index=False)
            cur.to_excel(xw, sheet_name="Customers", index=False)
            cust_hist.to_excel(xw, sheet_name="Customer_History", index=False)
            pd.DataFrame(merges).to_excel(xw, sheet_name="Customer_Merge", index=False)
            cost_cats.to_excel(xw, sheet_name="Cost_Categories", index=False)
        # Day-2 delta: the 5 late customers + 3 attribute changes + 1 farm change (effective 1 Oct 2026)
        delta_cust = late_rows.copy()
        delta_changes = []
        ch_idx = rng.choice(cur.index[cur.channel.isin(["Retail", "Informal market"]) & (cur.status == "Active")], size=3, replace=False)
        for i in ch_idx:
            old = cur.at[i, "channel"]
            new = "Wholesale" if old == "Retail" else "Retail"
            delta_changes.append(dict(customer_code=cur.at[i, "customer_code"], attribute="channel", old_value=old,
                                      new_value=new, effective_date=date(2026, 10, 1)))
        with pd.ExcelWriter(d / "master_data_delta_2026-10-05.xlsx", engine="openpyxl") as xw:
            delta_cust.to_excel(xw, sheet_name="Customers_New", index=False)
            pd.DataFrame(delta_changes).to_excel(xw, sheet_name="Customer_History", index=False)
            pd.DataFrame([dict(farm_code=c, attribute=a, old_value=o, new_value=n, effective_date=e)
                          for c, a, o, n, e in FARM_DELTA_CHANGES]).to_excel(xw, sheet_name="Farm_History", index=False)
        self.count("master_customers_main", len(cur))
        self.count("master_customers_delta", len(delta_cust))

    def write_planting_register(self, d: Path):
        rng = self.rng
        cyc = self.cycles.set_index("cycle_id")
        rows = []
        for b in self.blocks.itertuples(index=False):
            c = cyc.loc[b.cycle_id]
            if b.failed:
                status, hha = "Failed", 0.0
            elif b.planned_first is None or b.planned_first > CUTOFF:
                status, hha = "Growing", None
            elif b.planned_last <= CUTOFF:
                status, hha = "Completed", b.harvested_ha
            else:
                status, hha = "Harvesting", None
            pdate = c["planting_date"]
            # irrigation is a property of the block in this cycle (e.g. a borehole pivot on a dryland farm)
            irr_method = (c["irrigation_type"] if c["irrigation_type"] != "Dryland" else "Centre pivot") if c["irrigated"] else "Dryland"
            pd_txt = pdate.strftime("%Y-%m-%d")
            if rng.random() < 0.02:
                pd_txt = pdate.strftime("%d/%m/%Y")  # DQ: manual edits in a different format
            rows.append(dict(cycle_id=b.cycle_id, farm_code=b.farm_code, crop_code=b.crop, block_id=b.block_id,
                             planting_date=pd_txt, planted_ha=f"{b.planted_ha:.2f}", variety=c["variety"],
                             irrigation_method=irr_method, planned_yield_t_ha=f"{c['plan_yield']:.1f}",
                             harvested_ha="" if hha is None else f"{hha:.2f}", status=status, last_updated=str(CUTOFF)))
        reg = pd.DataFrame(rows)
        miss = rng.choice(reg.index, size=max(1, int(len(reg) * 0.01)), replace=False)
        reg.loc[miss, "planted_ha"] = ""
        self.note("planting_register_missing_planted_ha", len(miss))
        self.note("planting_register_ddmmyyyy_dates", int((reg.planting_date.str.contains("/")).sum()))
        reg.to_csv(d / "planting_register.csv", index=False)
        self.count("planting_register_rows", len(reg))

    CROP_ALIASES = {
        "MZW": ["Maize", "maize", "White Maize", "MAIZE (WHITE)", "W/Maize"], "WHT": ["Wheat", "wheat", "WHEAT"],
        "MAH": ["Mahangu", "Pearl millet", "mahangu"], "TOM": ["Tomatoes", "Tomato", "tomatoes"],
        "ONI": ["Onions", "Onion", "onion"], "POT": ["Potatoes", "Potato"], "CAB": ["Cabbage", "cabbages"],
        "BUT": ["Butternut", "Butternuts", "Butternut squash"], "WML": ["Watermelon", "Water melon", "Watermelons"],
        "GRP": ["Table grapes", "Grapes", "GRAPES", "Table Grapes"],
    }
    CODE_ALIASES_B = {"MZW": ["MZW", "mzw", "MZ"], "WHT": ["WHT", "wht", "WH"], "POT": ["POT", "pot"], "ONI": ["ONI", "ON"],
                      "TOM": ["TOM", "tom"], "BUT": ["BUT", "BN"], "CAB": ["CAB", "cab"], "WML": ["WML"], "MAH": ["MAH"], "GRP": ["GRP"]}

    def write_harvest_logs(self, d: Path):
        rng = self.rng
        h = self.harvest
        stats = defaultdict(int)
        truth_rows = defaultdict(list)
        for f in FARMS:
            sub = h[h.farm_code == f["code"]].sort_values(["harvest_date", "crop", "block_id"]).reset_index(drop=True)
            tmpl = f["template"]
            out_rows, tags = [], []
            for r in sub.itertuples(index=False):
                farm_txt = r.farm_code
                u = rng.random()
                if u < 0.02:
                    farm_txt = "  " + r.farm_code.lower()
                    stats["harvest_farm_code_case_whitespace"] += 1
                elif u < 0.03:
                    farm_txt = r.farm_code.replace("-", "_")
                    stats["harvest_farm_code_underscore"] += 1
                clerk = f"CLK-{f['code'][3:6]}{int(rng.integers(1, 4))}"
                remark = rng.choice(["", "", "", "", "", "", "rain delay", "machine breakdown", "night shift", "weighbridge slip attached"])
                kg = r.kg
                # injected value errors
                v = rng.random()
                kind = None
                if v < 0.0010:
                    kg = kg * 10
                    kind = "x10"
                    stats["harvest_qty_decimal_shift_x10"] += 1
                elif v < 0.0016:
                    kg = -kg
                    kind = "neg"
                    stats["harvest_qty_negative"] += 1
                elif v < 0.0024:
                    kind = "blank"
                    stats["harvest_qty_blank"] += 1
                bad_date = rng.random() < 0.0015
                if bad_date:
                    stats["harvest_invalid_date"] += 1
                row_tags = [t for t in (kind, "bad_date" if bad_date else None) if t]
                if tmpl == "A":
                    dt = r.harvest_date.strftime("%d/%m/%Y") if not bad_date else f"31/02/{r.harvest_date.year}"
                    crop_txt = self.CROP_ALIASES[r.crop][int(rng.integers(0, len(self.CROP_ALIASES[r.crop])))]
                    qty = "" if kind == "blank" else f"{kg:.1f}"
                    out_rows.append([farm_txt, dt, crop_txt, r.block_id, qty, clerk, remark])
                    tags.append(row_tags)
                elif tmpl == "B":
                    dt = r.harvest_date.strftime("%Y-%m-%d") if not bad_date else f"{r.harvest_date.year}-13-0{int(rng.integers(1, 9))}"
                    crop_txt = self.CODE_ALIASES_B[r.crop][int(rng.integers(0, len(self.CODE_ALIASES_B[r.crop])))]
                    t = kg / 1000.0
                    if kind is None and rng.random() < 0.0012:  # tonnes typed as kg (x1000)
                        t = kg
                        stats["harvest_qty_tonnes_as_kg_x1000"] += 1
                        row_tags.append("x1000")
                    qty = "" if kind == "blank" else f"{t:.3f}".replace(".", ",")
                    out_rows.append([farm_txt, dt, crop_txt, r.block_id, qty, clerk, remark])
                    tags.append(row_tags)
                else:
                    dt = r.harvest_date.strftime("%d-%b-%y") if not bad_date else f"31-Feb-{str(r.harvest_date.year)[-2:]}"
                    crop_txt = self.CROP_ALIASES[r.crop][int(rng.integers(0, len(self.CROP_ALIASES[r.crop])))]
                    unit_choice = rng.random()
                    if r.crop == "GRP" and unit_choice < 0.5:
                        unit, q = "crates(10kg)", round(kg / 10.0)
                        if kind != "blank" and q == 0:
                            unit, q = "kg", kg
                    elif r.crop in ("ONI", "BUT") and unit_choice < 0.3:
                        unit, q = "bins(400kg)", round(kg / 400.0, 2)
                    elif unit_choice < 0.6:
                        unit, q = rng.choice(["kg", "KG", "Kg"]), kg
                    else:
                        unit, q = rng.choice(["t", "ton"]), round(kg / 1000.0, 3)
                    qty = "" if kind == "blank" else f"{q}"
                    out_rows.append([farm_txt, dt, crop_txt, r.block_id, qty, unit, clerk, remark])
                    tags.append(row_tags)
            # exact duplicate re-submissions (~1.2 %)
            n_dup = int(round(len(out_rows) * 0.012))
            dup_idx = rng.choice(len(out_rows), size=n_dup, replace=False) if n_dup else []
            for i in sorted(dup_idx, reverse=True):
                out_rows.insert(i + 1, list(out_rows[i]))
                tags.insert(i + 1, ["dup"])
            stats["harvest_exact_duplicates"] += n_dup
            path = d / f"harvest_log_{f['code']}.csv"
            for rn, tl in enumerate(tags, start=1):
                for t_ in tl:
                    truth_rows[t_].append(f"{path.name}:{rn}")
            if tmpl == "A":
                df = pd.DataFrame(out_rows, columns=["FarmCode", "HarvestDate", "Crop", "Block", "QtyKg", "RecordedBy", "Remarks"])
                df.to_csv(path, index=False)
            elif tmpl == "B":
                df = pd.DataFrame(out_rows, columns=["farm", "date", "crop_code", "block_id", "quantity_t", "recorder", "notes"])
                df.to_csv(path, index=False, sep=";")
            else:
                df = pd.DataFrame(out_rows, columns=["Farm", "Date", "Product", "Block", "Quantity", "Unit", "Clerk", "Comment"])
                df.to_csv(path, index=False)
            stats["harvest_raw_rows"] += len(out_rows)
        for k, v in stats.items():
            self.note(k, int(v))
        self.manifest["truth"]["harvest_injected_rows"] = dict(truth_rows)

    def write_sales(self, d: Path):
        rng = self.rng
        s = self.sales.copy()
        # duplicate-account usage: sales to survivor customers between dup creation and merge use the duplicate code
        n_dupcode = 0
        for surv, (dupc, a, b) in getattr(self, "dup_map", {}).items():
            mask = (s.customer_code == surv) & (s.invoice_date >= a) & (s.invoice_date < b) & (rng.random(len(s)) < 0.6)
            s.loc[mask, "customer_code"] = dupc
            n_dupcode += int(mask.sum())
        self.note("sales_lines_using_duplicate_customer_code", n_dupcode)
        # product-code variants (~1.5 %)
        pv = rng.random(len(s)) < 0.015
        s.loc[pv, "product_code"] = [rng.choice([c.replace("-", ""), c.lower(), c.replace("-", " ")]) for c in s.loc[pv, "product_code"]]
        self.note("sales_product_code_variants", int(pv.sum()))
        # missing farm of origin (~0.8 %)
        mf = rng.random(len(s)) < 0.008
        s.loc[mf, "farm_code"] = ""
        self.note("sales_missing_farm_code", int(mf.sum()))
        # missing currency on export lines (~3 % of export lines)
        exp = s.channel == "Export"
        mc = exp & (rng.random(len(s)) < 0.03)
        s.loc[mc, "currency_code"] = ""
        self.note("sales_export_missing_currency", int(mc.sum()))
        # unit-price keying errors x10 (anomalies to be detected, not silently fixed)
        pe = (rng.random(len(s)) < 0.0004) & (s.doc_type == "INV")
        s.loc[pe, "unit_price"] = (s.loc[pe, "unit_price"] * 10).round(2)
        self.note("sales_unit_price_x10_errors", int(pe.sum()))
        self.manifest["truth"]["price_error_invoice_lines"] = s.loc[pe, ["invoice_no", "line_no"]].astype(str).agg("/".join, axis=1).tolist()
        cols = ["invoice_no", "line_no", "doc_type", "invoice_date", "dispatch_date", "customer_code", "product_code",
                "farm_code", "quantity", "uom", "unit_price", "currency_code", "discount_pct", "unit_std_cost_nad",
                "freight_nad", "sales_rep_code", "ref_invoice_no"]
        s["quantity"] = s["qty"]
        # uom must come from the true product (variants above only change the code text)
        true_code = self.sales.product_code
        s["uom"] = [PRODUCT_BY_CODE[c][5] for c in true_code]
        # late-arriving customers: their lines stay in the ERP with codes unknown to the main master extract
        self.note("sales_lines_late_arriving_customers", int(s.customer_code.isin(self.late_customers).sum()))
        s["fy_file"] = [fiscal_year(x) for x in s.invoice_date]
        total_dups = 0
        for fy in sorted(s.fy_file.unique()):
            part = s[s.fy_file == fy][cols].copy()
            # overlapping extraction window: first 3 days of next FY repeated in this file
            nxt = s[(s.fy_file == fy + 1) & (s.invoice_date <= date(fy, 4, 3))][cols]
            # random duplicate lines inside the file (~0.3 %)
            rdup = part.sample(frac=0.003, random_state=int(rng.integers(0, 1e9)))
            total_dups += len(nxt) + len(rdup)
            part = pd.concat([part, nxt, rdup], ignore_index=True).sort_values(["invoice_date", "invoice_no", "line_no"])
            with gzip.open(d / f"sales_invoice_lines_FY{fy}.csv.gz", "wt", newline="") as fh:
                part.to_csv(fh, index=False)
        self.note("sales_duplicate_lines_total", int(total_dups))

    def write_stock(self, d: Path):
        rng = self.rng
        st = self.stock.copy()
        st["period"] = [p.strftime("%Y-%m") for p in st.period]
        prod_crop = {p[0]: p[1] for p in PRODUCTS}
        st["closing_value_nad"] = [round(c * self.std_cost_per_kg(prod_crop[p], date(int(per[:4]), int(per[5:]), 1)), 2)
                                   for c, p, per in zip(st.closing_kg, st.product_code, st.period)]
        st["count_date"] = [str(month_end(date(int(per[:4]), int(per[5:]), 1))) for per in st.period]
        # DQ: 3 sign errors on closing stock, 2 missing months for one farm-product
        cand = st.index[st.closing_kg > 1000]
        sign = rng.choice(cand, size=3, replace=False)
        st.loc[sign, "closing_kg"] = -st.loc[sign, "closing_kg"]
        self.note("stock_closing_sign_errors", 3)
        g = st[(st.farm_code == "GB-OSK-01") & (st.product_code == "MZW-WM1-BLK")].index
        drop = g[20:22] if len(g) > 22 else g[:0]
        self.manifest["truth"]["stock_missing_rows"] = st.loc[drop, ["farm_code", "product_code", "period"]].astype(str).values.tolist()
        st = st.drop(index=drop)
        self.note("stock_missing_month_rows", len(drop))
        st.to_csv(d / "stock_movements_monthly.csv", index=False)

    def write_costs(self, d: Path):
        rng = self.rng
        c = self.costs.copy()
        alias = {cc[0]: [cc[1]] + cc[6] for cc in COST_CATEGORIES}
        c["cost_category"] = [alias[x][0] if rng.random() < 0.7 else alias[x][int(rng.integers(1, len(alias[x])))] for x in c.cost_category]
        c["crop_code"] = c.pop("crop")
        c["gl_account"] = [CC_BY_CODE[cc][4] for cc in self.costs.cost_category]
        c["description"] = [f"{CC_BY_CODE[cc][1]} - {cen}" for cc, cen in zip(self.costs.cost_category, c.cost_centre)]
        amt = c["amount_nad"].map(lambda v: f"{v:.2f}")
        fmt = rng.random(len(c)) < 0.03
        amt[fmt] = c.loc[fmt, "amount_nad"].map(lambda v: f"N${v:,.2f}")
        c["amount_nad"] = amt
        self.note("cost_amount_text_formatted", int(fmt.sum()))
        # missing crop on crop-specific postings (0.5 %)
        crop_specific = c.crop_code != ""
        mc = crop_specific & (rng.random(len(c)) < 0.005)
        c.loc[mc, "crop_code"] = ""
        c.loc[mc, "cost_centre"] = c.loc[mc, "farm_code"] + "/UNALLOCATED"
        self.note("cost_missing_crop_on_crop_specific", int(mc.sum()))
        # reversal pairs (legitimate) 0.4 %
        rev_src = c[crop_specific].sample(frac=0.004, random_state=int(rng.integers(0, 1e9)))
        rev1 = rev_src.copy()
        rev1["posting_id"] = rev1["posting_id"] + "-R"
        rev1["amount_nad"] = ["-" + a.replace("N$", "") if not a.startswith("-") else a for a in rev1.amount_nad]
        rev1["description"] = "Reversal: " + rev1["description"]
        rep = rev_src.copy()
        rep["posting_id"] = rep["posting_id"] + "-C"
        rep["posting_date"] = [d_ + timedelta(days=int(rng.integers(1, 6))) for d_ in rep.posting_date]
        rep["amount_nad"] = [f"{float(a.replace('N$', '').replace(',', '')) * float(rng.uniform(0.9, 1.1)):.2f}" for a in rep.amount_nad]
        rep["description"] = "Correction: " + rep["description"]
        rev1 = pd.concat([rev1, rep], ignore_index=True)
        self.note("cost_reversal_and_correction_postings", len(rev1))
        # duplicated postings 0.3 %
        dups = c.sample(frac=0.003, random_state=int(rng.integers(0, 1e9)))
        self.note("cost_duplicate_postings", len(dups))
        c = pd.concat([c, rev1, dups], ignore_index=True).sort_values(["posting_date", "posting_id"])
        cols = ["posting_id", "posting_date", "farm_code", "cost_centre", "crop_code", "cost_category", "gl_account",
                "description", "amount_nad", "input_qty", "input_uom", "supplier_code"]
        with gzip.open(d / "cost_ledger.csv.gz", "wt", newline="") as fh:
            c[cols].to_csv(fh, index=False)
        self.count("cost_ledger_raw_rows", len(c))

    def write_weather(self, d: Path):
        rng = self.rng
        n_missing = 0
        for f in FARMS:
            w = self.weather[f["code"]].copy()
            params = {}
            for col in ["PRECTOTCORR", "T2M_MAX", "T2M_MIN", "RH2M", "ALLSKY_SFC_SW_DWN"]:
                vals = w[col].to_numpy().copy()
                miss = rng.random(len(vals)) < 0.003
                miss[-3:] = True  # data latency: most recent days not yet available
                vals[miss] = -999.0
                n_missing += int(miss.sum())
                params[col] = {dt.strftime("%Y%m%d"): float(v) for dt, v in zip(w.index, vals)}
            payload = {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [f["lon"], f["lat"], float(f["elev"])]},
                "properties": {"parameter": params},
                "header": {"title": "NASA/POWER Daily Point Data (SYNTHETIC STAND-IN - same layout as the POWER API)",
                           "api": {"version": "v2.x", "name": "POWER Daily API"}, "sources": ["synthetic"],
                           "fill_value": -999.0, "start": WEATHER_START.strftime("%Y%m%d"), "end": CUTOFF.strftime("%Y%m%d")},
                "messages": [], "parameters": {
                    "PRECTOTCORR": {"units": "mm/day", "longname": "Precipitation Corrected"},
                    "T2M_MAX": {"units": "C", "longname": "Temperature at 2 Meters Maximum"},
                    "T2M_MIN": {"units": "C", "longname": "Temperature at 2 Meters Minimum"},
                    "RH2M": {"units": "%", "longname": "Relative Humidity at 2 Meters"},
                    "ALLSKY_SFC_SW_DWN": {"units": "MJ/m^2/day", "longname": "All Sky Surface Shortwave Downward Irradiance"}},
                "times": {"data": 0.0, "process": 0.0},
            }
            with open(d / f"POWER_Point_Daily_{f['code']}.json", "w") as fh:
                json.dump(payload, fh)
        self.note("weather_fill_values_-999", n_missing)

    def write_pink_sheet(self, d: Path):
        from openpyxl import Workbook
        wb = Workbook()
        ws = wb.active
        ws.title = "Monthly Prices"
        ws.append(["World Bank Commodity Price Data (The Pink Sheet) - SYNTHETIC STAND-IN"])
        ws.append(["monthly prices in nominal US dollars, 2020 to present"])
        ws.append(["(layout mirrors CMO-Historical-Data-Monthly.xlsx; values calibrated to approximate published annual averages)"])
        ws.append([])
        order = ["CRUDE_BRENT", "MAIZE", "SORGHUM", "WHEAT_US_HRW", "DAP", "UREA"]
        ws.append([""] + [PINK_SHEET_COLUMNS[k][0] for k in order])
        ws.append([""] + [PINK_SHEET_COLUMNS[k][1] for k in order])
        months = self.prices["MAIZE"].index
        for i, m in enumerate(months):
            row = [f"{m.year}M{m.month:02d}"]
            for k in order:
                v = float(self.prices[k].loc[m])
                if k == "SORGHUM" and m.year == 2021 and m.month in (2, 3):
                    row.append("…")  # DQ: missing value marker as used in the Pink Sheet
                else:
                    row.append(v)
            ws.append(row)
        self.note("pink_sheet_missing_markers", 2)
        wb.save(d / "CMO-Historical-Data-Monthly.xlsx")

    def write_fred(self, d: Path):
        rng = self.rng
        n_blank = 0
        for series, s in self.fx_daily.items():
            df = s.to_frame(series)
            df.index.name = "observation_date"
            vals = df[series].astype(object)
            blank = rng.random(len(vals)) < 0.015  # holidays published as blanks
            vals[blank] = ""
            n_blank += int(blank.sum())
            df[series] = vals
            df.to_csv(d / f"{series}.csv")
        self.note("fred_blank_observations", n_blank)

    def write_crop_estimates(self, d: Path):
        rng = self.rng
        est = self.crop_est.copy()
        names = {"MZW": "White maize", "WHT": "Wheat", "MAH": "Mahangu (pearl millet)", "TOM": "Tomatoes", "ONI": "Onions",
                 "POT": "Potatoes", "CAB": "Cabbage", "BUT": "Butternut", "WML": "Watermelon", "GRP": "Table grapes",
                 "SORGHUM": "Sorghum"}
        nsa_region = {r[0]: r[1] for r in REGIONS}
        nsa_region.update({"NA-KE": "Kavango-East", "NA-KW": "Kavango-West", "NA-KA": "Karas"})
        rows = []
        for r in est.itertuples(index=False):
            area = round(r.area_ha, 0)
            prod = round(r.production_t, 0)
            yld = "n/a" if area == 0 else f"{r.production_t / r.area_ha:.2f}"
            rows.append(dict(season=f"{r.season}/{r.season + 1}", region=nsa_region[r.region], crop=names[r.crop],
                             sector=r.sector, area_planted_ha=f"{area:,.0f}", production_tonnes=f"{prod:,.0f}",
                             yield_t_per_ha=yld, source_table="Crop Prospects & Food Security Situation Report (synthetic)",
                             release_date=f"{r.season + 1}-07-15"))
        pd.DataFrame(rows).to_csv(d / "crop_estimates_by_region.csv", index=False)
        self.note("nsa_unmapped_crop_rows_sorghum", int((est.crop == "SORGHUM").sum()))

    # ---------------------------------------------------------------- run
    def run(self):
        self.gen_weather()
        self.gen_prices()
        self.gen_customers()
        self.gen_cycles()
        self.gen_harvest()
        self.gen_costs()
        self.gen_stock_and_sales()
        self.gen_crop_estimates()
        self.write_all()
        return self.manifest


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", default=str(Path(__file__).resolve().parent / "raw"))
    ap.add_argument("--seed", type=int, default=SEED_DEFAULT)
    args = ap.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    man = Generator(out, args.seed).run()
    print(json.dumps({"row_counts": man["row_counts"], "injected_defects": man["injected_defects"]}, indent=2, default=str))


if __name__ == "__main__":
    main()
