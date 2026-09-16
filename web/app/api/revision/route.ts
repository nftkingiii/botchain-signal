import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export function GET() { return NextResponse.json({ service: 'signal', revision: process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT_SHA ?? 'local' }, { headers: { 'Cache-Control': 'no-store' } }) }
