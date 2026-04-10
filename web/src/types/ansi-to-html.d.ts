declare module 'ansi-to-html' {
  interface Options {
    fg?: string
    bg?: string
    newline?: boolean
    escapeXML?: boolean
    stream?: boolean
    colors?: string[] | Record<string, string>
  }

  export default class AnsiToHtml {
    constructor(options?: Options)
    toHtml(input: string): string
  }
}
