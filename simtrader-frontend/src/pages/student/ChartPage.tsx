// src/pages/student/ChartPage.tsx
// Lightweight Charts v4 — OHLCV candlestick chart fed by WebSocket ticks.
// Each tick from the simulation clock appends a new candle in real time.

import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createChart, type IChartApi, type ISeriesApi, ColorType, CrosshairMode } from 'lightweight-charts'
import { simulationApi } from '@/api'
import { useSimulationSocket } from '@/hooks/useSimulationSocket'
import { Card, Spinner, Badge } from '@/components/ui'
import type { PriceTick, SimulationTick } from '@/types'
import clsx from 'clsx'

function fmt(n: number, d = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}

export default function ChartPage() {
  const { data: simulation } = useQuery({
    queryKey: ['simulation', 'active'],
    queryFn: simulationApi.getActive,
    retry: false,
  })

  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null)
  const [lastTick, setLastTick] = useState<PriceTick | null>(null)
  const [prevClose, setPrevClose] = useState<number | null>(null)

  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef   = useRef<IChartApi | null>(null)
  const seriesRef  = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volumeRef  = useRef<ISeriesApi<'Histogram'> | null>(null)

  // Build chart once on mount
  useEffect(() => {
    if (!chartContainerRef.current) return

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#FFFFFF' },
        textColor: '#8A8A85',
        fontSize: 11,
        fontFamily: "'Geist Mono', monospace",
      },
      grid: {
        vertLines: { color: '#F2F1EF' },
        horzLines: { color: '#F2F1EF' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: '#C4C4BF', width: 1, style: 3 },
        horzLine: { color: '#C4C4BF', width: 1, style: 3 },
      },
      rightPriceScale: {
        borderColor: '#E4E4E0',
        scaleMargins: { top: 0.1, bottom: 0.3 },
      },
      timeScale: {
        borderColor: '#E4E4E0',
        timeVisible: true,
        secondsVisible: false,
      },
      width:  chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
    })

    const candleSeries = chart.addCandlestickSeries({
      upColor:          '#0D7A4E',
      downColor:        '#C8291A',
      borderUpColor:    '#0D7A4E',
      borderDownColor:  '#C8291A',
      wickUpColor:      '#0D7A4E',
      wickDownColor:    '#C8291A',
    })

    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    })
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.75, bottom: 0 },
    })

    chartRef.current  = chart
    seriesRef.current = candleSeries
    volumeRef.current = volumeSeries

    // Responsive resize
    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      chart.applyOptions({ width, height })
    })
    observer.observe(chartContainerRef.current)

    return () => {
      observer.disconnect()
      chart.remove()
    }
  }, [])

  // Receive ticks from WebSocket and push to chart
  const { priceMap, connected, simulationTime } = useSimulationSocket({
    simulationId: simulation?.id ?? null,
    onTick: (tick: SimulationTick) => {
      if (!seriesRef.current || !volumeRef.current || !selectedSymbol) return
      const t = tick.ticks.find(t => t.symbol === selectedSymbol)
      if (!t) return

      const ts = Math.floor(new Date(t.timestamp).getTime() / 1000) as unknown as number

      seriesRef.current.update({
        time: ts as unknown as import('lightweight-charts').Time,
        open: t.open, high: t.high, low: t.low, close: t.close,
      })
      volumeRef.current.update({
        time: ts as unknown as import('lightweight-charts').Time,
        value: t.volume,
        color: t.close >= t.open ? '#0D7A4E33' : '#C8291A33',
      })

      setLastTick(prev => {
        setPrevClose(prev?.close ?? null)
        return t
      })
    },
  })

  const symbols = Object.keys(priceMap)

  // Auto-select first symbol when data arrives
  useEffect(() => {
    if (!selectedSymbol && symbols.length > 0) {
      setSelectedSymbol(symbols[0])
    }
  }, [symbols, selectedSymbol])

  // Price change indicator
  const priceChange = lastTick && prevClose
    ? ((lastTick.close - prevClose) / prevClose) * 100
    : null
  const priceUp = (priceChange ?? 0) >= 0

  return (
    <div className="flex flex-col h-full p-6 gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-ink tracking-tight">Charts</h1>
          <p className="text-sm text-ink-secondary mt-0.5">
            Simulated time:{' '}
            <span className="font-mono text-ink">
              {simulationTime ? new Date(simulationTime).toLocaleString() : '—'}
            </span>
          </p>
        </div>

        {/* Symbol selector */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {symbols.map(s => (
            <button
              key={s}
              onClick={() => setSelectedSymbol(s)}
              className={clsx(
                'px-3 py-1.5 rounded border text-xs font-mono font-semibold transition-all',
                selectedSymbol === s
                  ? 'border-ink bg-ink text-surface'
                  : 'border-border text-ink-secondary hover:border-border-strong hover:text-ink'
              )}
            >
              {s}
            </button>
          ))}
          {symbols.length === 0 && !connected && (
            <Spinner size="sm" />
          )}
        </div>
      </div>

      {/* Price ticker */}
      {lastTick && selectedSymbol === lastTick.symbol && (
        <div className="flex items-baseline gap-3 flex-wrap">
          <span className="text-3xl font-mono font-semibold text-ink tabular-nums">
            ${fmt(lastTick.close)}
          </span>
          {priceChange !== null && (
            <Badge variant={priceUp ? 'success' : 'danger'} size="md">
              {priceUp ? '+' : ''}{fmt(priceChange)}%
            </Badge>
          )}
          <div className="flex gap-4 text-xs font-mono text-ink-tertiary">
            <span>O <span className="text-ink">{fmt(lastTick.open)}</span></span>
            <span>H <span className="text-ink">{fmt(lastTick.high)}</span></span>
            <span>L <span className="text-ink">{fmt(lastTick.low)}</span></span>
            <span>V <span className="text-ink">{lastTick.volume.toLocaleString()}</span></span>
          </div>
        </div>
      )}

      {/* Chart */}
      <Card padding="none" className="flex-1 min-h-0 overflow-hidden">
        {!connected && symbols.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Spinner size="lg" />
            <p className="text-sm text-ink-secondary">Connecting to simulation…</p>
          </div>
        ) : !selectedSymbol ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-ink-secondary">Select a symbol above to view its chart</p>
          </div>
        ) : (
          <div ref={chartContainerRef} className="w-full h-full" />
        )}
      </Card>
    </div>
  )
}
