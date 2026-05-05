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
type SubmissionStore = Record<string, Record<number, number | undefined>>;

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
  templateId?: number;
  onSelectRun: (run: string) => void;
  onSelectModel: (model: string) => void;
  onSelectTemplate?: (id: number) => void;
  showTemplate: boolean;
  puzzles?: { entries: PlacedEntry[] }[];
  puzzleIndex?: number;
  onSelectPuzzle?: (index: number) => void;
  onReset?: () => void;
  onSubmit?: () => void;
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
  puzzleCells: Record<string, string>;
  currentSlotText: string;
  selectedSolved: boolean;
  submittedScore?: number;
  boardState: {
    cells: ReturnType<typeof buildBoardState>["cells"];
    filledCellCount: number;
    playableCellCount: number;
    percent: number;
  } | null;
  error: string;
  openTemplate: (templateId: number) => void;
  selectSlot: (slot: SlotWithNumber | undefined) => void;
  setHoveredSlotKey: (key: string) => void;
  confirmDraft: (draft: string) => void;
}

function TopBar({
  records,
  run,
  model,
  templateId,
  onSelectRun,
  onSelectModel,
  onSelectTemplate,
  showTemplate,
  puzzles,
  puzzleIndex,
  onSelectPuzzle,
  onReset,
  onSubmit,
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
  const currentModelTemplates = useMemo(
    () => {
      const templates = modelsInGroup.find((m) => m.model === model)?.templates ?? [];
      return showTemplate ? templates.filter((template) => template.playable) : templates;
    },
    [modelsInGroup, model, showTemplate],
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
        {showTemplate && (
          <>
            <DropdownMenu
              label="Template"
              items={currentModelTemplates.map((t) => ({
                key: String(t.templateId),
                label: t.templateName,
                meta: `F ${formatScore(t.summary?.finalScore)}`,
              }))}
              selectedKey={templateId !== undefined ? String(templateId) : ""}
              onSelect={(key) => onSelectTemplate?.(Number(key))}
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
              <Button size="sm" onClick={onSubmit} type="button">
                提交
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
  const [submissionScores, setSubmissionScores] = useState<SubmissionStore>({});
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

  const templateParam = searchParams.get("template") ?? "";
  const selectedRecord = useMemo(() => {
    const candidateRecords = mode === "answer" ? playableRecordsForRunModel : recordsForRunModel;
    if (templateParam) {
      const parsedTemplateId = Number(templateParam);
      const found = candidateRecords.find((r) => r.templateId === parsedTemplateId);
      if (found) return found;
    }
    return candidateRecords[0];
  }, [mode, playableRecordsForRunModel, recordsForRunModel, templateParam]);

  function handleModeChange(newMode: "answer" | "benchmark") {
    const template = searchParams.get("template");
    const qs = template ? `?template=${template}` : "";
    navigate(`/runs/${run}/${model}/${newMode}${qs}`);
  }

  function handleSelectRun(newRun: string) {
    const newModels = [...new Set(records.filter((r) => r.timestamp === newRun).map((r) => r.model))];
    const firstModel = newModels[0] ?? "";
    navigate(`/runs/${newRun}/${firstModel}/${mode}`, { replace: true });
  }

  function handleSelectModel(newModel: string) {
    const template = searchParams.get("template");
    const qs = template ? `?template=${template}` : "";
    navigate(`/runs/${run}/${newModel}/${mode}${qs}`);
  }

  function handleSelectTemplate(id: number) {
    const next = new URLSearchParams(searchParams);
    next.set("template", String(id));
    setSearchParams(next, { replace: true });
  }

  function openTemplate(templateId: number) {
    navigate(`/runs/${run}/${model}/answer?template=${templateId}`);
  }

  // Sync URL when derived values don't match path params
  useEffect(() => {
    if (records.length === 0) return;
    const template =
      mode === "answer"
        ? selectedRecord?.templateId !== undefined
          ? String(selectedRecord.templateId)
          : ""
        : searchParams.get("template") ?? "";
    const qs = template ? `?template=${template}` : "";
    const target = `/runs/${run}/${model}/${mode}${qs}`;
    const current = window.location.pathname + (template ? `?template=${template}` : "");
    if (current !== target) {
      navigate(target, { replace: true });
    }
  }, [run, mode, model, searchParams, navigate, records.length, selectedRecord?.templateId]);

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
  const slots = selectedData?.template.slots ?? [];
  const numberedSlots = useMemo(() => deriveSlotsWithNumbers(slots), [slots]);
  const entryMap = useMemo(() => buildEntryMap(selectedPuzzle?.entries ?? []), [selectedPuzzle]);
  const taskAnswers = cellAnswers[selectedRecord?.id ?? ""] ?? {};
  const puzzleCells = taskAnswers[puzzleIndex] ?? {};
  const submittedScore = submissionScores[selectedRecord?.id ?? ""]?.[puzzleIndex];

  const boardState = useMemo(
    () =>
      selectedData && selectedPuzzle
        ? buildBoardState(
            selectedData.template.size ?? selectedData.template.grid.length,
            selectedData.template.grid,
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
  }, [templateParam]);

  useEffect(() => {
    setSelectedSlotKey("");
    setHoveredSlotKey("");
  }, [puzzleIndex]);

  function resetPuzzle() {
    setCellAnswers((prev) => ({
      ...prev,
      [selectedRecord?.id ?? ""]: { ...(prev[selectedRecord?.id ?? ""] ?? {}), [puzzleIndex]: {} },
    }));
    setSubmissionScores((prev) => ({
      ...prev,
      [selectedRecord?.id ?? ""]: { ...(prev[selectedRecord?.id ?? ""] ?? {}), [puzzleIndex]: undefined },
    }));
  }

  function submitPuzzle() {
    if (!boardState) return;
    const correctCount = boardState.cells.flat().filter((cell) => !cell.isBlack && cell.isCorrect).length;
    const score =
      boardState.playableCellCount === 0
        ? 0
        : Math.round((correctCount / boardState.playableCellCount) * 100);
    setSubmissionScores((prev) => ({
      ...prev,
      [selectedRecord?.id ?? ""]: { ...(prev[selectedRecord?.id ?? ""] ?? {}), [puzzleIndex]: score },
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
    setSubmissionScores((prev) => ({
      ...prev,
      [selectedRecord?.id ?? ""]: { ...(prev[selectedRecord?.id ?? ""] ?? {}), [puzzleIndex]: undefined },
    }));
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
    puzzleCells,
    currentSlotText,
    selectedSolved,
    submittedScore,
    boardState,
    error,
    openTemplate,
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
        templateId={selectedRecord?.templateId}
        onSelectRun={handleSelectRun}
        onSelectModel={handleSelectModel}
        onSelectTemplate={handleSelectTemplate}
        showTemplate={mode === "answer"}
        puzzles={puzzles}
        puzzleIndex={puzzleIndex}
        onSelectPuzzle={setSelectedPuzzleIndex}
        onReset={resetPuzzle}
        onSubmit={submitPuzzle}
      />

      <div className="content-center">
        <main
          className={`main-panel main-panel--review ${
            mode === "answer" ? "main-panel--answer" : "main-panel--benchmark"
          }`}
        >
          <Outlet context={outletContext} />
        </main>
      </div>
    </div>
  );
}
