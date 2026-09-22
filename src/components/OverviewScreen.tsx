import { useEffect, useState } from "react";
import { Button, Card, Table } from "./ui";
import { supabase } from "../lib/supabase";

type BudgetItem = {
  id: string;
  name: string;
  type: "expense" | "income";
  payment_method: "debit_order" | "manual";
  due_day: number | null;
  categories?: { name: string } | { name: string }[] | null;
};
type BudgetEntry = {
  id: string;
  budget_item_id: string;
  planned: number | string;
  actual: number | string;
  paid: boolean;
  budget_items: BudgetItem | BudgetItem[] | null;
};
type MonthlyBudget = {
  id: string;
  month: string;
  start_balance: number | string;
  end_balance: number | string;
};
type EntryChanges = Partial<
  Pick<BudgetEntry, "planned" | "actual" | "paid">
> & { remove?: boolean };

const amountInputClass =
  "mx-auto block min-h-9 w-full max-w-28 rounded-lg border border-ink/12 bg-surface px-2 text-center text-sm font-semibold text-ink placeholder:text-muted/60 outline-none focus:border-amber-dark focus:ring-2 focus:ring-amber/20";
function getCurrentMonth() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
function monthDate(month: string) {
  return `${month}-01`;
}
function formatMonth(month: string) {
  return new Intl.DateTimeFormat("en-ZA", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));
}
function isFutureMonth(month: string) {
  return month > getCurrentMonth();
}
function amount(value: number | string | null | undefined) {
  return Number(value ?? 0);
}
function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 2,
  }).format(value);
}
function getErrorMessage(error: { message?: string } | null, fallback: string) {
  return error?.message || fallback;
}
function getBudgetItem(entry: BudgetEntry) {
  return Array.isArray(entry.budget_items)
    ? entry.budget_items[0]
    : entry.budget_items;
}
function sortEntriesByItemName(entries: BudgetEntry[]) {
  return [...entries].sort((a, b) =>
    (getBudgetItem(a)?.name ?? "").localeCompare(getBudgetItem(b)?.name ?? "", undefined, {
      sensitivity: "base",
    }),
  );
}
function getCategoryName(categories: BudgetItem["categories"]) {
  return (
    (Array.isArray(categories) ? categories[0]?.name : categories?.name) ??
    "Uncategorized"
  );
}
function isOverdue(item: BudgetItem, paid: boolean, month: string) {
  if (!item.due_day || paid) return false;
  const today = new Date();
  const selectedYear = Number(month.slice(0, 4));
  const selectedMonth = Number(month.slice(5, 7)) - 1;
  const dueDate = new Date(selectedYear, selectedMonth, item.due_day);
  const todayDate = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  return today.getFullYear() === selectedYear &&
    today.getMonth() === selectedMonth
    ? dueDate < todayDate
    : dueDate < new Date(today.getFullYear(), today.getMonth(), 1);
}

