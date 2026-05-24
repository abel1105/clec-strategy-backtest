# Custom Market Data Sources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to select custom stock/ETF pairs (1x and 2x) via preset or txt file upload, replacing hardcoded QQQ/QLD.

**Architecture:** Rename all QQQ/QLD fields in types and code to generic INDEX/LEVERAGED. Add file upload + monthly aggregation in a new data loader service. Drive data source selection from App state, passed down to ConfigPanel UI and simulation engine.

**Tech Stack:** TypeScript, React, Vitest, localStorage for persistence

---

### Task 1: Update types.ts — rename fields + add name fields

**Files:**

- Modify: `types.ts`
- Test: `services/__tests__/strategies.test.ts` (implicit — cleanup in Task 6)

- [ ] **Step 1: Rename MarketDataRow fields**

```typescript
export interface MarketDataRow {
  date: string
  indexClose: number // was qqqClose
  indexLow: number // was qqqLow
  leveragedClose: number // was qldClose
  leveragedLow: number // was qldLow
}
```

- [ ] **Step 2: Rename PortfolioState shares keys**

```typescript
export interface PortfolioState {
  date: string
  shares: {
    INDEX: number // was QQQ
    LEVERAGED: number // was QLD
  }
  // ... rest unchanged
}
```

- [ ] **Step 3: Rename AssetConfig weight fields + add name fields**

```typescript
export interface AssetConfig {
  initialCapital: number
  contributionAmount: number
  contributionIntervalMonths: number
  yearlyContributionMonth: number

  // Asset Names (for display)
  indexName: string // default "QQQ"
  leveragedName: string // default "QLD"

  // Initial / Target Portfolio Allocation
  indexWeight: number // was qqqWeight
  leveragedWeight: number // was qldWeight

  // Recurring Contribution Allocation
  contributionIndexWeight: number // was contributionQqqWeight
  contributionLeveragedWeight: number // was contributionQldWeight

  cashYieldAnnual: number
  annualExpenseAmount?: number
  cashCoverageYears?: number

  leverage: LeverageConfig
}
```

- [ ] **Step 4: Rename LeverageConfig pledge ratio fields**

```typescript
export interface LeverageConfig {
  enabled: boolean
  interestRate: number
  indexPledgeRatio: number // was qqqPledgeRatio
  leveragedPledgeRatio: number // was qldPledgeRatio
  cashPledgeRatio: number
  maxLtv: number
  withdrawType: 'PERCENT' | 'FIXED'
  withdrawValue: number
  inflationRate: number
  interestType: 'MONTHLY' | 'MATURITY' | 'CAPITALIZED'
  ltvBasis: 'TOTAL_ASSETS' | 'COLLATERAL'
}
```

- [ ] **Step 5: Commit**

```bash
git add types.ts
git commit -m "refactor(types): rename QQQ/QLD fields to INDEX/LEVERAGED, add name fields"
```

---

### Task 2: Create services/dataLoader.ts + tests

**Files:**

- Create: `services/dataLoader.ts`
- Create: `services/__tests__/dataLoader.test.ts`

- [ ] **Step 1: Write failing test for parseTxtFile**

```typescript
import { describe, it, expect } from 'vitest'
import { parseTxtFile, aggregateToMonthly, buildMarketData, MonthlyPoint } from '../dataLoader'

describe('parseTxtFile', () => {
  it('should parse dates and prices from txt content', () => {
    const content = '20200103,20200106,20200203\n100.0,102.5,98.0'
    const result = parseTxtFile(content)
    expect(result).toHaveLength(3)
    expect(result[0].date).toBe('20200103')
    expect(result[0].price).toBe(100.0)
    expect(result[2].price).toBe(98.0)
  })

  it('should throw on malformed input', () => {
    expect(() => parseTxtFile('')).toThrow()
    expect(() => parseTxtFile('abc\ndef')).toThrow()
  })
})

describe('aggregateToMonthly', () => {
  it('should group by month, take last close as close and min as low', () => {
    const input = [
      { date: '20200103', price: 100 },
      { date: '20200106', price: 102 },
      { date: '20200203', price: 98 },
      { date: '20200205', price: 105 },
    ]
    const result = aggregateToMonthly(input)
    expect(result).toHaveLength(2)
    expect(result[0].month).toBe('2020-01')
    expect(result[0].close).toBe(102)
    expect(result[0].low).toBe(100)
    expect(result[1].month).toBe('2020-02')
    expect(result[1].close).toBe(105)
    expect(result[1].low).toBe(98)
  })
})

describe('buildMarketData', () => {
  it('should join two asset series into MarketDataRow[]', () => {
    const asset1: MonthlyPoint[] = [
      { month: '2020-01', close: 100, low: 99 },
      { month: '2020-02', close: 110, low: 108 },
    ]
    const asset2: MonthlyPoint[] = [
      { month: '2020-01', close: 200, low: 198 },
      { month: '2020-02', close: 220, low: 215 },
    ]
    const result = buildMarketData(asset1, asset2)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({
      date: '2020-01-01',
      indexClose: 100,
      indexLow: 99,
      leveragedClose: 200,
      leveragedLow: 198,
    })
  })

  it('should only include months present in BOTH series', () => {
    const asset1: MonthlyPoint[] = [
      { month: '2020-01', close: 100, low: 99 },
      { month: '2020-02', close: 110, low: 108 },
    ]
    const asset2: MonthlyPoint[] = [
      { month: '2020-01', close: 200, low: 198 },
      { month: '2020-03', close: 230, low: 225 },
    ]
    const result = buildMarketData(asset1, asset2)
    expect(result).toHaveLength(1)
    expect(result[0].date).toBe('2020-01-01')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run services/__tests__/dataLoader.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write dataLoader.ts implementation**

```typescript
export interface DailyPoint {
  date: string // YYYYMMDD
  price: number
}

