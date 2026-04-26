import { describe, expect, it } from 'vitest'
import { sampleRepresentativeFiles, type SelectionItem } from './sampling'

describe('sampleRepresentativeFiles', () => {
  it('returns empty for empty selection', async () => {
    const res = await sampleRepresentativeFiles([])
    expect(res).toEqual([])
  })

  it('dedupes and caps to 5', async () => {
    const sel: SelectionItem[] = [
      { path: 'C:\\x\\a.jpg', kind: 'file' },
      { path: 'C:\\x\\a.jpg', kind: 'file' },
      { path: 'C:\\x\\b.png', kind: 'file' },
      { path: 'C:\\x\\c.txt', kind: 'file' },
      { path: 'C:\\x\\d.mp4', kind: 'file' },
      { path: 'C:\\x\\e.mov', kind: 'file' },
      { path: 'C:\\x\\f.pdf', kind: 'file' }
    ]
    const res = await sampleRepresentativeFiles(sel, { scanTimeBudgetMs: 1 })
    expect(res.length).toBeLessThanOrEqual(5)
    // prefer media first when present
    expect(res[0]?.toLowerCase().endsWith('.jpg') || res[0]?.toLowerCase().endsWith('.png') || res[0]?.toLowerCase().endsWith('.mp4')).toBe(true)
  })
})

