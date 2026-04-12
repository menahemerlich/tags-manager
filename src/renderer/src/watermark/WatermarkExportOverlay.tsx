import { createPortal } from 'react-dom'
import type { WatermarkExportOverlayState } from './watermarkTypes'

type Props = {
  exportOverlay: WatermarkExportOverlayState
}

/**
 * שכבת מסך מלאה בזמן ייצוא (התקדמות וידאו או ספינר לתמונה).
 */
export function WatermarkExportOverlay({ exportOverlay }: Props) {
  if (!exportOverlay) return null
  return createPortal(
    <div className="watermark-export-overlay" aria-live="polite" aria-busy="true">
      <div className="watermark-export-overlay-card">
        <p className="watermark-export-overlay-title">
          מייצא{' '}
          <span className="watermark-export-filename" dir="ltr">
            {exportOverlay.fileName || '…'}
          </span>
        </p>
        {exportOverlay.kind === 'video' ? (
          <>
            <div className="watermark-export-bar-wrap">
              <div className="watermark-export-bar-fill" style={{ width: `${exportOverlay.percent}%` }} />
            </div>
            <p className="watermark-export-percent">{Math.round(exportOverlay.percent)}%</p>
          </>
        ) : (
          <div className="watermark-export-indeterminate" />
        )}
      </div>
    </div>,
    document.body
  )
}
