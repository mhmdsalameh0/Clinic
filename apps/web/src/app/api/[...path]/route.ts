const hopByHopHeaders = new Set([
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade"
]);

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

function apiTargetUrl(path: string[], request: Request) {
  const configuredTarget = process.env.API_PROXY_ORIGIN ?? process.env.API_BACKEND_URL ?? process.env.NEXT_PUBLIC_API_URL;
  if (!configuredTarget || configuredTarget.startsWith("/")) {
    throw new Error("API proxy target is not configured");
  }

  const target = configuredTarget.replace(/\/+$/, "");
  const incomingPath = `/${path.join("/")}`;
  const pathname = target.endsWith("/api/v1") && incomingPath.startsWith("/api/v1")
    ? `${target}${incomingPath.slice("/api/v1".length)}`
    : target.endsWith("/api") && incomingPath.startsWith("/api/v1")
      ? `${target}${incomingPath.slice("/api".length)}`
      : `${target}${incomingPath}`;

  return `${pathname}${new URL(request.url).search}`;
}

async function proxy(request: Request, context: RouteContext) {
  const { path } = await context.params;
  const headers = new Headers(request.headers);
  for (const header of hopByHopHeaders) {
    headers.delete(header);
  }

  const method = request.method.toUpperCase();
  const response = await fetch(apiTargetUrl(path, request), {
    method,
    headers,
    body: method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer(),
    cache: "no-store",
    redirect: "manual"
  });

  const responseHeaders = new Headers(response.headers);
  responseHeaders.delete("content-encoding");
  responseHeaders.delete("content-length");
  responseHeaders.set("Cache-Control", "private, no-store, max-age=0");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders
  });
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
