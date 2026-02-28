import { TILE_SIZE, MATRIX_EFFECT_DURATION, CharacterState, Direction } from '../types'
import {
  PALETTE_COUNT,
  HUE_SHIFT_MIN_DEG,
  HUE_SHIFT_RANGE_DEG,
  WAITING_BUBBLE_DURATION_SEC,
  DISMISS_BUBBLE_FAST_FADE_SEC,
  INACTIVE_SEAT_TIMER_MIN_SEC,
  INACTIVE_SEAT_TIMER_RANGE_SEC,
  AUTO_ON_FACING_DEPTH,
  AUTO_ON_SIDE_DEPTH,
  CHARACTER_SITTING_OFFSET_PX,
  CHARACTER_HIT_HALF_WIDTH,
  CHARACTER_HIT_HEIGHT,
} from '../constants'
import type { Character, Seat, FurnitureInstance, TileType as TileTypeVal, OfficeLayout, PlacedFurniture } from '../types'
import { createCharacter, updateCharacter } from './characters'
import { matrixEffectSeeds } from './matrixEffect'
import { isWalkable, getWalkableTiles, findPath } from '../layout/tileMap'
import {
  createDefaultLayout,
  layoutToTileMap,
  layoutToFurnitureInstances,
  layoutToSeats,
  getBlockedTiles,
  getInteractionPoints,
  getDoorwayTiles,
} from '../layout/layoutSerializer'
import type { InteractionPoint } from '../layout/layoutSerializer'
import { getCatalogEntry, getOnStateType } from '../layout/furnitureCatalog'

const CODE_SNIPPET_LIFETIME = 2.5 // seconds
const CODE_SNIPPET_SPAWN_RATE = 0.6 // per second
const PHOTO_COMMENT_LIFETIME = 4.0 // seconds
const PHOTO_COMMENT_SPAWN_RATE = 2.5 // per second
const LOBSTER_RAGE_DURATION_SEC = 10
const LOBSTER_BUBBLE_LIFETIME_SEC = 0.8
const LOBSTER_BUBBLE_SPAWN_RATE = 12
const LOBSTER_HIT_RADIUS_PX = 6
const CODE_SNIPPETS = [
  // JS/TS
  'if (...)', 'else {', 'for (...)', 'return', 'async', 'await', 'try {', 'catch', 'import',
  'const x =', '=> {', '...args', '() => {}', '[...arr]', '{ ...obj }', '===', '?.', '??',
  // Python
  'def fn():', 'self.', 'yield', 'lambda x:', '@decorator', '**kwargs', 'except:', 'raise',
  // LLM / AI
  'prompt:', 'tokens++', 'model.chat()', 'agent.run()', 'stream()', 'tool_use', 'thinking...',
  'chat.completions', 'role: "user"', 'max_tokens=', 'temperature=0.7', 'messages.append()',
  'stop_reason', 'tool_calls[]', 'system_prompt', 'embedding()', 'rag.search()', 'context[]',
  // Prompt snippets
  'You are a...', 'Step by step', 'Let me think', 'In summary:', 'For example:',
  'Please fix...', 'Refactor this', 'Add tests for', 'Explain why', 'Review this PR',
  'Write a func', 'Debug this', 'Optimize the', 'How to impl', 'Best practice',
  'Chain of thought', 'Few-shot:', 'Zero-shot:', 'As an expert', 'Given context:',
  // Dev slang
  'LGTM', 'RTFM', 'WIP', 'FIXME:', 'TODO:', 'HACK:', 'nit:', '// why?!',
  'git push -f', 'rm -rf node_', 'npm i npm i', 'works on my💻', 'ship it!',
  '¯\\_(ツ)_/¯', 'seg fault', 'null ptr', '404', 'stack overflow',
  'it compiles!', 'no repro', 'wontfix', 'by design', 'tech debt++',
  'rebase hell', 'merge conflict', '// magic num', 'sudo !!', 'chmod 777',
  'rm -rf /*', 'rm -rf /*', 'rm -rf /*', 'rm -rf /*', 'rm -rf /*',
  'rm -rf /*', 'rm -rf /*', 'rm -rf /*', 'rm -rf /*', 'rm -rf /*',
  'rm -rf /*', 'rm -rf /*', 'rm -rf /*', 'rm -rf /*', 'rm -rf /*',
  'rm -rf /*', 'rm -rf /*', 'rm -rf /*', 'rm -rf /*', 'rm -rf /*',
  'rm -rf /*', 'rm -rf /*', 'rm -rf /*', 'rm -rf /*', 'rm -rf /*',
  'rm -rf /*', 'rm -rf /*', 'rm -rf /*', 'rm -rf /*', 'rm -rf /*',
  // 中文程序员黑话
  '// 别删这行', '// 能跑就行', '// 不知道为啥能跑', '// 下次再改', '// 祖传代码',
  '在吗？', '已读不回', '先这样吧', '回滚！', '又挂了',
  '谁动了我的分支', '这不是bug', '需求又变了', '上线吧', '别碰那个文件',
  '跑不起来啊', '重启试试', '这是谁写的屎山！！！', '谁删我代码了？？？tmd', '又500了', '删库跑路再说！！！',
  // OpenClaw CLI
  'openclaw status', 'openclaw gateway start', 'openclaw gateway restart',
  'openclaw logs', 'openclaw doctor', 'openclaw config get',
  'openclaw message send', 'openclaw skills', 'openclaw models', 'openclaw update',
]

