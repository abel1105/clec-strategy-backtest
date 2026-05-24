# Single Asset Data Sources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded 1x/2x asset pair model with a library of individual data sources that profiles reference via a flexible asset list.

**Architecture:** Data sources (individual assets) live in a library stored in App state. Profiles contain a list of `AssetEntry[]`, each referencing a data source by ID. The simulation engine and strategies iterate over assets dynamically instead of hardcoded INDEX/LEVERAGED slots. Per-asset pledge ratios and multipliers replace hardcoded ratios.

**Tech Stack:** TypeScript, React, localStorage persistence

---

## File Structure Map

| File | Role |
|---|---|
| `types.ts` | All new type definitions |
| `constants.ts` | Built-in data sources (QQQ, QLD) |
| `services/dataLoader.ts` | Single-asset txt parsing |
| `services/simulationEngine.ts` | Dynamic N-asset simulation loop |
| `services/strategies.ts` | N-asset strategy implementations |
| `App.tsx` | Data source library state, profile management, migration |
| `components/ConfigPanel.tsx` | Data source library UI + profile asset selection |
| `components/ResultsDashboard.tsx` | Chart labels for N assets |
| `components/FinancialReportModal.tsx` | Report labels for N assets |
| `services/__tests__/dataLoader.test.ts` | Updated data loader tests |
| `services/__tests__/simulationEngine.test.ts` | Updated engine tests |
| `services/__tests__/strategies.test.ts` | Updated strategy tests |

---

### Task 1: Core Type System

**Files:**
- Modify: `types.ts` (entire file)

- [ ] **Step 1: Read the current types.ts**

Read `types.ts` to see the full current content.

- [ ] **Step 2: Define new types (DataSource, AssetDataRow, AssetEntry, MonthlyContext)**

Add these to the top of `types.ts`:

```typescript
export interface DataSource {
  id: string
  name: string
  multiplier: number
  data: AssetDataRow[]
}

export interface AssetDataRow {
  date: string
  close: number
  low: number
}

export interface AssetEntry {
  dataSourceId: string
  targetWeight: number
  contributionWeight: number
  pledgeRatio: number
}

export interface MonthlyContext {
  date: string
  prices: Record<string, number>
  lows: Record<string, number>
  multipliers: Record<string, number>  // sourceId -> multiplier (for beta)
  monthIndex: number
}
```

- [ ] **Step 3: Remove MarketDataRow and update PortfolioState**

Replace `MarketDataRow` (entire interface) with nothing (it is deleted). Update `PortfolioState.shares` from `{ INDEX: number; LEVERAGED: number }` to `Record<string, number>`:

