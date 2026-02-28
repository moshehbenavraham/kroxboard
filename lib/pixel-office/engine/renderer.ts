import { TileType, TILE_SIZE, CharacterState, Direction } from '../types'
import type { TileType as TileTypeVal, FurnitureInstance, Character, SpriteData, Seat, FloorColor } from '../types'
import { getCachedSprite, getOutlineSprite } from '../sprites/spriteCache'
import { getCharacterSprites, BUBBLE_PERMISSION_SPRITE, BUBBLE_WAITING_SPRITE } from '../sprites/spriteData'
import { getCatSprites } from '../sprites/catSprites'
import { getCharacterSprite } from './characters'
import { renderMatrixEffect } from './matrixEffect'
import { getColorizedFloorSprite, hasFloorSprites, WALL_COLOR } from '../floorTiles'
import { hasWallSprites, getWallInstances, wallColorToHex } from '../wallTiles'
import {
  CHARACTER_SITTING_OFFSET_PX,
  CHARACTER_Z_SORT_OFFSET,
  OUTLINE_Z_SORT_OFFSET,
  SELECTED_OUTLINE_ALPHA,
  HOVERED_OUTLINE_ALPHA,
  GHOST_PREVIEW_SPRITE_ALPHA,
  GHOST_PREVIEW_TINT_ALPHA,
  SELECTION_DASH_PATTERN,
  BUTTON_MIN_RADIUS,
  BUTTON_RADIUS_ZOOM_FACTOR,
  BUTTON_ICON_SIZE_FACTOR,
  BUTTON_LINE_WIDTH_MIN,
  BUTTON_LINE_WIDTH_ZOOM_FACTOR,
  BUBBLE_FADE_DURATION_SEC,
  BUBBLE_SITTING_OFFSET_PX,
  BUBBLE_VERTICAL_OFFSET_PX,
  FALLBACK_FLOOR_COLOR,
  SEAT_OWN_COLOR,
  SEAT_AVAILABLE_COLOR,
  SEAT_BUSY_COLOR,
  GRID_LINE_COLOR,
  VOID_TILE_OUTLINE_COLOR,
  VOID_TILE_DASH_PATTERN,
  GHOST_BORDER_HOVER_FILL,
  GHOST_BORDER_HOVER_STROKE,
  GHOST_BORDER_STROKE,
  GHOST_VALID_TINT,
  GHOST_INVALID_TINT,
  SELECTION_HIGHLIGHT_COLOR,
  DELETE_BUTTON_BG,
  ROTATE_BUTTON_BG,
  HEATMAP_CELL_SIZE,
  HEATMAP_CELL_GAP,
  HEATMAP_BOTTOM_MARGIN,
} from '../constants'

// ── GitHub Contribution Heatmap ─────────────────────────────────

export interface ContributionDay { count: number; date: string }
export interface ContributionWeek { days: ContributionDay[] }
export interface ContributionData { weeks: ContributionWeek[]; username: string }

const HEATMAP_COLORS = ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39']

function contributionLevel(count: number): number {
  if (count === 0) return 0
  if (count <= 3) return 1
  if (count <= 6) return 2
  if (count <= 9) return 3
  return 4
}

function renderContributionHeatmap(
  ctx: CanvasRenderingContext2D,
  data: ContributionData,
  offsetX: number, offsetY: number, zoom: number,
): void {
  if (!data.weeks.length) return
  const tileW = TILE_SIZE * zoom
  // Draw 52×7 heatmap grid across left room top wall (row 0, cols 1-9)
  const areaX = offsetX + 1 * tileW
  const areaW = 9 * tileW
  const areaH = tileW
  const areaY = offsetY  // row 0 top edge
  // Calculate cell size to fit 52 cols × 7 rows with 1px gaps
  const gapPx = Math.max(0.5, 0.5 * zoom)
  const cellW = (areaW - (data.weeks.length - 1) * gapPx) / data.weeks.length
  const cellH = (areaH - 6 * gapPx) / 7

  // Fill background so gaps between cells are consistent
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(Math.round(areaX), Math.round(areaY), Math.round(areaW), Math.round(areaH))

  for (let w = 0; w < data.weeks.length; w++) {
    const week = data.weeks[w]
    for (let d = 0; d < week.days.length; d++) {
      const level = contributionLevel(week.days[d].count)
      ctx.fillStyle = HEATMAP_COLORS[level]
      const x = areaX + w * (cellW + gapPx)
      const y = areaY + d * (cellH + gapPx)
      ctx.fillRect(Math.round(x), Math.round(y), Math.ceil(cellW), Math.ceil(cellH))
    }
  }
}