const PHOTO_COMMENTS = [
  '毒！', '毒德大学', '德味！', '刀锐奶化', '空气切割感',
  '氛围感拉满', '这光太绝了', '构图教科书', '色彩太舒服了', '学习了',
  '出片了！', '壁纸级', '大片既视感', '这质感绝了', '奶油焦外',
  '焦段选得好', '拍出了情绪', '太有电影感了',
  '德味、毒、大师、学习了！！！', '德味、毒、大师、学习了！！！', '德味、毒、大师、学习了！！！',
  '德味、毒、大师、学习了！！！', '德味、毒、大师、学习了！！！',
  '不愧是中国布列松', '这是决定性瞬间！！！', '这个复杂构图绝了！',
]

export class OfficeState {
  layout: OfficeLayout
  tileMap: TileTypeVal[][]
  seats: Map<string, Seat>
  blockedTiles: Set<string>
  furniture: FurnitureInstance[]
  walkableTiles: Array<{ col: number; row: number }>
  interactionPoints: InteractionPoint[]
  doorwayTiles: Array<{ col: number; row: number }>
  characters: Map<number, Character> = new Map()
  selectedAgentId: number | null = null
  cameraFollowId: number | null = null
  hoveredAgentId: number | null = null
  hoveredTile: { col: number; row: number } | null = null
  /** Maps "parentId:toolId" → sub-agent character ID (negative) */
  subagentIdMap: Map<string, number> = new Map()
  /** Reverse lookup: sub-agent character ID → parent info */
  subagentMeta: Map<number, { parentAgentId: number; parentToolId: string }> = new Map()
  private nextSubagentId = -1
  private static CAT_ID = -9999
  private static LOBSTER_ID = -9998
  private static HUNTER_LOBSTER_ID = -9997

  constructor(layout?: OfficeLayout) {
    this.layout = layout || createDefaultLayout()
    this.tileMap = layoutToTileMap(this.layout)
    this.seats = layoutToSeats(this.layout.furniture)
    this.blockedTiles = getBlockedTiles(this.layout.furniture)
    this.furniture = layoutToFurnitureInstances(this.layout.furniture)
    this.walkableTiles = getWalkableTiles(this.tileMap, this.blockedTiles)
    this.interactionPoints = getInteractionPoints(this.layout.furniture, this.tileMap, this.blockedTiles)
    this.doorwayTiles = getDoorwayTiles(this.layout)
    this.spawnCat()
    this.spawnLobster()
    this.spawnHunterLobster()
  }

  /** Rebuild all derived state from a new layout. Reassigns existing characters.
   *  @param shift Optional pixel shift to apply when grid expands left/up */
  rebuildFromLayout(layout: OfficeLayout, shift?: { col: number; row: number }): void {
    this.layout = layout
    this.tileMap = layoutToTileMap(layout)
    this.seats = layoutToSeats(layout.furniture)
    this.blockedTiles = getBlockedTiles(layout.furniture)
    this.rebuildFurnitureInstances()
    this.walkableTiles = getWalkableTiles(this.tileMap, this.blockedTiles)
    this.interactionPoints = getInteractionPoints(layout.furniture, this.tileMap, this.blockedTiles)
    this.doorwayTiles = getDoorwayTiles(layout)

    // Shift character positions when grid expands left/up
    if (shift && (shift.col !== 0 || shift.row !== 0)) {
      for (const ch of this.characters.values()) {
        ch.tileCol += shift.col
        ch.tileRow += shift.row
        ch.x += shift.col * TILE_SIZE
        ch.y += shift.row * TILE_SIZE
        // Clear path since tile coords changed
        ch.path = []
        ch.moveProgress = 0
      }
    }

    // Reassign characters to new seats, preserving existing assignments when possible
    for (const seat of this.seats.values()) {
      seat.assigned = false
    }

    // First pass: try to keep characters at their existing seats
    for (const ch of this.characters.values()) {
      if (ch.seatId && this.seats.has(ch.seatId)) {
        const seat = this.seats.get(ch.seatId)!
        if (!seat.assigned) {
          seat.assigned = true
          // Snap character to seat position (tileCol/Row rounded for pathfinding, x/y fractional for visual)
          ch.tileCol = Math.round(seat.seatCol)
          ch.tileRow = Math.round(seat.seatRow)
          const cx = seat.seatCol * TILE_SIZE + TILE_SIZE / 2
          const cy = seat.seatRow * TILE_SIZE + TILE_SIZE / 2
          ch.x = cx
          ch.y = cy
          ch.dir = seat.facingDir
          continue
        }
      }
      ch.seatId = null // will be reassigned below
    }

    // Second pass: assign remaining characters to free seats
    for (const ch of this.characters.values()) {
      if (ch.seatId) continue
      const seatId = this.findFreeSeat()
      if (seatId) {
        this.seats.get(seatId)!.assigned = true
        ch.seatId = seatId
        const seat = this.seats.get(seatId)!
        ch.tileCol = Math.round(seat.seatCol)
        ch.tileRow = Math.round(seat.seatRow)
        ch.x = seat.seatCol * TILE_SIZE + TILE_SIZE / 2
        ch.y = seat.seatRow * TILE_SIZE + TILE_SIZE / 2
        ch.dir = seat.facingDir
      }
    }

    // Relocate any characters that ended up outside bounds or on non-walkable tiles
    for (const ch of this.characters.values()) {
      if (ch.seatId) continue // seated characters are fine
      if (ch.tileCol < 0 || ch.tileCol >= layout.cols || ch.tileRow < 0 || ch.tileRow >= layout.rows) {
        this.relocateCharacterToWalkable(ch)
      }
    }
  }

