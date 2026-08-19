import ProjectionChartsClient from "./projection-charts-client";

type DashboardData = any;

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
      date: date.toISOString().slice(0, 10),
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

export default function ProjectionCharts({ data }: { data: DashboardData }) {
  return <ProjectionChartsClient data={data} />;
}
