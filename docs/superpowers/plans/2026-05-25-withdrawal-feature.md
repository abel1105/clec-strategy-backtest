# Withdrawal Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an independent "Withdrawal" feature that allows annual cash withdrawals from the portfolio, deducted from cash or funded by selling assets.

**Architecture:** New `WithdrawalConfig` interface alongside `LeverageConfig` in `ProfileConfig`. Each `AssetEntry` gets a `withdrawalRatio` (0-1). Simulation engine adds a withdrawal phase after strategy execution. Two sell methods for when cash is insufficient: PRIORITY (sell highest-ratio assets first) and PROPORTIONAL (split by weighted ratio).

**Tech Stack:** TypeScript, React, Vitest

---

### Task 1: types.ts — Add withdrawal types

**Files:**
- Modify: `types.ts`

- [ ] **Step 1: Add `WithdrawalConfig` interface and `withdrawalRatio` to `AssetEntry`**

```typescript
export interface AssetEntry {
  dataSourceId: string
  targetWeight: number
  contributionWeight: number
  pledgeRatio: number
  withdrawalRatio: number  // NEW: 0 to 1, how much of asset value can be sold for withdrawals
}
```

Add before `StrategyType`:

```typescript
export interface WithdrawalConfig {
  enabled: boolean
  type: 'PERCENT' | 'FIXED'
  value: number
  inflationRate: number
  sellMethod: 'PRIORITY' | 'PROPORTIONAL'
}
```

Add to `ProfileConfig`:

```typescript
export type ProfileConfig = {
  initialCapital: number
  contributionAmount: number
  contributionIntervalMonths: number
  yearlyContributionMonth: number
  cashYieldAnnual: number
  annualExpenseAmount?: number
  cashCoverageYears?: number
  leverage: LeverageConfig
  withdrawal: WithdrawalConfig  // NEW
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `docker compose run lint` (or `bun run build` to typecheck)
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add types.ts
git commit -m "feat: add WithdrawalConfig and withdrawalRatio types"
```

---

### Task 2: services/i18n.tsx — Add withdrawal strings

**Files:**
- Modify: `services/i18n.tsx`

- [ ] **Step 1: Add strings to English dictionary (`en`)**

Insert after the `ltvBasis`/`ltvCollateral` entries (around line 94):

```typescript
    withdrawal: 'Withdrawal',
    withdrawalEnabled: 'Enable Withdrawal',
    withdrawalType: 'Withdrawal Method',
    withdrawalPercent: '% of Total Portfolio',
    withdrawalFixed: 'Fixed $',
    withdrawalValue: 'Withdrawal Amount',
    withdrawalInflationRate: 'Inflation Rate %',
    withdrawalSellMethod: 'Shortfall Handling',
    sellPriority: 'Priority (sell highest ratio first)',
    sellProportional: 'Proportional (split by ratio)',
    withdrawalRatio: 'Withdrawal Ratio',
```

- [ ] **Step 2: Add strings to French dictionary (`fr`)**

Insert after the French `ltvCollateral` entry (around line 309):

```typescript
    withdrawal: 'Retrait',
    withdrawalEnabled: 'Activer le retrait',
    withdrawalType: 'Méthode de retrait',
    withdrawalPercent: '% du Portefeuille Total',
    withdrawalFixed: 'Montant fixe $',
    withdrawalValue: 'Montant du retrait',
    withdrawalInflationRate: "Taux d'inflation %",
    withdrawalSellMethod: 'Gestion du déficit',
    sellPriority: 'Priorité (vendre le ratio le plus élevé d\'abord)',
    sellProportional: 'Proportionnel (répartir par ratio)',
    withdrawalRatio: 'Ratio de retrait',
```

- [ ] **Step 3: Add strings to Chinese Simplified dictionary (`zh-CN`)**

Insert after the Chinese Simplified `ltvCollateral` entry (around line 526):

