function corsHeaders(request: Request, allowedMethods: string): Headers {
  const headers = new Headers()
  const origin = request.headers.get("origin")
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Codex-Companion-Token")
  headers.set("Access-Control-Allow-Methods", allowedMethods)
  headers.set("Access-Control-Max-Age", "86400")
  headers.set("Vary", "Origin")

  if (origin && origin !== "null") {
    headers.set("Access-Control-Allow-Origin", origin)
  } else {
    headers.set("Access-Control-Allow-Origin", "*")
  }

  return headers
}

export function companionOptionsResponse(request: Request, allowedMethods: string): Response {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, allowedMethods)
  })
}

export function companionJsonResponse(
  request: Request,
  body: unknown,
  init?: ResponseInit,
  allowedMethods = "GET, POST, OPTIONS"
): Response {
  const headers = corsHeaders(request, allowedMethods)
  headers.set("Content-Type", "application/json; charset=utf-8")

  if (init?.headers) {
    const extraHeaders = new Headers(init.headers)
    extraHeaders.forEach((value, key) => headers.set(key, value))
  }

  return new Response(JSON.stringify(body), {
    ...init,
    headers
  })
}