/** Render photograph on right room wall (row 0, cols 12-18) */
function renderPhotograph(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  offsetX: number, offsetY: number, zoom: number,
): void {
  const tileW = TILE_SIZE * zoom
  const margin = 1 * zoom  // 1px border
  const baseW = 7 * tileW - margin * 2
  const baseH = tileW - margin * 2
  const scale = 4 / 3
  const areaW = baseW * scale
  const areaH = baseH * scale
  // Anchor bottom edge: shift areaY up by the extra height
  const baseY = offsetY + margin - tileW / 8
  const areaY = baseY + baseH - areaH
  // Center horizontally relative to original area
  const baseX = offsetX + 10 * tileW + margin
  const areaX = baseX - (areaW - baseW) / 2
  // Fit image preserving aspect ratio
  const imgAspect = img.width / img.height
  const areaAspect = areaW / areaH
  let drawW: number, drawH: number, drawX: number, drawY: number
  if (imgAspect > areaAspect) {
    drawW = areaW
    drawH = areaW / imgAspect
    drawX = areaX
    drawY = areaY + (areaH - drawH) / 2
  } else {
    drawH = areaH
    drawW = areaH * imgAspect
    drawX = areaX + (areaW - drawW) / 2
    drawY = areaY
  }
  ctx.drawImage(img, Math.round(drawX), Math.round(drawY), Math.round(drawW), Math.round(drawH))
}

// ── Render functions ────────────────────────────────────────────

export function renderTileGrid(
  ctx: CanvasRenderingContext2D,
  tileMap: TileTypeVal[][],
  offsetX: number,
  offsetY: number,
  zoom: number,
  tileColors?: Array<FloorColor | null>,
  cols?: number,
): void {
  const s = TILE_SIZE * zoom
  const useSpriteFloors = hasFloorSprites()
  const tmRows = tileMap.length
  const tmCols = tmRows > 0 ? tileMap[0].length : 0
  const layoutCols = cols ?? tmCols
  const GRID_STEP = 3 // Draw grid lines every N tiles

  for (let r = 0; r < tmRows; r++) {
    for (let c = 0; c < tmCols; c++) {
      const tile = tileMap[r][c]
      if (tile === TileType.VOID) continue

      if (tile === TileType.WALL) {
        const colorIdx = r * layoutCols + c
        const wallColor = tileColors?.[colorIdx]
        ctx.fillStyle = wallColor ? wallColorToHex(wallColor) : WALL_COLOR
        ctx.fillRect(offsetX + c * s, offsetY + r * s, s, s)
        continue
      }

      if (!useSpriteFloors) {
        ctx.fillStyle = FALLBACK_FLOOR_COLOR
        ctx.fillRect(offsetX + c * s, offsetY + r * s, s, s)
        continue
      }

      // Floor tile: use fillRect with colorized color (no seams)
      const colorIdx = r * layoutCols + c
      const color = tileColors?.[colorIdx] ?? { h: 0, s: 0, b: 0, c: 0 }
      const sprite = getColorizedFloorSprite(tile, color)
      const fillColor = sprite[0]?.[0] || FALLBACK_FLOOR_COLOR
      ctx.fillStyle = fillColor
      ctx.fillRect(offsetX + c * s, offsetY + r * s, s, s)
    }
  }

  // Subtle grid lines at half-tile intervals (ceramic tile effect)
  ctx.save()
  ctx.strokeStyle = 'rgba(0,0,0,0.06)'
  ctx.lineWidth = 2
  const halfS = s / 2

  // Vertical lines — all solid
  ctx.beginPath()
  for (let c = 0; c <= tmCols * 2; c++) {
    const x = Math.round(offsetX + c * halfS) + 0.5
    ctx.moveTo(x, offsetY)
    ctx.lineTo(x, offsetY + tmRows * s)
  }
  ctx.stroke()

  // Horizontal lines — alternate solid and dashed
  for (let r = 0; r <= tmRows * 2; r++) {
    const y = Math.round(offsetY + r * halfS) + 0.5
    ctx.beginPath()
    if (r % 2 === 1) {
      ctx.setLineDash([3, 6])
    } else {
      ctx.setLineDash([])
    }
    ctx.moveTo(offsetX, y)
    ctx.lineTo(offsetX + tmCols * s, y)
    ctx.stroke()
  }

  ctx.setLineDash([])
  ctx.restore()

}

interface ZDrawable {
  zY: number
  draw: (ctx: CanvasRenderingContext2D) => void
}

