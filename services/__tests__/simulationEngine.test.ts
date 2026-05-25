import { describe, it, expect } from 'vitest'
import { runBacktest } from '../simulationEngine'
import {
  PortfolioState,
  MonthlyContext,
  AssetEntry,
  StrategyFunction,
  ProfileConfig,
  AssetDataRow,
} from '../../types'

const strategyNoRebalance: StrategyFunction = (
  state: PortfolioState,
  ctx: MonthlyContext,
  assets: AssetEntry[],
  config: ProfileConfig,
) => {
  let s = { ...state, shares: { ...state.shares } }

  // Deploy initial capital on first month
  if (ctx.monthIndex === 0) {
    const totalCash = s.cashBalance
    for (const asset of assets) {
      const price = ctx.prices[asset.dataSourceId]
      if (!price || price <= 0) continue
      const portion = totalCash * (asset.targetWeight / 100)
      s.shares[asset.dataSourceId] = (s.shares[asset.dataSourceId] || 0) + portion / price
      s.cashBalance -= portion
    }
    return s
  }

  const month = parseInt(ctx.date.substring(5, 7))
  const isContributionMonth =
    config.contributionIntervalMonths === 1 ||
    (config.contributionIntervalMonths === 12 && month === config.yearlyContributionMonth)

  if (!isContributionMonth) return s

  // Contributions are external deposits: add shares without changing cash
  for (const asset of assets) {
    const price = ctx.prices[asset.dataSourceId]
    if (!price || price <= 0) continue
    const portion = config.contributionAmount * (asset.contributionWeight / 100)
    if (portion > 0) {
      s.shares[asset.dataSourceId] = (s.shares[asset.dataSourceId] || 0) + portion / price
    } else if (portion < 0) {
      // Negative contribution: sell shares, add proceeds to cash
      const sellVal = Math.abs(portion)
      const sharesToSell = Math.min(sellVal / price, s.shares[asset.dataSourceId] || 0)
      s.shares[asset.dataSourceId] = (s.shares[asset.dataSourceId] || 0) - sharesToSell
      s.cashBalance += sharesToSell * price
    }
  }
  return s
}

const strategyRebalance: StrategyFunction = (
  state: PortfolioState,
  ctx: MonthlyContext,
  assets: AssetEntry[],
  config: ProfileConfig,
) => {
  let s = strategyNoRebalance(state, ctx, assets, config)

  const currentMonth = parseInt(ctx.date.substring(5, 7)) - 1

  // Rebalance in January (month 0) but not the first month
  if (currentMonth === 0 && ctx.monthIndex > 0) {
    const totalVal =
      s.cashBalance +
      assets.reduce(
        (sum, a) => sum + (s.shares[a.dataSourceId] || 0) * (ctx.prices[a.dataSourceId] || 0),
        0,
      )

    // Use low price for valuation to match engine
    const valPrices = ctx.lows

    s.cashBalance = 0
    s.shares = {}
    for (const asset of assets) {
      const price = valPrices[asset.dataSourceId]
      if (!price || price <= 0) continue
      const portion = totalVal * (asset.targetWeight / 100)
      s.shares[asset.dataSourceId] = portion / price
    }
  }

  return s
}

const testAssets: AssetEntry[] = [
  {
    dataSourceId: 'ASSET_A',
    targetWeight: 60,
    contributionWeight: 60,
    pledgeRatio: 0.7,
    withdrawalRatio: 0,
  },
  {
    dataSourceId: 'ASSET_B',
    targetWeight: 40,
    contributionWeight: 40,
    pledgeRatio: 0.5,
    withdrawalRatio: 0,
  },
]

const baseConfig = (): ProfileConfig => ({
  initialCapital: 10000,
  contributionAmount: 1000,
  contributionIntervalMonths: 1,
  yearlyContributionMonth: 12,
  cashYieldAnnual: 0,
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
  withdrawal: {
    enabled: false,
    type: 'PERCENT',
    value: 4,
    inflationRate: 2,
    sellMethod: 'PROPORTIONAL',
  },
})