```typescript
    withdrawal: '提款设置',
    withdrawalEnabled: '启用提款',
    withdrawalType: '提款方式',
    withdrawalPercent: '总资产百分比',
    withdrawalFixed: '固定金额',
    withdrawalValue: '提款金额',
    withdrawalInflationRate: '通货膨胀率 %',
    withdrawalSellMethod: '不足处理方式',
    sellPriority: '优先顺序（比例高者优先卖出）',
    sellProportional: '比例分摊（按比例分摊）',
    withdrawalRatio: '提取比例',
```

- [ ] **Step 4: Add strings to Chinese Traditional dictionary (`zh-TW`)**

Insert after the Chinese Traditional `ltvCollateral` entry (around line 734):

```typescript
    withdrawal: '提款設定',
    withdrawalEnabled: '啟用提款',
    withdrawalType: '提款方式',
    withdrawalPercent: '總資產百分比',
    withdrawalFixed: '固定金額',
    withdrawalValue: '提款金額',
    withdrawalInflationRate: '通貨膨脹率 %',
    withdrawalSellMethod: '不足處理方式',
    sellPriority: '優先順序（比例高者優先賣出）',
    sellProportional: '比例分攤（按比例分攤）',
    withdrawalRatio: '提取比例',
```

- [ ] **Step 5: Commit**

```bash
git add services/i18n.tsx
git commit -m "feat: add withdrawal i18n strings in 4 languages"
```

---

### Task 3: ConfigPanel.tsx — Default config + helper functions

**Files:**
- Modify: `components/ConfigPanel.tsx`

- [ ] **Step 1: Add withdrawal defaults to `DEFAULT_PROFILE_CONFIG` (line 58-77)**

Add after `leverage: { ... }` block:

```typescript
  withdrawal: {
    enabled: false,
    type: 'PERCENT',
    value: 4,
    inflationRate: 2,
    sellMethod: 'PROPORTIONAL',
  },
```

- [ ] **Step 2: Add `updateWithdrawal` helper after `updateLeverage` (line 351)**

```typescript
  const updateWithdrawal = (id: string, updates: Partial<ProfileConfig['withdrawal']>) => {
    onProfilesChange((prevProfiles) =>
      prevProfiles.map((p) => {
        if (p.id !== id) return p
        return {
          ...p,
          config: {
            ...p.config,
            withdrawal: { ...p.config.withdrawal, ...updates },
          },
        }
      }),
    )
    setHasChanged(true)
  }
```

- [ ] **Step 3: Commit**

```bash
git add components/ConfigPanel.tsx
git commit -m "feat: add withdrawal defaults and updateWithdrawal helper"
```

---

### Task 4: ConfigPanel.tsx — Add Withdrawal ratio slider per asset

**Files:**
- Modify: `components/ConfigPanel.tsx`

- [ ] **Step 1: Add `withdrawalRatio` slider in each asset row in the edit view**

Find the asset row in the edit view (around line 688-713). After the `pledgeRatio` slider div (the `</div>` closing the pledge ratio section at line 711), add:

```tsx
                    {/* Withdrawal Ratio */}
                    <div>
                      <label className="text-[10px] text-slate-500 uppercase font-bold">
                        {t('withdrawalRatio')}
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={(asset.withdrawalRatio * 100).toFixed(0)}
                          onChange={(e) => updateAsset(i, { withdrawalRatio: Number(e.target.value) / 100 || 0 })}
                          className="w-14 px-2 py-1 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <input type="range" min={0} max={100} value={asset.withdrawalRatio * 100}
                        onChange={(e) => updateAsset(i, { withdrawalRatio: Number(e.target.value) / 100 })}
                        className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
                    </div>
```

- [ ] **Step 2: Commit**

```bash
git add components/ConfigPanel.tsx
git commit -m "feat: add withdrawalRatio slider per asset in config panel"
```

---

### Task 5: ConfigPanel.tsx — Add Withdrawal config section UI

**Files:**
- Modify: `components/ConfigPanel.tsx`

- [ ] **Step 1: Add withdrawal toggle + settings section after the Stock Pledge section**

Insert after the closing `</div>` of the Stock Pledge section (line 939, right before the "Done" button at line 941):

