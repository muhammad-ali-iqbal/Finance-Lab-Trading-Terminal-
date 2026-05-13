// src/pages/student/EODChartTab.tsx
// Daily candlestick chart for PSX stocks using eod_prices data.
// Same indicators as ChartPage but driven by EOD data instead of WebSocket ticks.

import { useState, useEffect, useRef, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  createChart, type IChartApi, type ISeriesApi,
  ColorType, LineStyle, CrosshairMode,
} from 'lightweight-charts'
import { challengeApi } from '@/api'
import type { EODBar } from '@/api'
import { Spinner } from '@/components/ui'
import { useTheme } from '@/context/ThemeContext'
import { Search, BarChart3, ChevronDown, X } from 'lucide-react'
import {
  calcSMA, calcEMA, calcBollingerBands, calcRSI, calcMACD,
  type OHLCBar,
} from '@/utils/indicators'
import clsx from 'clsx'

// ── Types ─────────────────────────────────────────────────────────────────────

type IndicatorId = 'sma20' | 'sma50' | 'ema20' | 'bb' | 'rsi' | 'macd'

const INDICATOR_DEFS: { id: IndicatorId; label: string; color: string }[] = [
  { id: 'sma20', label: 'SMA 20',          color: '#f97316' },
  { id: 'sma50', label: 'SMA 50',          color: '#a855f7' },
  { id: 'ema20', label: 'EMA 20',          color: '#22c55e' },
  { id: 'bb',    label: 'Bollinger Bands', color: '#94a3b8' },
  { id: 'rsi',   label: 'RSI 14',          color: '#3b82f6' },
  { id: 'macd',  label: 'MACD',            color: '#ec4899' },
]

const RSI_SCALE  = 'eod-rsi'
const MACD_SCALE = 'eod-macd'

// ── Helpers ───────────────────────────────────────────────────────────────────

function toOHLC(bars: EODBar[]): OHLCBar[] {
  return bars.map(b => ({
    time:   new Date(b.time + 'T00:00:00Z').getTime() / 1000,
    open:   b.open,
    high:   b.high,
    low:    b.low,
    close:  b.close,
    volume: b.volume,
  }))
}

// Convert Unix seconds back to 'YYYY-MM-DD' so all series share the same time format
function toDateStr(unixSec: number): string {
  return new Date(unixSec * 1000).toISOString().slice(0, 10)
}

function computeLayout(rsi: boolean, macd: boolean) {
  const extras = (rsi ? 1 : 0) + (macd ? 1 : 0)
  if (extras === 0) return {
    price:  { top: 0.10, bottom: 0.28 },
    volume: { top: 0.78, bottom: 0.00 },
    pane1:  null as null | { top: number; bottom: number },
    pane2:  null as null | { top: number; bottom: number },
  }
  if (extras === 1) return {
    price:  { top: 0.05, bottom: 0.45 },
    volume: { top: 0.58, bottom: 0.30 },
    pane1:  { top: 0.75, bottom: 0.00 },
    pane2:  null as null | { top: number; bottom: number },
  }
  return {
    price:  { top: 0.04, bottom: 0.42 },
    volume: { top: 0.40, bottom: 0.42 },
    pane1:  { top: 0.45, bottom: 0.30 },
    pane2:  { top: 0.75, bottom: 0.00 },
  }
}

// ── Symbol picker ─────────────────────────────────────────────────────────────

