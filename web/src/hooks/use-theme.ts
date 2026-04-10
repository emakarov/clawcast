import { useEffect } from 'react'

export function useTheme() {
  useEffect(() => {
    document.documentElement.classList.add('dark')
  }, [])

  return { theme: 'dark' as const, toggleTheme: () => {} }
}
