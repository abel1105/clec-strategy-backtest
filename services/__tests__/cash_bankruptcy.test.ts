import { describe, it, expect } from 'vitest'
import { runBacktest } from '../simulationEngine'
import { AssetDataRow, AssetEntry, ProfileConfig } from '../../types'
import { strategyNoRebalance } from '../strategies'

const createBaseConfig = (): ProfileConfig => ({
  initialCapital: 10000,
  contributionAmount: 0,
  contributionIntervalMonths: 1,
  yearlyContributionMonth: 12,
  cashYieldAnnual: 0,
  leverage: {
    enabled: false,
    interestRate: 0,
    cashPledgeRatio: 0.95,
    maxLtv: 1,
    withdrawType: 'PERCENT',
    withdrawValue: 0,
    inflationRate: 0,
    interestType: 'CAPITALIZED',
    ltvBasis: 'TOTAL_ASSETS',
  },
  withdrawal: { enabled: false, type: 'PERCENT', value: 0, inflationRate: 0, sellMethod: 'PROPORTIONAL' },
})

const generateAssetData = (months: number): AssetDataRow[] => {
  const data: AssetDataRow[] = []
  for (let i = 0; i < months; i++) {
    data.push({
      date: `2020-${(i + 1).toString().padStart(2, '0')}-01`,
      close: 100,
      low: 100,
    })
  }
  return data
}

describe('Negative Cash Bankruptcy', () => {
  it('should trigger bankruptcy when cash balance becomes negative', () => {
    const config = createBaseConfig()
    config.initialCapital = 1000
    config.contributionAmount = -2000
    config.contributionIntervalMonths = 1

    const assetData = generateAssetData(2)
    const allAssetData: Record<string, AssetDataRow[]> = { 'test-asset': assetData }
    const multipliers: Record<string, number> = { 'test-asset': 1 }
    const assets: AssetEntry[] = [
      { dataSourceId: 'test-asset', targetWeight: 100, contributionWeight: 100, pledgeRatio: 0.7, withdrawalRatio: 0 },
    ]
    const result = runBacktest(allAssetData, multipliers, strategyNoRebalance, assets, config, 'Test')

    expect(result.isBankrupt).toBe(true)
    expect(result.bankruptcyDate).toBe('2020-02-01')
    expect(result.metrics.finalBalance).toBe(0)
    expect(
      result.history[1].events.some((e) =>
        e.description.includes('BANKRUPTCY: Negative Cash Balance'),
      ),
    ).toBe(true)
  })

  it('should trigger bankruptcy when cash is insufficient for withdrawal', () => {
    const config = createBaseConfig()
    config.initialCapital = 1000
    config.contributionAmount = -1000 // Withdraw more than available cash (cash was used to buy assets)
    config.contributionIntervalMonths = 1

    const assetData = generateAssetData(2)
    const allAssetData: Record<string, AssetDataRow[]> = { 'test-asset': assetData }
    const multipliers: Record<string, number> = { 'test-asset': 1 }
    const assets: AssetEntry[] = [
      { dataSourceId: 'test-asset', targetWeight: 100, contributionWeight: 100, pledgeRatio: 0.7, withdrawalRatio: 0 },
    ]
    const result = runBacktest(allAssetData, multipliers, strategyNoRebalance, assets, config, 'Test')

    expect(result.isBankrupt).toBe(true)
    expect(result.bankruptcyDate).toBe('2020-02-01')
  })
})