```typescript
export interface PortfolioState {
  date: string
  shares: Record<string, number>
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

- [ ] **Step 4: Update SimulationResult**

Replace `indexName: string` and `leveragedName: string` with `assetNames: string[]`:

```typescript
export interface SimulationResult {
  strategyName: string
  color: string
  isLeveraged: boolean
  assetNames: string[]
  history: PortfolioState[]
  isBankrupt: boolean
  bankruptcyDate: string | null
  metrics: {
    finalBalance: number
    cagr: number
    maxDrawdown: number
    sharpeRatio: number
    irr: number
    realFinalBalance: number
    worstYearReturn: number
    maxRecoveryMonths: number
    calmarRatio: number
    painIndex: number
    inflationRate: number
  }
}
```

- [ ] **Step 5: Update Profile to use AssetEntry[] and remove old AssetConfig**

Remove the entire `AssetConfig` interface. Update `Profile`:

```typescript
export interface Profile {
  id: string
  name: string
  color: string
  strategyType: StrategyType
  assets: AssetEntry[]
  config: {
    initialCapital: number
    contributionAmount: number
    contributionIntervalMonths: number
    yearlyContributionMonth: number
    cashYieldAnnual: number
    annualExpenseAmount?: number
    cashCoverageYears?: number
    leverage: LeverageConfig
  }
}
```

- [ ] **Step 6: Simplify LeverageConfig**

Remove `indexPledgeRatio` and `leveragedPledgeRatio`:

```typescript
export interface LeverageConfig {
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

- [ ] **Step 7: Update StrategyFunction signature**

Replace:

```typescript
export type StrategyFunction = (
  currentState: PortfolioState,
  marketData: MarketDataRow,
  config: AssetConfig,
  monthIndex: number,
) => PortfolioState
```

With:

```typescript
export type StrategyFunction = (
  currentState: PortfolioState,
  context: MonthlyContext,
  assets: AssetEntry[],
  config: ProfileConfig,
) => PortfolioState
```

Replace `ProfileConfig` with the existing `AssetConfig` shape (the config object inside Profile). Actually, use a type alias:

```typescript
export type ProfileConfig = {
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

- [ ] **Step 8: Run TypeScript check**

Run: `bun run tsc --noEmit` (or `npx tsc --noEmit`)
Expected: no errors from types.ts. Errors expected from other files that still use old types.

- [ ] **Step 9: Commit**

```bash
git add types.ts
git commit -m "feat: define new single-asset data source types"
```

---

### Task 2: Built-in Data Sources + Data Loader

**Files:**
- Modify: `constants.ts`
- Modify: `services/dataLoader.ts`
- Modify: `services/__tests__/dataLoader.test.ts`

- [ ] **Step 1: Read current files**

Read `constants.ts`, `services/dataLoader.ts`, `services/__tests__/dataLoader.test.ts`.

- [ ] **Step 2: Update constants.ts to export built-in DataSource[]**

Replace `MARKET_DATA` with `BUILT_IN_DATA_SOURCES`:

```typescript
import { DataSource } from './types'
import qqqHistory from './data/qqq-history.json'
import qldHistory from './data/qld-history.json'

const buildSource = (
  data: { month: string; low: number; close: number }[],
  name: string,
  multiplier: number,
  id: string,
): DataSource => ({
  id,
  name,
  multiplier,
  data: data.map((item) => ({
    date: `${item.month}-01`,
    close: item.close,
    low: item.low,
  })),
})

export const BUILT_IN_DATA_SOURCES: DataSource[] = [
  buildSource(qqqHistory, 'QQQ', 1, 'builtin-qqq'),
  buildSource(qldHistory, 'QLD', 2, 'builtin-qld'),
]
```

- [ ] **Step 3: Update dataLoader.ts for single-asset loading**

Keep `parseTxtFile` and `aggregateToMonthly` as-is. Replace `buildMarketData` with a simpler function:

```typescript
import { AssetDataRow } from '../types'
import { MonthlyPoint } from './dataLoader'

// Keep parseTxtFile and aggregateToMonthly unchanged

// New function: convert aggregated monthly data to AssetDataRow[]
export function monthlyPointsToAssetData(
  points: MonthlyPoint[],
): AssetDataRow[] {
  return points.map((p) => ({
    date: `${p.month}-01`,
    close: p.close,
    low: p.low,
  }))
}
```

Update the `DailyPoint` and `MonthlyPoint` exports if needed (they are used in other files). Export them if not already exported:

```typescript
export interface DailyPoint {
  date: string
  price: number
}

export interface MonthlyPoint {
  month: string
  close: number
  low: number
}
```

- [ ] **Step 4: Write test for monthlyPointsToAssetData**

Add to `services/__tests__/dataLoader.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { monthlyPointsToAssetData } from '../dataLoader'

describe('monthlyPointsToAssetData', () => {
  it('should convert MonthlyPoint[] to AssetDataRow[]', () => {
    const input = [
      { month: '2020-01', close: 100, low: 95 },
      { month: '2020-02', close: 110, low: 105 },
    ]
    const result = monthlyPointsToAssetData(input)
    expect(result).toEqual([
      { date: '2020-01-01', close: 100, low: 95 },
      { date: '2020-02-01', close: 110, low: 105 },
    ])
  })
})
```

- [ ] **Step 5: Write test for BUILT_IN_DATA_SOURCES**

Add test to `services/__tests__/dataLoader.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { BUILT_IN_DATA_SOURCES } from '../constants'

describe('BUILT_IN_DATA_SOURCES', () => {
  it('should export QQQ and QLD with correct multipliers', () => {
    expect(BUILT_IN_DATA_SOURCES).toHaveLength(2)
    const qqq = BUILT_IN_DATA_SOURCES.find((s) => s.id === 'builtin-qqq')
    const qld = BUILT_IN_DATA_SOURCES.find((s) => s.id === 'builtin-qld')
    expect(qqq?.name).toBe('QQQ')
    expect(qqq?.multiplier).toBe(1)
    expect(qld?.name).toBe('QLD')
    expect(qld?.multiplier).toBe(2)
    expect(qqq?.data.length).toBeGreaterThan(100)
    expect(qld?.data.length).toBeGreaterThan(100)
  })
})
```

- [ ] **Step 6: Run tests**

Run: `bun run vitest run dataLoader.test`

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add constants.ts services/dataLoader.ts services/__tests__/dataLoader.test.ts
git commit -m "feat: add built-in data sources and single-asset data loader"
```

---

### Task 3: Simulation Engine

**Files:**
- Modify: `services/simulationEngine.ts`
- Modify: `services/__tests__/simulationEngine.test.ts`

- [ ] **Step 1: Read current files**

Read `services/simulationEngine.ts` and `services/__tests__/simulationEngine.test.ts`.

- [ ] **Step 2: Write the engine test first**

Replace `services/__tests__/simulationEngine.test.ts` with a new test for the N-asset engine:

```typescript
import { describe, it, expect } from 'vitest'
import { runBacktest } from '../simulationEngine'
import {
  PortfolioState,
  MonthlyContext,
  AssetEntry,
  StrategyFunction,
  ProfileConfig,
} from '../../types'

const strategyNoRebalance: StrategyFunction = (
  state: PortfolioState,
  ctx: MonthlyContext,
  assets: AssetEntry[],
  config: ProfileConfig,
) => {
  let s = { ...state, shares: { ...state.shares } }
  const month = parseInt(ctx.date.substring(5, 7))
  const isContributionMonth =
    month === config.yearlyContributionMonth ||
    config.contributionIntervalMonths === 1

  if (!isContributionMonth) return state

  for (const asset of assets) {
    const price = ctx.prices[asset.dataSourceId]
    if (!price || price <= 0) continue
    const portion = config.contributionAmount * (asset.contributionWeight / 100)
    s.shares[asset.dataSourceId] = (s.shares[asset.dataSourceId] || 0) + portion / price
  }
  return s
}

const createTestAssets = (): AssetEntry[] => [
  { dataSourceId: 'src-a', targetWeight: 60, contributionWeight: 60, pledgeRatio: 0.7 },
  { dataSourceId: 'src-b', targetWeight: 40, contributionWeight: 40, pledgeRatio: 0.5 },
]

const createTestConfig = (): ProfileConfig => ({
  initialCapital: 100000,
  contributionAmount: 1000,
  contributionIntervalMonths: 1,
  yearlyContributionMonth: 12,
  cashYieldAnnual: 4.0,
  leverage: {
    enabled: false,
    interestRate: 5,
    cashPledgeRatio: 0.95,
    maxLtv: 100,
    withdrawType: 'PERCENT',
    withdrawValue: 0,
    inflationRate: 3,
    interestType: 'CAPITALIZED',
    ltvBasis: 'TOTAL_ASSETS',
  },
})

describe('runBacktest with 2 assets', () => {
  it('should return SimulationResult with correct assetNames', () => {
    const dataA = Array.from({ length: 12 }, (_, i) => ({
      date: `2024-${String(i + 1).padStart(2, '0')}-01`,
      close: 100 + i,
      low: 98 + i,
    }))
    const dataB = Array.from({ length: 12 }, (_, i) => ({
      date: `2024-${String(i + 1).padStart(2, '0')}-01`,
      close: 200 + i * 2,
      low: 195 + i * 2,
    }))

    const result = runBacktest(
      { 'src-a': dataA, 'src-b': dataB },
      { 'src-a': 1, 'src-b': 2 },
      strategyNoRebalance,
      createTestAssets(),
      createTestConfig(),
      'Test Strategy',
      '#ff0000',
    )

    expect(result.assetNames).toEqual(['src-a', 'src-b'])
    expect(result.history.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 3: Implement the new runBacktest signature and loop**

Replace `services/simulationEngine.ts` with the new implementation. The new signature accepts a record of asset data keyed by sourceId:

```typescript
export const runBacktest = (
  allAssetData: Record<string, AssetDataRow[]>,
  multipliers: Record<string, number>,
  strategyFunc: StrategyFunction,
  assets: AssetEntry[],
  config: ProfileConfig,
  strategyName: string,
  color: string = '#000000',
): SimulationResult => {
  // 1. Find common months across all selected assets (inner join)
  const monthsSet = new Set<string>()
  let first = true
  for (const entry of assets) {
    const data = allAssetData[entry.dataSourceId]
    if (!data) continue
    const assetMonths = new Set(data.map((r) => r.date))
    if (first) {
      assetMonths.forEach((m) => monthsSet.add(m))
      first = false
    } else {
      for (const m of monthsSet) {
        if (!assetMonths.has(m)) monthsSet.delete(m)
      }
    }
  }
  const months = Array.from(monthsSet).sort()

  const history: PortfolioState[] = []
  let currentState: PortfolioState = {
    date: months[0] || '',
    shares: {},
    cashBalance: config.initialCapital,
    debtBalance: 0,
    accruedInterest: 0,
    totalValue: config.initialCapital,
    strategyMemory: {},
    ltv: 0,
    beta: 0,
    events: [],
  }

  const monthlyCashYieldRate = Math.pow(1 + config.cashYieldAnnual / 100, 1 / 12) - 1
  const leverage = { ...config.leverage }
  const monthlyLoanRate = leverage.enabled
    ? Math.pow(1 + leverage.interestRate / 100, 1 / 12) - 1
    : 0

  let isBankrupt = false
  let bankruptcyDate: string | null = null

  for (let monthIndex = 0; monthIndex < months.length; monthIndex++) {
    const date = months[monthIndex]
    const monthEvents: FinancialEvent[] = []

    if (isBankrupt) {
      history.push({
        ...currentState,
        date,
        totalValue: 0,
        shares: { ...currentState.shares },
        ltv: 0,
        beta: 0,
        events: [{ type: 'INFO', description: 'Account Bankrupt' }],
      })
      continue
    }

    // Build MonthlyContext
    const prices: Record<string, number> = {}
    const lows: Record<string, number> = {}
    for (const entry of assets) {
      const data = allAssetData[entry.dataSourceId]
      if (!data) continue
      const row = data.find((r) => r.date === date)
      if (row) {
        prices[entry.dataSourceId] = row.close
        lows[entry.dataSourceId] = row.low
      }
    }
    const ctx: MonthlyContext = { date, prices, lows, multipliers, monthIndex }

    // Banking logic (unchanged from current, operates on cashBalance/debtBalance)
    if (monthIndex > 0) {
      const interestEarned = currentState.cashBalance * monthlyCashYieldRate
      if (interestEarned > 0.01) {
        currentState.cashBalance += interestEarned
        monthEvents.push({
          type: 'INTEREST_INC',
          amount: interestEarned,
          description: `Cash Interest (+${(config.cashYieldAnnual / 12).toFixed(2)}%)`,
        })
      }

      let interestDue = 0
      if (leverage.enabled && currentState.debtBalance > 0) {
        interestDue = currentState.debtBalance * monthlyLoanRate
      }

      // Debt service logic (same as current)
      if (interestDue > 0) {
        const interestType = leverage.interestType || 'CAPITALIZED'
        if (interestType === 'MONTHLY') {
          if (currentState.cashBalance >= interestDue) {
            currentState.cashBalance -= interestDue
            monthEvents.push({ type: 'INTEREST_EXP', amount: -interestDue, description: 'Loan Interest Paid by Cash' })
          } else {
            const paidByCash = currentState.cashBalance
            const shortfall = interestDue - currentState.cashBalance
            if (paidByCash > 0) {
              monthEvents.push({ type: 'INTEREST_EXP', amount: -paidByCash, description: 'Loan Interest Paid by Cash (Partial)' })
            }
            currentState.cashBalance = 0
            currentState.debtBalance += shortfall
            monthEvents.push({ type: 'DEBT_INC', amount: shortfall, description: 'Unpaid Interest Capitalized to Debt' })
          }
        } else if (interestType === 'MATURITY') {
          currentState.accruedInterest += interestDue
          monthEvents.push({ type: 'INTEREST_EXP', amount: 0, description: 'Interest Accrued (Not Paid)' })
        } else if (interestType === 'CAPITALIZED') {
          currentState.debtBalance += interestDue
          monthEvents.push({ type: 'DEBT_INC', amount: interestDue, description: 'Interest Capitalized to Debt (Compound)' })
        }
      }
    }

    // Execute strategy
    const cashBeforeStrat = currentState.cashBalance
    const sharesBeforeStrat = { ...currentState.shares }
    currentState = strategyFunc(currentState, ctx, assets, config)

    // Detect trades for each asset
    for (const entry of assets) {
      const price = prices[entry.dataSourceId]
      if (!price) continue
      const before = sharesBeforeStrat[entry.dataSourceId] || 0
      const after = currentState.shares[entry.dataSourceId] || 0
      const diff = after - before
      if (Math.abs(diff) > 0.001) {
        const cost = diff * price
        monthEvents.push({
          type: 'TRADE',
          amount: -cost,
          description: `${diff > 0 ? 'Buy' : 'Sell'} ${Math.abs(diff).toFixed(2)} ${entry.dataSourceId} @ ${price.toFixed(2)}`,
        })
      }
    }

    // Detect DCA deposit
    let netTradeCost = 0
    for (const entry of assets) {
      const price = prices[entry.dataSourceId]
      if (!price) continue
      const diff = (currentState.shares[entry.dataSourceId] || 0) - (sharesBeforeStrat[entry.dataSourceId] || 0)
      netTradeCost += diff * price
    }
    const impliedCashFlow = currentState.cashBalance - cashBeforeStrat + netTradeCost
    if (impliedCashFlow > 1.0) {
      monthEvents.push({ type: 'DEPOSIT', amount: impliedCashFlow, description: 'Recurring Contribution / Deposit' })
    }

    // Leverage logic
    if (leverage.enabled) {
      const currentMonth = parseInt(date.substring(5, 7)) - 1

      // Calculate asset values using LOW prices
      let totalAssetValue = currentState.cashBalance
      let effectiveCollateral = currentState.cashBalance * leverage.cashPledgeRatio
      let weightedVal = 0

      for (const entry of assets) {
        const srcMultiplier = multipliers[entry.dataSourceId] || 1
        const lowPrice = lows[entry.dataSourceId] || 0
        const closePrice = prices[entry.dataSourceId] || 0
        const shares = currentState.shares[entry.dataSourceId] || 0
        const val = shares * lowPrice
        totalAssetValue += val
        effectiveCollateral += val * entry.pledgeRatio
        weightedVal += shares * closePrice * srcMultiplier
      }

      // Withdrawal logic
      const isWithdrawalTiming = monthIndex === 0 || currentMonth === 0
      if (isWithdrawalTiming && effectiveCollateral > 0) {
        let borrowAmount = 0
        if (leverage.withdrawType === 'PERCENT') {
          borrowAmount = totalAssetValue * (leverage.withdrawValue / 100)
        } else {
          const yearsPassed = Math.floor(monthIndex / 12)
          const inflationFactor = Math.pow(1 + (leverage.inflationRate || 0) / 100, yearsPassed)
          borrowAmount = leverage.withdrawValue * inflationFactor
        }
        if (borrowAmount > 0) {
          currentState.debtBalance += borrowAmount
          monthEvents.push({ type: 'WITHDRAW', amount: -borrowAmount, description: monthIndex === 0 ? 'Initial Loan Withdrawal' : 'Annual Living Expense Withdrawal' })
          monthEvents.push({ type: 'DEBT_INC', amount: borrowAmount, description: 'Borrowing increased for withdrawal' })
        }
      }

      // Solvency check
      if (effectiveCollateral > 0) {
        const totalLiability = currentState.debtBalance + currentState.accruedInterest
        const ltvDenominator = leverage.ltvBasis === 'COLLATERAL' ? effectiveCollateral : totalAssetValue
        currentState.ltv = ltvDenominator > 0 ? (totalLiability / ltvDenominator) * 100 : 9999
      } else {
        currentState.ltv = currentState.debtBalance + currentState.accruedInterest > 0 ? 9999 : 0
      }

      if (currentState.ltv > leverage.maxLtv) {
        isBankrupt = true
        bankruptcyDate = date
        currentState.totalValue = 0
        monthEvents.push({ type: 'INFO', description: `!!! MARGIN CALL / LIQUIDATION (LTV: ${currentState.ltv.toFixed(1)}%) !!!` })
      }
    }

    // Negative cash bankruptcy
    if (!isBankrupt && currentState.cashBalance < -0.01) {
      isBankrupt = true
      bankruptcyDate = date
      currentState.totalValue = 0
      monthEvents.push({ type: 'INFO', description: `!!! BANKRUPTCY: Negative Cash Balance (${currentState.cashBalance.toFixed(2)}) !!!` })
    }

    // Update net value and beta
    if (!isBankrupt) {
      let totalVal = currentState.cashBalance
      let weightedBetaSum = 0
      for (const entry of assets) {
        const lowPrice = lows[entry.dataSourceId] || 0
        const closePrice = prices[entry.dataSourceId] || 0
        const shares = currentState.shares[entry.dataSourceId] || 0
        totalVal += shares * lowPrice
        weightedBetaSum += shares * closePrice
      }
      currentState.totalValue = Math.max(0, totalVal - currentState.debtBalance - currentState.accruedInterest)

      // Beta uses close prices and per-asset multipliers
      weightedBetaSum = 0
      for (const entry of assets) {
        const srcMultiplier = multipliers[entry.dataSourceId] || 1
        const closePrice = prices[entry.dataSourceId] || 0
        const shares = currentState.shares[entry.dataSourceId] || 0
        weightedBetaSum += shares * closePrice * srcMultiplier
      }
      if (currentState.totalValue > 0) {
        currentState.beta = weightedBetaSum / currentState.totalValue
      } else {
        currentState.beta = 0
      }
    }

    history.push({
      ...currentState,
      shares: { ...currentState.shares },
      strategyMemory: { ...currentState.strategyMemory },
      events: monthEvents,
    })
  }

  // Calculate metrics (unchanged)
  const years = months.length / 12
  const finalState = history[history.length - 1]
  const initialInv = config.initialCapital
  const cagr = isBankrupt ? -100 : calculateCAGR(initialInv, finalState.totalValue, years)
  const mdd = calculateMaxDrawdown(history)
  const irr = isBankrupt ? -100 : calculateIRR(initialInv, config.contributionAmount, config.contributionIntervalMonths, finalState.totalValue, months.length)

  return {
    strategyName,
    color,
    isLeveraged: leverage.enabled,
    assetNames: assets.map((a) => a.dataSourceId),
    history,
    isBankrupt,
    bankruptcyDate,
    metrics: {
      finalBalance: finalState.totalValue,
      cagr,
      maxDrawdown: mdd,
      sharpeRatio: calculateSharpeRatio(history, config.cashYieldAnnual),
      irr,
      realFinalBalance: calculateRealValue(finalState.totalValue, years, leverage.inflationRate || 0),
      maxRecoveryMonths: calculateMaxRecoveryTime(history),
      worstYearReturn: Math.min(...calculateAnnualReturns(history).map((r) => r.return), 0),
      painIndex: calculateUlcerIndex(history),
      calmarRatio: mdd > 0 ? (isBankrupt ? -100 : irr / mdd) : 0,
      inflationRate: leverage.inflationRate,
    },
  }
}
```

Note: this is the full engine rewrite. The beta calculation currently uses `srcMultiplier = 1` as a placeholder — the actual multiplier comes from the DataSource. We'll resolve this in a later step by passing DataSource info to the engine.

- [ ] **Step 4: Update imports in simulationEngine.ts**

Remove import of `MarketDataRow`, `AssetConfig`. Import `PortfolioState`, `SimulationResult`, `StrategyFunction`, `ProfileConfig`, `AssetEntry`, `MonthlyContext`, `FinancialEvent`, `AssetDataRow` from `../types`.

- [ ] **Step 5: Run the engine test**

Run: `bun run vitest run simulationEngine.test`

Expected: The 2-asset test passes.

- [ ] **Step 6: Commit**

```bash
git add services/simulationEngine.ts services/__tests__/simulationEngine.test.ts
git commit -m "feat: rewrite simulation engine for dynamic N-asset iteration"
```

---

### Task 4: Strategies

**Files:**
- Modify: `services/strategies.ts`
- Modify: `services/__tests__/strategies.test.ts`
- Create: `services/__tests__/strategies_flexible.test.ts` (update if exists)

- [ ] **Step 1: Read current files**

Read `services/strategies.ts`, `services/__tests__/strategies.test.ts`, `services/__tests__/strategies_flexible.test.ts`.

- [ ] **Step 2: Write strategy tests first**

Update tests with the new strategy signature. Example for NoRebalance:

```typescript
import { describe, it, expect } from 'vitest'
import { strategyNoRebalance } from '../strategies'
import { PortfolioState, MonthlyContext, AssetEntry, ProfileConfig } from '../../types'

const baseState = (): PortfolioState => ({
  date: '2024-01-01',
  shares: {},
  cashBalance: 10000,
  debtBalance: 0,
  accruedInterest: 0,
  totalValue: 10000,
  strategyMemory: {},
  ltv: 0,
  beta: 0,
  events: [],
})

const testAssets: AssetEntry[] = [
  { dataSourceId: 'SPY', targetWeight: 60, contributionWeight: 60, pledgeRatio: 0.7 },
  { dataSourceId: 'TLT', targetWeight: 40, contributionWeight: 40, pledgeRatio: 0.5 },
]

const baseConfig = (): ProfileConfig => ({
  initialCapital: 100000,
  contributionAmount: 1000,
  contributionIntervalMonths: 1,
  yearlyContributionMonth: 12,
  cashYieldAnnual: 4.0,
  leverage: {
    enabled: false, interestRate: 5, cashPledgeRatio: 0.95,
    maxLtv: 100, withdrawType: 'PERCENT', withdrawValue: 0,
    inflationRate: 3, interestType: 'CAPITALIZED', ltvBasis: 'TOTAL_ASSETS',
  },
})

describe('strategyNoRebalance', () => {
  it('should distribute contribution by contributionWeight', () => {
    const ctx: MonthlyContext = {
      date: '2024-01-01',
      prices: { SPY: 100, TLT: 200 },
      lows: { SPY: 98, TLT: 195 },
      multipliers: { SPY: 1, TLT: 1 },
      monthIndex: 0,
    }
    const result = strategyNoRebalance(baseState(), ctx, testAssets, baseConfig())
    // Contribution = 1000, SPY gets 60% = 600 at $100 = 6 shares
    // TLT gets 40% = 400 at $200 = 2 shares
    expect(result.shares['SPY']).toBeCloseTo(6, 2)
    expect(result.shares['TLT']).toBeCloseTo(2, 2)
    expect(result.cashBalance).toBeCloseTo(9000, 2)
  })
})
```

Repeat similar tests for Rebalance, Smart, Flexible1, Flexible2.

- [ ] **Step 3: Rewrite strategies.ts**

Each strategy gets the new signature. Example for noRebalance:

```typescript
export const strategyNoRebalance: StrategyFunction = (
  currentState: PortfolioState,
  context: MonthlyContext,
  assets: AssetEntry[],
  config: ProfileConfig,
): PortfolioState => {
  const nextState = {
    ...currentState,
    shares: { ...currentState.shares },
  }

  const month = parseInt(context.date.substring(5, 7))
  const isContributionMonth =
    config.contributionIntervalMonths === 1 ||
    (config.contributionIntervalMonths === 3 && [3, 6, 9, 12].includes(month)) ||
    (config.contributionIntervalMonths === 12 && month === config.yearlyContributionMonth)

  if (!isContributionMonth) return currentState

  for (const asset of assets) {
    if (nextState.cashBalance <= 0) break
    const price = context.prices[asset.dataSourceId]
    if (!price || price <= 0) continue
    const portion = config.contributionAmount * (asset.contributionWeight / 100)
    const actualSpend = Math.min(portion, nextState.cashBalance)
    const sharesBought = actualSpend / price
    nextState.shares[asset.dataSourceId] = (nextState.shares[asset.dataSourceId] || 0) + sharesBought
    nextState.cashBalance -= actualSpend
  }

  return nextState
}
```

Write all 5 strategies with the same pattern — iterate `assets` array dynamically.

- [ ] **Step 4: Run strategy tests**

Run: `bun run vitest run strategies.test`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add services/strategies.ts services/__tests__/strategies.test.ts services/__tests__/strategies_flexible.test.ts
git commit -m "feat: rewrite strategies for N-asset support"
```

---

### Task 5: App State & Migration

**Files:**
- Modify: `App.tsx`

- [ ] **Step 1: Read current App.tsx**

Read `App.tsx` fully.

- [ ] **Step 2: Replace SavedSource with DataSource in state**

Change the state initialization:

```typescript
const [dataSources, setDataSources] = useState<DataSource[]>(() => {
  // Try loading from localStorage 'app_data_sources'
  const saved = localStorage.getItem('app_data_sources')
  if (saved) {
    try { return JSON.parse(saved) }
    catch { /* ignore */ }
  }

  // Try migrating from legacy 'app_saved_sources'
  const legacy = localStorage.getItem('app_saved_sources')
  if (legacy) {
    try {
      const parsed = JSON.parse(legacy) as SavedSource[]
      return migrateLegacySources(parsed)
    } catch { /* ignore */ }
  }

  // Fall back to built-in
  return BUILT_IN_DATA_SOURCES
})
```

- [ ] **Step 3: Write the migration helper**

```typescript
const migrateLegacySources = (legacy: SavedSource[]): DataSource[] => {
  const result: DataSource[] = [...BUILT_IN_DATA_SOURCES]
  for (const ls of legacy) {
    const parts = ls.name.split('/')
    if (parts.length === 2) {
      result.push({
        id: `legacy-${ls.id}-1`,
        name: parts[0].trim(),
        multiplier: 1,
        data: ls.marketData.map((r) => ({ date: r.date, close: r.indexClose, low: r.indexLow })),
      })
      result.push({
        id: `legacy-${ls.id}-2`,
        name: parts[1].trim(),
        multiplier: 2,
        data: ls.marketData.map((r) => ({ date: r.date, close: r.leveragedClose, low: r.leveragedLow })),
      })
    }
  }
  return result
}
```

- [ ] **Step 4: Update getMarketDataForSource and runSimulation**

Replace `getMarketDataForSource` with a function that builds the data record and asset entries:

```typescript
const buildSimulationInput = useCallback(
  (profile: Profile) => {
    const assetData: Record<string, AssetDataRow[]> = {}
    const multipliers: Record<string, number> = {}
    let anyMissing = false
    for (const entry of profile.assets) {
      const source = dataSources.find((s) => s.id === entry.dataSourceId)
      if (source) {
        assetData[entry.dataSourceId] = source.data
        multipliers[entry.dataSourceId] = source.multiplier
      } else {
        anyMissing = true
      }
    }
    if (anyMissing) return null
    return { assetData, multipliers, assets: profile.assets, config: profile.config }
  },
  [dataSources],
)
```

- [ ] **Step 5: Update handleRunSimulation**

The simulation loop changes:

```typescript
const handleRunSimulation = useCallback(() => {
  setResults([])
  const newResults: SimulationResult[] = []

  for (const profile of activeProfiles) {
    const input = buildSimulationInput(profile)
    if (!input) continue
    const strategyFunc = getStrategyFunction(profile.strategyType)
    const result = runBacktest(
      input.assetData,
      input.multipliers,
      strategyFunc,
      input.assets,
      input.config,
      profile.name,
      profile.color,
    )
    newResults.push(result)
  }

  setResults(newResults)
}, [activeProfiles, buildSimulationInput])
```

- [ ] **Step 6: Update persistence**

Replace `savedSources` localStorage calls with `dataSources`:

```typescript
useEffect(() => {
  localStorage.setItem('app_data_sources', JSON.stringify(dataSources))
}, [dataSources])
```

- [ ] **Step 7: Handle legacy profile migration**

In profiles initialization, migrate profiles that have `dataSourceId` pointing to old format:

```typescript
const [profiles, setProfiles] = useState<Profile[]>(() => {
  const saved = localStorage.getItem('app_profiles')
  if (saved) {
    try {
      const parsed = JSON.parse(saved) as Profile[]
      return parsed.map(migrateLegacyProfile)
    } catch { /* ignore */ }
  }
  return createDefaultProfiles()
})

const migrateLegacyProfile = (profile: any): Profile => {
  if (profile.assets) return profile // already new format
  // Old format: profile.config.indexName, profile.config.leveragedName
  // profile.dataSourceId, profile.config.indexWeight, etc.
  return {
    ...profile,
    assets: [
      {
        dataSourceId: profile.dataSourceId || 'builtin-qqq',
        targetWeight: profile.config?.indexWeight ?? 60,
        contributionWeight: profile.config?.contributionIndexWeight ?? 60,
        pledgeRatio: profile.config?.leverage?.indexPledgeRatio ?? 0.7,
      },
      {
        dataSourceId: profile.dataSourceId ? `legacy-${profile.dataSourceId}-2` : 'builtin-qld',
        targetWeight: profile.config?.leveragedWeight ?? 40,
        contributionWeight: profile.config?.contributionLeveragedWeight ?? 40,
        pledgeRatio: profile.config?.leverage?.leveragedPledgeRatio ?? 0.0,
      },
    ],
    config: {
      initialCapital: profile.config?.initialCapital ?? 100000,
      contributionAmount: profile.config?.contributionAmount ?? 1000,
      contributionIntervalMonths: profile.config?.contributionIntervalMonths ?? 1,
      yearlyContributionMonth: profile.config?.yearlyContributionMonth ?? 12,
      cashYieldAnnual: profile.config?.cashYieldAnnual ?? 4.0,
      annualExpenseAmount: profile.config?.annualExpenseAmount,
      cashCoverageYears: profile.config?.cashCoverageYears,
      leverage: {
        ...profile.config?.leverage,
      },
    },
  }
}
```

- [ ] **Step 8: Verify app compiles**

Run: `bun run tsc --noEmit`

Expected: no type errors.

- [ ] **Step 9: Commit**

```bash
git add App.tsx
git commit -m "feat: update app state for single-asset data sources with migration"
```

---

### Task 6: UI — Data Source Library

**Files:**
- Modify: `components/ConfigPanel.tsx`

- [ ] **Step 1: Read current ConfigPanel.tsx**

Read `components/ConfigPanel.tsx` fully.

- [ ] **Step 2: Add Data Source Library component**

Add a new section in the ConfigPanel sidebar showing saved data sources and an "Add Source" expandable.

Key UI elements:

```tsx
// Data source list
{dataSources
  .filter((ds) => !ds.id.startsWith('builtin-'))
  .map((ds) => (
    <div key={ds.id} className="flex items-center justify-between p-2 border rounded">
      <div>
        <div className="font-medium">{ds.name}</div>
        <div className="text-sm text-gray-500">
          {ds.multiplier}x &middot; {ds.data.length} months
          &middot; {ds.data[0]?.date} — {ds.data[ds.data.length - 1]?.date}
        </div>
      </div>
      <button onClick={() => onDeleteSource(ds.id)} className="text-red-500 hover:text-red-700">
        Delete
      </button>
    </div>
  ))}

// Add Source (expandable details)
<details>
  <summary className="cursor-pointer font-medium">Add New Data Source</summary>
  <div className="mt-2 space-y-2">
    <input
      type="text"
      placeholder="Asset name (e.g. SPY)"
      value={newSourceName}
      onChange={(e) => setNewSourceName(e.target.value)}
    />
    <input
      type="number"
      placeholder="Multiplier (1, 2, 3...)"
      value={newSourceMultiplier}
      onChange={(e) => setNewSourceMultiplier(Number(e.target.value))}
      min={1}
      step={1}
    />
    <input
      type="file"
      accept=".txt"
      onChange={(e) => handleFileUpload(e.target.files?.[0])}
    />
    <button
      onClick={handleSaveSource}
      disabled={!canSaveSource}
    >
      Save Source
    </button>
  </div>
</details>
```

- [ ] **Step 3: Implement source save handler**

```typescript
const handleSaveSource = async () => {
  if (!fileContent || !newSourceName || newSourceMultiplier < 1) return
  try {
    const daily = parseTxtFile(fileContent)
    const monthly = aggregateToMonthly(daily)
    const data = monthlyPointsToAssetData(monthly)
    const newSource: DataSource = {
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: newSourceName,
      multiplier: newSourceMultiplier,
      data,
    }
    onSaveSource(newSource)
    setNewSourceName('')
    setNewSourceMultiplier(1)
    setFileContent(null)
  } catch (e) {
    alert('Error parsing file: ' + (e as Error).message)
  }
}
```

- [ ] **Step 4: Update ConfigPanel props**

The ConfigPanel receives:
- `dataSources: DataSource[]` (instead of `savedSources: SavedSource[]`)
- `onSaveSource: (ds: DataSource) => void`
- `onDeleteSource: (id: string) => void`

- [ ] **Step 5: Commit**

```bash
git add components/ConfigPanel.tsx
git commit -m "feat: add data source library UI to config panel"
```

---

### Task 7: UI — Profile Asset Selection

**Files:**
- Modify: `components/ConfigPanel.tsx`

- [ ] **Step 1: Read current profile edit view**

Read the profile edit section of ConfigPanel.tsx (the section that handles data source radio buttons, weights, etc.)

- [ ] **Step 2: Replace data source + weight controls with asset list**

In the edit profile section, replace:

```tsx
{/* Old: data source radio buttons + weight sliders */}
{/* Remove entire block that handles:
   - dataSourceId radio buttons
   - indexWeight / leveragedWeight sliders
   - contributionIndexWeight / contributionLeveragedWeight sliders
   - indexName / leveragedName
*/}
```

With:

```tsx
{/* New: Asset list */}
<div className="space-y-3">
  <h3 className="font-semibold">Assets</h3>
  {profile.assets.map((asset, i) => (
    <div key={asset.dataSourceId} className="border rounded p-3 space-y-2">
      <div className="flex justify-between">
        <span className="font-medium">
          {dataSources.find((s) => s.id === asset.dataSourceId)?.name || asset.dataSourceId}
        </span>
        <span className="text-sm text-gray-500">
          {dataSources.find((s) => s.id === asset.dataSourceId)?.multiplier}x
        </span>
        <button onClick={() => removeAsset(i)} className="text-red-500 text-sm">Remove</button>
      </div>
      <div>
        <label>Target Weight: {asset.targetWeight}%</label>
        <input type="range" min={0} max={100} value={asset.targetWeight}
          onChange={(e) => updateAsset(i, { targetWeight: Number(e.target.value) })} />
      </div>
      <div>
        <label>Contribution Weight: {asset.contributionWeight}%</label>
        <input type="range" min={0} max={100} value={asset.contributionWeight}
          onChange={(e) => updateAsset(i, { contributionWeight: Number(e.target.value) })} />
      </div>
      <div>
        <label>Pledge Ratio: {asset.pledgeRatio * 100}%</label>
        <input type="range" min={0} max={100} value={asset.pledgeRatio * 100}
          onChange={(e) => updateAsset(i, { pledgeRatio: Number(e.target.value) / 100 })} />
      </div>
    </div>
  ))}

  {/* Add Asset button */}
  <select
    value=""
    onChange={(e) => {
      if (e.target.value) addAsset(e.target.value)
    }}
  >
    <option value="">+ Add Asset</option>
    {availableDataSources
      .filter((ds) => !profile.assets.some((a) => a.dataSourceId === ds.id))
      .map((ds) => (
        <option key={ds.id} value={ds.id}>{ds.name} ({ds.multiplier}x)</option>
      ))}
  </select>
</div>
```

- [ ] **Step 3: Implement asset manipulation handlers**

```typescript
const addAsset = (dataSourceId: string) => {
  updateProfile({
    assets: [
      ...profile.assets,
      { dataSourceId, targetWeight: 0, contributionWeight: 0, pledgeRatio: 0.7 },
    ],
  })
}

const removeAsset = (index: number) => {
  updateProfile({
    assets: profile.assets.filter((_, i) => i !== index),
  })
}

const updateAsset = (index: number, updates: Partial<AssetEntry>) => {
  updateProfile({
    assets: profile.assets.map((a, i) => (i === index ? { ...a, ...updates } : a)),
  })
}
```

- [ ] **Step 6: Commit**

```bash
git add components/ConfigPanel.tsx
git commit -m "feat: replace pair weights with dynamic asset selection in profile edit"
```

---

### Task 8: Charts, Reports & Import/Export

**Files:**
- Modify: `components/ResultsDashboard.tsx`
- Modify: `components/FinancialReportModal.tsx`
- Modify: `App.tsx` (import/export handlers)

- [ ] **Step 1: Update ResultsDashboard.tsx**

Find all references to `result.indexName` and `result.leveragedName` and replace with `result.assetNames`. For example, chart legends and tooltips:

```diff
- <span>{result.indexName} / {result.leveragedName}</span>
+ <span>{result.assetNames.join(' / ')}</span>
```

If there's a per-asset breakdown, iterate `result.assetNames` dynamically.

- [ ] **Step 2: Update FinancialReportModal.tsx**

Same pattern — replace `indexName`/`leveragedName` with `assetNames`.

- [ ] **Step 3: Update import/export in App.tsx**

Update the export handler to include `dataSources`:

```typescript
const handleExportData = useCallback(() => {
  const exportData = {
    profiles: profiles,
    dataSources: dataSources,
  }
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
  // ... download logic
}, [profiles, dataSources])
```

Update import handler to merge data sources:

```typescript
const handleImportData = useCallback((imported: { profiles?: Profile[]; dataSources?: DataSource[] }) => {
  if (imported.dataSources) {
    setDataSources((prev) => {
      const existing = new Map(prev.map((ds) => [ds.id, ds]))
      for (const ds of imported.dataSources) {
        existing.set(ds.id, ds)
      }
      return Array.from(existing.values())
    })
  }
  if (imported.profiles) {
    setProfiles((prev) => {
      const existing = new Map(prev.map((p) => [p.id, p]))
      for (const p of imported.profiles) {
        existing.set(p.id, p)
      }
      return Array.from(existing.values())
    })
  }
}, [])
```

- [ ] **Step 5: Commit**

```bash
git add components/ResultsDashboard.tsx components/FinancialReportModal.tsx App.tsx
git commit -m "feat: update charts, reports, and import/export for N-asset data"
```

---

### Task 9: Integration & Polish

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Run full TypeScript check**

Run: `bun run tsc --noEmit`

Expected: zero type errors. Fix any remaining issues.

- [ ] **Step 2: Run all tests**

Run: `bun run vitest run`

Expected: all existing tests pass (updated to new format). Fix any failures.

- [ ] **Step 3: Update README.md**

Update the data model documentation in README to reflect the new single-asset system.

- [ ] **Step 4: Final commit**

```bash
git add README.md
git commit -m "docs: update README for single-asset data source model"
```

---

### Spec Coverage Check

| Spec Section | Task |
|---|---|
| Section 1: Core Types | Task 1 |
| Section 2: Data Flow & Engine | Task 3 |
| Section 3: Leverage & Pledge | Task 3 (engine), Task 7 (UI) |
| Section 4: Strategies | Task 4 |
| Section 5: UI — Data Source Library | Task 6 |
| Section 5: UI — Profile Asset Selection | Task 7 |
| Section 5: UI — Charts & Reports | Task 8 |
| Section 6: Persistence & Migration | Task 5 |
| Section 7: Import/Export | Task 8 |
| Section 8: Files Changed | All tasks |
| Section 9: Testing | Built into each task |

All spec requirements covered.
