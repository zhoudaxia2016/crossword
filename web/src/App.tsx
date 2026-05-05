import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button } from "./components/ui/button";
import { groupResults, loadManifest, loadResult } from "./data";
import {
  applySlotDraft,
  buildBoardState,
  deriveSlotsWithNumbers,
  entryKey,
  getSlotCurrentText,
  getSlotResolvedText,
  isSolved,
  slotKey,
  type SlotWithNumber,
} from "./game";
import { cn } from "./lib/utils";
import type {
  LoadedResult,
  PlacedEntry,
  ResultRecord,
} from "./types";

type CellStore = Record<string, Record<number, Record<string, string>>>;

function buildEntryMap(entries: PlacedEntry[]) {
  return new Map(entries.map((entry) => [slotKey(entry.direction, entry.number), entry]));
}

function formatScore(n: number | undefined | null, digits = 3) {
  return (n ?? 0).toFixed(digits);
}

/* ──────────────── Mode Switcher ──────────────── */

interface ModeNavProps {
  mode: "answer" | "benchmark";
  onModeChange: (mode: "answer" | "benchmark") => void;
}

function ModeNav({ mode, onModeChange }: ModeNavProps) {
  return (
    <div className="mode-nav">
      <div className="mode-nav-inner">
        <span className="mode-nav__title">Crossword</span>
        <button
          className={cn("mode-btn", mode === "answer" && "active")}
          onClick={() => onModeChange("answer")}
          type="button"
        >
          作答
        </button>
        <button
          className={cn("mode-btn", mode === "benchmark" && "active")}
          onClick={() => onModeChange("benchmark")}
          type="button"
        >
          对比
        </button>
      </div>
    </div>
  );
}

/* ──────────────── Dropdown Menu (reusable) ──────────────── */

interface DropdownItem {
  key: string;
  label: string;
  meta?: string;
}

