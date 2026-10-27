#!/usr/bin/env python3
"""
generate_synthetic_data.py
==========================
ABI820S group project - Green Basket cc, Health Services subsidiary
("Green Basket Health Services", GBHS: five hospitals and five clinics in Namibia).

Generates the raw source-system extracts used by the health data warehouse.

INTERNAL SOURCES (synthetic and anonymised by design: GBHS is fictitious and no record
describes a real person; patients carry a random pseudonym, birth year, sex, region and
payer class only - no names, ID numbers, dates of birth, addresses or clinical notes)
  S1  Patient administration system (PAS)
        raw/internal/pas/pas_ed_opd_encounters_<yyyy>.csv.gz   ED and clinic attendances (5 yearly files)
        raw/internal/pas/pas_inpatient_spells.csv.gz           inpatient spells (change-data-capture export)
        raw/internal/pas/pas_patient_index.csv.gz              pseudonymised master patient index (MPI)
        raw/internal/pas/pas_patient_changes.csv.gz            MPI audit trail (residence region, payer class)
  S2  Ward bed-state returns          raw/internal/wards/ward_midnight_census.csv
  S3  E-rostering system              raw/internal/roster/eroster_shift_summary.csv.gz
  S4  IDSR weekly returns             raw/internal/idsr/idsr_weekly_returns.csv
  S5  Master and reference data       raw/internal/master_data/GBHS_Master_Data.xlsx
  Day-2 incremental extract           raw/delta_2026-10-01/*  (1 October 2026)

EXTERNAL SOURCES
  S6  NSA 2023 census population      raw/external/nsa/nsa_census2023_population_by_region.csv
      REAL published regional totals (preliminary results, 13 March 2024), in a messy
      publication-style CSV (title rows, thousands separators, national total row, footnote).
  S7  NASA POWER daily weather        raw/external/nasa_power/POWER_Point_Daily_<facility>.json
      Stand-in values in the exact POWER API JSON layout (the API host was not reachable from
      the build environment); fetch_public_data.py downloads the real series unchanged.

Data-quality defects are injected deliberately (duplicates, mixed date formats, code
variants, keying errors, impossible values, late-arriving records, missing returns ...).
Every injected defect is listed in raw/generator_manifest.json (counts) and
raw/dq_ground_truth.json (record keys), so that the ETL can be validated against the truth.

Usage:
    python generate_synthetic_data.py                 # default seed 20261028, writes ./raw
Requires: numpy, pandas, openpyxl
"""
from __future__ import annotations

import argparse
import json
import math
import platform
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

SEED_DEFAULT = 20261028
SIM_START = date(2021, 12, 1)      # warm-up month: wards are occupied on 1 January 2022
START = date(2022, 1, 1)           # first day covered by the extracts
CUTOFF = date(2026, 9, 30)         # main extract cut-off (23:59:59)
DELTA_DATE = date(2026, 10, 1)     # day-2 incremental extract
WEATHER_START = date(2021, 9, 1)   # weather is needed 3-8 weeks before each malaria case
GZ = {"method": "gzip", "compresslevel": 6, "mtime": 0}   # byte-identical re-runs

# ---------------------------------------------------------------------------
# Geography (ISO 3166-2:NA) and the REAL 2023 census population (NSA preliminary results)
# ---------------------------------------------------------------------------
REGIONS = [
    # code,   name,          zone,            malaria planning stratum, 2023 population, aliases seen in sources
    ("NA-CA", "Zambezi",      "North-East",    "Endemic - high", 142373, ["Zambezi (Caprivi)", "Caprivi", "ZAMBEZI"]),
    ("NA-ER", "Erongo",       "West",          "Non-endemic",    240206, ["ERONGO", "Erongo Region"]),
    ("NA-HA", "Hardap",       "South",         "Non-endemic",    106680, ["HARDAP"]),
    ("NA-KA", "//Kharas",     "South",         "Non-endemic",    109893, ["Karas", "//Karas", "Kharas"]),
    ("NA-KE", "Kavango East", "North-East",    "Endemic - high", 218421, ["Kavango-East", "Kavango E", "KAVANGO EAST"]),
    ("NA-KW", "Kavango West", "North-East",    "Endemic - high", 123266, ["Kavango-West", "Kavango W"]),
    ("NA-KH", "Khomas",       "Central",       "Non-endemic",    494605, ["KHOMAS"]),
    ("NA-KU", "Kunene",       "North-West",    "Endemic - low",  120762, ["KUNENE"]),
    ("NA-OW", "Ohangwena",    "North-Central", "Endemic - low",  337729, ["OHANGWENA"]),
    ("NA-OH", "Omaheke",      "East",          "Non-endemic",    102881, ["OMAHEKE"]),
    ("NA-OS", "Omusati",      "North-Central", "Endemic - low",  316671, ["OMUSATI"]),
    ("NA-ON", "Oshana",       "North-Central", "Endemic - low",  230801, ["OSHANA"]),
    ("NA-OT", "Oshikoto",     "North-Central", "Endemic - low",  257302, ["OSHIKOTO"]),
    ("NA-OD", "Otjozondjupa", "Central",       "Endemic - low",  220811, ["OTJOZONDJUPA", "Otjozondjupa Region"]),
]
NATIONAL_POP_2023 = 3022401
assert sum(r[4] for r in REGIONS) == NATIONAL_POP_2023
REGION_BY_CODE = {r[0]: r for r in REGIONS}

# ---------------------------------------------------------------------------
# Facilities and care units
# ---------------------------------------------------------------------------
FACILITIES = [
    dict(code="GBH-WHK", short="WHK", name="GBHS Windhoek Hospital", type="Referral hospital", region="NA-KH",
         town="Windhoek", lat=-22.5609, lon=17.0658, elev=1655, ed=55.0, opd=0.0, catch=0.16, climate="central",
         opened="1998-03-02", vac=0.05, report=(0.010, 0.07)),
    dict(code="GBH-OSH", short="OSH", name="GBHS Oshakati Hospital", type="District hospital", region="NA-ON",
         town="Oshakati", lat=-17.7883, lon=15.7044, elev=1105, ed=42.0, opd=0.0, catch=0.30, climate="northcentral",
         opened="2004-07-01", vac=0.07, report=(0.012, 0.09)),
    dict(code="GBH-RUN", short="RUN", name="GBHS Rundu Hospital", type="District hospital", region="NA-KE",
         town="Rundu", lat=-17.9180, lon=19.7700, elev=1100, ed=34.0, opd=0.0, catch=0.35, climate="northeast",
         opened="2006-02-01", vac=0.12, report=(0.015, 0.12)),
    dict(code="GBH-KAT", short="KAT", name="GBHS Katima Mulilo Hospital", type="District hospital", region="NA-CA",
         town="Katima Mulilo", lat=-17.5050, lon=24.2700, elev=950, ed=20.0, opd=0.0, catch=0.30, climate="zambezi",
         opened="2009-05-04", vac=0.14, report=(0.02, 0.14)),
    dict(code="GBH-WVB", short="WVB", name="GBHS Walvis Bay Hospital", type="District hospital", region="NA-ER",
         town="Walvis Bay", lat=-22.9575, lon=14.5053, elev=7, ed=22.0, opd=0.0, catch=0.25, climate="coastal",
         opened="2001-09-03", vac=0.06, report=(0.01, 0.08)),
    dict(code="GBC-KTU", short="KTU", name="GBHS Katutura Clinic", type="Clinic", region="NA-KH",
         town="Windhoek (Katutura)", lat=-22.5236, lon=17.0510, elev=1680, ed=0.0, opd=40.0, catch=0.12,
         climate="central", opened="2011-01-10", vac=0.08, report=(0.02, 0.10)),
    dict(code="GBC-EEN", short="EEN", name="GBHS Eenhana Clinic", type="Clinic", region="NA-OW",
         town="Eenhana", lat=-17.4667, lon=16.3333, elev=1110, ed=0.0, opd=26.0, catch=0.15, climate="northcentral",
         opened="2013-03-04", vac=0.10, report=(0.04, 0.15)),
    dict(code="GBC-NKU", short="NKU", name="GBHS Nkurenkuru Clinic", type="Clinic", region="NA-KW",
         town="Nkurenkuru", lat=-17.6167, lon=18.6000, elev=1080, ed=0.0, opd=22.0, catch=0.25, climate="northeast",
         opened="2015-06-01", vac=0.15, report=(0.07, 0.25)),
    dict(code="GBC-KMP", short="KMP", name="GBHS Keetmanshoop Clinic", type="Clinic", region="NA-KA",
         town="Keetmanshoop", lat=-26.5833, lon=18.1333, elev=1000, ed=0.0, opd=18.0, catch=0.30, climate="south",
         opened="2012-08-01", vac=0.09, report=(0.03, 0.12)),
    dict(code="GBC-OTJ", short="OTJ", name="GBHS Otjiwarongo Clinic", type="Clinic", region="NA-OD",
         town="Otjiwarongo", lat=-20.4637, lon=16.6477, elev=1460, ed=0.0, opd=22.0, catch=0.20, climate="centralnorth",
         opened="2014-02-03", vac=0.09, report=(0.03, 0.12)),
]
FAC_BY_CODE = {f["code"]: f for f in FACILITIES}
FAC_INDEX = {f["code"]: i for i, f in enumerate(FACILITIES)}
HOSPITALS = [f["code"] for f in FACILITIES if f["ed"] > 0]

UNITS = [
    # unit code, facility, name, unit type, specialty, bed complement at 1 Jan 2022
    ("WHK-ED", "GBH-WHK", "Emergency Department", "Emergency department", "Emergency medicine", 0),
    ("WHK-MED1", "GBH-WHK", "Medical Ward A", "Inpatient ward", "Medical", 28),
    ("WHK-MED2", "GBH-WHK", "Medical Ward B", "Inpatient ward", "Medical", 24),
    ("WHK-SUR1", "GBH-WHK", "Surgical Ward", "Inpatient ward", "Surgical", 30),
    ("WHK-PAE1", "GBH-WHK", "Paediatric Ward", "Inpatient ward", "Paediatric", 20),
    ("WHK-MAT1", "GBH-WHK", "Maternity Ward", "Inpatient ward", "Maternity", 24),
    ("WHK-ICU1", "GBH-WHK", "Intensive Care Unit", "Inpatient ward", "Intensive care", 8),
    ("OSH-ED", "GBH-OSH", "Emergency Department", "Emergency department", "Emergency medicine", 0),
    ("OSH-MED1", "GBH-OSH", "Medical Ward", "Inpatient ward", "Medical", 30),
    ("OSH-SUR1", "GBH-OSH", "Surgical Ward", "Inpatient ward", "Surgical", 22),
    ("OSH-PAE1", "GBH-OSH", "Paediatric Ward", "Inpatient ward", "Paediatric", 16),
    ("OSH-MAT1", "GBH-OSH", "Maternity Ward", "Inpatient ward", "Maternity", 22),
    ("OSH-ICU1", "GBH-OSH", "Intensive Care Unit", "Inpatient ward", "Intensive care", 8),
    ("RUN-ED", "GBH-RUN", "Emergency Department", "Emergency department", "Emergency medicine", 0),
    ("RUN-MED1", "GBH-RUN", "Medical Ward", "Inpatient ward", "Medical", 24),
    ("RUN-SUR1", "GBH-RUN", "Surgical Ward", "Inpatient ward", "Surgical", 16),
    ("RUN-PAE1", "GBH-RUN", "Paediatric Ward", "Inpatient ward", "Paediatric", 16),
    ("RUN-MAT1", "GBH-RUN", "Maternity Ward", "Inpatient ward", "Maternity", 18),
    ("KAT-ED", "GBH-KAT", "Emergency Department", "Emergency department", "Emergency medicine", 0),
    ("KAT-MED1", "GBH-KAT", "General Ward", "Inpatient ward", "Medical", 18),
    ("KAT-PAE1", "GBH-KAT", "Paediatric Ward", "Inpatient ward", "Paediatric", 10),
    ("KAT-MAT1", "GBH-KAT", "Maternity Ward", "Inpatient ward", "Maternity", 12),
    ("WVB-ED", "GBH-WVB", "Emergency Department", "Emergency department", "Emergency medicine", 0),
    ("WVB-MED1", "GBH-WVB", "Medical Ward", "Inpatient ward", "Medical", 24),
    ("WVB-SUR1", "GBH-WVB", "Surgical Ward", "Inpatient ward", "Surgical", 14),
    ("WVB-MAT1", "GBH-WVB", "Maternity Ward", "Inpatient ward", "Maternity", 12),
    ("KTU-OPD", "GBC-KTU", "Outpatient Clinic", "Outpatient clinic", "Primary care", 0),
    ("EEN-OPD", "GBC-EEN", "Outpatient Clinic", "Outpatient clinic", "Primary care", 0),
    ("NKU-OPD", "GBC-NKU", "Outpatient Clinic", "Outpatient clinic", "Primary care", 0),
    ("KMP-OPD", "GBC-KMP", "Outpatient Clinic", "Outpatient clinic", "Primary care", 0),
    ("OTJ-OPD", "GBC-OTJ", "Outpatient Clinic", "Outpatient clinic", "Primary care", 0),
]
UNIT_BY_CODE = {u[0]: u for u in UNITS}
WARDS = [u for u in UNITS if u[3] == "Inpatient ward"]
SPEC_PREFIX = {"Medical": "MED", "Surgical": "SUR", "Paediatric": "PAE", "Maternity": "MAT", "Intensive care": "ICU"}

# Type 2 changes to care units (replayed into dim_care_unit). Main extract = up to the cut-off.
UNIT_CHANGES = [
    ("WHK-MED2", "specialty", "Medical", "Isolation (COVID-19)", date(2022, 1, 3), "Hospital Manager"),
    ("WHK-MED2", "specialty", "Isolation (COVID-19)", "Medical", date(2022, 3, 14), "Hospital Manager"),
    ("WVB-MAT1", "bed_complement", "12", "10", date(2023, 5, 2), "Nursing Services Manager"),
    ("OSH-SUR1", "bed_complement", "22", "26", date(2024, 7, 1), "Hospital Manager"),
    ("RUN-MED1", "bed_complement", "24", "32", date(2025, 4, 7), "Hospital Manager"),
    ("RUN-PAE1", "bed_complement", "16", "22", date(2025, 4, 7), "Hospital Manager"),
    ("KAT-MED1", "bed_complement", "18", "22", date(2026, 3, 2), "Hospital Manager"),
]
UNIT_CHANGES_DELTA = [   # pre-season expansion agreed after the 2026 malaria season, effective 1 Oct 2026
    ("RUN-MED1", "bed_complement", "32", "36", date(2026, 10, 1), "Hospital Manager"),
    ("KAT-PAE1", "bed_complement", "10", "14", date(2026, 10, 1), "Hospital Manager"),
]

TRIAGE = [
    # code, label, priority, target minutes to doctor, target text, colour hex
    ("RED", "Red - emergency", 1, 0, "Immediate", "#C62828"),
    ("ORANGE", "Orange - very urgent", 2, 10, "Within 10 minutes", "#EF6C00"),
    ("YELLOW", "Yellow - urgent", 3, 60, "Within 60 minutes", "#F9A825"),
    ("GREEN", "Green - routine", 4, 240, "Within 4 hours", "#2E7D32"),
    ("BLUE", "Blue - dead on arrival", 5, None, "Not applicable", "#1565C0"),
    ("NT", "Not triaged (clinic attendance)", 9, None, "Not applicable", "#757575"),
]
TRI_CODES = ["RED", "ORANGE", "YELLOW", "GREEN"]
TRI_BY_SEV = {
    "minor":    [0.002, 0.030, 0.220, 0.748],
    "moderate": [0.010, 0.100, 0.520, 0.370],
    "serious":  [0.050, 0.320, 0.480, 0.150],
    "critical": [0.400, 0.450, 0.130, 0.020],
}
ADMIT_BY_SEV = {"minor": 0.03, "moderate": 0.14, "serious": 0.48, "critical": 0.80}
ADMIT_TRI_MULT = {"RED": 1.25, "ORANGE": 1.15, "YELLOW": 0.90, "GREEN": 0.35}
DEATH_BY_SEV = {"minor": 0.001, "moderate": 0.008, "serious": 0.040, "critical": 0.150}
LOS_SEV_MULT = {"minor": 0.7, "moderate": 0.9, "serious": 1.1, "critical": 1.3}

CHAPTERS = {
    "I": ("A00-B99", "Certain infectious and parasitic diseases"),
    "II": ("C00-D48", "Neoplasms"),
    "III": ("D50-D89", "Diseases of the blood and blood-forming organs and certain disorders involving the immune mechanism"),
    "IV": ("E00-E90", "Endocrine, nutritional and metabolic diseases"),
    "V": ("F00-F99", "Mental and behavioural disorders"),
    "VI": ("G00-G99", "Diseases of the nervous system"),
    "VII": ("H00-H59", "Diseases of the eye and adnexa"),
    "IX": ("I00-I99", "Diseases of the circulatory system"),
    "X": ("J00-J99", "Diseases of the respiratory system"),
    "XI": ("K00-K93", "Diseases of the digestive system"),
    "XII": ("L00-L99", "Diseases of the skin and subcutaneous tissue"),
    "XIII": ("M00-M99", "Diseases of the musculoskeletal system and connective tissue"),
    "XIV": ("N00-N99", "Diseases of the genitourinary system"),
    "XV": ("O00-O99", "Pregnancy, childbirth and the puerperium"),
    "XVIII": ("R00-R99", "Symptoms, signs and abnormal clinical and laboratory findings, not elsewhere classified"),
    "XIX": ("S00-T98", "Injury, poisoning and certain other consequences of external causes"),
    "XXI": ("Z00-Z99", "Factors influencing health status and contact with health services"),
    "XXII": ("U00-U99", "Codes for special purposes"),
}
CHAPTER_ORDER = {c: i + 1 for i, c in enumerate(["I", "II", "III", "IV", "V", "VI", "VII", "IX", "X", "XI", "XII", "XIII",
                                                  "XIV", "XV", "XVIII", "XIX", "XXI", "XXII"])}

