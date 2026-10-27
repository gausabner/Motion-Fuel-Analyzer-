Ground truth: 8 injected x10/x1000 keying errors among 7,368 accepted harvest records (base rate 0.109 %). Isolation Forest PR-AUC (average precision) = 0.484; 5 of the 8 errors are in the 25 highest-scored records.

| detector | flagged | true_pos | precision | recall | f1 |
|---|---|---|---|---|---|
| SQL rule HV06 (corrected) | 7 | 7 | 1.000 | 0.875 | 0.933 |
| Isolation Forest (all flags) | 12 | 4 | 0.333 | 0.500 | 0.400 |
| Isolation Forest + upward-deviation filter | 4 | 4 | 1.000 | 0.500 | 0.667 |
