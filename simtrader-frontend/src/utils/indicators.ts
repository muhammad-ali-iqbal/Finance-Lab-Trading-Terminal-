// src/utils/indicators.ts
// Pure-TypeScript technical indicator calculations.
// All functions assume bars are sorted ascending by `time`.

export interface OHLCBar {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface IndicatorPoint {
  time: number
  value: number
}

export interface BollingerBandsPoint {
  time: number
  upper: number
  middle: number
  lower: number
}

export interface MACDPoint {
  time: number
  macd: number
  signal: number
  histogram: number
}

// ── Simple Moving Average ───────────────────────────────────────────────────
export function calcSMA(bars: OHLCBar[], period: number): IndicatorPoint[] {
  if (bars.length < period || period <= 0) return []
  const out: IndicatorPoint[] = []
  let sum = 0
  for (let i = 0; i < period; i++) sum += bars[i].close
  out.push({ time: bars[period - 1].time, value: sum / period })
  for (let i = period; i < bars.length; i++) {
    sum += bars[i].close - bars[i - period].close
    out.push({ time: bars[i].time, value: sum / period })
  }
  return out
}

// ── Exponential Moving Average ──────────────────────────────────────────────
export function calcEMA(bars: OHLCBar[], period: number): IndicatorPoint[] {
  if (bars.length < period || period <= 0) return []
  const out: IndicatorPoint[] = []
  const k = 2 / (period + 1)
  // Seed with SMA of the first `period` closes
  let sum = 0
  for (let i = 0; i < period; i++) sum += bars[i].close
  let ema = sum / period
  out.push({ time: bars[period - 1].time, value: ema })
  for (let i = period; i < bars.length; i++) {
    ema = bars[i].close * k + ema * (1 - k)
    out.push({ time: bars[i].time, value: ema })
  }
  return out
}

// ── Bollinger Bands ─────────────────────────────────────────────────────────
export function calcBollingerBands(
  bars: OHLCBar[],
  period: number,
  stdDev: number,
): BollingerBandsPoint[] {
  if (bars.length < period || period <= 0) return []
  const out: BollingerBandsPoint[] = []
  for (let i = period - 1; i < bars.length; i++) {
    let sum = 0
    for (let j = i - period + 1; j <= i; j++) sum += bars[j].close
    const mean = sum / period
    let varSum = 0
    for (let j = i - period + 1; j <= i; j++) {
      const diff = bars[j].close - mean
      varSum += diff * diff
    }
    const sd = Math.sqrt(varSum / period)
    out.push({
      time: bars[i].time,
      middle: mean,
      upper: mean + stdDev * sd,
      lower: mean - stdDev * sd,
    })
  }
  return out
}

// ── Relative Strength Index (Wilder's smoothing) ────────────────────────────
export function calcRSI(bars: OHLCBar[], period = 14): IndicatorPoint[] {
  if (bars.length < period + 1) return []
  const out: IndicatorPoint[] = []
  let avgGain = 0
  let avgLoss = 0

  for (let i = 1; i <= period; i++) {
    const diff = bars[i].close - bars[i - 1].close
    if (diff >= 0) avgGain += diff
    else avgLoss -= diff
  }
  avgGain /= period
  avgLoss /= period

  const rsiValue = (g: number, l: number): number => {
    if (l === 0) return 100
    const rs = g / l
    return 100 - 100 / (1 + rs)
  }

  out.push({ time: bars[period].time, value: rsiValue(avgGain, avgLoss) })

  for (let i = period + 1; i < bars.length; i++) {
    const diff = bars[i].close - bars[i - 1].close
    const gain = diff > 0 ? diff : 0
    const loss = diff < 0 ? -diff : 0
    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period
    out.push({ time: bars[i].time, value: rsiValue(avgGain, avgLoss) })
  }
  return out
}

// ── MACD (12, 26, 9 by default) ─────────────────────────────────────────────
export function calcMACD(
  bars: OHLCBar[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9,
): MACDPoint[] {
  if (bars.length < slowPeriod + signalPeriod) return []

  const fast = calcEMA(bars, fastPeriod)
  const slow = calcEMA(bars, slowPeriod)

  // Align: slow EMA starts later, so trim fast to match
  const offset = slow[0].time
  const fastFromOffset = fast.filter(p => p.time >= offset)
  const macdLine: IndicatorPoint[] = slow.map((s, i) => ({
    time: s.time,
    value: fastFromOffset[i].value - s.value,
  }))

  // Signal = EMA of MACD line
  if (macdLine.length < signalPeriod) return []
  const k = 2 / (signalPeriod + 1)
  let seed = 0
  for (let i = 0; i < signalPeriod; i++) seed += macdLine[i].value
  let sig = seed / signalPeriod
  const signalLine: IndicatorPoint[] = [
    { time: macdLine[signalPeriod - 1].time, value: sig },
  ]
  for (let i = signalPeriod; i < macdLine.length; i++) {
    sig = macdLine[i].value * k + sig * (1 - k)
    signalLine.push({ time: macdLine[i].time, value: sig })
  }

  // Combine into MACDPoint
  const sigStart = signalLine[0].time
  const out: MACDPoint[] = []
  let si = 0
  for (const m of macdLine) {
    if (m.time < sigStart) continue
    const s = signalLine[si++]
    out.push({
      time: m.time,
      macd: m.value,
      signal: s.value,
      histogram: m.value - s.value,
    })
  }
  return out
}
