import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase/admin'

/**
 * GET /api/ideas/read
 * Read-only public endpoint for Claude to fetch ideas without browser auth.
 * Protected by x-api-secret header — no Supabase session required.
 * Write operations (POST, PATCH, DELETE) remain on the authenticated /api/ideas route.
 */
export async function GET(request: Request) {
  // Verify API secret — same mechanism as the original API layer
  const secret = request.headers.get('x-api-secret')
  if (secret !== process.env.API_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('ideas')
    .select('*')
    .order('timestamp', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}