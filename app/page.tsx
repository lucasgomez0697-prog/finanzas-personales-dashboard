import AutoRefresh from "./auto-refresh";
import ProjectionCharts, { getProjectionSummary } from "./projection-charts";

type DashboardData = any;

const pyg = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const money = (value?: number | null) => value == null ? "Por confirmar" : `Gs. ${pyg.format(Number(value || 0))}`;
const number = (value?: number | null) => pyg.format(Number(value || 0));
const pct = (value?: number | null) => `${oneDecimal.format(Number(value || 0))}%`;

function dateLabel(value?: string | null) {
  if (!value) return "Por confirmar";
  return new Date(`${value}T12:00:00Z`).toLocaleDateString("es-PY", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

function shortDate(value?: string | null) {
  if (!value) return "—";
  return new Date(`${value}T12:00:00Z`).toLocaleDateString("es-PY", { day: "2-digit", month: "short", timeZone: "UTC" });
}

function env(name: string, translated?: string) {
  return process.env[name] || (translated ? process.env[translated] : undefined);
}

async function getDashboard(): Promise<DashboardData | null> {
  const url = env("SUPABASE_DASHBOARD_URL", "URL_DEL_PANEL_DE_CONTROL_DE_SUPARASE");
  const key = env("DASHBOARD_API_KEY", "CLAVE_API_DEL_PANEL_DE_CONTACTO");
  if (!url || !key) return null;

  try {
    const res = await fetch(url, {
      headers: { "x-dashboard-key": key },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as DashboardData;
  } catch {
    return null;
  }
}

const categoryNames: Record<string, string> = {
  club_social: "CIT",
  pagare_cit: "Pagaré CIT",
  combustible: "Combustible",
  restaurantes_salidas: "Restaurantes / salidas",
  salidas_comidas: "Restaurantes / salidas",
  supermercado: "Supermercado",
  supermercado_personales_otros: "Supermercado + personales + otros",
  compras_personales: "Compras personales",
  suscripciones: "Suscripciones",
  gimnasio: "Gimnasio",
  ocio: "Ocio",
  ahorro_mensual: "Ahorro mensual",
  deuda_tarjeta: "Pago de tarjeta",
  tarjetas: "Tarjetas",
  CIT: "CIT",
};

function categoryLabel(value?: string) {
  return categoryNames[value || ""] || String(value || "Otros").replaceAll("_", " ");
}

function Metric({ label, value, note, tone = "default" }: { label: string; value: string; note?: string; tone?: "default" | "good" | "warn" | "danger" }) {
  return (
    <article className={`metric-card metric-${tone}`}>
      <span className="eyebrow">{label}</span>
      <strong>{value}</strong>
      {note ? <small>{note}</small> : null}
    </article>
  );
}

function StatusBadge({ status }: { status?: string }) {
  const labels: Record<string, string> = {
    paid: "✓ Pagado",
    upcoming: "● Vence pronto",
    pending: "Pendiente",
    overdue: "! Vencido",
    not_tracked: "Próximo ciclo",
    no_due_date: "Sin fecha",
    no_debt: "✓ Sin deuda",
    missing_due_date: "Falta vencimiento",
    pending_statement: "Esperando extracto",
  };
  return <span className={`badge badge-${status || "neutral"}`}>{labels[status || ""] || status || "—"}</span>;
}

function SectionHead({ eyebrow, title, aside }: { eyebrow: string; title: string; aside?: React.ReactNode }) {
  return (
    <div className="panel-head">
      <div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div>
      {aside}
    </div>
  );
}

export default async function Home() {
  const data = await getDashboard();

  if (!data) {
    return (
      <main className="shell">
        <AutoRefresh />
        <section className="empty-state">
          <span className="eyebrow">Finanzas Personales</span>
          <h1>No pudimos leer los datos financieros</h1>
          <p>El dashboard sigue privado. Se volverá a intentar automáticamente cada 60 segundos.</p>
        </section>
      </main>
    );
  }

  const s = data.snapshot || {};
  const d = data.derived || {};
  const cash = data.cash_flow || {};
  const projection = getProjectionSummary(data);
  const categories = Object.entries(data.monthly_by_category || {}).sort((a: any, b: any) => Number(b[1]) - Number(a[1]));
  const maxCategory = Math.max(...categories.map(([, v]: any) => Number(v)), 1);
  const emergency = (data.goals || []).find((g: any) => String(g.name || "").toLowerCase().includes("emergencia"));
  const emergencyPct = emergency?.target_amount ? Math.min(100, (Number(emergency.current_amount || 0) / Number(emergency.target_amount)) * 100) : 0;
  const business = data.business?.[0];
  const paid = Number(data.obligation_summary?.paid_count || 0);
  const tracked = Number(data.obligation_summary?.tracked_count || 0);
  const nextIncome = cash.next_income;
  const cashTone = Number(cash.cushion_gap_pyg || 0) < 0 ? "warn" : "good";
  const monthProgress = Number(d.month_progress_pct || 0);

  return (
    <main className="shell">
      <AutoRefresh />

      <header className="hero">
        <div>
          <span className="eyebrow">Finanzas Personales</span>
          <h1>Tu situación financiera, en una sola vista.</h1>
          <p>Supabase es la fuente oficial. Estado operativo al {dateLabel(data.local_date)} · actualizado {new Date(data.generated_at).toLocaleString("es-PY")}</p>
        </div>
        <div className="status-pill">● Datos en vivo</div>
      </header>

      <section className="metrics-grid metrics-grid-4">
        <Metric label="Liquidez actual" value={money(data.liquidity?.liquid_pyg || s.current_liquidity_pyg)} note="Efectivo disponible hoy" />
        <Metric label="Caja proyectada al próximo cobro" value={money(cash.projected_after_fixed_pyg)} note={`${money(cash.fixed_due_before_next_income_pyg)} de fijos antes del ${shortDate(nextIncome?.next_date)}`} tone={cashTone} />
        <Metric label="Próximo cobro" value={money(nextIncome?.amount)} note={`${nextIncome?.name || "Ingreso"} · ${dateLabel(nextIncome?.next_date)}`} />
        <Metric label="Dinero libre estimado / mes" value={money(projection.nextMonthFree)} note="Próximo mes · luego de fijos, reserva variable y plan de saneamiento" />
        <Metric label="Deuda total tarjetas" value={money(d.total_card_balance_pyg)} note="Itaú + Sudameris + Ueno + Continental" />
        <Metric label="Deuda con interés estimada" value={`~${money(d.interest_bearing_debt_estimate_pyg)}`} note="Estimación actual; intereses de liquidación pueden variar" tone={Number(d.interest_bearing_debt_estimate_pyg || 0) > 0 ? "danger" : "good"} />
        <Metric label="Pagarés CIT pendientes" value={money(d.cit_pagare_remaining_pyg)} note={`${number(data.cit_pagare?.remaining_payments)} pagarés × ${money(data.cit_pagare?.unit_amount_pyg)}`} />
        <Metric label="Deuda comprometida total" value={money(d.total_committed_debt_pyg)} note="Tarjetas + pagarés CIT pendientes" />
        <Metric label="Saldo excl. cuotas futuras 0%" value={money(d.balance_excluding_zero_interest_future_pyg)} note="No significa necesariamente deuda con interés" />
        <Metric label="Cuotas futuras 0%" value={money(d.zero_interest_future_installments_pyg)} note="Principalmente notebook Itaú" />
        <Metric label="Ahorro del mes" value={money(d.savings_month_pyg)} note={`Tasa de ahorro ${pct(d.savings_rate_pct)}`} />
        <Metric label="Compromisos fijos / ingreso" value={pct(d.recurring_commitment_ratio_pct)} note={`${money(s.recurring_gross_pyg)} sobre ${money(s.monthly_cash_income_pyg)}`} />
      </section>

      <ProjectionCharts data={data} />

      <section className="two-col">
        <article className="panel">
          <SectionHead eyebrow="Estado del mes" title="Obligaciones y banderas" aside={<div className="status-pill compact">{paid}/{tracked} pagadas</div>} />
          <div className="month-line"><span style={{ width: `${Math.min(monthProgress, 100)}%` }} /></div>
          <div className="stack compact-stack">
            {(data.obligations || []).map((item: any) => (
              <div className="obligation-row" key={item.id || item.name}>
                <div className="obligation-main">
                  <b>{item.name}</b>
                  <small>{item.due_date ? `Objetivo: ${dateLabel(item.due_date)}` : "Fecha todavía no definida"}{item.paid_date ? ` · confirmado ${shortDate(item.paid_date)}` : ""}</small>
                </div>
                <div className="obligation-side"><strong>{money(item.amount_pyg)}</strong><StatusBadge status={item.payment_status} /></div>
              </div>
            ))}
          </div>
          <p className="panel-note">El control hacia adelante comenzó el {dateLabel(data.obligation_summary?.tracking_start_date)}. Lo anterior no genera alertas retroactivas.</p>
        </article>

        <article className="panel">
          <SectionHead eyebrow="Próximos 30 días" title="Calendario de pagos" aside={<span className="mini-total">Conocido: {money(data.payments_30_days_known_pyg)}</span>} />
          <div className="timeline-list">
            {(data.upcoming_30_days || []).map((item: any, index: number) => (
              <div className="timeline-item" key={`${item.kind}-${item.name}-${item.due_date}-${index}`}>
                <div className="date-chip">{shortDate(item.due_date)}</div>
                <div className="timeline-copy"><b>{item.name}</b><small>{categoryLabel(item.category)}{item.note ? ` · ${item.note}` : ""}</small></div>
                <strong>{item.amount_pyg == null ? "Por confirmar" : money(item.amount_pyg)}</strong>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="two-col">
        <article className="panel">
          <SectionHead eyebrow="Tarjetas" title="Cuándo pagar para no financiar" />
          <div className="stack compact-stack">
            {(data.card_payment_schedule || []).map((card: any) => (
              <div className="payment-card" key={card.bank}>
                <div className="row-top">
                  <div><b>{card.bank}</b><small>{card.card_name || "Tarjeta"}{card.last4 ? ` · •••• ${card.last4}` : ""}</small></div>
                  <StatusBadge status={card.payment_status} />
                </div>
                <div className="payment-grid">
                  <div><span>Cierre</span><strong>{shortDate(card.close_date)}</strong></div>
                  <div><span>Vencimiento</span><strong>{shortDate(card.due_date)}</strong></div>
                  <div><span>Saldo actual</span><strong>{money(card.balance_pyg)}</strong></div>
                  <div><span>A pagar sin financiar</span><strong>{money(card.amount_to_avoid_interest_pyg)}</strong></div>
                </div>
                {card.has_interest_bearing_estimate ? <div className="warning-strip">Prioridad: saldo financiado estimado {money(card.interest_bearing_estimate_pyg)} + intereses pendientes.</div> : null}
                {card.payment_status === "pending_statement" ? <small className="muted-block">El monto exacto se carga cuando esté disponible el extracto. No usamos la deuda total como monto de pago.</small> : null}
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <SectionHead eyebrow="Tarjetas" title="Saldos y utilización" />
          <div className="stack">
            {(data.cards || []).map((card: any) => {
              const limit = Number(card.credit_limit || 0);
              const usedPct = limit ? Math.min(100, (Number(card.current_balance || 0) / limit) * 100) : 0;
              return (
                <div className="card-row" key={card.bank}>
                  <div className="row-top"><div><b>{card.bank}</b><small>{card.card_name || "Tarjeta"}{card.last4 ? ` · •••• ${card.last4}` : ""}</small></div><strong>{money(card.current_balance)}</strong></div>
                  <div className="progress"><span style={{ width: `${usedPct}%` }} /></div>
                  <div className="row-meta"><span>Disponible {money(card.available_credit)}</span><span>{usedPct.toFixed(0)}% utilizado</span></div>
                </div>
              );
            })}
          </div>
        </article>
      </section>

      <section className="panel cit-panel">
        <SectionHead eyebrow="CIT" title="Pagarés y reintegros" aside={<span className="status-pill compact">Separado de cuota social</span>} />
        <div className="insight-grid">
          <div className="insight-box"><span>Pagarés restantes</span><strong>{number(data.cit_pagare?.remaining_payments)}</strong><small>Próximo objetivo: {dateLabel(data.cit_pagare?.next_due_date)}</small></div>
          <div className="insight-box"><span>Deuda bruta pendiente</span><strong>{money(data.cit_pagare?.gross_remaining_pyg)}</strong><small>Sin descontar promociones futuras</small></div>
          <div className="insight-box"><span>Reintegro esperado por pagaré</span><strong>{money(data.cit_pagare?.expected_rebate_per_payment_pyg)}</strong><small>Solo cuenta cuando se acredita</small></div>
          <div className="insight-box"><span>Reintegros pendientes</span><strong>{money(data.rebate_summary?.expected_pyg)}</strong><small>{number(data.rebate_summary?.pending_count)} pendiente(s)</small></div>
          <div className="insight-box"><span>Reintegros recibidos</span><strong>{money(data.rebate_summary?.received_pyg)}</strong><small>Antes de decidir destino</small></div>
          <div className="insight-box"><span>Escenario neto si continúa 20%</span><strong>{money(data.cit_pagare?.net_if_promo_continues_pyg)}</strong><small>Escenario, no deuda real</small></div>
        </div>
      </section>

      <section className="two-col">
        <article className="panel">
          <SectionHead eyebrow="Este mes" title="Gastos por categoría" />
          <div className="stack">
            {categories.length ? categories.map(([category, value]: any) => (
              <div className="category-row" key={category}>
                <div className="row-top"><span>{categoryLabel(category)}</span><b>{money(Number(value))}</b></div>
                <div className="progress muted"><span style={{ width: `${(Number(value) / maxCategory) * 100}%` }} /></div>
              </div>
            )) : <p className="muted-text">Todavía no hay suficientes movimientos cargados este mes.</p>}
          </div>
        </article>

        <article className="panel">
          <SectionHead eyebrow="Presupuesto" title="Ritmo vs. límites provisionales" aside={<span className="mini-total">Mes {pct(monthProgress)} transcurrido</span>} />
          <div className="stack">
            {(data.budgets || []).map((b: any) => (
              <div className="budget-row" key={b.category}>
                <div className="row-top"><div><b>{categoryLabel(b.category)}</b><small>{b.is_provisional ? "Provisional · se ajustará con historial real" : "Presupuesto activo"}</small></div><strong>{money(b.spent_pyg)} / {money(b.limit_pyg)}</strong></div>
                <div className="progress"><span style={{ width: `${Math.min(Number(b.used_pct || 0), 100)}%` }} /></div>
                <div className="row-meta"><span>{pct(b.used_pct)} utilizado</span><span>{Number(b.used_pct || 0) > monthProgress + 20 ? "Ritmo alto" : "Dentro del ritmo esperado"}</span></div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="panel smart-card-panel">
        <SectionHead eyebrow="Ahorro inteligente" title="Qué tarjeta conviene usar" aside={<span className="status-pill compact">Promos verificadas</span>} />
        <p className="intro-text">Primero decidís la compra; después elegimos el medio de pago. La recomendación prioriza reintegro y condiciones conocidas, sin justificar gasto extra ni financiación.</p>
        <div className="recommendation-grid">
          {(data.smart_card_recommendations || []).map((r: any) => {
            const best = r.best;
            return (
              <div className="recommendation-card" key={r.category}>
                <span className="eyebrow">{categoryLabel(r.category)}</span>
                {best ? <>
                  <strong>{best.bank}</strong>
                  <b>{best.merchant || best.title}</b>
                  <div className="saving-rate">{best.rate_is_up_to ? "Hasta " : ""}{number(best.rebate_rate)}%</div>
                  <small>{best.weekday_rule || "Según condiciones"}{best.day_of_month_rule ? ` · ${best.day_of_month_rule}` : ""}</small>
                  {best.remaining_purchase_cap_pyg != null ? <small>Tope de compra restante registrado: {money(best.remaining_purchase_cap_pyg)}</small> : null}
                  {r.warning ? <div className="warning-strip">{r.warning}</div> : null}
                </> : <p className="muted-text">Sin promoción comparable cargada.</p>}
              </div>
            );
          })}
        </div>

        <div className="promo-list">
          {(data.promotions || []).map((p: any) => (
            <div className="promo-row" key={p.id}>
              <div><b>{p.bank} · {p.merchant || categoryLabel(p.category)}</b><small>{p.title} · {p.weekday_rule || "condición variable"}{p.valid_to ? ` · hasta ${shortDate(p.valid_to)}` : ""}</small></div>
              <div className="promo-side"><strong>{p.rate_is_up_to ? "Hasta " : ""}{p.rebate_rate == null ? "Consultar" : `${number(p.rebate_rate)}%`}</strong><small>Verificado {shortDate(p.verified_on)}</small></div>
            </div>
          ))}
        </div>
      </section>

      <section className="two-col">
        <article className="panel">
          <SectionHead eyebrow="Ahorro y objetivos" title="Fondo de emergencia" />
          {emergency ? <>
            <div className="goal-number">{money(emergency.current_amount)} <span>/ {money(emergency.target_amount)}</span></div>
            <div className="progress goal"><span style={{ width: `${emergencyPct}%` }} /></div>
            <div className="goal-meta"><span>Progreso {pct(emergencyPct)}</span><span>Cobertura actual {Number(d.emergency_months_coverage || 0).toFixed(2)} meses de fijos</span></div>
          </> : <p className="muted-text">No hay objetivo configurado.</p>}
          <div className="mini-metrics">
            <div><span>Ahorro real este mes</span><strong>{money(d.savings_month_pyg)}</strong></div>
            <div><span>Tasa de ahorro</span><strong>{pct(d.savings_rate_pct)}</strong></div>
            <div><span>Posición financiera neta</span><strong>{money(d.net_financial_position_pyg)}</strong></div>
          </div>
        </article>

        <article className="panel">
          <SectionHead eyebrow="Historial" title="Promedios y evolución" />
          {data.monthly_averages?.sufficient_history ? (
            <div className="stack compact-stack">
              {(data.monthly_averages.categories || []).slice(0, 6).map((a: any) => <div className="simple-row" key={a.category}><span>{categoryLabel(a.category)}</span><strong>{money(a.average_pyg)} / mes</strong></div>)}
            </div>
          ) : (
            <div className="history-placeholder"><strong>Construyendo historial</strong><p>Hay {number(data.monthly_averages?.months_count)} mes(es) con movimientos. Los promedios se habilitan automáticamente con al menos 2 meses.</p></div>
          )}
          <div className="history-strip">
            {(data.history || []).slice(-6).map((h: any) => (
              <div key={h.snapshot_date}><span>{shortDate(h.snapshot_date)}</span><b>Deuda {money(h.card_debt_pyg)}</b><small>Liquidez {money(h.liquidity_pyg)}</small></div>
            ))}
          </div>
          <p className="panel-note">La serie diaria empieza desde este sistema hacia adelante; no reconstruimos el pasado.</p>
        </article>
      </section>

      <section className="two-col">
        <article className="panel">
          <SectionHead eyebrow="Actividad" title="Movimientos recientes" />
          <div className="transactions">
            {(data.recent_transactions || []).slice(0, 10).map((tx: any, index: number) => (
              <div className="transaction" key={`${tx.transaction_date}-${tx.id || index}`}>
                <div><b>{tx.description}</b><small>{dateLabel(tx.transaction_date)} · {categoryLabel(tx.category)}</small></div>
                <strong>{tx.transaction_type === "income" || tx.transaction_type === "rebate" ? "+" : "−"}{money(tx.amount)}</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <SectionHead eyebrow="Liquidez" title="Reglas de caja" />
          <div className="rule-list">
            <div><span>Colchón objetivo</span><strong>{money(cash.liquidity_floor_pyg)}</strong></div>
            <div><span>Fijos antes del próximo cobro</span><strong>{money(cash.fixed_due_before_next_income_pyg)}</strong></div>
            <div><span>Liquidez después de esos fijos</span><strong>{money(cash.projected_after_fixed_pyg)}</strong></div>
            <div className={Number(cash.cushion_gap_pyg || 0) < 0 ? "rule-alert" : "rule-good"}><span>Margen vs. colchón</span><strong>{money(cash.cushion_gap_pyg)}</strong></div>
          </div>
          <p className="panel-note">No se recomienda un pago extraordinario si obliga a quedar sin caja y volver a financiar consumos.</p>
        </article>
      </section>

      {business ? (
        <section className="panel business-panel">
          <SectionHead eyebrow="Negocio inmobiliario" title={business.name} aside={<div className="status-pill compact">Separado de finanzas personales</div>} />
          <div className="business-grid business-grid-8">
            <div><span className="eyebrow">Casas en cartera</span><strong>{number(business.units_available_min)}–{number(business.units_available_max)}</strong></div>
            <div><span className="eyebrow">Vendidas</span><strong>{number(business.units_sold)}</strong></div>
            <div><span className="eyebrow">Comisión por venta</span><strong>{money(business.commission_per_sale)}</strong></div>
            <div><span className="eyebrow">Pauta planificada</span><strong>USD {number(business.planned_ad_spend_total)}</strong></div>
            <div><span className="eyebrow">Pauta ejecutada</span><strong>{business.ad_spend_currency || "USD"} {number(business.actual_ad_spend)}</strong></div>
            <div><span className="eyebrow">Leads</span><strong>{number(business.leads)}</strong><small>Costo/lead {business.cost_per_lead == null ? "—" : `${business.ad_spend_currency || "USD"} ${number(business.cost_per_lead)}`}</small></div>
            <div><span className="eyebrow">Visitas</span><strong>{number(business.visits)}</strong><small>Conversión {business.visit_rate_pct == null ? "—" : pct(business.visit_rate_pct)}</small></div>
            <div><span className="eyebrow">Comisión generada</span><strong>{money(business.commission_generated)}</strong><small>ROI {business.roi_pct == null ? "—" : pct(business.roi_pct)}</small></div>
          </div>
        </section>
      ) : null}

      <footer>Dashboard personal · Supabase como fuente oficial · Actualización automática cada 60 segundos</footer>
    </main>
  );
}
