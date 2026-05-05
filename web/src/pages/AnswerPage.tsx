import { memo, useEffect, useMemo, useState } from "react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import {
  type CellState,
  type SlotWithNumber,
  getPrimarySlotAtCell,
  isCellInSlot,
  slotKey,
} from "../game";
import { cn } from "../lib/utils";
import type { LoadedResult, PlacedEntry, ResultRecord } from "../types";

/* ──────────────── Answer Editor ──────────────── */

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

/* ──────────────── Answer Page ──────────────── */

interface AnswerPageProps {
  selectedRecord?: ResultRecord;
  selectedData?: LoadedResult | null;
  boardState: {
    cells: CellState[][];
    filledCellCount: number;
    playableCellCount: number;
    percent: number;
  } | null;
  numberedSlots: SlotWithNumber[];
  selectedSlot?: SlotWithNumber;
  hoveredSlot?: SlotWithNumber;
  selectedEntry?: PlacedEntry;
  currentSlotText: string;
  selectedSolved: boolean;
  puzzleIndex: number;
  error: string;
  onSelectSlot: (slot: SlotWithNumber | undefined) => void;
  onSetHoveredSlotKey: (key: string) => void;
  onConfirmDraft: (draft: string) => void;
}

export default function AnswerPage({
  selectedRecord,
  selectedData,
  boardState,
  numberedSlots,
  selectedSlot,
  hoveredSlot,
  selectedEntry,
  currentSlotText,
  selectedSolved,
  puzzleIndex,
  error,
  onSelectSlot,
  onSetHoveredSlotKey,
  onConfirmDraft,
}: AnswerPageProps) {
  const [activeTab, setActiveTab] = useState<"across" | "down">("across");

  if (!selectedRecord || !selectedData || !boardState) {
    return <div className="empty-state">{error || "No result selected."}</div>;
  }

  const selectedPuzzle = selectedData.result.puzzles?.[puzzleIndex];
  const entryMap = useMemo(() => {
    const map = new Map<string, PlacedEntry>();
    for (const entry of selectedPuzzle?.entries ?? []) {
      map.set(slotKey(entry.direction, entry.number), entry);
    }
    return map;
  }, [selectedPuzzle]);

  const acrossItems = useMemo(
    () =>
      numberedSlots
        .filter((slot) => slot.direction === "across")
        .map((slot) => ({
          slot,
          entry: entryMap.get(slotKey(slot.direction, slot.number)),
        })),
    [numberedSlots, entryMap],
  );

  const downItems = useMemo(
    () =>
      numberedSlots
        .filter((slot) => slot.direction === "down")
        .map((slot) => ({
          slot,
          entry: entryMap.get(slotKey(slot.direction, slot.number)),
        })),
    [numberedSlots, entryMap],
  );

  useEffect(() => {
    if (selectedSlot) {
      setActiveTab(selectedSlot.direction);
    }
  }, [selectedSlot]);

  return (
    <>
      <header className="workspace-header">
        <div>
          <div className="eyebrow">{selectedRecord.model}</div>
          <h2>{selectedRecord.taskName}</h2>
        </div>
        <div className="workspace-header__actions">
          <div className="header-progress" aria-label="填字进度">
            <div className="header-progress__track">
              <div
                className="header-progress__fill"
                style={{ width: `${boardState.percent}%` }}
              />
            </div>
          </div>
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
                      onSetHoveredSlotKey(
                        prioritySlot ? slotKey(prioritySlot.direction, prioritySlot.number) : "",
                      )
                    }
                    onMouseLeave={() => onSetHoveredSlotKey("")}
                    onClick={() => onSelectSlot(prioritySlot)}
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
            selectedId={selectedRecord.id}
            puzzleIndex={puzzleIndex}
            selectedEntry={selectedEntry}
            selectedSlot={selectedSlot}
            currentText={currentSlotText}
            isSolved={selectedSolved}
            onConfirm={onConfirmDraft}
          />
          <Card className="clue-list-card">
            <CardContent className="clue-list-card__content">
              <div className="puzzle-tabs clue-tabs">
                <button
                  type="button"
                  className={cn("puzzle-tab", activeTab === "across" && "is-active")}
                  onClick={() => setActiveTab("across")}
                >
                  Across
                </button>
                <button
                  type="button"
                  className={cn("puzzle-tab", activeTab === "down" && "is-active")}
                  onClick={() => setActiveTab("down")}
                >
                  Down
                </button>
              </div>

              <div className="clue-list">
                {(activeTab === "across" ? acrossItems : downItems).map(({ slot, entry }) => {
                  const isSelected =
                    selectedSlot &&
                    slot.number === selectedSlot.number &&
                    slot.direction === selectedSlot.direction;

                  return (
                    <button
                      key={slotKey(slot.direction, slot.number)}
                      type="button"
                      className={cn("clue-item", isSelected && "is-selected")}
                      onClick={() => onSelectSlot(slot)}
                      onMouseEnter={() => onSetHoveredSlotKey(slotKey(slot.direction, slot.number))}
                      onMouseLeave={() => onSetHoveredSlotKey("")}
                    >
                      <span className="clue-item__number">{slot.number}</span>
                      <span className="clue-item__text">{entry?.clue ?? ""}</span>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </>
  );
}
