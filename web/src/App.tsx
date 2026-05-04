import { memo, startTransition, useEffect, useMemo, useState } from "react";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./components/ui/collapsible";
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
import type { LoadedResult, PlacedEntry, ResultRecord } from "./types";

type CellStore = Record<string, Record<number, Record<string, string>>>;

function formatSummary(record: ResultRecord) {
  const summary = record.summary;
  if (!summary) return "";
  return `F ${summary.finalScore?.toFixed(3) ?? "0.000"} · O ${summary.overallScore.toFixed(3)}`;
}

function buildEntryMap(entries: PlacedEntry[]) {
  return new Map(entries.map((entry) => [slotKey(entry.direction, entry.number), entry]));
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
        <CardTitle>{selectedEntry ? `${selectedEntry.number} ${selectedEntry.direction === "across" ? "Across" : "Down"}` : "Answer"}</CardTitle>
      </CardHeader>
      <CardContent className="answer-panel__body">
        {isSolved && selectedEntry ? <div className="answer-word">{selectedEntry.word}</div> : null}
        <div className="answer-clue">{selectedEntry?.clue ?? ""}</div>
        <Input
          value={draftAnswer}
          onChange={(event) => {
            setDraftAnswer(event.target.value);
          }}
          disabled={!selectedEntry}
          placeholder=""
        />
        <Button
          onClick={() => onConfirm(draftAnswer)}
          type="button"
          disabled={!selectedSlot}
        >
          确定
        </Button>
      </CardContent>
    </Card>
  );
});

