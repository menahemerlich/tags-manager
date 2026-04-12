import { useCallback, useEffect, useRef } from 'react'
import { Arrow, Ellipse, Group, Layer, Rect, RegularPolygon, Stage, Star, Transformer } from 'react-konva'
import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import { type WatermarkShapeRecord, isShapeFillTransparent } from './watermarkShapeModel'
import {
  arrowPointerSizesFromImageBox,
  mediaToStageScale,
  strokeWidthStagePxFromRecord
} from './watermarkKonvaShared'

const ARROW_MIN_W_IMG = 20
const ARROW_MIN_H_IMG = 8

export type PlacementBounds = { x: number; y: number; width: number; height: number }

type Props = {
  shapes: WatermarkShapeRecord[]
  onShapesChange: (next: WatermarkShapeRecord[]) => void
  selectedId: string | null
  onSelectId: (id: string | null) => void
  active: boolean
  baseImageSize: { width: number; height: number }
  stageSize: { width: number; height: number }
  placementBounds: PlacementBounds
  /** z-index בתוך עורך השכבות (כמה שלבי Stage). */
  stackZIndex?: number
  /** נקרא כשלוחצים על צורה בזמן שכלי הצורות לא פעיל — כדי לפתוח את הכלי והפאנל. */
  onShapesToolRequested?: () => void
}

function clampCenterInBounds(
  cx: number,
  cy: number,
  w: number,
  h: number,
  b: PlacementBounds
): { cx: number; cy: number } {
  const halfW = w / 2
  const halfH = h / 2
  let minCx = b.x + halfW
  let maxCx = b.x + b.width - halfW
  if (minCx > maxCx) {
    const mid = b.x + b.width / 2
    minCx = mid
    maxCx = mid
  }
  let minCy = b.y + halfH
  let maxCy = b.y + b.height - halfH
  if (minCy > maxCy) {
    const mid = b.y + b.height / 2
    minCy = mid
    maxCy = mid
  }
  return {
    cx: Math.round(Math.min(maxCx, Math.max(minCx, cx))),
    cy: Math.round(Math.min(maxCy, Math.max(minCy, cy)))
  }
}

function syncRecordFromGroup(
  node: Konva.Group,
  record: WatermarkShapeRecord,
  baseW: number,
  baseH: number,
  stageW: number,
  stageH: number,
  bounds: PlacementBounds
): WatermarkShapeRecord {
  const ix = baseW / stageW
  const iy = baseH / stageH
  const sx = node.scaleX()
  const sy = node.scaleY()
  const rotation = node.rotation()
  const kind = record.kind

  /** חץ: מידות מ־getClientRect לפני איפוס scale — מונע קפיצות וסחיפת מרכז בגרירה/שינוי גודל. */
  if (kind === 'arrow') {
    const a = node.findOne<Konva.Arrow>('.shape-body')
    if (!a) return record
    const box = node.getClientRect()
    node.scaleX(1)
    node.scaleY(1)
    const uniformScale = mediaToStageScale(stageW, stageH, baseW, baseH).s
    const widthImg = Math.max(ARROW_MIN_W_IMG, Math.round(box.width * ix))
    const heightImg = Math.max(ARROW_MIN_H_IMG, Math.round(box.height * iy))
    let cxImg = (box.x + box.width / 2) * ix
    let cyImg = (box.y + box.height / 2) * iy
    const c = clampCenterInBounds(cxImg, cyImg, widthImg, heightImg, bounds)
    cxImg = c.cx
    cyImg = c.cy
    const dw = widthImg * (stageW / baseW)
    a.points([-dw / 2, 0, dw / 2, 0])
    const { plen, pw } = arrowPointerSizesFromImageBox(widthImg, heightImg, uniformScale)
    a.pointerLength(plen)
    a.pointerWidth(pw)
    node.x((cxImg / ix) as number)
    node.y((cyImg / iy) as number)
    return {
      ...record,
      x: Math.round(cxImg - widthImg / 2),
      y: Math.round(cyImg - heightImg / 2),
      width: widthImg,
      height: heightImg,
      rotation
    }
  }

  node.scaleX(1)
  node.scaleY(1)

  let widthImg: number
  let heightImg: number

  if (kind === 'rect') {
    const r = node.findOne<Konva.Rect>('.shape-body')
    if (!r) return record
    const wS = Math.max(5, r.width() * sx)
    const hS = Math.max(5, r.height() * sy)
    r.width(wS)
    r.height(hS)
    widthImg = wS * ix
    heightImg = hS * iy
  } else if (kind === 'ellipse') {
    const e = node.findOne<Konva.Ellipse>('.shape-body')
    if (!e) return record
    const rx = Math.max(3, e.radiusX() * sx)
    const ry = Math.max(3, e.radiusY() * sy)
    e.radiusX(rx)
    e.radiusY(ry)
    widthImg = rx * 2 * ix
    heightImg = ry * 2 * iy
  } else if (kind === 'triangle' || kind === 'hexagon') {
    const p = node.findOne<Konva.RegularPolygon>('.shape-body')
    if (!p) return record
    const rS = Math.max(5, p.radius() * Math.max(sx, sy))
    p.radius(rS)
    const d = rS * 2
    widthImg = d * ix
    heightImg = d * iy
  } else if (kind === 'star') {
    const s = node.findOne<Konva.Star>('.shape-body')
    if (!s) return record
    const outer = Math.max(5, s.outerRadius() * Math.max(sx, sy))
    const inner = outer * 0.45
    s.outerRadius(outer)
    s.innerRadius(inner)
    const d = outer * 2
    widthImg = d * ix
    heightImg = d * iy
  } else {
    return record
  }

  let cxImg = node.x() * ix
  let cyImg = node.y() * iy
  const c = clampCenterInBounds(cxImg, cyImg, widthImg, heightImg, bounds)
  cxImg = c.cx
  cyImg = c.cy
  node.x((cxImg / ix) as number)
  node.y((cyImg / iy) as number)

  return {
    ...record,
    x: Math.round(cxImg - widthImg / 2),
    y: Math.round(cyImg - heightImg / 2),
    width: Math.round(widthImg),
    height: Math.round(heightImg),
    rotation
  }
}

