import { NextResponse } from 'next/server';
import { checkDatabaseHealth } from '../../../src/database/health';

export async function GET() {
	const health = await checkDatabaseHealth();
	return NextResponse.json({ ok: health.connected, responseTime: health.responseTime, error: health.error ?? null });
}


