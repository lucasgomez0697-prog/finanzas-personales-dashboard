type DashboardData = any;

const pyg = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 });
const money = (value?: number | null) => `Gs. ${pyg.format(Number(value || 0))}`;

function monthLabel(date: Date) {
  return date.toLocaleDateString("es-PY", { month: "short", year: "2-digit", timeZone: "UTC" }).replace(".", "");
}

function addMonths(date: Date, months: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

function amountForRecurringMonth(item: any, monthIndex: number) {
  const remaining = item.remaining_payments == null ? null : Number(item.remaining_payments);
  if (remaining != null && monthIndex >= remaining) return 0;
  return Number(item.estimated_pyg_amount || item.gross_amount || 0);
}

export function getProjectionSummary(data: DashboardData) {
  const income = Number(data.snapshot?.monthly_cash_income_pyg || 0);
  const currentLiquidity = Number(data.liquidity?.liquid_pyg || data.snapshot?.current_liquidity_pyg || 0);
  const liquidityFloor = Number(data.cash_flow?.liquidity_floor_pyg || 0);
  const variableReserve = (data.budgets || [])
    .filter((b: any) => b.category !== "ahorro_mensual" && ["cap", "reserve"].includes(String(b.budget_type || "")))
    .reduce((sum: number, b: any) => sum + Number(b.limit_pyg || b.monthly_limit || 0), 0);

  const debtGoal = (data.goals || []).find((g: any) => String(g.name || "").toLowerCase().includes("saldo financiado"));
  const debtTarget = Number(debtGoal?.monthly_contribution || 2000000);

  let interestDebt = Number(data.derived?.interest_bearing_debt_estimate_pyg || 0);
  const openingNonZero = Number(data.derived?.balance_excluding_zero_interest_future_pyg || 0);
  let currentCardDebt = Math.max(openingNonZero - interestDebt, 0);
  let zeroInterestDebt = Number(data.derived?.zero_interest_future_installments_pyg || 0);
  const zeroMonthlyPayment = (data.installments || [])
    .filter((i: any) => Number(i.interest_rate || 0) === 0)
    .reduce((sum: number, i: any) => sum + Number(i.monthly_payment || 0), 0);

  const start = new Date(`${data.local_date || new Date().toISOString().slice(0, 10)}T12:00:00Z`);
  const projectionStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  const cushionTopupNeeded = Math.max(liquidityFloor - currentLiquidity, 0);
  const recurring = data.recurring_expenses || [];

  const months: any[] = [];
  let saneMonth: string | null = null;
  let interestFreeMonth: string | null = null;

  for (let i = 0; i < 12; i++) {
    const date = addMonths(projectionStart, i);
    const fixed = recurring.reduce((sum: number, r: any) => sum + amountForRecurringMonth(r, i), 0);
    const cushionTopup = i === 0 ? cushionTopupNeeded : 0;
    const availableAfterLiving = Math.max(income - fixed - variableReserve - cushionTopup, 0);
    const maxDebtPayment = Math.max(Math.min(debtTarget, availableAfterLiving - liquidityFloor), 0);

    const interestPayment = Math.min(interestDebt, maxDebtPayment);
    interestDebt = Math.max(interestDebt - interestPayment, 0);
    const remainingDebtCapacity = Math.max(maxDebtPayment - interestPayment, 0);
    const currentPayment = Math.min(currentCardDebt, remainingDebtCapacity);
    currentCardDebt = Math.max(currentCardDebt - currentPayment, 0);
    const debtPayment = interestPayment + currentPayment;

    if (!interestFreeMonth && interestDebt <= 0) interestFreeMonth = monthLabel(date);
    if (!saneMonth && interestDebt <= 0 && currentCardDebt <= 0) saneMonth = monthLabel(date);

    zeroInterestDebt = Math.max(zeroInterestDebt - zeroMonthlyPayment, 0);
    const totalProjectedCardDebt = interestDebt + currentCardDebt + zeroInterestDebt;
    const freeCash = Math.max(availableAfterLiving - debtPayment, 0);

    months.push({
      month: monthLabel(date),
      fixed,
      variableReserve,
      cushionTopup,
      debtPayment,
      freeCash,
      interestDebt,
      currentCardDebt,
      zeroInterestDebt,
      totalProjectedCardDebt,
    });
  }

  return {
    income,
    variableReserve,
    debtTarget,
    liquidityFloor,
    nextMonthFree: Number(months[0]?.freeCash || 0),
    saneMonth,
    interestFreeMonth,
    months,
  };
}

function LineChart({ rows, series, maxValue }: { rows: any[]; series: { key: string; label: string; stroke: string; dashed?: boolean }[]; maxValue?: number }) {
  const width = 900;
  const height = 300;
  const padX = 54;
  const padTop = 22;
  const padBottom = 46;
  const plotW = width - padX * 2;
  const plotH = height - padTop - padBottom;
  const max = Math.max(maxValue || 0, ...rows.flatMap((r) => series.map((s) => Number(r[s.key] || 0))), 1);
  const x = (i: number) => padX + (rows.length <= 1 ? 0 : (i / (rows.length - 1)) * plotW);
  const y = (value: number) => padTop + plotH - (Math.max(value, 0) / max) * plotH;
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div style={{ overflow: "hidden" }}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Gráfico de tendencia financiera" style={{ width: "100%", height: "auto", display: "block" }}>
        {ticks.map((t) => {
          const yy = padTop + plotH - t * plotH;
          return <g key={t}><line x1={padX} y1={yy} x2={width - padX} y2={yy} stroke="rgba(148,163,184,.14)" /><text x={8} y={yy + 4} fill="var(--muted)" fontSize="11">{pyg.format(Math.round(max * t / 100000) * 100000)}</text></g>;
        })}
        {series.map((s) => {
          const points = rows.map((r, i) => `${x(i)},${y(Number(r[s.key] || 0))}`).join(" ");
          return <polyline key={s.key} points={points} fill="none" stroke={s.stroke} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={s.dashed ? "9 8" : undefined} />;
        })}
        {rows.map((r, i) => i % 2 === 0 || i === rows.length - 1 ? <text key={r.month} x={x(i)} y={height - 16} textAnchor="middle" fill="var(--muted)" fontSize="11">{r.month}</text> : null)}
      </svg>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 4 }}>
        {series.map((s) => <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 7, color: "var(--muted)", fontSize: 12 }}><span style={{ width: 22, height: 3, borderRadius: 999, background: s.stroke, display: "inline-block" }} />{s.label}</div>)}
      </div>
    </div>
  );
}

