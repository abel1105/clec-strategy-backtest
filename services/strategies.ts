import { PortfolioState, MonthlyContext, AssetEntry, StrategyFunction, ProfileConfig, StrategyType } from '../types'

interface CashAdequacyResult {
  isAdequate: boolean
  shortfall: number
  targetCash: number
}

interface StrategyMemory {
  currentYear?: number
  lastAction?: string
}

const checkCashAdequacy = (state: PortfolioState, config: ProfileConfig): CashAdequacyResult => {
  const annualExpense = config.annualExpenseAmount ?? config.initialCapital * 0.02
  const coverageYears = config.cashCoverageYears ?? 15
  const targetCash = annualExpense * coverageYears
  return {
    isAdequate: state.cashBalance >= targetCash,
    shortfall: Math.max(0, targetCash - state.cashBalance),
    targetCash,
  }
}

export const strategyNoRebalance: StrategyFunction = (state, ctx, assets, config) => {
  const nextState = { ...state, shares: { ...state.shares }, date: ctx.date }
  const currentMonth = parseInt(ctx.date.substring(5, 7))

  if (ctx.monthIndex === 0) {
    nextState.cashBalance = config.initialCapital
    for (const asset of assets) {
      const price = ctx.prices[asset.dataSourceId]
      if (!price || price <= 0) continue
      const amount = config.initialCapital * (asset.targetWeight / 100)
      nextState.shares[asset.dataSourceId] = (nextState.shares[asset.dataSourceId] || 0) + amount / price
      nextState.cashBalance -= amount
    }
    return nextState
  }

  let isContributionMonth = false
  if (config.contributionIntervalMonths === 12) {
    isContributionMonth = currentMonth === (config.yearlyContributionMonth || 12)
  } else {
    isContributionMonth = ctx.monthIndex % config.contributionIntervalMonths === 0
  }

  if (isContributionMonth) {
    for (const asset of assets) {
      const price = ctx.prices[asset.dataSourceId]
      if (!price || price <= 0) continue
      const portion = config.contributionAmount * (asset.contributionWeight / 100)
      if (portion > 0) {
        nextState.shares[asset.dataSourceId] = (nextState.shares[asset.dataSourceId] || 0) + portion / price
      }
    }
  }

  return nextState
}

export const strategyRebalance: StrategyFunction = (state, ctx, assets, config) => {
  const isFirstMonth = ctx.monthIndex === 0
  const nextState = strategyNoRebalance(state, ctx, assets, config)
  const monthIdx = parseInt(ctx.date.substring(5, 7)) - 1

  if (monthIdx === 0 && !isFirstMonth) {
    let totalVal = nextState.cashBalance
    for (const asset of assets) {
      totalVal += (nextState.shares[asset.dataSourceId] || 0) * (ctx.prices[asset.dataSourceId] || 0)
    }
    for (const asset of assets) {
      const price = ctx.prices[asset.dataSourceId]
      if (!price || price <= 0) continue
      nextState.shares[asset.dataSourceId] = totalVal * (asset.targetWeight / 100) / price
      nextState.cashBalance = totalVal * (100 - assets.reduce((s, a) => s + a.targetWeight, 0)) / 100
    }
  }

  return nextState
}

export const strategySmart: StrategyFunction = (state, ctx, assets, config) => {
  const memory = { ...(state.strategyMemory as unknown as StrategyMemory) }
  const currentYear = parseInt(ctx.date.substring(0, 4))
  if (ctx.monthIndex === 0 || memory.currentYear !== currentYear) {
    memory.currentYear = currentYear
  }
  const nextState = strategyNoRebalance(state, ctx, assets, config)
  if (parseInt(ctx.date.substring(5, 7)) - 1 === 11 && assets.length >= 2) {
    const vals = assets.map((a) => ({ id: a.dataSourceId, val: (nextState.shares[a.dataSourceId] || 0) * (ctx.prices[a.dataSourceId] || 0) }))
    vals.sort((a, b) => b.val - a.val)
    const best = vals[0]
    const worst = vals[vals.length - 1]
    const transfer = best.val * 0.02
    const worstPrice = ctx.prices[worst.id] || 1
    const bestPrice = ctx.prices[best.id] || 1
    const sharesToSell = Math.min(transfer / worstPrice, nextState.shares[worst.id] || 0)
    if (sharesToSell > 0.001) {
      nextState.shares[worst.id] = (nextState.shares[worst.id] || 0) - sharesToSell
      nextState.shares[best.id] = (nextState.shares[best.id] || 0) + (sharesToSell * worstPrice) / bestPrice
      memory.lastAction = `Tilt ${worst.id} -> ${best.id}`
    }
  }
  nextState.strategyMemory = memory
  return nextState
}

