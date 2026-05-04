import { memo, startTransition, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Input } from "./components/ui/input";
import { groupResults, loadManifest, loadResult } from "./data";
import {
  applySlotDraft,
  buildBoardState,
  deriveSlotsWithNumbers,
  entryKey,
  getPrimarySlotAtCell,
  getSlotCurrentText,
  getSlotResolvedText,
  isCellInSlot,
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

interface AnswerEditorProps {
  selectedId: string;
  puzzleIndex: number;
  selectedEntry?: PlacedEntry;
  selectedSlot?: SlotWithNumber;
  currentText: string;
  isSolved: boolean;
  onConfirm: (draft: string) => void;
}

const AnswerEditor = memo(function AnswerEditor({
  selectedId,
  puzzleIndex,
  selectedEntry,
  selectedSlot,
  currentText,
  isSolved,
  onConfirm,
}: AnswerEditorProps) {
  const [draftAnswer, setDraftAnswer] = useState("");

  useEffect(() => {
    setDraftAnswer(currentText);
  }, [selectedId, puzzleIndex, selectedEntry?.number, selectedEntry?.direction, currentText]);

  return (
    <Card className="answer-panel">
      <CardHeader>
        <CardTitle>
          {selectedEntry
            ? `${selectedEntry.number} ${selectedEntry.direction === "across" ? "Across" : "Down"}`
            : "Answer"}
        </CardTitle>
      </CardHeader>
      <CardContent className="answer-panel__body">
        {isSolved && selectedEntry ? <div className="answer-word">{selectedEntry.word}</div> : null}
        <div className="answer-clue">{selectedEntry?.clue ?? ""}</div>
        <Input
          value={draftAnswer}
          onChange={(event) => setDraftAnswer(event.target.value)}
          disabled={!selectedEntry}
          placeholder=""
        />
        <Button onClick={() => onConfirm(draftAnswer)} type="button" disabled={!selectedSlot}>
          确定
        </Button>
      </CardContent>
    </Card>
  );
});

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

/* ──────────────── Benchmark View ──────────────── */

function round(v: number, d = 4) {
  return Number(v.toFixed(d));
}

function renderScoreBar(value: number | undefined, label: string, maxWidth = 100) {
  const pct = Math.round((value ?? 0) * 100);
  const color = pct >= 90 ? "#22c55e" : pct >= 70 ? "#eab308" : pct >= 50 ? "#f97316" : "#ef4444";
  const w = Math.min(Math.round((value ?? 0) * maxWidth), maxWidth);
  return (
    <div className="score-bar" key={label}>
      <div className="score-bar__label">{label}</div>
      <div className="score-bar__track">
        <div className="score-bar__fill" style={{ width: w, background: color }} />
      </div>
      <div className="score-bar__value">{pct}%</div>
    </div>
  );
}

/* ──────────────── Puzzle / Grid Components ──────────────── */

function PuzzleGrid({ grid, size, entries }: { grid: string[][]; size: number; entries: PlacedEntry[] }) {
  const charMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of entries) {
      const chars = Array.from(entry.reading ?? "");
      for (let i = 0; i < chars.length; i++) {
        const row = entry.direction === "across" ? entry.row : entry.row + i;
        const col = entry.direction === "across" ? entry.col + i : entry.col;
        const key = `${row}:${col}`;
        const prev = map.get(key);
        const next = chars[i];
        map.set(key, prev && prev !== next ? "✗" : next);
      }
    }
    return map;
  }, [entries]);

  const cellSize = 30;
  const fontSize = 15;

  return (
    <table style={{ borderCollapse: "collapse", fontSize, lineHeight: 1, margin: "0 auto" }}>
      <thead>
        <tr>
          <td style={{ width: 18 }}></td>
          {Array.from({ length: size }, (_, c) => (
            <td key={c} style={{ width: cellSize, textAlign: "center", fontSize: 10, color: "#64748b" }}>
              {c}
            </td>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: size }, (_, r) => (
          <tr key={r}>
            <td style={{ textAlign: "center", fontSize: 10, color: "#64748b" }}>{r}</td>
            {Array.from({ length: size }, (_, c) => {
              const isBlack = grid[r]?.[c] === "#";
              if (isBlack) {
                return (
                  <td
                    key={c}
                    style={{
                      width: cellSize,
                      height: cellSize,
                      background: "#1e293b",
                      border: "1px solid #94a3b8",
                    }}
                  />
                );
              }
              const ch = charMap.get(`${r}:${c}`) ?? "";
              const color = ch === "✗" ? "#ef4444" : "#0f172a";
              const bg = ch ? "#f0fdf4" : "#f8fafc";
              return (
                <td
                  key={c}
                  style={{
                    width: cellSize,
                    height: cellSize,
                    textAlign: "center",
                    verticalAlign: "middle",
                    border: "1px solid #94a3b8",
                    color,
                    fontWeight: 600,
                    background: bg,
                    fontSize,
                  }}
                >
                  {ch}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EntriesTable({ entries }: { entries: PlacedEntry[] }) {
  if (!entries?.length) return <p style={{ color: "#94a3b8", fontStyle: "italic", margin: 0 }}>No entries</p>;

  const sorted = [...entries].sort((a, b) => a.number - b.number || a.row - b.row || a.col - b.col);

  return (
    <table className="bench-entries">
      <thead>
        <tr>
          <th>#</th>
          <th>Dir</th>
          <th>Pos</th>
          <th>Word</th>
          <th>Reading</th>
          <th>Clue</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((e, i) => (
          <tr key={i}>
            <td>{e.number}</td>
            <td>{e.direction}</td>
            <td style={{ color: "#64748b", fontSize: 11 }}>
              ({e.row},{e.col})
            </td>
            <td style={{ fontWeight: 500 }}>{e.word}</td>
            <td style={{ color: "#475569" }}>{e.reading}</td>
            <td style={{ color: "#64748b", fontSize: 12, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {e.clue}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function BenchmarkView({
  records,
  run,
  model,
  onOpenTask,
}: {
  records: ResultRecord[];
  run: string;
  model: string;
  onOpenTask: (taskId: string) => void;
}) {
  const grouped = useMemo(() => groupResults(records), [records]);

  const [loadedResults, setLoadedResults] = useState<Record<string, LoadedResult | "loading">>({});
  const [activePuzzleMap, setActivePuzzleMap] = useState<Record<string, number>>({});

  async function loadTaskResult(record: ResultRecord) {
    if (loadedResults[record.id]) return;
    setLoadedResults((prev) => ({ ...prev, [record.id]: "loading" }));
    try {
      const data = await loadResult(record);
      setLoadedResults((prev) => ({ ...prev, [record.id]: data }));
    } catch {
      // fail silently
    }
  }

  const runs = useMemo(
    () =>
      grouped.map((g) => ({
        timestamp: g.timestamp,
        models: g.models.map((m) => {
          const r = m.tasks;
          const avg = (fn: (t: ResultRecord) => number) =>
            r.length > 0 ? round(r.reduce((a, b) => a + fn(b), 0) / r.length) : 0;
          return {
            name: m.model,
            avgFinalScore: avg((x) => x.summary?.finalScore ?? 0),
            avgOverallScore: avg((x) => x.summary?.overallScore ?? 0),
            avgVpr: avg((x) => x.summary?.validPuzzleRate ?? 0),
            avgPf: avg((x) => x.summary?.preferenceFit ?? 0),
            avgCpv: avg((x) => x.summary?.crossPuzzleVariety ?? 0),
            avgTime: avg((x) => x.summary?.elapsedMs ?? 0),
            totalTime: r.reduce((a, b) => a + (b.summary?.elapsedMs ?? 0), 0),
            tasks: m.tasks,
          };
        }),
      })),
    [grouped],
  );

  const filteredRuns = useMemo(
    () => runs.filter((r) => r.timestamp === run),
    [runs, run],
  );

  const selectedRun = filteredRuns[0];

  return (
    <div className="benchmark-container">
      <div className="subtitle">
        {records.length} tasks · {selectedRun ? `${selectedRun.models.length} models` : ""}
      </div>

      {selectedRun && (
        <div key={selectedRun.timestamp} style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 8px", color: "var(--ink)" }}>
            {selectedRun.timestamp}
          </h2>

          <Card style={{ padding: 0, overflow: "hidden" }}>
            <table className="leaderboard">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Model</th>
                  <th>finalScore</th>
                  <th>overall</th>
                  <th>validRate</th>
                  <th>prefFit</th>
                  <th>variety</th>
                  <th>Avg Time</th>
                </tr>
              </thead>
              <tbody>
                {selectedRun.models.map((m, i) => (
                  <tr key={m.name} className={i === 0 ? "r1" : ""}>
                    <td>{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}</td>
                    <td>{m.name}</td>
                    <td>{m.avgFinalScore}</td>
                    <td>{m.avgOverallScore}</td>
                    <td>{m.avgVpr}</td>
                    <td>{m.avgPf}</td>
                    <td>{m.avgCpv}</td>
                    <td>{Math.round(m.avgTime)}ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {selectedRun.models.filter((m) => m.name === model).map((mdl) => (
            <div key={mdl.name} style={{ marginTop: 16 }}>
              <div className="stat-grid">
                <div className="stat-box">
                  <div className="v">{mdl.avgFinalScore}</div>
                  <div className="l">Avg Final Score</div>
                </div>
                <div className="stat-box">
                  <div className="v">{mdl.avgOverallScore}</div>
                  <div className="l">Avg Overall</div>
                </div>
                <div className="stat-box">
                  <div className="v">{mdl.avgVpr}</div>
                  <div className="l">Valid Rate</div>
                </div>
                <div className="stat-box">
                  <div className="v">{mdl.avgPf}</div>
                  <div className="l">Preference Fit</div>
                </div>
                <div className="stat-box">
                  <div className="v">{mdl.avgCpv}</div>
                  <div className="l">Variety</div>
                </div>
                <div className="stat-box">
                  <div className="v">{mdl.totalTime}ms</div>
                  <div className="l">Total Time</div>
                </div>
              </div>

              {mdl.tasks.map((task) => {
                const s = task.summary;
                if (!s) return null;

                return (
                  <div key={task.id} className="accordion" style={{ marginTop: 4 }}>
                    <div
                      className="accordion-h"
                      onClick={(e) => {
                        e.currentTarget.parentElement!.classList.toggle("open");
                        loadTaskResult(task);
                      }}
                    >
                      <span className="ar">▶</span>
                      <span className="tn">{task.taskName}</span>
                      <span className="ss">
                        <span>Score: {s.overallScore}</span>
                        <span>{s.elapsedMs ?? "-"}ms</span>
                      </span>
                    </div>
                    <div className="accordion-bd">
                      <div className="bars">
                        {renderScoreBar(s.validPuzzleRate, "Valid Rate")}
                        {renderScoreBar(s.preferenceFit, "Preference Fit")}
                        {renderScoreBar(s.crossPuzzleVariety, "Variety")}
                        {renderScoreBar(s.timeScore, "Time Score")}
                      </div>
                      <div className="detail-line">
                        <span>overallScore: <strong>{s.overallScore}</strong></span>
                        <span>validPuzzleRate: <strong>{s.validPuzzleRate}</strong></span>
                        <span>preferenceFit: <strong>{s.preferenceFit}</strong></span>
                        <span>crossPuzzleVariety: <strong>{s.crossPuzzleVariety}</strong></span>
                        <span>elapsed: <strong>{s.elapsedMs}ms</strong></span>
                        <span>finalScore: <strong>{s.finalScore}</strong></span>
                      </div>
                      {loadedResults[task.id] === "loading" && (
                      <div style={{ color: "var(--muted)", padding: "8px 0" }}>加载中...</div>
                    )}
                    {loadedResults[task.id] && loadedResults[task.id] !== "loading" && (() => {
                      const loaded = loadedResults[task.id] as LoadedResult;
                      const puzzles = loaded.result.puzzles;
                      const idx = activePuzzleMap[task.id] ?? 0;
                      const puzzle = puzzles[idx];
                      return (
                        <div style={{ marginTop: 12 }}>
                          {puzzles.length > 1 && (
                            <div className="puzzle-tabs" style={{ margin: "0 0 10px" }}>
                              {puzzles.map((_, pi) => (
                                <button
                                  key={pi}
                                  className={cn("puzzle-tab", pi === idx && "is-active")}
                                  onClick={() => setActivePuzzleMap((prev) => ({ ...prev, [task.id]: pi }))}
                                  type="button"
                                >
                                  {pi + 1}
                                </button>
                              ))}
                            </div>
                          )}
                          {puzzle && (
                            <div className="ge">
                              <div style={{ display: "flex", justifyContent: "center" }}>
                                <PuzzleGrid
                                  grid={loaded.task.grid}
                                  size={loaded.task.size ?? loaded.task.grid.length}
                                  entries={puzzle.entries}
                                />
                              </div>
                              <div>
                                <EntriesTable entries={puzzle.entries} />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                    <button
                        className="summary-task"
                        onClick={() => onOpenTask(task.taskId)}
                        type="button"
                        style={{ marginTop: 8, display: "inline-block", width: "auto" }}
                      >
                        去答题 →
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
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
            <BenchmarkView
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
          <>
            <header className="workspace-header">
              <div>
                <div className="eyebrow">{selectedRecord.model}</div>
                <h2>{selectedRecord.taskName}</h2>
              </div>
              <div className="workspace-header__actions">
                <Card className="score-card">
                  <CardContent className="score-card__content">
                    <div className="score-label">完成度</div>
                    <div className="score-value">{boardState.percent}%</div>
                    <div className="score-detail">
                      {boardState.correctCellCount}/{boardState.playableCellCount}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </header>

            <section className="play-area">
              <Card className="board-panel">
                <CardContent className="board-panel__content">
                  <div
                    className="crossword-board"
                    style={{
                      gridTemplateColumns: `repeat(${selectedData.task.size ?? selectedData.task.grid.length}, minmax(0, 1fr))`,
                    }}
                  >
                    {boardState.cells.flat().map((cell, index) => {
                      const size = selectedData.task.size ?? selectedData.task.grid.length;
                      const row = Math.floor(index / size);
                      const col = index % size;
                      const startLabels = numberedSlots
                        .filter((slot) => slot.row === row && slot.col === col)
                        .map((slot) => slot.number);
                      const label = startLabels[0];
                      const prioritySlot = getPrimarySlotAtCell(numberedSlots, row, col);
                      return (
                        <button
                          key={`${row}-${col}`}
                          type="button"
                          className={cn(
                            "board-cell",
                            cell.isBlack && "is-black",
                            cell.isCorrect && "is-correct",
                            selectedSlot && isCellInSlot(selectedSlot, row, col) && "is-selected",
                            hoveredSlot && isCellInSlot(hoveredSlot, row, col) && "is-hovered",
                          )}
                          onMouseEnter={() =>
                            setHoveredSlotKey(
                              prioritySlot ? slotKey(prioritySlot.direction, prioritySlot.number) : "",
                            )
                          }
                          onMouseLeave={() => setHoveredSlotKey("")}
                          onClick={() => selectSlot(prioritySlot)}
                          disabled={cell.isBlack}
                        >
                          {!cell.isBlack && label ? (
                            <span className="cell-number">{label}</span>
                          ) : null}
                          {!cell.isBlack ? <span className="cell-char">{cell.actual ?? ""}</span> : null}
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              <div className="clue-panel">
                <AnswerEditor
                  selectedId={selectedRecord?.id ?? ""}
                  puzzleIndex={puzzleIndex}
                  selectedEntry={selectedEntry}
                  selectedSlot={selectedSlot}
                  currentText={currentSlotText}
                  isSolved={selectedSolved}
                  onConfirm={confirmDraft}
                />
              </div>
            </section>
          </>
        ) : (
          <div className="empty-state">{error || "No result selected."}</div>
        )}
      </main>
    </div>
    </div>
  );
}