  /** Move a character to a random walkable tile */
  private relocateCharacterToWalkable(ch: Character): void {
    if (this.walkableTiles.length === 0) return
    const spawn = this.walkableTiles[Math.floor(Math.random() * this.walkableTiles.length)]
    ch.tileCol = spawn.col
    ch.tileRow = spawn.row
    ch.x = spawn.col * TILE_SIZE + TILE_SIZE / 2
    ch.y = spawn.row * TILE_SIZE + TILE_SIZE / 2
    ch.path = []
    ch.moveProgress = 0
  }

  getLayout(): OfficeLayout {
    return this.layout
  }

  /** Get the blocked-tile key for a character's own seat, or null */
  private ownSeatKey(ch: Character): string | null {
    if (!ch.seatId) return null
    const seat = this.seats.get(ch.seatId)
    if (!seat) return null
    return `${Math.round(seat.seatCol)},${Math.round(seat.seatRow)}`
  }

  /** Temporarily unblock a character's own seat, run fn, then re-block */
  private withOwnSeatUnblocked<T>(ch: Character, fn: () => T): T {
    const key = this.ownSeatKey(ch)
    if (key) this.blockedTiles.delete(key)
    const result = fn()
    if (key) this.blockedTiles.add(key)
    return result
  }

  private findFreeSeat(): string | null {
    for (const [uid, seat] of this.seats) {
      if (!seat.assigned) return uid
    }
    return null
  }

  /**
   * Pick a diverse palette for a new agent based on currently active agents.
   * First 6 agents each get a unique skin (random order). Beyond 6, skins
   * repeat in balanced rounds with a random hue shift (≥45°).
   */
  private pickDiversePalette(): { palette: number; hueShift: number } {
    // Count how many non-sub-agents use each base palette (0-5)
    const counts = new Array(PALETTE_COUNT).fill(0) as number[]
    for (const ch of this.characters.values()) {
      if (ch.isSubagent) continue
      counts[ch.palette]++
    }
    const minCount = Math.min(...counts)
    // Available = palettes at the minimum count (least used)
    const available: number[] = []
    for (let i = 0; i < PALETTE_COUNT; i++) {
      if (counts[i] === minCount) available.push(i)
    }
    const palette = available[Math.floor(Math.random() * available.length)]
    // First round (minCount === 0): no hue shift. Subsequent rounds: random ≥45°.
    let hueShift = 0
    if (minCount > 0) {
      hueShift = HUE_SHIFT_MIN_DEG + Math.floor(Math.random() * HUE_SHIFT_RANGE_DEG)
    }
    return { palette, hueShift }
  }

  addAgent(id: number, preferredPalette?: number, preferredHueShift?: number, preferredSeatId?: string, skipSpawnEffect?: boolean, spawnAtDoor?: boolean): void {
    if (this.characters.has(id)) return

    let palette: number
    let hueShift: number
    if (preferredPalette !== undefined) {
      palette = preferredPalette
      hueShift = preferredHueShift ?? 0
    } else {
      const pick = this.pickDiversePalette()
      palette = pick.palette
      hueShift = pick.hueShift
    }

    // Try preferred seat first, then any free seat
    let seatId: string | null = null
    if (preferredSeatId && this.seats.has(preferredSeatId)) {
      const seat = this.seats.get(preferredSeatId)!
      if (!seat.assigned) {
        seatId = preferredSeatId
      }
    }
    if (!seatId) {
      seatId = this.findFreeSeat()
    }

    let ch: Character

    // Spawn at doorway and walk to seat
    if (spawnAtDoor && this.doorwayTiles.length > 0 && seatId) {
      const door = this.doorwayTiles[Math.floor(Math.random() * this.doorwayTiles.length)]
      const seat = this.seats.get(seatId)!
      seat.assigned = true
      ch = createCharacter(id, palette, seatId, null, hueShift)
      ch.tileCol = door.col
      ch.tileRow = door.row
      ch.x = door.col * TILE_SIZE + TILE_SIZE / 2
      ch.y = door.row * TILE_SIZE + TILE_SIZE / 2
      ch.dir = Direction.DOWN
      // Pathfind from door to seat
      const path = findPath(door.col, door.row, Math.round(seat.seatCol), Math.round(seat.seatRow), this.tileMap, this.blockedTiles)
      if (path.length > 0) {
        ch.path = path
        ch.state = CharacterState.WALK
        ch.frame = 0
        ch.frameTimer = 0
      } else {
        // No path — just sit at seat directly
        ch.tileCol = Math.round(seat.seatCol)
        ch.tileRow = Math.round(seat.seatRow)
        ch.x = seat.seatCol * TILE_SIZE + TILE_SIZE / 2
        ch.y = seat.seatRow * TILE_SIZE + TILE_SIZE / 2
        ch.dir = seat.facingDir
        ch.state = CharacterState.TYPE
      }
    } else if (seatId) {
      const seat = this.seats.get(seatId)!
      seat.assigned = true
      ch = createCharacter(id, palette, seatId, seat, hueShift)
    } else {
      // No seats — spawn at random walkable tile
      const spawn = this.walkableTiles.length > 0
        ? this.walkableTiles[Math.floor(Math.random() * this.walkableTiles.length)]
        : { col: 1, row: 1 }
      ch = createCharacter(id, palette, null, null, hueShift)
      ch.x = spawn.col * TILE_SIZE + TILE_SIZE / 2
      ch.y = spawn.row * TILE_SIZE + TILE_SIZE / 2
      ch.tileCol = spawn.col
      ch.tileRow = spawn.row
    }

    if (!skipSpawnEffect) {
      ch.matrixEffect = 'spawn'
      ch.matrixEffectTimer = 0
      ch.matrixEffectSeeds = matrixEffectSeeds()
    }
    this.characters.set(id, ch)
  }

