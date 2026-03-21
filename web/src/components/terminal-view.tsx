import { useCallback } from 'react'
import '@xterm/xterm/css/xterm.css'

export function TerminalView({ onMount }: { onMount: (el: HTMLDivElement) => void }) {
  const ref = useCallback((el: HTMLDivElement | null) => {
    if (el) onMount(el)
  }, [onMount])

  return <div ref={ref} className="flex-1 min-h-0 bg-[#0d0d1a] overflow-auto" />
}
