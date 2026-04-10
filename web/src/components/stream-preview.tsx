import { useEffect, useRef, useState } from 'react'
import { getWsUrl } from '@/lib/api'
import { TerminalBuffer } from '@/lib/terminal-buffer'

function decodeBase64(b64: string): string {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new TextDecoder().decode(bytes)
}

export function StreamPreview({ streamId }: { streamId: string }) {
  const [htmlContent, setHtmlContent] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    const ws = new WebSocket(getWsUrl(streamId))
    let snapshotReceived = false

    ws.onmessage = (event) => {
      if (snapshotReceived) return

      const msg = JSON.parse(event.data)
      if (msg.type === 'snapshot' && msg.data) {
        snapshotReceived = true

        const buffer = new TerminalBuffer(msg.cols || 120, msg.rows || 40)
        buffer.write(decodeBase64(msg.data), () => {
          setHtmlContent(buffer.toHTML())
        })

        ws.close()
      }
    }

    return () => {
      ws.close()
    }
  }, [streamId])

  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.innerHTML = htmlContent
      // Scroll to bottom after content is rendered
      requestAnimationFrame(() => {
        if (containerRef.current) {
          containerRef.current.scrollTop = containerRef.current.scrollHeight
        }
      })
    }
  }, [htmlContent])

  return (
    <div className="w-full h-64 bg-[#0d0d1a] overflow-hidden relative">
      <div ref={containerRef} className="w-full h-full overflow-hidden p-3">
        <pre
          ref={contentRef}
          className="font-mono text-[10px] text-[#e2e8f0] whitespace-pre m-0"
          style={{ lineHeight: '1.3' }}
        />
      </div>
      <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-[#0d0d1a] to-transparent pointer-events-none" />
    </div>
  )
}
