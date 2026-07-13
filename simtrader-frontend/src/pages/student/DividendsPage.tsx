// src/pages/student/DividendsPage.tsx
// Live PSX dividend / bonus / right announcements, proxied from
// dps.psx.com.pk/payouts by the backend (cached ~30 min).
//
// Search accepts a ticker OR a company name: suggestions come from the PSX
// listed-securities directory (cached daily by the backend) and are ranked
// client-side as the user types. Selecting a suggestion queries payouts for
// that exact ticker.

import { useMemo, useRef, useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { dividendApi } from '@/api'
import type { DividendPayout, PSXSymbol } from '@/api'
import { Spinner, Badge, Button, Input } from '@/components/ui'
import { Banknote, Search, X } from 'lucide-react'

// The Announcement column encodes the payout kind in a suffix:
//   (D) cash dividend · (B) bonus shares · (R) right shares
// and the period in the percentage part: (i)/(ii)… interim, (F) final.
function kindBadge(announcement: string) {
  if (announcement.includes('(B)')) return <Badge variant="accent">Bonus</Badge>
  if (announcement.includes('(R)')) return <Badge variant="warning">Right</Badge>
  if (announcement.includes('(D)')) return <Badge variant="success">Dividend</Badge>
  return <Badge variant="neutral">Other</Badge>
}

// Strip the kind suffix — the badge already says it.
function payoutAmount(announcement: string) {
  return announcement.replace(/\((D|B|R)\)/g, '').trim()
}

// Rank directory entries against the query: ticker prefix beats ticker
// substring, which beats company-name word prefix, which beats name
// substring. Ties break by shorter ticker (HBL before HBLTETF).
function rankSymbols(symbols: PSXSymbol[], query: string, limit = 8): PSXSymbol[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const scored: { s: PSXSymbol; score: number }[] = []
  for (const s of symbols) {
    const sym = s.symbol.toLowerCase()
    const name = s.name.toLowerCase()
    let score: number
    if (sym.startsWith(q)) score = 0
    else if (sym.includes(q)) score = 1
    else if (name.split(/\s+/).some(w => w.startsWith(q))) score = 2
    else if (name.includes(q)) score = 3
    else continue
    scored.push({ s, score })
  }
  scored.sort((a, b) =>
    a.score - b.score ||
    a.s.symbol.length - b.s.symbol.length ||
    a.s.symbol.localeCompare(b.s.symbol),
  )
  return scored.slice(0, limit).map(x => x.s)
}

function PayoutRow({ p }: { p: DividendPayout }) {
  return (
    <tr className="border-b border-border dark:border-dark-border last:border-0 hover:bg-surface-secondary dark:hover:bg-dark-surface-secondary transition-colors">
      <td className="px-3 py-2.5 whitespace-nowrap">
        {/* Same destination the symbol links to on the PSX payouts page */}
        <a
          href={`https://dps.psx.com.pk/company/${encodeURIComponent(p.symbol)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-ink dark:text-dark-ink hover:text-accent dark:hover:text-dark-accent hover:underline underline-offset-2 transition-colors"
          title={`View ${p.symbol} on the PSX data portal`}
        >
          {p.symbol}
        </a>
      </td>
      <td className="px-3 py-2.5 text-ink-secondary dark:text-dark-ink-secondary">
        <p>{p.company}</p>
        <p className="text-[10px] text-ink-tertiary dark:text-dark-ink-tertiary">{p.sector}</p>
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap">{kindBadge(p.announcement)}</td>
      <td className="px-3 py-2.5 font-medium text-ink dark:text-dark-ink whitespace-nowrap">{payoutAmount(p.announcement)}</td>
      <td className="px-3 py-2.5 text-ink-secondary dark:text-dark-ink-secondary whitespace-nowrap">{p.announcedAt}</td>
      <td className="px-3 py-2.5 text-ink-secondary dark:text-dark-ink-secondary whitespace-nowrap">{p.bookClosure}</td>
    </tr>
  )
}

export default function DividendsPage() {
  const [input, setInput] = useState('')
  const [symbol, setSymbol] = useState('')          // active payouts filter
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // PSX listed-securities directory — powers the suggestions.
  const { data: symbolsData } = useQuery({
    queryKey: ['dividends', 'symbols'],
    queryFn: dividendApi.symbols,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  })
  const directory = symbolsData?.symbols ?? []

  const suggestions = useMemo(
    () => rankSymbols(directory, input),
    [directory, input],
  )

  const { data, isLoading, isFetching, isError } = useQuery({
    queryKey: ['dividends', symbol],
    queryFn: () => dividendApi.list(symbol || undefined),
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  })
  const payouts = data?.payouts ?? []

  const activeCompany = symbol
    ? directory.find(s => s.symbol === symbol)?.name
    : undefined

  const select = (s: PSXSymbol) => {
    setInput(s.symbol)
    setSymbol(s.symbol)
    setDropdownOpen(false)
  }

  // Enter / Search button: prefer an exact ticker match, then the top
  // suggestion — so "habib bank" resolves to HBL without needing the ticker.
  const submit = (e?: React.FormEvent) => {
    e?.preventDefault()
    const q = input.trim()
    if (!q) {
      clear()
      return
    }
    const exact = directory.find(s => s.symbol.toLowerCase() === q.toLowerCase())
    if (exact) select(exact)
    else if (suggestions.length > 0) select(suggestions[highlighted] ?? suggestions[0])
    else {
      setSymbol(q.toUpperCase())
      setDropdownOpen(false)
    }
  }

  const clear = () => {
    setInput('')
    setSymbol('')
    setDropdownOpen(false)
    inputRef.current?.focus()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!dropdownOpen || suggestions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlighted(h => Math.min(h + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted(h => Math.max(h - 1, 0))
    } else if (e.key === 'Escape') {
      setDropdownOpen(false)
    }
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2.5 mb-1">
          <Banknote className="w-5 h-5 text-ink dark:text-dark-ink" />
          <h1 className="text-xl font-semibold text-ink dark:text-dark-ink">Dividend Announcements</h1>
        </div>
        <p className="text-sm text-ink-secondary dark:text-dark-ink-secondary">
          Latest dividend, bonus and right share announcements from the Pakistan Stock Exchange.
        </p>
      </div>

      {/* Search */}
      <form onSubmit={submit} className="flex items-start gap-2 mb-4">
        <div className="relative w-80">
          <Input
            ref={inputRef}
            placeholder="Search by symbol or company, e.g. HBL or Habib Bank"
            value={input}
            autoComplete="off"
            onChange={e => {
              setInput(e.target.value)
              setDropdownOpen(true)
              setHighlighted(0)
            }}
            onFocus={() => input.trim() && setDropdownOpen(true)}
            onBlur={() => setDropdownOpen(false)}
            onKeyDown={onKeyDown}
            leftIcon={<Search className="w-3.5 h-3.5" />}
          />
          {dropdownOpen && suggestions.length > 0 && (
            <ul className="absolute z-20 mt-1 w-full bg-surface dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg shadow-card dark:shadow-dark-card overflow-hidden">
              {suggestions.map((s, i) => (
                <li key={s.symbol}>
                  <button
                    type="button"
                    // onMouseDown so the click wins the race against the
                    // input's onBlur closing the dropdown.
                    onMouseDown={e => { e.preventDefault(); select(s) }}
                    onMouseEnter={() => setHighlighted(i)}
                    className={
                      'flex items-baseline gap-2 w-full px-3 py-2 text-left text-xs transition-colors ' +
                      (i === highlighted
                        ? 'bg-surface-secondary dark:bg-dark-surface-secondary'
                        : 'bg-transparent')
                    }
                  >
                    <span className="font-semibold text-ink dark:text-dark-ink whitespace-nowrap">{s.symbol}</span>
                    <span className="text-ink-secondary dark:text-dark-ink-secondary truncate">{s.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Button type="submit" size="sm" variant="primary" disabled={isFetching} className="h-9">
          {isFetching && !isLoading ? 'Searching…' : 'Search'}
        </Button>
        {symbol && (
          <Button type="button" size="sm" variant="ghost" onClick={clear} className="h-9">
            <X className="w-3.5 h-3.5" />
            Clear
          </Button>
        )}
      </form>

      {/* Active filter context */}
      {symbol && (
        <p className="mb-3 text-xs text-ink-secondary dark:text-dark-ink-secondary">
          Showing announcements for <span className="font-semibold text-ink dark:text-dark-ink">{symbol}</span>
          {activeCompany && <> — {activeCompany}</>}
        </p>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" />
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center py-20 gap-2 text-center">
          <Banknote className="w-10 h-10 text-ink-disabled dark:text-dark-ink-disabled" />
          <p className="text-sm font-medium text-ink-secondary dark:text-dark-ink-secondary">Could not load announcements</p>
          <p className="text-xs text-ink-tertiary dark:text-dark-ink-tertiary">The PSX data portal may be temporarily unavailable. Try again in a minute.</p>
        </div>
      ) : payouts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-2 text-center">
          <Banknote className="w-10 h-10 text-ink-disabled dark:text-dark-ink-disabled" />
          <p className="text-sm font-medium text-ink-secondary dark:text-dark-ink-secondary">
            No announcements found{symbol ? ` for ${symbol}` : ''}
          </p>
        </div>
      ) : (
        <div className="bg-surface dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border dark:border-dark-border bg-surface-secondary dark:bg-dark-surface-secondary text-left">
                  <th className="px-3 py-2 font-semibold text-ink-secondary dark:text-dark-ink-secondary">Symbol</th>
                  <th className="px-3 py-2 font-semibold text-ink-secondary dark:text-dark-ink-secondary">Company</th>
                  <th className="px-3 py-2 font-semibold text-ink-secondary dark:text-dark-ink-secondary">Type</th>
                  <th className="px-3 py-2 font-semibold text-ink-secondary dark:text-dark-ink-secondary">Payout</th>
                  <th className="px-3 py-2 font-semibold text-ink-secondary dark:text-dark-ink-secondary">Announced</th>
                  <th className="px-3 py-2 font-semibold text-ink-secondary dark:text-dark-ink-secondary">Book Closure</th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((p, i) => <PayoutRow key={`${p.symbol}-${p.announcedAt}-${i}`} p={p} />)}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between px-3 py-2 border-t border-border dark:border-dark-border text-[11px] text-ink-tertiary dark:text-dark-ink-tertiary">
            <span>
              Showing {payouts.length}{data && data.total > payouts.length ? ` of ${data.total}` : ''} announcements
            </span>
            <span>Source: PSX Data Portal · (F) final · (i) interim</span>
          </div>
        </div>
      )}
    </div>
  )
}
