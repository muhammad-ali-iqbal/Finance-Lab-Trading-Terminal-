// src/pages/student/ChartPage.tsx
// Enhanced chart page with:
//   • Candlestick and Line chart types (dropdown)
//   • Symbol selector (dropdown)
//   • Dark / Light mode toggle (slider)
//   • Volume histogram overlay
//   • Real-time tick feed via WebSocket
//   • Technical indicators (SMA, EMA, Bollinger Bands, RSI, MACD)

import { useEffect, useRef, useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  type CandlestickSeriesOptions,
  type LineSeriesOptions,
  type Time,
  ColorType,
  CrosshairMode,
  LineStyle,
} from 'lightweight-charts'
import { simulationApi } from '@/api'
import { useSimulationSocket } from '@/hooks/useSimulationSocket'
import { useSymbolDisplay } from '@/hooks/useSymbolDisplay'
import { useTheme } from '@/context/ThemeContext'
import { Spinner, Badge } from '@/components/ui'
import {
  calcSMA,
  calcEMA,
  calcBollingerBands,
  calcRSI,
  calcMACD,
  type OHLCBar,
} from '@/utils/indicators'
import type { PriceTick, SimulationTick } from '@/types'
import clsx from 'clsx'
import { Activity, ChevronDown, BarChart2, TrendingUp, Sliders, Check } from 'lucide-react'

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number, d = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}

// ── Theme tokens ──────────────────────────────────────────────────────────────

const THEMES = {
  light: {
    bg:            '#FFFFFF',
    surface:       '#F8F8F7',
    border:        '#E4E4E0',
    text:          '#0F0F0E',
    textSecondary: '#4A4A47',
    textTertiary:  '#8A8A85',
    gridLine:      '#F2F1EF',
    crosshair:     '#C4C4BF',
    scaleBorder:   '#E4E4E0',
    upColor:       '#0D7A4E',
    downColor:     '#C8291A',
    lineColor:     '#1A5CFF',
    volUp:         '#0D7A4E33',
    volDown:       '#C8291A33',
  },
  dark: {
    bg:            '#0F0F0E',
    surface:       '#1A1A18',
    border:        '#2C2C29',
    text:          '#F2F1EF',
    textSecondary: '#A8A8A3',
    textTertiary:  '#5A5A55',
    gridLine:      '#1E1E1C',
    crosshair:     '#4A4A47',
    scaleBorder:   '#2C2C29',
    upColor:       '#14A06B',
    downColor:     '#E0402E',
    lineColor:     '#4D88FF',
    volUp:         '#14A06B33',
    volDown:       '#E0402E33',
  },
}

type ChartType = 'candlestick' | 'line'

// ── Indicator definitions ────────────────────────────────────────────────────

type IndicatorKey = 'sma20' | 'sma50' | 'ema20' | 'bb' | 'rsi' | 'macd'

interface IndicatorDef {
  key: IndicatorKey
  label: string
  pane: 'price' | 'rsi' | 'macd'
  color: string
}

const INDICATOR_DEFS: Record<IndicatorKey, IndicatorDef> = {
  sma20: { key: 'sma20', label: 'SMA (20)',                pane: 'price', color: '#F59E0B' },
  sma50: { key: 'sma50', label: 'SMA (50)',                pane: 'price', color: '#A855F7' },
  ema20: { key: 'ema20', label: 'EMA (20)',                pane: 'price', color: '#10B981' },
  bb:    { key: 'bb',    label: 'Bollinger Bands (20, 2)', pane: 'price', color: '#64748B' },
  rsi:   { key: 'rsi',   label: 'RSI (14)',                pane: 'rsi',   color: '#EC4899' },
  macd:  { key: 'macd',  label: 'MACD (12, 26, 9)',        pane: 'macd',  color: '#06B6D4' },
}

const INDICATOR_ORDER: IndicatorKey[] = ['sma20', 'sma50', 'ema20', 'bb', 'rsi', 'macd']

// Price-scale IDs for separate panes
const RSI_SCALE_ID = 'rsi-pane'
const MACD_SCALE_ID = 'macd-pane'

