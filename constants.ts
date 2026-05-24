import { MarketDataRow } from './types'
import qqqHistory from './data/qqq-history.json'
import qldHistory from './data/qld-history.json'

export const MARKET_DATA: MarketDataRow[] = (() => {
  // Create maps from JSON data
  const qqqMap = new Map(
    qqqHistory.map((item: { month: string; low: number; close: number }) => [item.month, item]),
  )
  const qldMap = new Map(
    qldHistory.map((item: { month: string; low: number; close: number }) => [item.month, item]),
  )

  // Get all unique months
  const months = Array.from(new Set([...qqqMap.keys(), ...qldMap.keys()])).sort()

  return months
    .map((month) => {
      const qqqData = qqqMap.get(month)
      const qldData = qldMap.get(month)

      return {
        date: `${month}-01`, // Convert "YYYY-MM" to "YYYY-MM-01"
        indexClose: qqqData?.close ?? 0,
        indexLow: qqqData?.low ?? 0,
        leveragedClose: qldData?.close ?? 0,
        leveragedLow: qldData?.low ?? 0,
      }
    })
    .filter((row) => row.indexClose > 0 && row.leveragedClose > 0)
})()
