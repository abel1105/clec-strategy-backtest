import { describe, it, expect } from 'vitest'
import { parseTxtFile, aggregateToMonthly, buildMarketData, MonthlyPoint } from '../dataLoader'

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

describe('buildMarketData', () => {
  it('should join two asset series into MarketDataRow[]', () => {
    const asset1: MonthlyPoint[] = [
      { month: '2020-01', close: 100, low: 99 },
      { month: '2020-02', close: 110, low: 108 },
    ]
    const asset2: MonthlyPoint[] = [
      { month: '2020-01', close: 200, low: 198 },
      { month: '2020-02', close: 220, low: 215 },
    ]
    const result = buildMarketData(asset1, asset2)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({
      date: '2020-01-01',
      indexClose: 100,
      indexLow: 99,
      leveragedClose: 200,
      leveragedLow: 198,
    })
  })

  it('should only include months present in BOTH series', () => {
    const asset1: MonthlyPoint[] = [
      { month: '2020-01', close: 100, low: 99 },
      { month: '2020-02', close: 110, low: 108 },
    ]
    const asset2: MonthlyPoint[] = [
      { month: '2020-01', close: 200, low: 198 },
      { month: '2020-03', close: 230, low: 225 },
    ]
    const result = buildMarketData(asset1, asset2)
    expect(result).toHaveLength(1)
    expect(result[0].date).toBe('2020-01-01')
  })
})
