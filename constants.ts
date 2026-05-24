import { DataSource } from './types'
import qqqHistory from './data/qqq-history.json'
import qldHistory from './data/qld-history.json'

const buildSource = (
  data: { month: string; low: number; close: number }[],
  name: string,
  multiplier: number,
  id: string,
): DataSource => ({
  id,
  name,
  multiplier,
  data: data.map((item) => ({
    date: `${item.month}-01`,
    close: item.close,
    low: item.low,
  })),
})

export const BUILT_IN_DATA_SOURCES: DataSource[] = [
  buildSource(qqqHistory, 'QQQ', 1, 'builtin-qqq'),
  buildSource(qldHistory, 'QLD', 2, 'builtin-qld'),
]
