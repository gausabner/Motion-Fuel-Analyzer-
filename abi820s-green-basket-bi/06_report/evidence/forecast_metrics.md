| category | model | scale | MAE_Nm | RMSE_Nm | MAPE_pct | WAPE_pct | MASE | cov80_pct | cov95_pct | mape_months | best |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Cereals & grains | Seasonal naive | raw | 1.04 | 1.21 | 15.57 | 15.32 | 0.89 | 83.33 | 100.00 | 12 |  |
| Cereals & grains | ETS(A,Ad,A) | log1p | 1.12 | 1.37 | 16.93 | 16.55 | 0.96 | 91.67 | 100.00 | 12 |  |
| Cereals & grains | SARIMA(1,0,0)(0,1,1)12 | log1p | 0.62 | 0.81 | 8.95 | 9.20 | 0.53 | 100.00 | 100.00 | 12 | **best** |
| Vegetables | Seasonal naive | raw | 2.96 | 4.85 | 23.20 | 24.61 | 1.44 | 75.00 | 83.33 | 11 |  |
| Vegetables | ETS(A,Ad,A) | raw | 3.39 | 4.74 | 32.38 | 28.24 | 1.65 | 91.67 | 100.00 | 11 |  |
| Vegetables | SARIMA(1,0,0)(0,1,1)12 | raw | 2.89 | 4.70 | 22.95 | 24.07 | 1.41 | 75.00 | 83.33 | 11 | **best** |
| Fruit | Seasonal naive | raw | 2.31 | 4.49 | 24.51 | 11.54 | 0.79 | 91.67 | 100.00 | 4 | **best** |
| Fruit | ETS(A,Ad,A) | raw | 2.32 | 4.53 | 24.50 | 11.62 | 0.79 | 100.00 | 100.00 | 4 |  |
| Fruit | SARIMA(1,0,0)(0,1,1)12 | raw | 2.76 | 4.04 | 17.00 | 13.78 | 0.94 | 91.67 | 100.00 | 4 |  |
| Division total | Seasonal naive | raw | 4.93 | 6.67 | 16.43 | 12.71 | 1.07 | 83.33 | 100.00 | 12 | **best** |
| Division total | ETS(A,Ad,A) | log1p | 6.00 | 9.72 | 13.81 | 15.45 | 1.30 | 66.67 | 83.33 | 12 |  |
| Division total | SARIMA(1,0,0)(0,1,1)12 | log1p | 5.51 | 8.76 | 13.45 | 14.20 | 1.19 | 75.00 | 100.00 | 12 |  |
