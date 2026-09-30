"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Person = "태환" | "선영";
type RecordType = "deposit" | "expense";

type ExpenseCategory =
  | "렌트비"
  | "장보기"
  | "외식"
  | "생활용품"
  | "교통"
  | "데이트"
  | "기타";

type BudgetRecord = {
  id: string;
  type: RecordType;
  date: string;
  amount: number;
  memo: string;
  person?: Person;
  category?: ExpenseCategory;
  recurringRuleId?: string;
  recurringOccurrenceDate?: string;
};

type FilterType = "전체" | "입금" | ExpenseCategory;
type ChartPeriod = "day" | "week" | "month" | "year";
type RecurringFrequency = "weekly" | "monthly";

type ChartDataPoint = {
  key: string;
  label: string;
  amount: number;
};

type CategoryBudgets = Record<ExpenseCategory, number>;

type RecurringExpenseRule = {
  id: string;
  memo: string;
  amount: number;
  person: Person;
  category: ExpenseCategory;
  frequency: RecurringFrequency;
  startDate: string;
  dayOfMonth?: number;
  dayOfWeek?: number;
  active: boolean;
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const expenseCategories: ExpenseCategory[] = [
  "렌트비",
  "장보기",
  "외식",
  "생활용품",
  "교통",
  "데이트",
  "기타",
];

const categoryColors: Record<ExpenseCategory, string> = {
  렌트비: "#fb7185",
  장보기: "#f472b6",
  외식: "#c084fc",
  생활용품: "#818cf8",
  교통: "#60a5fa",
  데이트: "#34d399",
  기타: "#fbbf24",
};

const filters: FilterType[] = ["전체", "입금", ...expenseCategories];

const STORAGE_KEY = "couple-budget-records-v2";
const BUDGET_KEY = "couple-budget-category-budgets-v1";
const RECURRING_KEY = "couple-budget-recurring-rules-v1";

const emptyCategoryBudgets: CategoryBudgets = {
  렌트비: 0,
  장보기: 0,
  외식: 0,
  생활용품: 0,
  교통: 0,
  데이트: 0,
  기타: 0,
};

function getToday() {
  return toDateKey(new Date());
}

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatMoney(amount: number) {
  return Math.round(amount).toLocaleString("ko-KR");
}

function formatDate(date: string) {
  if (!date) return "";
  const [year, month, day] = date.split("-");
  return `${year}.${month}.${day}`;
}

function formatMonth(monthKey: string) {
  const [year, month] = monthKey.split("-");
  return `${year}년 ${Number(month)}월`;
}

function parseDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getPreviousMonthKey(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(year, month - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function startOfWeek(date: Date) {
  const result = new Date(date);
  const day = result.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  result.setDate(result.getDate() + diff);
  result.setHours(0, 0, 0, 0);
  return result;
}

function getChartTitle(period: ChartPeriod) {
  if (period === "day") return "최근 7일";
  if (period === "week") return "최근 8주";
  if (period === "month") return "최근 12개월";
  return "최근 5년";
}

function buildExpenseChartData(
  records: BudgetRecord[],
  period: ChartPeriod
): ChartDataPoint[] {
  const expenses = records.filter((record) => record.type === "expense");
  const now = new Date();

  if (period === "day") {
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(now);
      date.setDate(now.getDate() - (6 - index));
      date.setHours(0, 0, 0, 0);
      const key = toDateKey(date);
      const amount = expenses
        .filter((record) => record.date === key)
        .reduce((sum, record) => sum + record.amount, 0);

      return {
        key,
        label: `${date.getMonth() + 1}/${date.getDate()}`,
        amount,
      };
    });
  }

  if (period === "week") {
    const currentWeek = startOfWeek(now);

    return Array.from({ length: 8 }, (_, index) => {
      const start = new Date(currentWeek);
      start.setDate(currentWeek.getDate() - (7 - index) * 7);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);

      const amount = expenses
        .filter((record) => {
          const date = parseDate(record.date);
          return date >= start && date <= end;
        })
        .reduce((sum, record) => sum + record.amount, 0);

      return {
        key: toDateKey(start),
        label: `${start.getMonth() + 1}/${start.getDate()}`,
        amount,
      };
    });
  }

  if (period === "month") {
    return Array.from({ length: 12 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (11 - index), 1);
      const year = date.getFullYear();
      const month = date.getMonth();
      const amount = expenses
        .filter((record) => {
          const recordDate = parseDate(record.date);
          return (
            recordDate.getFullYear() === year && recordDate.getMonth() === month
          );
        })
        .reduce((sum, record) => sum + record.amount, 0);

      return {
        key: `${year}-${String(month + 1).padStart(2, "0")}`,
        label: `${String(year).slice(2)}.${month + 1}`,
        amount,
      };
    });
  }

  return Array.from({ length: 5 }, (_, index) => {
    const year = now.getFullYear() - (4 - index);
    const amount = expenses
      .filter((record) => parseDate(record.date).getFullYear() === year)
      .reduce((sum, record) => sum + record.amount, 0);

    return {
      key: String(year),
      label: String(year),
      amount,
    };
  });
}