function ShapeBody({
  record,
  dw,
  dh,
  uniformScale
}: {
  record: WatermarkShapeRecord
  dw: number
  dh: number
  /** Isotropic scale from image px → stage px (matches export stroke scaling). */
  uniformScale: number
}) {
  const { kind, fill, stroke } = record
  const common = { name: 'shape-body' as const }
  const strokePx = strokeWidthStagePxFromRecord(record, uniformScale)
  const noFill = isShapeFillTransparent(fill)

  switch (kind) {
    case 'rect':
      return (
        <Rect
          {...common}
          x={-dw / 2}
          y={-dh / 2}
          width={dw}
          height={dh}
          fill={fill}
          fillEnabled={!noFill}
          stroke={stroke}
          strokeWidth={strokePx}
        />
      )
    case 'ellipse':
      return (
        <Ellipse
          {...common}
          radiusX={dw / 2}
          radiusY={dh / 2}
          fill={fill}
          fillEnabled={!noFill}
          stroke={stroke}
          strokeWidth={strokePx}
        />
      )
    case 'triangle':
      return (
        <RegularPolygon
          {...common}
          sides={3}
          radius={Math.min(dw, dh) / 2}
          fill={fill}
          fillEnabled={!noFill}
          stroke={stroke}
          strokeWidth={strokePx}
          rotation={-90}
        />
      )
    case 'hexagon':
      return (
        <RegularPolygon
          {...common}
          sides={6}
          radius={Math.min(dw, dh) / 2}
          fill={fill}
          fillEnabled={!noFill}
          stroke={stroke}
          strokeWidth={strokePx}
        />
      )
    case 'star': {
      const outer = Math.min(dw, dh) / 2
      const inner = outer * 0.45
      return (
        <Star
          {...common}
          numPoints={5}
          innerRadius={inner}
          outerRadius={outer}
          fill={fill}
          fillEnabled={!noFill}
          stroke={stroke}
          strokeWidth={strokePx}
        />
      )
    }
    case 'arrow': {
      const { plen, pw } = arrowPointerSizesFromImageBox(record.width, record.height, uniformScale)
      return (
        <Arrow
          {...common}
          points={[-dw / 2, 0, dw / 2, 0]}
          fill={stroke}
          fillEnabled={!noFill}
          stroke={stroke}
          strokeWidth={strokePx}
          pointerLength={plen}
          pointerWidth={pw}
        />
      )
    }
    default:
      return null
  }
}