export interface MonthlyPoint {
  month: string // YYYY-MM
  close: number
  low: number
}

export function parseTxtFile(content: string): DailyPoint[] {
  const lines = content.trim().split('\n')
  if (lines.length < 2) {
    throw new Error('Invalid file format: need at least 2 lines (dates + prices)')
  }
  const dates = lines[0]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const prices = lines[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (dates.length !== prices.length) {
    throw new Error(`Mismatch: ${dates.length} dates but ${prices.length} prices`)
  }
  return dates.map((date, i) => ({
    date,
    price: parseFloat(prices[i]),
  }))
}

export function aggregateToMonthly(daily: DailyPoint[]): MonthlyPoint[] {
  const groups = new Map<string, number[]>()
  for (const { date, price } of daily) {
    const month = date.substring(0, 6) // YYYYMM
    const key = `${month.substring(0, 4)}-${month.substring(4, 6)}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(price)
  }
  const result: MonthlyPoint[] = []
  for (const [month, prices] of groups) {
    result.push({
      month,
      close: prices[prices.length - 1],
      low: Math.min(...prices),
    })
  }
  result.sort((a, b) => a.month.localeCompare(b.month))
  return result
}

export function buildMarketData(
  asset1: MonthlyPoint[],
  asset2: MonthlyPoint[],
): import('../types').MarketDataRow[] {
  const map1 = new Map(asset1.map((a) => [a.month, a]))
  const map2 = new Map(asset2.map((a) => [a.month, a]))
  const months = Array.from(new Set([...map1.keys(), ...map2.keys()])).sort()
  return months
    .filter((month) => map1.has(month) && map2.has(month))
    .map((month) => {
      const a1 = map1.get(month)!
      const a2 = map2.get(month)!
      return {
        date: `${month}-01`,
        indexClose: a1.close,
        indexLow: a1.low,
        leveragedClose: a2.close,
        leveragedLow: a2.low,
      }
    })
    .filter((row) => row.indexClose > 0 && row.leveragedClose > 0)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run services/__tests__/dataLoader.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add services/dataLoader.ts services/__tests__/dataLoader.test.ts
git commit -m "feat: add txt file parser and monthly aggregation service"
```

---

### Task 3: Rename fields in simulationEngine.ts

**Files:**

- Modify: `services/simulationEngine.ts`

- [ ] **Step 1: Replace all QQQ/QLD references**

Replace `shares.QQQ` → `shares.INDEX`, `shares.QLD` → `shares.LEVERAGED`
Replace `dataRow.qqqClose` → `dataRow.indexClose`, `dataRow.qldClose` → `dataRow.leveragedClose`
Replace `dataRow.qqqLow` → `dataRow.indexLow`, `dataRow.qldLow` → `dataRow.leveragedLow`
Replace `config.leverage.qqqPledgeRatio` → `config.leverage.indexPledgeRatio`
Replace `config.leverage.qldPledgeRatio` → `config.leverage.leveragedPledgeRatio`

Update calculation comments: `QQQ=1, QLD=2` → `INDEX=1, LEVERAGED=2`
Update event description strings: `'Buy'/'Sell' QQQ/QLD` → use `config.indexName/config.leveragedName` (passed via parameter or stored in config)

- [ ] **Step 2: Update runBacktest signature to accept config.name fields for display strings**

In the trade event descriptions, use config values:

```typescript
description: `${qqqDiff > 0 ? 'Buy' : 'Sell'} ${Math.abs(qqqDiff).toFixed(2)} ${config.indexName} @ ...`
description: `${qldDiff > 0 ? 'Buy' : 'Sell'} ${Math.abs(qldDiff).toFixed(2)} ${config.leveragedName} @ ...`
```

- [ ] **Step 3: Commit**

```bash
git add services/simulationEngine.ts
git commit -m "refactor(simulationEngine): rename QQQ/QLD to INDEX/LEVERAGED, use config names"
```

---

### Task 4: Rename fields in strategies.ts

**Files:**

- Modify: `services/strategies.ts`

- [ ] **Step 1: Rename all config field access**

Replace all:

- `config.qqqWeight` → `config.indexWeight`
- `config.qldWeight` → `config.leveragedWeight`
- `config.contributionQqqWeight` → `config.contributionIndexWeight`
- `config.contributionQldWeight` → `config.contributionLeveragedWeight`

Replace all share references:

- `newState.shares.QQQ` → `newState.shares.INDEX`
- `newState.shares.QLD` → `newState.shares.LEVERAGED`
- `marketData.qqqClose` → `marketData.indexClose`
- `marketData.qldClose` → `marketData.leveragedClose`

Update JS comments and string labels:

- `startQLDVal` → `startLeveragedVal` (in StrategyMemory interface)
- `QLD Profit` → `LEVERAGED Profit`
- `QQQ->QLD` → `INDEX->LEVERAGED`
- `Profit to QQQ` → `Profit to INDEX`

- [ ] **Step 2: Commit**

```bash
git add services/strategies.ts
git commit -m "refactor(strategies): rename QQQ/QLD to INDEX/LEVERAGED"
```

---

### Task 5: Rename fields in constants.ts

**Files:**

- Modify: `constants.ts`

- [ ] **Step 1: Update references to use renamed MarketDataRow fields**

Constants.ts creates MARKET_DATA array but doesn't reference QQQ/QLD by name — the fields are set via mapping. Verify the field names are updated after Task 1 types change.

- [ ] **Step 2: Commit**

```bash
git add constants.ts
git commit -m "refactor(constants): align with renamed MarketDataRow fields"
```

---

### Task 6: Update all test files

**Files:**

- Modify: `services/__tests__/strategies.test.ts`
- Modify: `services/__tests__/strategies_flexible.test.ts`
- Modify: `services/__tests__/simulationEngine.test.ts`
- Modify: `services/__tests__/solvency_scenarios.test.ts`
- Modify: `services/__tests__/cash_bankruptcy.test.ts`

- [ ] **Step 1: Rename all field references in test files**

Replace in mockConfig:

- `qqqWeight` → `indexWeight`
- `qldWeight` → `leveragedWeight`
- `contributionQqqWeight` → `contributionIndexWeight`
- `contributionQldWeight` → `contributionLeveragedWeight`
- `qqqPledgeRatio` → `indexPledgeRatio`
- `qldPledgeRatio` → `leveragedPledgeRatio`
- Add `indexName: 'QQQ'` and `leveragedName: 'QLD'` to all mockConfig fixtures

Replace in mockMarketData:

- `qqqClose` → `indexClose`
- `qqqLow` → `indexLow`
- `qldClose` → `leveragedClose`
- `qldLow` → `leveragedLow`

Replace in mockState/assertions:

- `shares: { QQQ: ..., QLD: ... }` → `shares: { INDEX: ..., LEVERAGED: ... }`
- `.shares.QQQ` → `.shares.INDEX`
- `.shares.QLD` → `.shares.LEVERAGED`

- [ ] **Step 2: Run all tests to verify**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add services/__tests__/
git commit -m "test: update tests to use renamed INDEX/LEVERAGED fields"
```

---

### Task 7: Update App.tsx — data source state, dynamic benchmarks

**Files:**

- Modify: `App.tsx`

- [ ] **Step 1: Add data source state**

```typescript
interface CustomDataSource {
  name: string
  asset1Txt: string // raw file content
  asset2Txt: string
}

type DataSource = { type: 'builtin' } | { type: 'custom'; data: CustomDataSource }

const [dataSource, setDataSource] = useState<DataSource>(() => {
  const saved = localStorage.getItem('app_data_source')
  if (saved) {
    try {
      return JSON.parse(saved)
    } catch {
      /* ignore */
    }
  }
  return { type: 'builtin' }
})
```

- [ ] **Step 2: Compute MARKET_DATA from data source**

```typescript
import { MARKET_DATA as BUILTIN_DATA } from './constants'
import { parseTxtFile, aggregateToMonthly, buildMarketData } from './services/dataLoader'

const marketData = useMemo(() => {
  if (dataSource.type === 'builtin') return BUILTIN_DATA
  const { asset1Txt, asset2Txt } = dataSource.data
  const a1 = aggregateToMonthly(parseTxtFile(asset1Txt))
  const a2 = aggregateToMonthly(parseTxtFile(asset2Txt))
  return buildMarketData(a1, a2)
}, [dataSource])
```

- [ ] **Step 3: Update benchmark creation to use config names**

```typescript
const indexConfig: AssetConfig = {
  ...baseConfig,
  indexName: baseConfig.indexName || 'QQQ',
  leveragedName: baseConfig.leveragedName || 'QLD',
  indexWeight: 100,
  leveragedWeight: 0,
  contributionIndexWeight: 100,
  contributionLeveragedWeight: 0,
  // ...
}
```

- [ ] **Step 4: Pass marketData and config names through to ConfigPanel**

Replace `MARKET_DATA` references in the component body with the computed `marketData`.

- [ ] **Step 5: Persist data source to localStorage on change**

```typescript
useEffect(() => {
  localStorage.setItem('app_data_source', JSON.stringify(dataSource))
}, [dataSource])
```

- [ ] **Step 6: Commit**

```bash
git add App.tsx
git commit -m "feat(App): add data source state with localStorage persistence"
```

---

### Task 8: Update ConfigPanel.tsx — data source selector UI + dynamic labels

**Files:**

- Modify: `components/ConfigPanel.tsx`

- [ ] **Step 1: Add data source selector section at top of list view**

Add a "Data Source" section before the profiles list:

```tsx
interface DataSourceSelectorProps {
  dataSource: DataSource
  onDataSourceChange: (ds: DataSource) => void
}
```

Include:

- Radio option: "QQQ / QLD (Built-in)"
- Upload area with two file inputs + name field:
  - "1x (Index) file" + text input for name
  - "2x (Leveraged) file" + text input for name
  - Uploaded file label display (e.g., "SPY.txt loaded")

- [ ] **Step 2: Update DEFAULT_ASSET_CONFIG to include name fields**

```typescript
const DEFAULT_ASSET_CONFIG: AssetConfig = {
  // ... existing
  indexName: 'QQQ',
  leveragedName: 'QLD',
  indexWeight: 50,
  leveragedWeight: 40,
  contributionIndexWeight: 100,
  contributionLeveragedWeight: 0,
  // ...
}
```

- [ ] **Step 3: Replace all hardcoded "QQQ"/"QLD" labels with dynamic names**

Replace:

- `'QQQ'` text → `profile.config.indexName`
- `'QLD (2x)'` text → `profile.config.leveragedName`
- `'DCA (QQQ)'` → `t('dcaPrefix') + ' ' + profile.config.indexName`
- `'DCA (QLD)'` → `t('dcaPrefix') + ' ' + profile.config.leveragedName`

Update auto-generate candidate labels to use config names.

- [ ] **Step 4: Update pledge ratio labels**

Replace:

- `pledgeRatioQQQ` i18n key → keep but use indexName
- `pledgeRatioQLD` i18n key → keep but use leveragedName

- [ ] **Step 5: Commit**

```bash
git add components/ConfigPanel.tsx
git commit -m "feat(ConfigPanel): add data source selector, dynamic asset labels"
```

---

### Task 9: Update FinancialReportModal.tsx

**Files:**

- Modify: `components/FinancialReportModal.tsx`

- [ ] **Step 1: Rename QQQ/QLD references to INDEX/LEVERAGED**

Replace:

- `state.shares.QQQ` → `state.shares.INDEX`
- `state.shares.QLD` → `state.shares.LEVERAGED`
- `?.qqqClose` → `?.indexClose`
- `?.qldClose` → `?.leveragedClose`
- Display labels: `QQQ (...` → `{displayIndex}(...` and `QLD (...` → `{displayLeveraged}(...`

- [ ] **Step 2: Commit**

```bash
git add components/FinancialReportModal.tsx
git commit -m "refactor(FinancialReportModal): rename to INDEX/LEVERAGED, dynamic labels"
```

---

### Task 10: Verify everything compiles and tests pass

- [ ] **Step 1: Run TypeScript compiler check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`
Expected: All PASS

- [ ] **Step 3: Start dev server and smoke test**

Run: `npm run dev`
Expected: App loads, built-in preset works. Upload a test txt to verify custom data flow.