# ICD-10 (WHO) codes used by GBHS. Fields: code, title, chapter, block, block title, severity, specialty,
# chronic (readmission risk), IDSR condition, ED weights (<5, 5-14, 15-64, 65+), clinic weights, sex, season
_N = None
ICD = [
    ("A01.0", "Typhoid fever", "I", "A00-A09", "Intestinal infectious diseases", "serious", "MED", 0, "TYP",
     (0.04, 0.08, 0.08, 0.03), (0.02, 0.04, 0.04, 0.02), _N, _N),
    ("A09", "Other gastroenteritis and colitis of infectious and unspecified origin", "I", "A00-A09",
     "Intestinal infectious diseases", "moderate", "MED", 0, "AWD", (14, 6, 4, 4), (12, 5, 3, 3), _N, "rainy"),
    ("A15.0", "Tuberculosis of lung, confirmed by sputum microscopy with or without culture", "I", "A15-A19",
     "Tuberculosis", "serious", "MED", 1, _N, (0.2, 0.4, 1.5, 1.2), (0.2, 0.4, 1.5, 1.2), _N, _N),
    ("A39.0", "Meningococcal meningitis", "I", "A30-A49", "Other bacterial diseases", "critical", "MED", 0, "MEN",
     (0.04, 0.04, 0.015, 0.01), (0, 0, 0, 0), _N, _N),
    ("A41.9", "Sepsis, unspecified", "I", "A30-A49", "Other bacterial diseases", "critical", "MED", 0, _N,
     (1.0, 0.5, 1.2, 2.5), (0, 0, 0, 0), _N, _N),
    ("A82.9", "Rabies, unspecified", "I", "A80-A89", "Viral infections of the central nervous system", "critical",
     "MED", 0, "RAB", (0.004, 0.008, 0.004, 0.002), (0, 0, 0, 0), _N, _N),
    ("B05.9", "Measles without complication", "I", "B00-B09",
     "Viral infections characterized by skin and mucous membrane lesions", "moderate", "MED", 0, "MEA",
     (0.015, 0.008, 0.002, 0), (0.015, 0.008, 0.002, 0), _N, _N),
    ("B17.2", "Acute hepatitis E", "I", "B15-B19", "Viral hepatitis", "moderate", "MED", 0, "HEV",
     (0.01, 0.02, 0.05, 0.02), (0.01, 0.02, 0.05, 0.02), _N, _N),
    ("B24", "Unspecified human immunodeficiency virus [HIV] disease", "I", "B20-B24",
     "Human immunodeficiency virus [HIV] disease", "serious", "MED", 1, _N, (0.2, 0.3, 2.5, 1.0), (0.1, 0.2, 1.0, 0.5), _N, _N),
    ("B50.9", "Plasmodium falciparum malaria, unspecified", "I", "B50-B64", "Protozoal diseases", "moderate", "MED", 0,
     "MAL", (0, 0, 0, 0), (0, 0, 0, 0), _N, _N),
    ("B54", "Unspecified malaria", "I", "B50-B64", "Protozoal diseases", "moderate", "MED", 0, "MAL",
     (0, 0, 0, 0), (0, 0, 0, 0), _N, _N),
    ("C53.9", "Malignant neoplasm: Cervix uteri, unspecified", "II", "C51-C58",
     "Malignant neoplasms of female genital organs", "serious", "MED", 1, _N, (0, 0, 0.35, 0.3), (0, 0, 0.3, 0.2), "F", _N),
    ("D64.9", "Anaemia, unspecified", "III", "D60-D64", "Aplastic and other anaemias", "moderate", "MED", 0, _N,
     (0.8, 0.4, 0.8, 1.0), (1.5, 0.8, 1.2, 1.2), _N, _N),
    ("E11.9", "Type 2 diabetes mellitus without complications", "IV", "E10-E14", "Diabetes mellitus", "moderate",
     "MED", 1, _N, (0, 0.05, 1.8, 3.0), (0, 0.05, 4.0, 6.0), _N, _N),
    ("E44.0", "Moderate protein-energy malnutrition", "IV", "E40-E46", "Malnutrition", "serious", "MED", 0, _N,
     (1.0, 0.2, 0, 0), (2.0, 0.3, 0, 0), _N, _N),
    ("F10.0", "Mental and behavioural disorders due to use of alcohol: acute intoxication", "V", "F10-F19",
     "Mental and behavioural disorders due to psychoactive substance use", "moderate", "MED", 0, _N,
     (0, 0.05, 3.5, 1.0), (0, 0, 0.3, 0.1), _N, "night"),
    ("F32.9", "Depressive episode, unspecified", "V", "F30-F39", "Mood [affective] disorders", "minor", "MED", 0, _N,
     (0, 0.05, 0.5, 0.3), (0, 0.1, 1.2, 0.8), _N, _N),
    ("G03.9", "Meningitis, unspecified", "VI", "G00-G09", "Inflammatory diseases of the central nervous system",
     "critical", "MED", 0, "MEN", (0.12, 0.06, 0.04, 0.03), (0, 0, 0, 0), _N, _N),
    ("G40.9", "Epilepsy, unspecified", "VI", "G40-G47", "Episodic and paroxysmal disorders", "moderate", "MED", 1, _N,
     (0.6, 0.8, 1.5, 0.6), (0.3, 0.6, 1.0, 0.4), _N, _N),
    ("H25.9", "Senile cataract, unspecified", "VII", "H25-H28", "Disorders of lens", "minor", "SUR", 0, _N,
     (0, 0, 0, 0), (0, 0, 0, 0), _N, _N),
    ("I10", "Essential (primary) hypertension", "IX", "I10-I15", "Hypertensive diseases", "minor", "MED", 1, _N,
     (0, 0, 2.5, 4.0), (0, 0, 9.0, 14.0), _N, _N),
    ("I21.9", "Acute myocardial infarction, unspecified", "IX", "I20-I25", "Ischaemic heart diseases", "critical",
     "ICU", 1, _N, (0, 0, 0.5, 1.5), (0, 0, 0, 0), _N, _N),
    ("I50.9", "Heart failure, unspecified", "IX", "I30-I52", "Other forms of heart disease", "serious", "MED", 1, _N,
     (0, 0.02, 1.0, 4.5), (0, 0, 0.4, 1.5), _N, _N),
    ("I64", "Stroke, not specified as haemorrhage or infarction", "IX", "I60-I69", "Cerebrovascular diseases",
     "critical", "MED", 1, _N, (0, 0, 0.8, 3.5), (0, 0, 0, 0), _N, _N),
    ("J06.9", "Acute upper respiratory infection, unspecified", "X", "J00-J06", "Acute upper respiratory infections",
     "minor", "MED", 0, _N, (12, 8, 5, 3), (22, 16, 12, 8), _N, "winter"),
    ("J18.9", "Pneumonia, unspecified", "X", "J09-J18", "Influenza and pneumonia", "serious", "MED", 0, "PNE",
     (9, 3, 3, 6), (3, 1, 1, 2), _N, "winter"),
    ("J44.9", "Chronic obstructive pulmonary disease, unspecified", "X", "J40-J47", "Chronic lower respiratory diseases",
     "serious", "MED", 1, _N, (0, 0, 0.6, 3.0), (0, 0, 0.5, 2.0), _N, "winter"),
    ("J45.9", "Asthma, unspecified", "X", "J40-J47", "Chronic lower respiratory diseases", "moderate", "MED", 1, _N,
     (1.0, 2.5, 2.5, 1.5), (0.8, 2.0, 2.0, 1.2), _N, _N),
    ("K02.9", "Dental caries, unspecified", "XI", "K00-K14", "Diseases of oral cavity, salivary glands and jaws",
     "minor", "SUR", 0, _N, (0.2, 0.8, 1.2, 0.4), (0.5, 3, 4, 1.5), _N, _N),
    ("K29.7", "Gastritis, unspecified", "XI", "K20-K31", "Diseases of oesophagus, stomach and duodenum", "minor",
     "MED", 0, _N, (0, 0.5, 3.0, 2.0), (0, 0.5, 3, 2), _N, _N),
    ("K35.8", "Acute appendicitis, other and unspecified", "XI", "K35-K38", "Diseases of appendix", "serious", "SUR",
     0, _N, (0.1, 1.0, 1.2, 0.3), (0, 0, 0, 0), _N, _N),
    ("K40.9", "Unilateral or unspecified inguinal hernia, without obstruction or gangrene", "XI", "K40-K46", "Hernia",
     "minor", "SUR", 0, _N, (0, 0, 0, 0), (0, 0, 0, 0), _N, _N),
    ("K80.2", "Calculus of gallbladder without cholecystitis", "XI", "K80-K87",
     "Disorders of gallbladder, biliary tract and pancreas", "minor", "SUR", 0, _N, (0, 0, 0, 0), (0, 0, 0, 0), _N, _N),
    ("L03.9", "Cellulitis, unspecified", "XII", "L00-L08", "Infections of the skin and subcutaneous tissue",
     "moderate", "MED", 0, _N, (1.0, 1.5, 2.5, 2.0), (2, 3, 4, 3), _N, _N),
    ("M17.9", "Gonarthrosis, unspecified", "XIII", "M15-M19", "Arthrosis", "minor", "SUR", 0, _N,
     (0, 0, 0, 0), (0, 0, 0, 0), _N, _N),
    ("M54.5", "Low back pain", "XIII", "M50-M54", "Other dorsopathies", "minor", "MED", 0, _N,
     (0, 0.1, 2.5, 2.0), (0, 0.2, 5, 4), _N, _N),
    ("N18.9", "Chronic kidney disease, unspecified", "XIV", "N17-N19", "Renal failure", "serious", "MED", 1, _N,
     (0, 0, 0.4, 1.2), (0, 0, 0.3, 0.8), _N, _N),
    ("N39.0", "Urinary tract infection, site not specified", "XIV", "N30-N39", "Other diseases of urinary system",
     "minor", "MED", 0, _N, (0.8, 1.0, 3.0, 3.0), (1, 1.5, 5, 4), _N, _N),
    ("N40", "Hyperplasia of prostate", "XIV", "N40-N51", "Diseases of male genital organs", "minor", "SUR", 0, _N,
     (0, 0, 0, 0), (0, 0, 0, 0), "M", _N),
    ("O14.1", "Severe pre-eclampsia", "XV", "O10-O16",
     "Oedema, proteinuria and hypertensive disorders in pregnancy, childbirth and the puerperium", "serious", "MAT",
     0, _N, (0, 0, 0, 0), (0, 0, 0, 0), "F", _N),
    ("O47.9", "False labour, unspecified", "XV", "O30-O48",
     "Maternal care related to the fetus and amniotic cavity and possible delivery problems", "minor", "MAT", 0, _N,
     (0, 0, 0, 0), (0, 0, 0, 0), "F", _N),
    ("O60.1", "Preterm spontaneous labour with preterm delivery", "XV", "O60-O75",
     "Complications of labour and delivery", "serious", "MAT", 0, _N, (0, 0, 0, 0), (0, 0, 0, 0), "F", _N),
    ("O72.1", "Other immediate postpartum haemorrhage", "XV", "O60-O75", "Complications of labour and delivery",
     "critical", "MAT", 0, _N, (0, 0, 0, 0), (0, 0, 0, 0), "F", _N),
    ("O80", "Single spontaneous delivery", "XV", "O80-O84", "Delivery", "minor", "MAT", 0, _N,
     (0, 0, 0, 0), (0, 0, 0, 0), "F", _N),
    ("O82", "Single delivery by caesarean section", "XV", "O80-O84", "Delivery", "moderate", "MAT", 0, _N,
     (0, 0, 0, 0), (0, 0, 0, 0), "F", _N),
    ("R07.4", "Chest pain, unspecified", "XVIII", "R00-R09",
     "Symptoms and signs involving the circulatory and respiratory systems", "moderate", "MED", 0, _N,
     (0, 0.2, 3.0, 3.0), (0, 0.1, 1, 1), _N, _N),
    ("R10.4", "Other and unspecified abdominal pain", "XVIII", "R10-R19",
     "Symptoms and signs involving the digestive system and abdomen", "moderate", "SUR", 0, _N,
     (1.5, 3, 7, 5), (1.5, 3, 4, 3), _N, _N),
    ("R50.9", "Fever, unspecified", "XVIII", "R50-R69", "General symptoms and signs", "moderate", "MED", 0, _N,
     (6, 4, 2, 2), (5, 3, 2, 1.5), _N, _N),
    ("R51", "Headache", "XVIII", "R50-R69", "General symptoms and signs", "minor", "MED", 0, _N,
     (0, 1, 2.5, 1), (0, 1.5, 3, 1.5), _N, _N),
    ("R99", "Other ill-defined and unspecified causes of mortality", "XVIII", "R95-R99",
     "Ill-defined and unknown causes of mortality", "critical", "MED", 0, _N, (0, 0, 0, 0), (0, 0, 0, 0), _N, _N),
    ("S01.9", "Open wound of head, part unspecified", "XIX", "S00-S09", "Injuries to the head", "moderate", "SUR", 0,
     _N, (1.0, 2.5, 5.0, 1.5), (0.3, 0.8, 1.2, 0.3), _N, "night"),
    ("S06.0", "Concussion", "XIX", "S00-S09", "Injuries to the head", "serious", "SUR", 0, _N,
     (0.5, 1.0, 2.0, 1.0), (0, 0, 0, 0), _N, "night"),
    ("S52.5", "Fracture of lower end of radius", "XIX", "S50-S59", "Injuries to the elbow and forearm", "moderate",
     "SUR", 0, _N, (0.3, 2.0, 1.5, 2.0), (0, 0, 0, 0), _N, _N),
    ("S72.0", "Fracture of neck of femur", "XIX", "S70-S79", "Injuries to the hip and thigh", "serious", "SUR", 0, _N,
     (0, 0.05, 0.3, 3.0), (0, 0, 0, 0), _N, _N),
    ("T14.1", "Open wound of unspecified body region", "XIX", "T08-T14",
     "Injuries to unspecified part of trunk, limb or body region", "minor", "SUR", 0, _N,
     (0.6, 1.5, 3.0, 0.8), (0.5, 1.0, 1.5, 0.5), _N, "night"),
    ("T14.9", "Injury, unspecified", "XIX", "T08-T14", "Injuries to unspecified part of trunk, limb or body region",
     "moderate", "SUR", 0, _N, (1.0, 2.0, 6.0, 2.0), (0.5, 1, 2, 0.6), _N, "night"),
    ("T30.0", "Burn of unspecified body region, unspecified degree", "XIX", "T20-T32", "Burns and corrosions",
     "moderate", "SUR", 0, _N, (1.2, 0.6, 0.8, 0.3), (0.5, 0.3, 0.4, 0.2), _N, "winter"),
    ("T63.0", "Toxic effect: Snake venom", "XIX", "T51-T65",
     "Toxic effects of substances chiefly nonmedicinal as to source", "serious", "MED", 0, _N,
     (0.05, 0.3, 0.6, 0.2), (0, 0, 0, 0), _N, "summer"),
    ("T65.9", "Toxic effect: Unspecified substance", "XIX", "T51-T65",
     "Toxic effects of substances chiefly nonmedicinal as to source", "serious", "MED", 0, _N,
     (0.6, 0.3, 0.6, 0.2), (0, 0, 0, 0), _N, _N),
    ("U07.1", "COVID-19, virus identified", "XXII", "U00-U49",
     "Provisional assignment of new diseases of uncertain etiology or emergency use", "moderate", "MED", 0, "COV",
     (0, 0, 0, 0), (0, 0, 0, 0), _N, _N),
    ("Z00.0", "General medical examination", "XXI", "Z00-Z13",
     "Persons encountering health services for examination and investigation", "minor", "MED", 0, _N,
     (0, 0, 0, 0), (2, 2, 3, 2), _N, _N),
    ("Z21", "Asymptomatic human immunodeficiency virus [HIV] infection status", "XXI", "Z20-Z29",
     "Persons with potential health hazards related to communicable diseases", "minor", "MED", 1, _N,
     (0, 0, 0, 0), (0.3, 0.6, 10, 3), _N, _N),
    ("Z34.9", "Supervision of normal pregnancy, unspecified", "XXI", "Z30-Z39",
     "Persons encountering health services in circumstances related to reproduction", "minor", "MAT", 0, _N,
     (0, 0, 0, 0), (0, 0, 14, 0), "F", _N),
    ("Z76.0", "Issue of repeat prescription", "XXI", "Z70-Z76",
     "Persons encountering health services in other circumstances", "minor", "MED", 0, _N,
     (0, 0, 0, 0), (0.2, 0.5, 6, 10), _N, _N),
]
ICD_BY = {r[0]: r for r in ICD}
CODES = [r[0] for r in ICD]
SEV = {r[0]: r[5] for r in ICD}
SPEC = {r[0]: r[6] for r in ICD}
CHRONIC = {r[0]: r[7] for r in ICD}
COND_OF = {r[0]: r[8] for r in ICD if r[8]}
NIGHT_CODES = {r[0] for r in ICD if r[12] == "night"}
ADMIT_FACTOR = {"B50.9": 0.55, "B54": 0.45, "U07.1": 0.9, "J06.9": 0.4, "I10": 0.6, "R51": 0.5}

CONDITIONS = [
    # code, name, IDSR category, notification, alert threshold (GBHS SOP), ICD-10 codes, aliases used in returns
    ("MAL", "Malaria (confirmed)", "Epidemic-prone and targeted for elimination", "Weekly",
     "Weekly cases above mean + 2 SD of the same week in previous years", "B50-B54", ["Malaria", "MALARIA", "Malaria - confirmed"]),
    ("COV", "COVID-19", "Epidemic-prone (formidable epidemic disease)", "Immediate (within 24 hours)",
     "Any confirmed case; cluster of 5 linked cases", "U07.1", ["Covid-19", "COVID19", "Coronavirus disease"]),
    ("MEA", "Measles", "Targeted for elimination", "Immediate (within 24 hours)",
     "1 suspected case = alert; 3 confirmed cases in a month = outbreak", "B05", ["MEASLES", "Measles (suspected)"]),
    ("AWD", "Acute watery diarrhoea", "Epidemic-prone", "Weekly",
     "Doubling of weekly cases compared with the previous 4-week mean", "A09", ["Diarrhoea", "AWD", "Acute diarrhoea"]),
    ("HEV", "Hepatitis E", "Epidemic-prone", "Weekly", "2 or more cases in a week from one locality", "B17.2",
     ["Hep E", "Hepatitis-E", "HEPATITIS E"]),
    ("TYP", "Typhoid fever", "Epidemic-prone", "Weekly", "3 or more cases in a week", "A01.0", ["Typhoid", "TYPHOID"]),
    ("MEN", "Meningitis", "Epidemic-prone", "Immediate (within 24 hours)", "2 or more cases in a week",
     "A39, G03", ["Meningococcal meningitis", "MENINGITIS"]),
    ("RAB", "Human rabies", "Other priority disease", "Immediate (within 24 hours)", "Any case", "A82",
     ["Rabies", "RABIES"]),
    ("PNE", "Pneumonia", "Other priority disease", "Weekly", "Weekly cases above mean + 2 SD of the previous 8 weeks",
     "J18", ["Pneumonia (all ages)", "PNEUMONIA"]),
]
COND_CODES = [c[0] for c in CONDITIONS]

PAYERS = [
    ("PSEMAS", "Public service medical aid (PSEMAS)", "Medical aid", ["Psemas", "PSEMAS ", "P.S.E.M.A.S"]),
    ("PMA", "Private medical aid scheme", "Medical aid", ["Med Aid", "Private MA", "pma"]),
    ("SSC-MVA", "Statutory cover (SSC employees' compensation / MVA Fund)", "Statutory", ["MVA", "SSC"]),
    ("MOHSS", "State-referred patient (MoHSS public-private partnership)", "Government", ["MoHSS", "State"]),
    ("CASH", "Self-pay / uninsured", "Self-pay", ["Cash", "cash", "Self pay"]),
]
PAYER_URBAN = [0.24, 0.30, 0.03, 0.23, 0.20]
PAYER_RURAL = [0.20, 0.08, 0.02, 0.52, 0.18]

