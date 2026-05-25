# Single Asset Data Sources Design

## Summary

Replace the hardcoded 1x/2x asset pair model with a flexible system where users maintain a library of individual data sources and profiles reference any number of them. Each asset is independent with its own price history, multiplier, and per-asset configuration.

## Section 1: Core Type System

### Data Source (Library)

Each data source represents one individual asset with its own monthly price history:

```typescript
interface DataSource {
  id: string
  name: string          // e.g. "SPY", "TLT", "SSO"
  multiplier: number    // 1x, 2x, 3x (for beta calculation)
  data: AssetDataRow[]  // monthly price data
}

interface AssetDataRow {
  date: string   // YYYY-MM-DD
  close: number
  low: number
}
```

### Asset Entry (Within a Profile)

Profiles reference data sources through a flexible list:

```typescript
interface AssetEntry {
  dataSourceId: string
  targetWeight: number   // target allocation % (0-100, cash = remainder)
  contributionWeight: number  // % of new contributions to this asset
  pledgeRatio: number    // collateral value % for leverage
}
```

### Profile Config

Removed: `indexName`, `leveragedName`, `indexWeight`, `leveragedWeight`, `contributionIndexWeight`, `contributionLeveragedWeight`.

Kept at profile level (global settings):

```typescript
interface ProfileConfig {
  initialCapital: number
  contributionAmount: number
  contributionIntervalMonths: number
  yearlyContributionMonth: number
  cashYieldAnnual: number
  annualExpenseAmount?: number
  cashCoverageYears?: number
  leverage: LeverageConfig
}
```

### Simplified Leverage Config

`indexPledgeRatio` and `leveragedPledgeRatio` removed — per-asset pledge ratios live in `AssetEntry.pledgeRatio`:

```typescript
interface LeverageConfig {
  enabled: boolean
  interestRate: number
  cashPledgeRatio: number
  maxLtv: number
  withdrawType: 'PERCENT' | 'FIXED'
  withdrawValue: number
  inflationRate: number
  interestType: 'MONTHLY' | 'MATURITY' | 'CAPITALIZED'
  ltvBasis: 'TOTAL_ASSETS' | 'COLLATERAL'
}
```

### Portfolio State

Shares become a dynamic map instead of fixed slots:

```typescript
interface PortfolioState {
  date: string
  shares: Record<string, number>  // dataSourceId -> shares held
  cashBalance: number
  debtBalance: number
  accruedInterest: number
  totalValue: number
  strategyMemory: Record<string, unknown>
  ltv: number
  beta: number
  events: FinancialEvent[]
}
```

### SimulationResult

Replaces `indexName`/`leveragedName` with an array:

```typescript
interface SimulationResult {
  strategyName: string
  color: string
  isLeveraged: boolean
  assetNames: string[]  // was indexName + leveragedName
  history: PortfolioState[]
  isBankrupt: boolean
  bankruptcyDate: string | null
  metrics: { ... }  // unchanged
}
```

### Strategy Function

```typescript
interface MonthlyContext {
  date: string
  prices: Record<string, number>   // sourceId -> close price
  lows: Record<string, number>     // sourceId -> low price
  monthIndex: number
}

type StrategyFunction = (
  currentState: PortfolioState,
  context: MonthlyContext,
  assets: AssetEntry[],
  config: ProfileConfig,
) => PortfolioState
```

## Section 2: Data Flow & Simulation Engine

### Library → Profile → Simulation

1. **Data Source Library** stored in App state (`DataSource[]`), saved to localStorage
2. Each **Profile** holds a list of `AssetEntry[]`, each referencing a `dataSourceId`
3. **Simulation** for each profile:
   - Collect months that are common across all profile's selected data sources (inner join)
   - For each month, build `MonthlyContext` with price maps
   - Pass to engine + strategy
4. **No global `MARKET_DATA` constant** — replaced by per-source data loaded from library

### Engine Valuation (Dynamic)

```
totalValue = sum(shares[srcId] * closePrice for each asset)
           + cashBalance - debtBalance - accruedInterest

effectiveCollateral = sum(shares[srcId] * lowPrice * asset.pledgeRatio for each asset)
                    + cashBalance * cashPledgeRatio

beta = sum(shares[srcId] * closePrice * dataSource.multiplier for each asset)
     / totalValue
```

Trade detection: compare shares before/after strategy for each sourceId, log trades with source name.

### Date Handling

- Inner join on months across all selected data sources
- Avoid simulating months where any selected asset lacks data
- Same principle as current `buildMarketData()` but generalized to N sources

## Section 3: Leverage & Pledge Ratios

Each asset carries its own `pledgeRatio`. The engine computes:

