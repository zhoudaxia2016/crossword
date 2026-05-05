import { useOutletContext } from "react-router-dom";

import type { AppRouteContext } from "../App";
import AnswerPage from "./AnswerPage";

export default function AnswerRoute() {
  const context = useOutletContext<AppRouteContext>();

  const {
    selectedRecord,
    selectedData,
    boardState,
    numberedSlots,
    selectedSlot,
    hoveredSlot,
    selectedEntry,
    currentSlotText,
    selectedSolved,
    selectedPuzzleIndex,
    error,
    selectSlot,
    setHoveredSlotKey,
    confirmDraft,
  } = context;

  const selectedPuzzle = selectedData?.result.puzzles?.[selectedPuzzleIndex];

  if (!selectedRecord || !selectedData || !selectedPuzzle || !boardState) {
    return <div className="empty-state">{error || "No result selected."}</div>;
  }

  return (
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
      puzzleIndex={selectedPuzzleIndex}
      error={error}
      onSelectSlot={selectSlot}
      onSetHoveredSlotKey={setHoveredSlotKey}
      onConfirmDraft={confirmDraft}
    />
  );
}