export function renderScene(
  ctx: CanvasRenderingContext2D,
  furniture: FurnitureInstance[],
  characters: Character[],
  offsetX: number,
  offsetY: number,
  zoom: number,
  selectedAgentId: number | null,
  hoveredAgentId: number | null,
  contributions?: ContributionData,
  photograph?: HTMLImageElement,
): void {
  const drawables: ZDrawable[] = []

  // Wall decorations as z-sorted drawables (zY just above row 0 walls so they render on top of walls but below characters)
  const wallDecoZY = TILE_SIZE + 0.5
  if (contributions && contributions.weeks.length > 0) {
    drawables.push({ zY: wallDecoZY, draw: () => {
      renderContributionHeatmap(ctx, contributions, offsetX, offsetY, zoom)
    }})
  }
  if (photograph) {
    drawables.push({ zY: wallDecoZY, draw: () => {
      renderPhotograph(ctx, photograph, offsetX, offsetY, zoom)
    }})
  }

  // Furniture
  for (const f of furniture) {
    const fx = offsetX + f.x * zoom
    const fy = offsetY + f.y * zoom
    if (f.emoji) {
      const emojiSize = TILE_SIZE * zoom
      const emojiX = fx + emojiSize / 2
      const emojiY = fy + emojiSize * 0.8
      drawables.push({
        zY: f.zY,
        draw: (c) => {
          const scale = f.emojiScale ?? 1
          c.font = `${emojiSize * 0.7 * scale}px serif`
          c.textAlign = 'center'
          c.textBaseline = 'middle'
          if (f.rotation) {
            c.save()
            c.translate(emojiX, emojiY)
            c.rotate((f.rotation * Math.PI) / 180)
            c.fillText(f.emoji!, 0, 0)
            c.restore()
          } else {
            c.fillText(f.emoji!, emojiX, emojiY)
          }

          // Camera flash effect: brief white burst every 10 seconds
          if (f.emoji === '📷') {
            const flashCycle = (Date.now() % 10000) / 10000
            if (flashCycle < 0.03) {
              const flashAlpha = 1 - flashCycle / 0.03
              const flashR = emojiSize * 1.5
              const grad = c.createRadialGradient(emojiX, emojiY, 0, emojiX, emojiY, flashR)
              grad.addColorStop(0, `rgba(255,255,255,${flashAlpha * 0.9})`)
              grad.addColorStop(0.3, `rgba(255,255,200,${flashAlpha * 0.5})`)
              grad.addColorStop(1, `rgba(255,255,200,0)`)
              c.fillStyle = grad
              c.fillRect(emojiX - flashR, emojiY - flashR, flashR * 2, flashR * 2)
            }
          }
        },
      })
    } else {
      const cached = getCachedSprite(f.sprite, zoom)
      drawables.push({
        zY: f.zY,
        draw: (c) => {
          c.drawImage(cached, fx, fy)
        },
      })
    }
  }

  // Characters
  for (const ch of characters) {
    const charZY = ch.y + TILE_SIZE / 2 + CHARACTER_Z_SORT_OFFSET

    if (ch.isLobster) {
      const lobsterX = Math.round(offsetX + ch.x * zoom)
      const lobsterY = Math.round(offsetY + ch.y * zoom + 2 * zoom)
      const lobsterAngle =
        ch.dir === Direction.RIGHT ? Math.PI / 2 :
        ch.dir === Direction.DOWN ? Math.PI :
        ch.dir === Direction.LEFT ? -Math.PI / 2 :
        0
      if (ch.lobsterBubbles.length > 0) {
        const bubbles = ch.lobsterBubbles
        drawables.push({
          zY: charZY - 0.05,
          draw: (c) => {
            c.save()
            c.textAlign = 'center'
            c.textBaseline = 'middle'
            c.font = `${Math.max(10, Math.round(6 * zoom))}px serif`
            for (const b of bubbles) {
              const progress = b.age / 0.8
              const bx = lobsterX + b.x * zoom
              const by = lobsterY + (b.y - progress * 8) * zoom
              const alpha = progress < 0.2 ? progress / 0.2 : progress > 0.7 ? (1 - progress) / 0.3 : 1
              c.globalAlpha = alpha * 0.9
              c.fillText('🫧', bx, by)
            }
            c.restore()
          },
        })
      }
      drawables.push({
        zY: charZY,
        draw: (c) => {
          c.save()
          c.translate(lobsterX, lobsterY)
          c.rotate(lobsterAngle)
          c.textAlign = 'center'
          c.textBaseline = 'middle'
          c.font = `${Math.max(14, Math.round(9 * zoom))}px serif`
          c.fillText('🦞', 0, 0)
          c.restore()
        },
      })
      continue
    }

    const sprites = ch.isCat ? getCatSprites() : getCharacterSprites(ch.palette, ch.hueShift)
    const spriteData = getCharacterSprite(ch, sprites)
    const cached = getCachedSprite(spriteData, zoom)
    // Sitting offset: shift character down when seated so they visually sit in the chair
    const sittingOffset = ch.state === CharacterState.TYPE ? CHARACTER_SITTING_OFFSET_PX : 0
    // Anchor at bottom-center of character — round to integer device pixels
    const drawX = Math.round(offsetX + ch.x * zoom - cached.width / 2)
    const drawY = Math.round(offsetY + (ch.y + sittingOffset) * zoom - cached.height)

    // Sort characters by bottom of their tile (not center) so they render
    // in front of same-row furniture (e.g. chairs) but behind furniture
    // at lower rows (e.g. desks, bookshelves that occlude from below).

    // Matrix spawn/despawn effect — skip outline, use per-pixel rendering
    if (ch.matrixEffect) {
      const mDrawX = drawX
      const mDrawY = drawY
      const mSpriteData = spriteData
      const mCh = ch
      drawables.push({
        zY: charZY,
        draw: (c) => {
          renderMatrixEffect(c, mCh, mSpriteData, mDrawX, mDrawY, zoom)
        },
      })
      continue
    }

    // White outline: full opacity for selected, 50% for hover
    const isSelected = selectedAgentId !== null && ch.id === selectedAgentId
    const isHovered = hoveredAgentId !== null && ch.id === hoveredAgentId
    if (isSelected || isHovered) {
      const outlineAlpha = isSelected ? SELECTED_OUTLINE_ALPHA : HOVERED_OUTLINE_ALPHA
      const outlineData = getOutlineSprite(spriteData)
      const outlineCached = getCachedSprite(outlineData, zoom)
      const olDrawX = drawX - zoom  // 1 sprite-pixel offset, scaled
      const olDrawY = drawY - zoom  // outline follows sitting offset via drawY
      drawables.push({
        zY: charZY - OUTLINE_Z_SORT_OFFSET, // sort just before character
        draw: (c) => {
          c.save()
          c.globalAlpha = outlineAlpha
          c.drawImage(outlineCached, olDrawX, olDrawY)
          c.restore()
        },
      })
    }

    drawables.push({
      zY: charZY,
      draw: (c) => {
        c.drawImage(cached, drawX, drawY)
      },
    })

    // Agent label above head
    if (ch.label) {
      const labelX = Math.round(offsetX + ch.x * zoom)
      const labelY = drawY - 2 * zoom
      const fontSize = Math.max(12, Math.round(5.25 * zoom))
      const isWorking = ch.isActive && ch.state === CharacterState.TYPE
      // Blink effect for working state: use time-based alpha
      const labelAlpha = isWorking ? 0.7 + 0.3 * Math.sin(Date.now() / 300) : 1.0
      const labelColor = isWorking ? `rgba(34,197,94,${labelAlpha})` : '#FFD700'
      drawables.push({
        zY: charZY + 0.1,
        draw: (c) => {
          c.save()
          c.font = `bold ${fontSize}px sans-serif`
          c.textAlign = 'center'
          c.textBaseline = 'bottom'
          c.fillStyle = 'rgba(0,0,0,0.9)'
          c.fillText(ch.label, labelX, labelY + 1)
          c.fillStyle = labelColor
          c.fillText(ch.label, labelX, labelY)
          c.restore()
        },
      })
    }

    // Code snippet particles floating above working characters
    if (ch.codeSnippets.length > 0) {
      const snippets = ch.codeSnippets
      const baseX = Math.round(offsetX + ch.x * zoom)
      const baseY = drawY
      const snipFontSize = Math.max(12, Math.round(7 * zoom))
      drawables.push({
        zY: charZY + 0.2,
        draw: (c) => {
          c.save()
          c.font = `${snipFontSize}px monospace`
          c.textAlign = 'center'
          c.textBaseline = 'bottom'
          for (const s of snippets) {
            const progress = s.age / 2.5 // 0→1 over lifetime
            const floatY = baseY - (10 + progress * 28) * zoom
            const floatX = baseX + s.x * zoom
            const alpha = progress < 0.2 ? progress / 0.2 : progress > 0.7 ? (1 - progress) / 0.3 : 1
            c.globalAlpha = alpha * 0.85
            // Background pill
            const tw = c.measureText(s.text).width
            const px = 3 * (zoom / 3)
            const py = 1.5 * (zoom / 3)
            c.fillStyle = 'rgba(0,0,0,0.7)'
            const rx = floatX - tw / 2 - px
            const ry = floatY - snipFontSize - py
            const rw = tw + px * 2
            const rh = snipFontSize + py * 2
            const cr = 3
            c.beginPath()
            c.moveTo(rx + cr, ry)
            c.lineTo(rx + rw - cr, ry)
            c.quadraticCurveTo(rx + rw, ry, rx + rw, ry + cr)
            c.lineTo(rx + rw, ry + rh - cr)
            c.quadraticCurveTo(rx + rw, ry + rh, rx + rw - cr, ry + rh)
            c.lineTo(rx + cr, ry + rh)
            c.quadraticCurveTo(rx, ry + rh, rx, ry + rh - cr)
            c.lineTo(rx, ry + cr)
            c.quadraticCurveTo(rx, ry, rx + cr, ry)
            c.closePath()
            c.fill()
            // Text
            c.fillStyle = '#4ade80'
            c.fillText(s.text, floatX, floatY)
          }
          c.restore()
        },
      })
    }
  }

  // Sort by Y (lower = in front = drawn later)
  drawables.sort((a, b) => a.zY - b.zY)

  for (const d of drawables) {
    d.draw(ctx)
  }
}

