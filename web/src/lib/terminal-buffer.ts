import { Terminal } from '@xterm/headless'

/**
 * Terminal buffer backed by xterm.js headless — a proper, spec-compliant
 * terminal emulator. Stores cells in a 2D grid with per-cell attributes,
 * correctly handles cursor positioning, SGR state, scroll regions, etc.
 *
 * toHTML() iterates xterm's buffer cell-by-cell and emits styled spans.
 *
 * API kept compatible with the previous custom implementation:
 *   - write(data)
 *   - reset()
 *   - toHTML()
 *   - toPlainText()
 *   - resize(cols, rows)
 */
export class TerminalBuffer {
  private term: Terminal

  constructor(cols = 120, rows = 40) {
    this.term = new Terminal({
      cols,
      rows,
      scrollback: 5000,
      allowProposedApi: true,
      convertEol: false,
    })
  }

  write(data: string, callback?: () => void): void {
    this.term.write(data, callback)
  }

  reset(): void {
    this.term.reset()
  }

  resize(cols: number, rows: number): void {
    this.term.resize(cols, rows)
  }

  toHTML(): string {
    const buffer = this.term.buffer.active
    const cols = this.term.cols

    // Find last non-empty row so we don't emit trailing blank lines.
    let lastRow = buffer.length - 1
    while (lastRow >= 0) {
      const line = buffer.getLine(lastRow)
      if (line && line.translateToString(true).trim() !== '') break
      lastRow--
    }
    const totalLines = lastRow + 1

    const parts: string[] = []

    for (let y = 0; y < totalLines; y++) {
      const line = buffer.getLine(y)
      if (!line) {
        parts.push('\n')
        continue
      }

      let currentAttrs = ''
      let currentText = ''

      for (let x = 0; x < cols; x++) {
        const cell = line.getCell(x)
        if (!cell) continue

        const ch = cell.getChars() || ' '
        // Skip empty cells on the right side of wide chars
        if (cell.getWidth() === 0) continue

        const attrs = cellAttrs(cell)
        if (attrs !== currentAttrs) {
          if (currentText) {
            parts.push(wrapSpan(currentText, currentAttrs))
            currentText = ''
          }
          currentAttrs = attrs
        }
        currentText += ch
      }

      if (currentText) {
        parts.push(wrapSpan(currentText, currentAttrs))
      }
      parts.push('\n')
    }

    return parts.join('')
  }

  toPlainText(): string {
    const buffer = this.term.buffer.active
    const lines: string[] = []
    for (let y = 0; y < buffer.length; y++) {
      const line = buffer.getLine(y)
      lines.push(line ? line.translateToString(true) : '')
    }
    return lines.join('\n')
  }
}

// Convert a cell's attributes into a compact style key
function cellAttrs(cell: {
  getFgColor(): number
  getFgColorMode(): number
  getBgColor(): number
  getBgColorMode(): number
  isBold(): number
  isItalic(): number
  isUnderline(): number
  isDim(): number
  isInverse(): number
  isInvisible(): number
  isStrikethrough(): number
}): string {
  // xterm returns mode as raw masked value (CM_MASK = 0x03000000).
  // Normalize to 0-3 by shifting right 24 bits.
  const fgMode = cell.getFgColorMode() >>> 24
  const bgMode = cell.getBgColorMode() >>> 24
  const fg = colorToCss(cell.getFgColor(), fgMode)
  const bg = colorToCss(cell.getBgColor(), bgMode)
  const inverse = cell.isInverse()

  // Handle inverse: swap fg and bg
  const fgFinal = inverse ? (bg || '#0d0d1a') : fg
  const bgFinal = inverse ? (fg || '#e2e8f0') : bg

  const styles: string[] = []
  if (fgFinal) styles.push(`color:${fgFinal}`)
  if (bgFinal) styles.push(`background-color:${bgFinal}`)
  if (cell.isBold()) styles.push('font-weight:bold')
  if (cell.isItalic()) styles.push('font-style:italic')
  if (cell.isUnderline()) styles.push('text-decoration:underline')
  if (cell.isDim()) styles.push('opacity:0.6')
  if (cell.isStrikethrough()) styles.push('text-decoration:line-through')
  if (cell.isInvisible()) styles.push('visibility:hidden')
  return styles.join(';')
}

// xterm color modes:
// 0 = default, 1 = palette16, 2 = palette256, 3 = RGB truecolor
function colorToCss(color: number, mode: number): string {
  if (mode === 0) return '' // default — inherit from container
  if (mode === 1 || mode === 2) {
    // 16 or 256 color palette
    return paletteToCss(color)
  }
  if (mode === 3) {
    // True color RGB (stored as 0xRRGGBB)
    const r = (color >> 16) & 0xff
    const g = (color >> 8) & 0xff
    const b = color & 0xff
    return `rgb(${r},${g},${b})`
  }
  return ''
}

// xterm 256-color palette → CSS
// First 16 are standard ANSI, rest follow 6x6x6 cube + grayscale
function paletteToCss(idx: number): string {
  if (idx < 16) return STANDARD_COLORS[idx]
  if (idx < 232) {
    // 6x6x6 color cube
    const i = idx - 16
    const r = Math.floor(i / 36)
    const g = Math.floor((i % 36) / 6)
    const b = i % 6
    const levels = [0, 95, 135, 175, 215, 255]
    return `rgb(${levels[r]},${levels[g]},${levels[b]})`
  }
  // Grayscale ramp
  const v = 8 + (idx - 232) * 10
  return `rgb(${v},${v},${v})`
}

const STANDARD_COLORS = [
  '#000000', '#cd0000', '#00cd00', '#cdcd00', '#0000ee', '#cd00cd', '#00cdcd', '#e5e5e5',
  '#7f7f7f', '#ff0000', '#00ff00', '#ffff00', '#5c5cff', '#ff00ff', '#00ffff', '#ffffff',
]

function wrapSpan(text: string, style: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  if (!style) return escaped
  return `<span style="${style}">${escaped}</span>`
}
