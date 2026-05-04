import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
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
import AnswerPage from "./pages/AnswerPage";
import BenchmarkPage from "./pages/BenchmarkPage";

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
  taskId?: string;
  onSelectRun: (run: string) => void;
  onSelectModel: (model: string) => void;
  onSelectTask?: (id: string) => void;
  showTask: boolean;
  puzzles?: { entries: PlacedEntry[] }[];
  puzzleIndex?: number;
  onSelectPuzzle?: (index: number) => void;
  onReset?: () => void;
  onReveal?: () => void;
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
    () => modelsInGroup.find((m) => m.model === model)?.tasks ?? [],
    [modelsInGroup, model],
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
                key: t.taskId,
                label: t.taskName,
                meta: `F ${formatScore(t.summary?.finalScore)}`,
              }))}
              selectedKey={taskId ?? ""}
              onSelect={onSelectTask ?? (() => {})}
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
  const [searchParams, setSearchParams] = useSearchParams();
  const { run: runParam, mode: modeParam, model: modelParam } = useParams();

  const mode = modeParam === "benchmark" ? "benchmark" : "answer";

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

  const taskParam = searchParams.get("task") ?? "";
  const selectedRecord = useMemo(() => {
    if (taskParam) {
      const found = recordsForRunModel.find((r) => r.taskId === taskParam);
      if (found) return found;
    }
    return recordsForRunModel[0];
  }, [recordsForRunModel, taskParam]);

  function handleModeChange(newMode: "answer" | "benchmark") {
    const task = searchParams.get("task");
    const qs = task ? `?task=${task}` : "";
    navigate(`/runs/${run}/${newMode}/${model}${qs}`);
  }

  function handleSelectRun(newRun: string) {
    const newModels = [...new Set(records.filter((r) => r.timestamp === newRun).map((r) => r.model))];
    const firstModel = newModels[0] ?? "";
    navigate(`/runs/${newRun}/${mode}/${firstModel}`, { replace: true });
  }

  function handleSelectModel(newModel: string) {
    const task = searchParams.get("task");
    const qs = task ? `?task=${task}` : "";
    navigate(`/runs/${run}/${mode}/${newModel}${qs}`);
  }

  function handleSelectTask(id: string) {
    const next = new URLSearchParams(searchParams);
    next.set("task", id);
    setSearchParams(next, { replace: true });
  }

  function openTask(taskId: string) {
    navigate(`/runs/${run}/answer/${model}?task=${taskId}`);
  }

  // Sync URL when derived values don't match path params
  useEffect(() => {
    if (records.length === 0) return;
    const task = searchParams.get("task");
    const qs = task ? `?task=${task}` : "";
    const target = `/runs/${run}/${mode}/${model}${qs}`;
    const current = window.location.pathname + (task ? `?task=${task}` : "");
    if (current !== target) {
      navigate(target, { replace: true });
    }
  }, [run, mode, model, searchParams, navigate, records.length]);

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

  if (mode === "benchmark") {
    return (
      <div className="app-shell--review">
        <ModeNav mode={mode} onModeChange={handleModeChange} />
        <TopBar
          records={records}
          run={run}
          model={model}
          onSelectRun={handleSelectRun}
          onSelectModel={handleSelectModel}
          showTask={false}
        />
        <div className="content-center">
          <main className="main-panel main-panel--review">
            <BenchmarkPage
              records={records}
              run={run}
              model={model}
              onOpenTask={openTask}
            />
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell--review">
      <ModeNav mode={mode} onModeChange={handleModeChange} />
      <TopBar
        records={records}
        run={run}
        model={model}
        taskId={selectedRecord?.taskId ?? ""}
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
        {selectedRecord && selectedData && selectedPuzzle && boardState ? (
          <AnswerPage
            selectedRecord={selectedRecord}
            selectedData={selectedData}
            boardState={boardState}
            numberedSlots={numberedSlots}
            selectedSlot={selectedSlot}
            hoveredSlot={hoveredSlot}
            selectedEntry={selectedEntry}
            currentSlotText={currentSlotText}
            selectedSolved={selectedSolved}
            puzzleIndex={puzzleIndex}
            error={error}
            onSelectSlot={selectSlot}
            onSetHoveredSlotKey={setHoveredSlotKey}
            onConfirmDraft={confirmDraft}
          />
        ) : (
          <div className="empty-state">{error || "No result selected."}</div>
        )}
      </main>
    </div>
    </div>
  );
}