```tsx
          {/* Withdrawal Settings */}
          <div className="p-4 bg-blue-50 rounded-xl border border-blue-100 space-y-4 mt-4">
            <div className="flex items-center justify-between text-sm font-medium text-blue-800">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4" /> {t('withdrawal')}
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={profile.config.withdrawal?.enabled || false}
                  onChange={(e) => updateWithdrawal(profile.id, { enabled: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            {profile.config.withdrawal?.enabled && (
              <div className="space-y-4 animate-in slide-in-from-top-2 duration-200">
                {/* Row 1: Type & Value */}
                <div>
                  <label className="text-[10px] text-blue-700 uppercase font-bold mb-1 block">
                    {t('withdrawalType')}
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={profile.config.withdrawal.type}
                      onChange={(e) =>
                        updateWithdrawal(profile.id, {
                          type: e.target.value as ProfileConfig['withdrawal']['type'],
                        })
                      }
                      className="bg-white border border-blue-200 rounded-lg px-2 text-sm outline-none w-28"
                    >
                      <option value="PERCENT">{t('withdrawalPercent')}</option>
                      <option value="FIXED">{t('withdrawalFixed')}</option>
                    </select>
                    <input
                      type="number"
                      step="0.1"
                      value={profile.config.withdrawal.value}
                      onChange={(e) =>
                        updateWithdrawal(profile.id, { value: Number(e.target.value) })
                      }
                      className="w-full px-2 py-2 border border-blue-200 rounded-lg outline-none"
                    />
                  </div>
                  {profile.config.withdrawal.type === 'FIXED' && (
                    <div className="mt-2">
                      <label className="text-[10px] text-blue-700 uppercase font-bold mb-1 block">
                        {t('withdrawalInflationRate')}
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={profile.config.withdrawal.inflationRate || 0}
                        onChange={(e) =>
                          updateWithdrawal(profile.id, { inflationRate: Number(e.target.value) })
                        }
                        className="w-full px-2 py-2 border border-blue-200 rounded-lg outline-none"
                      />
                    </div>
                  )}
                </div>

                {/* Row 2: Sell Method */}
                <div>
                  <label className="text-[10px] text-blue-700 uppercase font-bold mb-1 block">
                    {t('withdrawalSellMethod')}
                  </label>
                  <div className="flex bg-white rounded-lg border border-blue-200 p-1">
                    <button
                      className={`flex-1 py-1 text-xs font-medium rounded ${profile.config.withdrawal.sellMethod === 'PRIORITY' ? 'bg-blue-100 text-blue-800' : 'text-slate-500 hover:bg-slate-50'}`}
                      onClick={() => updateWithdrawal(profile.id, { sellMethod: 'PRIORITY' })}
                    >
                      {t('sellPriority')}
                    </button>
                    <button
                      className={`flex-1 py-1 text-xs font-medium rounded ${profile.config.withdrawal.sellMethod === 'PROPORTIONAL' ? 'bg-blue-100 text-blue-800' : 'text-slate-500 hover:bg-slate-50'}`}
                      onClick={() => updateWithdrawal(profile.id, { sellMethod: 'PROPORTIONAL' })}
                    >
                      {t('sellProportional')}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
```

- [ ] **Step 2: Commit**

```bash
git add components/ConfigPanel.tsx
git commit -m "feat: add withdrawal config section in config panel UI"
```

---

### Task 6: simulationEngine.ts — Add withdrawal logic

**Files:**
- Modify: `services/simulationEngine.ts`

- [ ] **Step 1: Add withdrawal phase in the simulation loop**

Insert after the leverage phase (after the closing `}` of the `if (leverage.enabled)` block at line 340, but before the negative cash check at line 342):

