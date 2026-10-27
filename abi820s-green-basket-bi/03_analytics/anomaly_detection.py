#!/usr/bin/env python3
"""
anomaly_detection.py - unsupervised anomaly detection on harvest records (ABI820S 3.5, technique 4).

Question: can an unsupervised model find keying errors in farm harvest logs without hand-written rules?
Data: every accepted harvest record with its ORIGINAL keyed quantity (before rule HV06 corrections).
Features (per record): ln(kg); ln(kg / block planted ha); ln(kg / median of the 4 neighbouring records of
the same block); ln(kg / crop-cycle median); ln(implied block yield / leave-one-out median of the sister blocks).
Model: Isolation Forest (Liu, Ting & Zhou 2008), contamination set to the expected error rate (0.15 %).
Evaluation against the generator's ground truth (manifest): precision, recall, F1, plus PR-AUC of the
anomaly score - compared with the deterministic SQL rule HV06 used in the ETL.
Top-scored records are written to dw.harvest_anomaly for steward review.
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.metrics import average_precision_score, f1_score, precision_score, recall_score

from common import EVIDENCE, GRAY, INK2, ROOT, SERIES, execute, md_table, query, save, setup_style, subtitle


def load() -> pd.DataFrame:
    df = query("""
        SELECT h.source_file, h.row_num, h.farm_code, h.crop_code, h.block_id, h.cycle_id, h.harvest_date,
               (h.qty_raw * h.kg_factor)::float8 AS kg_keyed, p.planted_ha::float8 AS block_ha,
               coalesce(h.dq_note, '') LIKE '%HV06%' AS hv06_flagged,
               EXISTS (SELECT 1 FROM audit.dq_issue_log l WHERE l.rule_code = 'HV06' AND l.batch_id = 1
                        AND l.source_key = h.source_file || ':' || h.row_num AND l.action_taken LIKE 'Divided%') AS hv06_corrected
        FROM stg.harvest_clean h
        LEFT JOIN stg.planting_clean p ON p.cycle_id = h.cycle_id AND p.block_id = h.block_id
        WHERE h.dq_status IN ('OK', 'CORRECTED')""")
    df["key"] = df.source_file + ":" + df.row_num.astype(str)
    return df


def features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.sort_values(["cycle_id", "block_id", "harvest_date", "row_num"]).copy()
    df["lk"] = np.log(df.kg_keyed)
    df["lk_per_ha"] = np.log(df.kg_keyed / df.block_ha.fillna(df.block_ha.median()))
    g = df.groupby(["cycle_id", "block_id"], dropna=False).kg_keyed

    def nb_med(s):
        v = s.to_numpy()
        out = np.full(len(v), np.nan)
        for i in range(len(v)):
            nb = np.r_[v[max(0, i - 2):i], v[i + 1:i + 3]]
            if len(nb):
                out[i] = np.median(nb)
        return pd.Series(out, index=s.index)

    df["nb_med"] = g.transform(nb_med)
    df["l_vs_neigh"] = np.log(df.kg_keyed / df.nb_med).fillna(0)
    df["l_vs_cycle"] = np.log(df.kg_keyed / df.groupby("cycle_id").kg_keyed.transform("median")).fillna(0)
    blk = df.groupby(["cycle_id", "block_id"]).agg(bkg=("kg_keyed", "sum"), bha=("block_ha", "first")).reset_index()
    blk["by"] = blk.bkg / blk.bha

    def loo_median(s):  # leave-one-out: a block must not be part of its own reference (cf. rule HV06)
        v = s.to_numpy()
        return pd.Series([np.median(np.delete(v, i)) if len(v) > 1 else np.nan for i in range(len(v))], index=s.index)

    blk["l_blk_vs_sisters"] = np.log(blk.by / blk.groupby("cycle_id").by.transform(loo_median))
    df = df.merge(blk[["cycle_id", "block_id", "l_blk_vs_sisters"]], on=["cycle_id", "block_id"], how="left")
    df["l_blk_vs_sisters"] = df.l_blk_vs_sisters.fillna(0)
    return df


def main():
    setup_style()
    truth = json.load(open(ROOT / "01_data/raw/generator_manifest.json"))["truth"]["harvest_injected_rows"]
    errors = set(truth.get("x10", [])) | set(truth.get("x1000", []))
    df = features(load())
    df["is_error"] = df.key.isin(errors)
    cols = ["lk", "lk_per_ha", "l_vs_neigh", "l_vs_cycle", "l_blk_vs_sisters"]
    X = df[cols].to_numpy()
    iso = IsolationForest(n_estimators=500, contamination=0.0015, random_state=42).fit(X)
    df["score"] = -iso.score_samples(X)          # higher = more anomalous
    df["iso_flag"] = iso.predict(X) == -1
    # one-sided view: keying errors inflate values, so only positive deviations count as candidate errors
    df["iso_flag_up"] = df.iso_flag & (df.l_vs_neigh.clip(lower=0) + df.l_blk_vs_sisters.clip(lower=0) > np.log(3))

    y = df.is_error.to_numpy()
    rows = []
    for name, pred in (("SQL rule HV06 (corrected)", df.hv06_corrected), ("Isolation Forest (all flags)", df.iso_flag),
                       ("Isolation Forest + upward-deviation filter", df.iso_flag_up)):
        rows.append(dict(detector=name, flagged=int(pred.sum()), true_pos=int((pred & y).sum()),
                         precision=precision_score(y, pred, zero_division=0), recall=recall_score(y, pred, zero_division=0),
                         f1=f1_score(y, pred, zero_division=0)))
    res = pd.DataFrame(rows)
    pr_auc = average_precision_score(y, df.score)
    top = df.sort_values("score", ascending=False).head(25)
    (EVIDENCE / "anomaly_eval.md").write_text(
        f"Ground truth: {int(y.sum())} injected x10/x1000 keying errors among {len(df):,} accepted harvest records "
        f"(base rate {100 * y.mean():.3f} %). Isolation Forest PR-AUC (average precision) = {pr_auc:.3f}; "
        f"{int(top.is_error.sum())} of the 8 errors are in the 25 highest-scored records.\n\n" + md_table(res.round(3), floatfmt="{:,.3f}"))

    execute("DELETE FROM dw.harvest_anomaly")
    execute("""INSERT INTO dw.harvest_anomaly (source_file, source_row_num, farm_code, crop_code, harvest_date, harvested_kg,
               anomaly_score, method) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)""",
            [(r.source_file, int(r.row_num), r.farm_code, r.crop_code, r.harvest_date, round(r.kg_keyed, 1), round(float(r.score), 4),
              "Isolation Forest") for r in top.itertuples()])

    import matplotlib.pyplot as plt
    fig, ax = plt.subplots(figsize=(7.2, 3.8))
    normal = df[~df.is_error]
    ax.scatter(normal.l_vs_neigh, normal.score, s=8, color=GRAY, alpha=0.6, linewidth=0, label="Accepted record")
    flagged = df[df.iso_flag & ~df.is_error]
    ax.scatter(flagged.l_vs_neigh, flagged.score, s=26, color=SERIES[0], edgecolor="#fcfcfb", linewidth=1, label="Flagged, not an injected error")
    err = df[df.is_error]
    ax.scatter(err.l_vs_neigh, err.score, s=60, color=SERIES[1], edgecolor="#fcfcfb", linewidth=1.5, label="Injected keying error (ground truth)")
    ax.set_xlabel("ln(record / median of neighbouring records in the same block)")
    ax.set_ylabel("Isolation Forest anomaly score")
    ax.set_title("Harvest-log anomaly scores")
    subtitle(ax, f"{len(df):,} records; PR-AUC {pr_auc:.2f}")
    ax.legend(loc="upper left", bbox_to_anchor=(0, -0.16), ncol=3)
    ax.grid(True, axis="both")
    save(fig, "fig_anomaly_scores.png")
    print(res.round(3).to_string(index=False))
    print("PR-AUC", round(pr_auc, 3), "errors in top 25:", int(top.is_error.sum()))


if __name__ == "__main__":
    main()
