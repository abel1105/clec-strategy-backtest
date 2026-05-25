import { describe, it, expect } from 'vitest'
import { strategyNoRebalance, strategyRebalance, strategySmart } from '../strategies'
import { PortfolioState, MonthlyContext, AssetEntry, ProfileConfig } from '../../types'

const testAssets: AssetEntry[] = [
  { dataSourceId: 'A', targetWeight: 60, contributionWeight: 50, pledgeRatio: 0.7 },
  { dataSourceId: 'B', targetWeight: 40, contributionWeight: 50, pledgeRatio: 0.5 },
]

const testConfig: ProfileConfig = {
  initialCapital: 10000,
  contributionAmount: 1000,
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

describe('strategyNoRebalance', () => {
  it('initial allocation uses targetWeight', () => {
    const state = empty()
    const result = strategyNoRebalance(state, ctx('2020-01-01', { A: 100, B: 100 }, 0), testAssets, testConfig)

    // A: 60% of 10000 / 100 = 60 shares
    // B: 40% of 10000 / 100 = 40 shares
    expect(result.shares['A']).toBe(60)
    expect(result.shares['B']).toBe(40)
    expect(result.cashBalance).toBe(0)
  })

  it('DCA uses contributionWeight', () => {
    const state = { ...empty(), shares: { A: 10, B: 10 } }
    const result = strategyNoRebalance(state, ctx('2020-02-01', { A: 100, B: 100 }, 1), testAssets, testConfig)

    // contributionWeight 50/50, contribution 1000
    // A: 10 + 500/100 = 15, B: 10 + 500/100 = 15
    expect(result.shares['A']).toBe(15)
    expect(result.shares['B']).toBe(15)
    // cashBalance unchanged (contributions are external deposits)
    expect(result.cashBalance).toBe(0)
  })
})

describe('strategyRebalance', () => {
  it('rebalances to target weights in January', () => {
    const state = { ...empty(), shares: { A: 100, B: 0 } }
    // Month 12, January of next year
    const result = strategyRebalance(state, ctx('2021-01-01', { A: 100, B: 100 }, 12), testAssets, testConfig)

    // After strategyNoRebalance: A=105, B=5, cash=0
    // totalVal = 105*100 + 5*100 = 11000
    // A target = 11000 * 0.6 / 100 = 66
    // B target = 11000 * 0.4 / 100 = 44
    expect(result.shares['A']).toBe(66)
    expect(result.shares['B']).toBe(44)
    expect(result.cashBalance).toBe(0)
  })

  it('does not rebalance in non-January', () => {
    const state = { ...empty(), shares: { A: 100, B: 0 } }
    const result = strategyRebalance(state, ctx('2021-02-01', { A: 100, B: 100 }, 13), testAssets, testConfig)

    // Only DCA: A=105, B=5
    expect(result.shares['A']).toBe(105)
    expect(result.shares['B']).toBe(5)
  })
})

describe('strategySmart', () => {
  it('tilts from worst to best performer at year end', () => {
    // Use a config with no contributions for clean math
    const config: ProfileConfig = { ...testConfig, contributionAmount: 0 }
    const state = { ...empty(), shares: { A: 100, B: 100 } }
    // December (month 11), A price=50 (worst), B price=200 (best)
    const result = strategySmart(state, ctx('2020-12-01', { A: 50, B: 200 }, 11), testAssets, config)

    // vals: A = 100*50 = 5000, B = 100*200 = 20000
    // best=B, worst=A
    // transfer = 20000 * 0.02 = 400
    // sharesToSell = min(400/50, 100) = 8
    // A: 100 - 8 = 92
    // B: 100 + (8*50)/200 = 100 + 2 = 102
    expect(result.shares['A']).toBeCloseTo(92)
    expect(result.shares['B']).toBeCloseTo(102)
    expect(result.strategyMemory.lastAction).toContain('Tilt')
  })
})
