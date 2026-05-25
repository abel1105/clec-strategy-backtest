import { DataSource } from './types'
import { monthlyPointsToAssetData } from './services/dataLoader'
import qqqHistory from './data/qqq-history.json'
import qldHistory from './data/qld-history.json'
import history0050 from './data/0050-history.json'
import history00631L from './data/00631l-history.json'
import history00662 from './data/00662-history.json'
import history00865B from './data/00865b-history.json'
import historyAnlian from './data/安聯台灣科技-history.json'
import historyBeike from './data/貝科-history.json'

export const BUILT_IN_DATA_SOURCES: DataSource[] = [
  { id: 'builtin-qqq', name: 'QQQ', multiplier: 1, data: monthlyPointsToAssetData(qqqHistory) },
  { id: 'builtin-qld', name: 'QLD', multiplier: 2, data: monthlyPointsToAssetData(qldHistory) },
  { id: 'builtin-0050', name: '0050', multiplier: 1, data: monthlyPointsToAssetData(history0050) },
  { id: 'builtin-00631l', name: '00631L', multiplier: 2, data: monthlyPointsToAssetData(history00631L) },
  { id: 'builtin-00662', name: '00662', multiplier: 1, data: monthlyPointsToAssetData(history00662) },
  { id: 'builtin-00865b', name: '00865B', multiplier: 1, data: monthlyPointsToAssetData(history00865B) },
  { id: 'builtin-anlian', name: '安聯台灣科技', multiplier: 1, data: monthlyPointsToAssetData(historyAnlian) },
  { id: 'builtin-beike', name: '貝科', multiplier: 1, data: monthlyPointsToAssetData(historyBeike) },
]