# Hourly arrival profiles (relative weights for 00..23)
HOUR_ED = np.array([0.8, 0.6, 0.5, 0.4, 0.4, 0.6, 1.2, 2.4, 4.0, 5.0, 5.2, 5.0, 4.6, 4.4, 4.3, 4.4, 4.6, 4.9, 5.0,
                    4.6, 4.0, 3.2, 2.2, 1.4])
HOUR_NIGHT = np.array([3.2, 2.8, 2.2, 1.6, 1.2, 1.0, 1.0, 1.4, 2.0, 2.4, 2.6, 2.8, 3.0, 3.0, 3.0, 3.2, 3.6, 4.2, 4.8,
                       5.4, 5.8, 5.6, 5.0, 4.0])
HOUR_OPD = np.zeros(24); HOUR_OPD[7:16] = [7.0, 6.0, 4.6, 3.6, 3.0, 2.2, 2.4, 2.0, 1.2]
HOUR_OPD_SAT = np.zeros(24); HOUR_OPD_SAT[8:12] = [5.0, 4.0, 3.0, 1.5]
DOW_ED = np.array([1.12, 1.02, 1.00, 0.98, 1.03, 0.95, 0.90])
DOW_OPD = np.array([1.15, 1.05, 1.00, 0.98, 0.95, 0.45, 0.0])
SEASON_MULT = {   # month multipliers (Jan..Dec)
    "rainy": np.array([1.5, 1.5, 1.35, 1.1, 0.85, 0.75, 0.7, 0.7, 0.75, 0.85, 1.0, 1.3]),
    "winter": np.array([0.8, 0.8, 0.85, 0.95, 1.15, 1.45, 1.5, 1.35, 1.05, 0.9, 0.8, 0.8]),
    "summer": np.array([1.4, 1.4, 1.3, 1.0, 0.6, 0.4, 0.4, 0.5, 0.8, 1.1, 1.3, 1.4]),
    "night": np.ones(12),
}

# Weather climatology per facility climate type
RAIN_SHARE = {
    "summer": [0.19, 0.20, 0.17, 0.07, 0.01, 0.0, 0.0, 0.0, 0.01, 0.04, 0.11, 0.20],
    "south": [0.17, 0.22, 0.22, 0.09, 0.03, 0.01, 0.01, 0.01, 0.02, 0.04, 0.07, 0.11],
    "coastal": [0.12, 0.18, 0.22, 0.12, 0.06, 0.04, 0.02, 0.02, 0.03, 0.05, 0.06, 0.08],
}
CLIMATE = {   # annual rain (mm), rain profile, Tmax mean, amplitude, hottest day-of-year, Tmin mean, amplitude
    "northeast": (570, "summer", 30.5, 4.0, 300, 13.5, 7.5),
    "zambezi": (680, "summer", 31.0, 3.5, 290, 15.0, 7.0),
    "northcentral": (480, "summer", 31.0, 4.0, 300, 14.0, 7.5),
    "centralnorth": (460, "summer", 28.5, 4.5, 330, 12.0, 7.5),
    "central": (360, "summer", 26.5, 4.5, 345, 11.5, 7.0),
    "south": (160, "south", 28.5, 6.5, 15, 13.0, 7.5),
    "coastal": (14, "coastal", 20.5, 2.5, 60, 13.5, 2.5),
}
# Rainy-season factor by season start year (season = July..June); 2023/24 = El Nino drought-like season
SEASON_RAIN_FACTOR = {2021: 1.05, 2022: 0.92, 2023: 0.62, 2024: 1.22, 2025: 1.32, 2026: 1.0}

# Malaria: cases/day at a rainfall index of 1, and the unexplained season amplitude (vector control,
# imported cases, drug stock); calibrated so the network follows the national pattern (low 2022-2024,
# upsurge 2025, larger upsurge 2026)
MALARIA_BASE = {"GBH-RUN": 21.0, "GBH-KAT": 18.0, "GBC-NKU": 15.0, "GBC-EEN": 2.7, "GBH-OSH": 2.25, "GBC-OTJ": 0.66}
MALARIA_IMPORTED = {"GBH-WHK": 1.1, "GBC-KTU": 0.8, "GBH-WVB": 0.24, "GBC-KMP": 0.12}
MALARIA_AMPLITUDE = {2021: 0.40, 2022: 0.42, 2023: 0.32, 2024: 0.98, 2025: 1.17, 2026: 1.0}

COVID_WAVES = [(date(2021, 12, 20), 14, 34.0), (date(2022, 6, 5), 14, 16.0), (date(2022, 12, 28), 12, 5.0),
               (date(2023, 7, 5), 16, 3.5)]
COVID_SHARE = {"GBH-WHK": 0.30, "GBC-KTU": 0.15, "GBH-WVB": 0.15, "GBH-OSH": 0.14, "GBH-RUN": 0.07, "GBH-KAT": 0.05,
               "GBC-EEN": 0.04, "GBC-NKU": 0.03, "GBC-KMP": 0.03, "GBC-OTJ": 0.04}

OUTBREAKS = [
    # id, facility, ICD code, start (Monday), weeks, extra cases, age focus, description
    ("OB01", "GBC-KTU", "B17.2", date(2022, 7, 11), 12, 72, "adult", "Hepatitis E, informal settlement water supply"),
    ("OB02", "GBH-OSH", "B05.9", date(2022, 10, 3), 5, 24, "child", "Measles cluster"),
    ("OB03", "GBC-KTU", "A09", date(2023, 2, 6), 5, 140, "all", "Acute watery diarrhoea after a water-supply interruption"),
    ("OB04", "GBH-WHK", "B54", date(2023, 4, 17), 4, 30, "adult", "Imported malaria after Easter travel"),
    ("OB05", "GBH-OSH", "B50.9", date(2023, 8, 7), 4, 28, "adult", "Off-season imported malaria cluster"),
    ("OB06", "GBC-OTJ", "A01.0", date(2023, 11, 6), 5, 16, "all", "Typhoid fever cluster"),
    ("OB07", "GBH-RUN", "B05.9", date(2024, 3, 4), 8, 46, "child", "Measles outbreak"),
    ("OB08", "GBC-NKU", "B05.9", date(2024, 3, 18), 6, 22, "child", "Measles outbreak (spread from Rundu)"),
    ("OB09", "GBH-WVB", "B17.2", date(2024, 8, 12), 6, 26, "adult", "Hepatitis E cluster"),
    ("OB10", "GBC-EEN", "A09", date(2025, 1, 13), 4, 60, "child", "Acute watery diarrhoea in children"),
    ("OB11", "GBH-KAT", "A39.0", date(2025, 8, 11), 4, 9, "child", "Meningococcal meningitis cluster"),
    ("OB12", "GBC-KMP", "A09", date(2026, 3, 2), 3, 30, "all", "Acute watery diarrhoea"),
]

# Readmission truth model (emergency readmission within 30 days of discharge)
READMIT = dict(intercept=-3.55, age65=0.95, age45_64=0.40, chronic=0.85, los_per_day=0.04, weekend_discharge=0.45,
               ama=1.10, payer_cash=0.35, frailty=0.60, maternity=-1.50)

CODE_MAPS = {   # steward-maintained code mappings (raw value -> standard); unmapped raw values go to Unknown
    "DISPOSITION": {"DIS": "DIS", "Discharged": "DIS", "DISCH": "DIS", "Home": "DIS", "ADM": "ADM", "Admitted": "ADM",
                    "admit": "ADM", "A": "ADM", "TRF": "TRF", "Transfer": "TRF", "LWBS": "LWBS", "lwbs": "LWBS",
                    "LWOBS": "LWBS", "DIED": "DIED", "Died": "DIED", "REF": "REF", "Referred": "REF"},
    "ARRIVAL_MODE": {"WALK": "WALK", "Walk in": "WALK", "WALK-IN": "WALK", "AMB": "AMB", "Ambulance": "AMB",
                     "amb": "AMB", "REF": "REF", "Referral": "REF"},
    "TRIAGE": {"RED": "RED", "Red": "RED", "red": "RED", "ORANGE": "ORANGE", "Orange": "ORANGE", "orange": "ORANGE",
               "YELLOW": "YELLOW", "Yellow": "YELLOW", "yellow": "YELLOW", "YEL": "YELLOW", "GREEN": "GREEN",
               "Green": "GREEN", "green": "GREEN", "GRN": "GREEN", "BLUE": "BLUE", "Blue": "BLUE"},
    "ADMISSION_METHOD": {"EMER-ED": "EMER-ED", "Emergency": "EMER-ED", "EMERG-ED": "EMER-ED", "EMER-DIRECT": "EMER-DIRECT",
                         "ELECTIVE": "ELECTIVE", "elective": "ELECTIVE", "Elective": "ELECTIVE", "MATERNITY": "MATERNITY",
                         "Maternity": "MATERNITY", "TRANSFER-IN": "TRANSFER-IN", "Transfer in": "TRANSFER-IN"},
    "DISCHARGE_STATUS": {"HOME": "HOME", "Home": "HOME", "TRANSFER": "TRANSFER", "DIED": "DIED", "Died": "DIED",
                         "AMA": "AMA", "Absconded": "AMA"},
    "SHIFT": {"D": "D", "Day": "D", "DAY": "D", "N": "N", "Night": "N", "N/S": "N"},
    "SEX": {"F": "F", "M": "M", "Female": "F", "female": "F", "f": "F", "Male": "M", "male": "M", "m": "M", "U": "U"},
}
CODE_LIST_DESC = {
    "DISPOSITION": {"DIS": "Discharged home", "ADM": "Admitted to a ward", "TRF": "Transferred to another facility",
                    "LWBS": "Left without being seen", "DIED": "Died in the department", "REF": "Referred to hospital"},
    "ARRIVAL_MODE": {"WALK": "Walk-in / own transport", "AMB": "Ambulance", "REF": "Referral from another facility"},
    "ADMISSION_METHOD": {"EMER-ED": "Emergency admission via the emergency department",
                         "EMER-DIRECT": "Emergency admission direct to a ward",
                         "ELECTIVE": "Elective (planned) admission", "MATERNITY": "Maternity admission (labour ward)",
                         "TRANSFER-IN": "Transfer in from another hospital"},
    "DISCHARGE_STATUS": {"HOME": "Discharged home", "TRANSFER": "Transferred out", "DIED": "Died in hospital",
                         "AMA": "Left against medical advice / absconded"},
    "SHIFT": {"D": "Day shift 07:00-19:00", "N": "Night shift 19:00-07:00"},
}


# ---------------------------------------------------------------------------
# Calendar helpers
# ---------------------------------------------------------------------------
def easter_sunday(y: int) -> date:
    a, b, c = y % 19, y // 100, y % 100
    d, e = b // 4, b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    l_ = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l_) // 451
    month = (h + l_ - 7 * m + 114) // 31
    day = ((h + l_ - 7 * m + 114) % 31) + 1
    return date(y, month, day)


def namibian_holiday(d: date):
    """Public Holidays Act 26 of 1990 (Sunday holidays observed on Monday); Genocide Remembrance Day from 2025.
    Same logic and order as etl.fn_namibian_holiday in 04_etl_functions.sql."""
    e = easter_sunday(d.year)
    if d == e - timedelta(days=2):
        return "Good Friday"
    if d == e + timedelta(days=1):
        return "Easter Monday"
    if d == e + timedelta(days=39):
        return "Ascension Day"
    for m, dd, n in [(1, 1, "New Year's Day"), (3, 21, "Independence Day"), (5, 1, "Workers' Day"),
                     (5, 4, "Cassinga Day"), (5, 25, "Africa Day"), (5, 28, "Genocide Remembrance Day"),
                     (8, 26, "Heroes' Day"), (12, 10, "Human Rights Day"), (12, 25, "Christmas Day"),
                     (12, 26, "Family Day")]:
        if n == "Genocide Remembrance Day" and d.year < 2025:
            continue
        obs = date(d.year, m, dd)
        if d == obs:
            return n
        if obs.isoweekday() == 7 and d == obs + timedelta(days=1):
            return n + " (observed)"
    return None


def iso_week_label(d: date) -> str:
    y, w, _ = d.isocalendar()
    return f"{y}-W{w:02d}"


def age_group(age: np.ndarray) -> np.ndarray:
    return np.select([age < 5, age < 15, age < 65], [0, 1, 2], 3)


def sigmoid(x):
    return 1.0 / (1.0 + np.exp(-x))


