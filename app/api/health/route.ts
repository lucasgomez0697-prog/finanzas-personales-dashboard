import { NextResponse } from "next/server";

function env(name: string, translated?: string) {
  return process.env[name] || (translated ? process.env[translated] : undefined);
}

export async function GET() {
  const url = env("SUPABASE_DASHBOARD_URL", "URL_DEL_PANEL_DE_CONTROL_DE_SUPARASE");
  const key = env("DASHBOARD_API_KEY", "CLAVE_API_DEL_PANEL_DE_CONTACTO");
  const user = env("DASHBOARD_USER", "PANEL_DE_CONTROL_USUARIO");
  const password = env("DASHBOARD_PASSWORD", "CONTRASEÑA_DEL_PANEL_DE_CONTRASEÑANZA");

  const envOk = Boolean(url && key && user && password);
  if (!envOk) {
    return NextResponse.json({ ok: false, stage: "environment", message: "Faltan variables de entorno" }, { status: 503 });
  }

  try {
    const res = await fetch(url!, {
      headers: { "x-dashboard-key": key! },
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json({ ok: false, stage: "supabase", status: res.status }, { status: 502 });
    }
    const data = await res.json();
    return NextResponse.json({
      ok: true,
      stage: "ready",
      cards: Array.isArray(data.cards) ? data.cards.length : 0,
      generated_at: data.generated_at || null,
    });
  } catch {
    return NextResponse.json({ ok: false, stage: "supabase", message: "No se pudo conectar" }, { status: 502 });
  }
}