function PaidToggle({
  itemName,
  paid,
  onChange,
}: {
  itemName: string;
  paid: boolean;
  onChange: (paid: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={paid}
      aria-label={`${itemName} ${paid ? "paid" : "unpaid"}`}
      onClick={() => onChange(!paid)}
      className={`mx-auto inline-flex min-w-20 items-center justify-center rounded-full px-3 py-2 text-xs font-bold transition-colors ${paid ? "bg-mint text-white" : "bg-ink/8 text-muted hover:bg-ink/12"}`}
    >
      {paid ? "Paid" : "Unpaid"}
    </button>
  );
}

function AmountInput({
  itemName,
  value,
  onUpdate,
}: {
  itemName: string;
  value: number | string;
  onUpdate: (value: number | string) => void;
}) {
  const displayValue = Number(value) === 0 ? "" : `R ${value}`;
  return (
    <input
      aria-label={`${itemName} amount`}
      className={amountInputClass}
      type="text"
      inputMode="decimal"
      value={displayValue}
      placeholder="R ..."
      onChange={(event) => onUpdate(event.target.value.replace(/[^\d.]/g, ""))}
      onBlur={(event) =>
        onUpdate(
          event.target.value
            ? amount(event.target.value.replace(/[^\d.]/g, ""))
            : 0,
        )
      }
    />
  );
}

function RemoveButton({
  itemName,
  onRemove,
}: {
  itemName: string;
  onRemove: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={`Remove ${itemName}`}
      onClick={onRemove}
      className="mx-auto inline-flex min-w-20 items-center justify-center rounded-full bg-coral/12 px-3 py-2 text-xs font-bold text-coral-dark transition-colors hover:bg-coral/20"
    >
      Remove
    </button>
  );
}

function IncomeOverviewGroup({
  title,
  entries,
  month: _month,
  onUpdate,
  showHeading,
}: {
  title: string;
  entries: BudgetEntry[];
  month: string;
  onUpdate: (entryId: string, changes: EntryChanges) => Promise<void>;
  showHeading: boolean;
}) {
  if (entries.length === 0) return null;
  return (
    <div className="mt-5">
      {showHeading && (
        <div className="mb-2 bg-ink/8 px-2 py-2">
          <h3 className="text-sm font-bold">{title}</h3>
        </div>
      )}
      <Table className="table-fixed">
        <thead>
          <tr className="border-y border-ink/8 text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
            <th className="px-5 py-3">Item</th>
            <th className="px-3 py-3">Category</th>
            <th className="px-3 py-3 text-right">Planned</th>
            <th className="px-3 py-3 text-right">Actual</th>
            <th className="px-5 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const item = getBudgetItem(entry);
            if (!item) return null;
            return (
              <tr
                key={entry.id}
                className="border-b border-ink/6 last:border-0 hover:bg-ink/[0.025]"
              >
                <td className="px-5 py-3">
                  <p className="text-sm font-semibold">{item.name}</p>
                </td>
                <td className="px-3 py-3 text-sm text-muted">
                  {getCategoryName(item.categories)}
                </td>
                <td className="px-3 py-3 text-center">
                  <AmountInput
                    itemName={item.name}
                    value={entry.planned}
                    onUpdate={(value) =>
                      void onUpdate(entry.id, { planned: value })
                    }
                  />
                </td>
                <td className="px-3 py-3 text-center">
                  <AmountInput
                    itemName={item.name}
                    value={entry.actual}
                    onUpdate={(value) =>
                      void onUpdate(entry.id, { actual: value })
                    }
                  />
                </td>
                <td className="px-5 py-3 text-center">
                  <RemoveButton
                    itemName={item.name}
                    onRemove={() => void onUpdate(entry.id, { remove: true })}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </div>
  );
}

function OverviewGroup({
  title,
  entries,
  month,
  onUpdate,
}: {
  title: string;
  entries: BudgetEntry[];
  month: string;
  onUpdate: (entryId: string, changes: EntryChanges) => Promise<void>;
}) {
  const isIncome = title.startsWith("Income");
  const hideHeading = isIncome && title.includes("Manual payments");
  const displayTitle = title.includes("Debit orders") ? "Debit Orders" : title;
  if (isIncome)
    return (
      <IncomeOverviewGroup
        entries={entries}
        month={month}
        onUpdate={onUpdate}
        showHeading={!hideHeading}
        title={displayTitle}
      />
    );
  title = displayTitle;
  if (entries.length === 0) return null;
  return (
    <div className="mt-5">
      <div className="mb-2 bg-ink/8 px-2 py-2">
        <h3 className="text-sm font-bold">{title}</h3>
      </div>
      <Table className="table-fixed">
        <thead>
          <tr className="border-y border-ink/8 text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
            <th className="px-5 py-3">Item</th>
            <th className="px-3 py-3">Category</th>
            <th className="px-3 py-3 text-right">Planned</th>
            <th className="px-3 py-3 text-right">Actual</th>
            <th className="px-5 py-3 text-right">Paid</th>
            <th className="px-5 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const item = getBudgetItem(entry);
            if (!item) return null;
            const overdue = isOverdue(item, entry.paid, month);
            return (
              <tr
                key={entry.id}
                className={`border-b border-ink/6 last:border-0 ${entry.paid ? "bg-mint/12" : overdue ? "bg-coral/10" : "hover:bg-ink/[0.025]"}`}
              >
                <td className="px-5 py-3">
                  <p className="text-sm font-semibold">{item.name}</p>
                </td>
                <td className="px-3 py-3 text-sm text-muted">
                  {getCategoryName(item.categories)}
                </td>
                <td className="px-3 py-3 text-center">
                  <AmountInput
                    itemName={item.name}
                    value={entry.planned}
                    onUpdate={(value) =>
                      void onUpdate(entry.id, { planned: value })
                    }
                  />
                </td>
                <td className="px-3 py-3 text-center">
                  <AmountInput
                    itemName={item.name}
                    value={entry.actual}
                    onUpdate={(value) =>
                      void onUpdate(entry.id, { actual: value })
                    }
                  />
                </td>
                <td className="px-5 py-3 text-center">
                  <PaidToggle
                    itemName={item.name}
                    paid={entry.paid}
                    onChange={(paid) => void onUpdate(entry.id, { paid })}
                  />
                </td>
                <td className="px-5 py-3 text-center">
                  <RemoveButton
                    itemName={item.name}
                    onRemove={() => void onUpdate(entry.id, { remove: true })}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </div>
  );
}

export function OverviewScreen() {
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth);
  const [monthlyBudget, setMonthlyBudget] = useState<MonthlyBudget | null>(
    null,
  );
  const [entries, setEntries] = useState<BudgetEntry[]>([]);
  const [activeItemCount, setActiveItemCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function loadMonth(month = selectedMonth) {
    setLoading(true);
    setError("");
    const [monthResult, itemsResult] = await Promise.all([
      supabase
        .from("monthly_budgets")
        .select("id, month, start_balance, end_balance")
        .eq("month", monthDate(month))
        .maybeSingle(),
      supabase.from("budget_items").select("id").eq("is_active", true),
    ]);
    if (monthResult.error || itemsResult.error) {
      setError(
        getErrorMessage(
          monthResult.error || itemsResult.error,
          "Could not load this month.",
        ),
      );
      setMonthlyBudget(null);
      setEntries([]);
    } else {
      setMonthlyBudget(monthResult.data);
      setActiveItemCount(itemsResult.data?.length ?? 0);
      if (monthResult.data) {
        const entryResult = await supabase
          .from("budget_entries")
          .select(
            "id, budget_item_id, planned, actual, paid, budget_items(id, name, type, payment_method, due_day, categories(name))",
          )
          .eq("monthly_budget_id", monthResult.data.id);
        if (entryResult.error)
          setError(
            getErrorMessage(
              entryResult.error,
              "Could not load budget entries.",
            ),
          );
        else setEntries((entryResult.data ?? []) as BudgetEntry[]);
      } else setEntries([]);
    }
    setLoading(false);
  }

  useEffect(() => {
    void loadMonth();
  }, [selectedMonth]);

  async function createMonth() {
    if (activeItemCount === 0) return;
    setSaving(true);
    setError("");
    const previousDate = new Date(`${selectedMonth}-01T00:00:00Z`);
    previousDate.setUTCMonth(previousDate.getUTCMonth() - 1);
    const previousMonth = previousDate.toISOString().slice(0, 7);
    const previousResult = await supabase
      .from("monthly_budgets")
      .select("id, end_balance")
      .eq("month", monthDate(previousMonth))
      .maybeSingle();
    if (previousResult.error) {
      setError(
        getErrorMessage(
          previousResult.error,
          "Could not find the previous month.",
        ),
      );
      setSaving(false);
      return;
    }
    let previousEntries: {
      budget_item_id: string;
      planned: number | string;
    }[] = [];
    if (previousResult.data) {
      const result = await supabase
        .from("budget_entries")
        .select("budget_item_id, planned")
        .eq("monthly_budget_id", previousResult.data.id);
      if (result.error) {
        setError(
          getErrorMessage(
            result.error,
            "Could not load previous planned amounts.",
          ),
        );
        setSaving(false);
        return;
      }
      previousEntries = result.data ?? [];
    }
    const itemsResult = await supabase
      .from("budget_items")
      .select("id")
      .eq("is_active", true);
    if (itemsResult.error) {
      setError(
        getErrorMessage(
          itemsResult.error,
          "Could not load active budget items.",
        ),
      );
      setSaving(false);
      return;
    }
    const newMonthResult = await supabase
      .from("monthly_budgets")
      .insert({
        month: monthDate(selectedMonth),
        start_balance: previousResult.data?.end_balance ?? 0,
      })
      .select("id, month, start_balance, end_balance")
      .single();
    if (newMonthResult.error) {
      setError(
        getErrorMessage(newMonthResult.error, "Could not create this month."),
      );
      setSaving(false);
      return;
    }
    const plannedByItem = new Map(
      previousEntries.map((entry) => [
        entry.budget_item_id,
        amount(entry.planned),
      ]),
    );
    const entriesToCreate = (itemsResult.data ?? []).map((item) => ({
      monthly_budget_id: newMonthResult.data.id,
      budget_item_id: item.id,
      planned: plannedByItem.get(item.id) ?? 0,
      actual: 0,
      paid: false,
    }));
    const entriesResult = await supabase
      .from("budget_entries")
      .insert(entriesToCreate);
    if (entriesResult.error) {
      await supabase
        .from("monthly_budgets")
        .delete()
        .eq("id", newMonthResult.data.id);
      setError(
        getErrorMessage(
          entriesResult.error,
          "Could not create this month's entries.",
        ),
      );
    } else await loadMonth();
    setSaving(false);
  }

  async function deleteMonth() {
    if (!monthlyBudget || !isFutureMonth(selectedMonth)) {
      setError("Only future months can be deleted.");
      return;
    }
    if (
      !window.confirm(
        `Delete ${formatMonth(selectedMonth)}? This will remove the month and all of its entries.`,
      )
    )
      return;
    setSaving(true);
    setError("");
    const entriesResult = await supabase
      .from("budget_entries")
      .delete()
      .eq("monthly_budget_id", monthlyBudget.id);
    if (entriesResult.error)
      setError(
        getErrorMessage(
          entriesResult.error,
          "Could not delete this month's entries.",
        ),
      );
    else {
      const monthResult = await supabase
        .from("monthly_budgets")
        .delete()
        .eq("id", monthlyBudget.id);
      if (monthResult.error)
        setError(
          getErrorMessage(monthResult.error, "Could not delete this month."),
        );
      else {
        setMonthlyBudget(null);
        setEntries([]);
        setSelectedMonth(getCurrentMonth());
      }
    }
    setSaving(false);
  }

  async function removeEntry(entry: BudgetEntry) {
    const item = getBudgetItem(entry);
    if (
      !item ||
      !window.confirm(
        `Remove ${item.name} from ${formatMonth(selectedMonth)}? The budget item will remain available in other months.`,
      )
    )
      return;
    setSaving(true);
    setError("");
    const { error: deleteError } = await supabase
      .from("budget_entries")
      .delete()
      .eq("id", entry.id);
    if (deleteError)
      setError(
        getErrorMessage(
          deleteError,
          "Could not remove this item from the month.",
        ),
      );
    else
      setEntries((current) =>
        current.filter((currentEntry) => currentEntry.id !== entry.id),
      );
    setSaving(false);
  }

  async function updateEntry(entryId: string, changes: EntryChanges) {
    if (changes.remove) {
      const entry = entries.find((currentEntry) => currentEntry.id === entryId);
      if (entry) await removeEntry(entry);
      return;
    }
    const normalized = {
      ...changes,
      ...("planned" in changes ? { planned: amount(changes.planned) } : {}),
      ...("actual" in changes ? { actual: amount(changes.actual) } : {}),
    };
    setEntries((current) =>
      current.map((entry) =>
        entry.id === entryId ? { ...entry, ...changes, ...normalized } : entry,
      ),
    );
    if (
      typeof changes.planned === "string" ||
      typeof changes.actual === "string"
    )
      return;
    const { error: updateError } = await supabase
      .from("budget_entries")
      .update(normalized)
      .eq("id", entryId);
    if (updateError)
      setError(getErrorMessage(updateError, "Could not save this entry."));
  }

  const expenseEntries = entries.filter(
    (entry) => getBudgetItem(entry)?.type === "expense",
  );
  const incomeEntries = entries.filter(
    (entry) => getBudgetItem(entry)?.type === "income",
  );
  const plannedExpenses = expenseEntries.reduce(
    (total, entry) => total + amount(entry.planned),
    0,
  );
  const actualExpenses = expenseEntries.reduce(
    (total, entry) => total + amount(entry.actual),
    0,
  );
  const plannedIncome = incomeEntries.reduce(
    (total, entry) => total + amount(entry.planned),
    0,
  );
  const actualIncome = incomeEntries.reduce(
    (total, entry) => total + amount(entry.actual),
    0,
  );
  const plannedSurplus = plannedIncome - plannedExpenses;
  const savingsIncrease = actualIncome - actualExpenses;
  const difference = savingsIncrease - plannedSurplus;
  const debitOrders = sortEntriesByItemName(
    entries.filter(
      (entry) => getBudgetItem(entry)?.payment_method === "debit_order",
    ),
  );
  const manualPayments = sortEntriesByItemName(
    entries.filter(
      (entry) => getBudgetItem(entry)?.payment_method === "manual",
    ),
  );

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-6 sm:px-8 lg:px-10 lg:py-9">
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-muted">
            Monthly budget
          </p>
          <label className="sr-only" htmlFor="month-selector">
            Select month
          </label>
          <input
            id="month-selector"
            aria-label="Select month"
            type="month"
            value={selectedMonth}
            onChange={(event) => setSelectedMonth(event.target.value)}
            className="min-h-12 rounded-xl border border-ink/10 bg-surface px-4 text-2xl font-display font-semibold tracking-[-0.06em]"
          />
        </div>
        <div className="flex gap-2">
          {monthlyBudget && isFutureMonth(selectedMonth) && (
            <Button
              variant="ghost"
              className="text-coral-dark hover:bg-coral/8"
              onClick={() => void deleteMonth()}
              disabled={saving}
            >
              Delete month
            </Button>
          )}
          {!monthlyBudget && activeItemCount > 0 && (
            <Button onClick={() => void createMonth()} disabled={saving}>
              {saving ? "Creating..." : "Create this month"}
            </Button>
          )}
        </div>
      </div>
      {error && (
        <Card className="mb-5 border-coral/30 bg-coral/6">
          <p className="text-sm font-semibold text-coral-dark">{error}</p>
        </Card>
      )}
      {loading ? (
        <Card>
          <p className="text-sm text-muted">
            Loading {formatMonth(selectedMonth)}...
          </p>
        </Card>
      ) : !monthlyBudget ? (
        <Card className="py-12 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">
            No budget yet
          </p>
          <h2 className="mt-2 font-display text-2xl font-semibold">
            {activeItemCount === 0
              ? "Add budget items first"
              : `Create ${formatMonth(selectedMonth)}`}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">
            {activeItemCount === 0
              ? "Add active budget items from the Budget Items screen before creating a monthly budget."
              : "Start this month with your active budget items. Planned amounts from the previous month will be carried forward."}
          </p>
          <Button
            className="mt-5"
            onClick={() => activeItemCount > 0 && void createMonth()}
            variant={activeItemCount > 0 ? "primary" : "secondary"}
            disabled={saving}
          >
            {activeItemCount > 0
              ? saving
                ? "Creating..."
                : "Create this month"
              : "Go to Budget Items"}
          </Button>
        </Card>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-3">
            <Card>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">
                PLANNED EXPENSES
              </p>
              <p className="mt-3 font-display text-2xl font-semibold tracking-[-0.05em]">
                {formatCurrency(plannedExpenses)}
              </p>
            </Card>
            <Card>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">
                ACTUAL EXPENSES
              </p>
              <p className="mt-3 font-display text-2xl font-semibold tracking-[-0.05em]">
                {formatCurrency(actualExpenses)}
              </p>
            </Card>
            <Card tone="accent">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-ink/65">
                LEFT THIS MONTH
              </p>
              <p className="mt-3 font-display text-2xl font-semibold tracking-[-0.05em]">
                {formatCurrency(savingsIncrease)}
              </p>
            </Card>
          </section>
          <Card className="mt-6">
            <h2 className="mb-5 font-display text-2xl font-semibold tracking-[-0.04em]">
              MONTH TOTALS
            </h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-xs text-muted">Planned</p>
                <p className="mt-1 text-lg font-bold">
                  {formatCurrency(plannedSurplus)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted">Actual</p>
                <p className="mt-1 text-lg font-bold">
                  {formatCurrency(savingsIncrease)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted">Difference</p>
                <p
                  className={`mt-1 text-lg font-bold ${difference < 0 ? "text-coral-dark" : "text-mint-dark"}`}
                >
                  {formatCurrency(difference)}
                </p>
              </div>
            </div>
          </Card>
          <Card className="mt-6">
            <h2 className="mb-5 font-display text-2xl font-semibold tracking-[-0.04em]">
              INCOME
            </h2>
            {entries.length === 0 ? (
              <p className="text-sm text-muted">
                This month has no budget entries.
              </p>
            ) : (
              <div className="px-0">
                <OverviewGroup
                  title="Income · Debit orders"
                  entries={debitOrders.filter(
                    (entry) => getBudgetItem(entry)?.type === "income",
                  )}
                  month={selectedMonth}
                  onUpdate={updateEntry}
                />
                <OverviewGroup
                  title="Income · Manual payments"
                  entries={manualPayments.filter(
                    (entry) => getBudgetItem(entry)?.type === "income",
                  )}
                  month={selectedMonth}
                  onUpdate={updateEntry}
                />
              </div>
            )}
          </Card>
          <Card className="mt-6">
            <h2 className="mb-5 font-display text-2xl font-semibold tracking-[-0.04em]">
              EXPENSES
            </h2>
            {entries.length === 0 ? (
              <p className="text-sm text-muted">
                This month has no budget entries.
              </p>
            ) : (
              <div className="px-0">
                <OverviewGroup
                  title="Expenses · Debit orders"
                  entries={debitOrders.filter(
                    (entry) => getBudgetItem(entry)?.type === "expense",
                  )}
                  month={selectedMonth}
                  onUpdate={updateEntry}
                />
                <OverviewGroup
                  title="Manual Payments"
                  entries={manualPayments.filter(
                    (entry) => getBudgetItem(entry)?.type === "expense",
                  )}
                  month={selectedMonth}
                  onUpdate={updateEntry}
                />
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