export default function WatermarkShapesStage({
  shapes,
  onShapesChange,
  selectedId,
  onSelectId,
  active,
  baseImageSize,
  stageSize,
  placementBounds,
  stackZIndex = 4,
  onShapesToolRequested
}: Props) {
  const trRef = useRef<Konva.Transformer>(null)
  const groupRefs = useRef<Map<string, Konva.Group>>(new Map())
  const selectedShape = selectedId ? shapes.find((s) => s.id === selectedId) : null

  const baseW = baseImageSize.width
  const baseH = baseImageSize.height
  const stageW = stageSize.width
  const stageH = stageSize.height
  const { sx, sy, s: uniformScale } = mediaToStageScale(stageW, stageH, baseW, baseH)

  useEffect(() => {
    const tr = trRef.current
    if (!tr || !active) return
    const node = selectedId ? groupRefs.current.get(selectedId) ?? null : null
    tr.nodes(node ? [node] : [])
    tr.getLayer()?.batchDraw()
  }, [active, selectedId, shapes])

  const handleTransformEnd = useCallback(
    (id: string) => (e: KonvaEventObject<Event>) => {
      const node = e.target as Konva.Group
      const record = shapes.find((s) => s.id === id)
      if (!record) return
      const next = syncRecordFromGroup(node, record, baseW, baseH, stageW, stageH, placementBounds)
      onShapesChange(shapes.map((s) => (s.id === id ? next : s)))
    },
    [baseW, baseH, onShapesChange, placementBounds, shapes, stageH, stageW]
  )

  const handleDragEnd = useCallback(
    (id: string) => (e: KonvaEventObject<DragEvent>) => {
      const node = e.target as Konva.Group
      const record = shapes.find((s) => s.id === id)
      if (!record) return
      const ix = baseW / stageW
      const iy = baseH / stageH

      if (record.kind === 'arrow') {
        const box = node.getClientRect()
        const widthImg = Math.max(ARROW_MIN_W_IMG, box.width * ix)
        const heightImg = Math.max(ARROW_MIN_H_IMG, box.height * iy)
        let cxImg = (box.x + box.width / 2) * ix
        let cyImg = (box.y + box.height / 2) * iy
        const c = clampCenterInBounds(cxImg, cyImg, widthImg, heightImg, placementBounds)
        cxImg = c.cx
        cyImg = c.cy
        node.x(cxImg / ix)
        node.y(cyImg / iy)
        onShapesChange(
          shapes.map((s) =>
            s.id === id
              ? {
                  ...s,
                  x: Math.round(cxImg - widthImg / 2),
                  y: Math.round(cyImg - heightImg / 2),
                  width: Math.round(widthImg),
                  height: Math.round(heightImg)
                }
              : s
          )
        )
        return
      }

      let cxImg = node.x() * ix
      let cyImg = node.y() * iy
      const c = clampCenterInBounds(cxImg, cyImg, record.width, record.height, placementBounds)
      cxImg = c.cx
      cyImg = c.cy
      node.x(cxImg / ix)
      node.y(cyImg / iy)
      onShapesChange(
        shapes.map((s) =>
          s.id === id
            ? {
                ...s,
                x: Math.round(cxImg - s.width / 2),
                y: Math.round(cyImg - s.height / 2)
              }
            : s
        )
      )
    },
    [baseH, baseW, onShapesChange, placementBounds, shapes, stageH, stageW]
  )

  if (stageW <= 0 || stageH <= 0) return null

  return (
    <Stage
      width={stageW}
      height={stageH}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: stackZIndex,
        pointerEvents: active || shapes.length > 0 ? 'auto' : 'none'
      }}
    >
      <Layer>
        <Rect
          width={stageW}
          height={stageH}
          fill="transparent"
          listening={active}
          onMouseDown={() => onSelectId(null)}
        />
        {shapes.map((record) => {
          const cx = (record.x + record.width / 2) * sx
          const cy = (record.y + record.height / 2) * sy
          const dw = record.width * sx
          const dh = record.height * sy
          return (
            <Group
              key={record.id}
              id={record.id}
              ref={(node) => {
                if (node) groupRefs.current.set(record.id, node)
                else groupRefs.current.delete(record.id)
              }}
              x={cx}
              y={cy}
              rotation={record.rotation}
              draggable={active}
              onDragEnd={handleDragEnd(record.id)}
              onTransformEnd={handleTransformEnd(record.id)}
              onMouseDown={(e) => {
                e.evt.stopPropagation()
                onSelectId(record.id)
                if (!active) {
                  onShapesToolRequested?.()
                }
              }}
            >
              <ShapeBody record={record} dw={dw} dh={dh} uniformScale={uniformScale} />
            </Group>
          )
        })}
        {active && (
          <Transformer
            ref={trRef}
            rotateEnabled
            rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
            rotationSnapTolerance={10}
            enabledAnchors={selectedShape?.kind === 'arrow' ? ['middle-left', 'middle-right'] : undefined}
            boundBoxFunc={(oldBox, newBox) => {
              if (newBox.width < 8 || newBox.height < 8) return oldBox
              return newBox
            }}
          />
        )}
      </Layer>
    </Stage>
  )
}