// ── Seat indicators ─────────────────────────────────────────────

export function renderSeatIndicators(
  ctx: CanvasRenderingContext2D,
  seats: Map<string, Seat>,
  characters: Map<number, Character>,
  selectedAgentId: number | null,
  hoveredTile: { col: number; row: number } | null,
  offsetX: number,
  offsetY: number,
  zoom: number,
): void {
  if (selectedAgentId === null || !hoveredTile) return
  const selectedChar = characters.get(selectedAgentId)
  if (!selectedChar) return

  // Only show indicator for the hovered seat tile
  for (const [uid, seat] of seats) {
    if (seat.seatCol !== hoveredTile.col || seat.seatRow !== hoveredTile.row) continue

    const s = TILE_SIZE * zoom
    const x = offsetX + seat.seatCol * s
    const y = offsetY + seat.seatRow * s

    if (selectedChar.seatId === uid) {
      // Selected agent's own seat — blue
      ctx.fillStyle = SEAT_OWN_COLOR
    } else if (!seat.assigned) {
      // Available seat — green
      ctx.fillStyle = SEAT_AVAILABLE_COLOR
    } else {
      // Busy (assigned to another agent) — red
      ctx.fillStyle = SEAT_BUSY_COLOR
    }
    ctx.fillRect(x, y, s, s)
    break
  }
}

