const METHODS = 'GET, HEAD, OPTIONS';
const EXPOSED = 'Content-Length, Content-Range, Accept-Ranges, ETag';

export function corsHeaders(request: Request, allowedOrigins: string): Headers {
  const headers = new Headers({
    'Access-Control-Allow-Methods': METHODS,
    'Access-Control-Allow-Headers': 'Range',
    'Access-Control-Expose-Headers': EXPOSED,
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  });
  const origin = request.headers.get('Origin');
  const allowed = new Set(allowedOrigins.split(',').map((value) => value.trim()).filter(Boolean));
  if (origin !== null && allowed.has(origin)) headers.set('Access-Control-Allow-Origin', origin);
  return headers;
}

export function withCors(response: Response, request: Request, allowedOrigins: string): Response {
  const headers = new Headers(response.headers);
  corsHeaders(request, allowedOrigins).forEach((value, key) => headers.set(key, value));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
