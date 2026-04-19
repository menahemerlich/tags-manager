import { describe, expect, it } from 'vitest'
import { normalizePath as normalizePathNode, pathDrivelessKey as pathDrivelessKeyNode } from './pathUtils'
import {
  normalizePath as normalizePathClient,
  pathDrivelessKey as pathDrivelessKeyClient
} from './pathUtilsSearchClient'

describe.runIf(process.platform === 'win32')('pathUtilsSearchClient parity (Windows)', () => {
  const samples = [
    'D:\\Photos\\a.jpg',
    'D:\\foo\\..\\bar',
    'd:/x/y/../z',
    'E:\\',
    'E:\\folder\\file.txt'
  ]
  for (const s of samples) {
    it(`normalizePath: ${JSON.stringify(s)}`, () => {
      expect(normalizePathClient(s)).toBe(normalizePathNode(s))
    })
    it(`pathDrivelessKey: ${JSON.stringify(s)}`, () => {
      expect(pathDrivelessKeyClient(s)).toBe(pathDrivelessKeyNode(s))
    })
  }
})
