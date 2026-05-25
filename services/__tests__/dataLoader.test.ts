import { describe, it, expect } from 'vitest'
import { parseTxtFile, aggregateToMonthly, monthlyPointsToAssetData } from '../dataLoader'
import { BUILT_IN_DATA_SOURCES } from '../../constants'

describe('parseTxtFile', () => {
  it('should parse dates and prices from txt content', () => {
    const content = '20200103,20200106,20200203\n100.0,102.5,98.0'
    const result = parseTxtFile(content)
    expect(result).toHaveLength(3)
    expect(result[0].date).toBe('20200103')
    expect(result[0].price).toBe(100.0)
    expect(result[2].price).toBe(98.0)
  })

  it('should throw on malformed input', () => {
    expect(() => parseTxtFile('')).toThrow()
    expect(() => parseTxtFile('abc\ndef')).toThrow()
  })
})

describe('aggregateToMonthly', () => {
  it('should group by month, take last close as close and min as low', () => {
    const input = [
      { date: '20200103', price: 100 },
      { date: '20200106', price: 102 },
      { date: '20200203', price: 98 },
      { date: '20200205', price: 105 },
    ]
    const result = aggregateToMonthly(input)
    expect(result).toHaveLength(2)
    expect(result[0].month).toBe('2020-01')
    expect(result[0].close).toBe(102)
    expect(result[0].low).toBe(100)
    expect(result[1].month).toBe('2020-02')
    expect(result[1].close).toBe(105)
    expect(result[1].low).toBe(98)
  })
})

describe('monthlyPointsToAssetData', () => {
  it('should convert MonthlyPoint[] to AssetDataRow[]', () => {
    const input = [
      { month: '2020-01', close: 100, low: 95 },
      { month: '2020-02', close: 110, low: 105 },
    ]
    const result = monthlyPointsToAssetData(input)
    expect(result).toEqual([
      { date: '2020-01-01', close: 100, low: 95 },
      { date: '2020-02-01', close: 110, low: 105 },
    ])
  })
})

describe('BUILT_IN_DATA_SOURCES', () => {
  it('should export QQQ and QLD with correct multipliers', () => {
    expect(BUILT_IN_DATA_SOURCES).toHaveLength(8)
    const qqq = BUILT_IN_DATA_SOURCES.find((s) => s.id === 'builtin-qqq')
    const qld = BUILT_IN_DATA_SOURCES.find((s) => s.id === 'builtin-qld')
    const source631l = BUILT_IN_DATA_SOURCES.find((s) => s.id === 'builtin-00631l')
    expect(qqq?.name).toBe('QQQ')
    expect(qqq?.multiplier).toBe(1)
    expect(qld?.name).toBe('QLD')
    expect(qld?.multiplier).toBe(2)
    expect(source631l?.name).toBe('00631L')
    expect(source631l?.multiplier).toBe(2)
    expect(qqq?.data.length).toBeGreaterThan(100)
    expect(qld?.data.length).toBeGreaterThan(100)
    expect(source631l?.data.length).toBeGreaterThan(100)
  })
})