```typescript
    // 3b. Withdrawal Logic (independent from leverage)
    if (config.withdrawal?.enabled) {
      const currentMonth = parseInt(date.substring(5, 7)) - 1
      const isWithdrawalTiming = monthIdx === 0 || currentMonth === 0

      if (isWithdrawalTiming) {
        // Calculate total asset value at low prices (conservative)
        let totalAssetValue = currentState.cashBalance
        for (const entry of assets) {
          const id = entry.dataSourceId
          const lowPrice = lows[id] || 0
          totalAssetValue += (currentState.shares[id] || 0) * lowPrice
        }

        let withdrawalAmount = 0
        if (config.withdrawal.type === 'PERCENT') {
          withdrawalAmount = totalAssetValue * (config.withdrawal.value / 100)
        } else {
          const yearsPassed = Math.floor(monthIdx / 12)
          const inflationFactor = Math.pow(
            1 + (config.withdrawal.inflationRate || 0) / 100,
            yearsPassed,
          )
          withdrawalAmount = config.withdrawal.value * inflationFactor
        }

        if (withdrawalAmount > 0) {
          let remaining = withdrawalAmount

          // Step 1: Deduct from cash
          const cashDeducted = Math.min(currentState.cashBalance, remaining)
          currentState.cashBalance -= cashDeducted
          remaining -= cashDeducted

          // Step 2: Sell assets if cash insufficient
          if (remaining > 0) {
            const sellableAssets = assets
              .filter((a) => a.withdrawalRatio > 0)
              .map((a) => ({
                entry: a,
                price: lows[a.dataSourceId] || 0,
                shares: currentState.shares[a.dataSourceId] || 0,
                maxSellValue: (currentState.shares[a.dataSourceId] || 0) * (lows[a.dataSourceId] || 0) * a.withdrawalRatio,
              }))
              .filter((a) => a.price > 0 && a.shares > 0 && a.maxSellValue > 0)

            const totalSellable = sellableAssets.reduce((s, a) => s + a.maxSellValue, 0)

            if (totalSellable < remaining) {
              isBankrupt = true
              bankruptcyDate = date
              currentState.totalValue = 0
              monthEvents.push({
                type: 'INFO',
                description: `!!! BANKRUPTCY: Withdrawal ${withdrawalAmount.toFixed(2)} exceeds available cash + sellable assets (${(totalSellable + withdrawalAmount - remaining).toFixed(2)}) !!!`,
              })
            } else {
              if (config.withdrawal.sellMethod === 'PRIORITY') {
                // Sort by withdrawalRatio DESC, sell fully up to cap
                const sorted = [...sellableAssets].sort(
                  (a, b) => b.entry.withdrawalRatio - a.entry.withdrawalRatio,
                )
                for (const asset of sorted) {
                  if (remaining <= 0) break
                  const sellValue = Math.min(asset.maxSellValue, remaining)
                  const sharesToSell = sellValue / asset.price
                  currentState.shares[asset.entry.dataSourceId] =
                    (currentState.shares[asset.entry.dataSourceId] || 0) - sharesToSell
                  remaining -= sellValue
                  monthEvents.push({
                    type: 'TRADE',
                    amount: sellValue,
                    description: `Sell ${sharesToSell.toFixed(4)} ${asset.entry.dataSourceId} @ ${asset.price.toFixed(2)} (Withdrawal)`,
                  })
                }
              } else {
                // PROPORTIONAL: split by weighted ratio
                for (const asset of sellableAssets) {
                  if (remaining <= 0) break
                  const saleShare = remaining * (asset.maxSellValue / totalSellable)
                  const sharesToSell = saleShare / asset.price
                  currentState.shares[asset.entry.dataSourceId] =
                    (currentState.shares[asset.entry.dataSourceId] || 0) - sharesToSell
                  remaining -= saleShare
                  monthEvents.push({
                    type: 'TRADE',
                    amount: saleShare,
                    description: `Sell ${sharesToSell.toFixed(4)} ${asset.entry.dataSourceId} @ ${asset.price.toFixed(2)} (Withdrawal)`,
                  })
                }
              }
            }
          }

          monthEvents.push({
            type: 'WITHDRAW',
            amount: -Math.abs(withdrawalAmount),
            description:
              monthIdx === 0 ? 'Initial Withdrawal' : 'Annual Withdrawal',
          })
        }
      }
    }
```

- [ ] **Step 2: Commit**

```bash
git add services/simulationEngine.ts
git commit -m "feat: add withdrawal phase to simulation engine"
```