export default function App() {
  const [records, setRecords] = useState<ResultRecord[]>([]);
  const [selectedData, setSelectedData] = useState<LoadedResult | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [selectedPuzzleIndex, setSelectedPuzzleIndex] = useState(0);
  const [selectedSlotKey, setSelectedSlotKey] = useState("");
  const [hoveredSlotKey, setHoveredSlotKey] = useState("");
  const [cellAnswers, setCellAnswers] = useState<CellStore>({});
  const [error, setError] = useState("");
  const [openTimes, setOpenTimes] = useState<Record<string, boolean>>({});
  const [openModels, setOpenModels] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadManifest()
      .then((nextRecords) => {
        setRecords(nextRecords);
        if (nextRecords[0]) {
          setSelectedId((current) => current || nextRecords[0].id);
          setOpenTimes((current) => ({ ...current, [nextRecords[0].timestamp]: true }));
          setOpenModels((current) => ({ ...current, [`${nextRecords[0].timestamp}/${nextRecords[0].model}`]: true }));
        }
      })
      .catch((nextError: Error) => {
        setError(nextError.message);
      });
  }, []);

  const selectedRecord = records.find((record) => record.id === selectedId) ?? records[0];

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

  const groupedResults = useMemo(() => groupResults(records), [records]);
  const puzzles = selectedData?.result.puzzles ?? [];
  const puzzleIndex = Math.min(selectedPuzzleIndex, Math.max(0, puzzles.length - 1));
  const selectedPuzzle = puzzles[puzzleIndex];
  const slots = selectedData?.task.slots ?? [];
  const numberedSlots = useMemo(() => deriveSlotsWithNumbers(slots), [slots]);
  const entryMap = useMemo(() => buildEntryMap(selectedPuzzle?.entries ?? []), [selectedPuzzle]);

  useEffect(() => {
    if (!selectedPuzzle) {
      setSelectedSlotKey("");
      return;
    }
    const defaultEntry = [...entryMap.values()].sort((left, right) => {
      if (left.number !== right.number) return left.number - right.number;
      return left.direction === "across" ? -1 : 1;
    })[0];
    setSelectedSlotKey((current) => current || (defaultEntry ? entryKey(defaultEntry) : ""));
  }, [entryMap, selectedPuzzle]);

  useEffect(() => {
    setSelectedPuzzleIndex(0);
    setSelectedSlotKey("");
    setHoveredSlotKey("");
  }, [selectedId]);

  useEffect(() => {
    setSelectedSlotKey("");
    setHoveredSlotKey("");
  }, [puzzleIndex]);

  const taskAnswers = cellAnswers[selectedId] ?? {};
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
    ? numberedSlots.find((slot) => slotKey(slot.direction, slot.number) === selectedSlotKey)
    : undefined;
  const hoveredSlot = hoveredSlotKey
    ? numberedSlots.find((slot) => slotKey(slot.direction, slot.number) === hoveredSlotKey)
    : undefined;
  const currentSlotText = selectedSlot ? getSlotCurrentText(selectedSlot, puzzleCells) : "";

  function revealAllAnswers() {
    if (!selectedPuzzle) return;
    const nextCells = selectedPuzzle.entries.reduce((cells, entry) => {
      const slot = numberedSlots.find((item) => item.direction === entry.direction && item.number === entry.number);
      return slot ? applySlotDraft(slot, entry.reading, cells) : cells;
    }, { ...puzzleCells });
    setCellAnswers((current) => ({
      ...current,
      [selectedId]: {
        ...(current[selectedId] ?? {}),
        [puzzleIndex]: nextCells,
      },
    }));
  }

  function resetPuzzle() {
    setCellAnswers((current) => ({
      ...current,
      [selectedId]: {
        ...(current[selectedId] ?? {}),
        [puzzleIndex]: {},
      },
    }));
  }

  function toggleTime(timestamp: string) {
    setOpenTimes((current) => ({ ...current, [timestamp]: !current[timestamp] }));
  }

  function toggleModel(timestamp: string, model: string) {
    const key = `${timestamp}/${model}`;
    setOpenModels((current) => ({ ...current, [key]: !current[key] }));
  }

  function selectSlot(slot: SlotWithNumber | undefined) {
    if (!slot) return;
    setSelectedSlotKey(slotKey(slot.direction, slot.number));
  }

  function confirmDraft(draftAnswer: string) {
    if (!selectedSlot) return;
    const nextCells = applySlotDraft(selectedSlot, draftAnswer, puzzleCells);
    startTransition(() => {
      setCellAnswers((current) => ({
        ...current,
        [selectedId]: {
          ...(current[selectedId] ?? {}),
          [puzzleIndex]: nextCells,
        },
      }));
    });
  }

  const selectedSolved = selectedEntry && selectedSlot
    ? isSolved(selectedEntry, getSlotResolvedText(selectedSlot, puzzleCells))
    : false;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>Crossword Review</h1>
        </div>
        <div className="result-groups">
          {groupedResults.map((group) => {
            const timeOpen = openTimes[group.timestamp] ?? false;
            return (
              <Collapsible key={group.timestamp} open={timeOpen} className="tree-node tree-node--time">
                <CollapsibleTrigger
                  className="tree-trigger"
                  onClick={() => toggleTime(group.timestamp)}
                >
                  <span>{group.timestamp}</span>
                  <span>{timeOpen ? "−" : "+"}</span>
                </CollapsibleTrigger>
                <CollapsibleContent open={timeOpen}>
                  {group.models.map((modelGroup) => {
                    const modelOpen = openModels[`${group.timestamp}/${modelGroup.model}`] ?? false;
                    return (
                      <Collapsible
                        key={`${group.timestamp}-${modelGroup.model}`}
                        open={modelOpen}
                        className="tree-node tree-node--model"
                      >
                        <CollapsibleTrigger
                          className="tree-trigger tree-trigger--model"
                          onClick={() => toggleModel(group.timestamp, modelGroup.model)}
                        >
                          <span>{modelGroup.model}</span>
                          <span>{modelOpen ? "−" : "+"}</span>
                        </CollapsibleTrigger>
                        <CollapsibleContent open={modelOpen}>
                          <div className="task-list">
                            {modelGroup.tasks.map((task) => (
                              <button
                                key={task.id}
                                className={cn("task-card", task.id === selectedId && "is-active")}
                                onClick={() => {
                                  setSelectedId(task.id);
                                  setSelectedPuzzleIndex(0);
                                }}
                                type="button"
                              >
                                <span className="task-name">{task.taskName}</span>
                                <span className="task-meta">{formatSummary(task)}</span>
                              </button>
                            ))}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    );
                  })}
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      </aside>

      <main className="main-panel">
        {selectedRecord && selectedData && selectedPuzzle && boardState ? (
          <>
            <header className="workspace-header">
              <div>
                <div className="eyebrow">
                  {selectedRecord.timestamp} / {selectedRecord.model}
                </div>
                <h2>{selectedRecord.taskName}</h2>
              </div>
              <Card className="score-card">
                <CardContent className="score-card__content">
                  <div className="score-label">完成度</div>
                  <div className="score-value">{boardState.percent}%</div>
                  <div className="score-detail">
                    {boardState.correctCellCount}/{boardState.playableCellCount}
                  </div>
                </CardContent>
              </Card>
            </header>

            <section className="puzzle-tabs">
              {puzzles.map((_, index) => (
                <Button
                  key={`${selectedId}-${index}`}
                  className={cn("puzzle-tab", index === puzzleIndex && "is-active")}
                  variant={index === puzzleIndex ? "default" : "outline"}
                  onClick={() => setSelectedPuzzleIndex(index)}
                  type="button"
                >
                  Puzzle {index + 1}
                </Button>
              ))}
              <Button variant="outline" onClick={resetPuzzle} type="button">
                清空作答
              </Button>
              <Button onClick={revealAllAnswers} type="button">
                显示所有答案
              </Button>
            </section>

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
                          onMouseEnter={() => setHoveredSlotKey(prioritySlot ? slotKey(prioritySlot.direction, prioritySlot.number) : "")}
                          onMouseLeave={() => setHoveredSlotKey("")}
                          onClick={() => selectSlot(prioritySlot)}
                          disabled={cell.isBlack}
                        >
                          {!cell.isBlack && label ? <span className="cell-number">{label}</span> : null}
                          {!cell.isBlack ? <span className="cell-char">{cell.actual ?? ""}</span> : null}
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              <div className="clue-panel">
                <AnswerEditor
                  selectedId={selectedId}
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
  );
}
