# Custom Market Data Sources Design

## Summary

Allow users to select which stock/ETF pair serves as the 1x (index) and 2x (leveraged) asset in the backtesting tool, replacing the hardcoded QQQ/QLD pair. Users can use built-in presets or upload custom daily-price txt files.

## Motivation

The tool currently hardcodes QQQ (1x Nasdaq) and QLD (2x Nasdaq) as the only investable assets. Users want to backtest with other pairs (e.g. SPY/SSO) or custom data.

## Architecture

### Type Changes (`types.ts`)

Rename all QQQ/QLD field references to generic index/leveraged names:

```
MarketDataRow:
  qqqClose    → indexClose
  qqqLow      → indexLow
  qldClose    → leveragedClose
  qldLow      → leveragedLow

PortfolioState.shares:
  QQQ  → INDEX
  QLD  → LEVERAGED

AssetConfig (new fields):
  indexName: string      // display name for 1x asset (default "QQQ")
  leveragedName: string  // display name for 2x asset (default "QLD")
```

### Data Loading (`services/dataLoader.ts` — new file)

Parses the daily txt format (first line: comma-separated YYYYMMDD dates, second line: comma-separated prices):

1. `parseTxtFile(content: string): DailyPoint[]` — parses raw text into structured data
2. `aggregateToMonthly(daily: DailyPoint[]): MonthlyPoint[]` — groups by YYYY-MM, takes last close as close, min close as low
3. `buildMarketData(asset1: MonthlyPoint[], asset2: MonthlyPoint[]): MarketDataRow[]` — joins two asset series into unified monthly rows

### Constants / App State

`MARKET_DATA` is computed at the App level. `App.tsx` holds `dataSource` state (preset or custom). When it changes, `buildMarketData()` is called to produce a fresh `MarketDataRow[]`, which is passed to `runBacktest()`. Built-in QQQ/QLD JSON data is loaded as-is; custom data goes through txt parsing + monthly aggregation.

### Simulation Engine (`simulationEngine.ts`)

Pure rename: every `dataRow.qqqClose` → `dataRow.indexClose`, `shares.QQQ` → `shares.INDEX`, etc. Logic unchanged.

### Strategies (`strategies.ts`)

Pure rename: all QQQ/QLD references → INDEX/LEVERAGED. Alpha/beta calculations (QLD=2x beta) still use the leveraged multiplier concept.

### App State

```typescript
interface DataSourceState {
  type:
    | 'builtin' // Use built-in QQQ/QLD
    | { type: 'custom'; name: string; asset1Raw: string; asset2Raw: string }
  // name = user-given label, asset1Raw/asset2Raw = original txt content for localStorage
}
```

On mount: if `localStorage` has saved custom data, restore it. If not, default to built-in.

### UI (`ConfigPanel.tsx`)

Add a **Data Source** section at the top of the sidebar:

- Radio/preset buttons for "QQQ / QLD (Built-in)" as default
- File upload buttons for custom 1x and 2x txt files
- Dynamic labels: all "QQQ"/"QLD" text in sliders, allocation displays, profiles, and charts read from `config.indexName` / `config.leveragedName`

### Benchmarks (`App.tsx`)

Benchmark creation uses the current source's names and data instead of hardcoded QQQ/QLD.

## Data Flow

```
User selects preset OR uploads txt files
        ↓
App state: { dataSource: 'preset' | 'custom', asset1Data: ..., asset2Data: ... }
        ↓
buildMarketData() produces MarketDataRow[]
        ↓
runBacktest() uses MarketDataRow[] as before (fields renamed)
        ↓
UI labels read from config.indexName / config.leveragedName
```

## Edge Cases

- **Mismatched date ranges**: Only months present in BOTH assets are included; gap months at start/end are excluded
- **File format errors**: Show user-friendly error message, fall back to built-in data
- **No low price data**: Use minimum close within each month as low (conservative)
- **Single-month files**: Work fine, just 1 row of market data
- **Data persistence**: Uploaded txt file contents + user-given name saved to `localStorage`; survives page refresh
- **Custom naming**: Upload dialog includes a text field for the user to name their data pair (e.g., "SPY/SSO Experimental")

## Files Changed

| File                           | Change Type                              |
| ------------------------------ | ---------------------------------------- |
| `types.ts`                     | Rename fields + add name fields          |
| `services/dataLoader.ts`       | New file                                 |
| `constants.ts`                 | Dynamic MARKET_DATA                      |
| `services/simulationEngine.ts` | Rename fields                            |
| `services/strategies.ts`       | Rename fields                            |
| `components/ConfigPanel.tsx`   | Add data source selector, dynamic labels |
| `App.tsx`                      | Dynamic benchmarks, data source state    |