---

### Task 7: simulationEngine.test.ts — Add withdrawal tests

**Files:**
- Modify: `services/__tests__/simulationEngine.test.ts`

- [ ] **Step 1: Add `withdrawalRatio` to test assets (line 100-113)**

Add `withdrawalRatio: 0` to both test assets:

```typescript
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
```

Add `withdrawal` to `baseConfig`:

```typescript
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
```

- [ ] **Step 2: Add test suite for withdrawal scenarios**

Add before the closing `})` of the outer `describe('simulationEngine - N-Asset', () => {` block:

```typescript
  describe('Withdrawal', () => {
    it('should deduct PERCENT withdrawal from cash', () => {
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
      const testAssetsWithRatio: AssetEntry[] = [
        { dataSourceId: 'ASSET_A', targetWeight: 60, contributionWeight: 60, pledgeRatio: 0.7, withdrawalRatio: 0 },
        { dataSourceId: 'ASSET_B', targetWeight: 40, contributionWeight: 40, pledgeRatio: 0.5, withdrawalRatio: 0 },
      ]
      const data = genData(1)
      const result = runBacktest(data, defaultMultipliers, strategyNoRebalance, testAssetsWithRatio, config, 'Test')
      // Month 0: initialCapital=10000 all in cash. netTradeCost=0 (strategy deploys). Let's check: 
      // NoRebalance at monthIndex 0 deploys all cash: A=60, B=40, cash=0.
      // totalAssetValue = 10000 (shares only). Withdrawal = 10% = 1000.
      // cash=0, so remaining=1000 > 0. But withdrawalRatio=0 on all assets → maxSellable=0 → bankruptcy.
      expect(result.isBankrupt).toBe(true)
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
      // Use a strategy that doesn't deploy capital (return state unchanged)
      const noopStrategy: StrategyFunction = (state, _ctx, _assets, _config) => state
      const data = genData(1)
      const result = runBacktest(data, defaultMultipliers, noopStrategy, testAssets, config, 'Test')
      // Month 0: cash=10000. Withdrawal FIXED 500. cash -= 500 = 9500.
      expect(result.history[0].cashBalance).toBe(9500)
    })

    it('should sell assets via PRIORITY method', () => {
      const config = baseConfig()
      config.initialCapital = 0
      config.contributionAmount = 0
      config.withdrawal = {
        enabled: true,
        type: 'FIXED',
        value: 600,
        inflationRate: 0,
        sellMethod: 'PRIORITY',
      }
      // Strategy: buy 10 shares of A and 10 shares of B at price 100
      const buyStrategy: StrategyFunction = (state, ctx, _assets, _config) => ({
        ...state,
        shares: { ASSET_A: 10, ASSET_B: 10 },
        cashBalance: 0,
      })
      const customAssets: AssetEntry[] = [
        { dataSourceId: 'ASSET_A', targetWeight: 60, contributionWeight: 60, pledgeRatio: 0.7, withdrawalRatio: 0.8 },
        { dataSourceId: 'ASSET_B', targetWeight: 40, contributionWeight: 40, pledgeRatio: 0.5, withdrawalRatio: 0.3 },
      ]
      const data = genData(1, 100, 100)
      const result = runBacktest(data, defaultMultipliers, buyStrategy, customAssets, config, 'Test')
      // After strategy: A=10 shares, B=10 shares, cash=0.
      // Withdrawal FIXED 600. cash=0, remaining=600.
      // Asset A: maxSellValue=10*100*0.8=800, Asset B: maxSellValue=10*100*0.3=300. totalSellable=1100.
      // PRIORITY: sort A(0.8) > B(0.3). Sell A first: min(800,600)=600 → 6 shares sold, remaining=0.
      expect(result.history[0].shares['ASSET_A']).toBeCloseTo(4, 1) // 10 - 6 = 4
      expect(result.history[0].shares['ASSET_B']).toBeCloseTo(10, 1) // unchanged
      expect(result.isBankrupt).toBe(false)
    })

    it('should sell assets via PROPORTIONAL method', () => {
      const config = baseConfig()
      config.initialCapital = 0
      config.contributionAmount = 0
      config.withdrawal = {
        enabled: true,
        type: 'FIXED',
        value: 600,
        inflationRate: 0,
        sellMethod: 'PROPORTIONAL',
      }
      const buyStrategy: StrategyFunction = (state, ctx, _assets, _config) => ({
        ...state,
        shares: { ASSET_A: 10, ASSET_B: 10 },
        cashBalance: 0,
      })
      const customAssets: AssetEntry[] = [
        { dataSourceId: 'ASSET_A', targetWeight: 60, contributionWeight: 60, pledgeRatio: 0.7, withdrawalRatio: 0.8 },
        { dataSourceId: 'ASSET_B', targetWeight: 40, contributionWeight: 40, pledgeRatio: 0.5, withdrawalRatio: 0.3 },
      ]
      const data = genData(1, 100, 100)
      const result = runBacktest(data, defaultMultipliers, buyStrategy, customAssets, config, 'Test')
      // After strategy: A=10, B=10, cash=0.
      // Withdrawal FIXED 600. cash=0, remaining=600.
      // A: maxSellValue=800, B: maxSellValue=300, totalSellable=1100.
      // PROPORTIONAL: A gets 600*(800/1100) = 436.36, B gets 600*(300/1100) = 163.64
      expect(result.history[0].shares['ASSET_A']).toBeCloseTo(5.636, 2) // 10 - 436.36/100
      expect(result.history[0].shares['ASSET_B']).toBeCloseTo(8.364, 2) // 10 - 163.64/100
      expect(result.isBankrupt).toBe(false)
    })

    it('should trigger bankruptcy when withdrawal exceeds sellable assets', () => {
      const config = baseConfig()
      config.initialCapital = 0
      config.contributionAmount = 0
      config.withdrawal = {
        enabled: true,
        type: 'FIXED',
        value: 5000,
        inflationRate: 0,
        sellMethod: 'PRIORITY',
      }
      const buyStrategy: StrategyFunction = (state, ctx, _assets, _config) => ({
        ...state,
        shares: { ASSET_A: 10, ASSET_B: 10 },
        cashBalance: 0,
      })
      const customAssets: AssetEntry[] = [
        { dataSourceId: 'ASSET_A', targetWeight: 60, contributionWeight: 60, pledgeRatio: 0.7, withdrawalRatio: 0.1 },
        { dataSourceId: 'ASSET_B', targetWeight: 40, contributionWeight: 40, pledgeRatio: 0.5, withdrawalRatio: 0.1 },
      ]
      const data = genData(1, 100, 100)
      const result = runBacktest(data, defaultMultipliers, buyStrategy, customAssets, config, 'Test')
      // A: maxSellValue=10*100*0.1=100, B: maxSellValue=10*100*0.1=100, totalSellable=200.
      // Withdrawal 5000 > 200 → bankruptcy
      expect(result.isBankrupt).toBe(true)
    })

    it('should withdraw and leverage independently', () => {
      const config = baseConfig()
      config.initialCapital = 20000
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
      // Month 0: cash=20000.
      // Withdrawal: FIXED 1000 → cash=19000 (deducted from cash)
      // Leverage: FIXED 2000 → debtBalance=2000
      expect(result.history[0].cashBalance).toBe(19000)
      expect(result.history[0].debtBalance).toBe(2000)
      expect(result.isBankrupt).toBe(false)
    })
  })
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `bun run vitest run simulationEngine.test`
Expected: all tests pass

- [ ] **Step 4: Fix any test failures and repeat step 3 until all pass**

- [ ] **Step 5: Commit**

```bash
git add services/__tests__/simulationEngine.test.ts
git commit -m "feat: add withdrawal test cases"
```

---

### Task 8: Full verification

**Files:** none

- [ ] **Step 1: Run lint**

`docker compose run lint`

- [ ] **Step 2: Run all unit tests**

`docker compose run test`

- [ ] **Step 3: Verify E2E tests still pass**

`docker compose -f docker-compose.e2e.yml up e2e`