  /** Spawn the office cat at a random walkable tile */
  spawnCat(): void {
    const id = OfficeState.CAT_ID
    if (this.characters.has(id)) return
    const spawn = this.walkableTiles.length > 0
      ? this.walkableTiles[Math.floor(Math.random() * this.walkableTiles.length)]
      : { col: 1, row: 1 }
    const ch = createCharacter(id, 0, null, null, 0)
    ch.isCat = true
    ch.tileCol = spawn.col
    ch.tileRow = spawn.row
    ch.x = spawn.col * TILE_SIZE + TILE_SIZE / 2
    ch.y = spawn.row * TILE_SIZE + TILE_SIZE / 2
    ch.state = CharacterState.IDLE
    ch.wanderTimer = 1 + Math.random() * 3
    this.characters.set(id, ch)
  }

  /** Spawn the office lobster at a random walkable tile */
  spawnLobster(): void {
    const id = OfficeState.LOBSTER_ID
    if (this.characters.has(id)) return
    const spawn = this.walkableTiles.length > 0
      ? this.walkableTiles[Math.floor(Math.random() * this.walkableTiles.length)]
      : { col: 1, row: 1 }
    const ch = createCharacter(id, 0, null, null, 0)
    ch.isLobster = true
    ch.tileCol = spawn.col
    ch.tileRow = spawn.row
    ch.x = spawn.col * TILE_SIZE + TILE_SIZE / 2
    ch.y = spawn.row * TILE_SIZE + TILE_SIZE / 2
    ch.state = CharacterState.IDLE
    ch.wanderTimer = 1 + Math.random() * 3
    this.characters.set(id, ch)
  }

  toggleFirstLobsterRage(): boolean {
    const lobster = this.characters.get(OfficeState.LOBSTER_ID)
    if (!lobster || !lobster.isLobster) return false
    if (lobster.lobsterRageTimer > 0) {
      lobster.lobsterRageTimer = 0
      lobster.lobsterBubbles = []
      return false
    }
    lobster.lobsterRageTimer = LOBSTER_RAGE_DURATION_SEC
    return true
  }

  getFirstLobsterAt(worldX: number, worldY: number): number | null {
    const lobster = this.characters.get(OfficeState.LOBSTER_ID)
    if (!lobster || lobster.matrixEffect === 'despawn') return null
    const cx = lobster.x
    const cy = lobster.y + 2
    const dx = worldX - cx
    const dy = worldY - cy
    const hitR = LOBSTER_HIT_RADIUS_PX
    if (dx * dx + dy * dy <= hitR * hitR) return lobster.id
    return null
  }

  /** Spawn the hunter lobster at a random walkable tile */
  spawnHunterLobster(): void {
    const id = OfficeState.HUNTER_LOBSTER_ID
    if (this.characters.has(id)) return
    const spawn = this.walkableTiles.length > 0
      ? this.walkableTiles[Math.floor(Math.random() * this.walkableTiles.length)]
      : { col: 1, row: 1 }
    const ch = createCharacter(id, 0, null, null, 0)
    ch.isLobster = true
    ch.tileCol = spawn.col
    ch.tileRow = spawn.row
    ch.x = spawn.col * TILE_SIZE + TILE_SIZE / 2
    ch.y = spawn.row * TILE_SIZE + TILE_SIZE / 2
    ch.state = CharacterState.IDLE
    ch.wanderTimer = 1 + Math.random() * 3
    this.characters.set(id, ch)
  }

  private getFirstIdleHumanoid(): Character | null {
    const list = Array.from(this.characters.values())
      .filter(ch => !ch.isCat && !ch.isLobster && ch.state === CharacterState.IDLE && ch.matrixEffect !== 'despawn')
      .sort((a, b) => a.id - b.id)
    return list[0] || null
  }

  private faceToward(ch: Character, target: Character): void {
    const dx = target.tileCol - ch.tileCol
    const dy = target.tileRow - ch.tileRow
    if (Math.abs(dx) >= Math.abs(dy)) {
      ch.dir = dx >= 0 ? Direction.RIGHT : Direction.LEFT
    } else {
      ch.dir = dy >= 0 ? Direction.DOWN : Direction.UP
    }
  }

  private spawnLobsterBubble(ch: Character): void {
    let tailX = 0
    let tailY = 0
    if (ch.dir === Direction.RIGHT) tailX = -6
    else if (ch.dir === Direction.LEFT) tailX = 6
    else if (ch.dir === Direction.UP) tailY = 6
    else tailY = -6
    ch.lobsterBubbles.push({
      age: 0,
      x: tailX + (Math.random() - 0.5) * 2.5,
      y: tailY + (Math.random() - 0.5) * 2.5,
    })
  }