function DropdownMenu({
  label,
  items,
  selectedKey,
  onSelect,
}: {
  label: string;
  items: DropdownItem[];
  selectedKey: string;
  onSelect: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const selected = items.find((i) => i.key === selectedKey);

  return (
    <div className="dd-wrapper" ref={ref}>
      <button className="dd-btn" onClick={() => setOpen((v) => !v)} type="button">
        {selected?.label ?? label}
        <span className="arrow">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="dd-panel">
          {items.map((item) => (
            <button
              key={item.key}
              className={cn("dd-item", item.key === selectedKey && "active")}
              onClick={() => {
                onSelect(item.key);
                setOpen(false);
              }}
              type="button"
            >
              {item.label}
              {item.meta && <span className="dd-meta">{item.meta}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ──────────────── Top Bar (review mode) ──────────────── */

interface TopBarProps {
  records: ResultRecord[];
  run: string;
  model: string;
  taskId?: number;
  onSelectRun: (run: string) => void;
  onSelectModel: (model: string) => void;
  onSelectTask?: (id: number) => void;
  showTask: boolean;
  puzzles?: { entries: PlacedEntry[] }[];
  puzzleIndex?: number;
  onSelectPuzzle?: (index: number) => void;
  onReset?: () => void;
  onReveal?: () => void;
}

export interface AppRouteContext {
  records: ResultRecord[];
  run: string;
  model: string;
  selectedRecord?: ResultRecord;
  selectedData: LoadedResult | null;
  selectedPuzzleIndex: number;
  numberedSlots: SlotWithNumber[];
  selectedSlot?: SlotWithNumber;
  hoveredSlot?: SlotWithNumber;
  selectedEntry?: PlacedEntry;
  currentSlotText: string;
  selectedSolved: boolean;
  boardState: {
    cells: ReturnType<typeof buildBoardState>["cells"];
    correctCellCount: number;
    playableCellCount: number;
    percent: number;
  } | null;
  error: string;
  openTask: (taskId: number) => void;
  selectSlot: (slot: SlotWithNumber | undefined) => void;
  setHoveredSlotKey: (key: string) => void;
  confirmDraft: (draft: string) => void;
}

function TopBar({
  records,
  run,
  model,
  taskId,
  onSelectRun,
  onSelectModel,
  onSelectTask,
  showTask,
  puzzles,
  puzzleIndex,
  onSelectPuzzle,
  onReset,
  onReveal,
}: TopBarProps) {
  const grouped = useMemo(() => groupResults(records), [records]);
  const timestamps = useMemo(() => grouped.map((g) => g.timestamp), [grouped]);
  const currentGroup = useMemo(
    () => grouped.find((g) => g.timestamp === run),
    [grouped, run],
  );
  const modelsInGroup = useMemo(
    () => currentGroup?.models ?? [],
    [currentGroup],
  );
  const modelNames = useMemo(
    () => modelsInGroup.map((m) => m.model),
    [modelsInGroup],
  );
  const currentModelTasks = useMemo(
    () => {
      const tasks = modelsInGroup.find((m) => m.model === model)?.tasks ?? [];
      return showTask ? tasks.filter((task) => task.playable) : tasks;
    },
    [modelsInGroup, model, showTask],
  );

  return (
    <div className="top-bar">
      <div className="top-bar-inner">
        <DropdownMenu
          label="Run"
          items={timestamps.map((t) => ({ key: t, label: t }))}
          selectedKey={run}
          onSelect={onSelectRun}
        />
        <DropdownMenu
          label="Model"
          items={modelNames.map((m) => ({ key: m, label: m }))}
          selectedKey={model}
          onSelect={onSelectModel}
        />
        {showTask && (
          <>
            <DropdownMenu
              label="Task"
              items={currentModelTasks.map((t) => ({
                key: String(t.taskId),
                label: t.taskName,
                meta: `F ${formatScore(t.summary?.finalScore)}`,
              }))}
              selectedKey={taskId !== undefined ? String(taskId) : ""}
              onSelect={(key) => onSelectTask?.(Number(key))}
            />
            <div className="top-bar__actions">
              <div className="puzzle-tabs" style={{ margin: 0 }}>
                {(puzzles ?? []).map((_, i) => (
                  <button
                    key={i}
                    className={cn("puzzle-tab", i === puzzleIndex && "is-active")}
                    onClick={() => onSelectPuzzle?.(i)}
                    type="button"
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={onReset} type="button">
                清空
              </Button>
              <Button size="sm" onClick={onReveal} type="button">
                答案
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ──────────────── App ──────────────── */

export default function App() {
  const [records, setRecords] = useState<ResultRecord[]>([]);
  const [selectedData, setSelectedData] = useState<LoadedResult | null>(null);
  const [selectedPuzzleIndex, setSelectedPuzzleIndex] = useState(0);
  const [selectedSlotKey, setSelectedSlotKey] = useState("");
  const [hoveredSlotKey, setHoveredSlotKey] = useState("");
  const [cellAnswers, setCellAnswers] = useState<CellStore>({});
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { run: runParam, model: modelParam } = useParams();

  const mode = location.pathname.endsWith("/benchmark") ? "benchmark" : "answer";

  useEffect(() => {
    loadManifest()
      .then((nextRecords) => {
        setRecords(nextRecords);
      })
      .catch((nextError: Error) => {
        setError(nextError.message);
      });
  }, []);

  // Derive run/model/task from URL + records
  const runs = useMemo(
    () => [...new Set(records.map((r) => r.timestamp))].sort().reverse(),
    [records],
  );

  const run = runs.includes(runParam ?? "") ? (runParam ?? "") : (runs[0] ?? "");

  const modelsInRun = useMemo(
    () => [...new Set(records.filter((r) => r.timestamp === run).map((r) => r.model))],
    [records, run],
  );

  const model = modelsInRun.includes(modelParam ?? "") ? (modelParam ?? "") : (modelsInRun[0] ?? "");

  const recordsForRunModel = useMemo(
    () => records.filter((r) => r.timestamp === run && r.model === model),
    [records, run, model],
  );
  const playableRecordsForRunModel = useMemo(
    () => recordsForRunModel.filter((record) => record.playable),
    [recordsForRunModel],
  );

  const taskParam = searchParams.get("task") ?? "";
  const selectedRecord = useMemo(() => {
    const candidateRecords = mode === "answer" ? playableRecordsForRunModel : recordsForRunModel;
    if (taskParam) {
      const parsedTaskId = Number(taskParam);
      const found = candidateRecords.find((r) => r.taskId === parsedTaskId);
      if (found) return found;
    }
    return candidateRecords[0];
  }, [mode, playableRecordsForRunModel, recordsForRunModel, taskParam]);

  function handleModeChange(newMode: "answer" | "benchmark") {
    const task = searchParams.get("task");
    const qs = task ? `?task=${task}` : "";
    navigate(`/runs/${run}/${model}/${newMode}${qs}`);
  }

  function handleSelectRun(newRun: string) {
    const newModels = [...new Set(records.filter((r) => r.timestamp === newRun).map((r) => r.model))];
    const firstModel = newModels[0] ?? "";
    navigate(`/runs/${newRun}/${firstModel}/${mode}`, { replace: true });
  }

  function handleSelectModel(newModel: string) {
    const task = searchParams.get("task");
    const qs = task ? `?task=${task}` : "";
    navigate(`/runs/${run}/${newModel}/${mode}${qs}`);
  }

  function handleSelectTask(id: number) {
    const next = new URLSearchParams(searchParams);
    next.set("task", String(id));
    setSearchParams(next, { replace: true });
  }

  function openTask(taskId: number) {
    navigate(`/runs/${run}/${model}/answer?task=${taskId}`);
  }

  // Sync URL when derived values don't match path params
  useEffect(() => {
    if (records.length === 0) return;
    const task =
      mode === "answer"
        ? selectedRecord?.taskId !== undefined
          ? String(selectedRecord.taskId)
          : ""
        : searchParams.get("task") ?? "";
    const qs = task ? `?task=${task}` : "";
    const target = `/runs/${run}/${model}/${mode}${qs}`;
    const current = window.location.pathname + (task ? `?task=${task}` : "");
    if (current !== target) {
      navigate(target, { replace: true });
    }
  }, [run, mode, model, searchParams, navigate, records.length, selectedRecord?.taskId]);

  useEffect(() => {
    if (!selectedRecord) {
      setSelectedData(null);
      return;
    }
    loadResult(selectedRecord)
      .then((data) => {
        setSelectedData(data);
        setError("");
      })
      .catch((nextError: Error) => {
        setError(nextError.message);
      });
  }, [selectedRecord]);

  const puzzles = selectedData?.result.puzzles ?? [];
  const puzzleIndex = Math.min(selectedPuzzleIndex, Math.max(0, puzzles.length - 1));
  const selectedPuzzle = puzzles[puzzleIndex];
  const slots = selectedData?.task.slots ?? [];
  const numberedSlots = useMemo(() => deriveSlotsWithNumbers(slots), [slots]);
  const entryMap = useMemo(() => buildEntryMap(selectedPuzzle?.entries ?? []), [selectedPuzzle]);
  const taskAnswers = cellAnswers[selectedRecord?.id ?? ""] ?? {};
  const puzzleCells = taskAnswers[puzzleIndex] ?? {};

  const boardState = useMemo(
    () =>
      selectedData && selectedPuzzle
        ? buildBoardState(
            selectedData.task.size ?? selectedData.task.grid.length,
            selectedData.task.grid,
            selectedPuzzle,
            puzzleCells,
          )
        : null,
    [selectedData, selectedPuzzle, puzzleCells],
  );

  const selectedEntry = selectedSlotKey ? entryMap.get(selectedSlotKey) : undefined;
  const selectedSlot = selectedSlotKey
    ? numberedSlots.find((s) => slotKey(s.direction, s.number) === selectedSlotKey)
    : undefined;
  const hoveredSlot = hoveredSlotKey
    ? numberedSlots.find((s) => slotKey(s.direction, s.number) === hoveredSlotKey)
    : undefined;
  const currentSlotText = selectedSlot ? getSlotCurrentText(selectedSlot, puzzleCells) : "";
  const selectedSolved =
    selectedEntry && selectedSlot
      ? isSolved(selectedEntry, getSlotResolvedText(selectedSlot, puzzleCells))
      : false;

  useEffect(() => {
    if (!selectedPuzzle) {
      setSelectedSlotKey("");
      return;
    }
    const first = [...entryMap.values()].sort((a, b) => {
      if (a.number !== b.number) return a.number - b.number;
      return a.direction === "across" ? -1 : 1;
    })[0];
    if (first) setSelectedSlotKey((cur) => cur || entryKey(first));
  }, [entryMap, selectedPuzzle]);

  useEffect(() => {
    setSelectedPuzzleIndex(0);
    setSelectedSlotKey("");
    setHoveredSlotKey("");
  }, [taskParam]);

  useEffect(() => {
    setSelectedSlotKey("");
    setHoveredSlotKey("");
  }, [puzzleIndex]);

  function revealAllAnswers() {
    if (!selectedPuzzle) return;
    const nextCells = selectedPuzzle.entries.reduce(
      (cells, entry) => {
        const slot = numberedSlots.find(
          (item) => item.direction === entry.direction && item.number === entry.number,
        );
        return slot ? applySlotDraft(slot, entry.reading, cells) : cells;
      },
      { ...puzzleCells },
    );
    setCellAnswers((prev) => ({
      ...prev,
      [selectedRecord?.id ?? ""]: { ...(prev[selectedRecord?.id ?? ""] ?? {}), [puzzleIndex]: nextCells },
    }));
  }

  function resetPuzzle() {
    setCellAnswers((prev) => ({
      ...prev,
      [selectedRecord?.id ?? ""]: { ...(prev[selectedRecord?.id ?? ""] ?? {}), [puzzleIndex]: {} },
    }));
  }

  function confirmDraft(draftAnswer: string) {
    if (!selectedSlot) return;
    const nextCells = applySlotDraft(selectedSlot, draftAnswer, puzzleCells);
    startTransition(() => {
      setCellAnswers((prev) => ({
        ...prev,
        [selectedRecord?.id ?? ""]: { ...(prev[selectedRecord?.id ?? ""] ?? {}), [puzzleIndex]: nextCells },
      }));
    });
  }

  function selectSlot(slot: SlotWithNumber | undefined) {
    if (!slot) return;
    setSelectedSlotKey(slotKey(slot.direction, slot.number));
  }

  const outletContext: AppRouteContext = {
    records,
    run,
    model,
    selectedRecord,
    selectedData,
    selectedPuzzleIndex: puzzleIndex,
    numberedSlots,
    selectedSlot,
    hoveredSlot,
    selectedEntry,
    currentSlotText,
    selectedSolved,
    boardState,
    error,
    openTask,
    selectSlot,
    setHoveredSlotKey,
    confirmDraft,
  };

  return (
    <div className="app-shell--review">
      <ModeNav mode={mode} onModeChange={handleModeChange} />
      <TopBar
        records={records}
        run={run}
        model={model}
        taskId={selectedRecord?.taskId}
        onSelectRun={handleSelectRun}
        onSelectModel={handleSelectModel}
        onSelectTask={handleSelectTask}
        showTask={true}
        puzzles={puzzles}
        puzzleIndex={puzzleIndex}
        onSelectPuzzle={setSelectedPuzzleIndex}
        onReset={resetPuzzle}
        onReveal={revealAllAnswers}
      />

      <div className="content-center">
        <main className="main-panel main-panel--review">
          <Outlet context={outletContext} />
        </main>
      </div>
    </div>
  );
}
