// src/components/ui/SymbolPicker.tsx
import { useState, useEffect, useRef, useMemo } from 'react'
import { Search, BarChart3, ChevronDown, X } from 'lucide-react'
import clsx from 'clsx'

export function SymbolPicker({ symbols, value, onChange, placeholder = 'Select symbol', getLabel }: {
  symbols: string[]
  value: string
  onChange: (s: string) => void
  placeholder?: string
  getLabel?: (symbol: string) => string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const label = getLabel ?? ((s: string) => s)

  const filtered = useMemo(() =>
    query.trim() === ''
      ? symbols
      : symbols.filter(s =>
          s.toLowerCase().includes(query.toLowerCase()) ||
          label(s).toLowerCase().includes(query.toLowerCase())),
    [symbols, query, label],
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
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-1.5 rounded border border-border dark:border-dark-border bg-surface dark:bg-dark-surface text-sm font-medium text-ink dark:text-dark-ink hover:bg-surface-secondary dark:hover:bg-dark-surface-secondary transition-colors min-w-[140px] w-full"
      >
        <BarChart3 className="w-3.5 h-3.5 text-ink-secondary dark:text-dark-ink-secondary flex-shrink-0" />
        <span className="flex-1 text-left truncate font-mono">{value ? label(value) : placeholder}</span>
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
                <button type="button" onClick={() => setQuery('')}>
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
                type="button"
                onClick={() => { onChange(s); setOpen(false); setQuery('') }}
                className={clsx(
                  'w-full text-left px-3 py-1.5 text-sm font-mono transition-colors',
                  s === value
                    ? 'bg-ink text-surface dark:bg-dark-ink dark:text-dark-surface'
                    : 'text-ink dark:text-dark-ink hover:bg-surface-secondary dark:hover:bg-dark-surface-secondary',
                )}
              >
                {label(s)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
