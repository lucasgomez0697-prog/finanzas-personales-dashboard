import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/api/health") return NextResponse.next();

  const user = process.env.DASHBOARD_USER || process.env.PANEL_DE_CONTROL_USUARIO;
  const password = process.env.DASHBOARD_PASSWORD || process.env["CONTRASEÑA_DEL_PANEL_DE_CONTRASEÑANZA"];

  if (!user || !password) {
    return new NextResponse("Dashboard no configurado", { status: 503 });
  }

  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Basic ")) {
    const decoded = atob(auth.slice(6));
    const split = decoded.indexOf(":");
    const givenUser = decoded.slice(0, split);
    const givenPassword = decoded.slice(split + 1);
    if (givenUser === user && givenPassword === password) return NextResponse.next();
  }

  return new NextResponse("Acceso privado", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Finanzas Personales"' },
  });
}

export const config = { matcher: "/:path*" };
