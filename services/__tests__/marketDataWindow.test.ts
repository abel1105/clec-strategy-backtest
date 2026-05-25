import { describe, it, expect } from 'vitest'
import { filterMonthsByWindow } from '../marketDataWindow'

describe('filterMonthsByWindow', () => {
  const months = ['2020-01', '2020-02', '2020-03', '2020-04']

  it('returns all months when no window given', () => {
    expect(filterMonthsByWindow(months)).toEqual(months)
  })

  it('filters inclusively by start and end', () => {
    expect(filterMonthsByWindow(months, '2020-02', '2020-03')).toEqual(['2020-02', '2020-03'])
  })

  it('returns empty when start > end', () => {
    expect(filterMonthsByWindow(months, '2020-04', '2020-02')).toEqual([])
  })

  it('handles empty input', () => {
    expect(filterMonthsByWindow([])).toEqual([])
  })

  it('filters by start only', () => {
    expect(filterMonthsByWindow(months, '2020-03')).toEqual(['2020-03', '2020-04'])
  })

  it('filters by end only', () => {
    expect(filterMonthsByWindow(months, undefined, '2020-02')).toEqual(['2020-01', '2020-02'])
  })
})
