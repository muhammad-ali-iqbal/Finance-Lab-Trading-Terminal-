// src/pages/student/ChartPage.tsx
// Enhanced chart page with:
//   • Candlestick and Line chart types (dropdown)
//   • Symbol selector (dropdown)
//   • Dark / Light mode toggle (slider)
//   • Volume histogram overlay
//   • Real-time tick feed via WebSocket

import { useEffect, useRef, useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  type CandlestickSeriesOptions,
  type LineSeriesOptions,
  ColorType,
  CrosshairMode,
  LineStyle,
} from 'lightweight-charts'
import { simulationApi } from '@/api'
import { useSimulationSocket } from '@/hooks/useSimulationSocket'
import { useTheme } from '@/context/ThemeContext'
import { Spinner, Badge } from '@/components/ui'
import type { PriceTick, SimulationTick } from '@/types'
import clsx from 'clsx'
import { Activity, ChevronDown, BarChart2, TrendingUp } from 'lucide-react'

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

// ── Main component ────────────────────────────────────────────────────────────

export default function ChartPage() {
  const { data: simulation, isLoading: simLoading } = useQuery({
    queryKey: ['simulation', 'active'],
    queryFn: simulationApi.getActive,
    retry: false,
  })

  const { theme } = useTheme()
  const [chartType, setChartType] = useState<ChartType>('candlestick')
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null)
  const [lastTick, setLastTick] = useState<PriceTick | null>(null)
  const [prevClose, setPrevClose] = useState<number | null>(null)

  const chartContainerRef   = useRef<HTMLDivElement>(null)
  const chartRef            = useRef<IChartApi | null>(null)
  const candleRef           = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const lineRef             = useRef<ISeriesApi<'Line'> | null>(null)
  const volumeRef           = useRef<ISeriesApi<'Histogram'> | null>(null)
  // Ref so buildChart always reads the current symbol without being in its dep array
  const selectedSymbolRef   = useRef<string | null>(null)
  selectedSymbolRef.current = selectedSymbol

  // Cached OHLCV data per symbol so we can rebuild after chart type switch
  const historyRef  = useRef<Record<string, { time: number; open: number; high: number; low: number; close: number; volume: number }[]>>({})

  const isDark = theme === 'dark'
  const t = THEMES[isDark ? 'dark' : 'light']

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
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.78, bottom: 0 },
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

    // Replay cached history for the selected symbol (uses ref so closure is never stale)
    const sym = selectedSymbolRef.current
    if (sym && historyRef.current[sym]?.length) {
      const bars = historyRef.current[sym]
      if (chartType === 'candlestick' && candleRef.current) {
        candleRef.current.setData(bars.map(b => ({
          time: b.time as unknown as import('lightweight-charts').Time,
          open: b.open, high: b.high, low: b.low, close: b.close,
        })))
      } else if (lineRef.current) {
        lineRef.current.setData(bars.map(b => ({
          time: b.time as unknown as import('lightweight-charts').Time,
          value: b.close,
        })))
      }
      volumeRef.current.setData(bars.map(b => ({
        time: b.time as unknown as import('lightweight-charts').Time,
        value: b.volume,
        color: b.close >= b.open ? t.volUp : t.volDown,
      })))
      chart.timeScale().fitContent()
    }

    // Responsive resize
    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      chart.applyOptions({ width, height })
    })
    observer.observe(chartContainerRef.current)
    chartRef.current = chart

    return () => {
      observer.disconnect()
    }
  }, [isDark, chartType, t])

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
      }
    }
  }, [isDark, chartType]) // eslint-disable-line

  // When selected symbol changes: reset price ticker and replay cached history.
  // The setData calls here only fire when historyRef already has data (i.e. user
  // switches to a symbol they already viewed). Initial data load is handled by
  // the tickHistory query effect below, which avoids the setData([]) wipe.
  useEffect(() => {
    if (!selectedSymbol || !chartRef.current) return

    const bars = historyRef.current[selectedSymbol] ?? []
    if (bars.length > 0) {
      if (chartType === 'candlestick' && candleRef.current) {
        candleRef.current.setData(bars.map(b => ({
          time: b.time as unknown as import('lightweight-charts').Time,
          open: b.open, high: b.high, low: b.low, close: b.close,
        })))
      } else if (lineRef.current) {
        lineRef.current.setData(bars.map(b => ({
          time: b.time as unknown as import('lightweight-charts').Time,
          value: b.close,
        })))
      }
      if (volumeRef.current) {
        volumeRef.current.setData(bars.map(b => ({
          time: b.time as unknown as import('lightweight-charts').Time,
          value: b.volume,
          color: b.close >= b.open ? t.volUp : t.volDown,
        })))
      }
      chartRef.current.timeScale().fitContent()
    }

    setLastTick(null)
    setPrevClose(null)
  }, [selectedSymbol]) // eslint-disable-line

  // ── WebSocket ticks ───────────────────────────────────────────────────────

  const { priceMap, connected, simulationTime } = useSimulationSocket({
    simulationId: simulation?.id ?? null,
    onTick: (tick: SimulationTick) => {
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
          hist.push({ time: ts, open: tickItem.open, high: tickItem.high, low: tickItem.low, close: tickItem.close, volume: tickItem.volume })
        }

        // Push to chart only if this is the active symbol
        if (sym !== selectedSymbol) return
        if (!candleRef.current && !lineRef.current) return

        if (chartType === 'candlestick' && candleRef.current) {
          candleRef.current.update({
            time: ts as unknown as import('lightweight-charts').Time,
            open: tickItem.open, high: tickItem.high, low: tickItem.low, close: tickItem.close,
          })
        } else if (lineRef.current) {
          lineRef.current.update({
            time: ts as unknown as import('lightweight-charts').Time,
            value: tickItem.close,
          })
        }
        if (volumeRef.current) {
          volumeRef.current.update({
            time: ts as unknown as import('lightweight-charts').Time,
            value: tickItem.volume,
            color: tickItem.close >= tickItem.open ? t.volUp : t.volDown,
          })
        }
      })

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
  // refetchOnMount:true + staleTime:0 → always re-fetches when returning to
  // this page so the chart restores up to the current sim position.
  // refetchOnWindowFocus:false → prevents spurious mid-session refetches that
  // caused the previous "whites out" regression.
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
  // We filter to simulationTime so we don't reveal future (unplayed) ticks.
  // simulationTime is read from the closure at effect-run time — intentionally
  // NOT in deps so this doesn't re-run on every live tick.
  useEffect(() => {
    if (!tickHistory || !selectedSymbol || !chartRef.current) return

    // Cutoff: only show bars the simulation has already played
    const cutoffMs = simulationTime
      ? new Date(simulationTime).getTime() + 60_000 // +1 min tolerance for clock lag
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

    if (chartType === 'candlestick' && candleRef.current) {
      candleRef.current.setData(merged.map(b => ({
        time:  b.time as unknown as import('lightweight-charts').Time,
        open:  b.open, high: b.high, low: b.low, close: b.close,
      })))
    } else if (lineRef.current) {
      lineRef.current.setData(merged.map(b => ({
        time:  b.time as unknown as import('lightweight-charts').Time,
        value: b.close,
      })))
    }
    if (volumeRef.current) {
      volumeRef.current.setData(merged.map(b => ({
        time:  b.time as unknown as import('lightweight-charts').Time,
        value: b.volume,
        color: b.close >= b.open ? t.volUp : t.volDown,
      })))
    }
    chartRef.current.timeScale().fitContent()
  }, [tickHistory]) // eslint-disable-line

  // ── Derived UI state ──────────────────────────────────────────────────────

  const priceChange = lastTick && prevClose
    ? ((lastTick.close - prevClose) / prevClose) * 100
    : null
  const priceUp = (priceChange ?? 0) >= 0

  const chartTypeOptions: { value: ChartType; label: string; icon: React.ReactNode }[] = [
    { value: 'candlestick', label: 'Candlestick', icon: <BarChart2 className="w-3.5 h-3.5" /> },
    { value: 'line',        label: 'Line Chart',  icon: <TrendingUp className="w-3.5 h-3.5" /> },
  ]

  const symbolOptions = symbols.map(s => ({ value: s, label: s, icon: undefined }))

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
              {selectedSymbol}
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
        {/*
          Chart container is ALWAYS rendered so chartContainerRef.current is never
          null when buildChart() runs. Overlay messages sit on top via absolute
          positioning when the chart shouldn't be visible yet.
        */}
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
