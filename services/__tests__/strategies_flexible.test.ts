import { describe, it, expect } from 'vitest'
import { strategyFlexible1, strategyFlexible2 } from '../strategies'
import { PortfolioState, MonthlyContext, AssetEntry, ProfileConfig } from '../../types'

const testAssets: AssetEntry[] = [
  { dataSourceId: 'A', targetWeight: 60, contributionWeight: 50, pledgeRatio: 0.7 },
  { dataSourceId: 'B', targetWeight: 40, contributionWeight: 50, pledgeRatio: 0.5 },
]

const baseConfig: ProfileConfig = {
  initialCapital: 100000,
  contributionAmount: 0,
  contributionIntervalMonths: 1,
  yearlyContributionMonth: 12,
  cashYieldAnnual: 4,
  annualExpenseAmount: 2000,
  cashCoverageYears: 15,
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
}

const ctx = (date: string, prices: Record<string, number>, monthIndex: number): MonthlyContext => ({
  date,
  prices,
  lows: Object.fromEntries(Object.keys(prices).map((k) => [k, prices[k]])),
  multipliers: Object.fromEntries(Object.keys(prices).map((k) => [k, 1])),
  monthIndex,
})

const empty = (): PortfolioState => ({
  date: '',
  shares: {},
  cashBalance: 0,
  debtBalance: 0,
  accruedInterest: 0,
  totalValue: 0,
  strategyMemory: {},
  ltv: 0,
  beta: 0,
  events: [],
})

describe('Strategy Flexible 1 (Defensive)', () => {
  it('sells proportionally when cash inadequate', () => {
    // Cash target = 2000 * 15 = 30000
    // Cash = 5000 < 30000 -> inadequate
    const state = { ...empty(), shares: { A: 500, B: 500 }, cashBalance: 5000 }
    const result = strategyFlexible1(state, ctx('2020-12-01', { A: 100, B: 100 }, 11), testAssets, baseConfig)

    // shortfall = 30000 - 5000 = 25000
    // vals: A=50000, B=50000, total=100000
    // A portion = 0.5, sell = 12500, shares = min(12500/100, 500) = 125
    // A: 500 - 125 = 375, cash: 5000 + 12500 = 17500
    // B: 500 - 125 = 375, cash: 17500 + 12500 = 30000
    expect(result.shares['A']).toBe(375)
    expect(result.shares['B']).toBe(375)
    expect(result.cashBalance).toBe(30000)
    expect(result.strategyMemory.lastAction).toBe('Flex1: Sell to Cash')
  })

  it('invests proportionally when cash adequate', () => {
    // Cash = 50000 >= 30000 -> adequate
    const state = { ...empty(), shares: { A: 0, B: 0 }, cashBalance: 50000 }
    const result = strategyFlexible1(state, ctx('2020-12-01', { A: 100, B: 100 }, 11), testAssets, baseConfig)

    // totalW = 60 + 40 = 100
    // A invest = 50000 * 60/100 = 30000 -> 300 shares
    // B invest = 50000 * 40/100 = 20000 -> 200 shares
    expect(result.shares['A']).toBe(300)
    expect(result.shares['B']).toBe(200)
    expect(result.cashBalance).toBe(0)
    expect(result.strategyMemory.lastAction).toBe('Flex1: Invest Cash')
  })
})

describe('Strategy Flexible 2 (Aggressive)', () => {
  it('sells proportionally when cash inadequate', () => {
    const state = { ...empty(), shares: { A: 500, B: 500 }, cashBalance: 5000 }
    const result = strategyFlexible2(state, ctx('2020-12-01', { A: 100, B: 100 }, 11), testAssets, baseConfig)

    expect(result.shares['A']).toBe(375)
    expect(result.shares['B']).toBe(375)
    expect(result.cashBalance).toBe(30000)
    expect(result.strategyMemory.lastAction).toBe('Flex2: Sell to Cash')
  })

  it('invests aggressively when cash adequate', () => {
    // Cash = 50000 >= 30000 -> adequate
    // Both assets have equal value, A comes first so it's the "best"
    const state = { ...empty(), shares: { A: 50, B: 50 }, cashBalance: 50000 }
    const result = strategyFlexible2(state, ctx('2020-12-01', { A: 100, B: 100 }, 11), testAssets, baseConfig)

    // bestId = A (first with equal value since > not >=)
    // A: 50 + 50000/100 = 550
    expect(result.shares['A']).toBe(550)
    expect(result.shares['B']).toBe(50)
    expect(result.cashBalance).toBe(0)
    expect(result.strategyMemory.lastAction).toBe('Flex2: Aggressive to A')
  })
})