// ── Edit mode overlays ──────────────────────────────────────────

export function renderGridOverlay(
  ctx: CanvasRenderingContext2D,
  offsetX: number,
  offsetY: number,
  zoom: number,
  cols: number,
  rows: number,
  tileMap?: TileTypeVal[][],
): void {
  const s = TILE_SIZE * zoom
  ctx.strokeStyle = GRID_LINE_COLOR
  ctx.lineWidth = 1
  ctx.beginPath()
  // Vertical lines — offset by 0.5 for crisp 1px lines
  for (let c = 0; c <= cols; c++) {
    const x = offsetX + c * s + 0.5
    ctx.moveTo(x, offsetY)
    ctx.lineTo(x, offsetY + rows * s)
  }
  // Horizontal lines
  for (let r = 0; r <= rows; r++) {
    const y = offsetY + r * s + 0.5
    ctx.moveTo(offsetX, y)
    ctx.lineTo(offsetX + cols * s, y)
  }
  ctx.stroke()

  // Draw faint dashed outlines on VOID tiles
  if (tileMap) {
    ctx.save()
    ctx.strokeStyle = VOID_TILE_OUTLINE_COLOR
    ctx.lineWidth = 1
    ctx.setLineDash(VOID_TILE_DASH_PATTERN)
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (tileMap[r]?.[c] === TileType.VOID) {
          ctx.strokeRect(offsetX + c * s + 0.5, offsetY + r * s + 0.5, s - 1, s - 1)
        }
      }
    }
    ctx.restore()
  }
}

/** Draw faint expansion placeholders 1 tile outside grid bounds (ghost border). */
export function renderGhostBorder(
  ctx: CanvasRenderingContext2D,
  offsetX: number,
  offsetY: number,
  zoom: number,
  cols: number,
  rows: number,
  ghostHoverCol: number,
  ghostHoverRow: number,
): void {
  const s = TILE_SIZE * zoom
  ctx.save()

  // Collect ghost border tiles: one ring around the grid
  const ghostTiles: Array<{ c: number; r: number }> = []
  // Top and bottom rows
  for (let c = -1; c <= cols; c++) {
    ghostTiles.push({ c, r: -1 })
    ghostTiles.push({ c, r: rows })
  }
  // Left and right columns (excluding corners already added)
  for (let r = 0; r < rows; r++) {
    ghostTiles.push({ c: -1, r })
    ghostTiles.push({ c: cols, r })
  }

  for (const { c, r } of ghostTiles) {
    const x = offsetX + c * s
    const y = offsetY + r * s
    const isHovered = c === ghostHoverCol && r === ghostHoverRow
    if (isHovered) {
      ctx.fillStyle = GHOST_BORDER_HOVER_FILL
      ctx.fillRect(x, y, s, s)
    }
    ctx.strokeStyle = isHovered ? GHOST_BORDER_HOVER_STROKE : GHOST_BORDER_STROKE
    ctx.lineWidth = 1
    ctx.setLineDash(VOID_TILE_DASH_PATTERN)
    ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1)
  }

  ctx.restore()
}

