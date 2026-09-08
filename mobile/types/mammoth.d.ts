declare module 'mammoth' {
  export interface MammothResult {
    value: string
    messages: Array<{
      type: string
      message: string
    }>
  }

  export interface MammothOptions {
    styleMap?: string | string[]
    includeDefaultStyleMap?: boolean
    convertImage?: unknown
  }

  export function convertToHtml(
    input: { arrayBuffer?: ArrayBuffer; buffer?: Buffer; path?: string },
    options?: MammothOptions,
  ): Promise<MammothResult>

  export function extractRawText(input: {
    arrayBuffer?: ArrayBuffer
    buffer?: Buffer
    path?: string
  }): Promise<MammothResult>
}
