import type { WatermarkShapeKind } from './watermarkShapeModel'

export const WATERMARK_SHAPE_KIND_ORDER: WatermarkShapeKind[] = [
  'rect',
  'ellipse',
  'triangle',
  'hexagon',
  'star',
  'arrow'
]

export function WatermarkShapeGlyph({ kind }: { kind: WatermarkShapeKind }) {
  const common = { className: 'watermark-shape-picker-glyph', viewBox: '0 0 48 48' as const, 'aria-hidden': true as const }
  switch (kind) {
    case 'rect':
      return (
        <svg {...common}>
          <rect x="10" y="12" width="28" height="24" fill="none" stroke="currentColor" strokeWidth="2" rx="2" />
        </svg>
      )
    case 'ellipse':
      return (
        <svg {...common}>
          <ellipse cx="24" cy="24" rx="16" ry="12" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      )
    case 'triangle':
      return (
        <svg {...common}>
          <path d="M24 10 L38 38 H10 Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      )
    case 'hexagon':
      return (
        <svg {...common}>
          <path
            d="M24 8 L36 16 V32 L24 40 L12 32 V16 Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      )
    case 'star':
      return (
        <svg {...common}>
          <path
            d="M24 8 L28.5 20 L41 20 L31 28 L35 40 L24 32 L13 40 L17 28 L7 20 L19.5 20 Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      )
    case 'arrow':
      return (
        <svg {...common}>
          <path d="M8 24 H36 M28 16 L38 24 L28 32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )
    default:
      return null
  }
}
