#!/usr/bin/env python3
"""
clustering.py - customer segmentation with K-means (ABI820S 3.5, technique 2).

Features per durable customer code (cut-off 30 Sep 2026):
  recency_days       days since the last invoice
  frequency          distinct invoices in the trailing 12 months
  monetary           net revenue in the trailing 12 months (N$)
  avg_line_kg        average kg per invoice line (basket size)
  product_breadth    distinct products bought (lifetime)
Skewed features are log1p-transformed, all are standardised (z-scores). k = 2..8 is evaluated with
the silhouette coefficient (Rousseeuw 1987), Davies-Bouldin and Calinski-Harabasz indices and the
elbow of within-cluster SSE. Stability is checked with the adjusted Rand index over 20 re-seeded runs.
Selection rule: the k with the highest Calinski-Harabasz index among stable solutions (ARI >= 0.95) with k >= 3.
(The silhouette alone prefers k = 3, which merges 84 % of customers into one segment - not actionable.)
Segments are written to dw.customer_segment (surfaced in mart.dim_customer.customer_segment).
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import (adjusted_rand_score, calinski_harabasz_score, davies_bouldin_score,
                             silhouette_samples, silhouette_score)
from sklearn.preprocessing import StandardScaler

from common import EVIDENCE, GRAY, INK2, SERIES, execute, md_table, query, save, setup_style, subtitle

FEATURES = ["recency_days", "frequency", "monetary", "avg_line_kg", "product_breadth"]
LOGS = ["frequency", "monetary", "avg_line_kg", "product_breadth"]


def load() -> pd.DataFrame:
    return query("""
        WITH s AS (
            SELECT c.customer_code, d.full_date, f.invoice_date_key, f.invoice_no, f.net_revenue_nad, f.quantity_kg,
                   f.product_key, f.doc_type
            FROM dw.fact_sales f
            JOIN dw.dim_customer c ON c.customer_key = f.customer_key
            JOIN dw.dim_date d ON d.date_key = f.invoice_date_key
            WHERE c.customer_key > 0
        )
        SELECT customer_code,
               (DATE '2026-09-30' - max(full_date) FILTER (WHERE doc_type = 'INV'))::int AS recency_days,
               count(DISTINCT invoice_no) FILTER (WHERE full_date > DATE '2025-09-30' AND doc_type = 'INV') AS frequency,
               coalesce(sum(net_revenue_nad) FILTER (WHERE full_date > DATE '2025-09-30'), 0)::float8 AS monetary,
               (sum(quantity_kg) FILTER (WHERE doc_type = 'INV') / count(*) FILTER (WHERE doc_type = 'INV'))::float8 AS avg_line_kg,
               count(DISTINCT product_key) AS product_breadth,
               sum(net_revenue_nad)::float8 AS lifetime_revenue
        FROM s GROUP BY customer_code""")


def name_segments(prof: pd.DataFrame) -> dict:
    """Business labels from the cluster centroids (rules read the profile, not the cluster number)."""
    names = {}
    for cid, r in prof.iterrows():
        if r.recency_days > 180:
            names[cid] = "Lapsed / at-risk accounts"
        elif r.avg_line_kg >= 8000:
            names[cid] = "Bulk & export key accounts"
        elif r.avg_line_kg >= 900:
            names[cid] = "Wholesale regulars"
        elif r.frequency >= 120:
            names[cid] = "High-frequency small-basket buyers"
        else:
            names[cid] = "Regular small-basket buyers"
    seen = {}
    for cid in names:  # make duplicates unique
        n = names[cid]
        seen[n] = seen.get(n, 0) + 1
        if seen[n] > 1:
            names[cid] = f"{n} ({seen[n]})"
    return names


def main():
    setup_style()
    df = load()
    X = df[FEATURES].copy()
    for c in LOGS:
        X[c] = np.log1p(X[c])
    X["recency_days"] = np.log1p(X["recency_days"])
    Z = StandardScaler().fit_transform(X)

    evals = []
    for k in range(2, 9):
        km = KMeans(n_clusters=k, n_init=25, random_state=42).fit(Z)
        evals.append(dict(k=k, sse=km.inertia_, silhouette=silhouette_score(Z, km.labels_),
                          davies_bouldin=davies_bouldin_score(Z, km.labels_),
                          calinski_harabasz=calinski_harabasz_score(Z, km.labels_)))
    ev = pd.DataFrame(evals)
    stab = {}
    for k in ev.k:
        ref = KMeans(n_clusters=k, n_init=50, random_state=42).fit(Z).labels_
        stab[k] = np.mean([adjusted_rand_score(ref, KMeans(n_clusters=k, n_init=10, random_state=s).fit(Z).labels_)
                           for s in range(20)])
    ev["stability_ari"] = ev.k.map(stab)
    cand = ev[(ev.k >= 3) & (ev.stability_ari >= 0.95)]
    k_best = int(cand.sort_values("calinski_harabasz", ascending=False).iloc[0].k)
    km = KMeans(n_clusters=k_best, n_init=50, random_state=42).fit(Z)
    labels = km.labels_
    aris = [adjusted_rand_score(labels, KMeans(n_clusters=k_best, n_init=10, random_state=s).fit(Z).labels_) for s in range(20)]
    sil = silhouette_samples(Z, labels)
    df["cluster"] = labels
    df["silhouette"] = sil
    prof = df.groupby("cluster").agg(customers=("customer_code", "size"), recency_days=("recency_days", "median"),
                                     frequency=("frequency", "median"), monetary=("monetary", "median"),
                                     avg_line_kg=("avg_line_kg", "median"), product_breadth=("product_breadth", "median"),
                                     revenue_12m_total=("monetary", "sum"), silhouette=("silhouette", "mean"))
    names = name_segments(prof)
    prof["segment"] = prof.index.map(names)
    df["segment"] = df.cluster.map(names)
    # channel mix per segment (current version of each customer) for interpretation
    ch = query("SELECT customer_code, channel FROM dw.dim_customer WHERE scd_is_current AND customer_key > 0")
    mix = df.merge(ch, on="customer_code").groupby(["segment", "channel"]).size().unstack(fill_value=0)

    execute("DELETE FROM dw.customer_segment")
    execute("""INSERT INTO dw.customer_segment (customer_code, segment_id, segment_name, recency_days, frequency_invoices,
               monetary_nad, avg_order_kg, product_breadth, silhouette_sample) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
            [(r.customer_code, int(r.cluster), r.segment, int(r.recency_days), int(r.frequency), round(float(r.monetary), 2),
              round(float(r.avg_line_kg), 1), int(r.product_breadth), round(float(r.silhouette), 4)) for r in df.itertuples()])

    # ---------------- evidence
    (EVIDENCE / "cluster_k_selection.md").write_text(md_table(ev.round(3)) +
        f"\nChosen k = {k_best}; mean silhouette = {silhouette_score(Z, labels):.3f}; "
        f"stability (adjusted Rand index vs 20 re-seeded runs): mean {np.mean(aris):.3f}, min {np.min(aris):.3f}\n")
    p = prof.reset_index()[["segment", "customers", "recency_days", "frequency", "monetary", "avg_line_kg", "product_breadth",
                            "revenue_12m_total", "silhouette"]].sort_values("revenue_12m_total", ascending=False)
    p["monetary"] = (p.monetary / 1e3).round(0)
    p["revenue_12m_total"] = (p.revenue_12m_total / 1e6).round(1)
    p = p.rename(columns={"monetary": "median_rev_12m_N$k", "revenue_12m_total": "segment_rev_12m_N$m"})
    share = p["segment_rev_12m_N$m"] / p["segment_rev_12m_N$m"].sum() * 100
    p["rev_share_pct"] = share.round(1)
    (EVIDENCE / "cluster_profiles.md").write_text(md_table(p.round(2)) + "\nChannel mix (customers, current channel):\n\n" +
                                                  md_table(mix.reset_index()))

    # ---------------- figures
    import matplotlib.pyplot as plt
    fig, axes = plt.subplots(1, 2, figsize=(10, 3.4))
    axes[0].plot(ev.k, ev.silhouette, color=SERIES[0], marker="o", markersize=6, markeredgecolor="#fcfcfb", markeredgewidth=2)
    axes[0].scatter([k_best], ev.loc[ev.k == k_best, "silhouette"], s=120, facecolor="none", edgecolor=SERIES[1], linewidth=2, zorder=5)
    axes[0].set_title("Silhouette coefficient by k")
    subtitle(axes[0], f"higher is better; chosen k = {k_best} (circled) on Calinski-Harabasz + stability")
    axes[0].set_xlabel("number of clusters k")
    axes[1].plot(ev.k, ev.sse, color=SERIES[0], marker="o", markersize=6, markeredgecolor="#fcfcfb", markeredgewidth=2)
    axes[1].set_title("Within-cluster SSE (elbow)")
    subtitle(axes[1], "standardised feature space")
    axes[1].set_xlabel("number of clusters k")
    fig.tight_layout()
    save(fig, "fig_cluster_k.png")

    # small multiples: recency vs 12-month revenue, one panel per segment, others in grey for context
    segs = p.segment.tolist()
    n = len(segs)
    fig, axes = plt.subplots(1, n, figsize=(3.0 * n, 3.2), sharex=True, sharey=True)
    for ax, seg in zip(np.atleast_1d(axes), segs):
        other = df[df.segment != seg]
        mine = df[df.segment == seg]
        ax.scatter(other.recency_days + 1, other.monetary / 1e6 + 0.001, s=10, color=GRAY, alpha=0.5, linewidth=0)
        ax.scatter(mine.recency_days + 1, mine.monetary / 1e6 + 0.001, s=22, color=SERIES[0], edgecolor="#fcfcfb", linewidth=0.8)
        ax.set_xscale("log")
        ax.set_yscale("log")
        ax.set_title(f"{seg}\n{len(mine)} customers", fontsize=9)
        ax.set_xlabel("days since last invoice")
        ax.grid(True, axis="both")
    np.atleast_1d(axes)[0].set_ylabel("net revenue, last 12 months (N$ m)")
    fig.tight_layout()
    save(fig, "fig_cluster_segments.png")
    print(ev.round(3).to_string(index=False))
    print("k =", k_best, "ARI mean", np.mean(aris))
    print(p.to_string(index=False))
    print(mix)


if __name__ == "__main__":
    main()