  /**
   * Hunter lobster behavior:
   * - No idle humanoid -> default wandering (same as normal lobster)
   * - Has idle humanoid -> follow while staying around half a tile away
   */
  private updateHunterLobster(ch: Character, dt: number, idleTarget: Character | null): void {
    if (!idleTarget) {
      this.withOwnSeatUnblocked(ch, () =>
        updateCharacter(ch, dt, this.walkableTiles, this.seats, this.tileMap, this.blockedTiles, this.interactionPoints)
      )
      return
    }

    const targetDistancePx = TILE_SIZE * 0.5
    const stopDistancePx = TILE_SIZE * 0.45
    const dx = idleTarget.x - ch.x
    const dy = idleTarget.y - ch.y
    const distPx = Math.hypot(dx, dy)

    // Close enough: hold position and face the target.
    if (distPx <= stopDistancePx) {
      ch.path = []
      ch.moveProgress = 0
      ch.state = CharacterState.IDLE
      ch.frame = 0
      ch.frameTimer = 0
      this.faceToward(ch, idleTarget)
      ch.wanderTimer = 60
      this.withOwnSeatUnblocked(ch, () =>
        updateCharacter(ch, dt, this.walkableTiles, this.seats, this.tileMap, this.blockedTiles, this.interactionPoints)
      )
      return
    }

    // If we are already near half-tile distance, hold and face.
    if (Math.abs(distPx - targetDistancePx) <= TILE_SIZE * 0.2) {
      ch.path = []
      ch.moveProgress = 0
      ch.state = CharacterState.IDLE
      ch.frame = 0
      ch.frameTimer = 0
      this.faceToward(ch, idleTarget)
    } else {
      // Repath to target's tile so motion keeps following; we'll stop early at half-tile distance.
      const destination = { col: idleTarget.tileCol, row: idleTarget.tileRow }
      const last = ch.path[ch.path.length - 1]
      const keepsCurrentPath = last && last.col === destination.col && last.row === destination.row
      if (!keepsCurrentPath) {
        const newPath = findPath(ch.tileCol, ch.tileRow, destination.col, destination.row, this.tileMap, this.blockedTiles)
        if (newPath.length > 0) {
          ch.path = newPath
          ch.moveProgress = 0
          ch.state = CharacterState.WALK
          ch.frame = 0
          ch.frameTimer = 0
        }
      }
    }

    // Keep timer high so cat/lobster FSM won't pick a random wander target while tracking.
    ch.wanderTimer = 60
    this.withOwnSeatUnblocked(ch, () =>
      updateCharacter(ch, dt, this.walkableTiles, this.seats, this.tileMap, this.blockedTiles, this.interactionPoints)
    )

    // Clamp after movement so it never catches the idle humanoid.
    const dxAfter = idleTarget.x - ch.x
    const dyAfter = idleTarget.y - ch.y
    const distAfterPx = Math.hypot(dxAfter, dyAfter)
    if (distAfterPx <= stopDistancePx) {
      ch.path = []
      ch.moveProgress = 0
      ch.state = CharacterState.IDLE
      ch.frame = 0
      ch.frameTimer = 0
      this.faceToward(ch, idleTarget)
    }
  }

  removeAgent(id: number): void {
    const ch = this.characters.get(id)
    if (!ch) return
    if (ch.matrixEffect === 'despawn') return // already despawning
    // Free seat and clear selection immediately
    if (ch.seatId) {
      const seat = this.seats.get(ch.seatId)
      if (seat) seat.assigned = false
    }
    if (this.selectedAgentId === id) this.selectedAgentId = null
    if (this.cameraFollowId === id) this.cameraFollowId = null
    // Start despawn animation instead of immediate delete
    ch.matrixEffect = 'despawn'
    ch.matrixEffectTimer = 0
    ch.matrixEffectSeeds = matrixEffectSeeds()
    ch.bubbleType = null
  }

  /** Find seat uid at a given tile position, or null */
  getSeatAtTile(col: number, row: number): string | null {
    for (const [uid, seat] of this.seats) {
      if (Math.round(seat.seatCol) === col && Math.round(seat.seatRow) === row) return uid
    }
    return null
  }

  /** Reassign an agent from their current seat to a new seat */
  reassignSeat(agentId: number, seatId: string): void {
    const ch = this.characters.get(agentId)
    if (!ch) return
    // Unassign old seat
    if (ch.seatId) {
      const old = this.seats.get(ch.seatId)
      if (old) old.assigned = false
    }
    // Assign new seat
    const seat = this.seats.get(seatId)
    if (!seat || seat.assigned) return
    seat.assigned = true
    ch.seatId = seatId
    // Pathfind to new seat (unblock own seat tile for this query)
    const path = this.withOwnSeatUnblocked(ch, () =>
      findPath(ch.tileCol, ch.tileRow, Math.round(seat.seatCol), Math.round(seat.seatRow), this.tileMap, this.blockedTiles)
    )
    if (path.length > 0) {
      ch.path = path
      ch.moveProgress = 0
      ch.state = CharacterState.WALK
      ch.frame = 0
      ch.frameTimer = 0
    } else {
      // Already at seat or no path — sit down
      ch.state = CharacterState.TYPE
      ch.dir = seat.facingDir
      ch.frame = 0
      ch.frameTimer = 0
      if (!ch.isActive) {
        ch.seatTimer = INACTIVE_SEAT_TIMER_MIN_SEC + Math.random() * INACTIVE_SEAT_TIMER_RANGE_SEC
      }
    }
  }

