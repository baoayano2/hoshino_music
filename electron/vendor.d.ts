declare module 'kuroshiro' {
  export default class Kuroshiro {
    init(analyzer: { init(): Promise<void>, parse(value: string): Promise<unknown[]> }): Promise<void>
    convert(value: string, options: { to: 'romaji' | 'hiragana' | 'katakana', mode?: 'normal' | 'spaced' }): Promise<string>
  }
}

declare module 'kuroshiro-analyzer-kuromoji' {
  export default class KuromojiAnalyzer {
    constructor(options?: { dictPath?: string })
    init(): Promise<void>
    parse(value: string): Promise<unknown[]>
  }
}