// Compute scale margins based on which extra panes are active.
// Layout: price pane on top (with volume histogram in its bottom area),
// then RSI and/or MACD stacked beneath.
function computeLayout(rsi: boolean, macd: boolean) {
  const extras = (rsi ? 1 : 0) + (macd ? 1 : 0)
  if (extras === 0) {
    return {
      price:  { top: 0.10, bottom: 0.28 },
      volume: { top: 0.78, bottom: 0.00 },
      rsi:    null as null | { top: number; bottom: number },
      macd:   null as null | { top: number; bottom: number },
    }
  }
  if (extras === 1) {
    return {
      price:  { top: 0.05, bottom: 0.45 },
      volume: { top: 0.58, bottom: 0.30 },
      rsi:    rsi  ? { top: 0.75, bottom: 0.00 } : null,
      macd:   macd ? { top: 0.75, bottom: 0.00 } : null,
    }
  }
  // both
  return {
    price:  { top: 0.04, bottom: 0.58 },
    volume: { top: 0.40, bottom: 0.58 },
    rsi:    { top: 0.45, bottom: 0.30 },
    macd:   { top: 0.75, bottom: 0.00 },
  }
}

// ── Custom dropdown ───────────────────────────────────────────────────────────

interface DropdownProps<T extends string> {
  value: T
  options: { value: T; label: string; icon?: React.ReactNode }[]
  onChange: (v: T) => void
  dark: boolean
  className?: string
}

