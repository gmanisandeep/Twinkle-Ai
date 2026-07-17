export default async () => {
  const endpoint = String(process.env.BACKGROUND_WORKER_URL || '').trim();
  const token = String(process.env.BACKGROUND_WORKER_TOKEN || '').trim();
  if (!endpoint || !token) {
    return new Response(JSON.stringify({ status: 'disabled', reason: 'Persistent background worker is not configured.' }), {
      status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }
  let url;
  try { url = new URL(endpoint); } catch { return new Response('Invalid worker URL.', { status: 500 }); }
  if (url.protocol !== 'https:') return new Response('Worker URL must use HTTPS.', { status: 500 });
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ event: 'twinkle.schedule.tick', at: new Date().toISOString() }),
    signal: AbortSignal.timeout(30_000),
  });
  return new Response(JSON.stringify({ status: response.ok ? 'dispatched' : 'failed', workerStatus: response.status }), {
    status: response.ok ? 200 : 502, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
};

export const config = { schedule: '*/15 * * * *' };
