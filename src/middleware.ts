/**
 * Auth Middleware
 * Runs on every request matching the config below before the page renders.
 *
 * Responsibilities:
 * - Refreshes the Supabase auth session cookie on each request (keeps session alive)
 * - Redirects unauthenticated users to /login for any protected route
 *
 * Protected routes: everything except static assets, images, favicon, and /login itself.
 */

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // Start with a default "continue" response
  let supabaseResponse = NextResponse.next({ request })

  // Create a Supabase client scoped to this request/response cycle
  // Uses anon key — session is determined by the cookie, not the key
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        // Read cookies from the incoming request
        getAll() {
          return request.cookies.getAll()
        },
        // Write updated session cookies back to both request and response
        // This is what keeps the session refreshed automatically
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Verify the user's session — getUser() validates the token server-side
  // Never use getSession() here — it doesn't verify the JWT and can be spoofed
  const { data: { user } } = await supabase.auth.getUser()

  // If no valid session, redirect to login
  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Session is valid — continue to the requested page
  return supabaseResponse
}

// Apply middleware to all routes except static assets, images, favicon, and /login
// This regex pattern is the current Next.js recommended approach
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|login).*)',
  ],
}