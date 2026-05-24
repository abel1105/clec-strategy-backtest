import { DataSource } from './types'
import { monthlyPointsToAssetData } from './services/dataLoader'
import qqqHistory from './data/qqq-history.json'
import qldHistory from './data/qld-history.json'

export const BUILT_IN_DATA_SOURCES: DataSource[] = [
  { id: 'builtin-qqq', name: 'QQQ', multiplier: 1, data: monthlyPointsToAssetData(qqqHistory) },
  { id: 'builtin-qld', name: 'QLD', multiplier: 2, data: monthlyPointsToAssetData(qldHistory) },
]
