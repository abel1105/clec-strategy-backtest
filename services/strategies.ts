import { PortfolioState, StrategyFunction, ProfileConfig, StrategyType } from '../types'

interface CashAdequacyResult {
  isAdequate: boolean
  shortfall: number
  targetCash: number
}

interface StrategyMemory {
  currentYear?: number
  lastAction?: string
  startLevVal?: number
  yearInflow?: number
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

  let isContributionMonth = false
  if (config.contributionIntervalMonths === 12) {
    isContributionMonth = currentMonth === (config.yearlyContributionMonth || 12)
  } else {
    isContributionMonth = ctx.monthIndex % config.contributionIntervalMonths === 0
  }

  if (ctx.monthIndex === 0) {
    const availableCash = nextState.cashBalance
    for (const asset of assets) {
      const price = ctx.prices[asset.dataSourceId]
      if (!price || price <= 0) continue
      const amount = availableCash * (asset.targetWeight / 100)
      nextState.shares[asset.dataSourceId] = (nextState.shares[asset.dataSourceId] || 0) + amount / price
      nextState.cashBalance -= amount
    }
    return nextState
  }

  if (isContributionMonth) {
    const cashChange = config.contributionAmount
    if (cashChange > 0) {
      for (const asset of assets) {
        const price = ctx.prices[asset.dataSourceId]
        if (!price || price <= 0) continue
        const portion = cashChange * (asset.contributionWeight / 100)
        if (portion > 0) {
          nextState.shares[asset.dataSourceId] = (nextState.shares[asset.dataSourceId] || 0) + portion / price
        }
      }
    } else if (cashChange < 0) {
      nextState.cashBalance += cashChange
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
  const isFirstMonth = ctx.monthIndex === 0
  const currentYear = parseInt(ctx.date.substring(0, 4))
  const currentMonth = parseInt(ctx.date.substring(5, 7)) - 1

  // Identify index (lowest multiplier) and leveraged (highest multiplier) assets
  const sorted = [...assets].sort(
    (a, b) => (ctx.multipliers[a.dataSourceId] || 1) - (ctx.multipliers[b.dataSourceId] || 1),
  )
  const indexId = sorted[0]?.dataSourceId
  const levId = sorted.length > 1 ? sorted[1].dataSourceId : indexId

  // Year tracking (same pattern as original main branch)
  if (isFirstMonth || memory.currentYear !== currentYear) {
    memory.currentYear = currentYear
    memory.yearInflow = 0
    if (!isFirstMonth) {
      memory.startLevVal = (state.shares[levId] || 0) * (ctx.prices[levId] || 0)
    }
  }

  const nextState = strategyNoRebalance(state, ctx, assets, config)

  if (isFirstMonth) {
    memory.startLevVal = (nextState.shares[levId] || 0) * (ctx.prices[levId] || 0)
  }

  // Track contribution inflow to leveraged asset
  const levSharesDiff = (nextState.shares[levId] || 0) - (state.shares[levId] || 0)
  if (levSharesDiff > 0 && (ctx.prices[levId] || 0) > 0) {
    memory.yearInflow = (memory.yearInflow || 0) + levSharesDiff * (ctx.prices[levId] || 0)
  }

  if (currentMonth === 11) {
    const { isAdequate } = checkCashAdequacy(nextState, config)
    const currentLevVal = (nextState.shares[levId] || 0) * (ctx.prices[levId] || 0)
    const profit = currentLevVal - ((memory.startLevVal || 0) + (memory.yearInflow || 0))

    if (!isAdequate) {
      // Defensive: restore cash buffer
      if (profit > 0 && ctx.prices[levId] && (ctx.prices[levId] || 0) > 0) {
        const sellAmount = profit / 3
        const p = ctx.prices[levId] || 1
        const toSell = Math.min(sellAmount / p, nextState.shares[levId] || 0)
        if (toSell > 0.001) {
          nextState.shares[levId] = (nextState.shares[levId] || 0) - toSell
          nextState.cashBalance += toSell * p
          memory.lastAction = `Defensive: Harvest Cash ${sellAmount.toFixed(0)}`
        }
      } else if (indexId && levId && indexId !== levId) {
        // Bear: sell 2% total value from index -> buy leveraged
        const totalVal = nextState.cashBalance + assets.reduce(
          (s, a) => s + (nextState.shares[a.dataSourceId] || 0) * (ctx.prices[a.dataSourceId] || 0), 0,
        )
        const transferAmount = totalVal * 0.02
        const indexVal = (nextState.shares[indexId] || 0) * (ctx.prices[indexId] || 0)
        const actualTransfer = Math.min(transferAmount, indexVal)
        if (actualTransfer > 0.001) {
          const ip = ctx.prices[indexId] || 1
          const lp = ctx.prices[levId] || 1
          const toSell = Math.min(actualTransfer / ip, nextState.shares[indexId] || 0)
          if (toSell > 0.001) {
            const proceeds = toSell * ip
            nextState.shares[indexId] = (nextState.shares[indexId] || 0) - toSell
            nextState.shares[levId] = (nextState.shares[levId] || 0) + proceeds / lp
            memory.lastAction = `Defensive: ${indexId}->${levId} ${actualTransfer.toFixed(0)}`
          }
        }
      }
    } else {
      // Cash adequate -> Smart rebalance logic
      if (profit > 0 && ctx.prices[levId] && (ctx.prices[levId] || 0) > 0) {
        const sellAmount = profit / 3
        const p = ctx.prices[levId] || 1
        const toSell = Math.min(sellAmount / p, nextState.shares[levId] || 0)
        if (toSell > 0.001) {
          nextState.shares[levId] = (nextState.shares[levId] || 0) - toSell
          nextState.cashBalance += toSell * p
          memory.lastAction = `Adequate: Smart Profit ${sellAmount.toFixed(0)}`
        }
      } else if (levId && (ctx.prices[levId] || 0) > 0) {
        const totalVal = nextState.cashBalance + assets.reduce(
          (s, a) => s + (nextState.shares[a.dataSourceId] || 0) * (ctx.prices[a.dataSourceId] || 0), 0,
        )
        const buyAmount = Math.min(totalVal * 0.02, nextState.cashBalance)
        if (buyAmount > 0.001) {
          const lp = ctx.prices[levId] || 1
          nextState.shares[levId] = (nextState.shares[levId] || 0) + buyAmount / lp
          nextState.cashBalance -= buyAmount
          memory.lastAction = `Adequate: Buy Dip ${buyAmount.toFixed(0)}`
        }
      }
    }
  }
  nextState.strategyMemory = memory
  return nextState
}

export const strategyFlexible2: StrategyFunction = (state, ctx, assets, config) => {
  const memory = { ...(state.strategyMemory as unknown as StrategyMemory) }
  const isFirstMonth = ctx.monthIndex === 0
  const currentYear = parseInt(ctx.date.substring(0, 4))
  const currentMonth = parseInt(ctx.date.substring(5, 7)) - 1

  // Identify index (lowest multiplier) and leveraged (highest multiplier) assets
  const sorted = [...assets].sort(
    (a, b) => (ctx.multipliers[a.dataSourceId] || 1) - (ctx.multipliers[b.dataSourceId] || 1),
  )
  const indexId = sorted[0]?.dataSourceId
  const levId = sorted.length > 1 ? sorted[1].dataSourceId : indexId

  if (isFirstMonth || memory.currentYear !== currentYear) {
    memory.currentYear = currentYear
    memory.yearInflow = 0
    if (!isFirstMonth) {
      memory.startLevVal = (state.shares[levId] || 0) * (ctx.prices[levId] || 0)
    }
  }

  const nextState = strategyNoRebalance(state, ctx, assets, config)

  if (isFirstMonth) {
    memory.startLevVal = (nextState.shares[levId] || 0) * (ctx.prices[levId] || 0)
  }

  const levSharesDiff = (nextState.shares[levId] || 0) - (state.shares[levId] || 0)
  if (levSharesDiff > 0 && (ctx.prices[levId] || 0) > 0) {
    memory.yearInflow = (memory.yearInflow || 0) + levSharesDiff * (ctx.prices[levId] || 0)
  }

  if (currentMonth === 11) {
    const { isAdequate } = checkCashAdequacy(nextState, config)
    const currentLevVal = (nextState.shares[levId] || 0) * (ctx.prices[levId] || 0)
    const profit = currentLevVal - ((memory.startLevVal || 0) + (memory.yearInflow || 0))

    if (!isAdequate) {
      // Fallback to defensive (same as Flex 1)
      if (profit > 0 && ctx.prices[levId] && (ctx.prices[levId] || 0) > 0) {
        const sellAmount = profit / 3
        const p = ctx.prices[levId] || 1
        const toSell = Math.min(sellAmount / p, nextState.shares[levId] || 0)
        if (toSell > 0.001) {
          nextState.shares[levId] = (nextState.shares[levId] || 0) - toSell
          nextState.cashBalance += toSell * p
          memory.lastAction = `Defensive: Harvest Cash ${sellAmount.toFixed(0)}`
        }
      } else if (indexId && levId && indexId !== levId) {
        const totalVal = nextState.cashBalance + assets.reduce(
          (s, a) => s + (nextState.shares[a.dataSourceId] || 0) * (ctx.prices[a.dataSourceId] || 0), 0,
        )
        const transferAmount = totalVal * 0.02
        const indexVal = (nextState.shares[indexId] || 0) * (ctx.prices[indexId] || 0)
        const actualTransfer = Math.min(transferAmount, indexVal)
        if (actualTransfer > 0.001) {
          const ip = ctx.prices[indexId] || 1
          const lp = ctx.prices[levId] || 1
          const toSell = Math.min(actualTransfer / ip, nextState.shares[indexId] || 0)
          if (toSell > 0.001) {
            const proceeds = toSell * ip
            nextState.shares[indexId] = (nextState.shares[indexId] || 0) - toSell
            nextState.shares[levId] = (nextState.shares[levId] || 0) + proceeds / lp
            memory.lastAction = `Defensive: ${indexId}->${levId} ${actualTransfer.toFixed(0)}`
          }
        }
      }
    } else {
      // Aggressive mode
      if (profit > 0 && indexId && ctx.prices[indexId] && (ctx.prices[indexId] || 0) > 0 && ctx.prices[levId] && (ctx.prices[levId] || 0) > 0) {
        const sellAmount = profit / 3
        const lp = ctx.prices[levId] || 1
        const ip = ctx.prices[indexId] || 1
        const toSell = Math.min(sellAmount / lp, nextState.shares[levId] || 0)
        if (toSell > 0.001) {
          const proceeds = toSell * lp
          nextState.shares[levId] = (nextState.shares[levId] || 0) - toSell
          nextState.shares[indexId] = (nextState.shares[indexId] || 0) + proceeds / ip
          memory.lastAction = `Aggressive: Profit to ${indexId} ${sellAmount.toFixed(0)}`
        }
      } else if (levId && (ctx.prices[levId] || 0) > 0) {
        const totalVal = nextState.cashBalance + assets.reduce(
          (s, a) => s + (nextState.shares[a.dataSourceId] || 0) * (ctx.prices[a.dataSourceId] || 0), 0,
        )
        const buyAmount = Math.min(totalVal * 0.02, nextState.cashBalance)
        if (buyAmount > 0.001) {
          const lp = ctx.prices[levId] || 1
          nextState.shares[levId] = (nextState.shares[levId] || 0) + buyAmount / lp
          nextState.cashBalance -= buyAmount
          memory.lastAction = `Aggressive: Buy Dip ${buyAmount.toFixed(0)}`
        }
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
