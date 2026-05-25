# Withdrawal Feature Design

## Summary

Add a "Withdrawal" feature independent from Asset Pledge. Users can set up annual cash withdrawals from their portfolio — deducted directly from cash (not borrowed). Each asset has a `withdrawalRatio` that controls how shortfalls are funded when cash is insufficient, with two sell methods: PRIORITY (sell highest-ratio assets first) and PROPORTIONAL (split across assets by weighted ratio).

## Section 1: Type Changes

### AssetEntry — add `withdrawalRatio`

```typescript
interface AssetEntry {
  dataSourceId: string
  targetWeight: number
  contributionWeight: number
  pledgeRatio: number
  withdrawalRatio: number  // 0 to 1, NEW
}
```

### New WithdrawalConfig

```typescript
interface WithdrawalConfig {
  enabled: boolean
  type: 'PERCENT' | 'FIXED'
  value: number          // % of portfolio or fixed dollar amount
  inflationRate: number  // for FIXED mode, compounds annually
  sellMethod: 'PRIORITY' | 'PROPORTIONAL'
}
```

### ProfileConfig — add `withdrawal`

```typescript
type ProfileConfig = {
  initialCapital: number
  contributionAmount: number
  contributionIntervalMonths: number
  yearlyContributionMonth: number
  cashYieldAnnual: number
  annualExpenseAmount?: number
  cashCoverageYears?: number
  leverage: LeverageConfig
  withdrawal: WithdrawalConfig  // NEW, independent from leverage
}
```

### Defaults (in ConfigPanel)

```typescript
const DEFAULT_WITHDRAWAL_CONFIG: WithdrawalConfig = {
  enabled: false,
  type: 'PERCENT',
  value: 4,
  inflationRate: 2,
  sellMethod: 'PROPORTIONAL',
}
```

### AssetEntry defaults

```typescript
withdrawalRatio: 0  // default 0%, user sets per asset
```

## Section 2: Simulation Engine Changes

Withdrawal runs **after strategy execution, alongside the leverage phase** (same timing as pledge cash-out).

### Timing

- Annual withdrawal on month 0 (January) and optionally on the first month (monthIdx === 0)
- Same condition: `monthIdx === 0 || currentMonth === 0`

### Withdrawal Amount

Same logic as pledge:

```typescript
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
```

### Deduction Logic

```
1. leftover = withdrawalAmount
2. Deduct from cashBalance first:
   cashDeducted = min(cashBalance, leftover)
   cashBalance -= cashDeducted
   leftover -= cashDeducted
3. If leftover > 0, sell assets:
   a. Collect all assets where withdrawalRatio > 0
   b. Calculate max sale value per asset = shares * lowPrice * withdrawalRatio
   c. Sort/fractionally allocate:
      - PRIORITY: sort assets by withdrawalRatio DESC, sell top assets up to their cap (shares × lowPrice × withdrawalRatio) until leftover covered
      - PROPORTIONAL: totalWeight = sum(shares[i] * lowPrice[i] * withdrawalRatio[i])
        saleShare[i] = leftover * (shares[i] * lowPrice[i] * withdrawalRatio[i]) / totalWeight
        saleShares[i] = saleShare[i] / lowPrice[i]
   d. If total available sale value < leftover → bankruptcy
4. Log as FinancialEvent type: 'WITHDRAW'
```

### No effect on LTV / debt

Withdrawal is independent — it does not affect `debtBalance`, `accruedInterest`, or LTV calculations. It only reduces `cashBalance` and potentially shares.

## Section 3: UI Changes (ConfigPanel.tsx)

Add a new collapsible section **"Withdrawal 提款設定"** below the Asset Pledge section:

- **Toggle**: Enable/disable withdrawal
- **Method**: Dropdown PERCENT / FIXED
- **Value**: Number input
- **Inflation Rate**: Number input (shown when FIXED)
- **Sell Method**: Dropdown "優先順序 (Priority)" / "比例分攤 (Proportional)"
- **Per-asset withdrawal ratio**: Slider 0–100% on each asset row (`withdrawalRatio`)

## Section 4: i18n Changes (i18n.tsx)

Add withdrawal-related strings in all 4 languages (en/fr/zh-CN/zh-TW):

| Key | EN | ZH-TW |
|-----|----|-------|
| withdrawal.title | Withdrawal | 提款設定 |
| withdrawal.enabled | Enable Withdrawal | 啟用提款 |
| withdrawal.type | Withdrawal Method | 提款方式 |
| withdrawal.value | Withdrawal Amount | 提款金額 |
| withdrawal.inflation | Inflation Rate | 通膨率 |
| withdrawal.sellMethod | Shortfall Handling | 不足處理方式 |
| withdrawal.sellMethod.priority | Priority (sell highest ratio first) | 優先順序 |
| withdrawal.sellMethod.proportional | Proportional (split by ratio) | 比例分攤 |
| asset.withdrawalRatio | Withdrawal Ratio | 提取比例 |

## Section 5: Financial Events

The existing `FinancialEvent.type` already includes `'WITHDRAW'`. Withdrawal events will use this type with appropriate descriptions:

```typescript
{
  type: 'WITHDRAW',
  amount: -withdrawalAmount,
  description: monthIdx === 0
    ? 'Initial Withdrawal'
    : 'Annual Withdrawal',
}
```

Asset sales triggered by withdrawal shortfall are logged as `TRADE` events.

## Section 6: Files Changed

| File | Change |
|------|--------|
| `types.ts` | Add `withdrawalRatio` to `AssetEntry`, add `WithdrawalConfig` interface, add `withdrawal` to `ProfileConfig` |
| `services/simulationEngine.ts` | Add withdrawal phase after strategy execution, before leverage phase |
| `components/ConfigPanel.tsx` | Add withdrawal UI section, update defaults, add per-asset withdrawal ratio slider |
| `services/i18n.tsx` | Add withdrawal strings in 4 languages |
| `services/__tests__/simulationEngine.test.ts` | Add withdrawal test cases |
| `services/__tests__/solvency_scenarios.test.ts` | Optionally add withdrawal scenarios |

## Section 7: Test Cases

### Unit tests (simulationEngine.test.ts)

1. **PERCENT withdrawal, sufficient cash** — verify cash deducted, no asset sales
2. **FIXED withdrawal, insufficient cash** — verify cash deducted + asset sales with PRIORITY
3. **FIXED withdrawal, PROPORTIONAL sell method** — verify correct fractional sale across assets
4. **PRIORITY sell order** — verify assets with higher withdrawalRatio are sold first
5. **Bankruptcy on insufficient assets** — verify bankruptcy when max sellable value < leftover
6. **Withdrawal + pledge both enabled** — verify they operate independently
7. **Withdrawal disabled** — verify no effect when toggle off
8. **Zero withdrawalRatio** — verify no asset sales happen, bankruptcy if cash insufficient
