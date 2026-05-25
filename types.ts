// Domain Models

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
  multipliers: Record<string, number>
  monthIndex: number
}

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

export type StrategyType = 'NO_REBALANCE' | 'REBALANCE' | 'SMART' | 'FLEXIBLE_1' | 'FLEXIBLE_2'

export interface Profile {
  id: string
  name: string
  color: string
  strategyType: StrategyType
  assets: AssetEntry[]
  config: ProfileConfig
  enabled?: boolean
}

export interface FinancialEvent {
  type: 'INTEREST_INC' | 'INTEREST_EXP' | 'DEBT_INC' | 'TRADE' | 'DEPOSIT' | 'WITHDRAW' | 'INFO'
  amount?: number
  description: string
}

export interface PortfolioState {
  date: string
  shares: Record<string, number>
  cashBalance: number
  debtBalance: number // Margin loan balance
  accruedInterest: number // Simple interest accrued but not yet paid (for MATURITY mode)
  totalValue: number // Net Equity (Assets - Debt)

  // Metadata for complex strategies (e.g., Smart Adjust)
  strategyMemory: Record<string, unknown>
  ltv: number // Loan to Value ratio for this step
  beta: number // Portfolio Beta relative to the index (1x asset)

  // Detailed logs for accounting reports
  events: FinancialEvent[]
}

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

export type StrategyFunction = (
  currentState: PortfolioState,
  context: MonthlyContext,
  assets: AssetEntry[],
  config: ProfileConfig,
) => PortfolioState