export function renderGhostPreview(
  ctx: CanvasRenderingContext2D,
  sprite: SpriteData,
  col: number,
  row: number,
  valid: boolean,
  offsetX: number,
  offsetY: number,
  zoom: number,
): void {
  const cached = getCachedSprite(sprite, zoom)
  const x = offsetX + col * TILE_SIZE * zoom
  const y = offsetY + row * TILE_SIZE * zoom
  ctx.save()
  ctx.globalAlpha = GHOST_PREVIEW_SPRITE_ALPHA
  ctx.drawImage(cached, x, y)
  // Tint overlay
  ctx.globalAlpha = GHOST_PREVIEW_TINT_ALPHA
  ctx.fillStyle = valid ? GHOST_VALID_TINT : GHOST_INVALID_TINT
  ctx.fillRect(x, y, cached.width, cached.height)
  ctx.restore()
}

export function renderSelectionHighlight(
  ctx: CanvasRenderingContext2D,
  col: number,
  row: number,
  w: number,
  h: number,
  offsetX: number,
  offsetY: number,
  zoom: number,
): void {
  const s = TILE_SIZE * zoom
  const x = offsetX + col * s
  const y = offsetY + row * s
  ctx.save()
  ctx.strokeStyle = SELECTION_HIGHLIGHT_COLOR
  ctx.lineWidth = 2
  ctx.setLineDash(SELECTION_DASH_PATTERN)
  ctx.strokeRect(x + 1, y + 1, w * s - 2, h * s - 2)
  ctx.restore()
}

export function renderDeleteButton(
  ctx: CanvasRenderingContext2D,
  col: number,
  row: number,
  w: number,
  _h: number,
  offsetX: number,
  offsetY: number,
  zoom: number,
): DeleteButtonBounds {
  const s = TILE_SIZE * zoom
  // Position at top-right corner of selected furniture
  const cx = offsetX + (col + w) * s + 1
  const cy = offsetY + row * s - 1
  const radius = Math.max(BUTTON_MIN_RADIUS, zoom * BUTTON_RADIUS_ZOOM_FACTOR)

  // Circle background
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.fillStyle = DELETE_BUTTON_BG
  ctx.fill()

  // X mark
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = Math.max(BUTTON_LINE_WIDTH_MIN, zoom * BUTTON_LINE_WIDTH_ZOOM_FACTOR)
  ctx.lineCap = 'round'
  const xSize = radius * BUTTON_ICON_SIZE_FACTOR
  ctx.beginPath()
  ctx.moveTo(cx - xSize, cy - xSize)
  ctx.lineTo(cx + xSize, cy + xSize)
  ctx.moveTo(cx + xSize, cy - xSize)
  ctx.lineTo(cx - xSize, cy + xSize)
  ctx.stroke()
  ctx.restore()

  return { cx, cy, radius }
}

export function renderRotateButton(
  ctx: CanvasRenderingContext2D,
  col: number,
  row: number,
  _w: number,
  _h: number,
  offsetX: number,
  offsetY: number,
  zoom: number,
): RotateButtonBounds {
  const s = TILE_SIZE * zoom
  // Position to the left of the delete button (which is at top-right corner)
  const radius = Math.max(BUTTON_MIN_RADIUS, zoom * BUTTON_RADIUS_ZOOM_FACTOR)
  const cx = offsetX + col * s - 1
  const cy = offsetY + row * s - 1

  // Circle background
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.fillStyle = ROTATE_BUTTON_BG
  ctx.fill()

  // Circular arrow icon
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = Math.max(BUTTON_LINE_WIDTH_MIN, zoom * BUTTON_LINE_WIDTH_ZOOM_FACTOR)
  ctx.lineCap = 'round'
  const arcR = radius * BUTTON_ICON_SIZE_FACTOR
  ctx.beginPath()
  // Draw a 270-degree arc
  ctx.arc(cx, cy, arcR, -Math.PI * 0.8, Math.PI * 0.7)
  ctx.stroke()
  // Draw arrowhead at the end of the arc
  const endAngle = Math.PI * 0.7
  const endX = cx + arcR * Math.cos(endAngle)
  const endY = cy + arcR * Math.sin(endAngle)
  const arrowSize = radius * 0.35
  ctx.beginPath()
  ctx.moveTo(endX + arrowSize * 0.6, endY - arrowSize * 0.3)
  ctx.lineTo(endX, endY)
  ctx.lineTo(endX + arrowSize * 0.7, endY + arrowSize * 0.5)
  ctx.stroke()
  ctx.restore()

  return { cx, cy, radius }
}

