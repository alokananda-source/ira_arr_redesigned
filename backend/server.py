"""
Reverse proxy: forwards all /api/* requests to the Next.js app running on port 3000.

The ARR dashboard is a self-contained Next.js app (App Router) whose API routes live at
/api/auth and /api/data and are served by Next.js on port 3000. In this environment the
ingress routes /api/* to port 8001, so this thin FastAPI proxy transparently forwards those
requests to Next.js and streams the response (including Set-Cookie) back unchanged.
"""

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import Response

NEXT_ORIGIN = "http://localhost:3000"

# Hop-by-hop headers that must not be forwarded verbatim.
_EXCLUDED_RESPONSE_HEADERS = {
    "content-encoding",
    "transfer-encoding",
    "content-length",
    "connection",
    "keep-alive",
}

app = FastAPI()

client = httpx.AsyncClient(base_url=NEXT_ORIGIN, timeout=60.0, follow_redirects=False)


@app.api_route(
    "/api/{path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
)
async def proxy(path: str, request: Request):
    url = httpx.URL(path=f"/api/{path}", query=request.url.query.encode("utf-8"))

    headers = dict(request.headers)
    headers.pop("host", None)

    body = await request.body()

    upstream = await client.request(
        method=request.method,
        url=url,
        headers=headers,
        content=body,
    )

    response = Response(content=upstream.content, status_code=upstream.status_code)
    response.raw_headers = [
        (key.encode("latin-1"), value.encode("latin-1"))
        for key, value in upstream.headers.multi_items()
        if key.lower() not in _EXCLUDED_RESPONSE_HEADERS
    ]
    response.raw_headers.append((b"content-length", str(len(upstream.content)).encode()))
    return response


@app.on_event("shutdown")
async def _shutdown():
    await client.aclose()
