import {
  PortfolioState,
  SimulationResult,
  StrategyFunction,
  AssetEntry,
  MonthlyContext,
  ProfileConfig,
  FinancialEvent,
  AssetDataRow,
} from '../types'
import {
  calculateCAGR,
  calculateIRR,
  calculateMaxDrawdown,
  calculateSharpeRatio,
  calculateMaxRecoveryTime,
  calculateAnnualReturns,
  calculateRealValue,
  calculateUlcerIndex,
} from './financeMath'

const INTEREST_DISPLAY_THRESHOLD = 0.01
const TRADE_EPSILON = 0.001
const DEPOSIT_THRESHOLD = 1.0
const NEGATIVE_CASH_LIMIT = -0.01

export const runBacktest = (
  allAssetData: Record<string, AssetDataRow[]>,
  multipliers: Record<string, number>,
  strategyFunc: StrategyFunction,
  assets: AssetEntry[],
  config: ProfileConfig,
  strategyName: string,
  color: string = '#000000',
): SimulationResult => {
  const history: PortfolioState[] = []

  const assetIds = assets.map((a) => a.dataSourceId)

  // Validate all data sources exist
  for (const id of assetIds) {
    if (!allAssetData[id]) {
      throw new Error(`Data source "${id}" not found in provided asset data`)
    }
  }

  // Inner join on months: months present in ALL selected assets
  const monthSets = assetIds.map((id) => new Set(allAssetData[id].map((row) => row.date)))
  const commonMonths: string[] = monthSets.length > 0
    ? [...monthSets.reduce(
        (acc, set) => new Set([...acc].filter((m) => set.has(m))),
      )]
    : []
  commonMonths.sort()

  if (commonMonths.length === 0) {
    return {
      strategyName,
      color,
      isLeveraged: config.leverage.enabled,
      assetNames: assetIds,
      history: [],
      isBankrupt: false,
      bankruptcyDate: null,
      metrics: {
        finalBalance: 0,
        cagr: 0,
        maxDrawdown: 0,
        sharpeRatio: 0,
        irr: 0,
        realFinalBalance: 0,
        worstYearReturn: 0,
        maxRecoveryMonths: 0,
        calmarRatio: 0,
        painIndex: 0,
        inflationRate: config.leverage.inflationRate,
      },
    }
  }

  let currentState: PortfolioState = {
    date: commonMonths[0],
    shares: {},
    cashBalance: config.initialCapital,
    debtBalance: 0,
    accruedInterest: 0,
    totalValue: 0,
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

  for (let monthIdx = 0; monthIdx < commonMonths.length; monthIdx++) {
    const date = commonMonths[monthIdx]
    const monthEvents: FinancialEvent[] = []

    // Emit initial capital as deposit on first month
    if (monthIdx === 0 && config.initialCapital > 0) {
      monthEvents.push({
        type: 'DEPOSIT',
        amount: config.initialCapital,
        description: 'Recurring Contribution / Deposit',
      })
    }

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
    for (const id of assetIds) {
      const row = allAssetData[id].find((r) => r.date === date)
      if (row) {
        prices[id] = row.close
        lows[id] = row.low
      }
    }
    const ctx: MonthlyContext = {
      date,
      prices,
      lows,
      multipliers,
      monthIndex: monthIdx,
    }

    // 1. Banking Logic: Interest Accrual & Debt Service
    if (monthIdx > 0) {
      const interestEarned = currentState.cashBalance * monthlyCashYieldRate
      if (interestEarned > INTEREST_DISPLAY_THRESHOLD) {
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

      if (interestDue > 0) {
        const interestType = leverage.interestType || 'CAPITALIZED'

        if (interestType === 'MONTHLY') {
          if (currentState.cashBalance >= interestDue) {
            currentState.cashBalance -= interestDue
            monthEvents.push({
              type: 'INTEREST_EXP',
              amount: -interestDue,
              description: 'Loan Interest Paid by Cash',
            })
          } else {
            const paidByCash = currentState.cashBalance
            const shortfall = interestDue - currentState.cashBalance

            if (paidByCash > 0) {
              monthEvents.push({
                type: 'INTEREST_EXP',
                amount: -paidByCash,
                description: 'Loan Interest Paid by Cash (Partial)',
              })
            }

            currentState.cashBalance = 0
            currentState.debtBalance += shortfall
            monthEvents.push({
              type: 'DEBT_INC',
              amount: shortfall,
              description: 'Unpaid Interest Capitalized to Debt',
            })
          }
        } else if (interestType === 'MATURITY') {
          currentState.accruedInterest += interestDue
          monthEvents.push({
            type: 'INTEREST_EXP',
            amount: 0,
            description: 'Interest Accrued (Not Paid)',
          })
        } else if (interestType === 'CAPITALIZED') {
          currentState.debtBalance += interestDue
          monthEvents.push({
            type: 'DEBT_INC',
            amount: interestDue,
            description: 'Interest Capitalized to Debt (Compound)',
          })
        }
      }
    }

    // 2. Execute Investment Strategy
    const cashBeforeStrat = currentState.cashBalance
    const sharesBeforeStrat = { ...currentState.shares }

    currentState = strategyFunc(currentState, ctx, assets, config)

    // Detect Trades
    for (const entry of assets) {
      const id = entry.dataSourceId
      const before = sharesBeforeStrat[id] || 0
      const after = currentState.shares[id] || 0
      const diff = after - before
      const price = prices[id]

      if (Math.abs(diff) > TRADE_EPSILON && price) {
        const cost = diff * price
        monthEvents.push({
          type: 'TRADE',
          amount: -cost,
          description: `${diff > 0 ? 'Buy' : 'Sell'} ${Math.abs(diff).toFixed(2)} ${id} @ ${price.toFixed(2)}`,
        })
      }
    }

    // Detect DCA Deposit
    let netTradeCost = 0
    for (const entry of assets) {
      const id = entry.dataSourceId
      const before = sharesBeforeStrat[id] || 0
      const after = currentState.shares[id] || 0
      const diff = after - before
      const price = prices[id]
      if (price) {
        netTradeCost += diff * price
      }
    }
    const impliedCashFlow = currentState.cashBalance - cashBeforeStrat + netTradeCost

    if (impliedCashFlow > DEPOSIT_THRESHOLD) {
      monthEvents.push({
        type: 'DEPOSIT',
        amount: impliedCashFlow,
        description: 'Recurring Contribution / Deposit',
      })
    }

    // 3. Leverage / Pledging Logic
    if (leverage.enabled) {
      const currentMonth = parseInt(date.substring(5, 7)) - 1

      // Use LOW prices for conservative valuation
      let totalAssetValue = currentState.cashBalance
      let effectiveCollateral = currentState.cashBalance * leverage.cashPledgeRatio

      for (const entry of assets) {
        const id = entry.dataSourceId
        const lowPrice = lows[id] || 0
        const shares = currentState.shares[id] || 0
        const assetVal = shares * lowPrice
        totalAssetValue += assetVal
        effectiveCollateral += assetVal * entry.pledgeRatio
      }

      // Withdrawal Logic
      const isWithdrawalTiming = monthIdx === 0 || currentMonth === 0

      if (isWithdrawalTiming && effectiveCollateral > 0) {
        let borrowAmount = 0
        if (leverage.withdrawType === 'PERCENT') {
          borrowAmount = totalAssetValue * (leverage.withdrawValue / 100)
        } else {
          const yearsPassed = Math.floor(monthIdx / 12)
          const inflationFactor = Math.pow(
            1 + (leverage.inflationRate || 0) / 100,
            yearsPassed,
          )
          borrowAmount = leverage.withdrawValue * inflationFactor
        }

        if (borrowAmount > 0) {
          currentState.debtBalance += borrowAmount
          monthEvents.push({
            type: 'WITHDRAW',
            amount: -borrowAmount,
            description:
              monthIdx === 0
                ? 'Initial Loan Withdrawal'
                : 'Annual Living Expense Withdrawal',
          })
          monthEvents.push({
            type: 'DEBT_INC',
            amount: borrowAmount,
            description: 'Borrowing increased for withdrawal',
          })
        }
      }

      // Solvency Check
      if (effectiveCollateral > 0) {
        const totalLiability = currentState.debtBalance + currentState.accruedInterest
        const ltvDenominator =
          leverage.ltvBasis === 'COLLATERAL' ? effectiveCollateral : totalAssetValue
        currentState.ltv =
          ltvDenominator > 0 ? (totalLiability / ltvDenominator) * 100 : 9999
      } else {
        currentState.ltv =
          currentState.debtBalance + currentState.accruedInterest > 0 ? 9999 : 0
      }

      if (currentState.ltv > leverage.maxLtv) {
        isBankrupt = true
        bankruptcyDate = date
        currentState.totalValue = 0
        monthEvents.push({
          type: 'INFO',
          description: `!!! MARGIN CALL / LIQUIDATION (LTV: ${currentState.ltv.toFixed(1)}%) !!!`,
        })
      }
    }

    // Negative Cash Bankruptcy
    if (!isBankrupt && currentState.cashBalance < NEGATIVE_CASH_LIMIT) {
      isBankrupt = true
      bankruptcyDate = date
      currentState.totalValue = 0
      monthEvents.push({
        type: 'INFO',
        description: `!!! BANKRUPTCY: Negative Cash Balance (${currentState.cashBalance.toFixed(2)}) !!!`,
      })
    }

    // 4. Update Net Value & Risk Metrics
    if (!isBankrupt) {
      let totalAssetsVal = currentState.cashBalance
      for (const entry of assets) {
        const id = entry.dataSourceId
        const lowPrice = lows[id] || 0
        totalAssetsVal += (currentState.shares[id] || 0) * lowPrice
      }
      currentState.totalValue = Math.max(
        0,
        totalAssetsVal - currentState.debtBalance - currentState.accruedInterest,
      )

      // Calculate Beta
      if (currentState.totalValue > 0) {
        let weightedBeta = 0
        for (const entry of assets) {
          const id = entry.dataSourceId
          const lowPrice = lows[id] || 0
          const assetVal = (currentState.shares[id] || 0) * lowPrice
          weightedBeta += assetVal * (multipliers[id] || 1)
        }
        currentState.beta = weightedBeta / currentState.totalValue
      } else {
        currentState.beta = 0
      }
    }

    // 5. Record History
    history.push({
      ...currentState,
      shares: { ...currentState.shares },
      strategyMemory: { ...currentState.strategyMemory },
      events: monthEvents,
    })
  }

  // Calculate Metrics
  const years = commonMonths.length / 12
  const finalState = history[history.length - 1]
  const initialInv = config.initialCapital

  const cagr = isBankrupt
    ? -100
    : calculateCAGR(initialInv, finalState.totalValue, years)
  const mdd = calculateMaxDrawdown(history)
  const irr = isBankrupt
    ? -100
    : calculateIRR(
        initialInv,
        config.contributionAmount,
        config.contributionIntervalMonths,
        finalState.totalValue,
        commonMonths.length,
      )

  const metrics = {
    finalBalance: finalState.totalValue,
    cagr,
    maxDrawdown: mdd,
    sharpeRatio: calculateSharpeRatio(history, config.cashYieldAnnual),
    irr,
    realFinalBalance: calculateRealValue(
      finalState.totalValue,
      config.leverage.inflationRate || 0,
      years,
    ),
    maxRecoveryMonths: calculateMaxRecoveryTime(history),
    worstYearReturn: Math.min(
      ...calculateAnnualReturns(history).map((r) => r.return),
      0,
    ),
    painIndex: calculateUlcerIndex(history),
    calmarRatio: mdd > 0 ? (isBankrupt ? -100 : irr / mdd) : 0,
    inflationRate: config.leverage.inflationRate,
  }

  return {
    strategyName,
    color,
    isLeveraged: config.leverage.enabled,
    assetNames: assetIds,
    history,
    isBankrupt,
    bankruptcyDate,
    metrics,
  }
}