# ---------------------------------------------------------------------------
class Generator:
    def __init__(self, out: Path, seed: int):
        self.out = out
        self.seed = seed
        self.rng = np.random.default_rng(seed)
        self.manifest: dict = {"seed": seed, "numpy_version": np.__version__, "pandas_version": pd.__version__,
                               "python_version": platform.python_version(), "data_start": str(START),
                               "cutoff": str(CUTOFF), "delta_date": str(DELTA_DATE), "injected_defects": {},
                               "row_counts": {}, "truth": {}}
        self.truth_keys: dict[str, list] = defaultdict(list)
        self._pcache: dict = {}

    def note(self, key: str, value):
        self.manifest["injected_defects"][key] = value

    def count(self, key: str, value):
        self.manifest["row_counts"][key] = int(value)

    # ------------------------------------------------------------ calendar
    def build_calendar(self):
        self.days = pd.date_range(SIM_START, DELTA_DATE, freq="D")
        self.D = len(self.days)
        self.dow = self.days.dayofweek.values
        self.month = self.days.month.values
        self.year = self.days.year.values
        self.hol = np.array([namibian_holiday(x.date()) is not None for x in self.days])
        self.t_start = (START - SIM_START).days
        self.t_cut = (CUTOFF - SIM_START).days
        self.t_delta = (DELTA_DATE - SIM_START).days

    def bed_complement(self, unit: str, d: date, include_delta=False) -> int:
        beds = UNIT_BY_CODE[unit][5]
        changes = UNIT_CHANGES + (UNIT_CHANGES_DELTA if include_delta else [])
        for u, attr, _o, new, eff, _r in sorted(changes, key=lambda c: c[4]):
            if u == unit and attr == "bed_complement" and eff <= d:
                beds = int(new)
        return beds

    def specialty_on(self, unit: str, d: date) -> str:
        spec = UNIT_BY_CODE[unit][4]
        for u, attr, _o, new, eff, _r in sorted(UNIT_CHANGES, key=lambda c: c[4]):
            if u == unit and attr == "specialty" and eff <= d:
                spec = new
        return spec

    # ------------------------------------------------------------ 1 weather (NASA POWER stand-in)
    def gen_weather(self):
        rng = self.rng
        days = pd.date_range(WEATHER_START, DELTA_DATE, freq="D")
        n = len(days)
        months, doy = days.month.values, days.dayofyear.values
        sy = np.where(months >= 7, days.year.values, days.year.values - 1)
        self.weather = {}
        for f in FACILITIES:
            annual, prof, tmx, tamp, hot, tmn, namp = CLIMATE[f["climate"]]
            share = np.array(RAIN_SHARE[prof]); share = share / share.sum()
            mean_daily = annual * share[months - 1] / days.days_in_month.values
            p_wet = np.clip(mean_daily / 9.0, 0.0, 0.55)
            sf = np.array([SEASON_RAIN_FACTOR.get(int(y), 1.0) for y in sy]) * rng.normal(1.0, 0.06)
            wet = rng.random(n) < p_wet * np.clip(0.55 + 0.45 * sf, 0.3, 1.4)
            amt_mean = np.where(p_wet > 0, mean_daily / np.maximum(p_wet, 1e-6), 0.0)
            rain = np.where(wet, rng.gamma(0.85, np.maximum(amt_mean, 0.01) / 0.85) * np.clip(sf, 0.2, 2.0) ** 0.6, 0.0)
            rain = np.round(np.minimum(rain, 150.0), 2)
            ar = np.zeros(n)
            noise = rng.normal(0, 1.4, n)
            for i in range(1, n):
                ar[i] = 0.7 * ar[i - 1] + noise[i]
            tmax = tmx + tamp * np.cos(2 * np.pi * (doy - hot) / 365.25) + ar - 2.6 * wet
            tmin = np.minimum(tmn + namp * np.cos(2 * np.pi * (doy - 20) / 365.25) + 0.5 * ar + 1.0 * wet, tmax - 6.0)
            rh = np.clip(30 + 38 * wet + 160 * share[months - 1] + rng.normal(0, 6, n), 8, 98)
            if f["climate"] == "coastal":
                rh = np.clip(rh + 35, 8, 98)
            self.weather[f["code"]] = pd.DataFrame({"PRECTOTCORR": rain, "T2M_MAX": np.round(tmax, 2),
                                                    "T2M_MIN": np.round(tmin, 2), "RH2M": np.round(rh, 2)},
                                                   index=days.date)

    # ------------------------------------------------------------ 2 disease intensity curves
    def gen_disease_curves(self):
        F, D = len(FACILITIES), self.D
        sim_dates = self.days.date
        sy = np.where(self.month >= 7, self.year, self.year - 1)
        amp = np.array([MALARIA_AMPLITUDE[int(y)] for y in sy])
        self.lam_mal = np.zeros((F, D))
        endemic = {}
        for code, base in MALARIA_BASE.items():
            w = self.weather[code]["PRECTOTCORR"]
            lag = w.rolling(36).sum().shift(21)            # rain 21-56 days earlier
            lag = lag.reindex(sim_dates).to_numpy()
            ref = np.nanmean(lag[(self.month <= 5)])
            idx = np.power(np.clip(lag / ref, 0, None), 1.3)
            endemic[code] = idx
            self.lam_mal[FAC_INDEX[code]] = base * amp * idx + base * 0.02
        ne = np.mean([endemic[c] for c in ("GBH-RUN", "GBH-KAT", "GBC-NKU")], axis=0)
        ne_lag = np.concatenate([np.full(7, ne[0]), ne[:-7]])
        for code, base in MALARIA_IMPORTED.items():
            self.lam_mal[FAC_INDEX[code]] = base * amp * ne_lag + base * 0.05
        # COVID-19 waves (network level) split by facility share
        t = np.arange(D)
        net = np.zeros(D)
        for c, sd, peak in COVID_WAVES:
            tc = (c - SIM_START).days
            net += peak * np.exp(-0.5 * ((t - tc) / sd) ** 2)
        net += 0.6 * np.exp(-t / 500.0)
        self.lam_cov = np.zeros((F, D))
        for code, s in COVID_SHARE.items():
            self.lam_cov[FAC_INDEX[code]] = net * s
        # clinics are closed on Sundays and public holidays: their extra cases present the next open day
        for f in FACILITIES:
            if f["opd"] > 0:
                i = FAC_INDEX[f["code"]]
                closed = (self.dow == 6) | self.hol
                for arr in (self.lam_mal, self.lam_cov):
                    carry = 0.0
                    for d in range(D):
                        if closed[d]:
                            carry += arr[i, d]
                            arr[i, d] = 0.0
                        elif carry > 0:
                            arr[i, d] += 0.8 * carry
                            carry = 0.0
        # outbreak extra cases (deterministic expected counts per day)
        self.ob_rows = []
        for ob_id, fac, code, start, weeks, total, focus, _desc in OUTBREAKS:
            k = np.arange(weeks)
            peak = max(1.0, weeks / 3.0)
            wts = np.where(k <= peak, (k + 1) / (peak + 1), np.maximum(0.15, 1 - (k - peak) / (weeks - peak + 0.5)))
            wts = wts / wts.sum() * total
            for wk in range(weeks):
                for dd in range(7):
                    day = start + timedelta(days=7 * wk + dd)
                    t_i = (day - SIM_START).days
                    if FAC_BY_CODE[fac]["opd"] > 0 and (self.dow[t_i] == 6 or self.hol[t_i]):
                        continue
                    self.ob_rows.append((ob_id, FAC_INDEX[fac], t_i, code, focus, wts[wk] / 7.0))
        self.manifest["truth"]["outbreaks"] = [
            dict(outbreak_id=o[0], facility_code=o[1], icd10=o[2], condition=COND_OF[o[2]], start_week=iso_week_label(o[3]),
                 start_date=str(o[3]), weeks=o[4], extra_cases_expected=o[5], age_focus=o[6], description=o[7])
            for o in OUTBREAKS]

    # ------------------------------------------------------------ 3 patients (pseudonymised MPI)
    def gen_patients(self):
        rng = self.rng
        weights = {}
        for f in FACILITIES:
            vol = (f["ed"] * 365 + f["opd"] * 300) + 365 * (MALARIA_BASE.get(f["code"], 0) + MALARIA_IMPORTED.get(f["code"], 0)) * 0.6
            weights[f["code"]] = vol
        total = 150000
        tot_w = sum(weights.values())
        rows = []
        by = np.arange(1928, 2027)
        age24 = 2024 - by
        w_by = np.select([age24 < 5, age24 < 15, age24 < 25, age24 < 45, age24 < 65, age24 < 80],
                         [1.30, 0.95, 0.90, 1.0, 0.80, 0.42], 0.15 * np.exp(-(age24 - 80) / 6.0))
        w_by = w_by / w_by.sum()
        pid_set = set()
        for f in FACILITIES:
            n = int(round(total * weights[f["code"]] / tot_w))
            birth = rng.choice(by, size=n, p=w_by)
            adult = (2024 - birth) >= 15
            sex = np.where(rng.random(n) < np.where(adult, 0.58, 0.50), "F", "M")
            frailty = rng.normal(0, 1, n)
            prop = rng.gamma(0.7, 1 / 0.7, n) * np.exp(0.35 * frailty)
            other = rng.random(n) < 0.07
            pops = np.array([r[4] for r in REGIONS], dtype=float)
            reg = np.where(other, rng.choice([r[0] for r in REGIONS], size=n, p=pops / pops.sum()), f["region"])
            urban = f["region"] in ("NA-KH", "NA-ER")
            payer = rng.choice([p[0] for p in PAYERS], size=n, p=PAYER_URBAN if urban else PAYER_RURAL)
            payer = np.where((2024 - birth) < 18, np.where(payer == "SSC-MVA", "MOHSS", payer), payer)
            bdoy = rng.integers(1, 366, n)
            tokens = rng.integers(0, 2 ** 48, n)
            for i in range(n):
                tok = int(tokens[i])
                while f"P{tok:012X}" in pid_set:
                    tok = int(rng.integers(0, 2 ** 48))
                pid = f"P{tok:012X}"
                pid_set.add(pid)
                rows.append((pid, f["code"], sex[i], int(birth[i]), int(bdoy[i]), float(prop[i]), float(frailty[i]),
                             reg[i], payer[i]))
        self.pat = pd.DataFrame(rows, columns=["patient_id", "home_fac", "sex", "birth_year", "bdoy", "propensity",
                                               "frailty", "region0", "payer0"])
        self.pat["home_idx"] = self.pat.home_fac.map(FAC_INDEX)
        # attribute changes (SCD Type 2 source): payer class (12% of adults), residence region (3%)
        changes = []
        P = len(self.pat)
        adult = (2024 - self.pat.birth_year.values) >= 18
        pay_ch = np.where(adult & (rng.random(P) < 0.12))[0]
        reg_ch = np.where(rng.random(P) < 0.03)[0]
        lo, hi = date(2022, 2, 1), date(2026, 9, 25)
        span = (hi - lo).days
        payer_codes = [p[0] for p in PAYERS]
        for i in pay_ch:
            old = self.pat.payer0.iat[i]
            new = rng.choice([p for p in payer_codes if p != old and p != "SSC-MVA"])
            changes.append((self.pat.patient_id.iat[i], "payer_class", old, new, lo + timedelta(days=int(rng.integers(0, span)))))
        reg_codes = [r[0] for r in REGIONS]
        for i in reg_ch:
            old = self.pat.region0.iat[i]
            new = rng.choice(["NA-KH", "NA-ER", rng.choice(reg_codes)], p=[0.5, 0.2, 0.3])
            if new == old:
                continue
            changes.append((self.pat.patient_id.iat[i], "residence_region", old, new, lo + timedelta(days=int(rng.integers(0, span)))))
        self.pat_changes = pd.DataFrame(changes, columns=["patient_id", "attribute", "old_value", "new_value", "effective_date"])
        self.pat_changes = self.pat_changes.sort_values(["effective_date", "patient_id", "attribute"]).reset_index(drop=True)
        last = self.pat_changes.groupby(["patient_id", "attribute"]).new_value.last().unstack()
        self.pat["payer_cur"] = self.pat.patient_id.map(last.get("payer_class", pd.Series(dtype=object))).fillna(self.pat.payer0)
        self.pat["region_cur"] = self.pat.patient_id.map(last.get("residence_region", pd.Series(dtype=object))).fillna(self.pat.region0)
        self.count("patients_generated", len(self.pat))
        self.count("patient_attribute_changes", len(self.pat_changes))

    def payer_asof(self, pidx: np.ndarray, when: np.ndarray) -> np.ndarray:
        """Payer class of patients (row index) as at the given dates (replay of the change log)."""
        res = self.pat.payer0.values[pidx].astype(object)
        ch = self.pat_changes[self.pat_changes.attribute == "payer_class"]
        if len(ch):
            pos = pd.Series(np.arange(len(self.pat)), index=self.pat.patient_id)
            ch_idx = pos.reindex(ch.patient_id).values
            ch_map = defaultdict(list)
            for k, (i, d, v) in enumerate(zip(ch_idx, pd.to_datetime(ch.effective_date).values, ch.new_value.values)):
                ch_map[int(i)].append((d, v))
            for j in np.where(np.isin(pidx, list(ch_map.keys())))[0]:
                for d, v in ch_map[int(pidx[j])]:
                    if d <= when[j]:
                        res[j] = v
        return res

    # ------------------------------------------------------------ 4 encounters pass 1 (clinical attributes)
    def sample_patients(self, fac_idx: int, year: int, n: int, focus: str, util=True) -> np.ndarray:
        rng = self.rng
        key = (fac_idx, year, focus)
        if key in self._pcache:
            pool, w = self._pcache[key]
            return pool[rng.choice(len(pool), size=n, p=w)]
        pool = self.pool_idx[fac_idx]
        by = self.pat.birth_year.values[pool]
        age = year - by
        ok = by <= year
        w = self.pat.propensity.values[pool] * ok
        if util:
            w = w * np.select([age < 1, age < 5, age < 15, age < 25, age < 45, age < 65], [3.5, 2.6, 0.8, 0.85, 1.0, 1.3], 1.5)
        if focus == "child":
            w = w * (age < 15)
        elif focus == "adult":
            w = w * (age >= 15)
        elif focus == "malaria":
            w = w * np.where(age < 15, 1.4, 1.0)
        elif focus == "covid":
            w = w * np.where(age < 15, 0.25, np.where(age >= 65, 2.2, 1.0))
        elif focus == "doa":
            w = w * np.where(age >= 45, 2.5, np.where(age >= 15, 1.0, 0.1))
        elif focus == "women":
            w = w * ((self.pat.sex.values[pool] == "F") & (age >= 16) & (age <= 44))
        elif focus == "elective":
            w = w * (age >= 18)
        w = w / w.sum()
        self._pcache[key] = (pool, w)
        return pool[rng.choice(len(pool), size=n, p=w)]

    def gen_encounters_pass1(self):
        rng = self.rng
        F, D = len(FACILITIES), self.D
        self.pool_idx = [np.where(self.pat.home_idx.values == i)[0] for i in range(F)]
        tdays = np.arange(D)
        trend = 1.025 ** ((tdays - self.t_start) / 365.25)
        lam_base = np.zeros((F, D))
        for i, f in enumerate(FACILITIES):
            noise = rng.gamma(120, 1 / 120, D)
            if f["ed"] > 0:
                lam_base[i] = f["ed"] * DOW_ED[self.dow] * trend * np.where(self.hol, 1.08, 1.0) * noise
            else:
                after_closed = np.r_[False, ((self.dow == 6) | self.hol)[:-1]]
                lam_base[i] = (f["opd"] * DOW_OPD[self.dow] * trend * np.where(self.hol, 0.0, 1.0)
                               * np.where(after_closed, 1.15, 1.0) * noise)
        self.lam_base = lam_base
        parts = []
        for stream, lam in (("base", lam_base), ("mal", self.lam_mal), ("cov", self.lam_cov)):
            n = rng.poisson(lam)
            fi, ti = np.nonzero(n)
            reps = n[fi, ti]
            parts.append(pd.DataFrame({"fac": np.repeat(fi, reps), "t": np.repeat(ti, reps), "stream": stream,
                                       "ob_id": None, "code": None, "focus": "base" if stream == "base" else
                                       ("malaria" if stream == "mal" else "covid")}))
        # dead-on-arrival stream (EDs only)
        doa_lam = np.where(np.array([f["ed"] > 0 for f in FACILITIES])[:, None], lam_base * 0.0025, 0.0)
        n = rng.poisson(doa_lam)
        fi, ti = np.nonzero(n)
        reps = n[fi, ti]
        parts.append(pd.DataFrame({"fac": np.repeat(fi, reps), "t": np.repeat(ti, reps), "stream": "doa",
                                   "ob_id": None, "code": "R99", "focus": "doa"}))
        ob = []
        for ob_id, fi_, t_i, code, focus, lam in self.ob_rows:
            k = rng.poisson(lam)
            ob += [(fi_, t_i, "outbreak", ob_id, code, focus)] * int(k)
        parts.append(pd.DataFrame(ob, columns=["fac", "t", "stream", "ob_id", "code", "focus"]))
        e = pd.concat(parts, ignore_index=True)
        e = e[e.t < D].reset_index(drop=True)
        e["year"] = self.year[e.t.values]
        # patients
        pidx = np.empty(len(e), dtype=np.int64)
        for (fi_, yr, focus), g in e.groupby(["fac", "year", "focus"]):
            pidx[g.index.values] = self.sample_patients(int(fi_), int(yr), len(g), focus)
        e["pidx"] = pidx
        by = self.pat.birth_year.values[pidx]
        bdoy = self.pat.bdoy.values[pidx]
        doy = self.days.dayofyear.values[e.t.values]
        e["age"] = e.year.values - by - (doy < bdoy).astype(int)
        e.loc[e.age < 0, "age"] = 0
        e["sex"] = self.pat.sex.values[pidx]
        e["is_ed"] = np.array([FACILITIES[i]["ed"] > 0 for i in e.fac.values])
        # malaria / covid codes
        m = e.stream == "mal"
        e.loc[m, "code"] = np.where(rng.random(m.sum()) < 0.7, "B50.9", "B54")
        e.loc[e.stream == "cov", "code"] = "U07.1"
        # baseline case-mix sampled by encounter type x age group x sex x month
        b = e.stream == "base"
        ag = age_group(e.age.values)
        e["ag"] = ag
        e["month"] = self.month[e.t.values]
        codes = np.array(CODES)
        for (is_ed, a, s, mo), g in e[b].groupby(["is_ed", "ag", "sex", "month"]):
            w = np.array([(r[9] if is_ed else r[10])[a] for r in ICD], dtype=float)
            for k, r in enumerate(ICD):
                if r[11] and r[11] != s:
                    w[k] = 0.0
                if r[12] in SEASON_MULT:
                    w[k] *= SEASON_MULT[r[12]][mo - 1]
            if a == 2 and s == "F" and not is_ed:
                pass
            w = w / w.sum()
            e.loc[g.index, "code"] = rng.choice(codes, size=len(g), p=w)
        # Z34.9 (antenatal care) only for women 16-44
        bad = (e.code == "Z34.9") & ~((e.sex == "F") & (e.age >= 16) & (e.age <= 44))
        e.loc[bad, "code"] = "Z00.0"
        e["sev"] = e.code.map(SEV)
        # arrival hour/minute
        hours = np.empty(len(e), dtype=np.int64)
        night = e.code.isin(NIGHT_CODES).values
        dw = self.dow[e.t.values]
        for is_ed in (True, False):
            for nt in (True, False):
                for sat in (True, False):
                    sel = (e.is_ed.values == is_ed) & (night == nt) & ((dw == 5) == sat)
                    if not sel.any():
                        continue
                    if is_ed:
                        prof = HOUR_NIGHT if nt else HOUR_ED
                        if sat or nt:
                            prof = prof * np.where(np.arange(24) >= 18, 1.15, 1.0)
                    else:
                        prof = HOUR_OPD_SAT if sat else HOUR_OPD
                    hours[sel] = rng.choice(24, size=sel.sum(), p=prof / prof.sum())
        e["hour"] = hours
        e["minute"] = rng.integers(0, 60, len(e))
        e["arrival_ts"] = (pd.to_datetime(self.days.values[e.t.values]) + pd.to_timedelta(e.hour * 60 + e.minute, unit="m"))
        # triage
        tri = np.full(len(e), "NT", dtype=object)
        for sev, probs in TRI_BY_SEV.items():
            sel = e.is_ed.values & (e.sev.values == sev)
            tri[sel] = rng.choice(TRI_CODES, size=sel.sum(), p=probs)
        tri[e.stream.values == "doa"] = "BLUE"
        sel = e.stream.values == "readm"
        e["triage"] = tri
        # arrival mode
        u = rng.random(len(e))
        p_amb = np.select([tri == "RED", tri == "ORANGE", tri == "BLUE"], [0.55, 0.25, 0.85], 0.06)
        p_ref = np.where(e.is_ed.values, 0.07, 0.01)
        e["arrival_mode"] = np.where(u < p_amb, "AMB", np.where(u < p_amb + p_ref, "REF", "WALK"))
        self.enc = e
        self.disposition_pass1()

    def disposition_pass1(self, idx=None):
        rng = self.rng
        e = self.enc if idx is None else self.enc.loc[idx]
        n = len(e)
        sevv = e.sev.values
        tri = e.triage.values
        p_adm = np.array([ADMIT_BY_SEV[s] for s in sevv])
        p_adm *= np.array([ADMIT_TRI_MULT.get(t, 0.0) for t in tri])
        p_adm *= e.code.map(ADMIT_FACTOR).fillna(1.0).values
        p_adm *= np.where(e.age.values >= 65, 1.25, np.where(e.age.values < 5, 1.6, np.where(e.age.values < 13, 1.3, 1.0)))
        p_adm = np.clip(p_adm, 0, 0.97)
        u = rng.random(n)
        disp = np.where(u < p_adm, "ADM", "DIS").astype(object)
        p_died = np.select([tri == "RED", tri == "ORANGE"], [0.05, 0.005], 0.0)
        disp[(rng.random(n) < p_died)] = "DIED"
        disp[tri == "BLUE"] = "DIED"
        # clinic attendances: referral to hospital instead of admission
        opd = ~e.is_ed.values
        p_ref = np.array([{"minor": 0.005, "moderate": 0.04, "serious": 0.40, "critical": 0.70}[s] for s in sevv])
        disp[opd] = np.where(rng.random(opd.sum()) < p_ref[opd], "REF", "DIS")
        # intensive-care need
        icu = (e.is_ed.values & (disp == "ADM") &
               (((e.code.map(SPEC).values == "ICU") & (rng.random(n) < 0.8)) |
                ((tri == "RED") & (sevv == "critical") & (rng.random(n) < 0.33))))
        if idx is None:
            self.enc["disp"] = disp
            self.enc["icu"] = icu
        else:
            self.enc.loc[idx, "disp"] = disp
            self.enc.loc[idx, "icu"] = icu

    # ------------------------------------------------------------ 5 admissions
    def ward_for(self, fac_code: str, spec_code: str, age: int, icu: bool, when: date) -> tuple[str, bool]:
        """Return (unit_code, transfer_needed)."""
        short = FAC_BY_CODE[fac_code]["short"]
        units = {u[0] for u in WARDS if u[1] == fac_code}
        if icu:
            if f"{short}-ICU1" in units:
                return f"{short}-ICU1", False
            return None, True
        if spec_code == "MAT":
            return f"{short}-MAT1", False
        if age < 13 and f"{short}-PAE1" in units:
            return f"{short}-PAE1", False
        if spec_code == "SUR" and f"{short}-SUR1" in units:
            return f"{short}-SUR1", False
        if short == "WHK":
            return ("WHK-MED2" if self.rng.random() < 0.48 else "WHK-MED1"), False
        return f"{short}-MED1", False

    def sample_los(self, ward_spec: np.ndarray, codes: np.ndarray, sev: np.ndarray, age: np.ndarray) -> np.ndarray:
        rng = self.rng
        med = np.select([ward_spec == "MED", ward_spec == "SUR", ward_spec == "PAE", ward_spec == "ICU"],
                        [3.8, 4.4, 3.6, 3.8], 1.0)
        mat = {"O80": 2.2, "O82": 3.5, "O14.1": 4.0, "O60.1": 4.0, "O72.1": 3.5, "O47.9": 0.6}
        med = np.where(ward_spec == "MAT", pd.Series(codes).map(mat).fillna(1.5).values, med)
        med = med * np.array([LOS_SEV_MULT[s] if ws != "MAT" else 1.0 for s, ws in zip(sev, ward_spec)])
        med = med * np.where(age >= 65, 1.25, 1.0)
        mult = pd.Series(codes).map({"A15.0": 2.5, "I64": 2.0, "S72.0": 2.2, "B50.9": 0.8, "B54": 0.7,
                                     "H25.9": 0.4, "K40.9": 0.7, "K80.2": 0.8, "M17.9": 1.6, "N40": 1.0}).fillna(1.0).values
        med = med * mult
        sigma = np.where(ward_spec == "MAT", 0.45, 0.65)
        los = np.floor(np.exp(np.log(med) + rng.normal(0, sigma))).astype(int)
        return np.clip(los, 0, 120)

    def gen_admissions(self):
        rng = self.rng
        e = self.enc
        rows = []
        # (a) emergency admissions via the ED
        adm = e[(e.disp == "ADM") & e.is_ed].copy()
        for r in adm.itertuples():
            fac_code = FACILITIES[r.fac]["code"]
            when = self.days[r.t].date()
            spec = SPEC[r.code]
            ward, trf = self.ward_for(fac_code, spec, r.age, bool(r.icu), when)
            if trf:   # no ICU on site: transfer out (Rundu/Katima -> Oshakati, Walvis Bay -> Windhoek)
                e.at[r.Index, "disp"] = "TRF"
                dest = "GBH-WHK" if fac_code == "GBH-WVB" else "GBH-OSH"
                rows.append(dict(fac=FAC_INDEX[dest], ward=f"{FAC_BY_CODE[dest]['short']}-ICU1", pidx=r.pidx, t=r.t,
                                 adm_ts=r.arrival_ts + pd.Timedelta(hours=float(rng.uniform(6, 14))),
                                 method="TRANSFER-IN", code=r.code, sev=r.sev, age=r.age, enc_idx=-1, src_enc=r.Index))
                continue
            if fac_code == "GBH-WHK" and r.code == "U07.1" and date(2022, 1, 3) <= when < date(2022, 3, 14):
                ward = "WHK-MED2"
            rows.append(dict(fac=r.fac, ward=ward, pidx=r.pidx, t=r.t, adm_ts=r.arrival_ts + pd.Timedelta(hours=4),
                             method="EMER-ED", code=r.code, sev=r.sev, age=r.age, enc_idx=r.Index, src_enc=r.Index))
        # (b) elective surgical admissions (weekdays) and (c) maternity admissions (any day)
        elect_rate = {"GBH-WHK": 4.2, "GBH-OSH": 3.0, "GBH-RUN": 1.8, "GBH-WVB": 1.4}
        mat_rate = {"GBH-WHK": 8.0, "GBH-OSH": 7.0, "GBH-RUN": 5.5, "GBH-KAT": 3.5, "GBH-WVB": 3.0}
        mat_pool = {"GBH-WHK": ["GBH-WHK", "GBC-KTU"], "GBH-OSH": ["GBH-OSH", "GBC-EEN"],
                    "GBH-RUN": ["GBH-RUN", "GBC-NKU"], "GBH-KAT": ["GBH-KAT"], "GBH-WVB": ["GBH-WVB"]}
        elec_codes = ["K40.9", "K80.2", "H25.9", "M17.9", "N40"]
        mat_codes = ["O80", "O82", "O14.1", "O60.1", "O72.1", "O47.9"]
        mat_p = [0.70, 0.17, 0.04, 0.03, 0.02, 0.04]
        trend = 1.02 ** ((np.arange(self.D) - self.t_start) / 365.25)
        for fac_code in HOSPITALS:
            fi = FAC_INDEX[fac_code]
            short = FAC_BY_CODE[fac_code]["short"]
            if fac_code in elect_rate:
                lam = elect_rate[fac_code] * trend * ((self.dow < 5) & ~self.hol)
                n = rng.poisson(lam)
                for t in np.nonzero(n)[0]:
                    yr = int(self.year[t])
                    for p in self.sample_patients(fi, yr, int(n[t]), "elective"):
                        code = rng.choice(elec_codes, p=[0.3, 0.25, 0.2, 0.1, 0.15])
                        if code == "N40" and self.pat.sex.values[p] != "M":
                            code = "K40.9"
                        age = yr - int(self.pat.birth_year.values[p])
                        ts = pd.Timestamp(self.days[t]) + pd.Timedelta(minutes=int(rng.integers(6 * 60 + 30, 9 * 60 + 30)))
                        rows.append(dict(fac=fi, ward=f"{short}-SUR1", pidx=p, t=t, adm_ts=ts, method="ELECTIVE",
                                         code=code, sev="minor", age=age, enc_idx=-1, src_enc=-1))
            lam = mat_rate[fac_code] * trend
            n = rng.poisson(lam)
            pools = [FAC_INDEX[c] for c in mat_pool[fac_code]]
            for t in np.nonzero(n)[0]:
                yr = int(self.year[t])
                k = int(n[t])
                src = rng.choice(pools, size=k)
                for pf in np.unique(src):
                    for p in self.sample_patients(int(pf), yr, int((src == pf).sum()), "women"):
                        code = rng.choice(mat_codes, p=mat_p)
                        age = yr - int(self.pat.birth_year.values[p])
                        ts = pd.Timestamp(self.days[t]) + pd.Timedelta(minutes=int(rng.integers(0, 1440)))
                        rows.append(dict(fac=fi, ward=f"{short}-MAT1", pidx=p, t=t, adm_ts=ts, method="MATERNITY",
                                         code=code, sev=SEV[code], age=age, enc_idx=-1, src_enc=-1))
        a = pd.DataFrame(rows)
        a = self.finish_spells(a)
        # (d) emergency readmissions within 30 days (truth model) -> new ED attendance + admission
        a = self.gen_readmissions(a)
        self.adm = a.sort_values("adm_ts").reset_index(drop=True)

    def finish_spells(self, a: pd.DataFrame) -> pd.DataFrame:
        rng = self.rng
        a = a.reset_index(drop=True)
        ward_spec = a.ward.str.split("-").str[1].str[:3].values
        a["los"] = self.sample_los(ward_spec, a.code.values, a.sev.values, a.age.values)
        n = len(a)
        # in-hospital death
        p_d = np.array([DEATH_BY_SEV[s] for s in a.sev.values]) * np.where(a.age.values >= 65, 1.8, np.where(a.age.values < 5, 1.3, 1.0))
        p_d = np.where(a.method.values == "MATERNITY", np.where(a.code.values == "O72.1", 0.01, 0.0005), p_d)
        p_d = np.where(ward_spec == "ICU", p_d * 1.6, p_d)
        died = rng.random(n) < p_d
        ama = (~died) & (rng.random(n) < np.where(a.code.values == "F10.0", 0.15, np.where(a.method.values == "MATERNITY", 0.004, 0.018)))
        trf = (~died) & (~ama) & (rng.random(n) < 0.01)
        a.loc[ama, "los"] = np.floor(a.loc[ama, "los"] * 0.5).astype(int)
        a.loc[died, "los"] = np.floor(a.loc[died, "los"] * rng.uniform(0.2, 1.0, died.sum())).astype(int)
        a["status"] = np.select([died, ama, trf], ["DIED", "AMA", "TRANSFER"], "HOME")
        # weekend effect: planned weekend discharges slip to Monday (except deaths/AMA)
        adm_date = a.adm_ts.dt.normalize()
        dis_date = adm_date + pd.to_timedelta(a.los, unit="D")
        wd = dis_date.dt.dayofweek.values
        slip_p = np.where(np.isin(a.method.values, ["ELECTIVE", "MATERNITY"]), 0.5, 1.0)
        home = a.status.values == "HOME"
        slip_sat = home & (wd == 5) & (rng.random(n) < 0.45 * slip_p)
        slip_sun = home & (wd == 6) & (rng.random(n) < 0.55 * slip_p)
        a.loc[slip_sat, "los"] += 2
        a.loc[slip_sun, "los"] += 1
        # discharge time of day
        u = rng.random(n)
        dh = np.where(u < 0.26, rng.uniform(8, 12, n), np.where(u < 0.86, rng.uniform(12, 17, n), rng.uniform(17, 21, n)))
        dh = np.where(died, rng.uniform(0, 24, n), dh)
        a["dis_minutes"] = (dh * 60).astype(int)
        a = self.set_discharge_ts(a)
        return a

    @staticmethod
    def set_discharge_ts(a: pd.DataFrame) -> pd.DataFrame:
        dis = a.adm_ts.dt.normalize() + pd.to_timedelta(a.los, unit="D") + pd.to_timedelta(a.dis_minutes, unit="m")
        too_early = dis <= a.adm_ts + pd.Timedelta(hours=2)
        dis = dis.where(~too_early, a.adm_ts + pd.Timedelta(hours=6))
        a["dis_ts"] = dis
        return a

    def gen_readmissions(self, a: pd.DataFrame) -> pd.DataFrame:
        rng = self.rng
        c = READMIT
        P = self.pat
        age = a.age.values
        payer = self.payer_asof(a.pidx.values, a.dis_ts.values)
        logit = (c["intercept"] + c["age65"] * (age >= 65) + c["age45_64"] * ((age >= 45) & (age < 65))
                 + c["chronic"] * a.code.map(CHRONIC).fillna(0).values + c["los_per_day"] * np.minimum(a.los.values, 30)
                 + c["weekend_discharge"] * np.isin(a.dis_ts.dt.dayofweek.values, [4, 5, 6])
                 + c["ama"] * (a.status.values == "AMA") + c["payer_cash"] * (payer == "CASH")
                 + c["frailty"] * P.frailty.values[a.pidx.values] + c["maternity"] * (a.method.values == "MATERNITY"))
        p = sigmoid(logit)
        eligible = (a.status.values != "DIED") & (a.status.values != "TRANSFER")
        readm = eligible & (rng.random(len(a)) < p)
        a["readmit_truth"] = readm
        a["readmit_p_truth"] = p
        idx = np.where(readm)[0]
        delay = np.clip(1 + np.floor(rng.gamma(1.3, 6.0, len(idx))), 1, 30).astype(int)
        new_enc, new_adm = [], []
        codes_by_ch = defaultdict(list)
        for r in ICD:
            if sum(r[9]) > 0 and r[5] in ("moderate", "serious", "critical"):
                codes_by_ch[r[2]].append(r[0])
        for j, dl in zip(idx, delay):
            r = a.iloc[j]
            hospital = FACILITIES[int(r.fac)]["code"]
            arr_day = r.dis_ts.normalize() + pd.Timedelta(days=int(dl))
            t = (arr_day.date() - SIM_START).days
            if t >= self.D:
                continue
            code = r.code if (rng.random() < 0.55 and r.code not in ("O80", "O82", "O47.9")) else \
                rng.choice(codes_by_ch.get(ICD_BY[r.code][2], ["R50.9"]) or ["R50.9"])
            if code in ("H25.9", "K40.9", "K80.2", "M17.9", "N40"):
                code = "R10.4"
            hour = int(rng.choice(24, p=HOUR_ED / HOUR_ED.sum()))
            ts = arr_day + pd.Timedelta(minutes=hour * 60 + int(rng.integers(0, 60)))
            if ts <= r.dis_ts:
                ts = r.dis_ts + pd.Timedelta(hours=20)
                t = (ts.normalize().date() - SIM_START).days
                if t >= self.D:
                    continue
            new_enc.append(dict(fac=int(r.fac), t=t, stream="readm", ob_id=None, code=code, focus="readm",
                                year=int(self.year[t]), pidx=int(r.pidx), age=int(r.age), sex=P.sex.values[int(r.pidx)],
                                is_ed=True, ag=int(age_group(np.array([r.age]))[0]), month=int(self.month[t]),
                                sev=SEV[code], hour=ts.hour, minute=ts.minute, arrival_ts=ts,
                                triage=rng.choice(["RED", "ORANGE", "YELLOW"], p=[0.06, 0.46, 0.48]),
                                arrival_mode="AMB" if rng.random() < 0.25 else "WALK", disp="ADM", icu=False,
                                index_adm=j))
        ne = pd.DataFrame(new_enc)
        start_idx = self.enc.index.max() + 1
        ne.index = np.arange(start_idx, start_idx + len(ne))
        self.enc = pd.concat([self.enc, ne.drop(columns=["index_adm"])])
        rows = []
        for k, r in ne.iterrows():
            fac_code = FACILITIES[r.fac]["code"]
            ward, _ = self.ward_for(fac_code, SPEC[r.code], int(r.age), False, r.arrival_ts.date())
            rows.append(dict(fac=r.fac, ward=ward, pidx=r.pidx, t=r.t, adm_ts=r.arrival_ts + pd.Timedelta(hours=4),
                             method="EMER-ED", code=r.code, sev=r.sev, age=r.age, enc_idx=k, src_enc=k,
                             readmission_of=int(r.index_adm)))
        ra = self.finish_spells(pd.DataFrame(rows))
        ra["readmit_truth"] = False
        ra["readmit_p_truth"] = np.nan
        a["readmission_of"] = -1
        out = pd.concat([a, ra], ignore_index=True)
        self.manifest["truth"]["readmission_model"] = dict(
            coefficients=READMIT, index_spells_readmitted=int(readm.sum()),
            readmissions_generated=int(len(ra)), mean_true_probability=round(float(p[eligible].mean()), 4),
            note="logit = intercept + age65 + age45_64 + chronic + 0.04*min(LOS,30) + weekend/Friday discharge + AMA "
                 "+ self-pay + frailty (latent, unobserved) + maternity; observed flag also contains chance readmissions")
        return out

    # ------------------------------------------------------------ 6 census
    def compute_census(self, a: pd.DataFrame, upto_t: int) -> dict:
        """Midnight census per ward: occupied beds at 23:59 of each day (index 0 = SIM_START)."""
        res = {}
        D = self.D
        adm_t = ((a.adm_ts.dt.normalize() - pd.Timestamp(SIM_START)).dt.days).values
        dis_t = ((a.dis_ts.dt.normalize() - pd.Timestamp(SIM_START)).dt.days).values
        for w in WARDS:
            sel = a.ward.values == w[0]
            occ = np.zeros(D + 2)
            np.add.at(occ, np.clip(adm_t[sel], 0, D), 1)
            np.add.at(occ, np.clip(dis_t[sel], 0, D + 1), -1)
            occ = np.cumsum(occ)[:D]
            adm_c = np.bincount(np.clip(adm_t[sel], 0, D), minlength=D + 1)[:D]
            dis_c = np.bincount(np.clip(dis_t[sel], 0, D + 1), minlength=D + 2)[:D]
            died = sel & (a.status.values == "DIED")
            dth_c = np.bincount(np.clip(dis_t[died], 0, D + 1), minlength=D + 2)[:D]
            res[w[0]] = dict(occ=occ, adm=adm_c, dis=dis_c, died=dth_c)
        return res

    def hospital_occupancy(self, census: dict) -> np.ndarray:
        F, D = len(FACILITIES), self.D
        occ = np.full((F, D), np.nan)
        for fac in HOSPITALS:
            tot_o, tot_b = np.zeros(D), np.zeros(D)
            for w in WARDS:
                if w[1] != fac:
                    continue
                beds = np.array([self.bed_complement(w[0], d.date()) for d in self.days])
                tot_o += census[w[0]]["occ"]
                tot_b += beds
            occ[FAC_INDEX[fac]] = tot_o / tot_b
        return occ

    # ------------------------------------------------------------ 7 e-roster
    def gen_roster(self):
        rng = self.rng
        D = self.D
        rows = []
        surge_start = (date(2026, 1, 5) - SIM_START).days
        sick = np.clip(0.045 + 0.06 * np.exp(-0.5 * ((np.arange(D) - (date(2022, 1, 5) - SIM_START).days) / 12) ** 2)
                       + 0.03 * np.exp(-0.5 * ((np.arange(D) - (date(2022, 6, 8) - SIM_START).days) / 12) ** 2), 0, 0.3)
        self.ed_doctors = {}   # (fac_idx, t, shift) -> doctors on duty
        self.opd_nurses = {}
        for u in UNITS:
            code, fac, _name, utype, _spec, _beds = u
            f = FAC_BY_CODE[fac]
            fi = FAC_INDEX[fac]
            vac = f["vac"]
            surge = fac in ("GBH-RUN", "GBH-KAT", "GBC-NKU")
            for t in range(self.t_start, self.D):
                d = self.days[t].date()
                for shift in ("D", "N"):
                    if utype == "Inpatient ward":
                        beds = self.bed_complement(code, d)
                        occ = self.census1[code]["occ"][t]
                        nurses = math.ceil(beds / (5 if shift == "D" else 7))
                        hrs = 12.0
                        pressure = occ / max(beds, 1)
                        doc_h = (4.0 + (2.0 if beds > 25 else 0.0)) if shift == "D" else 0.0
                        doctors = 1 if shift == "D" else 0
                        ot_ratio = np.clip(0.6 * (pressure - 0.9), 0, 0.3)
                    elif utype == "Emergency department":
                        nurses = math.ceil(f["ed"] / (8 if shift == "D" else 12))
                        hrs = 12.0
                        doctors = max(1, round(f["ed"] / (20 if shift == "D" else 30)))
                        if surge and t >= surge_start and d < date(2026, 7, 1) and shift == "D":
                            doctors += 1
                        lam_ratio = (self.lam_base[fi, t] + self.lam_mal[fi, t] + self.lam_cov[fi, t]) / f["ed"]
                        ot_ratio = np.clip(0.5 * (lam_ratio - 1.1), 0, 0.35)
                        absent = rng.random() < (0.06 if shift == "D" else 0.08) * (1.6 if surge else 1.0)
                        if absent and doctors > 1:
                            doctors -= 1
                        doc_h = 12.0 * doctors
                    else:   # clinic: one day shift, closed Sundays and public holidays
                        if shift == "N" or self.dow[t] == 6 or self.hol[t]:
                            continue
                        nurses = max(2, math.ceil(f["opd"] / 9))
                        hrs = 9.0 if self.dow[t] < 5 else 5.0
                        doctors = 1 if (fac == "GBC-KTU" and self.dow[t] < 5) or self.dow[t] in (1, 3) else 0
                        doc_h = hrs * doctors
                        lam_ratio = (self.lam_base[fi, t] + self.lam_mal[fi, t] + self.lam_cov[fi, t]) / max(f["opd"], 1)
                        ot_ratio = np.clip(0.4 * (lam_ratio - 1.15), 0, 0.3)
                    planned = nurses * hrs
                    vac_eff = vac * (0.5 if fac == "GBH-WHK" else 1.0)
                    worked_base = planned * (1 - vac_eff - sick[t] * rng.uniform(0.6, 1.4))
                    agency = planned * ((0.25 if (surge and t >= surge_start) else 0.0) + (0.03 if fac == "GBH-WHK" else 0.0))
                    overtime = planned * ot_ratio * rng.uniform(0.7, 1.3) + (planned * 0.02 if rng.random() < 0.2 else 0.0)
                    worked = worked_base + agency + overtime
                    rn_share = rng.uniform(0.38, 0.46)
                    sick_h = planned * sick[t] * rng.uniform(0.6, 1.4)
                    nod = max(1, int(round(worked / hrs)))
                    rows.append((d, code, shift, round(planned, 1), round(worked * rn_share, 1),
                                 round(worked * (1 - rn_share), 1), round(doc_h, 1), round(overtime, 1),
                                 round(agency, 1), round(sick_h, 1), nod, int(doctors)))
                    if utype == "Emergency department":
                        self.ed_doctors[(fi, t, shift)] = max(int(doctors), 1)
                    if utype == "Outpatient clinic":
                        self.opd_nurses[(fi, t)] = nod
        self.roster = pd.DataFrame(rows, columns=["roster_date", "unit_code", "shift", "planned_nurse_hours", "rn_hours",
                                                  "en_hours", "doctor_hours", "overtime_hours", "agency_hours",
                                                  "sick_leave_hours", "nurses_on_duty", "doctors_on_duty"])

    # ------------------------------------------------------------ 8 waits, LWBS and ED length of stay (pass 2)
    def gen_waits(self):
        rng = self.rng
        e = self.enc
        n = len(e)
        ts = e.arrival_ts
        # shift instance: night shift 19:00-07:00 belongs to the day it starts
        shift = np.where((e.hour.values >= 7) & (e.hour.values < 19), "D", "N")
        shift_t = e.t.values - ((e.hour.values < 7)).astype(int)
        e["shift"] = shift
        e["shift_t"] = shift_t
        cnt = e.groupby(["fac", "shift_t", "shift"]).size()
        arr_h = cnt.reindex(pd.MultiIndex.from_arrays([e.fac.values, shift_t, shift])).values / 12.0
        docs = np.array([self.ed_doctors.get((f, t, s), 1) for f, t, s in zip(e.fac.values, shift_t, shift)])
        util = arr_h / (docs * 1.6)
        occ = self.occ1[e.fac.values, np.clip(e.t.values, 0, self.D - 1)]
        occ = np.nan_to_num(occ, nan=0.8)
        base = pd.Series(e.triage.values).map({"RED": 2.0, "ORANGE": 8.0, "YELLOW": 42.0, "GREEN": 125.0, "BLUE": 15.0}).fillna(60.0).values
        crowd = np.clip(np.exp(1.4 * (util - 0.8)), 0.45, 4.5)
        access = 1 + 1.6 * np.clip(occ - 0.90, 0, None)
        nightf = np.where(shift == "N", 1.10, 1.0)
        d2d_ed = base * np.where(e.triage.values == "RED", 1.0, crowd * access * nightf) * np.exp(rng.normal(0, 0.55, n))
        tri_wait = np.exp(np.log(5.0 * (1 + np.clip(util - 0.9, 0, None))) + rng.normal(0, 0.6, n))
        # clinics: queue builds before opening; wait depends on the day's load per nurse on duty
        day_cnt = e.groupby(["fac", "t"]).size()
        load = day_cnt.reindex(pd.MultiIndex.from_arrays([e.fac.values, e.t.values])).values
        nurses = np.array([self.opd_nurses.get((f, t), 3) for f, t in zip(e.fac.values, e.t.values)])
        util_opd = load / (nurses * 9.0)
        hour_f = pd.Series(e.hour.values).map({7: 1.45, 8: 1.25, 9: 1.0, 10: 0.85}).fillna(0.7).values
        wait_opd = 70.0 * np.clip(np.exp(0.9 * (util_opd - 0.8)), 0.5, 3.5) * hour_f * np.exp(rng.normal(0, 0.5, n))
        is_ed = e.is_ed.values
        d2d = np.where(is_ed, d2d_ed, wait_opd)
        d2d = np.clip(d2d, 0.5, 1440)
        tri_wait = np.where(is_ed, np.minimum(tri_wait, d2d * 0.8 + 1), np.nan)
        tri = e.triage.values
        tri_wait = np.where(tri == "BLUE", 2.0, tri_wait)
        # left without being seen (only patients who would have gone home)
        disp = e.disp.values.copy()
        scale = np.where(is_ed, np.where(tri == "GREEN", 560.0, np.where(tri == "YELLOW", 900.0, 1e9)), 760.0)
        p_lwbs = 1 - np.exp(-np.power(d2d / scale, 2.2))
        lwbs = (disp == "DIS") & (rng.random(n) < p_lwbs) & (e.stream.values != "readm")
        disp[lwbs] = "LWBS"
        e["disp"] = disp
        # treatment / boarding times
        treat = pd.Series(tri).map({"RED": 150.0, "ORANGE": 160.0, "YELLOW": 110.0, "GREEN": 55.0, "BLUE": 60.0}).fillna(25.0).values
        treat = treat * np.exp(rng.normal(0, 0.5, n))
        workup = 120.0 * np.exp(rng.normal(0, 0.45, n))
        boarding = np.minimum(45.0 * np.exp(5.0 * np.clip(occ - 0.85, 0, None)) * np.exp(rng.normal(0, 0.6, n)), 36 * 60)
        los = np.select([disp == "ADM", disp == "TRF", disp == "DIED", disp == "LWBS", disp == "REF"],
                        [d2d + workup + boarding, d2d + rng.uniform(180, 360, n), d2d + 45 * np.exp(rng.normal(0, 0.4, n)),
                         d2d * rng.uniform(0.6, 1.0, n), d2d + 40 + rng.uniform(0, 60, n)],
                        d2d + treat)
        e["triage_ts"] = (ts + pd.to_timedelta(np.round(np.nan_to_num(tri_wait)), unit="m")).where(is_ed)
        seen = ts + pd.to_timedelta(np.round(d2d), unit="m")
        e["seen_ts"] = seen.where(disp != "LWBS", pd.NaT)
        e["departure_ts"] = ts + pd.to_timedelta(np.round(np.maximum(los, d2d * 0.6 + 1)), unit="m")
        self.manifest["truth"]["ed_wait_model"] = (
            "door-to-doctor = triage median (RED 2, ORANGE 8, YELLOW 42, GREEN 125 min) x exp(1.4*(arrivals per hour / "
            "(doctors on duty x 1.6) - 0.8)) x (1 + 1.6*max(0, hospital occupancy - 0.90)) x 1.10 at night x lognormal(0, 0.55)")

    def finalize_admissions(self):
        a = self.adm
        e = self.enc
        link = a.enc_idx.values >= 0
        dep = e.departure_ts.reindex(a.enc_idx.values[link]).values
        a.loc[link, "adm_ts"] = pd.to_datetime(dep)
        trf = a.method.values == "TRANSFER-IN"
        if trf.any():
            src_dep = e.departure_ts.reindex(a.src_enc.values[trf]).values
            a.loc[trf, "adm_ts"] = pd.to_datetime(src_dep) + pd.to_timedelta(self.rng.uniform(4, 10, trf.sum()), unit="h")
        self.adm = self.set_discharge_ts(a)

    # ------------------------------------------------------------ 9 IDSR weekly returns
    def gen_idsr(self):
        rng = self.rng
        e = self.enc
        a = self.adm
        e_ok = e[e.arrival_ts.dt.date >= START]
        e_c = e_ok[e_ok.code.isin(COND_OF.keys())].copy()
        e_c["cond"] = e_c.code.map(COND_OF)
        e_c["week"] = e_c.arrival_ts.dt.isocalendar().week.astype(int).astype(str).str.zfill(2)
        e_c["wy"] = e_c.arrival_ts.dt.isocalendar().year.astype(int).astype(str) + "-W" + e_c.week
        e_c["u5"] = e_c.age < 5
        cases = e_c.groupby(["fac", "wy", "cond", "u5"]).size()
        deaths_rows = []
        d_ed = e_ok[(e_ok.disp == "DIED") & e_ok.code.isin(COND_OF.keys())]
        for r in d_ed.itertuples():
            deaths_rows.append((r.fac, iso_week_label(r.departure_ts.date()), COND_OF[r.code], r.age < 5))
        d_ad = a[(a.status == "DIED") & a.code.isin(COND_OF.keys())]
        for r in d_ad.itertuples():
            deaths_rows.append((r.fac, iso_week_label(r.dis_ts.date()), COND_OF[r.code], r.age < 5))
        deaths = pd.DataFrame(deaths_rows, columns=["fac", "wy", "cond", "u5"]).groupby(["fac", "wy", "cond", "u5"]).size()
        # epi weeks fully inside the reporting window
        weeks = []
        d = date(2022, 1, 3)
        while d + timedelta(days=6) <= DELTA_DATE:
            weeks.append((iso_week_label(d), d))
            d += timedelta(days=7)
        rows, cover = [], []
        n_total_reports = 0
        for f in FACILITIES:
            fi = FAC_INDEX[f["code"]]
            miss_p, late_p = f["report"]
            for wy, monday in weeks:
                yr = monday.year
                improve = 0.6 if yr >= 2025 else 1.0
                sunday = monday + timedelta(days=6)
                due = datetime.combine(sunday + timedelta(days=2), datetime.min.time()) + timedelta(hours=12)
                n_total_reports += 1
                if wy == "2026-W39" and f["code"] in ("GBC-NKU", "GBC-EEN"):
                    sub = datetime(2026, 10, 1, 9, 40) if f["code"] == "GBC-NKU" else datetime(2026, 10, 1, 14, 5)
                elif rng.random() < miss_p * improve:
                    cover.append((f["code"], wy, None, due))
                    continue
                elif rng.random() < late_p * improve:
                    sub = due + timedelta(hours=float(rng.gamma(1.5, 30)))
                else:
                    sub = datetime.combine(sunday + timedelta(days=1), datetime.min.time()) + timedelta(hours=float(rng.uniform(7, 36)))
                    sub = min(sub, due - timedelta(minutes=5))
                cover.append((f["code"], wy, sub, due))
                for cond in COND_CODES:
                    cu5 = int(cases.get((fi, wy, cond, True), 0))
                    c5 = int(cases.get((fi, wy, cond, False), 0))
                    du5 = int(deaths.get((fi, wy, cond, True), 0))
                    d5 = int(deaths.get((fi, wy, cond, False), 0))
                    # transcription noise (true clinical counts are the reference)
                    r = rng.random()
                    if r < 0.05 and c5 > 0:
                        c5 = max(0, c5 + int(rng.choice([-2, -1, 1, 2])))
                    elif r < 0.065 and c5 > 4:
                        c5 = int(round(c5 * rng.uniform(0.75, 0.9)))
                    tests = tpos = None
                    if cond == "MAL":
                        tpos = cu5 + c5
                        season = 1.0 + 0.6 * (monday.month in (1, 2, 3, 4, 5))
                        neg = rng.poisson((6.0 if fi in (2, 3, 7) else 2.5) * season * (1.2 if f["ed"] > 0 else 1.0) + 0.4 * tpos)
                        tests = tpos + int(neg)
                    rows.append(dict(facility_code=f["code"], epi_week=wy, condition=cond, cases_under5=cu5,
                                     cases_5plus=c5, deaths_under5=du5, deaths_5plus=d5,
                                     tests_done=tests, tests_positive=tpos, submitted_at=sub, report_version=1))
        self.idsr = pd.DataFrame(rows)
        self.idsr_cover = pd.DataFrame(cover, columns=["facility_code", "epi_week", "submitted_at", "due_at"])
        self.count("idsr_expected_reports", n_total_reports)

    # ------------------------------------------------------------ writers
    def write_all(self):
        out = self.out
        for sub in ["internal/pas", "internal/wards", "internal/roster", "internal/idsr", "internal/master_data",
                    "external/nsa", "external/nasa_power", "delta_2026-10-01"]:
            (out / sub).mkdir(parents=True, exist_ok=True)
        self.assign_ids()
        self.write_master_data()
        self.write_patients()
        self.write_encounters()
        self.write_spells()
        self.write_census()
        self.write_roster()
        self.write_idsr()
        self.write_census_nsa()
        self.write_weather()
        self.write_truth()

    def assign_ids(self):
        e = self.enc
        e = e[(e.arrival_ts >= pd.Timestamp(START))].copy()
        e = e.sort_values(["fac", "arrival_ts"]).reset_index()
        e = e.rename(columns={"index": "enc_idx"})
        yy = e.arrival_ts.dt.year
        seq = e.groupby([e.fac, yy]).cumcount() + 1
        short = np.array([f["short"] for f in FACILITIES])[e.fac.values]
        e["encounter_id"] = [f"{s}{y % 100:02d}{q:06d}" for s, y, q in zip(short, yy.values, seq.values)]
        self.encw = e
        id_of = pd.Series(e.encounter_id.values, index=e.enc_idx.values)
        a = self.adm
        a = a[(a.dis_ts >= pd.Timestamp(START)) | (a.adm_ts >= pd.Timestamp(START))].copy()
        a = a.sort_values(["fac", "adm_ts"]).reset_index().rename(columns={"index": "adm_row"})
        yy = a.adm_ts.dt.year
        seq = a.groupby([a.fac, yy]).cumcount() + 1
        short = np.array([f["short"] for f in FACILITIES])[a.fac.values]
        a["admission_id"] = [f"{s}A{y % 100:02d}{q:05d}" for s, y, q in zip(short, yy.values, seq.values)]
        a["ed_encounter_id"] = [id_of.get(k, "") if k >= 0 else "" for k in a.enc_idx.values]
        self.admw = a
        aid = pd.Series(a.admission_id.values, index=a.adm_row.values)
        ro = a.readmission_of.values
        self.manifest["truth"]["readmissions_generated_admission_ids"] = sorted(
            {aid.get(int(x)) for x in ro if x >= 0 and aid.get(int(x)) is not None})
        self.count("encounters_true_unique", int(((e.departure_ts <= self.cut_end)).sum()))
        self.count("admissions_true_unique", int((a.adm_ts <= self.cut_end).sum()))

    @property
    def cut_end(self):
        return pd.Timestamp(CUTOFF) + pd.Timedelta(hours=23, minutes=59, seconds=59)

    @property
    def delta_end(self):
        return pd.Timestamp(DELTA_DATE) + pd.Timedelta(hours=23, minutes=59, seconds=59)

    # ---------------- master data workbook
    def write_master_data(self):
        rng = self.rng
        d = self.out / "internal/master_data"
        regions = pd.DataFrame([dict(region_code=r[0], region_name=r[1], zone=r[2], malaria_stratum=r[3],
                                     known_aliases="; ".join(r[5])) for r in REGIONS])
        fac = pd.DataFrame([dict(facility_code=f["code"], facility_name=f["name"], facility_type=f["type"],
                                 region=REGION_BY_CODE[f["region"]][1], town=f["town"], latitude=f["lat"],
                                 longitude=f["lon"], elevation_m=f["elev"], has_emergency_department="Y" if f["ed"] > 0 else "N",
                                 catchment_share_pct=round(100 * f["catch"], 1), opened_date=f["opened"],
                                 ownership="Green Basket Health Services (Pty) Ltd") for f in FACILITIES])
        # DQ: region spelling variants and a hyphenated name (Type 1 correction arrives in the delta)
        fac.loc[fac.facility_code == "GBH-RUN", "region"] = "Kavango-East"
        fac.loc[fac.facility_code == "GBH-KAT", "region"] = "Zambezi (Caprivi)"
        fac.loc[fac.facility_code == "GBH-KAT", "facility_name"] = "GBHS Katima-Mulilo Hospital"
        self.truth_keys["MD01"] += ["GBH-RUN", "GBH-KAT"]
        units = []
        for u in UNITS:
            units.append(dict(unit_code=u[0], facility_code=u[1], unit_name=u[2], unit_type=u[3],
                              specialty=self.specialty_on(u[0], CUTOFF),
                              bed_complement=self.bed_complement(u[0], CUTOFF) if u[3] == "Inpatient ward" else 0,
                              active="Y"))
        units = pd.DataFrame(units)
        hist = pd.DataFrame([dict(change_id=i + 1, unit_code=c[0], attribute=c[1], old_value=c[2], new_value=c[3],
                                  effective_date=c[4], approved_by_role=c[5]) for i, c in enumerate(UNIT_CHANGES)])
        tri = pd.DataFrame([dict(triage_code=t[0], triage_label=t[1], priority=t[2], target_minutes=t[3],
                                 target_text=t[4], colour_hex=t[5]) for t in TRIAGE])
        icd = []
        for r in ICD:
            icd.append(dict(icd10_code=r[0], icd10_title=r[1], chapter=r[2], chapter_range=CHAPTERS[r[2]][0],
                            chapter_title=CHAPTERS[r[2]][1], block_range=r[3], block_title=r[4], severity_class=r[5],
                            default_specialty={"MED": "Medical", "SUR": "Surgical", "ICU": "Intensive care",
                                               "MAT": "Maternity"}[r[6]],
                            is_chronic_condition="Y" if r[7] else "N", idsr_condition_code=r[8] or ""))
        icd = pd.DataFrame(icd)
        dup = icd[icd.icd10_code == "J18.9"].copy()
        dup["icd10_title"] = "Pneumonia, organism unspecified (local title)"
        icd = pd.concat([icd, dup], ignore_index=True)        # DQ: duplicate code row
        icd.loc[icd.icd10_code == "I10", "icd10_code"] = "I10 "  # DQ: trailing blank
        self.truth_keys["MD06"] += ["J18.9", "I10"]
        conds = pd.DataFrame([dict(condition_code=c[0], condition_name=c[1], idsr_category=c[2], notification=c[3],
                                   alert_threshold=c[4], icd10_codes=c[5], known_aliases="; ".join(c[6])) for c in CONDITIONS])
        payers = pd.DataFrame([dict(payer_code=p[0], payer_name=p[1], payer_group=p[2], known_aliases="; ".join(p[3]))
                               for p in PAYERS])
        maps = []
        for typ, mp in CODE_MAPS.items():
            for raw, std in mp.items():
                maps.append(dict(code_type=typ, source_value=raw, standard_code=std,
                                 standard_description=CODE_LIST_DESC.get(typ, {}).get(std, "")))
        maps = pd.DataFrame(maps)
        readme = pd.DataFrame({"README": [
            "Green Basket Health Services (GBHS) master and reference data - FICTITIOUS organisation, synthetic data.",
            f"Extract date: {CUTOFF}. Sheets hold CURRENT values; Unit_History holds dated changes to care units.",
            "ICD-10 titles: World Health Organization ICD-10 (2019 edition); used under WHO terms for classification.",
            "Code_Mappings is maintained by the data stewards: raw source values -> standard codes.",
            "Catchment share = GBHS planning assumption of the share of the region's population served by the facility.",
        ]})
        self.write_xlsx(d / "GBHS_Master_Data.xlsx", [("README", readme), ("Regions", regions), ("Facilities", fac),
                                                      ("Care_Units", units), ("Unit_History", hist), ("Triage_Scale", tri),
                                                      ("ICD10_Codes", icd), ("IDSR_Conditions", conds),
                                                      ("Payer_Classes", payers), ("Code_Mappings", maps)])
        # day-2 master delta: corrected facility name (Type 1), two bed-complement changes (Type 2)
        fac_d = fac[fac.facility_code == "GBH-KAT"].copy()
        fac_d["facility_name"] = "GBHS Katima Mulilo Hospital"
        units_d = units[units.unit_code.isin([c[0] for c in UNIT_CHANGES_DELTA])].copy()
        for c in UNIT_CHANGES_DELTA:
            units_d.loc[units_d.unit_code == c[0], "bed_complement"] = int(c[3])
        hist_d = pd.DataFrame([dict(change_id=len(UNIT_CHANGES) + i + 1, unit_code=c[0], attribute=c[1], old_value=c[2],
                                    new_value=c[3], effective_date=c[4], approved_by_role=c[5])
                               for i, c in enumerate(UNIT_CHANGES_DELTA)])
        self.write_xlsx(self.out / "delta_2026-10-01" / "GBHS_Master_Data_delta_20261001.xlsx",
                        [("Facilities", fac_d), ("Care_Units", units_d), ("Unit_History", hist_d)])
        self.count("master_icd_rows", len(icd))

    @staticmethod
    def write_xlsx(path: Path, sheets):
        with pd.ExcelWriter(path, engine="openpyxl") as xw:
            for name, df in sheets:
                df.to_excel(xw, sheet_name=name, index=False)
            xw.book.properties.created = datetime(2026, 9, 30, 18, 0, 0)
            xw.book.properties.modified = datetime(2026, 9, 30, 18, 0, 0)
            xw.book.properties.creator = "GBHS Health Information Management"
            xw.book.properties.lastModifiedBy = "GBHS Health Information Management"

    # ---------------- master patient index
    def write_patients(self):
        rng = self.rng
        P = self.pat.copy()
        e = self.encw
        first = e.groupby("pidx").arrival_ts.min()
        P["first_seen"] = P.index.map(first)
        P = P[P.first_seen.notna() | P.index.isin(self.admw.pidx.unique())].copy()
        a_first = P.index.to_series().map(self.admw.groupby("pidx").adm_ts.min())
        P["first_seen"] = pd.concat([P.first_seen, a_first], axis=1).min(axis=1)
        # registration date: some time before the first contact, never before birth
        back = rng.integers(0, 2500, len(P))
        reg = (P.first_seen.dt.normalize() - pd.to_timedelta(back, unit="D"))
        birth_floor = pd.to_datetime(P.birth_year.astype(str) + "-01-01")
        P["registration_date"] = reg.where(reg >= birth_floor, P.first_seen.dt.normalize())
        # late-arriving registrations: patients first seen 28-30 Sep 2026 are missing from the main extract
        in_main = set(e.loc[e.departure_ts <= self.cut_end, "pidx"]) | set(self.admw.loc[self.admw.adm_ts <= self.cut_end, "pidx"])
        late = P[(P.first_seen >= pd.Timestamp("2026-09-28")) & (P.first_seen <= self.cut_end) & P.index.isin(in_main)]
        late = late.sample(n=min(40, len(late)), random_state=self.seed) if len(late) else late
        self.late_patients = set(late.patient_id)
        self.truth_keys["EN10"] += sorted(self.late_patients)
        # delta registrations: patients first seen on 1 October 2026
        new_delta = P[(P.first_seen > self.cut_end)]
        cur_reg = P.region_cur.map(lambda c: REGION_BY_CODE[c][1])
        main = pd.DataFrame({"patient_id": P.patient_id, "sex": P.sex, "birth_year": P.birth_year.astype(str),
                             "residence_region": cur_reg, "payer_class": P.payer_cur,
                             "registration_date": P.registration_date.dt.strftime("%Y-%m-%d"),
                             "last_updated": (P.registration_date + pd.Timedelta(hours=9)).dt.strftime("%Y-%m-%d %H:%M:%S")})
        ch_last = self.pat_changes.groupby("patient_id").effective_date.max()
        lu = main.patient_id.map(ch_last)
        has = lu.notna()
        main.loc[has, "last_updated"] = pd.to_datetime(lu[has].astype(str)).dt.strftime("%Y-%m-%d") + " 10:15:00"
        delta_ids = set(new_delta.patient_id) | self.late_patients
        main_x = main[~main.patient_id.isin(delta_ids)].copy()
        # DQ injections on the main MPI extract
        n = len(main_x)
        idx = main_x.index.values
        pick = lambda frac: rng.choice(idx, size=max(1, int(n * frac)), replace=False)
        sx = pick(0.02)
        main_x.loc[sx, "sex"] = main_x.loc[sx, "sex"].map({"F": "Female", "M": "male"})
        self.truth_keys["MD02"] += main_x.loc[sx, "patient_id"].tolist()
        by = pick(0.0005)
        main_x.loc[by, "birth_year"] = rng.choice(["1880", "2031", "0", "19.5"], size=len(by))
        self.truth_keys["MD03"] += main_x.loc[by, "patient_id"].tolist()
        pv = pick(0.02)
        alias = {p[0]: p[3] for p in PAYERS}
        main_x.loc[pv, "payer_class"] = [alias[p][int(rng.integers(0, len(alias[p])))] for p in main_x.loc[pv, "payer_class"]]
        self.truth_keys["MD05"] += main_x.loc[pv, "patient_id"].tolist()
        rv = pick(0.02)
        ralias = {r[1]: r[5] for r in REGIONS}
        main_x.loc[rv, "residence_region"] = [ralias[x][int(rng.integers(0, len(ralias[x])))] for x in main_x.loc[rv, "residence_region"]]
        self.truth_keys["MD01"] += main_x.loc[rv, "patient_id"].tolist()
        dups = main_x.loc[pick(0.0015)].copy()     # superseded duplicate versions (older last_updated)
        dups["payer_class"] = "CASH"
        dups["last_updated"] = (pd.to_datetime(dups.last_updated) - pd.Timedelta(days=400)).dt.strftime("%Y-%m-%d %H:%M:%S")
        self.truth_keys["MD04"] += dups.patient_id.tolist()
        main_x = pd.concat([main_x, dups]).sort_values("patient_id", kind="stable")
        main_x.to_csv(self.out / "internal/pas/pas_patient_index.csv.gz", index=False, compression=GZ)
        ch = self.pat_changes.copy()
        ch["captured_at"] = pd.to_datetime(ch.effective_date.astype(str)) + pd.Timedelta(hours=10, minutes=15)
        ch_main = ch[(ch.effective_date <= CUTOFF) & ch.patient_id.isin(set(main_x.patient_id))].copy()
        ch_main.insert(0, "change_id", np.arange(1, len(ch_main) + 1))
        ch_main["old_value"] = np.where(ch_main.attribute == "residence_region",
                                        ch_main.old_value.map(lambda c: REGION_BY_CODE.get(c, (0, c))[1]), ch_main.old_value)
        ch_main["new_value"] = np.where(ch_main.attribute == "residence_region",
                                        ch_main.new_value.map(lambda c: REGION_BY_CODE.get(c, (0, c))[1]), ch_main.new_value)
        ch_main.to_csv(self.out / "internal/pas/pas_patient_changes.csv.gz", index=False, compression=GZ)
        # delta MPI: late-arriving + new patients, plus 25 payer changes effective 1 Oct 2026
        delta = main[main.patient_id.isin(delta_ids)].copy()
        delta["last_updated"] = "2026-10-01 07:30:00"
        cand = main_x[~main_x.patient_id.isin(set(self.truth_keys["MD04"]) | set(self.truth_keys["MD05"]) |
                                              set(self.truth_keys["MD02"]) | set(self.truth_keys["MD03"]) |
                                              set(self.truth_keys["MD01"]))].drop_duplicates("patient_id")
        chg = cand.sample(n=25, random_state=self.seed + 1).copy()
        chg_rows = []
        for i, r in enumerate(chg.itertuples()):
            new = "PMA" if r.payer_class != "PMA" else "PSEMAS"
            chg_rows.append(dict(change_id=len(ch_main) + i + 1, patient_id=r.patient_id, attribute="payer_class",
                                 old_value=r.payer_class, new_value=new, effective_date="2026-10-01",
                                 captured_at="2026-10-01 10:15:00"))
        chg["payer_class"] = [c["new_value"] for c in chg_rows]
        chg["last_updated"] = "2026-10-01 10:15:00"
        pd.concat([delta, chg]).to_csv(self.out / "delta_2026-10-01/pas_patient_index_delta_20261001.csv", index=False)
        pd.DataFrame(chg_rows).to_csv(self.out / "delta_2026-10-01/pas_patient_changes_delta_20261001.csv", index=False)
        self.manifest["truth"]["delta_payer_changes"] = [c["patient_id"] for c in chg_rows]
        self.count("mpi_main_rows", len(main_x))
        self.count("mpi_main_unique_patients", main_x.patient_id.nunique())
        self.count("mpi_delta_rows", len(delta) + len(chg))
        self.count("mpi_change_rows_main", len(ch_main))

    # ---------------- ED and clinic attendances
    def write_encounters(self):
        rng = self.rng
        e = self.encw.copy()
        fac_codes = np.array([f["code"] for f in FACILITIES])
        e["facility_code"] = fac_codes[e.fac.values]
        e["department"] = np.where(e.is_ed, "ED", "OPD")
        e["patient_id"] = self.pat.patient_id.values[e.pidx.values]
        fmt = lambda s: s.dt.strftime("%Y-%m-%d %H:%M")
        out = pd.DataFrame({
            "encounter_id": e.encounter_id, "facility_code": e.facility_code, "department": e.department,
            "patient_id": e.patient_id, "arrival_datetime": fmt(e.arrival_ts),
            "triage_datetime": fmt(pd.to_datetime(e.triage_ts)).fillna(""),
            "triage_category": np.where(e.is_ed, e.triage, ""), "seen_datetime": fmt(e.seen_ts).fillna(""),
            "departure_datetime": fmt(e.departure_ts), "arrival_mode": e.arrival_mode, "disposition": e.disp,
            "primary_icd10": e.code})
        out["_dep"] = e.departure_ts.values
        out["_year"] = e.arrival_ts.dt.year.values
        out["_ed"] = e.is_ed.values
        delta = out[(out._dep > self.cut_end) & (out._dep <= self.delta_end)].copy()
        main = out[out._dep <= self.cut_end].copy()
        self.count("encounters_main_true", len(main))
        self.count("encounters_delta_true", len(delta))
        n = len(main)
        idx = main.index.values
        pick = lambda frac, pool=None: rng.choice(idx if pool is None else pool, size=max(1, int(n * frac)) if pool is None
                                                  else max(1, int(len(pool) * frac)), replace=False)
        # EN03 facility code variants
        v = pick(0.02)
        variants = lambda c: [c.lower(), c.replace("-", " "), c.replace("-", ""), " " + c][int(rng.integers(0, 4))]
        main.loc[v, "facility_code"] = [variants(c) for c in main.loc[v, "facility_code"]]
        self.truth_keys["EN03"] += main.loc[v, "encounter_id"].tolist()
        ed_idx = main.index[main._ed & (main.triage_category != "BLUE")].values
        # EN04 missing triage category
        v = pick(0.008, ed_idx)
        main.loc[v, "triage_category"] = ""
        self.truth_keys["EN04"] += main.loc[v, "encounter_id"].tolist()
        # triage spelling variants (mapped, EN09)
        rest = np.setdiff1d(ed_idx, v)
        v2 = pick(0.03, rest)
        tv = {"RED": ["Red", "red"], "ORANGE": ["Orange", "orange"], "YELLOW": ["Yellow", "YEL"], "GREEN": ["Green", "GRN"]}
        main.loc[v2, "triage_category"] = [tv[c][int(rng.integers(0, 2))] for c in main.loc[v2, "triage_category"]]
        self.truth_keys["EN09"] += main.loc[v2, "encounter_id"].tolist()
        # disposition and arrival-mode variants (EN09)
        v3 = pick(0.03)
        dv = {"DIS": ["Discharged", "DISCH"], "ADM": ["Admitted", "admit"], "LWBS": ["lwbs", "LWOBS"], "TRF": ["Transfer", "Transfer"],
              "DIED": ["Died", "Died"], "REF": ["Referred", "Referred"]}
        main.loc[v3, "disposition"] = [dv[c][int(rng.integers(0, 2))] for c in main.loc[v3, "disposition"]]
        self.truth_keys["EN09"] += main.loc[v3, "encounter_id"].tolist()
        v4 = pick(0.02)
        av = {"WALK": ["Walk in", "WALK-IN"], "AMB": ["Ambulance", "amb"], "REF": ["Referral", "Referral"]}
        main.loc[v4, "arrival_mode"] = [av[c][int(rng.integers(0, 2))] for c in main.loc[v4, "arrival_mode"]]
        self.truth_keys["EN09"] += main.loc[v4, "encounter_id"].tolist()
        # EN05 doctor-seen timestamp before arrival (day keyed wrongly)
        seen_idx = main.index[main.seen_datetime != ""].values
        v = pick(0.0015, seen_idx)
        main.loc[v, "seen_datetime"] = (pd.to_datetime(main.loc[v, "seen_datetime"]) - pd.Timedelta(days=1)).dt.strftime("%Y-%m-%d %H:%M")
        self.truth_keys["EN05"] += main.loc[v, "encounter_id"].tolist()
        # EN06 implausible length of stay (departure keyed days later)
        v = pick(0.0005)
        main.loc[v, "departure_datetime"] = (pd.to_datetime(main.loc[v, "departure_datetime"])
                                             + pd.to_timedelta(rng.integers(3, 11, len(v)), unit="D")).dt.strftime("%Y-%m-%d %H:%M")
        self.truth_keys["EN06"] += main.loc[v, "encounter_id"].tolist()
        # EN07 ICD-10 formatting variants (correctable)
        v = pick(0.03)
        icdv = lambda c: [c.lower(), c.replace(".", ""), c + " ", c + "-"][int(rng.integers(0, 4))]
        before = main.loc[v, "primary_icd10"].copy()
        main.loc[v, "primary_icd10"] = [icdv(c) for c in main.loc[v, "primary_icd10"]]
        changed = main.loc[v, "primary_icd10"] != before
        self.truth_keys["EN07"] += main.loc[v[changed.values], "encounter_id"].tolist()
        # EN08 invalid / missing ICD-10 code
        v = pick(0.0015)
        main.loc[v, "primary_icd10"] = rng.choice(["XYZ", "R50.99", "", "000"], size=len(v))
        self.truth_keys["EN08"] += main.loc[v, "encounter_id"].tolist()
        # EN11 unidentified patient (no patient ID)
        v = pick(0.0005, main.index[main._ed].values)
        main.loc[v, "patient_id"] = ""
        self.truth_keys["EN11"] += main.loc[v, "encounter_id"].tolist()
        # EN12 arrival year keyed wrongly (2062 instead of 2026, 2032 instead of 2023)
        v = rng.choice(idx, size=6, replace=False)
        main.loc[v, "arrival_datetime"] = "2062" + main.loc[v, "arrival_datetime"].str[4:]
        self.truth_keys["EN12"] += main.loc[v, "encounter_id"].tolist()
        # EN02 Oshakati exported dd/mm/yyyy HH:MM during 2023 (PAS upgrade)
        osh23 = main.index[(main._year == 2023) & (main.facility_code.str.upper().str.replace(r"[^A-Z]", "", regex=True) == "GBHOSH")]
        for col in ["arrival_datetime", "triage_datetime", "seen_datetime", "departure_datetime"]:
            vals = main.loc[osh23, col]
            ok = vals != ""
            main.loc[osh23[ok.values], col] = pd.to_datetime(vals[ok], errors="coerce").dt.strftime("%d/%m/%Y %H:%M").fillna(vals[ok])
        self.truth_keys["EN02"] += main.loc[osh23, "encounter_id"].tolist()
        # write yearly files; consecutive files overlap by two days (EN01 duplicates)
        cols = [c for c in out.columns if not c.startswith("_")]
        dup_total = []
        for y in range(2022, 2027):
            part = main[main._year == y]
            if y > 2022:
                prev = main[(main._year == y - 1) & (pd.to_datetime(main._dep) >= pd.Timestamp(f"{y - 1}-12-30"))]
                part = pd.concat([prev, part])
                dup_total += prev.encounter_id.tolist()
            extra = part.sample(n=8, random_state=self.seed + y)    # re-sent rows inside the same file
            dup_total += extra.encounter_id.tolist()
            part = pd.concat([part, extra]).sort_values("arrival_datetime", kind="stable")
            part[cols].to_csv(self.out / f"internal/pas/pas_ed_opd_encounters_{y}.csv.gz", index=False, compression=GZ)
            self.count(f"encounter_file_rows_{y}", len(part))
        self.truth_keys["EN01"] += dup_total
        delta[cols].to_csv(self.out / "delta_2026-10-01/pas_ed_opd_encounters_20261001.csv", index=False)
        self.count("encounter_file_rows_delta", len(delta))

    # ---------------- inpatient spells (CDC export)
    def write_spells(self):
        rng = self.rng
        a = self.admw.copy()
        fac_codes = np.array([f["code"] for f in FACILITIES])
        a["facility_code"] = fac_codes[a.fac.values]
        a["patient_id"] = self.pat.patient_id.values[a.pidx.values]
        fmt = lambda s: s.dt.strftime("%Y-%m-%d %H:%M")
        main = a[a.adm_ts <= self.cut_end].copy()
        open_at_cut = main.dis_ts > self.cut_end
        coded_delay = pd.to_timedelta(rng.uniform(1, 36, len(main)), unit="h")
        out = pd.DataFrame({
            "admission_id": main.admission_id, "facility_code": main.facility_code, "ward_code": main.ward,
            "patient_id": main.patient_id, "admission_datetime": fmt(main.adm_ts),
            "discharge_datetime": np.where(open_at_cut, "", fmt(main.dis_ts)),
            "admission_method": main.method, "discharge_status": np.where(open_at_cut, "", main.status),
            "principal_icd10": main.code, "ed_encounter_id": main.ed_encounter_id,
            "last_updated": np.where(open_at_cut, fmt(main.adm_ts + pd.Timedelta(minutes=30)),
                                     fmt(pd.Series(np.minimum((main.dis_ts + coded_delay).values,
                                                              np.datetime64(self.cut_end)), index=main.index)))})
        n = len(out)
        idx = out.index.values
        pick = lambda frac, pool=None: rng.choice(idx if pool is None else pool, size=max(1, int((n if pool is None else len(pool)) * frac)), replace=False)
        closed = out.index[out.discharge_datetime != ""].values
        # AD06 ghost spells: discharge never recorded in PAS (patient left; ward census does not count them)
        ghost = rng.choice(out.index[(out.discharge_datetime != "") & (main.dis_ts < pd.Timestamp("2026-07-01"))
                                     & (main.dis_ts > pd.Timestamp("2023-01-01"))].values, size=25, replace=False)
        out.loc[ghost, ["discharge_datetime", "discharge_status"]] = ""
        out.loc[ghost, "last_updated"] = fmt(main.loc[ghost, "adm_ts"] + pd.Timedelta(minutes=30))
        self.truth_keys["AD06"] += out.loc[ghost, "admission_id"].tolist()
        self.ghost_ids = set(out.loc[ghost, "admission_id"])
        closed = np.setdiff1d(closed, ghost)
        # AD02 discharge year keyed one year early (discharge before admission)
        v = pick(0.0003, closed)
        out.loc[v, "discharge_datetime"] = [str(int(s[:4]) - 1) + s[4:] for s in out.loc[v, "discharge_datetime"]]
        self.truth_keys["AD02"] += out.loc[v, "admission_id"].tolist()
        # AD03 discharge year keyed ten years late
        v = pick(0.0002, np.setdiff1d(closed, v))
        out.loc[v, "discharge_datetime"] = [str(int(s[:4]) + 10) + s[4:] for s in out.loc[v, "discharge_datetime"]]
        self.truth_keys["AD03"] += out.loc[v, "admission_id"].tolist()
        # AD04 ward code variants
        v = pick(0.02)
        wv = lambda c: [c.lower(), c.replace("-", " "), c.replace("-", "")][int(rng.integers(0, 3))]
        out.loc[v, "ward_code"] = [wv(c) for c in out.loc[v, "ward_code"]]
        self.truth_keys["AD04"] += out.loc[v, "admission_id"].tolist()
        # AD05 principal diagnosis not yet coded
        v = pick(0.008)
        out.loc[v, "principal_icd10"] = ""
        self.truth_keys["AD05"] += out.loc[v, "admission_id"].tolist()
        # AD07 admission-method code variants
        v = pick(0.02)
        mv = {"EMER-ED": ["Emergency", "EMERG-ED"], "ELECTIVE": ["elective", "Elective"], "MATERNITY": ["Maternity", "Maternity"],
              "TRANSFER-IN": ["Transfer in", "Transfer in"], "EMER-DIRECT": ["EMER-DIRECT", "EMER-DIRECT"]}
        out.loc[v, "admission_method"] = [mv[c][int(rng.integers(0, 2))] for c in out.loc[v, "admission_method"]]
        self.truth_keys["AD07"] += out.loc[v, "admission_id"].tolist()
        # AD01 superseded CDC versions: an earlier 'admitted' image of 12% of discharged spells
        old = out.loc[rng.choice(closed, size=int(len(closed) * 0.12), replace=False)].copy()
        old["discharge_datetime"] = ""
        old["discharge_status"] = ""
        old["last_updated"] = old.admission_datetime.map(lambda s: (pd.Timestamp(s) + pd.Timedelta(minutes=30)).strftime("%Y-%m-%d %H:%M"))
        self.truth_keys["AD01"] += old.admission_id.tolist()
        spells = pd.concat([out, old]).sort_values(["last_updated", "admission_id"], kind="stable")
        spells.to_csv(self.out / "internal/pas/pas_inpatient_spells.csv.gz", index=False, compression=GZ)
        self.count("spell_file_rows", len(spells))
        self.count("spells_main_unique", out.admission_id.nunique())
        # delta: new admissions on 1 Oct + discharge images of spells that were open at the cut-off
        da = a[((a.adm_ts > self.cut_end) & (a.adm_ts <= self.delta_end)) |
               ((a.adm_ts <= self.cut_end) & (a.dis_ts > self.cut_end) & (a.dis_ts <= self.delta_end))].copy()
        dis_known = da.dis_ts <= self.delta_end
        dout = pd.DataFrame({
            "admission_id": da.admission_id, "facility_code": da.facility_code, "ward_code": da.ward,
            "patient_id": da.patient_id, "admission_datetime": fmt(da.adm_ts),
            "discharge_datetime": np.where(dis_known, fmt(da.dis_ts), ""), "admission_method": da.method,
            "discharge_status": np.where(dis_known, da.status, ""), "principal_icd10": da.code,
            "ed_encounter_id": da.ed_encounter_id,
            "last_updated": np.where(dis_known, fmt(da.dis_ts + pd.Timedelta(minutes=45)), fmt(da.adm_ts + pd.Timedelta(minutes=30)))})
        dout.to_csv(self.out / "delta_2026-10-01/pas_inpatient_spells_20261001.csv", index=False)
        self.count("spell_delta_rows", len(dout))
        self.count("spells_discharged_in_delta", int(((da.adm_ts <= self.cut_end) & dis_known).sum()))

    # ---------------- ward midnight census (nurse-reported bed state)
    def write_census(self):
        rng = self.rng
        a = self.adm.copy()
        # ghost spells: the patients did leave - the ward census is correct, PAS is not
        census = self.compute_census(a, self.D)
        rows = []
        for w in WARDS:
            c = census[w[0]]
            closed = np.zeros(self.D, dtype=int)
            t = self.t_start
            while t < self.D:
                t += int(rng.exponential(90))
                if t >= self.D:
                    break
                dur = int(rng.integers(3, 21))
                closed[t:t + dur] = int(rng.integers(1, max(2, self.bed_complement(w[0], self.days[min(t, self.D - 1)].date()) // 5)))
                t += dur
            for t in range(self.t_start, self.D):
                d = self.days[t].date()
                occ = int(c["occ"][t])
                if rng.random() < 0.03:
                    occ = max(0, occ + int(rng.choice([-1, 1])))
                sub = datetime.combine(d + timedelta(days=1), datetime.min.time()) + timedelta(minutes=int(rng.integers(360, 600)))
                rows.append([d.isoformat(), w[0], int(closed[t]), occ, int(c["adm"][t]), int(c["dis"][t]), int(c["died"][t]),
                             sub.strftime("%Y-%m-%d %H:%M")])
        df = pd.DataFrame(rows, columns=["census_date", "ward_code", "beds_closed", "occupied_midnight", "admissions",
                                         "discharges", "deaths", "submitted_at"])
        self.census_true = df.copy()
        main = df[df.census_date <= CUTOFF.isoformat()].copy()
        delta = df[df.census_date == DELTA_DATE.isoformat()].copy()
        delta["submitted_at"] = delta.census_date + " 23:59"   # submitted before the delta extract closes
        n = len(main)
        idx = main.index.values
        pick = lambda k: rng.choice(idx, size=k, replace=False)
        key = lambda df_, v: (df_.loc[v, "ward_code"] + "|" + df_.loc[v, "census_date"]).tolist()
        # WC01 missing returns
        v = pick(int(n * 0.008))
        self.truth_keys["WC01"] += key(main, v)
        main = main.drop(index=v)
        idx = main.index.values
        # WC02 x10 keying errors
        v = rng.choice(main.index[main.occupied_midnight >= 3].values, size=int(n * 0.0005), replace=False)
        main.loc[v, "occupied_midnight"] = main.loc[v, "occupied_midnight"] * 10
        self.truth_keys["WC02"] += key(main, v)
        # WC04 negative or blank occupied beds
        v = rng.choice(np.setdiff1d(idx, v), size=int(n * 0.0004), replace=False)
        main["occupied_midnight"] = main.occupied_midnight.astype(object)
        main.loc[v, "occupied_midnight"] = rng.choice([-1, "", -3], size=len(v))
        self.truth_keys["WC04"] += key(main, v)
        # WC03 resubmissions: first submission wrong, corrected later the same morning
        v = rng.choice(main.index[main.occupied_midnight.map(lambda x: isinstance(x, (int, np.integer)) and x > 2)].values,
                       size=int(n * 0.003), replace=False)
        first = main.loc[v].copy()
        first["occupied_midnight"] = first.occupied_midnight.astype(int) + rng.choice([-2, 2], size=len(v))
        first["submitted_at"] = (pd.to_datetime(first.submitted_at) - pd.Timedelta(hours=2)).dt.strftime("%Y-%m-%d %H:%M")
        self.truth_keys["WC03"] += key(main, v)
        main = pd.concat([main, first]).sort_values(["census_date", "ward_code", "submitted_at"], kind="stable")
        main.to_csv(self.out / "internal/wards/ward_midnight_census.csv", index=False)
        delta.to_csv(self.out / "delta_2026-10-01/ward_midnight_census_20261001.csv", index=False)
        self.count("census_file_rows", len(main))
        self.count("census_delta_rows", len(delta))

    # ---------------- e-roster
    def write_roster(self):
        rng = self.rng
        r = self.roster.copy()
        r["roster_date"] = r.roster_date.astype(str)
        main = r[r.roster_date <= CUTOFF.isoformat()].copy()
        delta = r[r.roster_date == DELTA_DATE.isoformat()].copy()
        key = lambda df_, v: (df_.loc[v, "unit_code"] + "|" + df_.loc[v, "roster_date"] + "|" + df_.loc[v, "shift"]).tolist()
        n = len(main)
        idx = main.index.values
        # RS02 negative hours (keying sign error)
        v = rng.choice(idx, size=int(n * 0.0003), replace=False)
        main.loc[v, "rn_hours"] = -main.loc[v, "rn_hours"]
        self.truth_keys["RS02"] += key(main, v)
        # RS04 overtime larger than hours worked
        v2 = rng.choice(np.setdiff1d(idx, v), size=int(n * 0.0003), replace=False)
        main.loc[v2, "overtime_hours"] = main.loc[v2, "rn_hours"] + main.loc[v2, "en_hours"] + 30
        self.truth_keys["RS04"] += key(main, v2)
        # RS01 shift-code variants in the Walvis Bay units (old rostering template)
        wv = main.index[main.unit_code.str.startswith("WVB")]
        self.truth_keys["RS01"] += key(main, wv)
        main.loc[wv, "shift"] = main.loc[wv, "shift"].map({"D": "Day", "N": "Night"})
        # RS03 duplicated rows (exported twice)
        dup = main.loc[rng.choice(idx, size=int(n * 0.002), replace=False)].copy()
        self.truth_keys["RS03"] += (dup.unit_code + "|" + dup.roster_date + "|" + dup["shift"].map({"Day": "D", "Night": "N"}).fillna(dup["shift"])).tolist()
        main = pd.concat([main, dup]).sort_values(["roster_date", "unit_code"], kind="stable")
        main.to_csv(self.out / "internal/roster/eroster_shift_summary.csv.gz", index=False, compression=GZ)
        delta.to_csv(self.out / "delta_2026-10-01/eroster_shift_summary_20261001.csv", index=False)
        self.count("roster_file_rows", len(main))
        self.count("roster_delta_rows", len(delta))

    # ---------------- IDSR weekly returns
    def write_idsr(self):
        rng = self.rng
        s = self.idsr.copy()
        s["submitted_at"] = pd.to_datetime(s.submitted_at)
        late = s.submitted_at > self.cut_end
        delta = s[late & (s.submitted_at <= self.delta_end)].copy()
        main = s[~late].copy()
        key = lambda df_, v: (df_.loc[v, "facility_code"] + "|" + df_.loc[v, "epi_week"] + "|" + df_.loc[v, "condition"]).tolist()
        idx = main.index.values
        # SV06 x10 keying outliers on cases aged 5+
        v = rng.choice(main.index[(main.cases_5plus >= 2)].values, size=8, replace=False)
        main.loc[v, "cases_5plus"] = main.loc[v, "cases_5plus"] * 10
        self.truth_keys["SV06"] += key(main, v)
        # SV04 deaths larger than cases
        v = rng.choice(main.index[(main.cases_5plus + main.cases_under5 >= 1) & (main.condition != "MAL")].values, size=4, replace=False)
        main.loc[v, "deaths_5plus"] = main.loc[v, "cases_5plus"] + main.loc[v, "cases_under5"] + 5
        self.truth_keys["SV04"] += key(main, v)
        # SV05 positive tests larger than tests done
        v = rng.choice(main.index[(main.condition == "MAL") & (main.tests_done >= 3)].values, size=4, replace=False)
        main.loc[v, "tests_done"] = (main.loc[v, "tests_positive"] // 2).astype(int)
        self.truth_keys["SV05"] += key(main, v)
        # SV07 negative counts
        v = rng.choice(main.index[main.cases_under5 == 0].values, size=3, replace=False)
        main.loc[v, "cases_under5"] = -1
        self.truth_keys["SV07"] += key(main, v)
        # SV03 condition name variants (aliases)
        alias = {c[0]: [a for a in c[6] if a != c[0]] for c in CONDITIONS}
        v = rng.choice(idx, size=int(len(idx) * 0.06), replace=False)
        self.truth_keys["SV03"] += key(main, v)
        main["condition"] = main.condition.astype(object)
        main.loc[v, "condition"] = [alias[c][int(rng.integers(0, len(alias[c])))] for c in main.loc[v, "condition"]]
        # SV02 resubmitted (corrected) reports: the original version is superseded
        reps = main[["facility_code", "epi_week"]].drop_duplicates()
        rs = reps.sample(frac=0.03, random_state=self.seed)
        orig = main.merge(rs, on=["facility_code", "epi_week"]).copy()
        orig["submitted_at"] = orig.submitted_at - pd.Timedelta(hours=26)
        orig["report_version"] = 1
        main = main.merge(rs.assign(_rs=1), on=["facility_code", "epi_week"], how="left")
        main.loc[main._rs == 1, "report_version"] = 2
        main = main.drop(columns="_rs")
        orig["cases_5plus"] = (orig.cases_5plus + rng.choice([0, 0, 1, -1], size=len(orig))).clip(lower=0)
        self.truth_keys["SV02"] += (rs.facility_code + "|" + rs.epi_week).tolist()
        # SV01 Nkurenkuru reports the epi week as 'W05/2024'
        nk = main.facility_code == "GBC-NKU"
        self.truth_keys["SV01"] += (main.loc[nk, "facility_code"] + "|" + main.loc[nk, "epi_week"]).drop_duplicates().tolist()
        main.loc[nk, "epi_week"] = main.loc[nk, "epi_week"].map(lambda s: f"W{s[6:8]}/{s[:4]}")
        nk_o = orig.facility_code == "GBC-NKU"
        orig.loc[nk_o, "epi_week"] = orig.loc[nk_o, "epi_week"].map(lambda s: f"W{s[6:8]}/{s[:4]}")
        main = pd.concat([main, orig]).sort_values(["submitted_at", "facility_code"], kind="stable")
        for df_ in (main, delta):
            df_["submitted_at"] = df_.submitted_at.dt.strftime("%Y-%m-%d %H:%M")
            for c in ("tests_done", "tests_positive"):
                df_[c] = df_[c].map(lambda x: "" if x is None or (isinstance(x, float) and np.isnan(x)) else str(int(x)))
        main.to_csv(self.out / "internal/idsr/idsr_weekly_returns.csv", index=False)
        delta.to_csv(self.out / "delta_2026-10-01/idsr_weekly_returns_late_20261001.csv", index=False)
        self.count("idsr_file_rows", len(main))
        self.count("idsr_delta_rows", len(delta))
        cov = self.idsr_cover
        self.manifest["truth"]["idsr_reports_never_received"] = int(cov.submitted_at.isna().sum())
        self.manifest["truth"]["idsr_reports_late"] = int((cov.submitted_at > cov.due_at).sum())
        self.manifest["truth"]["idsr_reports_received_after_cutoff"] = int((cov.submitted_at > self.cut_end.to_pydatetime()).sum())

    # ---------------- external: NSA census (real values) and NASA POWER (stand-in)
    def write_census_nsa(self):
        sep = lambda n: f"{n:,}".replace(",", " ")
        lines = ['"Table 2: Population by region, Namibia 2023 Population and Housing Census - preliminary results"',
                 '"Source: Namibia Statistics Agency (13 March 2024). Transcribed for the ABI820S project."',
                 "",
                 "Region,Population"]
        for r in sorted(REGIONS, key=lambda r: r[1].lstrip("/")):
            lines.append(f'{r[1]},"{sep(r[4])}"')
        lines += [f'Namibia,"{sep(NATIONAL_POP_2023)}"', "",
                  '"Note: regional totals are preliminary and may be revised in the final report."']
        (self.out / "external/nsa/nsa_census2023_population_by_region.csv").write_text("\n".join(lines) + "\n", encoding="utf-8")
        self.note("nsa_thousands_separator_spaces", len(REGIONS) + 1)
        self.note("nsa_title_total_and_footnote_rows", 5)

    def write_weather(self):
        rng = self.rng
        d = self.out / "external/nasa_power"
        n_missing = 0
        for f in FACILITIES:
            w = self.weather[f["code"]]
            w = w[w.index <= CUTOFF]
            params = {}
            for col in ["PRECTOTCORR", "T2M_MAX", "T2M_MIN", "RH2M"]:
                vals = w[col].to_numpy().copy()
                miss = rng.random(len(vals)) < 0.003
                miss[-3:] = True                        # data latency: the newest days are not yet available
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
                "messages": [],
                "parameters": {
                    "PRECTOTCORR": {"units": "mm/day", "longname": "Precipitation Corrected"},
                    "T2M_MAX": {"units": "C", "longname": "Temperature at 2 Meters Maximum"},
                    "T2M_MIN": {"units": "C", "longname": "Temperature at 2 Meters Minimum"},
                    "RH2M": {"units": "%", "longname": "Relative Humidity at 2 Meters"}},
                "times": {"data": 0.0, "process": 0.0},
            }
            with open(d / f"POWER_Point_Daily_{f['code']}.json", "w") as fh:
                json.dump(payload, fh)
        self.note("weather_fill_values_-999", n_missing)

    def write_truth(self):
        out = self.out
        e = self.encw
        main = e[e.departure_ts <= self.cut_end]
        t = self.manifest["truth"]
        t["encounters_by_year"] = {int(k): int(v) for k, v in main.groupby(main.arrival_ts.dt.year).size().items()}
        mal = main[main.code.isin(["B50.9", "B54"])]
        t["malaria_encounters_by_year"] = {int(k): int(v) for k, v in mal.groupby(mal.arrival_ts.dt.year).size().items()}
        t["malaria_encounters_by_facility_2025"] = {FACILITIES[int(k)]["code"]: int(v) for k, v in
                                                    mal[mal.arrival_ts.dt.year == 2025].groupby("fac").size().items()}
        t["lwbs_rate"] = round(float((main.disp == "LWBS").mean()), 4)
        a = self.admw
        am = a[a.adm_ts <= self.cut_end]
        t["admissions_by_method"] = {k: int(v) for k, v in am.groupby("method").size().items()}
        t["ghost_spells"] = sorted(self.ghost_ids)
        t["late_arriving_patients"] = sorted(self.late_patients)
        t["unit_changes"] = [dict(unit=c[0], attribute=c[1], old=c[2], new=c[3], effective=str(c[4])) for c in UNIT_CHANGES]
        t["unit_changes_delta"] = [dict(unit=c[0], attribute=c[1], old=c[2], new=c[3], effective=str(c[4])) for c in UNIT_CHANGES_DELTA]
        t["staffing_intervention"] = ("From 5 Jan 2026 Rundu, Katima Mulilo and Nkurenkuru received 25% agency nurse hours; "
                                      "the Rundu and Katima EDs had one extra day-shift doctor from 5 Jan to 30 Jun 2026.")
        t["malaria_model"] = ("daily cases = base(facility) x season amplitude x (rain 21-56 days earlier / Jan-May mean)^1.3; "
                              "imported cases follow the north-east curve with a 7-day lag")
        for k, v in self.truth_keys.items():
            self.note(k, len(v))
        with open(out / "generator_manifest.json", "w") as fh:
            json.dump(self.manifest, fh, indent=2, default=str)
        with open(out / "dq_ground_truth.json", "w") as fh:
            json.dump({k: sorted(set(map(str, v))) for k, v in sorted(self.truth_keys.items())}, fh, indent=1)

    # ------------------------------------------------------------ run
    def run(self):
        self.build_calendar()
        self.gen_weather()
        self.gen_disease_curves()
        self.gen_patients()
        self.gen_encounters_pass1()
        self.gen_admissions()
        self.census1 = self.compute_census(self.adm, self.D)
        self.occ1 = self.hospital_occupancy(self.census1)
        self.gen_roster()
        self.gen_waits()
        self.finalize_admissions()
        self.gen_idsr()
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
    print(json.dumps({"row_counts": man["row_counts"], "injected_defects": man["injected_defects"]}, indent=1, default=str))


if __name__ == "__main__":
    main()