function Dropdown<T extends string>({ value, options, onChange, dark, className }: DropdownProps<T>) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = options.find(o => o.value === value)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const t = THEMES[dark ? 'dark' : 'light']

  return (
    <div ref={ref} className={clsx('relative', className)}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: t.surface,
          border: `1px solid ${t.border}`,
          color: t.text,
        }}
        className="flex items-center gap-2 h-8 pl-3 pr-2.5 rounded text-xs font-medium transition-all hover:opacity-80 min-w-[130px]"
      >
        {selected?.icon && <span className="opacity-60">{selected.icon}</span>}
        <span className="flex-1 text-left">{selected?.label}</span>
        <ChevronDown
          className={clsx('w-3 h-3 transition-transform opacity-50', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div
          style={{
            background: t.surface,
            border: `1px solid ${t.border}`,
            boxShadow: '0 8px 24px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.08)',
          }}
          className="absolute top-full left-0 mt-1 rounded z-50 min-w-full overflow-hidden"
        >
          {options.map(opt => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false) }}
              style={{
                color: opt.value === value ? t.lineColor : t.text,
                background: opt.value === value ? (dark ? '#1A5CFF15' : '#EEF3FF') : 'transparent',
              }}
              className="flex items-center gap-2 w-full px-3 py-2 text-xs font-medium hover:opacity-80 transition-opacity text-left"
            >
              {opt.icon && <span className="opacity-60">{opt.icon}</span>}
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Indicator multi-select picker ────────────────────────────────────────────

interface IndicatorPickerProps {
  active: Set<IndicatorKey>
  onToggle: (key: IndicatorKey) => void
  dark: boolean
}

function IndicatorPicker({ active, onToggle, dark }: IndicatorPickerProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const t = THEMES[dark ? 'dark' : 'light']

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const count = active.size

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: t.surface,
          border: `1px solid ${t.border}`,
          color: t.text,
        }}
        className="flex items-center gap-2 h-8 pl-3 pr-2.5 rounded text-xs font-medium transition-all hover:opacity-80"
      >
        <Sliders className="w-3.5 h-3.5 opacity-60" />
        <span>Indicators</span>
        {count > 0 && (
          <span
            style={{ background: t.lineColor, color: '#fff' }}
            className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold"
          >
            {count}
          </span>
        )}
        <ChevronDown
          className={clsx('w-3 h-3 transition-transform opacity-50', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div
          style={{
            background: t.surface,
            border: `1px solid ${t.border}`,
            boxShadow: '0 8px 24px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.08)',
          }}
          className="absolute top-full left-0 mt-1 rounded z-50 overflow-hidden min-w-[220px]"
        >
          {INDICATOR_ORDER.map(key => {
            const def = INDICATOR_DEFS[key]
            const isOn = active.has(key)
            return (
              <button
                key={key}
                onClick={() => onToggle(key)}
                style={{
                  color: t.text,
                  background: isOn ? (dark ? '#1A5CFF15' : '#EEF3FF') : 'transparent',
                }}
                className="flex items-center gap-2 w-full px-3 py-2 text-xs font-medium hover:opacity-80 transition-opacity text-left"
              >
                <span
                  className="inline-flex items-center justify-center w-4 h-4 rounded border"
                  style={{
                    borderColor: isOn ? def.color : t.border,
                    background: isOn ? def.color : 'transparent',
                  }}
                >
                  {isOn && <Check className="w-3 h-3 text-white" />}
                </span>
                <span className="flex-1">{def.label}</span>
                <span
                  className="inline-block w-3 h-0.5 rounded"
                  style={{ background: def.color }}
                />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ChartPage() {
  const { data: simulation, isLoading: simLoading } = useQuery({
    queryKey: ['simulation', 'active'],
    queryFn: simulationApi.getActive,
    retry: false,
  })

  const { theme } = useTheme()
  const { formatSymbol } = useSymbolDisplay()
  const [chartType, setChartType] = useState<ChartType>('candlestick')
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null)
  const [lastTick, setLastTick] = useState<PriceTick | null>(null)
  const [prevClose, setPrevClose] = useState<number | null>(null)
  const [activeIndicators, setActiveIndicators] = useState<Set<IndicatorKey>>(new Set())

  const chartContainerRef   = useRef<HTMLDivElement>(null)
  const chartRef            = useRef<IChartApi | null>(null)
  const candleRef           = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const lineRef             = useRef<ISeriesApi<'Line'> | null>(null)
  const volumeRef           = useRef<ISeriesApi<'Histogram'> | null>(null)

  // Indicator series refs
  const smaRefs = useRef<Partial<Record<'sma20' | 'sma50', ISeriesApi<'Line'>>>>({})
  const emaRef  = useRef<ISeriesApi<'Line'> | null>(null)
  const bbRefs  = useRef<{ upper?: ISeriesApi<'Line'>; middle?: ISeriesApi<'Line'>; lower?: ISeriesApi<'Line'> }>({})
  const rsiRef  = useRef<ISeriesApi<'Line'> | null>(null)
  const macdRefs = useRef<{ macd?: ISeriesApi<'Line'>; signal?: ISeriesApi<'Line'>; hist?: ISeriesApi<'Histogram'> }>({})

  // Refs so live callbacks always read current values without being in dep arrays
  const selectedSymbolRef   = useRef<string | null>(null)
  selectedSymbolRef.current = selectedSymbol
  const activeIndicatorsRef = useRef<Set<IndicatorKey>>(activeIndicators)
  activeIndicatorsRef.current = activeIndicators
  const chartTypeRef = useRef<ChartType>(chartType)
  chartTypeRef.current = chartType

  // Cached OHLCV data per symbol so we can rebuild after chart type switch
  const historyRef = useRef<Record<string, OHLCBar[]>>({})

  const isDark = theme === 'dark'
  const t = THEMES[isDark ? 'dark' : 'light']

  // ── Toggle indicator ──────────────────────────────────────────────────────
  const toggleIndicator = useCallback((key: IndicatorKey) => {
    setActiveIndicators(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  // ── Apply scale-margin layout based on active panes ───────────────────────
  const applyLayout = useCallback((chart: IChartApi) => {
    const rsiOn = activeIndicatorsRef.current.has('rsi')
    const macdOn = activeIndicatorsRef.current.has('macd')
    const layout = computeLayout(rsiOn, macdOn)

    chart.priceScale('right').applyOptions({ scaleMargins: layout.price })
    chart.priceScale('volume').applyOptions({ scaleMargins: layout.volume })
    if (rsiOn && layout.rsi) {
      chart.priceScale(RSI_SCALE_ID).applyOptions({ scaleMargins: layout.rsi })
    }
    if (macdOn && layout.macd) {
      chart.priceScale(MACD_SCALE_ID).applyOptions({ scaleMargins: layout.macd })
    }
  }, [])

  // ── Build / rebuild chart ─────────────────────────────────────────────────

  const buildChart = useCallback(() => {
    if (!chartContainerRef.current) return

    // Tear down existing chart
    if (chartRef.current) {
      chartRef.current.remove()
      chartRef.current  = null
      candleRef.current = null
      lineRef.current   = null
      volumeRef.current = null
      smaRefs.current = {}
      emaRef.current = null
      bbRefs.current = {}
      rsiRef.current = null
      macdRefs.current = {}
    }

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: t.bg },
        textColor: t.textTertiary,
        fontSize: 11,
        fontFamily: "'Geist Mono', monospace",
      },
      grid: {
        vertLines: { color: t.gridLine },
        horzLines: { color: t.gridLine },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: t.crosshair, width: 1, style: LineStyle.Dashed },
        horzLine: { color: t.crosshair, width: 1, style: LineStyle.Dashed },
      },
      rightPriceScale: {
        borderColor: t.scaleBorder,
        scaleMargins: { top: 0.1, bottom: 0.28 },
        textColor: t.textTertiary,
      },
      timeScale: {
        borderColor: t.scaleBorder,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 5,
      },
      handleScale: true,
      handleScroll: true,
      width:  chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
    })

    // Volume histogram — always present
    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    })
    volumeRef.current = volumeSeries

    if (chartType === 'candlestick') {
      const candleSeries = chart.addCandlestickSeries({
        upColor:         t.upColor,
        downColor:       t.downColor,
        borderUpColor:   t.upColor,
        borderDownColor: t.downColor,
        wickUpColor:     t.upColor,
        wickDownColor:   t.downColor,
      } as Partial<CandlestickSeriesOptions>)
      candleRef.current = candleSeries
    } else {
      const lineSeries = chart.addLineSeries({
        color:     t.lineColor,
        lineWidth: 2,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius:  4,
        crosshairMarkerBorderColor: t.lineColor,
        crosshairMarkerBackgroundColor: t.bg,
        lastValueVisible: true,
        priceLineVisible: true,
        priceLineColor:   t.lineColor,
        priceLineStyle:   LineStyle.Dashed,
        priceLineWidth:   1,
      } as Partial<LineSeriesOptions>)
      lineRef.current = lineSeries
    }

    chartRef.current = chart

    // Materialize indicator series for whatever's currently active, then layout.
    syncIndicatorSeries()
    applyLayout(chart)

    // Replay cached history for the selected symbol
    const sym = selectedSymbolRef.current
    if (sym && historyRef.current[sym]?.length) {
      const bars = historyRef.current[sym]
      pushHistoryToSeries(bars)
      chart.timeScale().fitContent()
    }

    // Responsive resize
    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      chart.applyOptions({ width, height })
    })
    observer.observe(chartContainerRef.current)

    return () => {
      observer.disconnect()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDark, chartType, t])

  // ── Sync indicator series (add/remove based on activeIndicators) ──────────
  const syncIndicatorSeries = useCallback(() => {
    const chart = chartRef.current
    if (!chart) return
    const active = activeIndicatorsRef.current

    // Helper to remove a series safely
    const remove = (s: ISeriesApi<any> | undefined | null) => {
      if (s) {
        try { chart.removeSeries(s) } catch { /* already removed */ }
      }
    }

    // SMA 20
    if (active.has('sma20') && !smaRefs.current.sma20) {
      smaRefs.current.sma20 = chart.addLineSeries({
        color: INDICATOR_DEFS.sma20.color,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      })
    } else if (!active.has('sma20') && smaRefs.current.sma20) {
      remove(smaRefs.current.sma20)
      smaRefs.current.sma20 = undefined
    }

    // SMA 50
    if (active.has('sma50') && !smaRefs.current.sma50) {
      smaRefs.current.sma50 = chart.addLineSeries({
        color: INDICATOR_DEFS.sma50.color,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      })
    } else if (!active.has('sma50') && smaRefs.current.sma50) {
      remove(smaRefs.current.sma50)
      smaRefs.current.sma50 = undefined
    }

    // EMA 20
    if (active.has('ema20') && !emaRef.current) {
      emaRef.current = chart.addLineSeries({
        color: INDICATOR_DEFS.ema20.color,
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      })
    } else if (!active.has('ema20') && emaRef.current) {
      remove(emaRef.current)
      emaRef.current = null
    }

    // Bollinger Bands (3 lines)
    if (active.has('bb')) {
      if (!bbRefs.current.upper) {
        bbRefs.current.upper = chart.addLineSeries({
          color: INDICATOR_DEFS.bb.color,
          lineWidth: 1,
          lineStyle: LineStyle.Solid,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        })
        bbRefs.current.middle = chart.addLineSeries({
          color: INDICATOR_DEFS.bb.color,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        })
        bbRefs.current.lower = chart.addLineSeries({
          color: INDICATOR_DEFS.bb.color,
          lineWidth: 1,
          lineStyle: LineStyle.Solid,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        })
      }
    } else if (bbRefs.current.upper) {
      remove(bbRefs.current.upper)
      remove(bbRefs.current.middle)
      remove(bbRefs.current.lower)
      bbRefs.current = {}
    }

    // RSI (separate pane)
    if (active.has('rsi') && !rsiRef.current) {
      rsiRef.current = chart.addLineSeries({
        color: INDICATOR_DEFS.rsi.color,
        lineWidth: 2,
        priceScaleId: RSI_SCALE_ID,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: true,
      })
      // Reference levels: 70 (overbought), 30 (oversold)
      rsiRef.current.createPriceLine({
        price: 70, color: t.downColor, lineStyle: LineStyle.Dashed, lineWidth: 1,
        axisLabelVisible: true, title: '70',
      })
      rsiRef.current.createPriceLine({
        price: 30, color: t.upColor, lineStyle: LineStyle.Dashed, lineWidth: 1,
        axisLabelVisible: true, title: '30',
      })
    } else if (!active.has('rsi') && rsiRef.current) {
      remove(rsiRef.current)
      rsiRef.current = null
    }

    // MACD (separate pane: macd line, signal line, histogram)
    if (active.has('macd') && !macdRefs.current.macd) {
      macdRefs.current.hist = chart.addHistogramSeries({
        priceScaleId: MACD_SCALE_ID,
        priceLineVisible: false,
        lastValueVisible: false,
      })
      macdRefs.current.macd = chart.addLineSeries({
        color: INDICATOR_DEFS.macd.color,
        lineWidth: 2,
        priceScaleId: MACD_SCALE_ID,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      })
      macdRefs.current.signal = chart.addLineSeries({
        color: '#F97316',
        lineWidth: 1,
        priceScaleId: MACD_SCALE_ID,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      })
    } else if (!active.has('macd') && macdRefs.current.macd) {
      remove(macdRefs.current.macd)
      remove(macdRefs.current.signal)
      remove(macdRefs.current.hist)
      macdRefs.current = {}
    }

    applyLayout(chart)
  }, [t.downColor, t.upColor, applyLayout])

  // ── Push history to all active series (price + volume + indicators) ───────
  const pushHistoryToSeries = useCallback((bars: OHLCBar[]) => {
    if (bars.length === 0) return

    // Price series
    if (chartTypeRef.current === 'candlestick' && candleRef.current) {
      candleRef.current.setData(bars.map(b => ({
        time: b.time as unknown as Time,
        open: b.open, high: b.high, low: b.low, close: b.close,
      })))
    } else if (lineRef.current) {
      lineRef.current.setData(bars.map(b => ({
        time: b.time as unknown as Time,
        value: b.close,
      })))
    }

    // Volume series
    if (volumeRef.current) {
      volumeRef.current.setData(bars.map(b => ({
        time: b.time as unknown as Time,
        value: b.volume,
        color: b.close >= b.open ? t.volUp : t.volDown,
      })))
    }

    // Indicators
    pushIndicatorsToSeries(bars)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.volUp, t.volDown])

  // ── Recompute & push indicator data based on cached bars ──────────────────
  const pushIndicatorsToSeries = useCallback((bars: OHLCBar[]) => {
    if (bars.length === 0) return
    const active = activeIndicatorsRef.current

    if (active.has('sma20') && smaRefs.current.sma20) {
      smaRefs.current.sma20.setData(
        calcSMA(bars, 20).map(p => ({ time: p.time as unknown as Time, value: p.value })),
      )
    }
    if (active.has('sma50') && smaRefs.current.sma50) {
      smaRefs.current.sma50.setData(
        calcSMA(bars, 50).map(p => ({ time: p.time as unknown as Time, value: p.value })),
      )
    }
    if (active.has('ema20') && emaRef.current) {
      emaRef.current.setData(
        calcEMA(bars, 20).map(p => ({ time: p.time as unknown as Time, value: p.value })),
      )
    }
    if (active.has('bb') && bbRefs.current.upper && bbRefs.current.middle && bbRefs.current.lower) {
      const bb = calcBollingerBands(bars, 20, 2)
      bbRefs.current.upper.setData(bb.map(p => ({ time: p.time as unknown as Time, value: p.upper })))
      bbRefs.current.middle.setData(bb.map(p => ({ time: p.time as unknown as Time, value: p.middle })))
      bbRefs.current.lower.setData(bb.map(p => ({ time: p.time as unknown as Time, value: p.lower })))
    }
    if (active.has('rsi') && rsiRef.current) {
      rsiRef.current.setData(
        calcRSI(bars, 14).map(p => ({ time: p.time as unknown as Time, value: p.value })),
      )
    }
    if (active.has('macd') && macdRefs.current.macd && macdRefs.current.signal && macdRefs.current.hist) {
      const macd = calcMACD(bars, 12, 26, 9)
      macdRefs.current.macd.setData(macd.map(p => ({ time: p.time as unknown as Time, value: p.macd })))
      macdRefs.current.signal.setData(macd.map(p => ({ time: p.time as unknown as Time, value: p.signal })))
      macdRefs.current.hist.setData(macd.map(p => ({
        time: p.time as unknown as Time,
        value: p.histogram,
        color: p.histogram >= 0 ? t.upColor : t.downColor,
      })))
    }
  }, [t.upColor, t.downColor])

  // Rebuild chart when theme or chart type changes
  useEffect(() => {
    const cleanup = buildChart()
    return () => {
      cleanup?.()
      if (chartRef.current) {
        chartRef.current.remove()
        chartRef.current  = null
        candleRef.current = null
        lineRef.current   = null
        volumeRef.current = null
        smaRefs.current = {}
        emaRef.current = null
        bbRefs.current = {}
        rsiRef.current = null
        macdRefs.current = {}
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDark, chartType])

  // When activeIndicators changes: add/remove series, repopulate from cache
  useEffect(() => {
    if (!chartRef.current) return
    syncIndicatorSeries()
    const sym = selectedSymbolRef.current
    if (sym && historyRef.current[sym]?.length) {
      pushIndicatorsToSeries(historyRef.current[sym])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndicators])

  // When selected symbol changes: reset price ticker and replay cached history.
  useEffect(() => {
    if (!selectedSymbol || !chartRef.current) return

    const bars = historyRef.current[selectedSymbol] ?? []
    if (bars.length > 0) {
      pushHistoryToSeries(bars)
      chartRef.current.timeScale().fitContent()
    }

    setLastTick(null)
    setPrevClose(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSymbol])

  // ── WebSocket ticks ───────────────────────────────────────────────────────

  const { priceMap, connected, simulationTime } = useSimulationSocket({
    simulationId: simulation?.id ?? null,
    onTick: (tick: SimulationTick) => {
      let activeBars: OHLCBar[] | null = null

      tick.ticks.forEach(tickItem => {
        const sym = tickItem.symbol
        const ts  = Math.floor(new Date(tickItem.timestamp).getTime() / 1000)

        // Cache in history
        if (!historyRef.current[sym]) historyRef.current[sym] = []
        const hist = historyRef.current[sym]
        const last = hist[hist.length - 1]

        if (last && last.time === ts) {
          // Same bar — update in place
          last.high   = Math.max(last.high, tickItem.high)
          last.low    = Math.min(last.low, tickItem.low)
          last.close  = tickItem.close
          last.volume = tickItem.volume
        } else {
          hist.push({
            time: ts,
            open: tickItem.open,
            high: tickItem.high,
            low: tickItem.low,
            close: tickItem.close,
            volume: tickItem.volume,
          })
        }

        // Push to chart only if this is the active symbol
        if (sym !== selectedSymbolRef.current) return
        if (!candleRef.current && !lineRef.current) return

        if (chartTypeRef.current === 'candlestick' && candleRef.current) {
          candleRef.current.update({
            time: ts as unknown as Time,
            open: tickItem.open, high: tickItem.high, low: tickItem.low, close: tickItem.close,
          })
        } else if (lineRef.current) {
          lineRef.current.update({
            time: ts as unknown as Time,
            value: tickItem.close,
          })
        }
        if (volumeRef.current) {
          volumeRef.current.update({
            time: ts as unknown as Time,
            value: tickItem.volume,
            color: tickItem.close >= tickItem.open ? t.volUp : t.volDown,
          })
        }

        activeBars = hist
      })

      // Recompute indicators if any are active and the active symbol got a tick
      if (activeBars && activeIndicatorsRef.current.size > 0) {
        pushIndicatorsToSeries(activeBars)
      }

      // Update price ticker for selected symbol
      if (selectedSymbol) {
        const t2 = tick.ticks.find(t => t.symbol === selectedSymbol)
        if (t2) {
          setLastTick(prev => {
            setPrevClose(prev?.close ?? null)
            return t2
          })
        }
      }
    },
  })

  const symbols = Object.keys(priceMap).sort()

  // Auto-select first symbol
  useEffect(() => {
    if (!selectedSymbol && symbols.length > 0) {
      setSelectedSymbol(symbols[0])
    }
  }, [symbols, selectedSymbol])

  // ── Fetch tick history from API ───────────────────────────────────────────
  const { data: tickHistory } = useQuery({
    queryKey: ['ticks', simulation?.id, selectedSymbol],
    queryFn: () => simulationApi.getTicks(simulation!.id, selectedSymbol!),
    enabled: !!simulation?.id && !!selectedSymbol,
    staleTime: 0,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  })

  // Populate historyRef + chart when API history arrives.
  useEffect(() => {
    if (!tickHistory || !selectedSymbol || !chartRef.current) return

    // Cutoff: only show bars the simulation has already played
    const cutoffMs = simulationTime
      ? new Date(simulationTime).getTime() + 60_000
      : Infinity

    const bars = tickHistory
      .filter(tick => new Date(tick.timestamp).getTime() <= cutoffMs)
      .map(tick => ({
        time:   Math.floor(new Date(tick.timestamp).getTime() / 1000),
        open:   tick.open,
        high:   tick.high,
        low:    tick.low,
        close:  tick.close,
        volume: tick.volume,
      }))

    // Merge with any live ticks already buffered in historyRef
    const existing = historyRef.current[selectedSymbol] ?? []
    const barTimes = new Set(bars.map(b => b.time))
    const merged   = [...bars, ...existing.filter(b => !barTimes.has(b.time))]
    merged.sort((a, b) => a.time - b.time)
    historyRef.current[selectedSymbol] = merged

    if (merged.length === 0) return

    pushHistoryToSeries(merged)
    chartRef.current.timeScale().fitContent()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickHistory])

  // ── Derived UI state ──────────────────────────────────────────────────────

  const priceChange = lastTick && prevClose
    ? ((lastTick.close - prevClose) / prevClose) * 100
    : null
  const priceUp = (priceChange ?? 0) >= 0

  const chartTypeOptions: { value: ChartType; label: string; icon: React.ReactNode }[] = [
    { value: 'candlestick', label: 'Candlestick', icon: <BarChart2 className="w-3.5 h-3.5" /> },
    { value: 'line',        label: 'Line Chart',  icon: <TrendingUp className="w-3.5 h-3.5" /> },
  ]

  const symbolOptions = symbols.map(s => ({ value: s, label: formatSymbol(s), icon: undefined }))

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="flex flex-col h-full transition-colors duration-300"
      style={{ background: t.bg, minHeight: '100%' }}
    >
      {/* ── Top toolbar ─────────────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-3 px-5 py-3 border-b flex-wrap"
        style={{ borderColor: t.border, background: t.bg }}
      >
        {/* Title */}
        <div className="mr-1">
          <h1 className="text-sm font-semibold tracking-tight" style={{ color: t.text }}>
            Charts
          </h1>
          <p className="text-[10px] font-mono mt-0.5" style={{ color: t.textTertiary }}>
            {simulationTime
              ? new Date(simulationTime).toLocaleString('en-US', { hour12: false })
              : connected ? 'Waiting for data…' : 'Not connected'}
          </p>
        </div>

        {/* Divider */}
        <div className="hidden sm:block w-px h-6 self-center" style={{ background: t.border }} />

        {/* Chart type dropdown */}
        <Dropdown
          value={chartType}
          options={chartTypeOptions}
          onChange={setChartType}
          dark={isDark}
        />

        {/* Symbol dropdown */}
        {symbols.length > 0 ? (
          <Dropdown
            value={selectedSymbol ?? symbols[0]}
            options={symbolOptions}
            onChange={setSelectedSymbol}
            dark={isDark}
            className="min-w-[110px]"
          />
        ) : (
          <div
            className="flex items-center gap-2 h-8 px-3 rounded text-xs"
            style={{ color: t.textTertiary, border: `1px solid ${t.border}`, background: t.surface }}
          >
            {connected ? (
              <><Spinner size="sm" /> <span>Loading symbols…</span></>
            ) : (
              <span>No simulation</span>
            )}
          </div>
        )}

        {/* Indicator picker */}
        <IndicatorPicker
          active={activeIndicators}
          onToggle={toggleIndicator}
          dark={isDark}
        />

        {/* Spacer */}
        <div className="flex-1" />

        {/* Connection badge */}
        <div
          className="hidden sm:flex items-center gap-1.5 text-[10px] font-medium px-2 py-1 rounded-full"
          style={{
            background: connected ? (isDark ? '#0D7A4E22' : '#E8F7F1') : (isDark ? '#2C2C29' : '#F2F1EF'),
            color: connected ? t.upColor : t.textTertiary,
          }}
        >
          <span
            className={clsx('w-1.5 h-1.5 rounded-full', connected && 'animate-pulse_dot')}
            style={{ background: connected ? t.upColor : t.textTertiary }}
          />
          {connected ? 'Live' : 'Offline'}
        </div>
      </div>

      {/* ── Price ticker bar ─────────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-4 px-5 py-2.5 border-b flex-wrap"
        style={{ borderColor: t.border, background: t.surface, minHeight: 50 }}
      >
        {lastTick && selectedSymbol ? (
          <>
            {/* Symbol name */}
            <span
              className="text-xs font-semibold tracking-widest uppercase font-mono"
              style={{ color: t.textSecondary }}
            >
              {formatSymbol(selectedSymbol)}
            </span>

            {/* Price */}
            <span
              className="text-2xl font-mono font-semibold tabular-nums"
              style={{ color: t.text }}
            >
              {fmt(lastTick.close)}
            </span>

            {/* Change badge */}
            {priceChange !== null && (
              <Badge variant={priceUp ? 'success' : 'danger'} size="md">
                {priceUp ? '+' : ''}{fmt(priceChange)}%
              </Badge>
            )}

            {/* OHLV */}
            <div className="flex items-center gap-3 ml-2">
              {[
                { label: 'O', val: fmt(lastTick.open) },
                { label: 'H', val: fmt(lastTick.high) },
                { label: 'L', val: fmt(lastTick.low) },
                { label: 'V', val: lastTick.volume.toLocaleString() },
              ].map(({ label, val }) => (
                <span key={label} className="text-[11px] font-mono" style={{ color: t.textTertiary }}>
                  {label}{' '}
                  <span style={{ color: t.text }}>{val}</span>
                </span>
              ))}
            </div>

            {/* Active indicator legend */}
            {activeIndicators.size > 0 && (
              <div className="flex items-center gap-2 ml-3 flex-wrap">
                {INDICATOR_ORDER.filter(k => activeIndicators.has(k)).map(k => (
                  <span
                    key={k}
                    className="inline-flex items-center gap-1.5 text-[10px] font-mono px-2 py-0.5 rounded"
                    style={{
                      color: t.textSecondary,
                      background: isDark ? '#0F0F0E' : '#FFFFFF',
                      border: `1px solid ${t.border}`,
                    }}
                  >
                    <span
                      className="inline-block w-2 h-0.5 rounded"
                      style={{ background: INDICATOR_DEFS[k].color }}
                    />
                    {INDICATOR_DEFS[k].label}
                  </span>
                ))}
              </div>
            )}
          </>
        ) : (
          <span className="text-xs" style={{ color: t.textTertiary }}>
            {connected && symbols.length > 0
              ? 'Select a symbol to see price data'
              : connected
              ? 'Waiting for ticks…'
              : 'Connect to a simulation to see data'}
          </span>
        )}
      </div>

      {/* ── Chart area ───────────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 relative" style={{ background: t.bg }}>
        <div ref={chartContainerRef} className="w-full h-full" />

        {/* Overlay: no simulation */}
        {!simulation && !simLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3" style={{ background: t.bg }}>
            <Activity className="w-8 h-8" style={{ color: t.textTertiary }} />
            <p className="text-sm text-center max-w-xs" style={{ color: t.textSecondary }}>
              No active simulation found.{' '}
              <span style={{ color: t.text, fontWeight: 600 }}>
                Your instructor needs to create and start a simulation first.
              </span>
            </p>
          </div>
        )}

        {/* Overlay: connecting */}
        {simulation && !connected && symbols.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3" style={{ background: t.bg }}>
            <Spinner size="lg" />
            <p className="text-sm" style={{ color: t.textSecondary }}>
              Connecting to simulation…
            </p>
          </div>
        )}

        {/* Overlay: no symbol selected yet */}
        {simulation && connected && !selectedSymbol && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: t.bg }}>
            <p className="text-sm" style={{ color: t.textSecondary }}>
              Select a symbol from the dropdown above to view its chart
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
