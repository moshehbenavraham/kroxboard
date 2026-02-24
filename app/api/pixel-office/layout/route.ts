import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import os from 'os'

const LAYOUT_DIR = path.join(os.homedir(), '.openclaw', 'pixel-office')
const LAYOUT_FILE = path.join(LAYOUT_DIR, 'layout.json')

export async function GET() {
  try {
    if (!fs.existsSync(LAYOUT_FILE)) {
      return NextResponse.json({ layout: null })
    }
    const data = fs.readFileSync(LAYOUT_FILE, 'utf-8')
    const layout = JSON.parse(data)
    return NextResponse.json({ layout })
  } catch {
    return NextResponse.json({ layout: null })
  }
}

export async function POST(request: Request) {
  try {
    const { layout } = await request.json()
    if (!layout || layout.version !== 1 || !Array.isArray(layout.tiles)) {
      return NextResponse.json({ error: 'Invalid layout' }, { status: 400 })
    }

    // Ensure directory exists
    if (!fs.existsSync(LAYOUT_DIR)) {
      fs.mkdirSync(LAYOUT_DIR, { recursive: true })
    }

    // Atomic write: write to .tmp then rename
    const tmpFile = LAYOUT_FILE + '.tmp'
    fs.writeFileSync(tmpFile, JSON.stringify(layout, null, 2), 'utf-8')
    fs.renameSync(tmpFile, LAYOUT_FILE)

    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