// ── Speech bubbles ──────────────────────────────────────────────

export function renderBubbles(
  ctx: CanvasRenderingContext2D,
  characters: Character[],
  offsetX: number,
  offsetY: number,
  zoom: number,
): void {
  for (const ch of characters) {
    if (!ch.bubbleType) continue

    const sprite = ch.bubbleType === 'permission'
      ? BUBBLE_PERMISSION_SPRITE
      : BUBBLE_WAITING_SPRITE

    // Compute opacity: permission = full, waiting = fade in last 0.5s
    let alpha = 1.0
    if (ch.bubbleType === 'waiting' && ch.bubbleTimer < BUBBLE_FADE_DURATION_SEC) {
      alpha = ch.bubbleTimer / BUBBLE_FADE_DURATION_SEC
    }

    const cached = getCachedSprite(sprite, zoom)
    // Position: centered above the character's head
    // Character is anchored bottom-center at (ch.x, ch.y), sprite is 16x24
    // Place bubble above head with a small gap; follow sitting offset
    const sittingOff = ch.state === CharacterState.TYPE ? BUBBLE_SITTING_OFFSET_PX : 0
    const bubbleX = Math.round(offsetX + ch.x * zoom - cached.width / 2)
    const bubbleY = Math.round(offsetY + (ch.y + sittingOff - BUBBLE_VERTICAL_OFFSET_PX) * zoom - cached.height - 1 * zoom)

    ctx.save()
    if (alpha < 1.0) ctx.globalAlpha = alpha
    ctx.drawImage(cached, bubbleX, bubbleY)
    ctx.restore()
  }
}