function SymbolPicker({ symbols, value, onChange }: {
  symbols: string[]
  value: string
  onChange: (s: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() =>
    query.trim() === ''
      ? symbols
      : symbols.filter(s => s.toLowerCase().includes(query.toLowerCase())),
    [symbols, query],
  )

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-1.5 rounded border border-border dark:border-dark-border bg-surface dark:bg-dark-surface text-sm font-medium text-ink dark:text-dark-ink hover:bg-surface-secondary dark:hover:bg-dark-surface-secondary transition-colors min-w-[140px]"
      >
        <BarChart3 className="w-3.5 h-3.5 text-ink-secondary dark:text-dark-ink-secondary flex-shrink-0" />
        <span className="flex-1 text-left truncate">{value || 'Select symbol'}</span>
        <ChevronDown className="w-3.5 h-3.5 text-ink-secondary dark:text-dark-ink-secondary flex-shrink-0" />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 w-64 bg-surface dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg shadow-lg overflow-hidden">
          <div className="p-2 border-b border-border dark:border-dark-border">
            <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-surface-secondary dark:bg-dark-surface-secondary">
              <Search className="w-3.5 h-3.5 text-ink-tertiary dark:text-dark-ink-tertiary flex-shrink-0" />
              <input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search symbol…"
                className="flex-1 bg-transparent text-sm text-ink dark:text-dark-ink placeholder:text-ink-disabled dark:placeholder:text-dark-ink-disabled outline-none"
              />
              {query && (
                <button onClick={() => setQuery('')}>
                  <X className="w-3 h-3 text-ink-tertiary dark:text-dark-ink-tertiary" />
                </button>
              )}
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="text-xs text-ink-tertiary dark:text-dark-ink-tertiary px-3 py-2">No results</p>
            ) : filtered.map(s => (
              <button
                key={s}
                onClick={() => { onChange(s); setOpen(false); setQuery('') }}
                className={clsx(
                  'w-full text-left px-3 py-1.5 text-sm transition-colors',
                  s === value
                    ? 'bg-ink text-surface dark:bg-dark-ink dark:text-dark-surface'
                    : 'text-ink dark:text-dark-ink hover:bg-surface-secondary dark:hover:bg-dark-surface-secondary',
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Indicator picker ──────────────────────────────────────────────────────────

function IndicatorPicker({ active, onChange }: {
  active: Set<IndicatorId>
  onChange: (next: Set<IndicatorId>) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  function toggle(id: IndicatorId) {
    const next = new Set(active)
    next.has(id) ? next.delete(id) : next.add(id)
    onChange(next)
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-border dark:border-dark-border bg-surface dark:bg-dark-surface text-xs font-medium text-ink-secondary dark:text-dark-ink-secondary hover:bg-surface-secondary dark:hover:bg-dark-surface-secondary transition-colors"
      >
        Indicators
        {active.size > 0 && (
          <span className="w-4 h-4 rounded-full bg-ink dark:bg-dark-ink text-surface dark:text-dark-surface text-[10px] flex items-center justify-center">
            {active.size}
          </span>
        )}
        <ChevronDown className="w-3 h-3" />
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-1 z-50 w-52 bg-surface dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg shadow-lg p-1">
          {INDICATOR_DEFS.map(def => (
            <button
              key={def.id}
              onClick={() => toggle(def.id)}
              className="flex items-center gap-2.5 w-full px-3 py-2 rounded text-sm hover:bg-surface-secondary dark:hover:bg-dark-surface-secondary transition-colors"
            >
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: def.color }} />
              <span className="flex-1 text-left text-ink dark:text-dark-ink">{def.label}</span>
              {active.has(def.id) && <span className="text-xs text-ink-tertiary dark:text-dark-ink-tertiary">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main chart component ──────────────────────────────────────────────────────

export default function EODChartTab() {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef     = useRef<IChartApi | null>(null)

  // Series refs
  const candleRef   = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volumeRef   = useRef<ISeriesApi<'Histogram'> | null>(null)
  const sma20Ref    = useRef<ISeriesApi<'Line'> | null>(null)
  const sma50Ref    = useRef<ISeriesApi<'Line'> | null>(null)
  const ema20Ref    = useRef<ISeriesApi<'Line'> | null>(null)
  const bbUpperRef  = useRef<ISeriesApi<'Line'> | null>(null)
  const bbMidRef    = useRef<ISeriesApi<'Line'> | null>(null)
  const bbLowerRef  = useRef<ISeriesApi<'Line'> | null>(null)
  const rsiRef      = useRef<ISeriesApi<'Line'> | null>(null)
  const rsiHiRef    = useRef<ISeriesApi<'Line'> | null>(null)
  const rsiLoRef    = useRef<ISeriesApi<'Line'> | null>(null)
  const macdLineRef = useRef<ISeriesApi<'Line'> | null>(null)
  const macdSigRef  = useRef<ISeriesApi<'Line'> | null>(null)
  const macdHistRef = useRef<ISeriesApi<'Histogram'> | null>(null)

  const [symbol, setSymbol]         = useState('')
  const [indicators, setIndicators] = useState<Set<IndicatorId>>(new Set())
  const [activeRange, setActiveRange] = useState<string>('All')

  // Fetch symbol list
  const { data: symData } = useQuery({
    queryKey: ['eod-symbols'],
    queryFn: challengeApi.getEODSymbols,
    staleTime: 60 * 60 * 1000,
  })
  const symbols = symData?.symbols ?? []

  // Auto-select first symbol once loaded
  useEffect(() => {
    if (!symbol && symbols.length > 0) setSymbol(symbols[0])
  }, [symbols, symbol])

  // Reset range to All when symbol changes so the full history is shown
  useEffect(() => { setActiveRange('All') }, [symbol])

  // Fetch OHLCV history for selected symbol
  const { data: histData, isFetching } = useQuery({
    queryKey: ['eod-history', symbol],
    queryFn: () => challengeApi.getEODHistory(symbol),
    enabled: !!symbol,
    staleTime: 8 * 60 * 60 * 1000,
  })
  const bars: EODBar[] = histData?.bars ?? []

  // ── Init chart (once on mount) ──────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return

    const col = {
      bg:   isDark ? '#0f1117' : '#ffffff',
      text: isDark ? '#94a3b8' : '#64748b',
      grid: isDark ? '#1e293b' : '#f1f5f9',
      up:   '#22c55e',
      dn:   '#ef4444',
    }

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: col.bg },
        textColor: col.text,
        fontFamily: 'ui-monospace, monospace',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: col.grid },
        horzLines: { color: col.grid },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: col.grid, scaleMargins: { top: 0.10, bottom: 0.28 } },
      timeScale: { borderColor: col.grid, timeVisible: true },
    })
    chartRef.current = chart

    candleRef.current = chart.addCandlestickSeries({
      upColor: col.up, downColor: col.dn,
      borderUpColor: col.up, borderDownColor: col.dn,
      wickUpColor: col.up, wickDownColor: col.dn,
    })

    volumeRef.current = chart.addHistogramSeries({
      priceScaleId: 'volume',
      priceFormat: { type: 'volume' },
      lastValueVisible: false,
      priceLineVisible: false,
    })
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } })

    const ro = new ResizeObserver(() => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth })
    })
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      chart.remove()
      chartRef.current  = null
      candleRef.current = null
      volumeRef.current = null
      // Clear all indicator refs so they're recreated on remount
      sma20Ref.current = null; sma50Ref.current = null; ema20Ref.current = null
      bbUpperRef.current = null; bbMidRef.current = null; bbLowerRef.current = null
      rsiRef.current = null; rsiHiRef.current = null; rsiLoRef.current = null
      macdLineRef.current = null; macdSigRef.current = null; macdHistRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Theme update ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!chartRef.current) return
    const col = {
      bg:   isDark ? '#0f1117' : '#ffffff',
      text: isDark ? '#94a3b8' : '#64748b',
      grid: isDark ? '#1e293b' : '#f1f5f9',
    }
    chartRef.current.applyOptions({
      layout: { background: { type: ColorType.Solid, color: col.bg }, textColor: col.text },
      grid: { vertLines: { color: col.grid }, horzLines: { color: col.grid } },
    })
  }, [isDark])

  // ── Sync indicator series + push all data ──────────────────────────────────
  // Single flat effect — no useCallback chains. Runs whenever indicators,
  // bars, or theme changes. Syncs series first, then pushes data so newly
  // created series are immediately populated.
  useEffect(() => {
    if (!chartRef.current) return
    const chart = chartRef.current
    const gridColor = isDark ? '#1e293b' : '#f1f5f9'
    const up = '#22c55e'
    const dn = '#ef4444'

    // Helper: add or keep a line series
    function addLine(
      ref: React.MutableRefObject<ISeriesApi<'Line'> | null>,
      color: string,
      priceScaleId = 'right',
      lineStyle = LineStyle.Solid,
    ) {
      if (!ref.current) {
        ref.current = chart.addLineSeries({
          color, lineWidth: 1, priceScaleId, lineStyle,
          lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false,
        })
      }
    }
    function removeLine(ref: React.MutableRefObject<ISeriesApi<'Line'> | null>) {
      if (ref.current) { try { chart.removeSeries(ref.current) } catch { /* already gone */ } ref.current = null }
    }
    function removeHist(ref: React.MutableRefObject<ISeriesApi<'Histogram'> | null>) {
      if (ref.current) { try { chart.removeSeries(ref.current) } catch { /* already gone */ } ref.current = null }
    }

    // ── Sync series ────────────────────────────────────────────────────────
    if (indicators.has('sma20')) addLine(sma20Ref, '#f97316')
    else removeLine(sma20Ref)

    if (indicators.has('sma50')) addLine(sma50Ref, '#a855f7')
    else removeLine(sma50Ref)

    if (indicators.has('ema20')) addLine(ema20Ref, '#22c55e')
    else removeLine(ema20Ref)

    if (indicators.has('bb')) {
      addLine(bbUpperRef, gridColor)
      addLine(bbMidRef,   gridColor, 'right', LineStyle.Dashed)
      addLine(bbLowerRef, gridColor)
    } else {
      removeLine(bbUpperRef); removeLine(bbMidRef); removeLine(bbLowerRef)
    }

    if (indicators.has('rsi')) {
      addLine(rsiRef,   '#3b82f6', RSI_SCALE)
      addLine(rsiHiRef, '#ef444460', RSI_SCALE, LineStyle.Dashed)
      addLine(rsiLoRef, '#22c55e60', RSI_SCALE, LineStyle.Dashed)
    } else {
      removeLine(rsiRef); removeLine(rsiHiRef); removeLine(rsiLoRef)
    }

    if (indicators.has('macd')) {
      addLine(macdLineRef, '#ec4899', MACD_SCALE)
      addLine(macdSigRef,  '#f97316', MACD_SCALE)
      if (!macdHistRef.current) {
        macdHistRef.current = chart.addHistogramSeries({
          priceScaleId: MACD_SCALE, lastValueVisible: false, priceLineVisible: false,
        })
      }
    } else {
      removeLine(macdLineRef); removeLine(macdSigRef); removeHist(macdHistRef)
    }

    // ── Apply layout ───────────────────────────────────────────────────────
    const rsiOn  = indicators.has('rsi')
    const macdOn = indicators.has('macd')
    const layout = computeLayout(rsiOn, macdOn)
    chart.priceScale('right').applyOptions({ scaleMargins: layout.price })
    chart.priceScale('volume').applyOptions({ scaleMargins: layout.volume })
    if (layout.pane1) {
      chart.priceScale(rsiOn ? RSI_SCALE : MACD_SCALE).applyOptions({ scaleMargins: layout.pane1 })
    }
    if (layout.pane2) {
      chart.priceScale(MACD_SCALE).applyOptions({ scaleMargins: layout.pane2 })
    }

    // ── Push data ──────────────────────────────────────────────────────────
    if (bars.length === 0) return

    candleRef.current?.setData(bars.map(b => ({
      time: b.time as unknown as import('lightweight-charts').Time,
      open: b.open, high: b.high, low: b.low, close: b.close,
    })))
    volumeRef.current?.setData(bars.map(b => ({
      time: b.time as unknown as import('lightweight-charts').Time,
      value: b.volume,
      color: b.close >= b.open ? up + '80' : dn + '80',
    })))

    const ohlc = toOHLC(bars)
    const td = (t: number) => toDateStr(t) as unknown as import('lightweight-charts').Time

    if (sma20Ref.current)
      sma20Ref.current.setData(calcSMA(ohlc, 20).map(p => ({ time: td(p.time), value: p.value })))
    if (sma50Ref.current)
      sma50Ref.current.setData(calcSMA(ohlc, 50).map(p => ({ time: td(p.time), value: p.value })))
    if (ema20Ref.current)
      ema20Ref.current.setData(calcEMA(ohlc, 20).map(p => ({ time: td(p.time), value: p.value })))

    if (bbUpperRef.current || bbMidRef.current || bbLowerRef.current) {
      const bb = calcBollingerBands(ohlc, 20, 2)
      bbUpperRef.current?.setData(bb.map(p => ({ time: td(p.time), value: p.upper })))
      bbMidRef.current?.setData(bb.map(p => ({ time: td(p.time), value: p.middle })))
      bbLowerRef.current?.setData(bb.map(p => ({ time: td(p.time), value: p.lower })))
    }

    if (rsiRef.current) {
      const rsiData = calcRSI(ohlc, 14)
      rsiRef.current.setData(rsiData.map(p => ({ time: td(p.time), value: p.value })))
      if (rsiData.length > 0) {
        const t0 = td(rsiData[0].time)
        const tN = td(rsiData[rsiData.length - 1].time)
        rsiHiRef.current?.setData([{ time: t0, value: 70 }, { time: tN, value: 70 }])
        rsiLoRef.current?.setData([{ time: t0, value: 30 }, { time: tN, value: 30 }])
      }
    }

    if (macdLineRef.current) {
      const macdData = calcMACD(ohlc)
      macdLineRef.current.setData(macdData.map(p => ({ time: td(p.time), value: p.macd })))
      macdSigRef.current?.setData(macdData.map(p => ({ time: td(p.time), value: p.signal })))
      macdHistRef.current?.setData(macdData.map(p => ({
        time: td(p.time),
        value: p.histogram,
        color: p.histogram >= 0 ? '#22c55e80' : '#ef444480',
      })))
    }
  }, [indicators, bars, isDark]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Range selector ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!chartRef.current || bars.length === 0) return
    const ts = chartRef.current.timeScale()
    if (activeRange === 'All') {
      ts.fitContent()
      return
    }
    const months = { '1M': 1, '3M': 3, '6M': 6, '1Y': 12, '3Y': 36 }[activeRange] ?? 12
    const to   = new Date()
    const from = new Date()
    from.setMonth(from.getMonth() - months)
    ts.setVisibleRange({
      from: from.toISOString().slice(0, 10) as import('lightweight-charts').Time,
      to:   to.toISOString().slice(0, 10)   as import('lightweight-charts').Time,
    })
  }, [activeRange, bars]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Price ticker ─────────────────────────────────────────────────────────────
  const lastBar = bars.length > 0 ? bars[bars.length - 1] : null
  const dayChg    = lastBar ? lastBar.close - lastBar.open : 0
  const dayChgPct = lastBar ? (dayChg / lastBar.open) * 100 : 0

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <SymbolPicker symbols={symbols} value={symbol} onChange={setSymbol} />
        <IndicatorPicker active={indicators} onChange={setIndicators} />

        {/* Range buttons */}
        <div className="flex items-center rounded border border-border dark:border-dark-border overflow-hidden">
          {(['1M', '3M', '6M', '1Y', '3Y', 'All'] as const).map(r => (
            <button
              key={r}
              onClick={() => setActiveRange(r)}
              className={clsx(
                'px-2.5 py-1 text-xs font-medium transition-colors',
                activeRange === r
                  ? 'bg-ink text-surface dark:bg-dark-ink dark:text-dark-surface'
                  : 'text-ink-secondary dark:text-dark-ink-secondary hover:bg-surface-secondary dark:hover:bg-dark-surface-secondary',
              )}
            >
              {r}
            </button>
          ))}
        </div>

        {/* Legend chips */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {INDICATOR_DEFS.filter(d => indicators.has(d.id)).map(d => (
            <span key={d.id} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium text-ink dark:text-dark-ink border border-border dark:border-dark-border">
              <span className="w-2 h-2 rounded-full" style={{ background: d.color }} />
              {d.label}
            </span>
          ))}
        </div>
      </div>

      {/* Price ticker */}
      {lastBar && (
        <div className="flex items-center gap-4 text-xs font-mono text-ink-secondary dark:text-dark-ink-secondary">
          <span className="font-semibold text-ink dark:text-dark-ink">{symbol}</span>
          <span>O <span className="text-ink dark:text-dark-ink">{lastBar.open.toFixed(2)}</span></span>
          <span>H <span className="text-ink dark:text-dark-ink">{lastBar.high.toFixed(2)}</span></span>
          <span>L <span className="text-ink dark:text-dark-ink">{lastBar.low.toFixed(2)}</span></span>
          <span>C <span className="text-ink dark:text-dark-ink">{lastBar.close.toFixed(2)}</span></span>
          <span className={dayChg >= 0 ? 'text-success dark:text-dark-success' : 'text-danger dark:text-dark-danger'}>
            {dayChg >= 0 ? '+' : ''}{dayChg.toFixed(2)} ({dayChgPct >= 0 ? '+' : ''}{dayChgPct.toFixed(2)}%)
          </span>
          <span className="text-ink-tertiary dark:text-dark-ink-tertiary">Vol {lastBar.volume.toLocaleString()}</span>
        </div>
      )}

      {/* Chart container */}
      <div className="relative rounded-lg overflow-hidden border border-border dark:border-dark-border bg-surface dark:bg-dark-surface" style={{ height: 480 }}>
        {isFetching && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface/60 dark:bg-dark-surface/60 z-10">
            <Spinner size="lg" />
          </div>
        )}
        {!symbol && symbols.length > 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-sm text-ink-secondary dark:text-dark-ink-secondary">Select a symbol to view chart</p>
          </div>
        )}
        {symbol && bars.length === 0 && !isFetching && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-sm text-ink-secondary dark:text-dark-ink-secondary">No data available for {symbol}</p>
          </div>
        )}
        <div ref={containerRef} className="w-full h-full" />
      </div>

      <p className="text-[11px] text-ink-tertiary dark:text-dark-ink-tertiary">
        Daily EOD data from PSX · Updates each morning after market close
      </p>
    </div>
  )
}
