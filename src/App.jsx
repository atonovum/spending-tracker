import { useEffect, useMemo, useRef, useState } from "react";
import { useMediaQuery } from "@mantine/hooks";
import {
  ActionIcon,
  Box,
  Button,
  Card,
  Center,
  Checkbox,
  Divider,
  Group,
  Menu,
  Modal,
  MultiSelect,
  NumberInput,
  Paper,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Tabs,
  Table,
  Text,
  TextInput,
  Textarea,
  Title,
  UnstyledButton,
} from "@mantine/core";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Plus,
  Search,
  Trash2,
  Wallet,
} from "lucide-react";
import { loadState, normalizeState, saveState } from "./lib/storage.js";
import { serializeWalletCsv, parseWalletCsv } from "./lib/csv.js";
import {
  addDays,
  bucketKeyForDate,
  buildOccurrences,
  buildPendingScheduledOccurrences,
  formatAxisTick,
  formatShortDate,
  fromDateInput,
  groupOccurrences,
  MAX_WALLETS,
  nextOccurrenceOnOrAfter,
  normalizeLabelIds,
  REPEAT_OPTIONS as REPEAT_OPTIONS_DATA,
  resolveFlowRange,
  resolveFullRange,
  roundedAxisMax,
  signedAmount,
  startOfDay,
  sumSigned,
  toDateInput,
  uid,
} from "./lib/finance.js";
import { aggregateCategoryBySubBucket, aggregateCategoryByLabel } from "./lib/categoryStats.js";
import { CategoryIcon, getCategoryIconComponent } from "./lib/categoryIcons.jsx";
import { I18nProvider, useI18n, useT, DEFAULT_LANGUAGE } from "./lib/i18n.jsx";
import { fetchRemoteState, pushRemoteState } from "./lib/cloudSync.js";
import { notifications } from "@mantine/notifications";
import Settings from "./settings/Settings.jsx";

const TAB_KEYS = ["ledger", "stats", "search", "settings"];

function groupByDate(occurrences) {
  const map = new Map();
  for (const item of occurrences) {
    const key = item.occurrenceDate || item.date;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
}

export function sortEntriesForDisplay(items) {
  return [...items].sort((a, b) => {
    const aDate = a.occurrenceDate || a.date || "";
    const bDate = b.occurrenceDate || b.date || "";
    if (aDate !== bDate) return aDate < bDate ? 1 : -1;
    return 0;
  });
}

export function filterEntriesByFacets(entries, filters) {
  const categoryIds = filters.categoryIds;
  const labelIds = filters.labelIds;
  return entries.filter((entry) => {
    const categoryMatch = !categoryIds || categoryIds.has(entry.categoryId);
    const labelMatch = !labelIds || normalizeLabelIds(entry).some((id) => labelIds.has(id));
    return categoryMatch && labelMatch;
  });
}

export function resolveFacetFilter(selectedIds, options) {
  if (selectedIds.length === options.length) return null;
  return new Set(selectedIds);
}

export function summarizeEntries(entries, categories) {
  return entries.reduce(
    (summary, entry) => {
      const signed = signedAmount(entry, categories);
      if (signed >= 0) return { ...summary, income: summary.income + signed };
      return { ...summary, expense: summary.expense + Math.abs(signed) };
    },
    { income: 0, expense: 0 }
  );
}

export function formatTransactionMoney(value, currency = "KRW") {
  const sign = value < 0 ? "-" : "";
  const resolvedCurrency = currency === "USD" ? "USD" : "KRW";
  const symbol = resolvedCurrency === "KRW" ? "￦" : "$";
  const abs = Math.round(Math.abs(value));
  const valueStr = abs.toLocaleString(resolvedCurrency === "KRW" ? "ko-KR" : "en-US");
  return `${sign}${symbol}${valueStr}`;
}

function visibleCountForMode(mode) {
  if (mode === "week") return 6;
  if (mode === "month") return 6;
  return 4;
}

// Chart tokens — mirror the CSS variables in index.css (SVG attributes cannot
// resolve var(), so the values live here as the single JS-side mirror).
const CHART = {
  primary: "#3182F6",
  primarySoft: "#E8F3FF",
  income: "#249C63",
  expense: "#F08A8A",
  grid: "#EEF1F4",
  baseline: "#E5E8EB",
  muted: "#8B95A1",
  ink: "#191F28",
  surface: "#FFFFFF",
};

// Bar with a rounded data-end (top) and a square baseline.
function roundedTopBarPath(x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h));
  return [
    `M ${x} ${y + h}`,
    `L ${x} ${y + rr}`,
    `Q ${x} ${y} ${x + rr} ${y}`,
    `L ${x + w - rr} ${y}`,
    `Q ${x + w} ${y} ${x + w} ${y + rr}`,
    `L ${x + w} ${y + h}`,
    "Z",
  ].join(" ");
}

function donutSlicePath(cx, cy, r, startAngle, endAngle) {
  const x1 = cx + r * Math.cos(startAngle);
  const y1 = cy + r * Math.sin(startAngle);
  const x2 = cx + r * Math.cos(endAngle);
  const y2 = cy + r * Math.sin(endAngle);
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
}

