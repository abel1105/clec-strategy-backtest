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
  const trimmed = content.trim()
  const lines = trimmed.split('\n')

  let dates: string[], prices: string[]

  if (lines.length >= 2) {
    dates = lines[0].split(',').map((s) => s.trim()).filter(Boolean)
    prices = lines[1].split(',').map((s) => s.trim()).filter(Boolean)
  } else if (lines.length === 1) {
    const spaceIdx = trimmed.lastIndexOf(' ')
    if (spaceIdx < 0) throw new Error('Invalid file format: single line must have dates and prices separated by space')
    dates = trimmed.substring(0, spaceIdx).split(',').map((s) => s.trim()).filter(Boolean)
    prices = trimmed.substring(spaceIdx + 1).split(',').map((s) => s.trim()).filter(Boolean)
  } else {
    throw new Error('Invalid file format: file is empty')
  }

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

import { AssetDataRow } from '../types'

export function monthlyPointsToAssetData(points: MonthlyPoint[]): AssetDataRow[] {
  return points.map((p) => ({
    date: `${p.month}-01`,
    close: p.close,
    low: p.low,
  }))
}