export const strategyFlexible1: StrategyFunction = (state, ctx, assets, config) => {
  const memory = { ...(state.strategyMemory as unknown as StrategyMemory) }
  const nextState = strategyNoRebalance(state, ctx, assets, config)
  if (parseInt(ctx.date.substring(5, 7)) - 1 === 11) {
    const { isAdequate, shortfall } = checkCashAdequacy(nextState, config)
    if (!isAdequate && shortfall > 0) {
      let totalVal = 0
      const vals: Record<string, number> = {}
      for (const a of assets) {
        const v = (nextState.shares[a.dataSourceId] || 0) * (ctx.prices[a.dataSourceId] || 0)
        vals[a.dataSourceId] = v
        totalVal += v
      }
      if (totalVal > 0) {
        for (const a of assets) {
          const portion = (vals[a.dataSourceId] || 0) / totalVal
          const sellAmount = shortfall * portion
          const price = ctx.prices[a.dataSourceId] || 1
          const toSell = Math.min(sellAmount / price, nextState.shares[a.dataSourceId] || 0)
          if (toSell > 0.001) {
            nextState.shares[a.dataSourceId] = (nextState.shares[a.dataSourceId] || 0) - toSell
            nextState.cashBalance += toSell * price
          }
        }
      }
      memory.lastAction = 'Flex1: Sell to Cash'
    } else if (isAdequate && nextState.cashBalance > 0) {
      const totalW = assets.reduce((s, a) => s + a.targetWeight, 0)
      for (const a of assets) {
        const price = ctx.prices[a.dataSourceId]
        if (!price || price <= 0) continue
        const invest = nextState.cashBalance * (a.targetWeight / totalW)
        nextState.shares[a.dataSourceId] = (nextState.shares[a.dataSourceId] || 0) + invest / price
      }
      nextState.cashBalance = 0
      memory.lastAction = 'Flex1: Invest Cash'
    }
  }
  nextState.strategyMemory = memory
  return nextState
}

export const strategyFlexible2: StrategyFunction = (state, ctx, assets, config) => {
  const memory = { ...(state.strategyMemory as unknown as StrategyMemory) }
  const nextState = strategyNoRebalance(state, ctx, assets, config)
  if (parseInt(ctx.date.substring(5, 7)) - 1 === 11) {
    const { isAdequate, shortfall } = checkCashAdequacy(nextState, config)
    if (!isAdequate && shortfall > 0) {
      let totalVal = 0
      const vals: Record<string, number> = {}
      for (const a of assets) {
        const v = (nextState.shares[a.dataSourceId] || 0) * (ctx.prices[a.dataSourceId] || 0)
        vals[a.dataSourceId] = v
        totalVal += v
      }
      if (totalVal > 0) {
        for (const a of assets) {
          const portion = (vals[a.dataSourceId] || 0) / totalVal
          const sellAmount = shortfall * portion
          const price = ctx.prices[a.dataSourceId] || 1
          const toSell = Math.min(sellAmount / price, nextState.shares[a.dataSourceId] || 0)
          if (toSell > 0.001) {
            nextState.shares[a.dataSourceId] = (nextState.shares[a.dataSourceId] || 0) - toSell
            nextState.cashBalance += toSell * price
          }
        }
      }
      memory.lastAction = 'Flex2: Sell to Cash'
    } else if (isAdequate && nextState.cashBalance > 0) {
      let bestId = ''
      let bestVal = -1
      for (const a of assets) {
        const v = (nextState.shares[a.dataSourceId] || 0) * (ctx.prices[a.dataSourceId] || 0)
        if (v > bestVal) { bestVal = v; bestId = a.dataSourceId }
      }
      if (bestId) {
        const price = ctx.prices[bestId] || 1
        nextState.shares[bestId] = (nextState.shares[bestId] || 0) + nextState.cashBalance / price
        nextState.cashBalance = 0
        memory.lastAction = `Flex2: Aggressive to ${bestId}`
      }
    }
  }
  nextState.strategyMemory = memory
  return nextState
}

export const getStrategyByType = (type: StrategyType): StrategyFunction => {
  switch (type) {
    case 'NO_REBALANCE':
      return strategyNoRebalance
    case 'REBALANCE':
      return strategyRebalance
    case 'SMART':
      return strategySmart
    case 'FLEXIBLE_1':
      return strategyFlexible1
    case 'FLEXIBLE_2':
      return strategyFlexible2
    default:
      return strategyNoRebalance
  }
}
