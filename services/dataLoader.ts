export interface DailyPoint {
  date: string // YYYYMMDD
  price: number
}

export interface MonthlyPoint {
  month: string // YYYY-MM
  close: number
  low: number
}

export function parseTxtFile(content: string): DailyPoint[] {
  const lines = content.trim().split('\n')
  if (lines.length < 2) {
    throw new Error('Invalid file format: need at least 2 lines (dates + prices)')
  }
  const dates = lines[0]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const prices = lines[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (dates.length !== prices.length) {
    throw new Error(`Mismatch: ${dates.length} dates but ${prices.length} prices`)
  }
  return dates.map((date, i) => {
    const price = parseFloat(prices[i])
    if (isNaN(price)) {
      throw new Error(`Invalid price at index ${i}: "${prices[i]}"`)
    }
    return { date, price }
  })
}

export function aggregateToMonthly(daily: DailyPoint[]): MonthlyPoint[] {
  const groups = new Map<string, number[]>()
  for (const { date, price } of daily) {
    const month = date.substring(0, 6) // YYYYMM
    const key = `${month.substring(0, 4)}-${month.substring(4, 6)}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(price)
  }
  const result: MonthlyPoint[] = []
  for (const [month, prices] of groups) {
    result.push({
      month,
      close: prices[prices.length - 1],
      low: Math.min(...prices),
    })
  }
  result.sort((a, b) => a.month.localeCompare(b.month))
  return result
}

import { MarketDataRow } from '../types'

export function buildMarketData(asset1: MonthlyPoint[], asset2: MonthlyPoint[]): MarketDataRow[] {
  const map1 = new Map(asset1.map((a) => [a.month, a]))
  const map2 = new Map(asset2.map((a) => [a.month, a]))
  const months = Array.from(new Set([...map1.keys(), ...map2.keys()])).sort()
  return months
    .filter((month) => map1.has(month) && map2.has(month))
    .map((month) => {
      const a1 = map1.get(month)!
      const a2 = map2.get(month)!
      return {
        date: `${month}-01`,
        indexClose: a1.close,
        indexLow: a1.low,
        leveragedClose: a2.close,
        leveragedLow: a2.low,
      }
    })
    .filter((row) => row.indexClose > 0 && row.leveragedClose > 0)
}