export function renderPhotoComments(
  ctx: CanvasRenderingContext2D,
  characters: Character[],
  offsetX: number,
  offsetY: number,
  zoom: number,
): void {
  const lifetime = 4.0
  const canvasH = ctx.canvas.height / (window.devicePixelRatio || 1)
  for (const ch of characters) {
    if (ch.photoComments.length === 0) continue
    const sittingOff = ch.state === CharacterState.TYPE ? BUBBLE_SITTING_OFFSET_PX : 0
    const anchorX = Math.round(offsetX + ch.x * zoom)
    const anchorY = Math.round(offsetY + (ch.y + sittingOff - BUBBLE_VERTICAL_OFFSET_PX) * zoom)
    const fontSize = Math.max(10, Math.round(4 * zoom))
    const totalFloatDist = anchorY + 20 // distance from character to top of canvas

    ctx.save()
    ctx.font = `bold ${fontSize}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'

    for (const pc of ch.photoComments) {
      const progress = pc.age / lifetime
      let alpha = 1.0
      if (pc.age < 0.3) alpha = pc.age / 0.3
      if (progress > 0.6) alpha = (1 - progress) / 0.4
      const floatY = progress * totalFloatDist
      const baseX = anchorX + pc.x * zoom
      const baseY = anchorY - floatY

      ctx.globalAlpha = alpha * 0.95
      const tw = ctx.measureText(pc.text).width
      const px = 4 * (zoom / 3)
      const py = 2 * (zoom / 3)
      const rx = baseX - tw / 2 - px
      const ry = baseY - fontSize - py * 2
      const rw = tw + px * 2
      const rh = fontSize + py * 2
      const cr = 4

      // Background pill
      ctx.fillStyle = 'rgba(0,0,0,0.8)'
      ctx.beginPath()
      ctx.moveTo(rx + cr, ry)
      ctx.lineTo(rx + rw - cr, ry)
      ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + cr)
      ctx.lineTo(rx + rw, ry + rh - cr)
      ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - cr, ry + rh)
      ctx.lineTo(rx + cr, ry + rh)
      ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - cr)
      ctx.lineTo(rx, ry + cr)
      ctx.quadraticCurveTo(rx, ry, rx + cr, ry)
      ctx.closePath()
      ctx.fill()

      // Text
      ctx.fillStyle = '#FFD700'
      ctx.fillText(pc.text, baseX, baseY - py)
    }
    ctx.restore()
  }
}

export interface ButtonBounds {
  /** Center X in device pixels */
  cx: number
  /** Center Y in device pixels */
  cy: number
  /** Radius in device pixels */
  radius: number
}

export type DeleteButtonBounds = ButtonBounds
export type RotateButtonBounds = ButtonBounds

export interface EditorRenderState {
  showGrid: boolean
  ghostSprite: SpriteData | null
  ghostCol: number
  ghostRow: number
  ghostValid: boolean
  selectedCol: number
  selectedRow: number
  selectedW: number
  selectedH: number
  hasSelection: boolean
  isRotatable: boolean
  /** Updated each frame by renderDeleteButton */
  deleteButtonBounds: DeleteButtonBounds | null
  /** Updated each frame by renderRotateButton */
  rotateButtonBounds: RotateButtonBounds | null
  /** Whether to show ghost border (expansion tiles outside grid) */
  showGhostBorder: boolean
  /** Hovered ghost border tile col (-1 to cols) */
  ghostBorderHoverCol: number
  /** Hovered ghost border tile row (-1 to rows) */
  ghostBorderHoverRow: number
}

export interface SelectionRenderState {
  selectedAgentId: number | null
  hoveredAgentId: number | null
  hoveredTile: { col: number; row: number } | null
  seats: Map<string, Seat>
  characters: Map<number, Character>
}

export function renderFrame(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  tileMap: TileTypeVal[][],
  furniture: FurnitureInstance[],
  characters: Character[],
  zoom: number,
  panX: number,
  panY: number,
  selection?: SelectionRenderState,
  editor?: EditorRenderState,
  tileColors?: Array<FloorColor | null>,
  layoutCols?: number,
  layoutRows?: number,
  contributions?: ContributionData,
  photograph?: HTMLImageElement,
): { offsetX: number; offsetY: number } {
  // Clear
  ctx.clearRect(0, 0, canvasWidth, canvasHeight)

  // Use layout dimensions (fallback to tileMap size)
  const cols = layoutCols ?? (tileMap.length > 0 ? tileMap[0].length : 0)
  const rows = layoutRows ?? tileMap.length

  // Center map in viewport + pan offset (integer device pixels)
  const mapW = cols * TILE_SIZE * zoom
  const mapH = rows * TILE_SIZE * zoom
  const offsetX = Math.floor((canvasWidth - mapW) / 2) + Math.round(panX)
  const offsetY = Math.floor((canvasHeight - mapH) / 2) + Math.round(panY)

  // Draw tiles (floor + wall base color)
  renderTileGrid(ctx, tileMap, offsetX, offsetY, zoom, tileColors, layoutCols)

  // Seat indicators (below furniture/characters, on top of floor)
  if (selection) {
    renderSeatIndicators(ctx, selection.seats, selection.characters, selection.selectedAgentId, selection.hoveredTile, offsetX, offsetY, zoom)
  }

  // Build wall instances for z-sorting with furniture and characters
  const wallInstances = hasWallSprites()
    ? getWallInstances(tileMap, tileColors, layoutCols)
    : []
  const allFurniture = wallInstances.length > 0
    ? [...wallInstances, ...furniture]
    : furniture

  // Draw walls + furniture + characters (z-sorted)
  const selectedId = selection?.selectedAgentId ?? null
  const hoveredId = selection?.hoveredAgentId ?? null
  renderScene(ctx, allFurniture, characters, offsetX, offsetY, zoom, selectedId, hoveredId, contributions, photograph)

  // Speech bubbles (always on top of characters)
  renderBubbles(ctx, characters, offsetX, offsetY, zoom)

  // Editor overlays
  if (editor) {
    if (editor.showGrid) {
      renderGridOverlay(ctx, offsetX, offsetY, zoom, cols, rows, tileMap)
    }
    if (editor.showGhostBorder) {
      renderGhostBorder(ctx, offsetX, offsetY, zoom, cols, rows, editor.ghostBorderHoverCol, editor.ghostBorderHoverRow)
    }
    if (editor.ghostSprite && editor.ghostCol >= 0) {
      renderGhostPreview(ctx, editor.ghostSprite, editor.ghostCol, editor.ghostRow, editor.ghostValid, offsetX, offsetY, zoom)
    }
    if (editor.hasSelection) {
      renderSelectionHighlight(ctx, editor.selectedCol, editor.selectedRow, editor.selectedW, editor.selectedH, offsetX, offsetY, zoom)
      editor.deleteButtonBounds = renderDeleteButton(ctx, editor.selectedCol, editor.selectedRow, editor.selectedW, editor.selectedH, offsetX, offsetY, zoom)
      if (editor.isRotatable) {
        editor.rotateButtonBounds = renderRotateButton(ctx, editor.selectedCol, editor.selectedRow, editor.selectedW, editor.selectedH, offsetX, offsetY, zoom)
      } else {
        editor.rotateButtonBounds = null
      }
    } else {
      editor.deleteButtonBounds = null
      editor.rotateButtonBounds = null
    }
  }

  return { offsetX, offsetY }
}