const genData = (months: number, priceA = 100, priceB = 100): Record<string, AssetDataRow[]> => {
  const dataA: AssetDataRow[] = []
  const dataB: AssetDataRow[] = []
  for (let i = 0; i < months; i++) {
    const y = 2020 + Math.floor(i / 12)
    const m = (i % 12) + 1
    const d = `${y}-${String(m).padStart(2, '0')}-01`
    dataA.push({ date: d, close: priceA, low: priceA })
    dataB.push({ date: d, close: priceB, low: priceB })
  }
  return { ASSET_A: dataA, ASSET_B: dataB }
}

const defaultMultipliers: Record<string, number> = {
  ASSET_A: 1,
  ASSET_B: 2,
}

describe('simulationEngine - N-Asset', () => {
  describe('DCA Patterns', () => {
    it('should handle positive DCA', () => {
      const config = baseConfig()
      config.initialCapital = 1000
      config.contributionAmount = 100
      const data = genData(3)
      const result = runBacktest(
        data,
        defaultMultipliers,
        strategyNoRebalance,
        testAssets,
        config,
        'Test',
      )
      // Month 0: deploy 1000 → A=6, B=4, cash=0. Value = 1000.
      // Month 1: +100 → A=6.6, B=4.4. Value = 1100.
      // Month 2: +100 → A=7.2, B=4.8. Value = 1200.
      expect(result.history[2].totalValue).toBe(1200)
    })

    it('should handle negative DCA', () => {
      const config = baseConfig()
      config.initialCapital = 1000
      config.contributionAmount = -100
      const data = genData(3)
      const result = runBacktest(
        data,
        defaultMultipliers,
        strategyNoRebalance,
        testAssets,
        config,
        'Test',
      )
      // Month 0: deploy 1000 → A=6, B=4, cash=0.
      // Month 1: sell -60 of A, -40 of B. cash = 100. A=5.4, B=3.6. Value = 1000.
      // Month 2: sell again. A=4.8, B=3.2, cash=200. Value = 1000.
      expect(result.history[2].totalValue).toBe(1000)
    })

    it('should respect spacing', () => {
      const config = baseConfig()
      config.initialCapital = 1000
      config.contributionAmount = 100
      config.contributionIntervalMonths = 12
      config.yearlyContributionMonth = 1

      const data = genData(13)
      const result = runBacktest(
        data,
        defaultMultipliers,
        strategyNoRebalance,
        testAssets,
        config,
        'Test',
      )
      // Month 0 (Jan): deploy 1000. A=6, B=4, cash=0. Value = 1000.
      // Months 1-11: no contribution (interval=12, month != 1).
      //   Value stays at 1000.
      // Month 12 (Jan next year): month=1 → contributes.
      //   A=6.6, B=4.4, cash=0. Value = 1100.
      expect(result.history[11].totalValue).toBe(1000)
      expect(result.history[12].totalValue).toBe(1100)
    })
  })

  describe('Leverage & Withdrawal', () => {
    it('should borrow fixed amount with inflation', () => {
      const config = baseConfig()
      config.contributionAmount = 0
      config.leverage = {
        enabled: true,
        withdrawType: 'FIXED',
        withdrawValue: 1000,
        interestRate: 0,
        inflationRate: 100,
        cashPledgeRatio: 0.95,
        maxLtv: 10,
        interestType: 'CAPITALIZED',
        ltvBasis: 'TOTAL_ASSETS',
      }

      const data = genData(24)
      const result = runBacktest(
        data,
        defaultMultipliers,
        strategyNoRebalance,
        testAssets,
        config,
        'Test',
      )

      // Month 0: borrow 1000. debtBalance = 1000.
      // Month 12: yearsPassed=1. borrow 1000*(1+1)^1 = 2000. debtBalance = 3000.
      expect(result.history[0].debtBalance).toBe(1000)
      expect(result.history[12].debtBalance).toBe(3000)
    })

    it('should borrow percent of assets', () => {
      const config = baseConfig()
      config.initialCapital = 10000
      config.contributionAmount = 0
      config.leverage = {
        enabled: true,
        withdrawType: 'PERCENT',
        withdrawValue: 10,
        interestRate: 0,
        inflationRate: 0,
        cashPledgeRatio: 0.95,
        maxLtv: 10,
        interestType: 'CAPITALIZED',
        ltvBasis: 'TOTAL_ASSETS',
      }

      const data = genData(1)
      const result = runBacktest(
        data,
        defaultMultipliers,
        strategyNoRebalance,
        testAssets,
        config,
        'Test',
      )
      // totalAssetValue = 10000 (cash). Borrow 10% = 1000.
      expect(result.history[0].debtBalance).toBe(1000)
    })
  })

  describe('LTV Basis', () => {
    it('should use TOTAL_ASSETS correctly', () => {
      const config = baseConfig()
      config.initialCapital = 10000
      config.leverage = {
        enabled: true,
        ltvBasis: 'TOTAL_ASSETS',
        withdrawValue: 2000,
        withdrawType: 'FIXED',
        interestRate: 0,
        inflationRate: 0,
        cashPledgeRatio: 0.95,
        maxLtv: 10,
        interestType: 'CAPITALIZED',
      }
      const data = genData(1)
      const result = runBacktest(
        data,
        defaultMultipliers,
        strategyNoRebalance,
        testAssets,
        config,
        'Test',
      )
      // totalAssetValue = 10000 (cash). Debt = 2000. LTV = 2000/10000 * 100 = 20%.
      expect(result.history[0].ltv).toBe(20)
    })

    it('should use COLLATERAL correctly', () => {
      const config = baseConfig()
      config.initialCapital = 10000
      config.contributionAmount = 10000
      config.leverage = {
        enabled: true,
        ltvBasis: 'COLLATERAL',
        withdrawValue: 2000,
        withdrawType: 'FIXED',
        interestRate: 0,
        inflationRate: 0,
        cashPledgeRatio: 0.95,
        maxLtv: 10,
        interestType: 'CAPITALIZED',
      }
      const singleAsset: AssetEntry[] = [
        {
          dataSourceId: 'ASSET_A',
          targetWeight: 100,
          contributionWeight: 100,
          pledgeRatio: 0.5,
        },
      ]
      const data = genData(1)
      const result = runBacktest(
        data,
        { ASSET_A: 1 },
        strategyNoRebalance,
        singleAsset,
        config,
        'Test',
      )
      // Month 0: deploy 10000 → A=100, cash=0.
      // totalAssetValue = 0 + 100*100 = 10000.
      // effectiveCollateral = 0*0.95 + 100*100*0.5 = 5000.
      // Debt = 2000. LTV = 2000/5000 * 100 = 40%.
      expect(result.history[0].ltv).toBe(40)
    })
  })

  describe('Bankruptcy', () => {
    it('should trigger bankruptcy when LTV > maxLtv', () => {
      const config = baseConfig()
      config.initialCapital = 10000
      config.leverage = {
        enabled: true,
        maxLtv: 30,
        withdrawValue: 4000,
        withdrawType: 'FIXED',
        interestRate: 0,
        inflationRate: 0,
        cashPledgeRatio: 0.95,
        interestType: 'CAPITALIZED',
        ltvBasis: 'TOTAL_ASSETS',
      }
      const data = genData(1)
      const result = runBacktest(
        data,
        defaultMultipliers,
        strategyNoRebalance,
        testAssets,
        config,
        'Test',
      )
      // totalAssetValue = 10000. Debt = 4000. LTV = 40% > 30%.
      expect(result.isBankrupt).toBe(true)
      expect(result.metrics.finalBalance).toBe(0)
    })
  })

  describe('Interest Modes', () => {
    it('MATURITY (Simple)', () => {
      const config = baseConfig()
      config.contributionAmount = 0
      config.leverage = {
        enabled: true,
        interestRate: 120,
        interestType: 'MATURITY',
        withdrawType: 'FIXED',
        withdrawValue: 1000,
        cashPledgeRatio: 0.95,
        maxLtv: 10,
        inflationRate: 0,
        ltvBasis: 'TOTAL_ASSETS',
      }

      const data = genData(3)
      const result = runBacktest(
        data,
        defaultMultipliers,
        strategyNoRebalance,
        testAssets,
        config,
        'Test',
      )
      // Month 0: debt = 1000.
      // Month 1: monthlyLoanRate = (1+1.2)^(1/12)-1 ≈ 0.0676.
      // interestDue = 1000 * 0.0676 = 67.6.
      // MATURITY: accruedInterest += 67.6. debtBalance stays 1000.
      expect(result.history[1].accruedInterest).toBeGreaterThan(1)
      expect(result.history[1].debtBalance).toBe(1000)
    })

    it('CAPITALIZED (Compound)', () => {
      const config = baseConfig()
      config.contributionAmount = 0
      config.leverage = {
        enabled: true,
        interestRate: 120,
        interestType: 'CAPITALIZED',
        withdrawType: 'FIXED',
        withdrawValue: 1000,
        cashPledgeRatio: 0.95,
        maxLtv: 10,
        inflationRate: 0,
        ltvBasis: 'TOTAL_ASSETS',
      }

      const data = genData(3)
      const result = runBacktest(
        data,
        defaultMultipliers,
        strategyNoRebalance,
        testAssets,
        config,
        'Test',
      )
      // Month 0: debt = 1000.
      // Month 1: interestDue. CAPITALIZED: debtBalance += interestDue. debt > 1000.
      expect(result.history[1].debtBalance).toBeGreaterThan(1000)
    })

    it('MONTHLY (Pay from cash)', () => {
      const config = baseConfig()
      config.initialCapital = 10000
      config.contributionAmount = 0
      config.leverage = {
        enabled: true,
        interestRate: 120,
        interestType: 'MONTHLY',
        withdrawType: 'FIXED',
        withdrawValue: 1000,
        cashPledgeRatio: 0.95,
        maxLtv: 10,
        inflationRate: 0,
        ltvBasis: 'TOTAL_ASSETS',
      }

      const data = genData(3)
      const result = runBacktest(
        data,
        defaultMultipliers,
        strategyNoRebalance,
        testAssets,
        config,
        'Test',
      )
      // Month 0: debt = 1000. cash = 10000 (contributionAmount=0, no trades).
      // Month 1: interestDue. MONTHLY: pay from cash. cash < cashBefore.
      expect(result.history[1].cashBalance).toBeLessThan(10000)
    })
  })

  describe('Strategies', () => {
    it('Yearly Rebalance', () => {
      const config = baseConfig()
      config.initialCapital = 10000
      config.contributionAmount = 0
      const data = genData(14, 100, 100)
      // Skew at month 1
      data.ASSET_A[1].close = 200
      data.ASSET_A[1].low = 200

      const result = runBacktest(
        data,
        defaultMultipliers,
        strategyRebalance,
        testAssets,
        config,
        'Test',
      )
      // Month 0: deploy 10000 → A=60, B=40, cash=0. Value = 60*100 + 40*100 = 10000.
      // Month 1: A price spikes to 200. strategyNoRebalance copies shares (no contribution).
      //   A val = 60*200 = 12000, B val = 40*100 = 4000. Total = 16000.
      // Month 12 (Jan next year): rebalance. A target = 60% of 16000 = 9600 @ 100 = 96 shares.
      //   B target = 40% of 16000 = 6400 @ 100 = 64 shares. cash = 0.
      //   Ratio = 9600 / (9600 + 6400) = 0.6.
      const state = result.history[12]
      const aVal = state.shares['ASSET_A'] * 100
      const bVal = state.shares['ASSET_B'] * 100
      expect(aVal / (aVal + bVal)).toBeCloseTo(0.6, 2)
    })
  })

  describe('Withdrawal', () => {
    it('should deduct PERCENT withdrawal from initial capital before strategy', () => {
      const config = baseConfig()
      config.initialCapital = 10000
      config.contributionAmount = 0
      config.withdrawal = {
        enabled: true,
        type: 'PERCENT',
        value: 10,
        inflationRate: 0,
        sellMethod: 'PROPORTIONAL',
      }
      const data = genData(1)
      const result = runBacktest(data, defaultMultipliers, strategyNoRebalance, testAssets, config, 'Test')
      // Month 0: initialCapital=10000. Withdrawal 10% = 1000 taken first.
      // cash=9000 left for strategy to deploy: A gets 5400@100=54, B gets 3600@100=36.
      expect(result.history[0].cashBalance).toBe(0)
      expect(result.history[0].shares['ASSET_A']).toBeCloseTo(54, 0)
      expect(result.history[0].shares['ASSET_B']).toBeCloseTo(36, 0)
      expect(result.isBankrupt).toBe(false)
    })

    it('should deduct FIXED withdrawal from cash when sufficient', () => {
      const config = baseConfig()
      config.initialCapital = 10000
      config.contributionAmount = 0
      config.withdrawal = {
        enabled: true,
        type: 'FIXED',
        value: 500,
        inflationRate: 0,
        sellMethod: 'PROPORTIONAL',
      }
      const noopStrategy: StrategyFunction = (state, _ctx, _assets, _config) => state
      const data = genData(1)
      const result = runBacktest(data, defaultMultipliers, noopStrategy, testAssets, config, 'Test')
      // Month 0: cash=10000. Withdrawal FIXED 500. cash=9500.
      expect(result.history[0].cashBalance).toBe(9500)
    })

    it('should sell assets via PRIORITY method on annual withdrawal', () => {
      const config = baseConfig()
      config.initialCapital = 2000
      config.contributionAmount = 0
      config.withdrawal = {
        enabled: true,
        type: 'FIXED',
        value: 600,
        inflationRate: 0,
        sellMethod: 'PRIORITY',
      }
      // Build shares over 12 months, then withdrawal triggers in January (month 12)
      const buyAndHold: StrategyFunction = (state, ctx, _assets, _config) => {
        if (ctx.monthIndex === 0) {
          // Deploy all cash: 10 shares each at price 100
          return { ...state, shares: { ASSET_A: 10, ASSET_B: 10 }, cashBalance: 0 }
        }
        return state
      }
      const customAssets: AssetEntry[] = [
        { dataSourceId: 'ASSET_A', targetWeight: 60, contributionWeight: 60, pledgeRatio: 0.7, withdrawalRatio: 0.8 },
        { dataSourceId: 'ASSET_B', targetWeight: 40, contributionWeight: 40, pledgeRatio: 0.5, withdrawalRatio: 0.3 },
      ]
      const data = genData(13, 100, 100)
      const result = runBacktest(data, defaultMultipliers, buyAndHold, customAssets, config, 'Test')
      // Month 12 (January, year 2): cash=0, A=10, B=10.
      // Withdrawal FIXED 600. cashDeducted=0, remaining=600.
      // A: maxSellValue=10*100*0.8=800, B: maxSellValue=10*100*0.3=300.
      // PRIORITY: A(0.8) > B(0.3). Sell A: min(800,600)=600 → 6 shares. remaining=0.
      expect(result.history[12].shares['ASSET_A']).toBeCloseTo(4, 1)
      expect(result.history[12].shares['ASSET_B']).toBeCloseTo(10, 1)
      expect(result.isBankrupt).toBe(false)
    })

    it('should sell assets via PROPORTIONAL method on annual withdrawal', () => {
      const config = baseConfig()
      config.initialCapital = 2000
      config.contributionAmount = 0
      config.withdrawal = {
        enabled: true,
        type: 'FIXED',
        value: 600,
        inflationRate: 0,
        sellMethod: 'PROPORTIONAL',
      }
      const buyAndHold: StrategyFunction = (state, ctx, _assets, _config) => {
        if (ctx.monthIndex === 0) {
          return { ...state, shares: { ASSET_A: 10, ASSET_B: 10 }, cashBalance: 0 }
        }
        return state
      }
      const customAssets: AssetEntry[] = [
        { dataSourceId: 'ASSET_A', targetWeight: 60, contributionWeight: 60, pledgeRatio: 0.7, withdrawalRatio: 0.8 },
        { dataSourceId: 'ASSET_B', targetWeight: 40, contributionWeight: 40, pledgeRatio: 0.5, withdrawalRatio: 0.3 },
      ]
      const data = genData(13, 100, 100)
      const result = runBacktest(data, defaultMultipliers, buyAndHold, customAssets, config, 'Test')
      // Month 12: A=maxSellValue=800, B=maxSellValue=300, totalSellable=1100.
      // PROPORTIONAL: A share = 600*(800/1100)=436.36, B share = 600*(300/1100)=163.64
      expect(result.history[12].shares['ASSET_A']).toBeCloseTo(5.636, 2)
      expect(result.history[12].shares['ASSET_B']).toBeCloseTo(8.364, 2)
      expect(result.isBankrupt).toBe(false)
    })

    it('should trigger bankruptcy when withdrawal exceeds sellable assets', () => {
      const config = baseConfig()
      config.initialCapital = 2000
      config.contributionAmount = 0
      config.withdrawal = {
        enabled: true,
        type: 'FIXED',
        value: 5000,
        inflationRate: 0,
        sellMethod: 'PRIORITY',
      }
      const buyAndHold: StrategyFunction = (state, ctx, _assets, _config) => {
        if (ctx.monthIndex === 0) {
          return { ...state, shares: { ASSET_A: 10, ASSET_B: 10 }, cashBalance: 0 }
        }
        return state
      }
      const customAssets: AssetEntry[] = [
        { dataSourceId: 'ASSET_A', targetWeight: 60, contributionWeight: 60, pledgeRatio: 0.7, withdrawalRatio: 0.1 },
        { dataSourceId: 'ASSET_B', targetWeight: 40, contributionWeight: 40, pledgeRatio: 0.5, withdrawalRatio: 0.1 },
      ]
      const data = genData(13, 100, 100)
      const result = runBacktest(data, defaultMultipliers, buyAndHold, customAssets, config, 'Test')
      // Month 12: each has maxSellValue=100, total=200. Withdrawal 5000 > 200 → bankruptcy.
      expect(result.isBankrupt).toBe(true)
    })

    it('should withdraw and leverage operate independently', () => {
      const config = baseConfig()
      config.initialCapital = 3000
      config.contributionAmount = 0
      config.leverage = {
        enabled: true,
        interestRate: 0,
        cashPledgeRatio: 0.95,
        maxLtv: 200,
        withdrawType: 'FIXED',
        withdrawValue: 2000,
        inflationRate: 0,
        interestType: 'CAPITALIZED',
        ltvBasis: 'TOTAL_ASSETS',
      }
      config.withdrawal = {
        enabled: true,
        type: 'FIXED',
        value: 1000,
        inflationRate: 0,
        sellMethod: 'PROPORTIONAL',
      }
      const noopStrategy: StrategyFunction = (state, _ctx, _assets, _config) => state
      const data = genData(1, 100, 100)
      const result = runBacktest(data, defaultMultipliers, noopStrategy, testAssets, config, 'Test')
      // Withdrawal first: FIXED 1000 → cash=2000
      // Leverage: FIXED 2000 → debtBalance=2000
      expect(result.history[0].cashBalance).toBe(2000)
      expect(result.history[0].debtBalance).toBe(2000)
      expect(result.isBankrupt).toBe(false)
    })
  })
})
