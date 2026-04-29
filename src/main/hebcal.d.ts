declare module 'hebcal' {
  // Minimal surface used by smartSuggest/hebrewDate.ts. The package itself ships untyped JS.
  export class HDate {
    constructor(input?: Date | number | string)
    constructor(day: number, month: number | string, year?: number)
    getDate(): number
    getMonth(): number
    getMonthName(): string
    getFullYear(): number
    isLeapYear(): boolean
    next(): HDate
    prev(): HDate
    holidays(): unknown[]
    getHolidays?(): unknown[]
    sunset(): Date
    setCity(city: string): void
    setLocation(lat: number, long: number): void
  }

  const _default: { HDate: typeof HDate }
  export default _default
}
