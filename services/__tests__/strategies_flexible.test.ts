import { describe, it, expect } from 'vitest'
import { strategyFlexible2 } from '../strategies'
import { PortfolioState, AssetEntry, ProfileConfig } from '../../types'

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

const ctx = (
  date: string,
  prices: Record<string, number>,
  monthIndex: number,
  multipliers?: Record<string, number>,
): {
  date: string
  prices: Record<string, number>
  lows: Record<string, number>
  multipliers: Record<string, number>
  monthIndex: number
} => ({
  date,
  prices,
  lows: Object.fromEntries(Object.keys(prices).map((k) => [k, prices[k]])),
  multipliers: multipliers ?? Object.fromEntries(Object.keys(prices).map((k) => [k, 1])),
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

describe('Strategy Flexible 2 (Aggressive) — FLEXIBLE_2 regression', () => {
  it('cross-rebalances index→leveraged in bear market when cash inadequate', () => {
    // FLEXIBLE_2 during dot-com crash: QLD profit negative, cash below target
    // Assets: QQ (1x, index) and LL (2x, leveraged) — sorted by multiplier
    const bearAssets: AssetEntry[] = [
      { dataSourceId: 'QQ', targetWeight: 40, contributionWeight: 0, pledgeRatio: 0.6 },
      { dataSourceId: 'LL', targetWeight: 30, contributionWeight: 0, pledgeRatio: 0.6 },
    ]
    const bearConfig: ProfileConfig = {
      ...baseConfig,
      annualExpenseAmount: 25000, // target cash = 25000*15 = 375000
    }

    // Dec 2000 state after dot-com crash
    const qqPrice = 58.38
    const llPrice = 5.09
    const qqShares = 3652.97
    const llShares = 16759.78
    const cashBal = 307841 // below 375k target

    const state = {
      ...empty(),
      shares: { QQ: qqShares, LL: llShares },
      cashBalance: cashBal,
      // startLevVal = high (set in Jan 2000), current LL value is much lower => negative profit (bear)
      strategyMemory: { startLevVal: 300000, yearInflow: 0, currentYear: 2000 },
    }

    const result = strategyFlexible2(
      state,
      ctx('2000-12-01', { QQ: qqPrice, LL: llPrice }, 9, { QQ: 1, LL: 2 }),
      bearAssets,
      bearConfig,
    )

    // 2% of total portfolio = 0.02 * (307841 + 3652.97*58.38 + 16759.78*5.09)
    const totalVal = cashBal + qqShares * qqPrice + llShares * llPrice
    const expectedTransfer = totalVal * 0.02

    // QQ sold, LL bought, cash roughly unchanged
    expect(result.shares['QQ']).toBeLessThan(qqShares)
    expect(result.shares['LL']).toBeGreaterThan(llShares)
    expect(result.shares['QQ']).toBeCloseTo(qqShares - expectedTransfer / qqPrice, 0)
    expect(result.shares['LL']).toBeCloseTo(llShares + expectedTransfer / llPrice, 0)
    expect(result.cashBalance).toBeCloseTo(cashBal, -2)
    expect(result.strategyMemory.lastAction).toMatch(/Defensive: QQ->LL/)
  })

  it('harvests leveraged profit to cash when cash inadequate and profit positive', () => {
    // When cash is below target but leveraged asset has positive profit:
    // sell 1/3 of profit from leveraged -> cash
    const state = {
      ...empty(),
      shares: { A: 500, B: 500 },
      cashBalance: 5000, // below target 30000
      strategyMemory: { startLevVal: 25000, yearInflow: 0, currentYear: 2020 },
    }
    // B is leveraged (same multiplier, comes second in sort)
    // B value = 500*100 = 50000, profit = 50000 - 25000 = 25000
    // Sell 1/3 = 8333 -> shares: 500 - 83.33 = 416.67
    const result = strategyFlexible2(
      state,
      ctx('2020-12-01', { A: 100, B: 100 }, 11),
      testAssets,
      baseConfig,
    )

    expect(result.shares['B']).toBeCloseTo(500 - 25000 / 3 / 100, 0)
    expect(result.cashBalance).toBeGreaterThan(5000)
    expect(result.strategyMemory.lastAction).toMatch(/Harvest Cash/)
  })

  it('aggressively buys index with leveraged profit when cash adequate', () => {
    // When cash adequate and profit positive:
    // sell 1/3 of leveraged profit -> buy index
    const state = {
      ...empty(),
      shares: { A: 400, B: 600 },
      cashBalance: 50000, // above target 30000
      strategyMemory: { startLevVal: 40000, yearInflow: 0, currentYear: 2020 },
    }
    // profit = B(600*100=60000) - 40000 = 20000
    // sell 1/3 = 6666 from B -> buy A
    // B: 600 - 66.66 = 533.33
    // A: 400 + 6666/100 = 466.66
    const result = strategyFlexible2(
      state,
      ctx('2020-12-01', { A: 100, B: 100 }, 11),
      testAssets,
      baseConfig,
    )

    expect(result.shares['B']).toBeLessThan(600)
    expect(result.shares['A']).toBeGreaterThan(400)
    expect(result.cashBalance).toBeCloseTo(50000) // unchanged (sell= buy)
    expect(result.strategyMemory.lastAction).toMatch(/Aggressive: Profit to/)
  })

  it('buys dip with cash when cash adequate and profit negative', () => {
    // When cash adequate and profit negative:
    // buy 2% of total portfolio of leveraged with cash
    const state = {
      ...empty(),
      shares: { A: 500, B: 500 },
      cashBalance: 50000, // above target 30000
      strategyMemory: { startLevVal: 80000, yearInflow: 0, currentYear: 2020 },
    }
    // profit = B(500*100=50000) - 80000 = -30000 (negative = dip)
    // totalVal = 50000 + 50000 + 50000 = 150000
    // 2% = 3000, buy B: 3000/100 = 30 shares
    const result = strategyFlexible2(
      state,
      ctx('2020-12-01', { A: 100, B: 100 }, 11),
      testAssets,
      baseConfig,
    )

    expect(result.shares['B']).toBe(530)
    expect(result.cashBalance).toBeCloseTo(50000 - 3000, -2)
    expect(result.strategyMemory.lastAction).toMatch(/Buy Dip/)
  })
})
