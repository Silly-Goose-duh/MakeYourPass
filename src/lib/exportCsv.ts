/**
 * CSV export helper — Excel / Google Sheets compatible.
 * - UTF-8 BOM prefix so Excel opens names with non-ASCII characters correctly
 * - CRLF (\r\n) row endings per RFC 4180
 * - Every field is double-quoted; embedded quotes are doubled (also RFC 4180)
 * Triggers an immediate browser download of `filename`.
 */
export function exportCsv(
  filename: string,
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>
): void {
  const q = (v: string | number | null | undefined): string => {
    const s = v === null || v === undefined ? '' : String(v)
    return '"' + s.replace(/"/g, '""') + '"'
  }
  const lines = [headers.map(q).join(','), ...rows.map((r) => r.map(q).join(','))]
  const csv = '﻿' + lines.join('\r\n') + '\r\n'

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
