export const filterMonthsByWindow = (
  months: string[],
  startMonth?: string,
  endMonth?: string,
): string[] => {
  if (months.length === 0) return []
  const start = startMonth || months[0]
  const end = endMonth || months[months.length - 1]
  if (start > end) return []
  return months.filter((m) => m >= start && m <= end)
}
