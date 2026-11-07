// Render uses this endpoint to check that both the frontend and MongoDB-backed API are ready.
// It does not expose credentials or customer data.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const base = process.env.API_PROXY_TARGET || 'http://127.0.0.1:4000';
  let ok = false;
  try {
    const response = await fetch(`${base}/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    });
    if (response.ok) {
      const data: { ok?: boolean; database?: string } = await response.json();
      ok = data.ok === true && data.database === 'connected';
    }
  } catch {
    ok = false;
  }
  return Response.json(
    { ok },
    { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
