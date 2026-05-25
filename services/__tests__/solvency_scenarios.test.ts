import { describe, it, expect } from 'vitest'
import { runBacktest } from '../simulationEngine'
import { BUILT_IN_DATA_SOURCES } from '../../constants'
import { getStrategyByType } from '../strategies'
import { Profile } from '../../types'

const allAssetData: Record<string, typeof BUILT_IN_DATA_SOURCES[0]['data']> = {}
const multipliers: Record<string, number> = {}
for (const ds of BUILT_IN_DATA_SOURCES) {
  allAssetData[ds.id] = ds.data
  multipliers[ds.id] = ds.multiplier
}

const SOLVENCY_PROFILES: Profile[] = [
  {
    id: '2',
    name: '台灣433聰明再平衡 質押借款利息3%，最多每年借款2.5% total assets LTV 60% 成功',
    color: '#ea580c',
    strategyType: 'SMART',
    assets: [
      { dataSourceId: 'builtin-qqq', targetWeight: 40, contributionWeight: 0, pledgeRatio: 0.6 },
      { dataSourceId: 'builtin-qld', targetWeight: 30, contributionWeight: 0, pledgeRatio: 0.6 },
    ],
    config: {
      initialCapital: 1000000,
      contributionAmount: 0,
      contributionIntervalMonths: 1,
      yearlyContributionMonth: 12,
      cashYieldAnnual: 3.5,
      leverage: {
        enabled: true,
        interestRate: 3,
        cashPledgeRatio: 0.6,
        maxLtv: 60,
        withdrawType: 'FIXED',
        withdrawValue: 30000,
        inflationRate: 0,
        interestType: 'CAPITALIZED',
        ltvBasis: 'TOTAL_ASSETS',
      },
    },
  },
  {
    id: '3n492d5zo',
    name: '美國433聰明再平衡 質押借款利息6.5%，collateral Value LTV 80%最多每年借款1.9%成功',
    color: '#2563eb',
    strategyType: 'SMART',
    assets: [
      { dataSourceId: 'builtin-qqq', targetWeight: 40, contributionWeight: 0, pledgeRatio: 0.7 },
      { dataSourceId: 'builtin-qld', targetWeight: 30, contributionWeight: 0, pledgeRatio: 0 },
    ],
    config: {
      initialCapital: 1000000,
      contributionAmount: 0,
      contributionIntervalMonths: 1,
      yearlyContributionMonth: 12,
      cashYieldAnnual: 3.5,
      leverage: {
        enabled: true,
        interestRate: 6.5,
        cashPledgeRatio: 0.95,
        maxLtv: 80,
        withdrawType: 'FIXED',
        withdrawValue: 23000,
        inflationRate: 0,
        interestType: 'CAPITALIZED',
        ltvBasis: 'COLLATERAL',
      },
    },
  },
  {
    id: 'oklrsz25f',
    name: '台灣433聰明再平衡 質押借款利息3%，最多每年借款2.6% total assets LTV 60% 失敗',
    color: '#475569',
    strategyType: 'SMART',
    assets: [
      { dataSourceId: 'builtin-qqq', targetWeight: 40, contributionWeight: 0, pledgeRatio: 0.6 },
      { dataSourceId: 'builtin-qld', targetWeight: 30, contributionWeight: 0, pledgeRatio: 0.6 },
    ],
    config: {
      initialCapital: 1000000,
      contributionAmount: 0,
      contributionIntervalMonths: 1,
      yearlyContributionMonth: 12,
      cashYieldAnnual: 3.5,
      leverage: {
        enabled: true,
        interestRate: 3,
        cashPledgeRatio: 0.6,
        maxLtv: 60,
        withdrawType: 'FIXED',
        withdrawValue: 26000,
        inflationRate: 0,
        interestType: 'CAPITALIZED',
        ltvBasis: 'TOTAL_ASSETS',
      },
    },
  },
  {
    id: '6qrqgep01',
    name: '美國433聰明再平衡 質押借款利息6.5%，collateral Value LTV 80%最多每年借款2.2%失敗',
    color: '#475569',
    strategyType: 'SMART',
    assets: [
      { dataSourceId: 'builtin-qqq', targetWeight: 40, contributionWeight: 0, pledgeRatio: 0.7 },
      { dataSourceId: 'builtin-qld', targetWeight: 30, contributionWeight: 0, pledgeRatio: 0 },
    ],
    config: {
      initialCapital: 1000000,
      contributionAmount: 0,
      contributionIntervalMonths: 1,
      yearlyContributionMonth: 12,
      cashYieldAnnual: 3.5,
      leverage: {
        enabled: true,
        interestRate: 6.5,
        cashPledgeRatio: 0.95,
        maxLtv: 80,
        withdrawType: 'FIXED',
        withdrawValue: 22000,
        inflationRate: 0,
        interestType: 'CAPITALIZED',
        ltvBasis: 'COLLATERAL',
      },
    },
  },
  {
    id: 'hmky3xsko',
    name: '80 20 每月花2250年花2.7% 年度再平衡最後資產高過原始資產一百萬 成功',
    color: '#9333ea',
    strategyType: 'REBALANCE',
    assets: [
      { dataSourceId: 'builtin-qqq', targetWeight: 80, contributionWeight: 0, pledgeRatio: 0.7 },
    ],
    config: {
      initialCapital: 1000000,
      contributionAmount: 0,
      contributionIntervalMonths: 1,
      yearlyContributionMonth: 12,
      cashYieldAnnual: 3.5,
      leverage: {
        enabled: false,
        interestRate: 5,
        cashPledgeRatio: 0.95,
        maxLtv: 100,
        withdrawType: 'PERCENT',
        withdrawValue: 2,
        inflationRate: 0,
        interestType: 'CAPITALIZED',
        ltvBasis: 'TOTAL_ASSETS',
      },
    },
  },
  {
    id: 'j6nutxp60',
    name: '80 20 每年花費 2.8% （月花2333)年度再平衡到目前資產低於原始資產一百萬 失敗',
    color: '#0891b2',
    strategyType: 'REBALANCE',
    assets: [
      { dataSourceId: 'builtin-qqq', targetWeight: 80, contributionWeight: 0, pledgeRatio: 0.7 },
    ],
    config: {
      initialCapital: 1000000,
      contributionAmount: 0,
      contributionIntervalMonths: 1,
      yearlyContributionMonth: 12,
      cashYieldAnnual: 3.5,
      leverage: {
        enabled: false,
        interestRate: 5,
        cashPledgeRatio: 0.95,
        maxLtv: 100,
        withdrawType: 'PERCENT',
        withdrawValue: 2,
        inflationRate: 0,
        interestType: 'CAPITALIZED',
        ltvBasis: 'TOTAL_ASSETS',
      },
    },
  },
]

describe('Standardized Solvency Backtests', () => {
  SOLVENCY_PROFILES.forEach((profile) => {
    it(`[${profile.id}] ${profile.name}`, () => {
      const strategy = getStrategyByType(profile.strategyType)
      const result = runBacktest(
        allAssetData,
        multipliers,
        strategy,
        profile.assets,
        profile.config,
        profile.name,
      )

      const shouldBankrupt =
        profile.id === '2' ||
        profile.id === '3n492d5zo' ||
        profile.id === 'oklrsz25f' ||
        profile.id === '6qrqgep01'

      if (shouldBankrupt) {
        expect(result.isBankrupt).toBe(true)
        expect(result.bankruptcyDate).toBeTruthy()
      } else {
        expect(result.isBankrupt).toBe(false)
      }
    })
  })
})
