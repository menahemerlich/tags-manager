import { useCallback, useEffect, useRef, useState } from 'react'
import * as faceapi from 'face-api.js'
import '@tensorflow/tfjs-backend-cpu'
import type { FaceDetection, TagFolderRow, TagRow } from '../../../shared/types'
import { FACE_EMBEDDING_MODEL_ID } from '../../../shared/types'
import { normalizeTagName } from '../../../shared/tagNormalize'

/**
 * טאב זיהוי פנים: טעינת תמונה, זיהוי ONNX או fallback ל־face-api, שמירת תגיות ו־embeddings.
 */
export function FaceRecognitionTab({
  onTagsChanged,
  openFromPreview,
  onOpenFromPreviewHandled
}: {
  onTagsChanged?: () => Promise<void> | void
  openFromPreview?: { path: string; id: number } | null
  onOpenFromPreviewHandled?: (handledId: number) => void
}) {
  const LEGACY_FACE_MODEL_ID = 'legacy.faceapi.v1'
  const [imagePath, setImagePath] = useState<string | null>(null)
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [isImageLoading, setIsImageLoading] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)
  const [modelsState, setModelsState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [isDetecting, setIsDetecting] = useState(false)
  const [detectedFaces, setDetectedFaces] = useState<
    { box: { x: number; y: number; width: number; height: number }; descriptor: number[] }[]
  >([])
  const [nameDrafts, setNameDrafts] = useState<Record<number, string>>({})
  const [candidateByIndex, setCandidateByIndex] = useState<
    Record<
      number,
      | {
          personId: number
          name: string
          distance: number
          confidence: number
          threshold: number
          confidenceLabel: 'high' | 'probable' | 'uncertain'
        }
      | null
    >
  >({})
  const [activeFaceIndex, setActiveFaceIndex] = useState<number | null>(null)
  const [faceResolvedByIndex, setFaceResolvedByIndex] = useState<Record<number, 'yes' | 'no'>>({})
  const [faceSavedByIndex, setFaceSavedByIndex] = useState<Record<number, string>>({})
  const [faceSaving, setFaceSaving] = useState(false)
  const [activeModelId, setActiveModelId] = useState(FACE_EMBEDDING_MODEL_ID)
  const [knownTags, setKnownTags] = useState<TagRow[]>([])
  const [knownTagFolders, setKnownTagFolders] = useState<TagFolderRow[]>([])
  const [tagFolderPicker, setTagFolderPicker] = useState<{ open: boolean; tagName: string; selectedFolderId: string }>({
    open: false,
    tagName: '',
    selectedFolderId: ''
  })

  const imgRef = useRef<HTMLImageElement | null>(null)
  const ensureLegacyModelsPromiseRef = useRef<Promise<void> | null>(null)
  const detectRunIdRef = useRef(0)
  const tagFolderPickerResolverRef = useRef<((value: number | null | undefined) => void) | null>(null)

  /** טוען מודלי face-api מהשרת המקומי (גיבוי כש־ONNX לא זמין) */
  async function ensureLegacyModelsLoaded() {
    if (ensureLegacyModelsPromiseRef.current) return ensureLegacyModelsPromiseRef.current
    ensureLegacyModelsPromiseRef.current = (async () => {
      if (faceapi.tf) {
        await faceapi.tf.setBackend('cpu')
        await faceapi.tf.ready()
      }
      const uri = new URL('./face-models', window.location.href).toString()
      await faceapi.nets.ssdMobilenetv1.loadFromUri(uri)
      await faceapi.nets.faceLandmark68Net.loadFromUri(uri)
      await faceapi.nets.faceRecognitionNet.loadFromUri(uri)
    })()
    return ensureLegacyModelsPromiseRef.current
  }

  /** זיהוי פרצופים דרך face-api עם קנה מידה מהתצוגה */
  async function detectFacesViaLegacy(imgEl: HTMLImageElement, scaleX: number, scaleY: number): Promise<FaceDetection[]> {
    await ensureLegacyModelsLoaded()
    const detections = await faceapi.detectAllFaces(imgEl).withFaceLandmarks().withFaceDescriptors()
    return detections.map((d) => {
      const b = d.detection.box
      return {
        box: {
          x: b.x * scaleX,
          y: b.y * scaleY,
          width: b.width * scaleX,
          height: b.height * scaleY
        },
        descriptor: Array.from(d.descriptor)
      }
    })
  }

  const loadFaceImagePath = useCallback(async (image: string) => {
    setImageError(null)
    setImagePath(image)
    setImageSrc(null)
    setDetectedFaces([])
    setNameDrafts({})
    setCandidateByIndex({})
    setActiveFaceIndex(null)
    setFaceResolvedByIndex({})
    setFaceSavedByIndex({})
    setModelsError(null)
    setModelsState('idle')
    setIsImageLoading(true)
    try {
      const src = await window.api.getImageDataUrl(image)
      if (!src) {
        setImageError('טעינת תמונה נכשלה')
        setImagePath(null)
        return
      }
      setImageSrc(src)
    } finally {
      setIsImageLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!openFromPreview) return
    const { path, id } = openFromPreview
    let cancelled = false
    void (async () => {
      try {
        await loadFaceImagePath(path)
      } finally {
        if (!cancelled) onOpenFromPreviewHandled?.(id)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [openFromPreview?.id, openFromPreview?.path, loadFaceImagePath, onOpenFromPreviewHandled])

  async function pickImage() {
    const image = await window.api.pickImage()
    if (!image) return
    await loadFaceImagePath(image)
  }

  /** מאפס תמונה ותוצאות זיהוי */
  function clearCurrentImage(): void {
    setImagePath(null)
    setImageSrc(null)
    setDetectedFaces([])
    setNameDrafts({})
    setCandidateByIndex({})
    setActiveFaceIndex(null)
    setFaceResolvedByIndex({})
    setFaceSavedByIndex({})
    setImageError(null)
    setModelsError(null)
    setModelsState('idle')
    setIsImageLoading(false)
  }

  async function refreshKnownTagData(): Promise<void> {
    const [tagsList, folders] = await Promise.all([window.api.listTags(), window.api.listTagFolders()])
    setKnownTags(tagsList)
    setKnownTagFolders(folders)
  }

  /** מחזיר מזהה תיקייה לפי שם תגית (לפי מטמון מקומי) */
  function getKnownFolderIdByTagName(name: string): number | null {
    const n = normalizeTagName(name)
    if (!n) return null
    const tag = knownTags.find((t) => t.name.toLowerCase() === n.toLowerCase())
    if (!tag) return null
    const folder = knownTagFolders.find((f) => f.tagIds.includes(tag.id))
    return folder ? folder.id : null
  }

  async function promptTagFolderChoice(tagName: string, initialFolderId: number | null): Promise<number | null | undefined> {
    return await new Promise<number | null | undefined>((resolve) => {
      tagFolderPickerResolverRef.current = resolve
      setTagFolderPicker({
        open: true,
        tagName,
        selectedFolderId: initialFolderId === null ? '' : String(initialFolderId)
      })
    })
  }

  function closeTagFolderPicker(nextValue: number | null | undefined): void {
    const resolve = tagFolderPickerResolverRef.current
    tagFolderPickerResolverRef.current = null
    setTagFolderPicker({ open: false, tagName: '', selectedFolderId: '' })
    resolve?.(nextValue)
  }

  async function assignFolderByTagName(tagName: string, folderId: number | null): Promise<void> {
    const tagsList = await window.api.listTags()
    const n = normalizeTagName(tagName)
    const tag = tagsList.find((t) => t.name.toLowerCase() === n.toLowerCase())
    if (!tag) return
    const res = await window.api.setTagFolderForTag(tag.id, folderId)
    if (!res.ok) throw new Error(res.error)
  }

  /** מריץ זיהוי ONNX או legacy לפי תמונה הנוכחית */
  async function detectFacesForCurrentImage() {
    if (!imagePath || !imageSrc) return
    let imgEl = imgRef.current
    if (!imgEl) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      imgEl = imgRef.current
    }
    if (!imgEl) return

    const runId = (detectRunIdRef.current += 1)
    setIsDetecting(true)
    setImageError(null)

    try {
      setModelsState('loading')
      setModelsError(null)
      const analysis = await window.api.analyzeAndMatchFacesInImage(imagePath)
      if (detectRunIdRef.current !== runId) return

      if (!imgEl.complete || imgEl.naturalWidth === 0) {
        await new Promise<void>((resolve, reject) => {
          const onLoad = () => resolve()
          const onError = () => reject(new Error('טעינת תמונה נכשלה'))
          imgEl.addEventListener('load', onLoad, { once: true })
          imgEl.addEventListener('error', onError, { once: true })
        })
      }
      if (detectRunIdRef.current !== runId) return

      const rect = imgEl.getBoundingClientRect()
      const scaleX = rect.width / imgEl.naturalWidth
      const scaleY = rect.height / imgEl.naturalHeight

      const nextCandidates: Record<
        number,
        | {
            personId: number
            name: string
            distance: number
            confidence: number
            threshold: number
            confidenceLabel: 'high' | 'probable' | 'uncertain'
          }
        | null
      > = {}
      let faces: FaceDetection[] = []
      if (analysis.ok) {
        setActiveModelId(analysis.modelId)
        faces = analysis.faces.map((d) => {
          const b = d.box
          return {
            box: {
              x: b.x * scaleX,
              y: b.y * scaleY,
              width: b.width * scaleX,
              height: b.height * scaleY
            },
            descriptor: Array.from(d.descriptor)
          }
        })
        for (let i = 0; i < analysis.faces.length; i += 1) {
          const candidate = analysis.faces[i].candidate
          nextCandidates[i] = candidate
            ? {
                personId: candidate.personId,
                name: candidate.name,
                distance: candidate.distance,
                confidence: candidate.confidence,
                threshold: candidate.threshold,
                confidenceLabel: candidate.confidenceLabel
              }
            : null
        }
      } else {
        faces = await detectFacesViaLegacy(imgEl, scaleX, scaleY)
        setActiveModelId(LEGACY_FACE_MODEL_ID)
        setModelsError(`ONNX לא זמין כרגע: ${analysis.error}`)
        for (let i = 0; i < faces.length; i += 1) nextCandidates[i] = null
      }

      setDetectedFaces(faces)
      setCandidateByIndex(nextCandidates)
      setFaceResolvedByIndex({})
      setNameDrafts((prev) => {
        const next: Record<number, string> = {}
        for (let i = 0; i < faces.length; i += 1) {
          if (prev[i]) next[i] = prev[i]
        }
        return next
      })
      setModelsState('ready')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setModelsState('error')
      setModelsError(msg)
      setImageError(`שגיאה בזיהוי פרצופים: ${msg}`)
      setDetectedFaces([])
      setNameDrafts({})
      setCandidateByIndex({})
      setFaceResolvedByIndex({})
    } finally {
      if (detectRunIdRef.current === runId) setIsDetecting(false)
    }
  }

  useEffect(() => {
    void refreshKnownTagData()
  }, [])

  useEffect(() => {
    if (!imagePath || isImageLoading) return
    void detectFacesForCurrentImage()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imagePath, imageSrc, isImageLoading])

  /** שומר תגית לקובץ + embedding (אם המנוע הפעיל תומך) */
  async function saveFaceWithName(faceIndex: number, personName: string, options?: { skipFolderPrompt?: boolean }) {
    if (!imagePath) return
    const n = normalizeTagName(personName)
    if (!n) {
      setImageError('נא להזין שם תקין לתגית.')
      return
    }
    const face = detectedFaces[faceIndex]
    if (!face) return
    let folderChoice: number | null | undefined = undefined
    if (!options?.skipFolderPrompt) {
      folderChoice = await promptTagFolderChoice(n, getKnownFolderIdByTagName(n))
      if (folderChoice === undefined) return
    }

    setImageError(null)
    setFaceSaving(true)
    try {
      await window.api.addTagToPath(imagePath, n)
      if (!options?.skipFolderPrompt) {
        await assignFolderByTagName(n, folderChoice ?? null)
      }
      if (activeModelId === FACE_EMBEDDING_MODEL_ID) {
        const r = await window.api.addFaceEmbedding({ name: n, descriptor: face.descriptor, modelId: activeModelId })
        if (!r.ok) {
          setImageError(r.error ?? 'שגיאה בשמירת embedding')
          return
        }
      } else {
        setImageError('התגית נשמרה, אך embedding לא נשמר כי ONNX לא זמין כרגע.')
      }
      await refreshKnownTagData()
      await onTagsChanged?.()

      setFaceSavedByIndex((prev) => ({ ...prev, [faceIndex]: n }))
      setCandidateByIndex((prev) => ({ ...prev, [faceIndex]: null }))
      setFaceResolvedByIndex((prev) => ({ ...prev, [faceIndex]: 'yes' }))
    } finally {
      setFaceSaving(false)
    }
  }

  /** שם מתוכנן לשמירה לפי מועמד / טיוטה */
  function getPlannedNameForFace(faceIndex: number): string | null {
    const already = normalizeTagName(faceSavedByIndex[faceIndex] ?? '')
    if (already) return already
    const candidate = candidateByIndex[faceIndex]
    const resolved = faceResolvedByIndex[faceIndex]
    if (candidate && resolved !== 'no') {
      const n = normalizeTagName(candidate.name)
      if (n) return n
    }
    const draft = normalizeTagName(nameDrafts[faceIndex] ?? '')
    return draft || null
  }

  async function saveAllFaceTagsAndClear() {
    if (!imagePath) return
    if (detectedFaces.length === 0) {
      setImageError('לא זוהו פרצופים לשמירה בתמונה זו.')
      return
    }

    const toSave: { faceIndex: number; name: string }[] = []
    for (let i = 0; i < detectedFaces.length; i += 1) {
      const name = getPlannedNameForFace(i)
      if (name) toSave.push({ faceIndex: i, name })
    }

    if (toSave.length === 0) {
      setImageError('לא הוגדרו שמות לשמירה. הזן שם לפחות לפרצוף אחד.')
      return
    }

    const allowEmbedding = activeModelId === FACE_EMBEDDING_MODEL_ID
    const savedByIndex: Record<number, string> = {}
    let tagSaveErrors = 0
    let embeddingSaveErrors = 0

    setFaceSaving(true)
    setImageError(null)
    try {
      for (const item of toSave) {
        const face = detectedFaces[item.faceIndex]
        if (!face) continue

        try {
          // eslint-disable-next-line no-await-in-loop
          await window.api.addTagToPath(imagePath, item.name)
        } catch {
          tagSaveErrors += 1
          continue
        }

        if (allowEmbedding) {
          // eslint-disable-next-line no-await-in-loop
          const r = await window.api.addFaceEmbedding({
            name: item.name,
            descriptor: face.descriptor,
            modelId: activeModelId
          })
          if (!r.ok) {
            embeddingSaveErrors += 1
            continue
          }
        }

        savedByIndex[item.faceIndex] = item.name
      }

      setFaceSavedByIndex((prev) => ({ ...prev, ...savedByIndex }))

      if (Object.keys(savedByIndex).length === 0) {
        setImageError('שמירה נכשלה. נסה שוב.')
        return
      }

      if (!allowEmbedding) {
        setImageError('התגיות נשמרו לתמונה, אך embeddings לא נשמרו כי ONNX לא זמין כרגע.')
      } else if (embeddingSaveErrors > 0 || tagSaveErrors > 0) {
        setImageError(`השמירה הושלמה חלקית. תגיות שנכשלו: ${tagSaveErrors}, embeddings שנכשלו: ${embeddingSaveErrors}.`)
      }

      await refreshKnownTagData()
      await onTagsChanged?.()
      clearCurrentImage()
    } finally {
      setFaceSaving(false)
    }
  }

  async function handleSaveTagForFace(faceIndex: number) {
    const raw = nameDrafts[faceIndex] ?? ''
    await saveFaceWithName(faceIndex, raw)
  }

  const engineStatus = (() => {
    if (modelsState === 'loading') return { label: 'מנוע: טוען...', kind: 'loading' as const }
    if (modelsState === 'error') return { label: 'מנוע: שגיאה', kind: 'error' as const }
    if (activeModelId === FACE_EMBEDDING_MODEL_ID) return { label: 'מנוע: ONNX פעיל', kind: 'onnx' as const }
    return { label: 'מנוע: Fallback', kind: 'fallback' as const }
  })()

  /** טקסט וצבע לתצוגת רמת ביטחון בזיהוי */
  function faceConfidenceUi(faceIndex: number): {
    label: string
    kind: 'high' | 'probable' | 'uncertain' | 'unrecognized'
    percent: string
  } {
    const candidate = candidateByIndex[faceIndex]
    if (!candidate) return { label: 'לא מזוהה', kind: 'unrecognized', percent: '0%' }
    const percent = Math.max(0, Math.min(1, candidate.confidence))
    const pctText = `${Math.round(percent * 100)}%`
    if (percent >= 0.9) return { label: 'זיהוי בטוח', kind: 'high', percent: pctText }
    if (percent >= 0.7) return { label: 'כנראה', kind: 'probable', percent: pctText }
    if (percent >= 0.5) return { label: 'לא בטוח', kind: 'uncertain', percent: pctText }
    return { label: 'לא מזוהה', kind: 'unrecognized', percent: pctText }
  }

  return (
    <div className="face-recognition-tab">
      <p className="muted small" style={{ marginTop: 0 }}>
        העלו תמונה כדי לזהות פרצופים ולהוסיף תגיות לפי שמות.
      </p>
      <div className="toolbar">
        <button
          type="button"
          className="btn primary"
          onClick={() => void pickImage()}
          disabled={isDetecting || faceSaving}
        >
          בחר תמונה
        </button>
        {imagePath && (
          <button
            type="button"
            className="btn primary"
            onClick={() => void saveAllFaceTagsAndClear()}
            disabled={isDetecting || faceSaving || detectedFaces.length === 0}
          >
            שמירת תגיות
          </button>
        )}
        {imagePath && (
          <button type="button" className="btn" onClick={clearCurrentImage} disabled={isDetecting || faceSaving}>
            נקה
          </button>
        )}
        <span className={`engine-status-badge ${engineStatus.kind}`}>{engineStatus.label}</span>
      </div>

      {(imageError || modelsError) && (
        <p className="muted" style={{ color: 'var(--danger)', marginTop: 0 }}>
          {imageError ?? modelsError}
        </p>
      )}

      {imagePath ? (
        <>
          <div className="face-workspace">
            <div className="face-labels">
              {modelsState === 'ready' && detectedFaces.length > 0 ? (
                detectedFaces.map((_, idx) => {
                  const savedName = faceSavedByIndex[idx]
                  const candidate = candidateByIndex[idx]
                  const resolved = faceResolvedByIndex[idx]
                  const confidenceUi = faceConfidenceUi(idx)

                  if (savedName) {
                    return (
                      <div key={idx} className="face-label-item">
                        <div
                          onMouseEnter={() => setActiveFaceIndex(idx)}
                          onMouseLeave={() => setActiveFaceIndex((prev) => (prev === idx ? null : prev))}
                          onFocusCapture={() => setActiveFaceIndex(idx)}
                          onBlurCapture={(e) => {
                            const next = e.relatedTarget as Node | null
                            if (!next || !e.currentTarget.contains(next)) {
                              setActiveFaceIndex((prev) => (prev === idx ? null : prev))
                            }
                          }}
                        >
                          <div className="face-label-text">
                            <span className="muted small">פרצוף {idx + 1}</span>
                            <span className="muted small">נשמר כ-{savedName}</span>
                            <span className={`confidence-badge ${confidenceUi.kind}`}>
                              {confidenceUi.label} ({confidenceUi.percent})
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  }

                  const hasCandidate = !!candidate
                  const inCandidatePrompt = hasCandidate && resolved !== 'no'

                  if (inCandidatePrompt && candidate) {
                    return (
                      <div key={idx} className="face-label-item">
                        <div
                          onMouseEnter={() => setActiveFaceIndex(idx)}
                          onMouseLeave={() => setActiveFaceIndex((prev) => (prev === idx ? null : prev))}
                          onFocusCapture={() => setActiveFaceIndex(idx)}
                          onBlurCapture={(e) => {
                            const next = e.relatedTarget as Node | null
                            if (!next || !e.currentTarget.contains(next)) {
                              setActiveFaceIndex((prev) => (prev === idx ? null : prev))
                            }
                          }}
                        >
                          <div className="face-label-text">
                            <span className="muted small">פרצוף {idx + 1}</span>
                            <span className="muted small">
                              נראה כמו {candidate.name} (דיוק: {(candidate.confidence * 100).toFixed(0)}%)
                            </span>
                            <span className={`confidence-badge ${confidenceUi.kind}`}>
                              {confidenceUi.label} ({confidenceUi.percent})
                            </span>
                            <span className="muted small">האם זה אותו אדם?</span>
                          </div>
                          <div className="face-label-row">
                            <input
                              value={candidate.name}
                              readOnly
                              style={{ flex: 1, minWidth: 160, background: 'rgba(26, 26, 46, 0.35)' }}
                            />
                            <button
                              type="button"
                              className="btn primary"
                              disabled={faceSaving}
                              onClick={() => void saveFaceWithName(idx, candidate.name, { skipFolderPrompt: true })}
                            >
                              כן
                            </button>
                            <button
                              type="button"
                              className="btn"
                              disabled={faceSaving}
                              onClick={() => {
                                setFaceResolvedByIndex((prev) => ({ ...prev, [idx]: 'no' }))
                                setNameDrafts((prev) => ({ ...prev, [idx]: '' }))
                              }}
                            >
                              לא
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  }

                  return (
                    <div key={idx} className="face-label-item">
                      <div
                        onMouseEnter={() => setActiveFaceIndex(idx)}
                        onMouseLeave={() => setActiveFaceIndex((prev) => (prev === idx ? null : prev))}
                        onFocusCapture={() => setActiveFaceIndex(idx)}
                        onBlurCapture={(e) => {
                          const next = e.relatedTarget as Node | null
                          if (!next || !e.currentTarget.contains(next)) {
                            setActiveFaceIndex((prev) => (prev === idx ? null : prev))
                          }
                        }}
                      >
                        <div className="face-label-text">
                          <span className="muted small">פרצוף {idx + 1}</span>
                          <span className="muted small">הזן שם ושמור</span>
                          <span className={`confidence-badge ${confidenceUi.kind}`}>
                            {confidenceUi.label} ({confidenceUi.percent})
                          </span>
                        </div>
                        <div className="face-label-row">
                          <input
                            value={nameDrafts[idx] ?? ''}
                            onChange={(e) => setNameDrafts((prev) => ({ ...prev, [idx]: e.target.value }))}
                            placeholder="שם"
                            style={{ flex: 1, minWidth: 160 }}
                            disabled={faceSaving}
                          />
                          <button
                            type="button"
                            className="btn primary"
                            disabled={faceSaving}
                            onClick={() => void handleSaveTagForFace(idx)}
                          >
                            שמור תגית
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="face-label-item">
                  <div className="face-label-text">
                    <span className="muted small">שדות זיהוי יופיעו כאן לאחר סיום הזיהוי.</span>
                  </div>
                </div>
              )}
            </div>

            <div className="face-image-preview">
              <div className="face-image-frame">
                {imageSrc && (
                  <img
                    ref={imgRef}
                    src={imageSrc}
                    alt=""
                    onError={() => {
                      setImageError('טעינת תמונה נכשלה')
                      setDetectedFaces([])
                      setNameDrafts({})
                    }}
                  />
                )}
                <div className="face-image-overlay">
                  {isImageLoading && <span className="face-image-overlay-text">טוען תמונה</span>}
                  {!isImageLoading && isDetecting && <span className="face-image-overlay-text">מזהה...</span>}
                  {!isDetecting && detectedFaces.length === 0 && modelsState === 'ready' && (
                    <span className="face-image-overlay-text">לא זוהו פרצופים בתמונה</span>
                  )}
                  {detectedFaces.map((f, idx) => (
                    <div
                      key={idx}
                      className={`face-box ${activeFaceIndex === idx ? 'active' : ''}`}
                      style={{
                        left: f.box.x,
                        top: f.box.y,
                        width: f.box.width,
                        height: f.box.height
                      }}
                    >
                      <span className="face-box-index">{idx + 1}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {modelsState === 'loading' && (
            <p className="muted small" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
              טוען מודלים...
            </p>
          )}
          {modelsState === 'error' && (
            <p className="muted small" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
              לא ניתן לנתח את התמונה. ודא שמודלי ONNX קיימים בתיקיית `resources/models/face` וש־Microsoft Visual C++ Redistributable
              (x64) מותקן במערכת.
            </p>
          )}
        </>
      ) : (
        <p className="muted small" style={{ marginBottom: 0 }}>
          עדיין לא נבחרה תמונה.
        </p>
      )}
      {tagFolderPicker.open && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && closeTagFolderPicker(undefined)}>
          <div className="overlay-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <strong>שיוך תגית לתיקייה</strong>
            <p className="muted small" style={{ marginBottom: '0.5rem' }}>
              תגית: <strong>{tagFolderPicker.tagName}</strong>
            </p>
            <div className="field">
              <label>בחר תיקייה</label>
              <select
                value={tagFolderPicker.selectedFolderId}
                onChange={(e) => setTagFolderPicker((prev) => ({ ...prev, selectedFolderId: e.target.value }))}
              >
                <option value="">ללא תיקייה</option>
                {knownTagFolders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="toolbar" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
              <button
                type="button"
                className="btn primary"
                onClick={() =>
                  closeTagFolderPicker(tagFolderPicker.selectedFolderId ? Number(tagFolderPicker.selectedFolderId) : null)
                }
              >
                אישור
              </button>
              <button type="button" className="btn" onClick={() => closeTagFolderPicker(undefined)}>
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