  /** Send an agent back to their currently assigned seat */
  sendToSeat(agentId: number): void {
    const ch = this.characters.get(agentId)
    if (!ch || !ch.seatId) return
    const seat = this.seats.get(ch.seatId)
    if (!seat) return
    const path = this.withOwnSeatUnblocked(ch, () =>
      findPath(ch.tileCol, ch.tileRow, Math.round(seat.seatCol), Math.round(seat.seatRow), this.tileMap, this.blockedTiles)
    )
    if (path.length > 0) {
      ch.path = path
      ch.moveProgress = 0
      ch.state = CharacterState.WALK
      ch.frame = 0
      ch.frameTimer = 0
    } else {
      // Already at seat — sit down
      ch.state = CharacterState.TYPE
      ch.dir = seat.facingDir
      ch.frame = 0
      ch.frameTimer = 0
      if (!ch.isActive) {
        ch.seatTimer = INACTIVE_SEAT_TIMER_MIN_SEC + Math.random() * INACTIVE_SEAT_TIMER_RANGE_SEC
      }
    }
  }

  /** Walk an agent to an arbitrary walkable tile (right-click command) */
  walkToTile(agentId: number, col: number, row: number): boolean {
    const ch = this.characters.get(agentId)
    if (!ch || ch.isSubagent) return false
    if (!isWalkable(col, row, this.tileMap, this.blockedTiles)) {
      // Also allow walking to own seat tile (blocked for others but not self)
      const key = this.ownSeatKey(ch)
      if (!key || key !== `${col},${row}`) return false
    }
    const path = this.withOwnSeatUnblocked(ch, () =>
      findPath(ch.tileCol, ch.tileRow, col, row, this.tileMap, this.blockedTiles)
    )
    if (path.length === 0) return false
    ch.path = path
    ch.moveProgress = 0
    ch.state = CharacterState.WALK
    ch.frame = 0
    ch.frameTimer = 0
    return true
  }

  /** Create a sub-agent character with the parent's palette. Returns the sub-agent ID. */
  addSubagent(parentAgentId: number, parentToolId: string): number {
    const key = `${parentAgentId}:${parentToolId}`
    if (this.subagentIdMap.has(key)) return this.subagentIdMap.get(key)!

    const id = this.nextSubagentId--
    const parentCh = this.characters.get(parentAgentId)
    const palette = parentCh ? parentCh.palette : 0
    const hueShift = parentCh ? parentCh.hueShift : 0

    // Find the free seat closest to the parent agent
    const parentCol = parentCh ? parentCh.tileCol : 0
    const parentRow = parentCh ? parentCh.tileRow : 0
    const dist = (c: number, r: number) =>
      Math.abs(c - parentCol) + Math.abs(r - parentRow)

    let bestSeatId: string | null = null
    let bestDist = Infinity
    for (const [uid, seat] of this.seats) {
      if (!seat.assigned) {
        const d = dist(seat.seatCol, seat.seatRow)
        if (d < bestDist) {
          bestDist = d
          bestSeatId = uid
        }
      }
    }

    let ch: Character
    if (bestSeatId) {
      const seat = this.seats.get(bestSeatId)!
      seat.assigned = true
      ch = createCharacter(id, palette, bestSeatId, seat, hueShift)
    } else {
      // No seats — spawn at closest walkable tile to parent
      let spawn = { col: 1, row: 1 }
      if (this.walkableTiles.length > 0) {
        let closest = this.walkableTiles[0]
        let closestDist = dist(closest.col, closest.row)
        for (let i = 1; i < this.walkableTiles.length; i++) {
          const d = dist(this.walkableTiles[i].col, this.walkableTiles[i].row)
          if (d < closestDist) {
            closest = this.walkableTiles[i]
            closestDist = d
          }
        }
        spawn = closest
      }
      ch = createCharacter(id, palette, null, null, hueShift)
      ch.x = spawn.col * TILE_SIZE + TILE_SIZE / 2
      ch.y = spawn.row * TILE_SIZE + TILE_SIZE / 2
      ch.tileCol = spawn.col
      ch.tileRow = spawn.row
    }
    ch.isSubagent = true
    ch.parentAgentId = parentAgentId
    ch.matrixEffect = 'spawn'
    ch.matrixEffectTimer = 0
    ch.matrixEffectSeeds = matrixEffectSeeds()
    this.characters.set(id, ch)

    this.subagentIdMap.set(key, id)
    this.subagentMeta.set(id, { parentAgentId, parentToolId })
    return id
  }

  /** Remove a specific sub-agent character and free its seat */
  removeSubagent(parentAgentId: number, parentToolId: string): void {
    const key = `${parentAgentId}:${parentToolId}`
    const id = this.subagentIdMap.get(key)
    if (id === undefined) return

    const ch = this.characters.get(id)
    if (ch) {
      if (ch.matrixEffect === 'despawn') {
        // Already despawning — just clean up maps
        this.subagentIdMap.delete(key)
        this.subagentMeta.delete(id)
        return
      }
      if (ch.seatId) {
        const seat = this.seats.get(ch.seatId)
        if (seat) seat.assigned = false
      }
      // Start despawn animation — keep character in map for rendering
      ch.matrixEffect = 'despawn'
      ch.matrixEffectTimer = 0
      ch.matrixEffectSeeds = matrixEffectSeeds()
      ch.bubbleType = null
    }
    // Clean up tracking maps immediately so keys don't collide
    this.subagentIdMap.delete(key)
    this.subagentMeta.delete(id)
    if (this.selectedAgentId === id) this.selectedAgentId = null
    if (this.cameraFollowId === id) this.cameraFollowId = null
  }