function escapeCsv(value: string | number) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function downloadBlob(content: BlobPart, type: string, filename: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function normalizeRecords(input: unknown): BudgetRecord[] {
  if (!Array.isArray(input)) return [];

  const result: BudgetRecord[] = [];

  input.forEach((item) => {
    const row = item as Partial<BudgetRecord>;
    const type: RecordType = row.type === "deposit" ? "deposit" : "expense";
    const amount = Number(row.amount) || 0;
    if (amount <= 0) return;

    result.push({
      id: row.id || crypto.randomUUID(),
      type,
      date: row.date || getToday(),
      amount,
      memo: row.memo || (type === "deposit" ? "입금" : "지출"),
      person: row.person,
      category: row.category,
      recurringRuleId: row.recurringRuleId,
      recurringOccurrenceDate: row.recurringOccurrenceDate,
    });
  });

  return result;
}

function getDueDates(rule: RecurringExpenseRule, until: Date) {
  const dates: string[] = [];
  const start = parseDate(rule.startDate);
  const end = new Date(until.getFullYear(), until.getMonth(), until.getDate());

  if (start > end) return dates;

  if (rule.frequency === "weekly") {
    const cursor = new Date(start);
    const targetDay = rule.dayOfWeek ?? start.getDay();
    const diff = (targetDay - cursor.getDay() + 7) % 7;
    cursor.setDate(cursor.getDate() + diff);

    while (cursor <= end) {
      dates.push(toDateKey(cursor));
      cursor.setDate(cursor.getDate() + 7);
    }
    return dates;
  }

  const day = Math.max(1, Math.min(31, rule.dayOfMonth ?? start.getDate()));
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);

  while (cursor <= end) {
    const lastDay = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const candidate = new Date(
      cursor.getFullYear(),
      cursor.getMonth(),
      Math.min(day, lastDay)
    );

    if (candidate >= start && candidate <= end) {
      dates.push(toDateKey(candidate));
    }
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return dates;
}

function applyRecurringRules(
  records: BudgetRecord[],
  rules: RecurringExpenseRule[]
): BudgetRecord[] {
  const existingKeys = new Set(
    records
      .filter((record) => record.recurringRuleId && record.recurringOccurrenceDate)
      .map(
        (record) =>
          `${record.recurringRuleId}:${record.recurringOccurrenceDate}`
      )
  );

  const additions: BudgetRecord[] = [];
  const today = new Date();

  rules
    .filter((rule) => rule.active)
    .forEach((rule) => {
      getDueDates(rule, today).forEach((date) => {
        const key = `${rule.id}:${date}`;
        if (existingKeys.has(key)) return;
        existingKeys.add(key);
        additions.push({
          id: crypto.randomUUID(),
          type: "expense",
          date,
          amount: rule.amount,
          memo: rule.memo || rule.category,
          person: rule.person,
          category: rule.category,
          recurringRuleId: rule.id,
          recurringOccurrenceDate: date,
        });
      });
    });

  return additions.length ? [...additions, ...records] : records;
}

export default function Home() {
  const [records, setRecords] = useState<BudgetRecord[]>([]);
  const [categoryBudgets, setCategoryBudgets] =
    useState<CategoryBudgets>(emptyCategoryBudgets);
  const [recurringRules, setRecurringRules] = useState<RecurringExpenseRule[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const [depositDate, setDepositDate] = useState(getToday());
  const [depositPerson, setDepositPerson] = useState<Person>("태환");
  const [depositAmount, setDepositAmount] = useState("");
  const [depositMemo, setDepositMemo] = useState("");

  const [expenseDate, setExpenseDate] = useState(getToday());
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseMemo, setExpenseMemo] = useState("");
  const [expensePerson, setExpensePerson] = useState<Person>("태환");
  const [expenseCategory, setExpenseCategory] =
    useState<ExpenseCategory>("장보기");

  const [filter, setFilter] = useState<FilterType>("전체");
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>("month");
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPerson, setSelectedPerson] = useState<"전체" | Person>("전체");
  const [onlySelectedMonth, setOnlySelectedMonth] = useState(false);

  const [recurringMemo, setRecurringMemo] = useState("");
  const [recurringAmount, setRecurringAmount] = useState("");
  const [recurringPerson, setRecurringPerson] = useState<Person>("태환");
  const [recurringCategory, setRecurringCategory] =
    useState<ExpenseCategory>("렌트비");
  const [recurringFrequency, setRecurringFrequency] =
    useState<RecurringFrequency>("monthly");
  const [recurringStartDate, setRecurringStartDate] = useState(getToday());

  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [hubImportNotice, setHubImportNotice] = useState("");
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let loadedRecords: BudgetRecord[] = [];
    let loadedBudgets = { ...emptyCategoryBudgets };
    let loadedRules: RecurringExpenseRule[] = [];

    try {
      const savedRecords = localStorage.getItem(STORAGE_KEY);
      if (savedRecords) {
        loadedRecords = normalizeRecords(JSON.parse(savedRecords));
      }
    } catch {
      loadedRecords = [];
    }

    try {
      const savedBudgets = localStorage.getItem(BUDGET_KEY);
      if (savedBudgets) {
        loadedBudgets = {
          ...emptyCategoryBudgets,
          ...(JSON.parse(savedBudgets) as Partial<CategoryBudgets>),
        };
      }
    } catch {
      loadedBudgets = { ...emptyCategoryBudgets };
    }

    try {
      const savedRules = localStorage.getItem(RECURRING_KEY);
      if (savedRules) {
        const parsed = JSON.parse(savedRules);
        if (Array.isArray(parsed)) loadedRules = parsed;
      }
    } catch {
      loadedRules = [];
    }

    let importedNotice = "";
    const params = new URLSearchParams(window.location.search);
    if (params.get("from") === "couple-hub") {
      const transferId = params.get("transfer_id") || "";
      const amount = Number(params.get("amount") || 0);
      const person = params.get("person") === "선영" ? "선영" : "태환";
      const date = /^\d{4}-\d{2}-\d{2}$/.test(params.get("date") || "")
        ? String(params.get("date"))
        : getToday();
      const memo = (params.get("memo") || "커플허브 데이트").slice(0, 200);
      const importedId = transferId ? `hub-${transferId}` : `hub-${crypto.randomUUID()}`;
      if (amount > 0 && !loadedRecords.some((record) => record.id === importedId)) {
        loadedRecords = [
          {
            id: importedId,
            type: "expense",
            date,
            amount,
            memo,
            person,
            category: "데이트",
          },
          ...loadedRecords,
        ];
        importedNotice = `커플허브에서 ${formatMoney(amount)}불 지출을 자동으로 추가했어 💕`;
      }
      window.history.replaceState({}, "", window.location.pathname);
    }

    const recordsWithRecurring = applyRecurringRules(loadedRecords, loadedRules);
    const timer = window.setTimeout(() => {
      setRecords(recordsWithRecurring);
      setCategoryBudgets(loadedBudgets);
      setRecurringRules(loadedRules);
      if (importedNotice) setHubImportNotice(importedNotice);
      setHydrated(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  }, [records, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(BUDGET_KEY, JSON.stringify(categoryBudgets));
  }, [categoryBudgets, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(RECURRING_KEY, JSON.stringify(recurringRules));
  }, [recurringRules, hydrated]);

  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const totalDeposit = useMemo(() => {
    return records
      .filter((record) => record.type === "deposit")
      .reduce((sum, record) => sum + record.amount, 0);
  }, [records]);

  const totalExpense = useMemo(() => {
    return records
      .filter((record) => record.type === "expense")
      .reduce((sum, record) => sum + record.amount, 0);
  }, [records]);

  const balance = totalDeposit - totalExpense;

  const chartData = useMemo(
    () => buildExpenseChartData(records, chartPeriod),
    [records, chartPeriod]
  );

  const chartMax = useMemo(
    () => Math.max(...chartData.map((item) => item.amount), 1),
    [chartData]
  );

  const chartTotal = useMemo(
    () => chartData.reduce((sum, item) => sum + item.amount, 0),
    [chartData]
  );

  const selectedMonthRecords = useMemo(
    () => records.filter((record) => record.date.startsWith(selectedMonth)),
    [records, selectedMonth]
  );

  const previousMonth = useMemo(
    () => getPreviousMonthKey(selectedMonth),
    [selectedMonth]
  );

  const previousMonthRecords = useMemo(
    () => records.filter((record) => record.date.startsWith(previousMonth)),
    [records, previousMonth]
  );

  const selectedMonthExpense = useMemo(
    () =>
      selectedMonthRecords
        .filter((record) => record.type === "expense")
        .reduce((sum, record) => sum + record.amount, 0),
    [selectedMonthRecords]
  );

  const previousMonthExpense = useMemo(
    () =>
      previousMonthRecords
        .filter((record) => record.type === "expense")
        .reduce((sum, record) => sum + record.amount, 0),
    [previousMonthRecords]
  );

  const monthDifference = selectedMonthExpense - previousMonthExpense;
  const monthDifferencePercent =
    previousMonthExpense > 0
      ? (monthDifference / previousMonthExpense) * 100
      : selectedMonthExpense > 0
        ? 100
        : 0;

  const categoryExpenseData = useMemo(
    () =>
      expenseCategories.map((category) => ({
        category,
        amount: selectedMonthRecords
          .filter(
            (record) =>
              record.type === "expense" && record.category === category
          )
          .reduce((sum, record) => sum + record.amount, 0),
      })),
    [selectedMonthRecords]
  );

  const pieBackground = useMemo(() => {
    const total = categoryExpenseData.reduce((sum, item) => sum + item.amount, 0);
    if (total <= 0) return "#fce7f3";

    let cursor = 0;
    const segments = categoryExpenseData
      .filter((item) => item.amount > 0)
      .map((item) => {
        const start = cursor;
        cursor += (item.amount / total) * 100;
        return `${categoryColors[item.category]} ${start}% ${cursor}%`;
      });

    return `conic-gradient(${segments.join(", ")})`;
  }, [categoryExpenseData]);

  const personExpenseData = useMemo(
    () =>
      (["태환", "선영"] as Person[]).map((person) => ({
        person,
        amount: selectedMonthRecords
          .filter(
            (record) => record.type === "expense" && record.person === person
          )
          .reduce((sum, record) => sum + record.amount, 0),
      })),
    [selectedMonthRecords]
  );

  const selectedMonthBudgetTotal = useMemo(
    () => Object.values(categoryBudgets).reduce((sum, amount) => sum + amount, 0),
    [categoryBudgets]
  );

  const filteredRecords = useMemo(() => {
    let sorted = [...records].sort((a, b) => {
      const dateCompare = b.date.localeCompare(a.date);
      if (dateCompare !== 0) return dateCompare;
      return b.id.localeCompare(a.id);
    });

    if (onlySelectedMonth) {
      sorted = sorted.filter((record) => record.date.startsWith(selectedMonth));
    }

    if (filter === "입금") {
      sorted = sorted.filter((record) => record.type === "deposit");
    } else if (filter !== "전체") {
      sorted = sorted.filter(
        (record) => record.type === "expense" && record.category === filter
      );
    }

    if (selectedPerson !== "전체") {
      sorted = sorted.filter((record) => record.person === selectedPerson);
    }

    const keyword = searchTerm.trim().toLowerCase();
    if (keyword) {
      sorted = sorted.filter((record) =>
        [
          record.memo,
          record.category,
          record.person,
          record.type === "deposit" ? "입금" : "지출",
          record.date,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(keyword))
      );
    }

    return sorted;
  }, [
    records,
    filter,
    searchTerm,
    selectedPerson,
    onlySelectedMonth,
    selectedMonth,
  ]);

  const addDeposit = () => {
    const amount = Number(depositAmount);

    if (!depositDate) {
      alert("입금 날짜를 선택해주세요.");
      return;
    }

    if (!amount || amount <= 0) {
      alert("입금 금액을 입력해주세요.");
      return;
    }

    const newRecord: BudgetRecord = {
      id: crypto.randomUUID(),
      type: "deposit",
      date: depositDate,
      amount,
      memo: depositMemo.trim() || "입금",
      person: depositPerson,
    };

    setRecords((prev) => [newRecord, ...prev]);
    setDepositAmount("");
    setDepositMemo("");
    setDepositDate(getToday());
    setDepositPerson("태환");
  };

  const addExpense = () => {
    const amount = Number(expenseAmount);

    if (!expenseDate) {
      alert("지출 날짜를 선택해주세요.");
      return;
    }

    if (!amount || amount <= 0) {
      alert("지출 금액을 입력해주세요.");
      return;
    }

    const newRecord: BudgetRecord = {
      id: crypto.randomUUID(),
      type: "expense",
      date: expenseDate,
      amount,
      memo: expenseMemo.trim() || expenseCategory,
      person: expensePerson,
      category: expenseCategory,
    };

    setRecords((prev) => [newRecord, ...prev]);
    setExpenseAmount("");
    setExpenseMemo("");
    setExpenseDate(getToday());
    setExpensePerson("태환");
    setExpenseCategory("장보기");
  };

  const addRecurringRule = () => {
    const amount = Number(recurringAmount);
    if (!amount || amount <= 0) {
      alert("고정지출 금액을 입력해주세요.");
      return;
    }
    if (!recurringStartDate) {
      alert("시작 날짜를 선택해주세요.");
      return;
    }

    const start = parseDate(recurringStartDate);
    const rule: RecurringExpenseRule = {
      id: crypto.randomUUID(),
      memo: recurringMemo.trim() || recurringCategory,
      amount,
      person: recurringPerson,
      category: recurringCategory,
      frequency: recurringFrequency,
      startDate: recurringStartDate,
      dayOfMonth: start.getDate(),
      dayOfWeek: start.getDay(),
      active: true,
    };

    setRecurringRules((prev) => [rule, ...prev]);
    setRecords((prev) => applyRecurringRules(prev, [rule]));
    setRecurringMemo("");
    setRecurringAmount("");
  };

  const toggleRecurringRule = (id: string) => {
    setRecurringRules((prev) => {
      const next = prev.map((rule) =>
        rule.id === id ? { ...rule, active: !rule.active } : rule
      );
      const activatedRule = next.find((rule) => rule.id === id && rule.active);
      if (activatedRule) {
        setRecords((current) => applyRecurringRules(current, [activatedRule]));
      }
      return next;
    });
  };

  const deleteRecurringRule = (id: string) => {
    if (!confirm("이 고정지출 규칙을 삭제할까요? 이미 생성된 지출 내역은 남아있어요.")) {
      return;
    }
    setRecurringRules((prev) => prev.filter((rule) => rule.id !== id));
  };

  const deleteRecord = (id: string) => {
    const ok = confirm("이 내역을 삭제할까요?");
    if (!ok) return;
    setRecords((prev) => prev.filter((record) => record.id !== id));
  };

  const clearAll = () => {
    const ok = confirm("모든 내역을 삭제할까요? 예산과 고정지출 설정은 남아있어요.");
    if (!ok) return;
    setRecords([]);
  };

  const exportCsv = () => {
    const rows = [
      ["날짜", "구분", "사람", "카테고리", "메모", "금액"],
      ...[...records]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((record) => [
          record.date,
          record.type === "deposit" ? "입금" : "지출",
          record.person || "",
          record.category || "",
          record.memo,
          record.amount,
        ]),
    ];

    const csv = `\uFEFF${rows
      .map((row) => row.map(escapeCsv).join(","))
      .join("\n")}`;
    downloadBlob(csv, "text/csv;charset=utf-8", `couple-budget-${getToday()}.csv`);
  };

  const exportBackup = () => {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      records,
      categoryBudgets,
      recurringRules,
    };
    downloadBlob(
      JSON.stringify(payload, null, 2),
      "application/json",
      `couple-budget-backup-${getToday()}.json`
    );
  };

  const importBackup = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as {
        records?: unknown;
        categoryBudgets?: Partial<CategoryBudgets>;
        recurringRules?: RecurringExpenseRule[];
      };

      const nextRecords = normalizeRecords(parsed.records);
      const nextBudgets = {
        ...emptyCategoryBudgets,
        ...(parsed.categoryBudgets || {}),
      };
      const nextRules = Array.isArray(parsed.recurringRules)
        ? parsed.recurringRules
        : [];

      if (!confirm("현재 데이터를 이 백업 파일 내용으로 바꿀까요?")) return;
      setRecords(applyRecurringRules(nextRecords, nextRules));
      setCategoryBudgets(nextBudgets);
      setRecurringRules(nextRules);
      alert("백업을 불러왔어요.");
    } catch {
      alert("백업 파일을 읽지 못했어요. JSON 백업 파일인지 확인해주세요.");
    }
  };

  const installApp = async () => {
    if (!installPrompt) {
      alert(
        "아이폰 Safari: 공유 버튼 → 홈 화면에 추가\n안드로이드 Chrome: 메뉴(⋮) → 홈 화면에 추가 또는 앱 설치"
      );
      return;
    }

    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-pink-100 via-rose-100 to-fuchsia-100 px-3 py-4 text-rose-950 sm:px-4 sm:py-6">
      <div className="mx-auto max-w-6xl">
        <section className="mb-5 rounded-[2rem] border-4 border-white bg-white/80 p-5 shadow-xl shadow-pink-200/60 sm:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center rounded-full bg-pink-200 px-4 py-1 text-sm font-bold text-pink-700">
                Couple Budget
              </div>
              <h1 className="text-3xl font-black tracking-tight text-pink-600 md:text-5xl">
                태환 & 선영 가계부
              </h1>
              <p className="mt-3 text-lg font-bold text-rose-500">
                절약! 저축! 화이팅!
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={installApp}
                className="rounded-full bg-pink-500 px-4 py-2 text-sm font-black text-white shadow-md"
              >
                📱 홈 화면에 추가
              </button>
              <button
                onClick={exportBackup}
                className="rounded-full bg-purple-100 px-4 py-2 text-sm font-black text-purple-600"
              >
                💾 전체 백업
              </button>
              <button
                onClick={exportCsv}
                className="rounded-full bg-emerald-100 px-4 py-2 text-sm font-black text-emerald-700"
              >
                📊 Excel용 CSV
              </button>
              <button
                onClick={() => importInputRef.current?.click()}
                className="rounded-full bg-sky-100 px-4 py-2 text-sm font-black text-sky-700"
              >
                📥 백업 불러오기
              </button>
              <input
                ref={importInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void importBackup(file);
                  event.target.value = "";
                }}
              />
            </div>
          </div>
        </section>

        {hubImportNotice && (
          <button
            type="button"
            onClick={() => setHubImportNotice("")}
            className="mb-5 w-full rounded-3xl border-2 border-emerald-200 bg-emerald-50 px-5 py-4 text-left font-black text-emerald-700 shadow-lg"
          >
            {hubImportNotice} <span className="float-right">×</span>
          </button>
        )}

        <section className="mb-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-[2rem] border-4 border-white bg-emerald-100 p-5 shadow-lg">
            <p className="text-sm font-bold text-emerald-600">총 입금</p>
            <p className="mt-2 text-3xl font-black text-emerald-700">
              {formatMoney(totalDeposit)} 불
            </p>
          </div>
          <div className="rounded-[2rem] border-4 border-white bg-rose-100 p-5 shadow-lg">
            <p className="text-sm font-bold text-rose-600">전체 지출</p>
            <p className="mt-2 text-3xl font-black text-rose-700">
              {formatMoney(totalExpense)} 불
            </p>
          </div>
          <div
            className={`rounded-[2rem] border-4 border-white p-5 shadow-lg ${
              balance >= 0 ? "bg-pink-200" : "bg-red-200"
            }`}
          >
            <p className="text-sm font-bold text-pink-700">현재 통장 잔액</p>
            <p
              className={`mt-2 text-3xl font-black ${
                balance >= 0 ? "text-pink-700" : "text-red-700"
              }`}
            >
              {formatMoney(balance)} 불
            </p>
          </div>
        </section>

        <section className="mb-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-[2rem] border-4 border-white bg-white/85 p-5 shadow-xl shadow-pink-200/50">
            <h2 className="mb-4 text-2xl font-black text-emerald-600">입금 추가</h2>
            <div className="space-y-3">
              <label className="block text-sm font-bold text-rose-500">
                날짜
                <input
                  type="date"
                  value={depositDate}
                  onChange={(event) => setDepositDate(event.target.value)}
                  className="mt-1 w-full rounded-2xl border-2 border-emerald-200 bg-white px-4 py-3 font-bold outline-none focus:border-emerald-400"
                />
              </label>

              <div>
                <p className="mb-1 text-sm font-bold text-rose-500">입금한 사람</p>
                <div className="grid grid-cols-2 gap-2">
                  {(["태환", "선영"] as Person[]).map((person) => (
                    <button
                      key={person}
                      onClick={() => setDepositPerson(person)}
                      className={`rounded-2xl px-4 py-3 font-black transition ${
                        depositPerson === person
                          ? "bg-emerald-500 text-white shadow-lg"
                          : "bg-emerald-100 text-emerald-600"
                      }`}
                    >
                      {person}
                    </button>
                  ))}
                </div>
              </div>

              <label className="block text-sm font-bold text-rose-500">
                입금 금액
                <input
                  type="number"
                  inputMode="decimal"
                  value={depositAmount}
                  onChange={(event) => setDepositAmount(event.target.value)}
                  placeholder="예: 1000"
                  className="mt-1 w-full rounded-2xl border-2 border-emerald-200 bg-white px-4 py-3 font-bold outline-none focus:border-emerald-400"
                />
              </label>

              <label className="block text-sm font-bold text-rose-500">
                메모
                <input
                  value={depositMemo}
                  onChange={(event) => setDepositMemo(event.target.value)}
                  placeholder="예: 월급, 저축, 통장 입금"
                  className="mt-1 w-full rounded-2xl border-2 border-emerald-200 bg-white px-4 py-3 font-bold outline-none focus:border-emerald-400"
                />
              </label>

              <button
                onClick={addDeposit}
                className="w-full rounded-2xl bg-emerald-500 px-5 py-3 text-lg font-black text-white shadow-lg transition hover:bg-emerald-600"
              >
                입금 추가하기
              </button>
            </div>
          </div>

          <div className="rounded-[2rem] border-4 border-white bg-white/85 p-5 shadow-xl shadow-pink-200/50">
            <h2 className="mb-4 text-2xl font-black text-pink-600">지출 추가</h2>
            <div className="space-y-3">
              <label className="block text-sm font-bold text-rose-500">
                날짜
                <input
                  type="date"
                  value={expenseDate}
                  onChange={(event) => setExpenseDate(event.target.value)}
                  className="mt-1 w-full rounded-2xl border-2 border-pink-200 bg-white px-4 py-3 font-bold outline-none focus:border-pink-400"
                />
              </label>

              <div>
                <p className="mb-1 text-sm font-bold text-rose-500">결제한 사람</p>
                <div className="grid grid-cols-2 gap-2">
                  {(["태환", "선영"] as Person[]).map((person) => (
                    <button
                      key={person}
                      onClick={() => setExpensePerson(person)}
                      className={`rounded-2xl px-4 py-3 font-black transition ${
                        expensePerson === person
                          ? "bg-pink-500 text-white shadow-lg"
                          : "bg-pink-100 text-pink-600"
                      }`}
                    >
                      {person}
                    </button>
                  ))}
                </div>
              </div>

              <label className="block text-sm font-bold text-rose-500">
                카테고리
                <select
                  value={expenseCategory}
                  onChange={(event) =>
                    setExpenseCategory(event.target.value as ExpenseCategory)
                  }
                  className="mt-1 w-full rounded-2xl border-2 border-pink-200 bg-white px-4 py-3 font-bold outline-none focus:border-pink-400"
                >
                  {expenseCategories.map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </select>
              </label>

              <label className="block text-sm font-bold text-rose-500">
                지출 금액
                <input
                  type="number"
                  inputMode="decimal"
                  value={expenseAmount}
                  onChange={(event) => setExpenseAmount(event.target.value)}
                  placeholder="예: 50"
                  className="mt-1 w-full rounded-2xl border-2 border-pink-200 bg-white px-4 py-3 font-bold outline-none focus:border-pink-400"
                />
              </label>

              <label className="block text-sm font-bold text-rose-500">
                메모
                <input
                  value={expenseMemo}
                  onChange={(event) => setExpenseMemo(event.target.value)}
                  placeholder="예: 마트 장보기"
                  className="mt-1 w-full rounded-2xl border-2 border-pink-200 bg-white px-4 py-3 font-bold outline-none focus:border-pink-400"
                />
              </label>

              <button
                onClick={addExpense}
                className="w-full rounded-2xl bg-pink-500 px-5 py-3 text-lg font-black text-white shadow-lg transition hover:bg-pink-600"
              >
                지출 추가하기
              </button>
            </div>
          </div>
        </section>

        <section className="mb-5 rounded-[2rem] border-4 border-white bg-white/85 p-5 shadow-xl shadow-pink-200/50">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-black text-rose-400">월별 분석</p>
              <h2 className="text-2xl font-black text-pink-600">{formatMonth(selectedMonth)}</h2>
            </div>
            <label className="text-sm font-black text-rose-500">
              보고 싶은 달
              <input
                type="month"
                value={selectedMonth}
                onChange={(event) => setSelectedMonth(event.target.value)}
                className="ml-2 rounded-xl border-2 border-pink-200 bg-white px-3 py-2 font-black"
              />
            </label>
          </div>

          <div className="mb-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-pink-50 p-4">
              <p className="text-xs font-black text-rose-400">이번 선택월 지출</p>
              <p className="mt-1 text-2xl font-black text-pink-600">{formatMoney(selectedMonthExpense)} 불</p>
            </div>
            <div className="rounded-2xl bg-purple-50 p-4">
              <p className="text-xs font-black text-purple-400">이전달 지출 ({formatMonth(previousMonth)})</p>
              <p className="mt-1 text-2xl font-black text-purple-600">{formatMoney(previousMonthExpense)} 불</p>
            </div>
            <div className={`rounded-2xl p-4 ${monthDifference <= 0 ? "bg-emerald-50" : "bg-rose-50"}`}>
              <p className="text-xs font-black text-rose-400">이전달 대비</p>
              <p className={`mt-1 text-2xl font-black ${monthDifference <= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                {monthDifference > 0 ? "+" : ""}{formatMoney(monthDifference)} 불
              </p>
              <p className="text-xs font-bold text-rose-400">{monthDifferencePercent > 0 ? "+" : ""}{monthDifferencePercent.toFixed(1)}%</p>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-[1.75rem] border-2 border-pink-100 bg-pink-50/70 p-4">
              <h3 className="mb-4 text-lg font-black text-pink-600">카테고리별 지출</h3>
              <div className="grid items-center gap-5 sm:grid-cols-[180px_1fr]">
                <div
                  className="mx-auto aspect-square w-40 rounded-full border-[14px] border-white shadow-inner"
                  style={{ background: pieBackground }}
                  aria-label="카테고리별 지출 원형 그래프"
                >
                  <div className="m-[28%] flex aspect-square items-center justify-center rounded-full bg-white text-center text-xs font-black text-pink-600 shadow-sm">
                    {formatMoney(selectedMonthExpense)}<br />불
                  </div>
                </div>
                <div className="space-y-2">
                  {categoryExpenseData.map((item) => (
                    <div key={item.category} className="flex items-center justify-between gap-2 text-sm font-bold">
                      <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: categoryColors[item.category] }} />
                        <span>{item.category}</span>
                      </div>
                      <span className="text-rose-500">{formatMoney(item.amount)} 불</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-[1.75rem] border-2 border-purple-100 bg-purple-50/70 p-4">
              <h3 className="mb-4 text-lg font-black text-purple-600">태환 / 선영 지출</h3>
              <div className="space-y-4">
                {personExpenseData.map((item) => {
                  const ratio = selectedMonthExpense > 0 ? (item.amount / selectedMonthExpense) * 100 : 0;
                  return (
                    <div key={item.person}>
                      <div className="mb-1 flex justify-between text-sm font-black">
                        <span>{item.person}</span>
                        <span>{formatMoney(item.amount)} 불 ({ratio.toFixed(0)}%)</span>
                      </div>
                      <div className="h-4 overflow-hidden rounded-full bg-white">
                        <div className="h-full rounded-full bg-gradient-to-r from-purple-400 to-pink-400" style={{ width: `${ratio}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <section className="mb-5 rounded-[2rem] border-4 border-white bg-white/85 p-5 shadow-xl shadow-pink-200/50">
          <div className="mb-4">
            <p className="text-sm font-black text-rose-400">월 예산</p>
            <div className="flex flex-wrap items-baseline gap-2">
              <h2 className="text-2xl font-black text-pink-600">카테고리별 예산 설정</h2>
              <span className="text-sm font-bold text-rose-400">총 예산 {formatMoney(selectedMonthBudgetTotal)} 불</span>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {expenseCategories.map((category) => {
              const spent = categoryExpenseData.find((item) => item.category === category)?.amount || 0;
              const budget = categoryBudgets[category];
              const percent = budget > 0 ? (spent / budget) * 100 : 0;
              const over = budget > 0 && spent > budget;

              return (
                <div key={category} className={`rounded-2xl border-2 p-4 ${over ? "border-red-200 bg-red-50" : "border-pink-100 bg-pink-50"}`}>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="font-black">{category}</span>
                    <span className={`text-xs font-black ${over ? "text-red-600" : "text-rose-400"}`}>
                      {formatMoney(spent)} / {formatMoney(budget)} 불
                    </span>
                  </div>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    value={budget || ""}
                    onChange={(event) =>
                      setCategoryBudgets((prev) => ({
                        ...prev,
                        [category]: Math.max(0, Number(event.target.value) || 0),
                      }))
                    }
                    placeholder={`${category} 예산`}
                    className="mb-3 w-full rounded-xl border-2 border-white bg-white px-3 py-2 text-sm font-bold outline-none focus:border-pink-300"
                  />
                  <div className="h-3 overflow-hidden rounded-full bg-white">
                    <div
                      className={`h-full rounded-full ${over ? "bg-red-500" : "bg-pink-400"}`}
                      style={{ width: `${Math.min(percent, 100)}%` }}
                    />
                  </div>
                  <p className={`mt-1 text-xs font-bold ${over ? "text-red-600" : "text-rose-400"}`}>
                    {budget <= 0
                      ? "예산을 입력해주세요"
                      : over
                        ? `예산 초과 ${formatMoney(spent - budget)} 불`
                        : `남은 예산 ${formatMoney(budget - spent)} 불`}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mb-5 rounded-[2rem] border-4 border-white bg-white/85 p-5 shadow-xl shadow-pink-200/50">
          <h2 className="mb-4 text-2xl font-black text-amber-600">고정지출 자동 입력</h2>
          <p className="mb-4 text-sm font-bold text-rose-400">
            렌트비처럼 반복되는 지출을 등록해두면 사이트를 열 때 날짜가 지난 항목을 자동으로 추가해요.
          </p>

          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            <input
              value={recurringMemo}
              onChange={(event) => setRecurringMemo(event.target.value)}
              placeholder="메모 예: 주간 렌트비"
              className="rounded-2xl border-2 border-amber-200 bg-white px-4 py-3 font-bold"
            />
            <input
              type="number"
              inputMode="decimal"
              value={recurringAmount}
              onChange={(event) => setRecurringAmount(event.target.value)}
              placeholder="금액"
              className="rounded-2xl border-2 border-amber-200 bg-white px-4 py-3 font-bold"
            />
            <select
              value={recurringCategory}
              onChange={(event) => setRecurringCategory(event.target.value as ExpenseCategory)}
              className="rounded-2xl border-2 border-amber-200 bg-white px-4 py-3 font-bold"
            >
              {expenseCategories.map((category) => <option key={category}>{category}</option>)}
            </select>
            <select
              value={recurringPerson}
              onChange={(event) => setRecurringPerson(event.target.value as Person)}
              className="rounded-2xl border-2 border-amber-200 bg-white px-4 py-3 font-bold"
            >
              <option>태환</option>
              <option>선영</option>
            </select>
            <select
              value={recurringFrequency}
              onChange={(event) => setRecurringFrequency(event.target.value as RecurringFrequency)}
              className="rounded-2xl border-2 border-amber-200 bg-white px-4 py-3 font-bold"
            >
              <option value="weekly">매주</option>
              <option value="monthly">매달</option>
            </select>
            <input
              type="date"
              value={recurringStartDate}
              onChange={(event) => setRecurringStartDate(event.target.value)}
              className="rounded-2xl border-2 border-amber-200 bg-white px-4 py-3 font-bold"
            />
          </div>
          <button
            onClick={addRecurringRule}
            className="mt-3 w-full rounded-2xl bg-amber-500 px-5 py-3 font-black text-white shadow-md"
          >
            고정지출 규칙 추가
          </button>

          {recurringRules.length > 0 && (
            <div className="mt-4 space-y-2">
              {recurringRules.map((rule) => (
                <div key={rule.id} className="flex flex-col gap-2 rounded-2xl bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-black text-amber-800">{rule.memo} · {formatMoney(rule.amount)} 불</p>
                    <p className="text-xs font-bold text-amber-600">
                      {rule.frequency === "weekly" ? "매주" : "매달"} · {rule.person} · {rule.category} · 시작 {formatDate(rule.startDate)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => toggleRecurringRule(rule.id)}
                      className={`rounded-full px-3 py-2 text-xs font-black ${rule.active ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}
                    >
                      {rule.active ? "사용중" : "일시정지"}
                    </button>
                    <button
                      onClick={() => deleteRecurringRule(rule.id)}
                      className="rounded-full bg-rose-100 px-3 py-2 text-xs font-black text-rose-600"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-[2rem] border-4 border-white bg-white/85 p-5 shadow-xl shadow-pink-200/50">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <h2 className="text-2xl font-black text-pink-600">내역</h2>
            <button
              onClick={clearAll}
              className="rounded-full bg-rose-100 px-4 py-2 text-sm font-black text-rose-600 transition hover:bg-rose-200"
            >
              전체 삭제
            </button>
          </div>

          <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="🔎 메모/카테고리 검색"
              className="rounded-2xl border-2 border-pink-100 bg-white px-4 py-3 font-bold outline-none focus:border-pink-300 sm:col-span-2"
            />
            <select
              value={selectedPerson}
              onChange={(event) => setSelectedPerson(event.target.value as "전체" | Person)}
              className="rounded-2xl border-2 border-pink-100 bg-white px-4 py-3 font-bold"
            >
              <option value="전체">사람 전체</option>
              <option value="태환">태환만</option>
              <option value="선영">선영만</option>
            </select>
            <button
              onClick={() => setOnlySelectedMonth((prev) => !prev)}
              className={`rounded-2xl px-4 py-3 font-black ${onlySelectedMonth ? "bg-pink-500 text-white" : "bg-pink-100 text-pink-600"}`}
            >
              {onlySelectedMonth ? `${formatMonth(selectedMonth)}만 보기` : "전체 기간 보기"}
            </button>
          </div>

          <div className="mb-5 flex flex-wrap gap-2">
            {filters.map((item) => (
              <button
                key={item}
                onClick={() => setFilter(item)}
                className={`rounded-full px-4 py-2 text-sm font-black transition ${
                  filter === item
                    ? "bg-pink-500 text-white shadow-md"
                    : "bg-pink-100 text-pink-600 hover:bg-pink-200"
                }`}
              >
                {item}
              </button>
            ))}
          </div>

          <div className="mb-6 rounded-[1.75rem] border-2 border-pink-100 bg-gradient-to-br from-white to-pink-50 p-4 md:p-5">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-black text-rose-400">지출 그래프</p>
                <div className="mt-1 flex items-baseline gap-2">
                  <p className="text-2xl font-black text-pink-600">{formatMoney(chartTotal)} 불</p>
                  <span className="text-xs font-bold text-rose-400">{getChartTitle(chartPeriod)} 총지출</span>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-1 rounded-2xl bg-pink-100 p-1">
                {([
                  ["day", "일"],
                  ["week", "주"],
                  ["month", "월"],
                  ["year", "년"],
                ] as [ChartPeriod, string][]).map(([period, label]) => (
                  <button
                    key={period}
                    onClick={() => setChartPeriod(period)}
                    className={`rounded-xl px-3 py-2 text-sm font-black transition ${
                      chartPeriod === period ? "bg-pink-500 text-white shadow-sm" : "text-pink-500 hover:bg-white/70"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto pb-1">
              <div
                className={`flex h-56 items-end gap-2 ${
                  chartPeriod === "month"
                    ? "min-w-[760px]"
                    : chartPeriod === "week"
                      ? "min-w-[560px]"
                      : "min-w-[430px]"
                }`}
              >
                {chartData.map((item) => {
                  const barHeight = item.amount === 0 ? 4 : Math.max(12, Math.round((item.amount / chartMax) * 150));
                  return (
                    <div key={item.key} className="flex min-w-0 flex-1 flex-col items-center justify-end">
                      <div className="mb-2 h-5 text-center text-[10px] font-black text-pink-600 sm:text-xs">
                        {item.amount > 0 ? formatMoney(item.amount) : ""}
                      </div>
                      <div className="flex h-[150px] w-full items-end justify-center">
                        <div
                          title={`${item.label}: ${formatMoney(item.amount)} 불`}
                          className={`w-[70%] max-w-12 rounded-t-xl transition-all ${
                            item.amount > 0 ? "bg-gradient-to-t from-pink-500 to-rose-300 shadow-sm" : "bg-pink-100"
                          }`}
                          style={{ height: `${barHeight}px` }}
                        />
                      </div>
                      <div className="mt-2 w-full border-t-2 border-pink-100 pt-2 text-center text-[10px] font-black text-rose-400 sm:text-xs">
                        {item.label}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <p className="mt-2 text-xs font-bold text-rose-300">일: 최근 7일 · 주: 최근 8주 · 월: 최근 12개월 · 년: 최근 5년</p>
          </div>

          {filteredRecords.length === 0 ? (
            <div className="rounded-[2rem] bg-pink-50 p-8 text-center font-bold text-pink-400">조건에 맞는 내역이 없어요.</div>
          ) : (
            <div className="space-y-3">
              {filteredRecords.map((record) => (
                <div
                  key={record.id}
                  className={`rounded-[1.5rem] border-2 p-4 shadow-sm ${
                    record.type === "deposit" ? "border-emerald-100 bg-emerald-50" : "border-pink-100 bg-pink-50"
                  }`}
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-3 py-1 text-xs font-black ${record.type === "deposit" ? "bg-emerald-200 text-emerald-700" : "bg-pink-200 text-pink-700"}`}>
                          {record.type === "deposit" ? "입금" : "지출"}
                        </span>
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-rose-500">{formatDate(record.date)}</span>
                        {record.type === "expense" && record.category && (
                          <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-pink-500">{record.category}</span>
                        )}
                        {record.person && (
                          <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-purple-500">
                            {record.type === "deposit" ? `${record.person} 입금` : `${record.person} 결제`}
                          </span>
                        )}
                        {record.recurringRuleId && (
                          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-700">자동</span>
                        )}
                      </div>
                      <p className="text-lg font-black text-rose-950">{record.memo}</p>
                    </div>

                    <div className="flex items-center justify-between gap-4 md:justify-end">
                      <p className={`text-2xl font-black ${record.type === "deposit" ? "text-emerald-600" : "text-pink-600"}`}>
                        {record.type === "deposit" ? "+" : "-"}{formatMoney(record.amount)} 불
                      </p>
                      <button
                        onClick={() => deleteRecord(record.id)}
                        className="rounded-full bg-white px-4 py-2 text-sm font-black text-rose-500 transition hover:bg-rose-100"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <p className="mt-4 px-2 text-center text-xs font-bold text-rose-400">
          현재 데이터는 이 브라우저/기기에 저장돼요. 다른 폰으로 옮길 때는 “전체 백업” 파일을 사용해주세요.
        </p>
      </div>
    </main>
  );
}
