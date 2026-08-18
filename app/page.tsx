type Card = {
  bank: string;
  card_name?: string;
  current_balance: number;
  credit_limit?: number;
  available_credit?: number;
  annual_nominal_rate?: number;
  balance_status?: string;
};

type Goal = {
  name: string;
  target_amount?: number;
  current_amount?: number;
  monthly_contribution?: number;
};

type Tx = {
  transaction_date: string;
  description: string;
  amount: number;
  category: string;
  transaction_type: string;
};

type DashboardData = {
  generated_at: string;
  snapshot: {
    monthly_cash_income_pyg: number;
    monthly_non_cash_benefits_pyg: number;
    total_card_balance_pyg: number;
    current_liquidity_pyg: number;
    recurring_gross_pyg: number;
    expected_monthly_rebates_pyg: number;
  };
  liquidity: { liquid_pyg: number; benefit_pyg: number };
  derived: {
    total_card_balance_pyg: number;
    zero_interest_future_installments_pyg: number;
  };
  cards: Card[];
  monthly_by_category: Record<string, number>;
  goals: Goal[];
  recent_transactions: Tx[];
};

const pyg = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 });
const money = (value?: number) => `Gs. ${pyg.format(Number(value || 0))}`;

async function getDashboard(): Promise<DashboardData | null> {
  const url = process.env.SUPABASE_DASHBOARD_URL;
  const key = process.env.DASHBOARD_API_KEY;
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

function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <article className="metric-card">
      <span className="eyebrow">{label}</span>
      <strong>{value}</strong>
      {note ? <small>{note}</small> : null}
    </article>
  );
}

export default async function Home() {
  const data = await getDashboard();

  if (!data) {
    return (
      <main className="shell">
        <section className="empty-state">
          <span className="eyebrow">Finanzas Personales</span>
          <h1>Dashboard pendiente de configuración</h1>
          <p>La aplicación ya está desplegada. Solo faltan las variables privadas de Vercel para conectarla con Supabase.</p>
        </section>
      </main>
    );
  }

  const s = data.snapshot;
  const zeroInterest = Number(data.derived?.zero_interest_future_installments_pyg || 0);
  const cardDebt = Number(data.derived?.total_card_balance_pyg || s.total_card_balance_pyg || 0);
  const financedEstimate = Math.max(cardDebt - zeroInterest, 0);
  const categories = Object.entries(data.monthly_by_category || {}).sort((a, b) => Number(b[1]) - Number(a[1]));
  const maxCategory = Math.max(...categories.map(([, v]) => Number(v)), 1);
  const emergency = data.goals?.find((g) => g.name.toLowerCase().includes("emergencia"));
  const emergencyPct = emergency?.target_amount ? Math.min(100, (Number(emergency.current_amount || 0) / Number(emergency.target_amount)) * 100) : 0;

  return (
    <main className="shell">
      <header className="hero">
        <div>
          <span className="eyebrow">Finanzas Personales</span>
          <h1>Tu situación financiera, en una sola vista.</h1>
          <p>Datos oficiales desde Supabase. Última actualización: {new Date(data.generated_at).toLocaleString("es-PY")}</p>
        </div>
        <div className="status-pill">● Datos en vivo</div>
      </header>

      <section className="metrics-grid">
        <Metric label="Liquidez" value={money(data.liquidity?.liquid_pyg || s.current_liquidity_pyg)} note="Efectivo disponible" />
        <Metric label="Deuda total tarjetas" value={money(cardDebt)} note="Itaú + Sudameris + Ueno" />
        <Metric label="Deuda / saldo no 0%" value={money(financedEstimate)} note="Estimación separando cuotas futuras 0%" />
        <Metric label="Cuotas futuras 0%" value={money(zeroInterest)} note="Principalmente notebook Itaú" />
        <Metric label="Ingreso mensual" value={money(s.monthly_cash_income_pyg)} note={`+ ${money(s.monthly_non_cash_benefits_pyg)} Gourmet Card`} />
        <Metric label="Gastos fijos brutos" value={money(s.recurring_gross_pyg)} note={`${money(s.expected_monthly_rebates_pyg)} en reintegros esperados`} />
      </section>

      <section className="two-col">
        <article className="panel">
          <div className="panel-head"><div><span className="eyebrow">Tarjetas</span><h2>Saldos actuales</h2></div></div>
          <div className="stack">
            {(data.cards || []).map((card) => {
              const limit = Number(card.credit_limit || 0);
              const usedPct = limit ? Math.min(100, (Number(card.current_balance) / limit) * 100) : 0;
              return (
                <div className="card-row" key={card.bank}>
                  <div className="row-top"><div><b>{card.bank}</b><small>{card.card_name || "Tarjeta"}</small></div><strong>{money(card.current_balance)}</strong></div>
                  <div className="progress"><span style={{ width: `${usedPct}%` }} /></div>
                  <div className="row-meta"><span>Disponible {money(card.available_credit)}</span><span>{usedPct.toFixed(0)}% utilizado</span></div>
                </div>
              );
            })}
          </div>
        </article>

        <article className="panel">
          <div className="panel-head"><div><span className="eyebrow">Este mes</span><h2>Gastos por categoría</h2></div></div>
          <div className="stack">
            {categories.length ? categories.map(([category, value]) => (
              <div className="category-row" key={category}>
                <div className="row-top"><span>{category}</span><b>{money(Number(value))}</b></div>
                <div className="progress muted"><span style={{ width: `${(Number(value) / maxCategory) * 100}%` }} /></div>
              </div>
            )) : <p className="muted-text">Todavía no hay suficientes movimientos cargados este mes.</p>}
          </div>
        </article>
      </section>

      <section className="two-col">
        <article className="panel">
          <div className="panel-head"><div><span className="eyebrow">Objetivos</span><h2>Fondo de emergencia</h2></div></div>
          {emergency ? <>
            <div className="goal-number">{money(emergency.current_amount)} <span>/ {money(emergency.target_amount)}</span></div>
            <div className="progress goal"><span style={{ width: `${emergencyPct}%` }} /></div>
            <p className="muted-text">Progreso: {emergencyPct.toFixed(1)}%</p>
          </> : <p className="muted-text">No hay objetivo configurado.</p>}
        </article>

        <article className="panel">
          <div className="panel-head"><div><span className="eyebrow">Actividad</span><h2>Movimientos recientes</h2></div></div>
          <div className="transactions">
            {(data.recent_transactions || []).slice(0, 8).map((tx, index) => (
              <div className="transaction" key={`${tx.transaction_date}-${index}`}>
                <div><b>{tx.description}</b><small>{tx.transaction_date} · {tx.category}</small></div>
                <strong>{tx.transaction_type === "income" || tx.transaction_type === "rebate" ? "+" : "−"}{money(tx.amount)}</strong>
              </div>
            ))}
          </div>
        </article>
      </section>

      <footer>Dashboard personal · Supabase como fuente oficial · Actualización automática</footer>
    </main>
  );
}