export default function ProjectionCharts({ data }: { data: DashboardData }) {
  const p = getProjectionSummary(data);
  const debtRows = [
    {
      month: "Hoy",
      totalProjectedCardDebt: Number(data.derived?.total_card_balance_pyg || 0),
      interestDebt: Number(data.derived?.interest_bearing_debt_estimate_pyg || 0),
      zeroInterestDebt: Number(data.derived?.zero_interest_future_installments_pyg || 0),
    },
    ...p.months,
  ];

  return (
    <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", gap: 14, marginBottom: 14 }}>
      <article className="panel" style={{ marginBottom: 0 }}>
        <div className="panel-head">
          <div><span className="eyebrow">Proyección</span><h2>Tendencia de deuda de tarjetas</h2></div>
          <span className="status-pill compact">Saneamiento: {p.saneMonth || "por calcular"}</span>
        </div>
        <LineChart rows={debtRows} series={[
          { key: "totalProjectedCardDebt", label: "Deuda total proyectada", stroke: "var(--accent)" },
          { key: "zeroInterestDebt", label: "Cuotas futuras 0%", stroke: "#818cf8", dashed: true },
          { key: "interestDebt", label: "Deuda con interés", stroke: "var(--danger)" },
        ]} />
        <p className="panel-note">Escenario: no crear nueva deuda neta, pagar hasta {money(p.debtTarget)} por mes a saldos no 0%, conservar {money(p.liquidityFloor)} de margen y mantener la reserva variable presupuestada. La deuda con interés se proyecta en 0 para {p.interestFreeMonth || "—"}.</p>
      </article>

      <article className="panel" style={{ marginBottom: 0 }}>
        <div className="panel-head">
          <div><span className="eyebrow">Proyección</span><h2>Dinero libre después de compromisos</h2></div>
          <span className="status-pill compact">Próximo mes: {money(p.nextMonthFree)}</span>
        </div>
        <LineChart rows={p.months} series={[
          { key: "freeCash", label: "Dinero libre", stroke: "var(--success)" },
          { key: "debtPayment", label: "Pago de deuda", stroke: "var(--warning)", dashed: true },
        ]} />
        <p className="panel-note">Cada mes recalcula automáticamente ingreso, gastos fijos activos, cuotas finitas, reserva variable y capacidad de saneamiento. Cuando agreguemos o eliminemos un gasto fijo en Supabase, esta proyección cambia sola.</p>
      </article>
    </section>
  );
}
