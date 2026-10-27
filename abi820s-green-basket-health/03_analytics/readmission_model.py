#!/usr/bin/env python3
"""
readmission_model.py - Technique 2: classification of 30-day emergency readmission risk (ABI820S 3.5).

Business question BQ5: which discharged patients are most likely to be readmitted as an emergency within
30 days, so that discharge planners can target follow-up calls and medicine reconciliation?

Population : eligible spells (discharged alive home or against advice, not maternity, 30 days of follow-up);
             target = readmitted_within_30d (warehouse milestone 3 of the accumulating snapshot).
Features   : only information available at discharge - age band, sex, payer group, admitting specialty, ICD-10
             chapter, chronic-condition flag, severity class, length of stay, prior admissions in 12 months,
             discharge weekday (Friday-Sunday), discharge status (against medical advice), emergency admission,
             intensive-care stay.
Models     : M1 logistic regression (interpretable odds ratios) and M2 histogram gradient boosting.
Validation : temporal split - train on discharges up to 2025-06-30, test on 2025-07-01 .. 2026-08-31.
Metrics    : ROC AUC, PR AUC (vs prevalence), Brier score, calibration by decile, top-20 % capture
             (recall) and precision; fairness check by sex and age band (true/false positive rates and
             calibration-in-the-large at the operating threshold).
Outputs    : figures rm_*.png, evidence rm_*.md, tables mart.analytics_readmission_deciles / _drivers.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score, roc_curve
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from common import EVIDENCE, INK2, SERIES, md_table, query, save, setup_style, subtitle, write_table

SPLIT = pd.Timestamp("2025-07-01")
TEST_END = pd.Timestamp("2026-08-31")
CAT = ["age_band", "sex", "payer_group", "specialty", "chapter", "severity_class", "admission_method"]
NUM = ["los_days", "prior_admissions_12m"]
BIN = ["is_chronic", "weekend_discharge", "ama", "icu"]


def load() -> pd.DataFrame:
    df = query("""
        SELECT f.admission_key, dd.full_date AS discharge_date, ab.age_band, p.sex, p.payer_group, cu.specialty,
               dx.chapter_code AS chapter, dx.severity_class, ap.admission_method_code AS admission_method,
               f.los_days, f.prior_admissions_12m, dx.is_chronic::int AS is_chronic,
               (extract(isodow FROM f.discharge_ts) IN (5, 6, 7))::int AS weekend_discharge,
               (ap.discharge_status_code = 'AMA')::int AS ama, (cu.specialty = 'Intensive care')::int AS icu,
               f.readmitted_within_30d AS y
        FROM dw.fact_admission f
        JOIN dw.dim_date dd ON dd.date_key = f.discharge_date_key
        JOIN dw.dim_age_band ab ON ab.age_band_key = f.age_band_key
        JOIN dw.dim_patient p ON p.patient_key = f.patient_key
        JOIN dw.dim_care_unit cu ON cu.care_unit_key = f.care_unit_key
        JOIN dw.dim_diagnosis dx ON dx.diagnosis_key = f.diagnosis_key
        JOIN dw.dim_admission_profile ap ON ap.admission_profile_key = f.admission_profile_key
        WHERE f.readmission_eligible = 1""")
    df["discharge_date"] = pd.to_datetime(df.discharge_date)
    for c in NUM + BIN + ["y"]:
        df[c] = df[c].astype(float)
    return df


def build(model: str) -> Pipeline:
    # logistic regression: reference-category coding (first level dropped) so that odds ratios are interpretable
    enc = OneHotEncoder(handle_unknown="ignore", min_frequency=50, sparse_output=False, drop="first" if model == "logit" else None)
    pre = ColumnTransformer([("cat", enc, CAT), ("num", StandardScaler(), NUM), ("bin", "passthrough", BIN)])
    clf = (LogisticRegression(max_iter=2000, C=1.0) if model == "logit"
           else HistGradientBoostingClassifier(max_iter=300, learning_rate=0.05, max_leaf_nodes=31, min_samples_leaf=80,
                                               l2_regularization=1.0, random_state=20261028))
    return Pipeline([("pre", pre), ("clf", clf)])


def rates(y, p, thr):
    pred = p >= thr
    tp = ((pred == 1) & (y == 1)).sum()
    fp = ((pred == 1) & (y == 0)).sum()
    fn = ((pred == 0) & (y == 1)).sum()
    tn = ((pred == 0) & (y == 0)).sum()
    return dict(tpr=tp / max(tp + fn, 1), fpr=fp / max(fp + tn, 1), ppv=tp / max(tp + fp, 1), flagged=pred.mean())


def main():
    setup_style()
    import matplotlib.pyplot as plt
    df = load()
    train = df[df.discharge_date < SPLIT]
    test = df[(df.discharge_date >= SPLIT) & (df.discharge_date <= TEST_END)]
    X = CAT + NUM + BIN
    results, probs = [], {}
    for name, key in (("Logistic regression", "logit"), ("Gradient boosting", "gbm")):
        pipe = build(key).fit(train[X], train.y)
        p = pipe.predict_proba(test[X])[:, 1]
        probs[name] = (pipe, p)
        thr = np.quantile(p, 0.80)          # operating point: follow up the top 20 % highest-risk discharges
        r = rates(test.y.values, p, thr)
        results.append(dict(model=name, roc_auc=roc_auc_score(test.y, p), pr_auc=average_precision_score(test.y, p),
                            brier=brier_score_loss(test.y, p), recall_top20=r["tpr"], precision_top20=r["ppv"]))
    res = pd.DataFrame(results)
    prevalence = test.y.mean()
    best = res.sort_values("roc_auc", ascending=False).iloc[0].model
    pipe, p = probs[best]
    thr = np.quantile(p, 0.80)
    # calibration by decile
    test = test.assign(p=p, decile=pd.qcut(p, 10, labels=False, duplicates="drop") + 1)
    cal = test.groupby("decile").agg(spells=("y", "size"), mean_predicted=("p", "mean"), observed=("y", "mean")).reset_index()
    # fairness by sex and age band
    fair = []
    for col in ("sex", "age_band"):
        for g, sub in test.groupby(col):
            if len(sub) < 200:
                continue
            r = rates(sub.y.values, sub.p.values, thr)
            fair.append(dict(attribute=col, group=g, spells=len(sub), observed_rate=sub.y.mean(), mean_predicted=sub.p.mean(),
                             tpr=r["tpr"], fpr=r["fpr"], flagged_share=r["flagged"]))
    fair = pd.DataFrame(fair)
    # interpretable drivers (logistic regression odds ratios)
    lpipe, _ = probs["Logistic regression"]
    names = lpipe.named_steps["pre"].get_feature_names_out()
    coefs = lpipe.named_steps["clf"].coef_[0]
    drv = pd.DataFrame({"feature": names, "odds_ratio": np.exp(coefs)})
    drv["feature"] = (drv.feature.str.replace("cat__", "", regex=False).str.replace("num__", "", regex=False)
                      .str.replace("bin__", "", regex=False).str.replace("_", " "))
    drv["effect"] = np.abs(np.log(drv.odds_ratio))
    drv = drv.sort_values("effect", ascending=False)
    top = drv.head(12).copy()

    # ---- evidence
    rt = res.copy()
    rt["roc_auc"] = rt.roc_auc.map(lambda v: f"{v:.3f}")
    rt["pr_auc"] = rt.pr_auc.map(lambda v: f"{v:.3f}")
    rt["brier"] = rt.brier.map(lambda v: f"{v:.4f}")
    rt["recall_top20"] = rt.recall_top20.map(lambda v: f"{100 * v:.1f} %")
    rt["precision_top20"] = rt.precision_top20.map(lambda v: f"{100 * v:.1f} %")
    rt.columns = ["model", "ROC AUC", "PR AUC", "Brier score", "recall at top 20 %", "precision at top 20 %"]
    (EVIDENCE / "rm_metrics.md").write_text(md_table(rt), encoding="utf-8")
    ct = cal.copy()
    ct["mean_predicted"] = ct.mean_predicted.map(lambda v: f"{100 * v:.1f} %")
    ct["observed"] = ct.observed.map(lambda v: f"{100 * v:.1f} %")
    (EVIDENCE / "rm_calibration.md").write_text(md_table(ct), encoding="utf-8")
    ft = fair.copy()
    for c in ("observed_rate", "mean_predicted", "tpr", "fpr", "flagged_share"):
        ft[c] = ft[c].map(lambda v: f"{100 * v:.1f} %")
    (EVIDENCE / "rm_fairness.md").write_text(md_table(ft), encoding="utf-8")
    tt = top[["feature", "odds_ratio"]].copy()
    tt["odds_ratio"] = tt.odds_ratio.map(lambda v: f"{v:.2f}")
    (EVIDENCE / "rm_drivers.md").write_text(md_table(tt), encoding="utf-8")
    (EVIDENCE / "rm_summary.md").write_text(
        f"Eligible spells: {len(df):,} (train {len(train):,} discharged before {SPLIT.date()}, test {len(test):,} up to "
        f"{TEST_END.date()}). Test prevalence {100 * prevalence:.1f} %. Best model by ROC AUC: **{best}**. "
        f"Operating threshold = top 20 % of predicted risk (p >= {thr:.3f}).\n", encoding="utf-8")

    # ---- figures
    fig, axes = plt.subplots(1, 2, figsize=(10, 4.2))
    ax = axes[0]
    for (name, (_, pp)), col in zip(probs.items(), (SERIES[0], SERIES[1])):
        fpr, tpr, _ = roc_curve(test.y, pp)
        ax.plot(fpr, tpr, color=col, lw=2, label=f"{name} (AUC {roc_auc_score(test.y, pp):.2f})")
    ax.plot([0, 1], [0, 1], color="#b9b8b1", lw=1, ls="--", label="No skill")
    ax.set_xlabel("False positive rate")
    ax.set_ylabel("True positive rate")
    ax.set_title("ROC curve, test period", loc="left")
    ax.legend(loc="lower right", fontsize=8.5)
    ax = axes[1]
    ax.plot([0, cal.mean_predicted.max() * 1.1], [0, cal.mean_predicted.max() * 1.1], color="#b9b8b1", lw=1, ls="--", label="Perfect calibration")
    ax.plot(cal.mean_predicted, cal.observed, color=SERIES[0], lw=2, marker="o", ms=6, label=best)
    ax.set_xlabel("Mean predicted risk (decile)")
    ax.set_ylabel("Observed readmission rate")
    ax.set_title("Calibration by risk decile", loc="left")
    ax.legend(loc="upper left", fontsize=8.5)
    fig.tight_layout()
    save(fig, "rm_roc_calibration.png")

    fig, ax = plt.subplots(figsize=(9, 4.4))
    tp = top.iloc[::-1]
    colors = [SERIES[1] if v > 1 else SERIES[0] for v in tp.odds_ratio]
    ax.barh(tp.feature, tp.odds_ratio - 1, left=1, color=colors, height=0.6)
    ax.axvline(1, color="#3d3c39", lw=1)
    ax.set_xlabel("Odds ratio (logistic regression; 1 = no effect)")
    ax.set_title("What drives 30-day readmission risk?", loc="left")
    subtitle(ax, "Orange raises risk, blue lowers it; categories vs reference (age 0-4, female, government payer); numeric per 1 SD")
    ax.grid(axis="x", color="#e1e0d9")
    ax.grid(axis="y", visible=False)
    save(fig, "rm_drivers.png")

    # ---- mart tables for Power BI
    cal_out = cal.assign(model=best)
    write_table(cal_out, "mart.analytics_readmission_deciles",
                {"decile": "integer", "spells": "integer", "mean_predicted": "numeric", "observed": "numeric", "model": "text"})
    write_table(top.rename(columns={"feature": "driver"}).assign(direction=np.where(top.odds_ratio > 1, "Raises risk", "Lowers risk")),
                "mart.analytics_readmission_drivers", {"driver": "text", "odds_ratio": "numeric", "direction": "text"})
    print(res.to_string(index=False))
    print(cal.to_string(index=False))
    print(fair.to_string(index=False))
    print(top.to_string(index=False))


if __name__ == "__main__":
    main()
