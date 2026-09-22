import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge, Card, SectionHeading, Table } from "./ui";
import { supabase } from "../lib/supabase";

type CategoryActual = {
  month: string;
  category: string | null;
  total_actual: number | string | null;
};
type MonthlyTotal = {
  month: string;
  start_balance: number | string | null;
  end_balance: number | string | null;
  expense_planned: number | string | null;
  expense_actual: number | string | null;
  income_planned: number | string | null;
  income_actual: number | string | null;
};

const chartColors = [
  "var(--color-amber)",
  "var(--color-coral)",
  "var(--color-mint)",
  "#87918b",
  "#5b7c99",
  "#c47b48",
];
const currency = new Intl.NumberFormat("en-ZA", {
  style: "currency",
  currency: "ZAR",
  maximumFractionDigits: 0,
});

function amount(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function formatMonth(value: string) {
  return new Intl.DateTimeFormat("en-ZA", {
    month: "short",
    year: "2-digit",
  }).format(new Date(`${value}T00:00:00`));
}

function formatCurrency(value: number) {
  return currency.format(value);
}

export function AnalyticsScreen() {
  const [categoryActuals, setCategoryActuals] = useState<CategoryActual[]>([]);
  const [monthlyTotals, setMonthlyTotals] = useState<MonthlyTotal[]>([]);
  const [range, setRange] = useState("12");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadAnalytics() {
      setLoading(true);
      const [categoryResult, monthlyResult] = await Promise.all([
        supabase
          .from("v_category_actuals")
          .select("month, category, total_actual")
          .order("month"),
        supabase
          .from("v_monthly_totals")
          .select(
            "month, start_balance, end_balance, expense_planned, expense_actual, income_planned, income_actual",
          )
          .order("month"),
      ]);
      if (categoryResult.error || monthlyResult.error) {
        setError(
          categoryResult.error?.message ||
            monthlyResult.error?.message ||
            "Could not load analytics.",
        );
      } else {
        setCategoryActuals(categoryResult.data ?? []);
        setMonthlyTotals(monthlyResult.data ?? []);
      }
      setLoading(false);
    }

    void loadAnalytics();
  }, []);

  const visibleMonths = useMemo(() => {
    const sorted = [...monthlyTotals].sort((a, b) =>
      a.month.localeCompare(b.month),
    );
    return range === "all" ? sorted : sorted.slice(-Number(range));
  }, [monthlyTotals, range]);

  const categoryData = useMemo(() => {
    const visibleMonthKeys = new Set(visibleMonths.map((item) => item.month));
    const totals = new Map<string, number>();
    categoryActuals
      .filter((item) => visibleMonthKeys.has(item.month))
      .forEach((item) => {
        const category = item.category || "Uncategorized";
        totals.set(
          category,
          (totals.get(category) ?? 0) + amount(item.total_actual),
        );
      });
    return [...totals.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [categoryActuals, visibleMonths]);

  const trendData = visibleMonths.map((item) => ({
    ...item,
    label: formatMonth(item.month),
    expenseActual: amount(item.expense_actual),
    incomeActual: amount(item.income_actual),
    endBalance: amount(item.end_balance),
  }));

  const totalActual = categoryData.reduce((sum, item) => sum + item.value, 0);
  const varianceRows = [...visibleMonths].reverse().map((item) => {
    const planned = amount(item.expense_planned);
    const actual = amount(item.expense_actual);
    return { ...item, planned, actual, variance: planned - actual };
  });

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-6 sm:px-8 lg:px-10 lg:py-9">
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-muted">
            Financial signals
          </p>
          <h1 className="font-display text-3xl font-semibold tracking-[-0.06em] sm:text-4xl">
            Insights
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted">
            See how actual spending, income and savings are moving over time.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted">Showing</span>
          <select
            aria-label="Analytics date range"
            className="min-h-10 rounded-full border border-ink/12 bg-surface px-4 text-sm font-semibold text-ink outline-none focus:border-amber-dark"
            value={range}
            onChange={(event) => setRange(event.target.value)}
          >
            <option value="6">Last 6 months</option>
            <option value="12">Last 12 months</option>
            <option value="all">All months</option>
          </select>
        </div>
      </div>
      {error && (
        <Card className="mb-6 border-coral/30 bg-coral/6">
          <p className="text-sm font-semibold text-coral-dark">{error}</p>
          <p className="mt-1 text-xs text-muted">
            Make sure the analytics views from schema.sql are deployed in
            Supabase.
          </p>
        </Card>
      )}
      {loading ? (
        <Card>
          <p className="text-sm text-muted">
            Loading your financial signals...
          </p>
        </Card>
      ) : monthlyTotals.length === 0 ? (
        <Card>
          <SectionHeading
            eyebrow="No history yet"
            title="Your trends will appear here"
          />
          <p className="text-sm text-muted">
            Add a monthly budget and entries to start seeing analytics.
          </p>
        </Card>
      ) : (
        <>
          <section className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
            <Card>
              <SectionHeading
                eyebrow="Actual expenses"
                title="Spending by category"
              />
              <div className="grid gap-5 md:grid-cols-[1fr_180px] md:items-center">
                <div className="h-64 min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={68}
                        outerRadius={96}
                        paddingAngle={3}
                      >
                        {categoryData.map((entry, index) => (
                          <Cell
                            key={entry.name}
                            fill={chartColors[index % chartColors.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value) => formatCurrency(Number(value))}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-3">
                  {categoryData.slice(0, 6).map((item, index) => (
                    <div
                      key={item.name}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{
                            backgroundColor:
                              chartColors[index % chartColors.length],
                          }}
                        />
                        <span className="truncate text-muted">{item.name}</span>
                      </div>
                      <span className="font-semibold">
                        {totalActual
                          ? `${Math.round((item.value / totalActual) * 100)}%`
                          : "0%"}
                      </span>
                    </div>
                  ))}
                  {categoryData.length === 0 && (
                    <p className="text-sm text-muted">
                      No expense actuals in this range.
                    </p>
                  )}
                </div>
              </div>
              <p className="mt-2 text-xs text-muted">
                {formatCurrency(totalActual)} actual expenses across the
                selected period.
              </p>
            </Card>
            <Card tone="dark">
              <SectionHeading
                eyebrow="Balance trend"
                title="Savings over time"
              />
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={trendData}
                    margin={{ top: 12, right: 8, left: -18, bottom: 4 }}
                  >
                    <CartesianGrid
                      stroke="var(--color-ink)"
                      opacity={0.12}
                      vertical={false}
                    />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: "var(--color-ink)", fontSize: 11, opacity: 0.65 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tick={{ fill: "var(--color-ink)", fontSize: 11, opacity: 0.65 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value) =>
                        `R${Math.round(Number(value) / 1000)}k`
                      }
                    />
                    <Tooltip
                      formatter={(value) => formatCurrency(Number(value))}
                    />
                    <Line
                      type="monotone"
                      dataKey="endBalance"
                      name="End balance"
                      stroke="var(--color-amber)"
                      strokeWidth={3}
                      dot={{ r: 3, fill: "var(--color-amber)" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-2 text-xs text-white/60">
                End balance recorded for each month.
              </p>
            </Card>
          </section>
          <section className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_1fr]">
            <Card>
              <SectionHeading
                eyebrow="Actual movement"
                title="Income vs expenses"
              />
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={trendData}
                    margin={{ top: 12, right: 8, left: -18, bottom: 4 }}
                  >
                    <CartesianGrid
                      stroke="rgba(35,37,34,0.1)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: "#777a72", fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tick={{ fill: "#777a72", fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value) =>
                        `R${Math.round(Number(value) / 1000)}k`
                      }
                    />
                    <Tooltip
                      formatter={(value) => formatCurrency(Number(value))}
                    />
                    <Legend iconType="circle" />
                    <Line
                      type="monotone"
                      dataKey="incomeActual"
                      name="Income"
                      stroke="#20a477"
                      strokeWidth={3}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="expenseActual"
                      name="Expenses"
                      stroke="#e86d52"
                      strokeWidth={3}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card className="p-0">
              <div className="p-5 pb-2">
                <SectionHeading
                  eyebrow="Largest deviations"
                  title="Planned vs actual"
                />
              </div>
              <Table>
                <thead>
                  <tr className="border-y border-ink/8 text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
                    <th className="px-5 py-3">Month</th>
                    <th className="px-3 py-3 text-right">Planned</th>
                    <th className="px-3 py-3 text-right">Actual</th>
                    <th className="px-5 py-3 text-right">Variance</th>
                  </tr>
                </thead>
                <tbody>
                  {varianceRows.slice(0, 6).map((item) => (
                    <tr
                      key={item.month}
                      className="border-b border-ink/6 last:border-0"
                    >
                      <td className="px-5 py-4 text-sm font-semibold">
                        {formatMonth(item.month)}
                      </td>
                      <td className="px-3 py-4 text-right text-sm text-muted">
                        {formatCurrency(item.planned)}
                      </td>
                      <td className="px-3 py-4 text-right text-sm font-semibold">
                        {formatCurrency(item.actual)}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <Badge
                          tone={item.variance >= 0 ? "positive" : "negative"}
                        >
                          {item.variance >= 0 ? "+" : ""}
                          {formatCurrency(item.variance)}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              {varianceRows.length === 0 && (
                <p className="p-5 text-sm text-muted">
                  No variance data in this range.
                </p>
              )}
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
