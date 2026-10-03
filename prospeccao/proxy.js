import { authorizedBridge } from "./lib/bridge-auth.js";
import { NextResponse } from "next/server";
import { ACCESS_COOKIE, accessCode, expectedAccessToken } from "./lib/access.js";

export async function proxy(request) {
  const { pathname } = request.nextUrl;
  const isOpenPath = pathname === "/acesso" || pathname === "/api/access" || pathname === "/api/health";

  if (isOpenPath) return NextResponse.next();

  if (/^\/api\/(claims|queue|connections)(?:\/|$)/.test(pathname)) {
    if (await authorizedBridge(request)) return NextResponse.next();
    if (!(pathname === "/api/claims" && process.env.PROSPECCAO_BRIDGE_REQUIRED === "false")) {
      return NextResponse.json({ error: "Acesso autorizado somente pelo painel de afiliados." }, { status: 401 });
    }
  }
  const configured = accessCode();
  if (!configured) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Proteção de acesso não configurada." }, { status: 503 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/acesso";
    url.search = "";
    return NextResponse.redirect(url);
  }

  const token = request.cookies.get(ACCESS_COOKIE)?.value || "";
  const expected = await expectedAccessToken();
  if (token && token === expected) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  }

  const url = request.nextUrl.clone();
  url.pathname = "/acesso";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