- **Collateral**: sum of `shares * lowPrice * pledgeRatio` across all assets, plus cash
- **LTV**: liability / collateral (or total assets, based on `ltvBasis`)
- **Bankruptcy**: triggered when LTV exceeds `maxLtv` (same as today)
- **Withdrawal**: same PERCENT/FIXED logic, borrowed amount added to debt

## Section 4: Strategy Adaptations

| Strategy | N-asset behavior |
|---|---|
| **No Rebalance** | Buy all assets by `contributionWeight`. No annual rebalance. |
| **Rebalance** | Same as NoRebalance + annually reset all assets to `targetWeight`. |
| **Smart** | Track each asset's trailing 12-month return. Tilt weights toward better performers, away from laggards. |
| **Flexible 1/2** | Maintain cash buffer (target years of expenses). Excess cash → distribute by `targetWeight`. Deficit → sell proportionally across all assets. |

All strategies iterate over the asset list dynamically instead of hardcoded INDEX/LEVERAGED.

## Section 5: UI Changes

### Data Source Library Management (New Section in Config Panel)

- List of saved sources showing name, multiplier, date range, month count
- Add source: upload one `.txt` file, enter name, set multiplier
- Delete source with confirmation
- Source name extracted from user input (not parsed from filename)

### Profile Asset Selection (Replaces Current Data Source UI)

Instead of radio buttons for data source + fixed weights:
- List of selected assets, each row showing: name, multiplier, target weight slider, contribution weight slider, pledge ratio slider
- "Add Asset" button → dropdown/browser of available data sources
- Remove asset button per entry
- Total target weight must sum to ≤ 100% (remainder = cash)
- Total contribution weight must sum to 100%

### Profile List View

- Shows asset names and counts instead of "INDEX/LEVERAGED"

### Charts & Reports

- Labels read from `DataSource.name` instead of `config.indexName`/`config.leveragedName`
- Line series generated per asset

## Section 6: Persistence & Migration

### Storage

```typescript
localStorage key: 'app_data_sources'  // DataSource[] (replaces old 'app_saved_sources')
localStorage key: 'app_profiles'      // Profile[] (new format)
```

### Migration from Old Format

On app load, check for legacy `app_saved_sources` format (which stored `{ id, name, marketData: MarketDataRow[] }`). Convert each to two `DataSource` entries:
- Parse the name (e.g., "SPY/SSO") into two assets
- Split `marketData` rows back into per-asset data

Legacy profiles referencing old sources: migrate their `dataSourceId` to the new format.

If no legacy data exists, a single built-in data source is auto-created from the existing `qqq-history.json` and `qld-history.json` files: two `DataSource` entries for QQQ and QLD.

## Section 7: Import / Export

### Export Format

```typescript
interface ExportData {
  profiles: Profile[]
  dataSources: DataSource[]  // always includes all referenced data sources
}
```

### Import Behavior

- Data sources are merged into the local library (new IDs added, existing IDs overwritten)
- Profiles are appended (or replaced if same profile ID exists)
- After import, all profile asset entries should resolve to existing data sources
- No manual resolution needed — the export always bundles everything required

## Section 8: Files Changed

| File | Change Type |
|---|---|
| `types.ts` | Rework types — remove `MarketDataRow`, `AssetConfig`; add `DataSource`, `AssetDataRow`, `AssetEntry`, `ProfileConfig`, `MonthlyContext`, update `Profile`, `PortfolioState`, `SimulationResult`, `StrategyFunction`, `LeverageConfig` |
| `constants.ts` | Remove `MARKET_DATA` — built-in data moved to App state |
| `services/dataLoader.ts` | Update `buildMarketData` → `buildAssetData` (single series); keep `parseTxtFile`, `aggregateToMonthly` |
| `services/simulationEngine.ts` | Rewrite loop — dynamic asset iteration, `MonthlyContext`, per-asset valuation |
| `services/strategies.ts` | Rewrite all 5 strategies — iterate `AssetEntry[]`, use price maps |
| `components/ConfigPanel.tsx` | New data source library UI; new asset selection in profile edit |
| `App.tsx` | Remove `SavedSource` type, use `DataSource`; update state management; update `handleRunSimulation` |
| `services/__tests__/dataLoader.test.ts` | Update tests for single-series loading |
| `services/__tests__/simulationEngine.test.ts` | Rewrite tests for dynamic assets |
| `services/__tests__/strategies.test.ts` | Rewrite tests for new strategy signatures |
| `README.md` | Update docs to reflect new data model |

## Section 9: Testing

- Unit tests for new types (data source creation, profile with multiple assets)
- Data loader: single-asset file parsing and monthly aggregation
- Simulation engine: N-asset backtest with known fixture data, verify valuation math
- Each strategy tested with 2+ assets for correct weight distribution
- Migration: test loading legacy `app_saved_sources` format and converting
- E2E: full flow — upload SPY data, create profile with SPY, run backtest, verify chart labels
