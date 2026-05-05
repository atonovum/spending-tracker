import { useEffect, useMemo, useState } from "react";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Card,
  Center,
  Divider,
  Group,
  Modal,
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
} from "@mantine/core";
import {
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconPlus,
  IconPencil,
  IconSearch,
  IconSettings,
  IconTrash,
  IconWallet,
} from "@tabler/icons-react";
import { loadState, saveState } from "./lib/storage.js";
import {
  addDays,
  buildOccurrences,
  buildPendingScheduledOccurrences,
  formatAxisTick,
  formatMoney,
  formatShortDate,
  fromDateInput,
  groupOccurrences,
  inRangeOccurrences,
  MAX_WALLETS,
  resolveFlowRange,
  resolveFullRange,
  roundedAxisMax,
  signedAmount,
  startOfDay,
  sumSigned,
  toDateInput,
  uid,
} from "./lib/finance.js";
import { CategoryIcon, getCategoryIconComponent } from "./lib/categoryIcons.jsx";
import Settings from "./settings/Settings.jsx";

const TAB_ITEMS = [
  { value: "ledger", label: "Ledger" },
  { value: "stats", label: "Stats" },
  { value: "search", label: "Search" },
  { value: "settings", label: "Settings" },
];

function groupByDate(occurrences) {
  const map = new Map();
  for (const item of occurrences) {
    const key = item.occurrenceDate || item.date;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
}

function visibleCountForMode(mode) {
  if (mode === "week") return 6;
  if (mode === "month") return 6;
  return 4;
}

function bucketLabelRange(bucket) {
  return `${bucket.label}`;
}

function donutSlicePath(cx, cy, r, startAngle, endAngle) {
  const x1 = cx + r * Math.cos(startAngle);
  const y1 = cy + r * Math.sin(startAngle);
  const x2 = cx + r * Math.cos(endAngle);
  const y2 = cy + r * Math.sin(endAngle);
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
}

function LedgerChart({ mode, chartMode, page, selectedKey, onSelectBucket, onSelectBar, selection }) {
  const width = 640;
  const height = 240;
  const padX = 42;
  const padY = 18;
  const labelArea = mode === "year" ? 24 : 34;
  const baseY = height - padY - labelArea;
  const graphH = baseY - padY;
  const graphW = width - padX * 2;

  if (!page.length) {
    return <Center h={220} c="dimmed">데이터가 없습니다.</Center>;
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

    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[240px] select-none">
        {[minTick, (minTick + maxTick) / 2, maxTick].map((tick) => {
          const ratio = (tick - minTick) / tickRange;
          const y = baseY - ratio * graphH;
          return (
            <g key={tick}>
              <line x1={padX} x2={width - padX} y1={y} y2={y} stroke="#e2e8f0" strokeWidth="1" />
              <text x="8" y={y + 4} className="fill-slate-500 text-[12px]">
                {formatAxisTick(tick)}
              </text>
            </g>
          );
        })}
        {points.length > 1 && (
          <polyline
            points={points.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke="#2e7d32"
            strokeWidth="2.5"
          />
        )}
        {points.map((point) => (
          <g key={point.key}>
            <circle
              cx={point.x}
              cy={point.y}
              r={selectedKey === point.key ? 7 : 4}
              fill={selectedKey === point.key ? "#e53935" : "#fff"}
              stroke="#2e7d32"
              strokeWidth="2"
              onClick={() => onSelectBucket(point)}
              style={{ cursor: "pointer" }}
            />
            {mode === "week" ? (
              <text x={point.x} y={height - 16} textAnchor="middle" className="fill-slate-600 text-[10px]">
                <tspan x={point.x} dy="0">{formatShortDate(point.start)}</tspan>
                <tspan x={point.x} dy="12">{formatShortDate(point.end)}</tspan>
              </text>
            ) : (
              <text x={point.x} y={height - 10} textAnchor="middle" className="fill-slate-600 text-[11px]">
                {point.label}
              </text>
            )}
          </g>
        ))}
        {mode !== "week" && points.map((point) => (
          <text key={`${point.key}-label`} x={point.x} y={height - 22} textAnchor="middle" className="fill-slate-500 text-[10px]">
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
  const barW = Math.max(7, slotW * 0.34);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[240px] select-none">
      {[0, midTick, maxTick].map((tick) => {
        const ratio = tick / maxTick;
        const y = baseY - ratio * graphH;
        return (
          <g key={tick}>
            <line x1={padX} x2={width - padX} y1={y} y2={y} stroke="#e2e8f0" strokeWidth="1" />
            <text x="8" y={y + 4} className="fill-slate-500 text-[12px]">
              {formatAxisTick(tick)}
            </text>
          </g>
        );
      })}
      {page.map((bucket, index) => {
        const slotX = padX + index * slotW;
        const centerX = slotX + slotW / 2;
        const incomeX = centerX - barW;
        const expenseX = centerX;
        const incH = (Math.abs(bucket.income) / maxTick) * graphH;
        const expH = (Math.abs(bucket.expense) / maxTick) * graphH;
        const dimmed = !!selectedKey && bucket.key !== selectedKey;
        return (
          <g key={bucket.key}>
            <rect
              x={slotX + 1}
              y={padY}
              width={slotW - 2}
              height={graphH}
              fill={selectedKey === bucket.key ? "rgba(21,101,192,0.08)" : "transparent"}
              onClick={() => onSelectBucket(bucket)}
              style={{ cursor: "pointer" }}
            />
            <rect
              x={incomeX}
              y={baseY - incH}
              width={barW}
              height={Math.max(incH, 4)}
              fill="#1565c0"
              opacity={dimmed ? 0.35 : 1}
              onClick={() => onSelectBar(bucket, "income")}
              style={{ cursor: "pointer" }}
            />
            <rect
              x={expenseX}
              y={baseY - expH}
              width={barW}
              height={Math.max(expH, 4)}
              fill="#c62828"
              opacity={dimmed ? 0.35 : 1}
              onClick={() => onSelectBar(bucket, "expense")}
              style={{ cursor: "pointer" }}
            />
            <text x={centerX} y={height - 10} textAnchor="middle" className="fill-slate-600 text-[11px]">
              {bucket.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function PieChart({ items, type }) {
  const width = 640;
  const height = 260;
  const cx = width / 2;
  const cy = height * 0.5;
  const radius = Math.min(width, height) * 0.32;
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
  if (!sum) return <Center h={260} c="dimmed">표시할 데이터가 없습니다.</Center>;

  let start = -Math.PI / 2;
  const entries = slices.map((slice) => {
    const angle = (slice.value / sum) * Math.PI * 2;
    const mid = start + angle / 2;
    const result = { ...slice, start, end: start + angle, mid };
    start += angle;
    return result;
  });

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[260px] overflow-visible">
      {entries.map((slice) => (
        <path key={slice.category.id} d={donutSlicePath(cx, cy, radius, slice.start, slice.end)} fill={slice.category.color} stroke="#fff" strokeWidth="1" />
      ))}
      {entries.map((slice) => {
        const Cmp = getCategoryIconComponent(slice.category.icon);
        const x1 = cx + Math.cos(slice.mid) * radius;
        const y1 = cy + Math.sin(slice.mid) * radius;
        const rightSide = Math.cos(slice.mid) >= 0;
        const elbowX = cx + (rightSide ? radius + 14 : -(radius + 14));
        const iconX = cx + (rightSide ? radius + 30 : -(radius + 30));
        const iconSize = 22;
        return (
          <g key={`${slice.category.id}-callout`}>
            <polyline points={`${x1},${y1} ${elbowX},${y1} ${iconX},${y1}`} fill="none" stroke={slice.category.color} strokeWidth="1.2" />
            <circle cx={x1} cy={y1} r="3.5" fill={slice.category.color} />
            <g transform={`translate(${iconX - iconSize / 2}, ${y1 - iconSize / 2})`} style={{ color: slice.category.color }}>
              <Cmp size={iconSize} stroke={2} />
            </g>
          </g>
        );
      })}
    </svg>
  );
}

function EntryList({ items, onEdit }) {
  const groups = groupByDate(items);
  if (!groups.length) return <Text c="dimmed" size="sm">표시할 거래가 없습니다.</Text>;
  return (
    <Stack gap="sm">
      {groups.map(([date, rows]) => (
        <Box key={date}>
          <Text fw={700} size="sm" className="text-slate-700 mb-2">
            {date}
          </Text>
          <Stack gap="xs">
            {rows.map((item) => {
              const category = item.category;
              const label = item.label;
              return (
                <Paper key={item.id + item.occurrenceDate} withBorder radius="sm" p="sm" className="cursor-pointer" onClick={() => onEdit(item)}>
                  <div className="grid grid-cols-[auto,auto,1fr,auto] items-center gap-3">
                    <span className="h-10 w-1.5 rounded-full" style={{ background: category.color }} />
                    <span
                      aria-hidden="true"
                      className="grid h-9 w-9 place-items-center rounded-full"
                      style={{ background: `${category.color}1a`, color: category.color }}
                    >
                      <CategoryIcon category={category} size={18} />
                    </span>
                    <div className="min-w-0 text-left">
                      <div className="truncate font-medium text-slate-900">
                        {category.name} <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{label.name}</span>
                      </div>
                      {item.note ? <div className="text-xs text-slate-500">{item.note}</div> : null}
                    </div>
                    <div className="text-right">
                      <div className={item.amount >= 0 ? "text-income font-semibold" : "text-expense font-semibold"}>
                        {formatMoney(item.amount)}
                      </div>
                    </div>
                  </div>
                </Paper>
              );
            })}
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}

function App() {
  const [state, setState] = useState(() => loadState());
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
  const [searchWalletId, setSearchWalletId] = useState(state.selectedWalletId);
  const [searchPeriod, setSearchPeriod] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [searchStartDate, setSearchStartDate] = useState("");
  const [searchEndDate, setSearchEndDate] = useState("");
  const [entryModalOpen, setEntryModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [statsCategoryModalId, setStatsCategoryModalId] = useState(null);

  useEffect(() => {
    saveState(state);
  }, [state]);

  const currentWallet = useMemo(
    () => state.wallets.find((wallet) => wallet.id === state.selectedWalletId) || state.wallets[0],
    [state]
  );

  const fullRange = useMemo(() => resolveFullRange(currentWallet.entries), [currentWallet]);
  const allOccurrences = useMemo(() => buildOccurrences(currentWallet.entries, fullRange), [currentWallet, fullRange]);
  const buckets = useMemo(() => groupOccurrences(allOccurrences, ledgerMode), [allOccurrences, ledgerMode]);

  const selectedBucket = useMemo(() => {
    const selectedKey = ledgerSelectedByMode[ledgerMode] || buckets[buckets.length - 1]?.key || null;
    return buckets.find((bucket) => bucket.key === selectedKey) || buckets[buckets.length - 1] || null;
  }, [ledgerSelectedByMode, ledgerMode, buckets]);

  const totalBalance = useMemo(() => sumSigned(allOccurrences), [allOccurrences]);
  const periodFlow = useMemo(() => (selectedBucket ? sumSigned(selectedBucket.items) : 0), [selectedBucket]);

  const statsBucket = useMemo(() => {
    const selectedKey = statsSelectedByMode[ledgerMode] || selectedBucket?.key || null;
    return buckets.find((bucket) => bucket.key === selectedKey) || selectedBucket || null;
  }, [statsSelectedByMode, ledgerMode, selectedBucket, buckets]);

  const statsItems = statsBucket?.items || [];
  const statsFlow = useMemo(() => (statsBucket ? sumSigned(statsBucket.items) : 0), [statsBucket]);

  const selectedLedgerPageStart = ledgerPageByMode[ledgerMode] ?? Math.max(0, buckets.length - visibleCountForMode(ledgerMode));
  const ledgerPage = buckets.slice(selectedLedgerPageStart, selectedLedgerPageStart + visibleCountForMode(ledgerMode));
  const ledgerValueText = ledgerSelection && ledgerSelection.mode === ledgerMode
    ? `${ledgerSelection.label} · ${ledgerSelection.metric === "income" ? "수입" : ledgerSelection.metric === "expense" ? "지출" : "현금 흐름"}: ${formatMoney(ledgerSelection.amount)}`
    : "";

  const pendingScheduled = useMemo(() => buildPendingScheduledOccurrences(currentWallet, selectedBucket ? { start: selectedBucket.start, end: selectedBucket.end } : resolveFlowRange(ledgerMode)), [currentWallet, selectedBucket, ledgerMode]);

  const statsVisibleCount = visibleCountForMode(ledgerMode);
  const statsPageStart = statsPageByMode[ledgerMode] ?? Math.max(0, buckets.length - statsVisibleCount);
  const statsPage = buckets.slice(statsPageStart, statsPageStart + statsVisibleCount);

  const searchWallet = state.wallets.find((wallet) => wallet.id === searchWalletId) || currentWallet;
  const searchRange = useMemo(() => {
    if (searchPeriod === "7d") return resolveFlowRange("week");
    if (searchPeriod === "30d") return resolveFlowRange("month");
    if (searchPeriod === "90d") return { start: addDays(startOfDay(new Date()), -89), end: startOfDay(new Date()) };
    if (searchPeriod === "custom") {
      const start = fromDateInput(searchStartDate) || fullRange.start;
      const end = fromDateInput(searchEndDate) || fullRange.end;
      return start <= end ? { start, end } : { start: end, end: start };
    }
    return fullRange;
  }, [searchPeriod, searchStartDate, searchEndDate, fullRange]);

  const searchResults = useMemo(() => {
    const base = buildOccurrences(searchWallet.entries, searchRange);
    const q = searchText.trim().toLowerCase();
    if (!q) return [];
    const categoryNameById = new Map(state.categories.map((c) => [c.id, (c.name || "").toLowerCase()]));
    const labelNameById = new Map(state.labels.map((l) => [l.id, (l.name || "").toLowerCase()]));
    return base.filter((item) => {
      const category = categoryNameById.get(item.categoryId) || "";
      const label = labelNameById.get(item.labelId) || "";
      return category.includes(q) || label.includes(q) || (item.note || "").toLowerCase().includes(q);
    });
  }, [searchWallet, searchRange, searchText, state.categories, state.labels]);

  function persistState(next) {
    setState((prev) => {
      const value = typeof next === "function" ? next(prev) : next;
      saveState(value);
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
          : [{ id: crypto.randomUUID().replace(/-/g, "").slice(0, 16), ...payload }, ...wallet.entries];
        return { ...wallet, entries };
      })
    );
  }

  function deleteEntry(entryId) {
    updateWallets((wallets) => wallets.map((wallet) => (wallet.id === state.selectedWalletId ? { ...wallet, entries: wallet.entries.filter((entry) => entry.id !== entryId) } : wallet)));
  }

  function resolveEntryData(item) {
    return { ...item, category: getCategory(item.categoryId), label: getLabel(item.labelId) };
  }

  function handleLedgerBucketSelect(bucket) {
    setLedgerSelectedByMode((prev) => ({ ...prev, [ledgerMode]: bucket.key }));
    setStatsSelectedByMode((prev) => ({ ...prev, [ledgerMode]: bucket.key }));
    setLedgerSelection(null);
    setLedgerPageByMode((prev) => ({ ...prev, [ledgerMode]: prev[ledgerMode] ?? Math.max(0, buckets.length - visibleCountForMode(ledgerMode)) }));
  }

  function handleLedgerBarSelect(bucket, metric) {
    setLedgerSelectedByMode((prev) => ({ ...prev, [ledgerMode]: bucket.key }));
    setStatsSelectedByMode((prev) => ({ ...prev, [ledgerMode]: bucket.key }));
    const amount = metric === "income" ? bucket.income : -Math.abs(bucket.expense);
    setLedgerSelection({ chartMode: "flow", mode: ledgerMode, key: bucket.key, label: bucket.label, metric, amount });
  }

  function handleLedgerPointSelect(point) {
    setLedgerSelectedByMode((prev) => ({ ...prev, [ledgerMode]: point.key }));
    setStatsSelectedByMode((prev) => ({ ...prev, [ledgerMode]: point.key }));
    setLedgerSelection({ chartMode: "balance", mode: ledgerMode, key: point.key, label: point.label, amount: point.cumulative });
  }

  function renderLedgerList() {
    if (selectedBucket) {
      return (
        <EntryList
          items={selectedBucket.items.map(resolveEntryData)}
          onEdit={(item) => openEditEntry(item)}
        />
      );
    }
    return (
      <EntryList
        items={allOccurrences.map(resolveEntryData)}
        onEdit={(item) => openEditEntry(item)}
      />
    );
  }

  function renderStatsPage() {
    const resolvedStatsItems = statsItems.map(resolveEntryData);
    const labelMap = new Map();
    for (const item of resolvedStatsItems) {
      const label = item.label;
      const signed = signedAmount(item);
      const cur = labelMap.get(label.id) || { label, income: 0, expense: 0 };
      if (signed >= 0) cur.income += signed;
      else cur.expense += Math.abs(signed);
      labelMap.set(label.id, cur);
    }
    const categoryMap = new Map();
    for (const item of resolvedStatsItems.filter((entry) => entry.category.type === statsCategoryType)) {
      const category = item.category;
      const cur = categoryMap.get(category.id) || { category, count: 0, amount: 0 };
      cur.count += 1;
      cur.amount += Math.abs(signedAmount(item));
      categoryMap.set(category.id, cur);
    }
    const filteredByLabel = statsLabelFilterId ? resolvedStatsItems.filter((item) => item.labelId === statsLabelFilterId) : resolvedStatsItems;
    const typedItems = filteredByLabel.filter((item) => item.category.type === statsCategoryType);

    return (
      <Stack gap="md">
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Card withBorder radius="sm" shadow="sm">
            <Text fw={700} size="sm" c="dimmed">총 남은 현금</Text>
            <Title order={2}>{formatMoney(totalBalance)}</Title>
          </Card>
          <Card withBorder radius="sm" shadow="sm">
            <Text fw={700} size="sm" c="dimmed">기간내 총 현금 흐름</Text>
            <Title order={2}>{formatMoney(statsFlow)}</Title>
          </Card>
        </SimpleGrid>

        <Card withBorder radius="sm" shadow="sm">
          <Group justify="space-between" wrap="nowrap" mb="sm">
            <Group gap="xs" wrap="nowrap">
              <ActionIcon variant="default" onClick={() => setStatsPageByMode((prev) => ({ ...prev, [ledgerMode]: Math.max(0, statsPageStart - statsVisibleCount) }))} disabled={statsPageStart <= 0}>
                <IconArrowLeft size={16} />
              </ActionIcon>
              <ScrollArea type="never" className="max-w-full">
                <Group gap="xs" wrap="nowrap">
                  {statsPage.map((bucket) => (
                    <Button
                      key={bucket.key}
                      size="xs"
                      variant={bucket.key === statsBucket?.key ? "filled" : "light"}
                      onClick={() => {
                        setStatsSelectedByMode((prev) => ({ ...prev, [ledgerMode]: bucket.key }));
                        setLedgerSelectedByMode((prev) => ({ ...prev, [ledgerMode]: bucket.key }));
                        setStatsLabelFilterId(null);
                      }}
                    >
                      {bucket.label}
                    </Button>
                  ))}
                </Group>
              </ScrollArea>
              <ActionIcon variant="default" onClick={() => setStatsPageByMode((prev) => ({ ...prev, [ledgerMode]: Math.min(Math.max(0, buckets.length - statsVisibleCount), statsPageStart + statsVisibleCount) }))} disabled={statsPageStart + statsVisibleCount >= buckets.length}>
                <IconArrowRight size={16} />
              </ActionIcon>
            </Group>
            <Text size="sm" c="dimmed">{statsBucket ? `선택 구간: ${statsBucket.label}` : "선택 가능한 기간이 없습니다."}</Text>
          </Group>

          <Divider my="sm" />
          <Title order={4} mb="xs">Labels</Title>
          <Table striped highlightOnHover verticalSpacing="xs" className="text-center">
            <Table.Thead>
              <Table.Tr>
                <Table.Th className="text-center">레이블</Table.Th>
                <Table.Th className="text-center">수입</Table.Th>
                <Table.Th className="text-center">지출</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {[...labelMap.values()].sort((a, b) => (a.label.name > b.label.name ? 1 : -1)).map(({ label, income, expense }) => (
                <Table.Tr key={label.id}>
                  <Table.Td className="text-center">{label.name}</Table.Td>
                  <Table.Td className="text-center">
                    <Button size="xs" variant={statsLabelFilterId === label.id && statsCategoryType === "income" ? "filled" : "subtle"} onClick={() => { setStatsLabelFilterId(label.id); setStatsCategoryType("income"); }}>
                      {formatMoney(income)}
                    </Button>
                  </Table.Td>
                  <Table.Td className="text-center">
                    <Button size="xs" variant={statsLabelFilterId === label.id && statsCategoryType === "expense" ? "filled" : "subtle"} color="red" onClick={() => { setStatsLabelFilterId(label.id); setStatsCategoryType("expense"); }}>
                      {formatMoney(expense)}
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>

          <Divider my="sm" />
          <Group justify="space-between" className="mb-2">
            <Title order={4}>Categories</Title>
            <Group gap="xs">
              <Text size="sm" c="dimmed">필터: {statsLabelFilterId ? getLabel(statsLabelFilterId)?.name : "없음"}</Text>
              <Button size="xs" variant="default" onClick={() => setStatsLabelFilterId(null)}>All</Button>
            </Group>
          </Group>
          <Group justify="center" className="mb-3">
            <Button variant={statsCategoryType === "income" ? "filled" : "light"} onClick={() => setStatsCategoryType("income")}>총 수입</Button>
            <Button variant={statsCategoryType === "expense" ? "filled" : "light"} color="red" onClick={() => setStatsCategoryType("expense")}>총 지출</Button>
          </Group>
          <Center>
            <PieChart items={typedItems} type={statsCategoryType} />
          </Center>

          <Table striped highlightOnHover verticalSpacing="xs" className="text-center">
            <Table.Thead>
              <Table.Tr>
                <Table.Th className="text-center">카테고리</Table.Th>
                <Table.Th className="text-center">건수</Table.Th>
                <Table.Th className="text-center">총 금액</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {[...categoryMap.values()].sort((a, b) => b.amount - a.amount).map(({ category, count, amount }) => (
                <Table.Tr
                  key={category.id}
                  className="cursor-pointer"
                  onClick={() => setStatsCategoryModalId(category.id)}
                >
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
              ))}
            </Table.Tbody>
          </Table>
        </Card>
      </Stack>
    );
  }

  function renderSearchPage() {
    return (
      <Card withBorder radius="sm" shadow="sm">
        <Title order={3} mb="md">검색</Title>
        <Stack gap="sm">
          <TextInput value={searchText} onChange={(e) => setSearchText(e.currentTarget.value)} placeholder="카테고리, 레이블, 노트" leftSection={<IconSearch size={16} />} />
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <Select
              label="지갑"
              data={state.wallets.map((wallet) => ({ value: wallet.id, label: wallet.name }))}
              value={searchWalletId}
              onChange={(value) => setSearchWalletId(value || state.wallets[0]?.id || "")}
            />
            <Select
              label="기간별 조회"
              data={[
                { value: "all", label: "전체" },
                { value: "7d", label: "최근 7일" },
                { value: "30d", label: "최근 30일" },
                { value: "90d", label: "최근 90일" },
                { value: "custom", label: "직접 설정" },
              ]}
              value={searchPeriod}
              onChange={(value) => setSearchPeriod(value || "all")}
            />
          </SimpleGrid>
          {searchPeriod === "custom" && (
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <TextInput label="시작일" type="date" value={searchStartDate} onChange={(e) => setSearchStartDate(e.currentTarget.value)} />
              <TextInput label="종료일" type="date" value={searchEndDate} onChange={(e) => setSearchEndDate(e.currentTarget.value)} />
            </SimpleGrid>
          )}
          <Divider />
          <EntryList items={searchResults.map((item) => ({ ...item, ...resolveEntryData(item) }))} onEdit={(item) => openEditEntry(item)} />
        </Stack>
      </Card>
    );
  }

  const pendingScheduledForSettings = useMemo(
    () => buildPendingScheduledOccurrences(currentWallet, fullRange),
    [currentWallet, fullRange]
  );

  function selectWallet(walletId) {
    persistState((prev) => ({ ...prev, selectedWalletId: walletId }));
    setSearchWalletId(walletId);
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

  function exportWallet(walletId) {
    const wallet = state.wallets.find((w) => w.id === walletId);
    if (!wallet) return;
    const payload = {
      version: 3,
      exportedAt: new Date().toISOString(),
      wallet,
      categories: state.categories,
      labels: state.labels,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const safeName = wallet.name.replace(/[^\w\-가-힣]+/g, "_") || "wallet";
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeName}-${new Date().toISOString().slice(0, 10)}.json`;
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
        labelId: entry.labelId || prev.labels[0]?.id || "",
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
        entries: wallet.entries.filter((entry) => entry.labelId !== labelId),
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
              leftSection={<IconWallet size={16} />}
              data={state.wallets.map((wallet) => ({ value: wallet.id, label: wallet.name }))}
              value={state.selectedWalletId}
              onChange={(value) => {
                if (!value) return;
                setState((prev) => ({ ...prev, selectedWalletId: value }));
                setSearchWalletId(value);
              }}
            />
            <Select
              className="w-40"
              data={[
                { value: "week", label: "By weeks" },
                { value: "month", label: "By months" },
                { value: "year", label: "By years" },
              ]}
              value={ledgerMode}
              onChange={(value) => setLedgerMode(value || "month")}
            />
          </div>
        </div>
      )}

      <main className="mx-auto max-w-7xl px-4 py-4">
        <Tabs value={activeTab} onChange={setActiveTab}>
          <Tabs.Panel value="ledger" pt="md">
            <Stack gap="md">
              <SimpleGrid cols={{ base: 1, sm: 2 }}>
                <Card
                  withBorder
                  radius="sm"
                  shadow={ledgerChartMode === "balance" ? "md" : "sm"}
                  className={`cursor-pointer transition ${ledgerChartMode === "balance" ? "ring-2 ring-balance" : "hover:shadow-md"}`}
                  role="button"
                  tabIndex={0}
                  aria-pressed={ledgerChartMode === "balance"}
                  onClick={() => setLedgerChartMode("balance")}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setLedgerChartMode("balance"); } }}
                >
                  <Text fw={700} size="sm" c="dimmed">총 남은 현금</Text>
                  <Title order={2}>{formatMoney(totalBalance)}</Title>
                </Card>
                <Card
                  withBorder
                  radius="sm"
                  shadow={ledgerChartMode === "flow" ? "md" : "sm"}
                  className={`cursor-pointer transition ${ledgerChartMode === "flow" ? "ring-2 ring-expense" : "hover:shadow-md"}`}
                  role="button"
                  tabIndex={0}
                  aria-pressed={ledgerChartMode === "flow"}
                  onClick={() => setLedgerChartMode("flow")}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setLedgerChartMode("flow"); } }}
                >
                  <Text fw={700} size="sm" c="dimmed">기간내 총 현금 흐름</Text>
                  <Title order={2}>{formatMoney(periodFlow)}</Title>
                </Card>
              </SimpleGrid>

              <Card withBorder radius="sm" shadow="sm" className="overflow-hidden">
                <Group justify="space-between" align="flex-start" mb="xs">
                  <Group gap="md">
                    {ledgerChartMode === "flow" ? (
                      <>
                        <Text size="sm">수입</Text>
                        <Text size="sm">지출</Text>
                      </>
                    ) : (
                      <Text size="sm">현금 흐름</Text>
                    )}
                  </Group>
                </Group>
                <Group justify="space-between" align="center" className="min-h-5">
                  <Text size="sm" c="dimmed">{ledgerPage.length ? `${ledgerPage[0].label} ~ ${ledgerPage[ledgerPage.length - 1].label}` : "데이터 없음"}</Text>
                  <Text size="sm" c="dimmed">{ledgerValueText}</Text>
                </Group>
                <LedgerChart
                  mode={ledgerMode}
                  chartMode={ledgerChartMode}
                  page={ledgerPage}
                  selectedKey={selectedBucket?.key || null}
                  selection={ledgerSelection}
                  onSelectBucket={handleLedgerBucketSelect}
                  onSelectBar={handleLedgerBarSelect}
                />
              </Card>

              <Card withBorder radius="sm" shadow="sm">
                <Group justify="space-between" mb="sm">
                  <Title order={4}>일별 거래 목록</Title>
                  <Text size="sm" c="dimmed">
                    {pendingScheduled.length ? `예정된 반복 거래 ${pendingScheduled.length}개` : ""}
                  </Text>
                </Group>
                <Divider mb="sm" />
                {pendingScheduled.length > 0 && (
                  <Paper withBorder radius="sm" p="sm" className="mb-3 bg-slate-50">
                    <Text fw={700} size="sm" mb="xs">예정된 반복 거래</Text>
                    <Stack gap="xs">
                      {pendingScheduled.map((item) => {
                        const resolved = resolveEntryData(item);
                        return (
                          <Paper key={item.id + item.occurrenceDate} withBorder radius="sm" p="sm" className="bg-white">
                            <Group justify="space-between">
                              <div>
                                <Text fw={600}>{item.occurrenceDate}</Text>
                                <Text size="sm" c="dimmed">{resolved.category.name} / {resolved.label.name}</Text>
                              </div>
                              <Text fw={700}>{formatMoney(item.amount)}</Text>
                            </Group>
                          </Paper>
                        );
                      })}
                    </Stack>
                  </Paper>
                )}
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
              pendingScheduled={pendingScheduledForSettings}
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
                {TAB_ITEMS.map((tab) => (
                  <Tabs.Tab key={tab.value} value={tab.value}>
                    {tab.label}
                  </Tabs.Tab>
                ))}
              </Tabs.List>
            </div>
          </div>
        </Tabs>
      </main>

      {activeTab === "ledger" && (
        <ActionIcon
          size="xl"
          radius="xl"
          color="indigo"
          className="fixed bottom-20 right-4 z-30 shadow-soft"
          onClick={openNewEntry}
          aria-label="거래 추가"
        >
          <IconPlus size={24} />
        </ActionIcon>
      )}

      <Modal opened={entryModalOpen} onClose={() => setEntryModalOpen(false)} title={editingEntry ? "거래 수정" : "거래 추가"} centered size="lg">
        <EntryEditor
          categories={state.categories}
          labels={state.labels}
          entry={editingEntry}
          onCancel={() => setEntryModalOpen(false)}
          onDelete={editingEntry ? () => { deleteEntry(editingEntry.id); setEntryModalOpen(false); } : null}
          onSubmit={(payload) => {
            upsertEntry(payload);
            setEntryModalOpen(false);
          }}
        />
      </Modal>

      <Modal
        opened={!!statsCategoryModalId}
        onClose={() => setStatsCategoryModalId(null)}
        title={(() => {
          const cat = statsCategoryModalId ? getCategory(statsCategoryModalId) : null;
          if (!cat) return "카테고리";
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
          return (
            <Stack gap="sm">
              <Group justify="space-between">
                <Text size="sm" c="dimmed">총 {items.length}건</Text>
                <Text fw={700}>{formatMoney(total)}</Text>
              </Group>
              <Divider />
              <EntryList
                items={items}
                onEdit={(item) => {
                  setStatsCategoryModalId(null);
                  openEditEntry(item);
                }}
              />
            </Stack>
          );
        })()}
      </Modal>
    </div>
  );
}

function EntryEditor({ categories, labels, entry, onSubmit, onCancel, onDelete }) {
  const [date, setDate] = useState(entry?.date || toDateInput(startOfDay(new Date())));
  const [amount, setAmount] = useState(entry?.amount || 0);
  const [categoryId, setCategoryId] = useState(entry?.categoryId || categories[0]?.id || "");
  const [labelId, setLabelId] = useState(entry?.labelId || labels[0]?.id || "");
  const [note, setNote] = useState(entry?.note || "");
  const [repeat, setRepeat] = useState(entry?.repeat || "none");
  const [repeatEndDate, setRepeatEndDate] = useState(entry?.repeatEndDate || "");

  useEffect(() => {
    if (repeat === "none") setRepeatEndDate("");
  }, [repeat]);

  return (
    <Stack>
      <SimpleGrid cols={2}>
        <TextInput label="날짜" type="date" value={date} onChange={(e) => setDate(e.currentTarget.value)} />
        <NumberInput label="금액" value={amount} onChange={(value) => setAmount(Number(value || 0))} min={0} />
      </SimpleGrid>
      <Select label="카테고리" data={categories.map((category) => ({ value: category.id, label: category.name }))} value={categoryId} onChange={(value) => setCategoryId(value || "")} />
      <Select label="레이블" data={labels.map((label) => ({ value: label.id, label: label.name }))} value={labelId} onChange={(value) => setLabelId(value || "")} />
      <Textarea label="노트" value={note} onChange={(e) => setNote(e.currentTarget.value)} minRows={3} />
      <Select label="반복" data={REPEAT_OPTIONS.map((item) => ({ value: item.value, label: item.label }))} value={repeat} onChange={(value) => setRepeat(value || "none")} />
      {repeat !== "none" && <TextInput label="반복 종료일" type="date" value={repeatEndDate} onChange={(e) => setRepeatEndDate(e.currentTarget.value)} placeholder="비우면 무기한 반복" />}
      <Group justify="space-between" pt="sm">
        <Group>
          {onDelete && <Button color="red" variant="light" leftSection={<IconTrash size={16} />} onClick={onDelete}>삭제</Button>}
        </Group>
        <Group>
          <Button
            leftSection={<IconCheck size={16} />}
            onClick={() => onSubmit({ date, amount: Number(amount), categoryId, labelId, note, repeat, repeatEndDate: repeat === "none" ? "" : repeatEndDate })}
          >
            저장
          </Button>
        </Group>
      </Group>
    </Stack>
  );
}

const REPEAT_OPTIONS = [
  { value: "none", label: "반복 없음" },
  { value: "daily", label: "매일" },
  { value: "every_other_day", label: "격일" },
  { value: "weekday", label: "평일" },
  { value: "weekend", label: "주말" },
  { value: "biweekly", label: "격주" },
  { value: "fourweekly", label: "4주" },
  { value: "monthly", label: "한달" },
];

export default App;