  /** Remove all sub-agents belonging to a parent agent */
  removeAllSubagents(parentAgentId: number): void {
    const toRemove: string[] = []
    for (const [key, id] of this.subagentIdMap) {
      const meta = this.subagentMeta.get(id)
      if (meta && meta.parentAgentId === parentAgentId) {
        const ch = this.characters.get(id)
        if (ch) {
          if (ch.matrixEffect === 'despawn') {
            // Already despawning — just clean up maps
            this.subagentMeta.delete(id)
            toRemove.push(key)
            continue
          }
          if (ch.seatId) {
            const seat = this.seats.get(ch.seatId)
            if (seat) seat.assigned = false
          }
          // Start despawn animation
          ch.matrixEffect = 'despawn'
          ch.matrixEffectTimer = 0
          ch.matrixEffectSeeds = matrixEffectSeeds()
          ch.bubbleType = null
        }
        this.subagentMeta.delete(id)
        if (this.selectedAgentId === id) this.selectedAgentId = null
        if (this.cameraFollowId === id) this.cameraFollowId = null
        toRemove.push(key)
      }
    }
    for (const key of toRemove) {
      this.subagentIdMap.delete(key)
    }
  }

  /** Look up the sub-agent character ID for a given parent+toolId, or null */
  getSubagentId(parentAgentId: number, parentToolId: string): number | null {
    return this.subagentIdMap.get(`${parentAgentId}:${parentToolId}`) ?? null
  }

  setAgentActive(id: number, active: boolean): void {
    const ch = this.characters.get(id)
    if (ch) {
      ch.isActive = active
      if (!active) {
        // Sentinel -1: signals turn just ended, skip next seat rest timer.
        // Prevents the WALK handler from setting a 2-4 min rest on arrival.
        ch.seatTimer = -1
        ch.path = []
        ch.moveProgress = 0
      }
      this.rebuildFurnitureInstances()
    }
  }

  /** Rebuild furniture instances with auto-state applied (active agents turn electronics ON) */
  private rebuildFurnitureInstances(): void {
    // Collect tiles where active agents face desks
    const autoOnTiles = new Set<string>()
    for (const ch of this.characters.values()) {
      if (!ch.isActive || !ch.seatId) continue
      const seat = this.seats.get(ch.seatId)
      if (!seat) continue
      // Find the desk tile(s) the agent faces from their seat
      const dCol = seat.facingDir === Direction.RIGHT ? 1 : seat.facingDir === Direction.LEFT ? -1 : 0
      const dRow = seat.facingDir === Direction.DOWN ? 1 : seat.facingDir === Direction.UP ? -1 : 0
      // Check tiles in the facing direction (desk could be 1-3 tiles deep)
      for (let d = 1; d <= AUTO_ON_FACING_DEPTH; d++) {
        const tileCol = seat.seatCol + dCol * d
        const tileRow = seat.seatRow + dRow * d
        autoOnTiles.add(`${tileCol},${tileRow}`)
      }
      // Also check tiles to the sides of the facing direction (desks can be wide)
      for (let d = 1; d <= AUTO_ON_SIDE_DEPTH; d++) {
        const baseCol = seat.seatCol + dCol * d
        const baseRow = seat.seatRow + dRow * d
        if (dCol !== 0) {
          // Facing left/right: check tiles above and below
          autoOnTiles.add(`${baseCol},${baseRow - 1}`)
          autoOnTiles.add(`${baseCol},${baseRow + 1}`)
        } else {
          // Facing up/down: check tiles left and right
          autoOnTiles.add(`${baseCol - 1},${baseRow}`)
          autoOnTiles.add(`${baseCol + 1},${baseRow}`)
        }
      }
    }

    if (autoOnTiles.size === 0) {
      this.furniture = layoutToFurnitureInstances(this.layout.furniture)
      return
    }

    // Build modified furniture list with auto-state applied
    const modifiedFurniture: PlacedFurniture[] = this.layout.furniture.map((item) => {
      const entry = getCatalogEntry(item.type)
      if (!entry) return item
      // Check if any tile of this furniture overlaps an auto-on tile
      for (let dr = 0; dr < entry.footprintH; dr++) {
        for (let dc = 0; dc < entry.footprintW; dc++) {
          if (autoOnTiles.has(`${item.col + dc},${item.row + dr}`)) {
            const onType = getOnStateType(item.type)
            if (onType !== item.type) {
              return { ...item, type: onType }
            }
            return item
          }
        }
      }
      return item
    })

    this.furniture = layoutToFurnitureInstances(modifiedFurniture)
  }

  setAgentTool(id: number, tool: string | null): void {
    const ch = this.characters.get(id)
    if (ch) {
      ch.currentTool = tool
    }
  }

  showPermissionBubble(id: number): void {
    const ch = this.characters.get(id)
    if (ch) {
      ch.bubbleType = 'permission'
      ch.bubbleTimer = 0
    }
  }

  clearPermissionBubble(id: number): void {
    const ch = this.characters.get(id)
    if (ch && ch.bubbleType === 'permission') {
      ch.bubbleType = null
      ch.bubbleTimer = 0
    }
  }

  showWaitingBubble(id: number): void {
    const ch = this.characters.get(id)
    if (ch) {
      ch.bubbleType = 'waiting'
      ch.bubbleTimer = WAITING_BUBBLE_DURATION_SEC
    }
  }

