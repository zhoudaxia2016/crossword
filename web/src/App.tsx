import { useEffect, useMemo, useState } from "react";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./components/ui/collapsible";
import { Input } from "./components/ui/input";
import { groupResults, loadManifest, loadResult } from "./data";
import {
  buildBoardState,
  deriveSlotsWithNumbers,
  entryKey,
  getPrimarySlotAtCell,
  isCellInSlot,
  slotKey,
  type SlotWithNumber,
} from "./game";
import { cn } from "./lib/utils";
import type { PlacedEntry, ResultFile, ResultRecord } from "./types";

type AnswerStore = Record<string, Record<number, Record<string, string>>>;

function formatSummary(record: ResultRecord) {
  const summary = record.summary;
  if (!summary) return "";
  return `F ${summary.finalScore?.toFixed(3) ?? "0.000"} · O ${summary.overallScore.toFixed(3)}`;
}

function buildEntryMap(entries: PlacedEntry[]) {
  return new Map(entries.map((entry) => [slotKey(entry.direction, entry.number), entry]));
}

export default function App() {
  const [records, setRecords] = useState<ResultRecord[]>([]);
  const [selectedData, setSelectedData] = useState<ResultFile | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [selectedPuzzleIndex, setSelectedPuzzleIndex] = useState(0);
  const [selectedSlotKey, setSelectedSlotKey] = useState("");
  const [hoveredSlotKey, setHoveredSlotKey] = useState("");
  const [answers, setAnswers] = useState<AnswerStore>({});
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

    loadResult(selectedRecord.url)
      .then((data) => {
        setSelectedData(data);
        setError("");
      })
      .catch((nextError: Error) => {
        setError(nextError.message);
      });
  }, [selectedRecord]);

  const groupedResults = useMemo(() => groupResults(records), [records]);
  const puzzles = selectedData?.output?.puzzles ?? [];
  const puzzleIndex = Math.min(selectedPuzzleIndex, Math.max(0, puzzles.length - 1));
  const selectedPuzzle = puzzles[puzzleIndex];
  const slots = selectedData?.output?.slots ?? selectedData?.input.slots ?? [];
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

  const taskAnswers = answers[selectedId] ?? {};
  const puzzleAnswers = taskAnswers[puzzleIndex] ?? {};
  const boardState =
    selectedData && selectedPuzzle
      ? buildBoardState(
          selectedData.output?.size ?? selectedData.input.grid.length,
          selectedData.output?.grid ?? selectedData.input.grid,
          selectedPuzzle,
          puzzleAnswers,
        )
      : null;

  const selectedEntry = selectedSlotKey ? entryMap.get(selectedSlotKey) : undefined;
  const selectedSlot = selectedSlotKey
    ? numberedSlots.find((slot) => slotKey(slot.direction, slot.number) === selectedSlotKey)
    : undefined;
  const hoveredSlot = hoveredSlotKey
    ? numberedSlots.find((slot) => slotKey(slot.direction, slot.number) === hoveredSlotKey)
    : undefined;

  function updateAnswer(entry: PlacedEntry, value: string) {
    setAnswers((current) => ({
      ...current,
      [selectedId]: {
        ...(current[selectedId] ?? {}),
        [puzzleIndex]: {
          ...((current[selectedId] ?? {})[puzzleIndex] ?? {}),
          [entryKey(entry)]: value,
        },
      },
    }));
  }

  function revealAllAnswers() {
    if (!selectedPuzzle) return;
    const nextAnswers = Object.fromEntries(
      selectedPuzzle.entries.map((entry) => [entryKey(entry), entry.reading]),
    );
    setAnswers((current) => ({
      ...current,
      [selectedId]: {
        ...(current[selectedId] ?? {}),
        [puzzleIndex]: nextAnswers,
      },
    }));
  }

  function resetPuzzle() {
    setAnswers((current) => ({
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
                      gridTemplateColumns: `repeat(${selectedData.output?.size ?? selectedData.input.grid.length}, minmax(0, 1fr))`,
                    }}
                  >
                    {boardState.cells.flat().map((cell, index) => {
                      const size = selectedData.output?.size ?? selectedData.input.grid.length;
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
                            cell.isConflict && "is-conflict",
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
                <Card className="answer-panel">
                  <CardHeader>
                    <CardTitle>{selectedEntry ? `${selectedEntry.number} ${selectedEntry.direction === "across" ? "Across" : "Down"}` : "Answer"}</CardTitle>
                  </CardHeader>
                  <CardContent className="answer-panel__body">
                    <div className="answer-clue">{selectedEntry?.clue ?? ""}</div>
                    <Input
                      value={selectedEntry ? puzzleAnswers[entryKey(selectedEntry)] ?? "" : ""}
                      onChange={(event) => {
                        if (selectedEntry) updateAnswer(selectedEntry, event.target.value);
                      }}
                      disabled={!selectedEntry}
                      placeholder={selectedEntry ? selectedEntry.reading.replace(/./gu, "・") : ""}
                    />
                  </CardContent>
                </Card>
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
