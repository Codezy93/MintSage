import type { Schedule } from './types'

const dayMs = 86400000
export function dayAdd(date: string, offset: number) {
  return new Date(Date.parse(date) + offset * dayMs).toISOString().slice(0, 10)
}
export function distance(start: string, end: string) {
  return Math.round((Date.parse(end) - Date.parse(start)) / dayMs)
}
export function monthDistance(start: string, end: string) {
  return (
    (Number(end.slice(0, 4)) - Number(start.slice(0, 4))) * 12 +
    Number(end.slice(5, 7)) -
    Number(start.slice(5, 7))
  )
}
export function monthAdd(date: string, months: number) {
  const first = new Date(date.slice(0, 7) + '-01T00:00:00Z')
  first.setUTCMonth(first.getUTCMonth() + months)
  const last = new Date(first)
  last.setUTCMonth(last.getUTCMonth() + 1, 0)
  first.setUTCDate(Math.min(Number(date.slice(8)), last.getUTCDate()))
  return first.toISOString().slice(0, 10)
}
export function occurs(
  anchor: string,
  freq: Schedule['frequency'],
  date: string
) {
  if (freq === 'once') return anchor === date
  if (freq === 'weekly' || freq === 'biweekly')
    return distance(anchor, date) % (freq === 'weekly' ? 7 : 14) === 0
  const months = monthDistance(anchor, date)
  return (
    (freq !== 'yearly' || months % 12 === 0) &&
    monthAdd(anchor, months) === date
  )
}
export const cents = (n: number) => Math.round(n * 100)
export const dollars = (c: number) => Math.round(c) / 100