  /** Dismiss bubble on click — permission: instant, waiting: quick fade */
  dismissBubble(id: number): void {
    const ch = this.characters.get(id)
    if (!ch || !ch.bubbleType) return
    if (ch.bubbleType === 'permission') {
      ch.bubbleType = null
      ch.bubbleTimer = 0
    } else if (ch.bubbleType === 'waiting') {
      // Trigger immediate fade (0.3s remaining)
      ch.bubbleTimer = Math.min(ch.bubbleTimer, DISMISS_BUBBLE_FAST_FADE_SEC)
    }
  }

  update(dt: number): void {
    const toDelete: number[] = []
    const firstIdleHumanoid = this.getFirstIdleHumanoid()
    for (const ch of this.characters.values()) {
      // Handle matrix effect animation
      if (ch.matrixEffect) {
        ch.matrixEffectTimer += dt
        if (ch.matrixEffectTimer >= MATRIX_EFFECT_DURATION) {
          if (ch.matrixEffect === 'spawn') {
            // Spawn complete — clear effect, resume normal FSM
            ch.matrixEffect = null
            ch.matrixEffectTimer = 0
            ch.matrixEffectSeeds = []
          } else {
            // Despawn complete — mark for deletion
            toDelete.push(ch.id)
          }
        }
        continue // skip normal FSM while effect is active
      }

      if (ch.id === OfficeState.HUNTER_LOBSTER_ID) {
        this.updateHunterLobster(ch, dt, firstIdleHumanoid)
        continue
      }

      // Temporarily unblock own seat so character can pathfind to it
      this.withOwnSeatUnblocked(ch, () =>
        updateCharacter(ch, dt, this.walkableTiles, this.seats, this.tileMap, this.blockedTiles, this.interactionPoints)
      )

      if (ch.isLobster) {
        if (ch.lobsterRageTimer > 0) {
          ch.lobsterRageTimer = Math.max(0, ch.lobsterRageTimer - dt)
          if (Math.random() < dt * LOBSTER_BUBBLE_SPAWN_RATE) {
            this.spawnLobsterBubble(ch)
          }
        }
        for (const b of ch.lobsterBubbles) b.age += dt
        ch.lobsterBubbles = ch.lobsterBubbles.filter(b => b.age < LOBSTER_BUBBLE_LIFETIME_SEC)
      }

      // Tick bubble timer for waiting bubbles
      if (ch.bubbleType === 'waiting') {
        ch.bubbleTimer -= dt
        if (ch.bubbleTimer <= 0) {
          ch.bubbleType = null
          ch.bubbleTimer = 0
        }
      }

      // Photo comment particles for characters viewing the photograph
      if (ch.isViewingPhoto && ch.state === CharacterState.IDLE && !ch.isCat && !ch.isLobster) {
        for (const pc of ch.photoComments) pc.age += dt
        ch.photoComments = ch.photoComments.filter(pc => pc.age < PHOTO_COMMENT_LIFETIME)
        if (ch.photoComments.length < 2 && Math.random() < dt * PHOTO_COMMENT_SPAWN_RATE) {
          ch.photoComments.push({
            text: PHOTO_COMMENTS[Math.floor(Math.random() * PHOTO_COMMENTS.length)],
            age: 0,
            x: (Math.random() - 0.5) * 16,
          })
        }
        // Spawn first one immediately
        if (ch.photoComments.length === 0) {
          ch.photoComments.push({
            text: PHOTO_COMMENTS[Math.floor(Math.random() * PHOTO_COMMENTS.length)],
            age: 0,
            x: (Math.random() - 0.5) * 16,
          })
        }
      } else {
        ch.isViewingPhoto = false
        ch.photoComments = []
      }

      // Code snippet particles for working characters
      if (ch.isActive && ch.state === CharacterState.TYPE && !ch.isCat && !ch.isLobster) {
        // Age existing snippets and remove expired ones
        for (const s of ch.codeSnippets) s.age += dt
        ch.codeSnippets = ch.codeSnippets.filter(s => s.age < CODE_SNIPPET_LIFETIME)
        // Spawn new snippet randomly
        if (ch.codeSnippets.length < 2 && Math.random() < dt * CODE_SNIPPET_SPAWN_RATE) {
          ch.codeSnippets.push({
            text: CODE_SNIPPETS[Math.floor(Math.random() * CODE_SNIPPETS.length)],
            age: 0,
            x: (Math.random() - 0.5) * 20,
            y: 0,
          })
        }
      } else {
        ch.codeSnippets = []
      }
    }
    // Remove characters that finished despawn
    for (const id of toDelete) {
      this.characters.delete(id)
    }
  }

  getCharacters(): Character[] {
    return Array.from(this.characters.values())
  }

  /** Get character at pixel position (for hit testing). Returns id or null. */
  getCharacterAt(worldX: number, worldY: number): number | null {
    const chars = this.getCharacters().sort((a, b) => b.y - a.y)
    for (const ch of chars) {
      // Skip characters that are despawning or pets
      if (ch.matrixEffect === 'despawn') continue
      if (ch.isCat || ch.isLobster) continue
      // Character sprite is 16x24, anchored bottom-center
      // Apply sitting offset to match visual position
      const sittingOffset = ch.state === CharacterState.TYPE ? CHARACTER_SITTING_OFFSET_PX : 0
      const anchorY = ch.y + sittingOffset
      const left = ch.x - CHARACTER_HIT_HALF_WIDTH
      const right = ch.x + CHARACTER_HIT_HALF_WIDTH
      const top = anchorY - CHARACTER_HIT_HEIGHT
      const bottom = anchorY
      if (worldX >= left && worldX <= right && worldY >= top && worldY <= bottom) {
        return ch.id
      }
    }
    return null
  }
}
