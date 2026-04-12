import type { TransferPackageProgress } from '../../../shared/types'

/** אחוז התקדמות להצגת סרגל בחבילת העברה. */
export function transferProgressPercentFromStage(transferProgress: TransferPackageProgress | null): number {
  if (!transferProgress) return 0
  switch (transferProgress.stage) {
    case 'idle':
      return 0
    case 'select-destination':
      return 5
    case 'validating':
      return 14
    case 'persisting-data':
      return 24
    case 'searching-installer':
      return 34
    case 'building':
      return 62
    case 'collecting-installer':
      return 78
    case 'copying-data':
      return 88
    case 'writing-instructions':
      return 95
    case 'done':
      return 100
    case 'error':
      return 100
    default:
      return 0
  }
}
