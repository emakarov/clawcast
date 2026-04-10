import { useEffect, useRef } from 'react'

export function TerminalView({ htmlContent }: { htmlContent: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLPreElement>(null)

  // Update content safely
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.innerHTML = htmlContent
      // Scroll after content is rendered
      requestAnimationFrame(() => {
        if (containerRef.current) {
          containerRef.current.scrollTop = containerRef.current.scrollHeight
        }
      })
    }
  }, [htmlContent])

  return (
    <div
      ref={containerRef}
      className="w-full h-full bg-[#0d0d1a] overflow-auto p-4"
    >
      <pre
        ref={contentRef}
        className="font-mono text-sm text-[#e2e8f0] whitespace-pre m-0"
        style={{ lineHeight: '1.2' }}
      />
    </div>
  )
}
