import { Sun, Moon } from 'lucide-react'
import { useTheme } from '@/context/ThemeContext'
import clsx from 'clsx'

/**
 * Global theme toggle — matches the sun/moon slider design.
 * Placed in the toolbar, it toggles the entire app between light and dark mode.
 */
export function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const isDark = theme === 'dark'

  return (
    <button
      onClick={toggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={clsx(
        'relative flex items-center h-8 rounded-full transition-all duration-300 select-none overflow-hidden',
        isDark
          ? 'bg-[#0F2B3C] hover:bg-[#0F2B3C]/90'
          : 'bg-[#FDE8A8] hover:bg-[#FDE8A8]/90',
      )}
      style={{ minWidth: 52 }}
    >
      {/* Sliding thumb */}
      <span
        className={clsx(
          'absolute top-0.5 w-7 h-7 rounded-full flex items-center justify-center transition-all duration-300 shadow-md',
          isDark
            ? 'left-[calc(100%-30px)] bg-[#2BA5E0]'
            : 'left-0.5 bg-[#EAB308]',
        )}
      >
        {isDark ? (
          <Moon className="w-3.5 h-3.5 text-white" />
        ) : (
          <Sun className="w-3.5 h-3.5 text-white" />
        )}
      </span>

      {/* Invisible label area — keeps the button at a consistent width */}
      <span className="w-full" />
    </button>
  )
}
