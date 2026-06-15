import { NextResponse } from 'next/server'

/**
 * POST /api/summary
 * Generates an AI-powered essence summary for a captured idea.
 * Runs server-side to keep the Anthropic API key off the client.
 * 
 * Expects: { dump, trigger, problem, magic, energy }
 * Returns: { summary }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { dump, trigger, problem, magic, energy } = body

    const prompt = `You are helping someone capture and preserve the magic of an idea they just had. Based on the following raw capture, write a single evocative 2-3 sentence summary that would help them re-feel the excitement of this idea when they come back to it later. Be specific to their words, not generic. Don't use corporate language. Sound like a thoughtful friend who gets it.

Idea dump: ${dump}
What sparked it: ${trigger || 'not provided'}
Problem it solves: ${problem || 'not provided'}
The exciting angle: ${magic || 'not provided'}
The feeling: ${energy || 'not provided'}

Write only the summary, no preamble.`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    const data = await response.json()
    const summary = data.content?.find((b: { type: string }) => b.type === 'text')?.text?.trim() || ''

    return NextResponse.json({ summary })
  } catch (error) {
    return NextResponse.json({ summary: '' }, { status: 500 })
  }
}