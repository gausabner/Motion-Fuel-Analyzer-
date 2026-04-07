# Data Model & Schema Mapping

## Entities

### 1. `FuelTransaction` (The Source of Truth)
*   `transDate` -> **Date Axis**
*   `transAmt` -> **Spend** (Cost)
*   `transQty` -> **Volume** (Units)
*   `vehicleId` -> **Fleet Unit**
*   `transVoteNo` -> **Cost Centre**

## Aggregations

### Dashboard Overview
*   **Total Spend:** Sum(`transAmt`)
*   **Total Volume:** Sum(`transQty`)
*   **Active Vehicles:** Count(Distinct `vehicleId`)
*   **Avg Price/L:** `Total Spend` / `Total Volume` (implied metric from screenshot "Ave Price per Sq Ft")

### Splits
*   **Fuel Type Split:**
    *   Petrol Volume vs Diesel Volume.
*   **Budget Split:**
    *   Total Spend vs Allocated Budget (Mocked Budget or System Setting).

## Fleet
*   **Consumption:** `transQty` per `vehicleId`.
*   **Frequency:** Count(`id`) per `vehicleId`.