function LedgerChart({ mode, chartMode, page, selectedKey, onSelectBucket, onSelectBar }) {
  const t = useT();
  const width = 640;
  const height = 210;
  const padX = 42;
  const padTop = 14;
  const padBottom = 4;
  const labelArea = mode === "year" ? 22 : 32;
  const baseY = height - padBottom - labelArea;
  const graphH = baseY - padTop;
  const graphW = width - padX * 2;

  if (!page.length) {
    return <Center h={190} c="dimmed">{t("chart.empty")}</Center>;
  }

  if (chartMode === "balance") {
    const values = page.map((b) => b.cumulative);
    const minValue = Math.min(...values, 0);
    const maxValue = Math.max(...values, 0);
    const minTick = minValue < 0 ? -roundedAxisMax(Math.abs(minValue)) : 0;
    const maxTick = maxValue > 0 ? roundedAxisMax(maxValue) : 1;
    const tickRange = maxTick - minTick || 1;
    const step = page.length > 1 ? graphW / (page.length - 1) : 0;

    const points = page.map((bucket, index) => {
      const x = padX + index * step;
      const ratio = (bucket.cumulative - minTick) / tickRange;
      const y = baseY - ratio * graphH;
      return { ...bucket, x, y };
    });

    const zeroRatio = (0 - minTick) / tickRange;
    const zeroY = baseY - zeroRatio * graphH;
    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="block w-full select-none" style={{ height: "auto", maxHeight: 260 }}>
        <defs>
          <linearGradient id="balanceAreaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART.primary} stopOpacity="0.18" />
            <stop offset="100%" stopColor={CHART.primary} stopOpacity="0.01" />
          </linearGradient>
        </defs>
        {[minTick, (minTick + maxTick) / 2, maxTick].map((tick, index) => {
          const ratio = (tick - minTick) / tickRange;
          const y = baseY - ratio * graphH;
          return (
            <g key={index}>
              <line x1={padX} x2={width - padX} y1={y} y2={y} stroke={CHART.grid} strokeWidth="1" />
              <text x="8" y={y + 4} className="fill-muted text-[12px]">
                {formatAxisTick(tick)}
              </text>
            </g>
          );
        })}
        {points.length > 1 && (
          <polygon
            points={[
              `${points[0].x},${Math.min(zeroY, baseY)}`,
              ...points.map((p) => `${p.x},${p.y}`),
              `${points[points.length - 1].x},${Math.min(zeroY, baseY)}`,
            ].join(" ")}
            fill="url(#balanceAreaFill)"
            pointerEvents="none"
          />
        )}
        {points.length > 1 && (
          <polyline
            points={points.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke={CHART.primary}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {points.map((point) => (
          <g key={point.key}>
            {selectedKey === point.key && (
              <circle cx={point.x} cy={point.y} r={11} fill={CHART.primary} opacity={0.14} pointerEvents="none" />
            )}
            <circle
              cx={point.x}
              cy={point.y}
              r={selectedKey === point.key ? 6 : 4.5}
              fill={selectedKey === point.key ? CHART.primary : CHART.surface}
              stroke={selectedKey === point.key ? CHART.surface : CHART.primary}
              strokeWidth={selectedKey === point.key ? 2.5 : 2}
              onClick={() => onSelectBucket(point)}
              style={{ cursor: "pointer" }}
            />
            {/* enlarged hit target */}
            <circle
              cx={point.x}
              cy={point.y}
              r={14}
              fill="transparent"
              onClick={() => onSelectBucket(point)}
              style={{ cursor: "pointer" }}
            />
            {mode === "week" ? (
              <text x={point.x} y={height - 16} textAnchor="middle" className="fill-muted text-[10px]">
                <tspan x={point.x} dy="0">{formatShortDate(point.start)}</tspan>
                <tspan x={point.x} dy="12">{formatShortDate(point.end)}</tspan>
              </text>
            ) : (
              <text x={point.x} y={height - 10} textAnchor="middle" className="fill-muted text-[11px]">
                {point.label}
              </text>
            )}
          </g>
        ))}
        {mode !== "week" && points.map((point) => (
          <text key={`${point.key}-label`} x={point.x} y={height - 22} textAnchor="middle" className="fill-muted text-[10px]">
            {mode === "year" ? point.label : ""}
          </text>
        ))}
      </svg>
    );
  }

  const maxValue = Math.max(1, ...page.map((bucket) => Math.max(Math.abs(bucket.income), Math.abs(bucket.expense))));
  const maxTick = roundedAxisMax(maxValue);
  const midTick = Math.round(maxTick / 2);
  const slotW = graphW / page.length;
  const barW = Math.max(7, Math.min(22, slotW * 0.3));
  const barGap = 3;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="block w-full select-none" style={{ height: "auto", maxHeight: 260 }}>
      {[0, midTick, maxTick].map((tick, index) => {
        const ratio = tick / maxTick;
        const y = baseY - ratio * graphH;
        return (
          <g key={index}>
            <line
              x1={padX}
              x2={width - padX}
              y1={y}
              y2={y}
              stroke={tick === 0 ? CHART.baseline : CHART.grid}
              strokeWidth="1"
            />
            <text x="8" y={y + 4} className="fill-muted text-[12px]">
              {formatAxisTick(tick)}
            </text>
          </g>
        );
      })}
      {page.map((bucket, index) => {
        const slotX = padX + index * slotW;
        const centerX = slotX + slotW / 2;
        const incomeX = centerX - barW - barGap / 2;
        const expenseX = centerX + barGap / 2;
        const incH = Math.max((Math.abs(bucket.income) / maxTick) * graphH, 4);
        const expH = Math.max((Math.abs(bucket.expense) / maxTick) * graphH, 4);
        const dimmed = !!selectedKey && bucket.key !== selectedKey;
        return (
          <g key={bucket.key}>
            <rect
              x={slotX + 2}
              y={padTop}
              width={slotW - 4}
              height={graphH}
              rx={10}
              fill={selectedKey === bucket.key ? CHART.primary : "transparent"}
              opacity={selectedKey === bucket.key ? 0.07 : 1}
              onClick={() => onSelectBucket(bucket)}
              style={{ cursor: "pointer" }}
            />
            <path
              d={roundedTopBarPath(incomeX, baseY - incH, barW, incH, 4)}
              fill={CHART.income}
              opacity={dimmed ? 0.35 : 1}
              onClick={() => onSelectBar(bucket, "income")}
              style={{ cursor: "pointer" }}
            />
            <path
              d={roundedTopBarPath(expenseX, baseY - expH, barW, expH, 4)}
              fill={CHART.expense}
              opacity={dimmed ? 0.35 : 1}
              onClick={() => onSelectBar(bucket, "expense")}
              style={{ cursor: "pointer" }}
            />
            <text x={centerX} y={height - 10} textAnchor="middle" className="fill-muted text-[11px]">
              {bucket.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function CategoryStatsChart({ items, ledgerMode, periodStart, periodEnd, categoryId, color, categories }) {
  const t = useT();
  const [activeIndex, setActiveIndex] = useState(null);
  const series = useMemo(
    () => aggregateCategoryBySubBucket(items, ledgerMode, periodStart, periodEnd, categoryId, categories),
    [items, ledgerMode, periodStart, periodEnd, categoryId, categories],
  );
  useEffect(() => {
    setActiveIndex(null);
  }, [items, ledgerMode, periodStart, periodEnd, categoryId]);

  const width = 640;
  const height = 180;
  const padX = 36;
  const padTop = 14;
  const padBottom = 28;
  const baseY = height - padBottom;
  const graphH = baseY - padTop;
  const graphW = width - padX * 2;

  if (!series.length || series.every((s) => s.total === 0)) {
    return <Center h={140} c="dimmed">{t("chart.empty")}</Center>;
  }

  const maxValue = Math.max(1, ...series.map((s) => s.total));
  const maxTick = roundedAxisMax(maxValue);
  const midTick = Math.round(maxTick / 2);
  const slotW = graphW / Math.max(series.length, 1);
  const barW = Math.max(6, Math.min(24, slotW * 0.5));

  const active = activeIndex != null && series[activeIndex] ? series[activeIndex] : null;
  const activeCenterX = active != null ? padX + activeIndex * slotW + slotW / 2 : 0;
  const activeBarTop = active != null ? baseY - (active.total / maxTick) * graphH : 0;
  const tipText = active ? t("stats.subBucket.count", { count: active.count }) : "";
  const tipW = Math.max(44, tipText.length * 7 + 14);
  const tipH = 18;
  const tipY = Math.max(padTop + tipH, activeBarTop - 6);
  const tipX = Math.max(padX, Math.min(width - padX - tipW, activeCenterX - tipW / 2));

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="block w-full select-none"
      style={{ height: "auto", maxHeight: 200 }}
      onClick={() => setActiveIndex(null)}
    >
      {[0, midTick, maxTick].map((tick, index) => {
        const ratio = tick / maxTick;
        const y = baseY - ratio * graphH;
        return (
          <g key={index}>
            <line
              x1={padX}
              x2={width - padX}
              y1={y}
              y2={y}
              stroke={tick === 0 ? CHART.baseline : CHART.grid}
              strokeWidth="1"
            />
            <text x="6" y={y + 4} className="fill-muted text-[11px]">{formatAxisTick(tick)}</text>
          </g>
        );
      })}
      {series.map((bucket, index) => {
        const slotX = padX + index * slotW;
        const centerX = slotX + slotW / 2;
        const barX = centerX - barW / 2;
        const h = (bucket.total / maxTick) * graphH;
        const isActive = index === activeIndex;
        return (
          <g key={bucket.key || index}>
            <path
              d={roundedTopBarPath(barX, baseY - Math.max(h, 1), barW, Math.max(h, 1), 4)}
              fill={color}
              opacity={activeIndex == null || isActive ? 1 : 0.4}
            />
            <rect
              x={slotX}
              y={padTop}
              width={slotW}
              height={baseY - padTop}
              fill="transparent"
              style={{ cursor: "pointer" }}
              onClick={(e) => {
                e.stopPropagation();
                setActiveIndex((prev) => (prev === index ? null : index));
              }}
            />
            <text x={centerX} y={height - 8} textAnchor="middle" className="fill-muted text-[11px]">
              {bucket.label}
            </text>
          </g>
        );
      })}
      {active ? (
        <g pointerEvents="none">
          <rect x={tipX} y={tipY - tipH} width={tipW} height={tipH} rx={9} fill={CHART.ink} opacity={0.92} />
          <text x={tipX + tipW / 2} y={tipY - 5} textAnchor="middle" fill={CHART.surface} fontWeight="600" className="text-[11px]">
            {tipText}
          </text>
        </g>
      ) : null}
    </svg>
  );
}

function CategoryLabelTotals({ items, categoryId, getLabel, categories }) {
  const { t, formatMoney } = useI18n();
  const rows = useMemo(() => aggregateCategoryByLabel(items, categoryId, categories), [items, categoryId, categories]);
  if (!rows.length) return null;
  return (
    <Table withTableBorder={false} withColumnBorders={false} verticalSpacing={4}>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>{t("stats.column.label")}</Table.Th>
          <Table.Th className="text-center">{t("stats.column.count")}</Table.Th>
          <Table.Th className="text-right">{t("stats.column.amount")}</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {rows.map((row) => (
          <Table.Tr key={row.labelId ?? "no-label"}>
            <Table.Td>{row.labelId ? getLabel(row.labelId)?.name || row.labelId : t("stats.label.none")}</Table.Td>
            <Table.Td className="text-center">{row.count}</Table.Td>
            <Table.Td className="text-right">{formatMoney(row.amount)}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

function PieChart({ items, type }) {
  const { t, formatMoney } = useI18n();
  const isMobile = useMediaQuery("(max-width: 48em)");
  const width = 400;
  const height = 400;
  const cx = width / 2;
  const cy = height / 2;
  const radius = 110;
  const iconRadius = radius + 24;
  const percentRadius = iconRadius + 22;
  const iconSize = 24;
  const totals = new Map();
  for (const item of items) {
    if (item.category.type !== type) continue;
    totals.set(item.category.id, (totals.get(item.category.id) || 0) + Math.abs(signedAmount(item)));
  }
  const slices = [...totals.entries()].map(([id, value]) => ({
    category: items.find((item) => item.category.id === id)?.category,
    value,
  }));
  const sum = slices.reduce((acc, item) => acc + item.value, 0);
  if (!sum) return <Center h={260} c="dimmed">{t("chart.noData")}</Center>;

  let start = -Math.PI / 2;
  const entries = slices.map((slice, index) => {
    const angle = (slice.value / sum) * Math.PI * 2;
    const mid = start + angle / 2;
    const currentIconRadius = iconRadius + (index % 2 === 0 ? 12 : -10);
    const currentPercentRadius = percentRadius + (index % 2 === 0 ? 14 : -12);
    const result = { ...slice, start, end: start + angle, mid, currentIconRadius, currentPercentRadius };
    start += angle;
    return result;
  });

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      className="block overflow-visible select-none"
      style={{ width: "100%", height: "auto", maxWidth: 520 }}
    >
      {entries.map((slice) => (
        <path
          key={slice.category.id}
          d={donutSlicePath(cx, cy, radius, slice.start, slice.end)}
          fill={slice.category.color}
          stroke={CHART.surface}
          strokeWidth="2"
          strokeLinejoin="round"
        />
      ))}
      <circle cx={cx} cy={cy} r={radius * 0.58} fill={CHART.surface} />
      <circle cx={cx} cy={cy} r={radius * 0.58} fill="none" stroke={CHART.grid} strokeWidth="1" />
      <text
        x={cx}
        y={cy - 8}
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-muted"
        style={{ fontSize: isMobile ? 10 : 12 }}
      >
        {t(type === "income" ? "stats.totalIncome" : "stats.totalExpense")}
      </text>
      <text
        x={cx}
        y={cy + 12}
        textAnchor="middle"
        dominantBaseline="central"
        style={{ fill: CHART.ink, fontWeight: 800, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums", fontSize: isMobile ? 15 : 19 }}
      >
        {formatMoney(sum)}
      </text>
      {entries.map((slice) => {
        const Cmp = getCategoryIconComponent(slice.category.icon);
        const cosA = Math.cos(slice.mid);
        const sinA = Math.sin(slice.mid);
        const sx = cx + cosA * radius;
        const sy = cy + sinA * radius;
        const lineEndR = slice.currentIconRadius - iconSize / 2 - 2;
        const lx = cx + cosA * lineEndR;
        const ly = cy + sinA * lineEndR;
        const ix = cx + cosA * slice.currentIconRadius;
        const iy = cy + sinA * slice.currentIconRadius;
        const px = cx + cosA * slice.currentPercentRadius;
        const py = cy + sinA * slice.currentPercentRadius;
        const percent = (slice.value / sum) * 100;
        const percentText = percent >= 10 ? `${Math.round(percent)}%` : `${percent.toFixed(1)}%`;
        return (
          <g key={`${slice.category.id}-callout`}>
            <line x1={sx} y1={sy} x2={lx} y2={ly} stroke={slice.category.color} strokeWidth="1.2" strokeDasharray="2,2" />
            <circle cx={sx} cy={sy} r="2.5" fill={slice.category.color} />
            <g transform={`translate(${ix - iconSize / 2}, ${iy - iconSize / 2})`} style={{ color: slice.category.color }}>
              <Cmp size={iconSize} stroke={2} />
            </g>
            <text
              x={px}
              y={py}
              textAnchor="middle"
              dominantBaseline="central"
              style={{ fill: CHART.ink, fontWeight: 600, fontSize: isMobile ? 13 : 11 }}
            >
              {percentText}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function StatsCurveChart(props) {
  const { page, selectedKey, onSelectBucket, activeLegend, setActiveLegend } = props;
  const t = useT();
  const width = 640;
  const height = 210;
  const padX = 42;
  const padTop = 20;
  const padBottom = 10;
  const labelArea = 25;
  const baseY = height - padBottom - labelArea;
  const graphH = baseY - padTop;
  const graphW = width - padX * 2;

  if (!page.length) {
    return <Center h={190} c="dimmed">{t("chart.empty")}</Center>;
  }

  const maxValue = Math.max(1, ...page.map((bucket) => Math.max(bucket.income, bucket.expense)));
  const maxTick = roundedAxisMax(maxValue);
  const midTick = Math.round(maxTick / 2);
  const step = page.length > 1 ? graphW / (page.length - 1) : 0;

  const incomePoints = page.map((bucket, index) => {
    const x = padX + index * step;
    const ratio = bucket.income / maxTick;
    const y = baseY - ratio * graphH;
    return { ...bucket, x, y };
  });

  const expensePoints = page.map((bucket, index) => {
    const x = padX + index * step;
    const ratio = bucket.expense / maxTick;
    const y = baseY - ratio * graphH;
    return { ...bucket, x, y };
  });

  const getBezierPath = (points) => {
    if (points.length === 0) return "";
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const cp1x = p0.x + (p1.x - p0.x) / 3;
      const cp1y = p0.y;
      const cp2x = p0.x + 2 * (p1.x - p0.x) / 3;
      const cp2y = p1.y;
      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p1.x} ${p1.y}`;
    }
    return d;
  };

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="block w-full select-none" style={{ height: "auto", maxHeight: 260 }}>
      {[0, midTick, maxTick].map((tick, index) => {
        const ratio = tick / maxTick;
        const y = baseY - ratio * graphH;
        return (
          <g key={index}>
            <line x1={padX} x2={width - padX} y1={y} y2={y} stroke={CHART.grid} strokeWidth="1" />
            <text x="8" y={y + 4} className="fill-muted text-[12px]">
              {formatAxisTick(tick)}
            </text>
          </g>
        );
      })}

      {incomePoints.length > 1 && (
        <path
          d={getBezierPath(incomePoints)}
          fill="none"
          stroke={CHART.income}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      )}
      {expensePoints.length > 1 && (
        <path
          d={getBezierPath(expensePoints)}
          fill="none"
          stroke={CHART.expense}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      )}

      {incomePoints.map((point) => {
        const isSelected = selectedKey === point.key;
        const isActiveMetric = activeLegend === "income";
        return (
          <g key={`inc-${point.key}`}>
            <circle
              cx={point.x}
              cy={point.y}
              r={isSelected && isActiveMetric ? 8 : isSelected ? 6 : 4}
              fill={isSelected && isActiveMetric ? CHART.income : CHART.surface}
              stroke={CHART.income}
              strokeWidth={isSelected ? 3 : 2}
              onClick={() => {
                onSelectBucket(point);
                setActiveLegend("income");
              }}
              style={{ cursor: "pointer", transition: "all 150ms ease" }}
            />
          </g>
        );
      })}

      {expensePoints.map((point) => {
        const isSelected = selectedKey === point.key;
        const isActiveMetric = activeLegend === "expense";
        return (
          <g key={`exp-${point.key}`}>
            <circle
              cx={point.x}
              cy={point.y}
              r={isSelected && isActiveMetric ? 8 : isSelected ? 6 : 4}
              fill={isSelected && isActiveMetric ? CHART.expense : CHART.surface}
              stroke={CHART.expense}
              strokeWidth={isSelected ? 3 : 2}
              onClick={() => {
                onSelectBucket(point);
                setActiveLegend("expense");
              }}
              style={{ cursor: "pointer", transition: "all 150ms ease" }}
            />
            <text x={point.x} y={height - 10} textAnchor="middle" className="fill-muted text-[11px]">
              {point.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function EntryList({ items, onEdit }) {
  const { t, currency } = useI18n();
  const groups = groupByDate(items);
  if (!groups.length) return <Text c="dimmed" size="sm">{t("chart.noEntries")}</Text>;
  return (
    <Stack gap="sm">
      {groups.map(([date, rows]) => {
        const dailyTotal = rows.reduce((sum, item) => sum + signedAmount(item), 0);
        return (
        <Box key={date}>
          <Group justify="space-between" mb={6} px={4} wrap="nowrap">
            <Text fw={600} size="xs" className="text-muted">{date}</Text>
            <Text fw={600} size="xs" className="text-muted">{formatTransactionMoney(dailyTotal, currency)}</Text>
          </Group>
          <Stack gap={8}>
            {rows.map((item) => {
              const category = item.category;
              const itemLabels = item.labels || [];
              return (
                <Paper key={item.id + item.occurrenceDate} withBorder radius="card" p="sm" className="entry-row cursor-pointer" onClick={() => onEdit(item)}>
                  <Stack gap={4}>
                    <div className="grid grid-cols-[auto,1fr,auto] items-center gap-3">
                      <span
                        aria-hidden="true"
                        className="grid h-10 w-10 place-items-center rounded-chip"
                        style={{ background: `${category.color}1A`, color: category.color }}
                      >
                        <CategoryIcon category={category} size={18} />
                      </span>
                      <div className="min-w-0 text-left">
                        <Text fw={600} size="sm" className="truncate text-ink">{category.name}</Text>
                        {itemLabels.length > 0 && (
                          <Group gap={4} mt={2} wrap="nowrap" className="overflow-x-auto scrollbar-none">
                            {itemLabels.map((lbl) => (
                              <span
                                key={lbl.id}
                                className="inline-flex items-center rounded-chip bg-surface-soft px-2 py-0.5 text-[10px] font-medium text-ink-2"
                                style={{ boxShadow: "inset 0 0 0 1px var(--st-line)", whiteSpace: "nowrap" }}
                              >
                                {lbl.name}
                              </span>
                            ))}
                          </Group>
                        )}
                      </div>
                      <div className="text-right">
                        <Text
                          fw={700}
                          size="sm"
                          style={{ color: category.type === "income" ? "var(--st-income)" : "var(--st-expense)" }}
                        >
                          {formatTransactionMoney(signedAmount(item), currency)}
                        </Text>
                      </div>
                    </div>
                    {item.note && (
                      <div className="text-left text-xs font-medium text-muted pl-1">
                        {item.note}
                      </div>
                    )}
                  </Stack>
                </Paper>
              );
            })}
          </Stack>
        </Box>
        );
      })}
    </Stack>
  );
}

function BucketScroller({ buckets, selectedKey, onSelect, statsBucketLabel, active }) {
  const t = useT();
  const scrollerRef = useRef(null);
  const selectedRef = useRef(null);
  const selectedIndex = buckets.findIndex((bucket) => bucket.key === selectedKey);

  useEffect(() => {
    if (!active) return;
    if (selectedRef.current) {
      selectedRef.current.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
    }
  }, [selectedKey, buckets.length, active]);

  function shift(delta) {
    const next = buckets[selectedIndex + delta];
    if (next) onSelect(next.key);
  }

  return (
    <Stack gap="xs" mb="sm">
      <Group gap="xs" wrap="nowrap" w="100%">
        <ActionIcon variant="default" onClick={() => shift(-1)} disabled={selectedIndex <= 0}>
          <ArrowLeft size={16} />
        </ActionIcon>
        <Box
          ref={scrollerRef}
          className="bucket-scroller"
          style={{ flex: 1, minWidth: 0, overflowX: "auto", overflowY: "hidden" }}
        >
          <Group gap="xs" wrap="nowrap" px={4}>
            {buckets.map((bucket) => {
              const isSelected = bucket.key === selectedKey;
              return (
                <Button
                  key={bucket.key}
                  ref={isSelected ? selectedRef : null}
                  size="xs"
                  variant={isSelected ? "filled" : "light"}
                  color={isSelected ? "dark" : "gray"}
                  onClick={() => onSelect(bucket.key)}
                  style={{ flexShrink: 0 }}
                >
                  {bucket.label}
                </Button>
              );
            })}
          </Group>
        </Box>
        <ActionIcon variant="default" onClick={() => shift(1)} disabled={selectedIndex < 0 || selectedIndex >= buckets.length - 1}>
          <ArrowRight size={16} />
        </ActionIcon>
      </Group>
      <Text size="xs" c="dimmed" ta="center">
        {statsBucketLabel ? t("stats.selectedRange", { label: statsBucketLabel }) : t("stats.noRange")}
      </Text>
    </Stack>
  );
}

const PAGE_SIZE = 20;

function PaginatedEntryList({ items, onEdit, resetKey }) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef(null);
  const sortedItems = useMemo(() => sortEntriesForDisplay(items), [items]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [resetKey]);

  useEffect(() => {
    if (!sentinelRef.current) return;
    if (visibleCount >= sortedItems.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((count) => Math.min(count + PAGE_SIZE, sortedItems.length));
        }
      },
      { rootMargin: "120px" }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [visibleCount, sortedItems.length]);

  const visible = sortedItems.slice(0, visibleCount);
  const hasMore = sortedItems.length > visibleCount;

  return (
    <>
      <EntryList items={visible} onEdit={onEdit} />
      {hasMore ? <div ref={sentinelRef} className="h-6" aria-hidden="true" /> : null}
    </>
  );
}

function SearchFacetMenu({ label, options, selectedIds, onChange }) {
  const t = useT();
  const allIds = options.map((option) => option.id);
  const activeIds = selectedIds;
  const activeSet = new Set(activeIds);
  const allSelected = activeIds.length === allIds.length;
  const buttonPrefix = allSelected ? t("search.all") : activeIds.length;

  function toggleAll() {
    onChange(allSelected ? [] : allIds);
  }

  function toggleOne(id) {
    const next = new Set(activeIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  }

  return (
    <Menu closeOnItemClick={false} withinPortal position="bottom-start" shadow="md">
      <Menu.Target>
        <Button variant="default" color="gray" rightSection={<ChevronDown size={14} />} fullWidth>
          {buttonPrefix} {label}
        </Button>
      </Menu.Target>
      <Menu.Dropdown miw={220} mah={320} style={{ overflowY: "auto" }}>
        <Menu.Item onClick={toggleAll}>
          <Checkbox checked={allSelected} readOnly label={t("search.all")} />
        </Menu.Item>
        <Menu.Divider />
        {options.map((option) => (
          <Menu.Item key={option.id} onClick={() => toggleOne(option.id)}>
            <Checkbox checked={activeSet.has(option.id)} readOnly label={option.name} />
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}

function App({ state, setState }) {
  const { t, formatMoney, currency } = useI18n();
  const [activeTab, setActiveTab] = useState("ledger");
  const [ledgerMode, setLedgerMode] = useState("month");
  const [ledgerChartMode, setLedgerChartMode] = useState("flow");
  const [ledgerSelectedByMode, setLedgerSelectedByMode] = useState({});
  const [ledgerPageByMode, setLedgerPageByMode] = useState({});
  const [ledgerSelection, setLedgerSelection] = useState(null);
  const [statsSelectedByMode, setStatsSelectedByMode] = useState({});
  const [statsPageByMode, setStatsPageByMode] = useState({});
  const [statsLabelFilterId, setStatsLabelFilterId] = useState(null);
  const [statsCategoryType, setStatsCategoryType] = useState("expense");
  const [activeLegend, setActiveLegend] = useState("income");
  const [searchWalletId, setSearchWalletId] = useState(state.selectedWalletId);
  const [searchPeriod, setSearchPeriod] = useState("90d");
  const [searchText, setSearchText] = useState("");
  const [searchStartDate, setSearchStartDate] = useState("");
  const [searchEndDate, setSearchEndDate] = useState("");
  const [searchCategoryIds, setSearchCategoryIds] = useState([]);
  const [searchLabelIds, setSearchLabelIds] = useState([]);
  const [searchActive, setSearchActive] = useState(false);
  const [entryModalOpen, setEntryModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [deleteConfirmEntry, setDeleteConfirmEntry] = useState(null);
  const [statsCategoryModalId, setStatsCategoryModalId] = useState(null);
  const [statsCategoryModalOpen, setStatsCategoryModalOpen] = useState(false);
  const [pendingExpanded, setPendingExpanded] = useState(false);

  useEffect(() => {
    const result = saveState(state);
    if (!result.ok) {
      console.warn('Failed to save state to localStorage:', result.error);
    }
  }, [state]);

  const currentWallet = useMemo(
    () => state.wallets.find((wallet) => wallet.id === state.selectedWalletId) || state.wallets[0],
    [state]
  );

  const fullRange = useMemo(() => resolveFullRange(currentWallet.entries), [currentWallet]);
  const allOccurrences = useMemo(() => buildOccurrences(currentWallet.entries, fullRange), [currentWallet, fullRange]);
  const buckets = useMemo(() => groupOccurrences(allOccurrences, ledgerMode, state.categories), [allOccurrences, ledgerMode, state.categories]);

  const selectedBucket = useMemo(() => {
    const selectedKey = ledgerSelectedByMode[ledgerMode] || buckets[buckets.length - 1]?.key || null;
    return buckets.find((bucket) => bucket.key === selectedKey) || buckets[buckets.length - 1] || null;
  }, [ledgerSelectedByMode, ledgerMode, buckets]);

  const totalBalance = selectedBucket?.cumulative ?? 0;
  const periodFlow = useMemo(() => (selectedBucket ? sumSigned(selectedBucket.items, state.categories) : 0), [selectedBucket, state.categories]);
  const ledgerPeriodLabel = t(`modeLabel.${ledgerMode}`);

  const statsBucket = useMemo(() => {
    const selectedKey = statsSelectedByMode[ledgerMode] || selectedBucket?.key || null;
    return buckets.find((bucket) => bucket.key === selectedKey) || selectedBucket || null;
  }, [statsSelectedByMode, ledgerMode, selectedBucket, buckets]);

  const statsItems = statsBucket?.items || [];
  const statsFlow = useMemo(() => (statsBucket ? sumSigned(statsBucket.items, state.categories) : 0), [statsBucket, state.categories]);
  const statsTotalBalance = statsBucket?.cumulative ?? 0;

  const selectedLedgerPageStart = ledgerPageByMode[ledgerMode] ?? Math.max(0, buckets.length - visibleCountForMode(ledgerMode));
  const ledgerPage = buckets.slice(selectedLedgerPageStart, selectedLedgerPageStart + visibleCountForMode(ledgerMode));
  const ledgerValueText = ledgerSelection
    && ledgerSelection.mode === ledgerMode
    && ledgerSelection.chartMode === "flow"
    && ledgerChartMode === "flow"
      ? `${
          ledgerSelection.metric === "income"
            ? t("chart.income")
            : t("chart.expense")
        }: ${formatMoney(ledgerSelection.amount)}`
      : "";

  const pendingScheduled = useMemo(() => buildPendingScheduledOccurrences(currentWallet, selectedBucket ? { start: selectedBucket.start, end: selectedBucket.end } : resolveFlowRange(ledgerMode)), [currentWallet, selectedBucket, ledgerMode]);

  const isMobile = useMediaQuery("(max-width: 48em)");
  const statsVisibleCount = isMobile ? 6 : 10;
  const statsPageStart = statsPageByMode[ledgerMode] ?? Math.max(0, buckets.length - statsVisibleCount);
  const statsPage = buckets.slice(statsPageStart, statsPageStart + statsVisibleCount);

  const searchWallet = state.wallets.find((wallet) => wallet.id === searchWalletId) || currentWallet;
  const searchRange = useMemo(() => {
    if (searchPeriod === "7d") return resolveFlowRange("week");
    if (searchPeriod === "30d") return resolveFlowRange("month");
    if (searchPeriod === "90d") return { start: addDays(startOfDay(new Date()), -89), end: startOfDay(new Date()) };
    if (searchPeriod === "custom") {
      const start = fromDateInput(searchStartDate);
      const end = fromDateInput(searchEndDate);
      if (!start || !end) return null;
      return start <= end ? { start, end } : { start: end, end: start };
    }
    // Fallback for unknown values (defensive). Default option "90d" handled above.
    return { start: addDays(startOfDay(new Date()), -89), end: startOfDay(new Date()) };
  }, [searchPeriod, searchStartDate, searchEndDate]);

  const searchResults = useMemo(() => {
    if (!searchRange) return [];
    const base = buildOccurrences(searchWallet.entries, searchRange);
    const q = searchText.trim().toLowerCase();
    const categoryFilter = resolveFacetFilter(searchCategoryIds, state.categories);
    const labelFilter = resolveFacetFilter(searchLabelIds, state.labels);
    const hasFacetFilter = categoryFilter !== null || labelFilter !== null;
    if (!q && !hasFacetFilter) return [];
    const keywordMatches = q
      ? base.filter((item) => {
          return (item.note || "").toLowerCase().includes(q);
        })
      : base;
    return filterEntriesByFacets(keywordMatches, {
      categoryIds: categoryFilter,
      labelIds: labelFilter,
    });
  }, [searchWallet, searchRange, searchText, searchCategoryIds, searchLabelIds, state.categories, state.labels]);

  function persistState(next) {
    setState((prev) => {
      const value = typeof next === "function" ? next(prev) : next;
      const result = saveState(value);
      if (!result.ok) {
        console.warn('Failed to save state to localStorage:', result.error);
      }
      return value;
    });
  }

  function updateWallets(updater) {
    persistState((prev) => ({ ...prev, wallets: updater(prev.wallets), selectedWalletId: prev.selectedWalletId }));
  }

  function getCategory(id) {
    return state.categories.find((category) => category.id === id) || state.categories[0];
  }

  function getLabel(id) {
    return state.labels.find((label) => label.id === id) || state.labels[0];
  }

  function openNewEntry() {
    setEditingEntry(null);
    setEntryModalOpen(true);
  }

  function openEditEntry(entry) {
    setEditingEntry(entry);
    setEntryModalOpen(true);
  }

  function upsertEntry(payload) {
    updateWallets((wallets) =>
      wallets.map((wallet) => {
        if (wallet.id !== state.selectedWalletId) return wallet;
        const entries = editingEntry
          ? wallet.entries.map((entry) => (entry.id === editingEntry.id ? { ...editingEntry, ...payload } : entry))
          : [{ id: uid(), ...payload }, ...wallet.entries];
        return { ...wallet, entries };
      })
    );
  }

  function deleteEntry(entryId) {
    updateWallets((wallets) => wallets.map((wallet) => (wallet.id === state.selectedWalletId ? { ...wallet, entries: wallet.entries.filter((entry) => entry.id !== entryId) } : wallet)));
  }

  function stopRepeat(entryId) {
    const today = startOfDay(new Date());
    const yesterday = toDateInput(addDays(today, -1));
    const entry = currentWallet.entries.find((e) => e.id === entryId);
    if (entry) {
      upsertEntry({ ...entry, repeatEndDate: yesterday });
    }
  }

  function resolveEntryData(item) {
    return {
      ...item,
      category: getCategory(item.categoryId),
      labels: normalizeLabelIds(item).map((id) => getLabel(id)).filter(Boolean),
    };
  }

  function maybeShiftLedgerPage(bucket) {
    const visibleCount = visibleCountForMode(ledgerMode);
    const currentStart = ledgerPageByMode[ledgerMode] ?? Math.max(0, buckets.length - visibleCount);
    const idx = buckets.findIndex((entry) => entry.key === bucket.key);
    if (idx < 0) return;
    if (idx === currentStart && idx > 0) {
      setLedgerPageByMode((prev) => ({ ...prev, [ledgerMode]: Math.max(0, currentStart - 1) }));
    } else if (idx === currentStart + visibleCount - 1 && idx < buckets.length - 1) {
      setLedgerPageByMode((prev) => ({ ...prev, [ledgerMode]: Math.min(buckets.length - visibleCount, currentStart + 1) }));
    }
  }

  function handleLedgerBucketSelect(bucket) {
    setLedgerSelectedByMode((prev) => ({ ...prev, [ledgerMode]: bucket.key }));
    setStatsSelectedByMode((prev) => ({ ...prev, [ledgerMode]: bucket.key }));
    setLedgerSelection(null);
    maybeShiftLedgerPage(bucket);
  }

  function handleLedgerBarSelect(bucket, metric) {
    setLedgerSelectedByMode((prev) => ({ ...prev, [ledgerMode]: bucket.key }));
    setStatsSelectedByMode((prev) => ({ ...prev, [ledgerMode]: bucket.key }));
    const amount = metric === "income" ? bucket.income : -Math.abs(bucket.expense);
    setLedgerSelection({ chartMode: "flow", mode: ledgerMode, key: bucket.key, label: bucket.label, metric, amount });
    maybeShiftLedgerPage(bucket);
  }

  function handleLedgerPointSelect(point) {
    setLedgerSelectedByMode((prev) => ({ ...prev, [ledgerMode]: point.key }));
    setStatsSelectedByMode((prev) => ({ ...prev, [ledgerMode]: point.key }));
    setLedgerSelection({ chartMode: "balance", mode: ledgerMode, key: point.key, label: point.label, amount: point.cumulative });
  }

  function renderLedgerList() {
    if (selectedBucket) {
      return (
        <PaginatedEntryList
          items={selectedBucket.items.map(resolveEntryData)}
          onEdit={(item) => openEditEntry(item)}
          resetKey={`${ledgerMode}:${selectedBucket.key}`}
        />
      );
    }
    return (
      <PaginatedEntryList
        items={allOccurrences.map(resolveEntryData)}
        onEdit={(item) => openEditEntry(item)}
        resetKey="all"
      />
    );
  }

  function renderStatsPage() {
    const resolvedStatsItems = statsItems.map(resolveEntryData);
    const labelMap = new Map();
    for (const item of resolvedStatsItems) {
      const signed = signedAmount(item);
      for (const label of item.labels || []) {
        const cur = labelMap.get(label.id) || { label, income: 0, expense: 0 };
        if (signed >= 0) cur.income += signed;
        else cur.expense += Math.abs(signed);
        labelMap.set(label.id, cur);
      }
    }
    const categoryMap = new Map();
    for (const item of resolvedStatsItems.filter((entry) => entry.category.type === statsCategoryType)) {
      const category = item.category;
      const cur = categoryMap.get(category.id) || { category, count: 0, amount: 0 };
      cur.count += 1;
      cur.amount += Math.abs(signedAmount(item));
      categoryMap.set(category.id, cur);
    }
    const filteredByLabel = statsLabelFilterId
      ? resolvedStatsItems.filter((item) => (item.labels || []).some((label) => label.id === statsLabelFilterId))
      : resolvedStatsItems;
    const typedItems = filteredByLabel.filter((item) => item.category.type === statsCategoryType);

    return (
      <Stack gap="md">
        <SimpleGrid cols={2}>
          <Card withBorder radius="card" shadow="soft" padding="md">
            <Text fw={600} size="xs" c="dimmed" ta="center">{t("card.total")}</Text>
            <Text fw={800} fz={isMobile ? 17 : 21} lh={1.3} ta="center" style={{ letterSpacing: "-0.02em" }}>{formatMoney(statsTotalBalance)}</Text>
            <Text size="xs" c="dimmed" ta="center">{t("card.cashFlow")}</Text>
          </Card>
          <Card withBorder radius="card" shadow="soft" padding="md">
            <Text fw={600} size="xs" c="dimmed" ta="center">{ledgerPeriodLabel}</Text>
            <Text fw={800} fz={isMobile ? 17 : 21} lh={1.3} ta="center" style={{ letterSpacing: "-0.02em" }}>{formatMoney(statsFlow)}</Text>
            <Text size="xs" c="dimmed" ta="center">{t("card.cashFlow")}</Text>
          </Card>
        </SimpleGrid>

        <Card withBorder radius="card" shadow="soft" className="overflow-hidden">
          <Group justify="space-between" align="center" mb="xs">
            <Group gap="xs">
              <ActionIcon
                variant="default"
                size="sm"
                onClick={() => {
                  const maxPageStart = Math.max(0, buckets.length - statsVisibleCount);
                  const nextStart = Math.max(0, Math.min(maxPageStart, statsPageStart - 1));
                  setStatsPageByMode((prev) => ({ ...prev, [ledgerMode]: nextStart }));
                }}
                disabled={statsPageStart <= 0}
              >
                <ArrowLeft size={14} />
              </ActionIcon>
              <Text size="xs" fw={700} c="dimmed">
                {statsPage.length ? `${statsPage[0].label} ~ ${statsPage[statsPage.length - 1].label}` : ""}
              </Text>
              <ActionIcon
                variant="default"
                size="sm"
                onClick={() => {
                  const maxPageStart = Math.max(0, buckets.length - statsVisibleCount);
                  const nextStart = Math.max(0, Math.min(maxPageStart, statsPageStart + 1));
                  setStatsPageByMode((prev) => ({ ...prev, [ledgerMode]: nextStart }));
                }}
                disabled={statsPageStart >= Math.max(0, buckets.length - statsVisibleCount)}
              >
                <ArrowRight size={14} />
              </ActionIcon>
            </Group>

            <Group gap="sm" align="center">
              {statsBucket && (
                <Text size="sm" fw={700} style={{ color: activeLegend === "income" ? "var(--st-income-mark)" : "var(--st-expense)" }}>
                  {activeLegend === "income"
                    ? formatMoney(statsBucket.income)
                    : formatMoney(-statsBucket.expense)}
                </Text>
              )}
              <Group gap="xs">
                <UnstyledButton
                  onClick={() => setActiveLegend("income")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "2px 8px",
                    borderRadius: 999,
                    background: activeLegend === "income" ? "var(--st-income-soft)" : "transparent",
                    border: activeLegend === "income" ? "1px solid var(--st-income-mark)" : "1px solid transparent"
                  }}
                >
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "var(--st-income-mark)" }} />
                  <Text size="xs" fw={600} style={{ color: "var(--st-income-mark)" }}>{t("chart.income")}</Text>
                </UnstyledButton>
                <UnstyledButton
                  onClick={() => setActiveLegend("expense")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "2px 8px",
                    borderRadius: 999,
                    background: activeLegend === "expense" ? "var(--st-expense-soft)" : "transparent",
                    border: activeLegend === "expense" ? "1px solid var(--st-expense)" : "1px solid transparent"
                  }}
                >
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "var(--st-expense)" }} />
                  <Text size="xs" fw={600} style={{ color: "var(--st-expense)" }}>{t("chart.expense")}</Text>
                </UnstyledButton>
              </Group>
            </Group>
          </Group>

          <StatsCurveChart
            page={statsPage}
            selectedKey={statsBucket?.key || null}
            onSelectBucket={(bucket) => {
              setStatsSelectedByMode((prev) => ({ ...prev, [ledgerMode]: bucket.key }));
              setLedgerSelectedByMode((prev) => ({ ...prev, [ledgerMode]: bucket.key }));
              const maxPageStart = Math.max(0, buckets.length - statsVisibleCount);
              const idx = buckets.findIndex((b) => b.key === bucket.key);
              if (idx >= 0) {
                if (idx === statsPageStart && idx > 0) {
                  setStatsPageByMode((prev) => ({ ...prev, [ledgerMode]: Math.max(0, statsPageStart - 1) }));
                } else if (idx === statsPageStart + statsVisibleCount - 1 && idx < buckets.length - 1) {
                  setStatsPageByMode((prev) => ({ ...prev, [ledgerMode]: Math.min(maxPageStart, statsPageStart + 1) }));
                }
              }
            }}
            activeLegend={activeLegend}
            setActiveLegend={setActiveLegend}
          />
        </Card>

        <Card withBorder radius="card" shadow="soft">
          <BucketScroller
            buckets={buckets}
            selectedKey={statsBucket?.key || null}
            onSelect={(bucketKey) => {
              setStatsSelectedByMode((prev) => ({ ...prev, [ledgerMode]: bucketKey }));
              setLedgerSelectedByMode((prev) => ({ ...prev, [ledgerMode]: bucketKey }));
              setStatsLabelFilterId(null);
            }}
            statsBucketLabel={statsBucket?.label}
            active={activeTab === "stats"}
          />

          <Divider my="sm" />
          <Title order={4} mb="xs">{t("settings.labels")}</Title>
          <Table striped highlightOnHover verticalSpacing="xs" className="text-center">
            <Table.Thead>
              <Table.Tr>
                <Table.Th className="text-center">{t("stats.column.label")}</Table.Th>
                <Table.Th className="text-center">{t("stats.column.income")}</Table.Th>
                <Table.Th className="text-center">{t("stats.column.expense")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {[...labelMap.values()].sort((a, b) => (a.label.name > b.label.name ? 1 : -1)).map(({ label, income, expense }) => {
                const incomeActive = statsLabelFilterId === label.id && statsCategoryType === "income";
                const expenseActive = statsLabelFilterId === label.id && statsCategoryType === "expense";
                return (
                  <Table.Tr key={label.id}>
                    <Table.Td className="text-center">{label.name}</Table.Td>
                    <Table.Td className="text-center">
                      <Button
                        size="xs"
                        variant="transparent"
                        color="dark"
                        styles={{ label: { fontWeight: incomeActive ? 700 : 400, textDecoration: incomeActive ? "underline" : "none" } }}
                        onClick={() => { setStatsLabelFilterId(label.id); setStatsCategoryType("income"); }}
                      >
                        {formatMoney(income)}
                      </Button>
                    </Table.Td>
                    <Table.Td className="text-center">
                      <Button
                        size="xs"
                        variant="transparent"
                        color="dark"
                        styles={{ label: { fontWeight: expenseActive ? 700 : 400, textDecoration: expenseActive ? "underline" : "none" } }}
                        onClick={() => { setStatsLabelFilterId(label.id); setStatsCategoryType("expense"); }}
                      >
                        {formatMoney(expense)}
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>

          <Divider my="sm" />
          <Group justify="space-between" className="mb-2">
            <Title order={4}>{t("settings.categories")}</Title>
            <Group gap="xs">
              <Text size="sm" c="dimmed">{t("stats.filter", { value: statsLabelFilterId ? getLabel(statsLabelFilterId)?.name : t("stats.filterNone") })}</Text>
              <Button size="xs" variant="default" onClick={() => setStatsLabelFilterId(null)}>{t("stats.all")}</Button>
            </Group>
          </Group>
          <Group grow gap="xs" className="mb-3">
            <Button
              size="lg"
              variant={statsCategoryType === "income" ? "filled" : "light"}
              color={statsCategoryType === "income" ? "dark" : "gray"}
              onClick={() => setStatsCategoryType("income")}
            >
              {t("stats.totalIncome")}
            </Button>
            <Button
              size="lg"
              variant={statsCategoryType === "expense" ? "filled" : "light"}
              color={statsCategoryType === "expense" ? "dark" : "gray"}
              onClick={() => setStatsCategoryType("expense")}
            >
              {t("stats.totalExpense")}
            </Button>
          </Group>
          <Center>
            <PieChart items={typedItems} type={statsCategoryType} />
          </Center>

          <Table striped highlightOnHover verticalSpacing="xs" className="text-center">
            <Table.Thead>
              <Table.Tr>
                <Table.Th className="text-center">{t("stats.column.share")}</Table.Th>
                <Table.Th className="text-center">{t("stats.column.category")}</Table.Th>
                <Table.Th className="text-center">{t("stats.column.count")}</Table.Th>
                <Table.Th className="text-center">{t("stats.column.amount")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(() => {
                const totalCategoryAmount = [...categoryMap.values()].reduce((sum, item) => sum + item.amount, 0);
                return [...categoryMap.values()].sort((a, b) => b.amount - a.amount).map(({ category, count, amount }) => {
                  const percent = totalCategoryAmount > 0 ? Math.round((amount / totalCategoryAmount) * 100) : 0;
                  return (
                    <Table.Tr
                      key={category.id}
                      className="cursor-pointer"
                      onClick={() => { setStatsCategoryModalId(category.id); setStatsCategoryModalOpen(true); }}
                    >
                      <Table.Td className="text-center font-semibold text-muted text-xs">{percent}%</Table.Td>
                      <Table.Td className="text-center">
                        <Group gap={6} justify="center" wrap="nowrap">
                          <span style={{ color: category.color }} className="inline-flex items-center">
                            <CategoryIcon category={category} size={16} />
                          </span>
                          <span style={{ color: category.color, fontWeight: 600 }}>{category.name}</span>
                        </Group>
                      </Table.Td>
                      <Table.Td className="text-center">{count}</Table.Td>
                      <Table.Td className="text-center">{formatMoney(amount)}</Table.Td>
                    </Table.Tr>
                  );
                });
              })()}
            </Table.Tbody>
          </Table>
        </Card>
      </Stack>
    );
  }

  function renderSearchPage() {
    const items = searchResults.map((item) => ({ ...item, ...resolveEntryData(item) }));
    const searchSummary = summarizeEntries(searchResults, state.categories);
    const resetKey = `${searchWalletId}|${searchPeriod}|${searchStartDate}|${searchEndDate}|${searchText}|${searchCategoryIds.join(";")}|${searchLabelIds.join(";")}`;
    return (
      <Stack gap="sm">
        <div className="sticky top-0 z-20 -mx-4 border-b border-line bg-white/95 px-4 py-3 backdrop-blur">
          <Stack gap="sm">
            <SimpleGrid cols={2}>
              <SearchFacetMenu
                label={t("search.categoryFilter")}
                options={state.categories}
                selectedIds={searchCategoryIds}
                onChange={(ids) => { setSearchCategoryIds(ids); setSearchActive(true); }}
              />
              <SearchFacetMenu
                label={t("search.labelFilter")}
                options={state.labels}
                selectedIds={searchLabelIds}
                onChange={(ids) => { setSearchLabelIds(ids); setSearchActive(true); }}
              />
            </SimpleGrid>
            <TextInput
              value={searchText}
              onChange={(e) => { setSearchText(e.currentTarget.value); setSearchActive(true); }}
              placeholder={t("search.placeholder")}
              leftSection={<Search size={16} />}
            />
            <SimpleGrid cols={2}>
              <Select
                label={t("search.wallet")}
                data={state.wallets.map((wallet) => ({ value: wallet.id, label: wallet.name }))}
                value={searchWalletId}
                onChange={(value) => { setSearchWalletId(value || state.wallets[0]?.id || ""); setSearchActive(true); }}
              />
              <Select
                label={t("search.period")}
                data={[
                  { value: "7d", label: t("search.recent7") },
                  { value: "30d", label: t("search.recent30") },
                  { value: "90d", label: t("search.recent90") },
                  { value: "custom", label: t("search.custom") },
                ]}
                value={searchPeriod}
                onChange={(value) => { setSearchPeriod(value || "90d"); setSearchActive(true); }}
              />
            </SimpleGrid>
            {searchPeriod === "custom" && (
              <SimpleGrid cols={2}>
                <TextInput label={t("search.startDate")} type="date" value={searchStartDate} onChange={(e) => { setSearchStartDate(e.currentTarget.value); setSearchActive(true); }} />
                <TextInput label={t("search.endDate")} type="date" value={searchEndDate} onChange={(e) => { setSearchEndDate(e.currentTarget.value); setSearchActive(true); }} />
              </SimpleGrid>
            )}
            <SimpleGrid cols={2} mt="xs">
              <Card withBorder radius="card" shadow="soft" padding="xs">
                <Text fw={600} size="xs" c="dimmed" ta="center">{t("search.resultIncome")}</Text>
                <Text fw={800} fz={16} lh={1.3} ta="center" style={{ color: "var(--st-income)", letterSpacing: "-0.02em" }}>{formatMoney(searchSummary.income)}</Text>
              </Card>
              <Card withBorder radius="card" shadow="soft" padding="xs">
                <Text fw={600} size="xs" c="dimmed" ta="center">{t("search.resultExpense")}</Text>
                <Text fw={800} fz={16} lh={1.3} ta="center" style={{ color: "var(--st-expense)", letterSpacing: "-0.02em" }}>{formatMoney(-searchSummary.expense)}</Text>
              </Card>
            </SimpleGrid>
          </Stack>
        </div>
        {searchActive ? <PaginatedEntryList items={items} onEdit={(item) => openEditEntry(item)} resetKey={resetKey} /> : null}
      </Stack>
    );
  }

  const walletTotals = useMemo(() => {
    const categoryById = new Map(state.categories.map((category) => [category.id, category]));
    const map = new Map();
    for (const wallet of state.wallets) {
      const range = resolveFullRange(wallet.entries);
      const occurrences = buildOccurrences(wallet.entries, range);
      const total = occurrences.reduce((sum, item) => {
        const category = categoryById.get(item.categoryId);
        const amount = Math.abs(item.amount || 0);
        return sum + (category?.type === "income" ? amount : -amount);
      }, 0);
      map.set(wallet.id, total);
    }
    return map;
  }, [state.wallets, state.categories]);

  const scheduledEntriesForSettings = useMemo(() => {
    const today = startOfDay(new Date());
    const todayStr = toDateInput(today);
    const horizon = addDays(today, 365 * 5);
    return currentWallet.entries
      .filter((entry) => (entry.repeat && entry.repeat !== "none") || (entry.repeat === "none" && entry.date > todayStr))
      .map((entry) => {
        const next = nextOccurrenceOnOrAfter(entry, today, horizon);
        return { ...entry, nextDate: next ? toDateInput(next) : null };
      })
      .sort((a, b) => {
        if (a.nextDate && b.nextDate) return a.nextDate < b.nextDate ? -1 : 1;
        if (a.nextDate) return -1;
        if (b.nextDate) return 1;
        return a.date < b.date ? -1 : 1;
      });
  }, [currentWallet]);

  function selectWallet(walletId) {
    persistState((prev) => ({ ...prev, selectedWalletId: walletId }));
    setSearchWalletId(walletId);
  }

  function setLanguage(language) {
    persistState((prev) => ({ ...prev, language: language === "en" ? "en" : "ko" }));
  }

  function setCurrency(currency) {
    persistState((prev) => ({ ...prev, currency: currency === "USD" ? "USD" : "KRW" }));
  }

  function resetSearchUi() {
    setSearchWalletId(state.selectedWalletId);
    setSearchPeriod("90d");
    setSearchText("");
    setSearchStartDate("");
    setSearchEndDate("");
    setSearchCategoryIds([]);
    setSearchLabelIds([]);
    setSearchActive(false);
  }

  function addWallet() {
    persistState((prev) => {
      if (prev.wallets.length >= MAX_WALLETS) return prev;
      const used = new Set(prev.wallets.map((wallet) => wallet.name));
      let name = `지갑 ${prev.wallets.length + 1}`;
      let suffix = prev.wallets.length + 1;
      while (used.has(name)) {
        suffix += 1;
        name = `지갑 ${suffix}`;
      }
      const wallet = { id: uid(), name, entries: [] };
      return { ...prev, wallets: [...prev.wallets, wallet], selectedWalletId: wallet.id };
    });
  }

  function renameWallet(walletId, name) {
    persistState((prev) => ({
      ...prev,
      wallets: prev.wallets.map((wallet) => (wallet.id === walletId ? { ...wallet, name } : wallet)),
    }));
  }

  function deleteWallet(walletId) {
    persistState((prev) => {
      if (prev.wallets.length <= 1) return prev;
      const wallets = prev.wallets.filter((wallet) => wallet.id !== walletId);
      const selectedWalletId = prev.selectedWalletId === walletId ? wallets[0].id : prev.selectedWalletId;
      return { ...prev, wallets, selectedWalletId };
    });
    if (searchWalletId === walletId) {
      const fallback = state.wallets.find((wallet) => wallet.id !== walletId);
      if (fallback) setSearchWalletId(fallback.id);
    }
  }

  function exportWallet(walletId, format = "json") {
    const wallet = state.wallets.find((w) => w.id === walletId);
    if (!wallet) return;

    const safeName = wallet.name.replace(/[^\w\-가-힣]+/g, "_") || "wallet";
    const dateStr = new Date().toISOString().slice(0, 10);
    let blob, filename;

    if (format === "csv") {
      const csv = serializeWalletCsv(wallet, state.categories, state.labels);
      blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      filename = `${safeName}-${dateStr}.csv`;
    } else {
      const payload = {
        version: 3,
        exportedAt: new Date().toISOString(),
        wallet,
        categories: state.categories,
        labels: state.labels,
      };
      blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      filename = `${safeName}-${dateStr}.json`;
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function importWallet(parsed, targetWalletId = null) {
    if (!parsed || typeof parsed !== "object") return;
    const incoming = parsed.wallet || (Array.isArray(parsed.wallets) ? parsed.wallets[0] : null);
    if (!incoming || !Array.isArray(incoming.entries)) return;
    persistState((prev) => {
      const incomingCategories = Array.isArray(parsed.categories) ? parsed.categories : [];
      const incomingLabels = Array.isArray(parsed.labels) ? parsed.labels : [];
      const categoryIds = new Set(prev.categories.map((category) => category.id));
      const labelIds = new Set(prev.labels.map((label) => label.id));
      const mergedCategories = [
        ...prev.categories,
        ...incomingCategories.filter((category) => category && category.id && !categoryIds.has(category.id)),
      ];
      const mergedLabels = [
        ...prev.labels,
        ...incomingLabels.filter((label) => label && label.id && !labelIds.has(label.id)),
      ];
      const normalizeEntry = (entry, existingEntryIds) => ({
        id: existingEntryIds && existingEntryIds.has(entry.id) ? uid() : entry.id || uid(),
        date: entry.date || new Date().toISOString().slice(0, 10),
        amount: Number(entry.amount || 0),
        categoryId: entry.categoryId || prev.categories[0]?.id || "",
        labelIds: normalizeLabelIds(entry),
        note: entry.note || "",
        repeat: entry.repeat || "none",
        repeatEndDate: entry.repeatEndDate || "",
      });

      if (targetWalletId) {
        const target = prev.wallets.find((wallet) => wallet.id === targetWalletId);
        if (!target) return prev;
        const existingEntryIds = new Set(target.entries.map((entry) => entry.id));
        const merged = incoming.entries.map((entry) => normalizeEntry(entry, existingEntryIds));
        return {
          ...prev,
          wallets: prev.wallets.map((wallet) =>
            wallet.id === targetWalletId ? { ...wallet, entries: [...wallet.entries, ...merged] } : wallet
          ),
          categories: mergedCategories,
          labels: mergedLabels,
        };
      }

      if (prev.wallets.length >= MAX_WALLETS) return prev;
      const existingIds = new Set(prev.wallets.map((wallet) => wallet.id));
      const existingNames = new Set(prev.wallets.map((wallet) => wallet.name));
      let name = incoming.name || "가져온 지갑";
      let attempt = 1;
      while (existingNames.has(name)) {
        attempt += 1;
        name = `${incoming.name || "가져온 지갑"} (${attempt})`;
      }
      const wallet = {
        id: existingIds.has(incoming.id) ? uid() : incoming.id || uid(),
        name,
        entries: incoming.entries.map((entry) => normalizeEntry(entry, null)),
      };
      return {
        ...prev,
        wallets: [...prev.wallets, wallet],
        selectedWalletId: wallet.id,
        categories: mergedCategories,
        labels: mergedLabels,
      };
    });
  }

  function saveCategory(payload) {
    persistState((prev) => {
      if (payload.id) {
        return {
          ...prev,
          categories: prev.categories.map((category) =>
            category.id === payload.id ? { ...category, ...payload } : category
          ),
        };
      }
      return {
        ...prev,
        categories: [...prev.categories, { ...payload, id: uid() }],
      };
    });
  }

  function deleteCategory(categoryId) {
    persistState((prev) => ({
      ...prev,
      categories: prev.categories.filter((category) => category.id !== categoryId),
      wallets: prev.wallets.map((wallet) => ({
        ...wallet,
        entries: wallet.entries.filter((entry) => entry.categoryId !== categoryId),
      })),
    }));
  }

  function mergeCategories(sourceIds, targetId) {
    if (!sourceIds.length || sourceIds.includes(targetId)) return;
    persistState((prev) => ({
      ...prev,
      categories: prev.categories.filter((category) => !sourceIds.includes(category.id)),
      wallets: prev.wallets.map((wallet) => ({
        ...wallet,
        entries: wallet.entries.map((entry) =>
          sourceIds.includes(entry.categoryId) ? { ...entry, categoryId: targetId } : entry
        ),
      })),
    }));
  }

  function saveLabel(payload) {
    persistState((prev) => {
      if (payload.id) {
        return {
          ...prev,
          labels: prev.labels.map((label) => (label.id === payload.id ? { ...label, ...payload } : label)),
        };
      }
      return {
        ...prev,
        labels: [...prev.labels, { ...payload, id: uid() }],
      };
    });
  }

  function deleteLabel(labelId) {
    persistState((prev) => ({
      ...prev,
      labels: prev.labels.filter((label) => label.id !== labelId),
      wallets: prev.wallets.map((wallet) => ({
        ...wallet,
        entries: wallet.entries.map((entry) => ({
          ...entry,
          labelIds: normalizeLabelIds(entry).filter((id) => id !== labelId),
        })),
      })),
    }));
  }

  return (
    <div className="min-h-screen pb-24">
      {(activeTab === "ledger" || activeTab === "stats") && (
        <div className="sticky top-0 z-20 border-b border-line bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
            <Select
              className="w-52"
              leftSection={<Wallet size={16} />}
              data={state.wallets.map((wallet) => ({ value: wallet.id, label: wallet.name }))}
              value={state.selectedWalletId}
              withCheckIcon={false}
              styles={{
                option: {
                  "&[data-checked]": {
                    backgroundColor: "var(--mantine-color-gray-1)",
                    color: "var(--mantine-color-black)",
                    fontWeight: 500
                  },
                  "&[data-checked][data-hovered]": {
                    backgroundColor: "var(--mantine-color-gray-2)"
                  }
                }
              }}
              onChange={(value) => {
                if (!value) return;
                setState((prev) => ({ ...prev, selectedWalletId: value }));
                setSearchWalletId(value);
              }}
            />
            <Select
              className="w-40"
              data={[
                { value: "week", label: t("mode.week") },
                { value: "month", label: t("mode.month") },
                { value: "year", label: t("mode.year") },
              ]}
              value={ledgerMode}
              withCheckIcon={false}
              styles={{
                option: {
                  "&[data-checked]": {
                    backgroundColor: "var(--mantine-color-gray-1)",
                    color: "var(--mantine-color-black)",
                    fontWeight: 500
                  },
                  "&[data-checked][data-hovered]": {
                    backgroundColor: "var(--mantine-color-gray-2)"
                  }
                }
              }}
              onChange={(value) => setLedgerMode(value || "month")}
            />
          </div>
        </div>
      )}

      <main className="mx-auto max-w-7xl px-4 py-4">
        <Tabs
          value={activeTab}
          onChange={(value) => {
            setActiveTab(value);
            if (value !== "stats") setStatsLabelFilterId(null);
            if (value !== "search") {
              resetSearchUi();
            }
            if (value === "ledger") {
              const visibleCount = visibleCountForMode(ledgerMode);
              const selectedKey = ledgerSelectedByMode[ledgerMode];
              const idx = buckets.findIndex((bucket) => bucket.key === selectedKey);
              if (idx >= 0) {
                const target = Math.max(0, Math.min(buckets.length - visibleCount, idx - 1));
                setLedgerPageByMode((prev) => ({ ...prev, [ledgerMode]: target }));
              }
            }
          }}
        >
          <Tabs.Panel value="ledger" pt="md">
            <Stack gap="md">
              <SimpleGrid cols={2}>
                <Card
                  withBorder
                  radius="card"
                  shadow="soft"
                  className={`cursor-pointer transition ${ledgerChartMode === "balance" ? "ring-2 ring-accent" : "hover:shadow-md"}`}
                  role="button"
                  tabIndex={0}
                  aria-pressed={ledgerChartMode === "balance"}
                  onClick={() => setLedgerChartMode("balance")}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setLedgerChartMode("balance"); } }}
                >
                  <Text fw={600} size="xs" c="dimmed" ta="center">{t("card.total")}</Text>
                  <Text fw={800} fz={isMobile ? 17 : 21} lh={1.3} ta="center" style={{ letterSpacing: "-0.02em" }}>{formatMoney(totalBalance)}</Text>
                  <Text size="xs" c="dimmed" ta="center">{t("card.cashFlow")}</Text>
                </Card>
                <Card
                  withBorder
                  radius="card"
                  shadow="soft"
                  className={`cursor-pointer transition ${ledgerChartMode === "flow" ? "ring-2 ring-accent" : "hover:shadow-md"}`}
                  role="button"
                  tabIndex={0}
                  aria-pressed={ledgerChartMode === "flow"}
                  onClick={() => setLedgerChartMode("flow")}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setLedgerChartMode("flow"); } }}
                >
                  <Text fw={600} size="xs" c="dimmed" ta="center">{ledgerPeriodLabel}</Text>
                  <Text fw={800} fz={isMobile ? 17 : 21} lh={1.3} ta="center" style={{ letterSpacing: "-0.02em" }}>{formatMoney(periodFlow)}</Text>
                  <Text size="xs" c="dimmed" ta="center">{t("card.cashFlow")}</Text>
                </Card>
              </SimpleGrid>

              <Card withBorder radius="card" shadow="soft" className="overflow-hidden">
                <Group justify="space-between" align="flex-start" mb="xs">
                  <Group gap="md">
                    {ledgerChartMode === "flow" ? (
                      <>
                        <Group gap={6} wrap="nowrap">
                          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "var(--st-income-mark)" }} />
                          <Text size="sm" fw={500} c="var(--st-ink-2)">{t("chart.income")}</Text>
                        </Group>
                        <Group gap={6} wrap="nowrap">
                          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "var(--st-expense)" }} />
                          <Text size="sm" fw={500} c="var(--st-ink-2)">{t("chart.expense")}</Text>
                        </Group>
                      </>
                    ) : (
                      <Group gap={6} wrap="nowrap">
                        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "var(--st-primary)" }} />
                        <Text size="sm" fw={500} c="var(--st-ink-2)">{t("chart.cashFlow")}</Text>
                      </Group>
                    )}
                  </Group>
                </Group>
                <Group justify="space-between" align="center" wrap="nowrap" className="min-h-5">
                  <Text size="sm" c="dimmed" className="truncate">{ledgerPage.length ? `${ledgerPage[0].label} ~ ${ledgerPage[ledgerPage.length - 1].label}` : t("chart.empty")}</Text>
                  <Text size="sm" c="dimmed" style={{ flexShrink: 0 }}>{ledgerValueText}</Text>
                </Group>
                <LedgerChart
                  mode={ledgerMode}
                  chartMode={ledgerChartMode}
                  page={ledgerPage}
                  selectedKey={selectedBucket?.key || null}
                  onSelectBucket={handleLedgerBucketSelect}
                  onSelectBar={handleLedgerBarSelect}
                />
              </Card>

              {pendingScheduled.length > 0 && (() => {
                const resolvedPending = pendingScheduled.map(resolveEntryData);
                const pendingTotal = resolvedPending.reduce((sum, item) => sum + signedAmount(item), 0);
                const pendingGroups = (() => {
                  const map = new Map();
                  for (const item of resolvedPending) {
                    const key = item.occurrenceDate;
                    if (!map.has(key)) map.set(key, []);
                    map.get(key).push(item);
                  }
                  return [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
                })();
                return (
                  <Paper
                    withBorder
                    radius="card"
                    p="sm"
                    className="cursor-pointer"
                    style={{ backgroundColor: 'var(--st-surface-soft)' }}
                    onClick={() => setPendingExpanded((value) => !value)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setPendingExpanded((value) => !value);
                      }
                    }}
                  >
                    <Group justify="space-between" wrap="nowrap">
                      <Group gap={6} wrap="nowrap">
                        <Clock size={16} className="text-muted" />
                        <Text fw={700} size="sm">{t("ledger.pending", { count: pendingScheduled.length })}</Text>
                      </Group>
                      <Group gap="xs" wrap="nowrap">
                        <Text size="sm" c="dimmed">{formatTransactionMoney(pendingTotal, currency)}</Text>
                        {pendingExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </Group>
                    </Group>
                    {pendingExpanded && (
                      <Stack gap="sm" mt="sm" onClick={(event) => event.stopPropagation()}>
                        {pendingGroups.map(([date, items]) => {
                          const dailyTotal = items.reduce((sum, item) => sum + signedAmount(item), 0);
                          return (
                            <Box key={date}>
                              <Group justify="space-between" mb={6} wrap="nowrap">
                                <Text fw={700} size="sm" className="text-muted">{date}</Text>
                                <Text fw={700} size="sm" className="text-muted">{formatTransactionMoney(dailyTotal, currency)}</Text>
                              </Group>
                              <Stack gap="xs">
                                {items.map((item) => {
                                  const category = item.category;
                                  const itemLabels = item.labels || [];
                                  return (
                                    <Paper
                                      key={item.id + item.occurrenceDate}
                                      withBorder
                                      radius="card"
                                      p="sm"
                                      style={{ opacity: 0.78, backgroundColor: 'var(--st-surface)' }}
                                    >
                                      <Stack gap={4}>
                                        <div className="grid grid-cols-[auto,1fr,auto] items-center gap-3">
                                          <span
                                            aria-hidden="true"
                                            className="grid h-10 w-10 place-items-center rounded-chip"
                                            style={{ background: `${category.color}1A`, color: category.color }}
                                          >
                                            <CategoryIcon category={category} size={18} />
                                          </span>
                                          <div className="min-w-0 text-left">
                                            <Text fw={600} size="sm" className="truncate text-ink">{category.name}</Text>
                                            {itemLabels.length > 0 && (
                                              <Group gap={4} mt={2} wrap="nowrap" className="overflow-x-auto scrollbar-none">
                                                {itemLabels.map((lbl) => (
                                                  <span
                                                    key={lbl.id}
                                                    className="inline-flex items-center rounded-chip bg-surface-soft px-2 py-0.5 text-[10px] font-medium text-muted"
                                                    style={{ boxShadow: "inset 0 0 0 1px var(--st-line)", whiteSpace: "nowrap" }}
                                                  >
                                                    {lbl.name}
                                                  </span>
                                                ))}
                                              </Group>
                                            )}
                                          </div>
                                          <div className="text-right">
                                            <Text
                                              fw={700}
                                              size="sm"
                                              style={{ color: category.type === "income" ? "var(--st-income)" : "var(--st-expense)" }}
                                            >
                                              {formatTransactionMoney(signedAmount(item), currency)}
                                            </Text>
                                          </div>
                                        </div>
                                        {item.note && (
                                          <div className="text-left text-xs font-medium text-muted pl-1">
                                            {item.note}
                                          </div>
                                        )}
                                      </Stack>
                                    </Paper>
                                  );
                                })}
                              </Stack>
                            </Box>
                          );
                        })}
                      </Stack>
                    )}
                  </Paper>
                );
              })()}

              <Card withBorder radius="card" shadow="soft">
                {renderLedgerList()}
              </Card>
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="stats" pt="md">
            {renderStatsPage()}
          </Tabs.Panel>

          <Tabs.Panel value="search" pt="md">
            {renderSearchPage()}
          </Tabs.Panel>

          <Tabs.Panel value="settings" pt="md">
            <Settings
              state={state}
              scheduledEntries={scheduledEntriesForSettings}
              walletTotals={walletTotals}
              language={state.language || "ko"}
              currency={state.currency || "KRW"}
              onLanguageChange={setLanguage}
              onCurrencyChange={setCurrency}
              onSelectWallet={selectWallet}
              onAddWallet={addWallet}
              onRenameWallet={renameWallet}
              onDeleteWallet={deleteWallet}
              onExportWallet={exportWallet}
              onImportWallet={importWallet}
              onSaveCategory={saveCategory}
              onDeleteCategory={deleteCategory}
              onMergeCategories={mergeCategories}
              onSaveLabel={saveLabel}
              onDeleteLabel={deleteLabel}
              onEditEntry={openEditEntry}
            />
          </Tabs.Panel>

          <div
            className="bottom-nav-tabs fixed bottom-0 left-0 right-0 z-30 border-t border-line bg-white/95 backdrop-blur"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            <div className="mx-auto max-w-7xl px-4">
              <Tabs.List grow>
                {TAB_KEYS.map((key) => (
                  <Tabs.Tab key={key} value={key}>
                    {t(`tab.${key}`)}
                  </Tabs.Tab>
                ))}
              </Tabs.List>
            </div>
          </div>
        </Tabs>
      </main>

      {activeTab === "ledger" && (
        <ActionIcon
          size={56}
          radius="xl"
          style={{ backgroundColor: 'var(--st-primary)', color: '#FFFFFF' }}
          className="fixed bottom-24 right-4 z-30 shadow-float transition hover:brightness-110"
          onClick={openNewEntry}
          aria-label={t("ledger.fab.add")}
        >
          <Plus size={24} />
        </ActionIcon>
      )}

      <Modal opened={entryModalOpen} onClose={() => setEntryModalOpen(false)} title={editingEntry ? t("entry.edit") : t("entry.add")} centered size="lg" zIndex={201}>
        <EntryEditor
          categories={state.categories}
          labels={state.labels}
          entry={editingEntry}
          onCancel={() => setEntryModalOpen(false)}
          onDelete={editingEntry ? () => {
            if (editingEntry.repeat && editingEntry.repeat !== "none") {
              setDeleteConfirmEntry(editingEntry);
            } else {
              deleteEntry(editingEntry.id);
              setEntryModalOpen(false);
            }
          } : null}
          onSubmit={(payload) => {
            upsertEntry(payload);
            const entryDate = fromDateInput(payload.date);
            if (entryDate) {
              const key = bucketKeyForDate(ledgerMode, entryDate);
              setLedgerSelectedByMode((prev) => ({ ...prev, [ledgerMode]: key }));
              setStatsSelectedByMode((prev) => ({ ...prev, [ledgerMode]: key }));
            }
            setEntryModalOpen(false);
          }}
        />
      </Modal>

      <Modal
        opened={!!deleteConfirmEntry}
        onClose={() => setDeleteConfirmEntry(null)}
        title={t("entry.action.delete.scheduled.title")}
        centered
        size="md"
        zIndex={202}
      >
        <Stack>
          <Text size="sm">{t("entry.action.delete.scheduled.body")}</Text>

          {(() => {
            if (!deleteConfirmEntry) return null;
            const startDate = fromDateInput(deleteConfirmEntry.date);
            const today = startOfDay(new Date());
            const hasPastOccurrences = startDate && startDate <= today;

            return (
              <Stack gap="sm" mt="md">
                {hasPastOccurrences && (
                  <Button
                    variant="light"
                    fullWidth
                    onClick={() => {
                      stopRepeat(deleteConfirmEntry.id);
                      setDeleteConfirmEntry(null);
                      setEntryModalOpen(false);
                    }}
                  >
                    <Stack gap={4} align="flex-start" style={{ width: '100%' }}>
                      <Text size="sm" fw={600}>{t("entry.action.delete.scheduled.stopFuture")}</Text>
                      <Text size="xs" c="dimmed">{t("entry.action.delete.scheduled.stopFutureDesc")}</Text>
                    </Stack>
                  </Button>
                )}

                {!hasPastOccurrences && (
                  <Text size="xs" c="dimmed" ta="center">
                    {t("entry.action.delete.scheduled.noFuture")}
                  </Text>
                )}

                <Button
                  variant="light"
                  color="red"
                  fullWidth
                  onClick={() => {
                    deleteEntry(deleteConfirmEntry.id);
                    setDeleteConfirmEntry(null);
                    setEntryModalOpen(false);
                  }}
                >
                  <Stack gap={4} align="flex-start" style={{ width: '100%' }}>
                    <Text size="sm" fw={600}>{t("entry.action.delete.scheduled.deleteAll")}</Text>
                    <Text size="xs" c="dimmed">{t("entry.action.delete.scheduled.deleteAllDesc")}</Text>
                  </Stack>
                </Button>

                <Button
                  variant="subtle"
                  color="gray"
                  fullWidth
                  onClick={() => setDeleteConfirmEntry(null)}
                >
                  {t("entry.action.delete.scheduled.cancel")}
                </Button>
              </Stack>
            );
          })()}
        </Stack>
      </Modal>

      <Modal
        opened={statsCategoryModalOpen}
        onClose={() => setStatsCategoryModalOpen(false)}
        transitionProps={{ onExited: () => setStatsCategoryModalId(null) }}
        zIndex={200}
        title={(() => {
          const cat = statsCategoryModalId ? getCategory(statsCategoryModalId) : null;
          if (!cat) return t("stats.column.category");
          return (
            <Group gap="xs">
              <span style={{ color: cat.color }} className="inline-flex items-center">
                <CategoryIcon category={cat} size={18} />
              </span>
              <Text fw={700}>{cat.name}</Text>
              {statsBucket ? <Text size="xs" c="dimmed">· {statsBucket.label}</Text> : null}
            </Group>
          );
        })()}
        centered
        size="lg"
      >
        {(() => {
          if (!statsCategoryModalId || !statsBucket) {
            return <Text size="sm" c="dimmed">표시할 거래가 없습니다.</Text>;
          }
          const items = statsBucket.items
            .filter((item) => item.categoryId === statsCategoryModalId)
            .map(resolveEntryData);
          if (!items.length) {
            return <Text size="sm" c="dimmed">표시할 거래가 없습니다.</Text>;
          }
          const total = items.reduce((sum, item) => sum + Math.abs(signedAmount(item)), 0);
          const cat = getCategory(statsCategoryModalId);
          return (
            <Stack gap="sm">
              <Text size="xs" fw={700} c="dimmed" tt="uppercase">{t(`stats.subBucket.${ledgerMode}`)}</Text>
              <CategoryStatsChart
                items={statsBucket.items}
                ledgerMode={ledgerMode}
                periodStart={statsBucket.start}
                periodEnd={statsBucket.end}
                categoryId={statsCategoryModalId}
                color={cat?.color || CHART.primary}
                categories={state.categories}
              />
              <Text size="xs" fw={700} c="dimmed" tt="uppercase" mt="xs">{t("stats.labelTotals")}</Text>
              <CategoryLabelTotals items={statsBucket.items} categoryId={statsCategoryModalId} getLabel={getLabel} categories={state.categories} />
              <Divider />
              <Group justify="space-between">
                <Text size="sm" c="dimmed">{t("stats.summary.count", { count: items.length })}</Text>
                <Text fw={700}>{formatMoney(total)}</Text>
              </Group>
              <Divider />
              <EntryList
                items={items}
                onEdit={(item) => openEditEntry(item)}
              />
            </Stack>
          );
        })()}
      </Modal>
    </div>
  );
}

function EntryEditor({ categories, labels, entry, onSubmit, onCancel, onDelete }) {
  const t = useT();
  const { currency } = useI18n();
  const isMobile = useMediaQuery("(max-width: 48em)");
  const initialCategory = categories.find((c) => c.id === entry?.categoryId);
  const initialLabelIds = normalizeLabelIds(entry);

  const [date, setDate] = useState(entry?.date || toDateInput(startOfDay(new Date())));
  const [amount, setAmount] = useState(entry?.amount || 0);
  const [categoryType, setCategoryType] = useState(initialCategory?.type || "expense");
  const [categoryId, setCategoryId] = useState(
    entry?.categoryId
      || categories.find((c) => c.type === "expense")?.id
      || categories[0]?.id
      || ""
  );
  const [labelIds, setLabelIds] = useState(initialLabelIds);
  const [note, setNote] = useState(entry?.note || "");
  const [repeat, setRepeat] = useState(entry?.repeat || "none");
  const [repeatEndDate, setRepeatEndDate] = useState(entry?.repeatEndDate || "");

  useEffect(() => {
    if (repeat === "none") setRepeatEndDate("");
  }, [repeat]);

  const categoriesOfType = useMemo(
    () => [...categories].filter((c) => c.type === categoryType).sort((a, b) => a.name.localeCompare(b.name)),
    [categories, categoryType]
  );

  function handleTypeChange(nextType) {
    setCategoryType(nextType);
    const current = categories.find((c) => c.id === categoryId);
    if (!current || current.type !== nextType) {
      const fallback = categories.find((c) => c.type === nextType);
      if (fallback) setCategoryId(fallback.id);
    }
  }

  return (
    <Stack>
      <SimpleGrid cols={2}>
        <TextInput
          label={t("entry.field.date")}
          type="date"
          value={date}
          onChange={(e) => setDate(e.currentTarget.value)}
          styles={{ input: { textAlign: "center" } }}
        />
        <NumberInput
          label={`${t("entry.field.amount")} (${currency})`}
          value={amount}
          onChange={(value) => setAmount(Number(value || 0))}
          min={0}
          allowDecimal={false}
          allowNegative={false}
          thousandSeparator=","
          hideControls
          inputMode="numeric"
          styles={{ input: { textAlign: "center" } }}
        />
      </SimpleGrid>

      <Stack gap={6}>
        <Text size="sm" fw={500}>{t("entry.field.category")}</Text>
        <Paper withBorder radius="card" p="xs">
          <Tabs value={categoryType} onChange={(value) => handleTypeChange(value || "expense")}>
            <Tabs.List grow>
              <Tabs.Tab value="expense">{t("type.expense")}</Tabs.Tab>
              <Tabs.Tab value="income">{t("type.income")}</Tabs.Tab>
            </Tabs.List>
          </Tabs>
          <ScrollArea h={170} mt="xs">
            <SimpleGrid cols={2} spacing={8} p={6}>
              {categoriesOfType.map((category) => {
                const active = category.id === categoryId;
                return (
                  <UnstyledButton
                    key={category.id}
                    onClick={() => setCategoryId(category.id)}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 12,
                      background: active ? `${category.color}14` : "transparent",
                      boxShadow: active ? `inset 0 0 0 1px ${category.color}` : "none",
                    }}
                  >
                    <Group gap={8} wrap="nowrap">
                      <span style={{ color: category.color }} className="inline-flex items-center">
                        <CategoryIcon category={category} size={16} />
                      </span>
                      <Text
                        size="sm"
                        className="truncate"
                        style={{ color: active ? category.color : undefined, fontWeight: active ? 600 : 400 }}
                      >
                        {category.name}
                      </Text>
                    </Group>
                  </UnstyledButton>
                );
              })}
            </SimpleGrid>
          </ScrollArea>
        </Paper>
      </Stack>

      <Stack gap={6}>
        <Group justify="space-between" wrap="nowrap">
          <Text size="sm" fw={500}>{t("entry.field.label")}</Text>
          <Text size="sm" c="dimmed">{t("settings.categories.selected", { count: labelIds.length })}</Text>
        </Group>
        {labels.length === 0 ? (
          <Text size="xs" c="dimmed">{t("settings.labels.empty")}</Text>
        ) : (
          <MultiSelect
            data={labels.map((label) => ({ value: label.id, label: label.name }))}
            value={labelIds}
            onChange={setLabelIds}
            searchable={!isMobile}
            clearable
            hidePickedOptions
            placeholder={t("entry.field.label")}
          />
        )}
      </Stack>

      <Textarea label={t("entry.field.note")} value={note} onChange={(e) => setNote(e.currentTarget.value)} minRows={3} />
      <Select label={t("entry.field.repeat")} data={REPEAT_OPTIONS_DATA.map((item) => ({ value: item.value, label: t(`repeat.${item.value}`) }))} value={repeat} onChange={(value) => setRepeat(value || "none")} />
      {repeat !== "none" && <TextInput label={t("entry.field.repeatEnd")} type="date" value={repeatEndDate} onChange={(e) => setRepeatEndDate(e.currentTarget.value)} placeholder={t("entry.field.repeatEnd.placeholder")} />}
      <Group justify="space-between" pt="sm">
        <Group>
          {onDelete && <Button color="red" variant="light" leftSection={<Trash2 size={16} />} onClick={onDelete}>{t("entry.action.delete")}</Button>}
        </Group>
        <Group>
          <Button
            leftSection={<Check size={16} />}
            onClick={() => onSubmit({ date, amount: Number(amount), categoryId, labelIds, note, repeat, repeatEndDate: repeat === "none" ? "" : repeatEndDate })}
          >
            {t("entry.action.save")}
          </Button>
        </Group>
      </Group>
    </Stack>
  );
}

function AppRoot() {
  const [state, setState] = useState(() => loadState());
  const lang = state.language || DEFAULT_LANGUAGE;
  const currency = state.currency || "KRW";
  const skipNextPush = useRef(true);
  // Last server revision the client knows about. Used as `If-Match` on push.
  // null = server has no state yet (no precondition required).
  const remoteRevRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const localUpdatedAt = typeof state.updatedAt === "number" ? state.updatedAt : 0;
    const isDevSeedMode = import.meta.env.VITE_INCLUDE_SAMPLE === "true";

    // Dev seed guard: skip remote fetch when using fresh sample seed (updatedAt=0)
    // to prevent old KV state from overwriting the sample data.
    if (isDevSeedMode && localUpdatedAt === 0) {
      return;
    }

    fetchRemoteState().then(({ state: remote, updatedAt }) => {
      if (cancelled) return;
      remoteRevRef.current = updatedAt;
      if (!remote) return;
      // Tier 2: if local is strictly newer than remote, keep local and push it.
      // Otherwise, overwrite local with remote (last-write-wins read path).
      const remoteUpdatedAt = typeof updatedAt === "number" ? updatedAt : 0;
      if (localUpdatedAt > remoteUpdatedAt) {
        return; // skipNextPush stays false → next push will write local up to KV
      }
      skipNextPush.current = true;
      setState(normalizeState(remote));
    });
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (skipNextPush.current) {
      skipNextPush.current = false;
      return;
    }
    const handle = setTimeout(async () => {
      const stamped = { ...state, updatedAt: Date.now() };
      const result = await pushRemoteState(stamped, { ifMatch: remoteRevRef.current });
      if (result.ok) {
        remoteRevRef.current = result.newUpdatedAt ?? stamped.updatedAt;
        return;
      }
      if (result.conflict) {
        // Visible conflict: another device wrote a newer revision. Surface a
        // toast (Tier 2 contract), then refetch and overwrite local. The local
        // unpushed edit is lost, but it is a *visible* loss, not silent.
        const refetched = await fetchRemoteState();
        remoteRevRef.current = refetched.updatedAt;
        if (refetched.state) {
          skipNextPush.current = true;
          setState(normalizeState(refetched.state));
        }
        if (typeof window !== "undefined") {
          notifications.show({
            color: "yellow",
            title: lang === "en" ? "Updated on another device" : "다른 기기에서 갱신됨",
            message:
              lang === "en"
                ? "Reloading the latest state."
                : "최신 상태를 다시 불러왔습니다.",
          });
        }
        return;
      }
      if (result.payloadTooLarge && typeof window !== "undefined") {
        notifications.show({
          color: "red",
          title: lang === "en" ? "Sync payload too large" : "동기화 데이터가 너무 큽니다",
          message:
            lang === "en"
              ? "Local changes are saved on this device, but remote sync was skipped."
              : "이 기기에는 저장됐지만 원격 동기화는 건너뛰었습니다.",
        });
      }
    }, 1500);
    return () => clearTimeout(handle);
  }, [state, lang]);

  return (
    <I18nProvider lang={lang} currency={currency}>
      <App state={state} setState={setState} />
    </I18nProvider>
  );
}

export default AppRoot;
