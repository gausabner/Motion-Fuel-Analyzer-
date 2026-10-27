- **PAS attendances (stg.encounter_raw)** - rows: 563,209; distinct keys: 560,243; duplicate rows: 2,966; pct missing triage ed: 0.51; pct missing patient: 0.032; pct missing seen time: 3.86; dayfirst timestamps: 16,477; nonstandard icd codes: 16,598; distinct disposition spellings: 15

- **PAS inpatient spells (stg.spell_raw)** - rows: 151,774; distinct keys: 135,551; duplicate rows: 16,223; pct missing discharge: 10.92; pct missing diagnosis: 0.81; distinct method spellings: 10; distinct ward spellings: 84

- **Patient index (stg.patient_raw)** - rows: 107,332; distinct keys: 107,172; duplicate rows: 160; distinct sex spellings: 4; distinct payer spellings: 18; distinct region spellings: 37; implausible birth years: 53

- **Ward census (stg.census_raw)** - rows: 36,232; distinct keys: 36,123; duplicate rows: 109; blank or negative: 14; max occupied value: 340

- **E-roster (stg.roster_raw)** - rows: 97,502; distinct keys: 97,308; duplicate rows: 194; distinct shift spellings: 4; negative hours: 29

- **IDSR returns (stg.idsr_raw)** - rows: 22,410; distinct condition spellings: 30; weeks in w slash format: 2,187; negative counts: 3; positives gt tests: 4
