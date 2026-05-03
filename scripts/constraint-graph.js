function isBlack(cell) {
  return cell === "#";
}

function inBounds(grid, row, col) {
  return row >= 0 && row < grid.length && col >= 0 && col < grid.length;
}

function extractAcrossSlots(grid, minLength = 3, maxLength = Number.POSITIVE_INFINITY) {
  const slots = [];
  const size = grid.length;

  for (let row = 0; row < size; row += 1) {
    let col = 0;
    while (col < size) {
      if (isBlack(grid[row][col])) {
        col += 1;
        continue;
      }

      const startCol = col;
      while (col < size && !isBlack(grid[row][col])) {
        col += 1;
      }

      const length = col - startCol;
      if (length >= minLength && length <= maxLength) {
        slots.push({
          direction: "across",
          row,
          col: startCol,
          length,
        });
      }
    }
  }

  return slots;
}

function extractDownSlots(grid, minLength = 3, maxLength = Number.POSITIVE_INFINITY) {
  const slots = [];
  const size = grid.length;

  for (let col = 0; col < size; col += 1) {
    let row = 0;
    while (row < size) {
      if (isBlack(grid[row][col])) {
        row += 1;
        continue;
      }

      const startRow = row;
      while (row < size && !isBlack(grid[row][col])) {
        row += 1;
      }

      const length = row - startRow;
      if (length >= minLength && length <= maxLength) {
        slots.push({
          direction: "down",
          row: startRow,
          col,
          length,
        });
      }
    }
  }

  return slots;
}

export function extractSlots(grid, constraints = {}) {
  const minLength = constraints.minEntryLength ?? 3;
  const maxLength = constraints.maxEntryLength ?? Number.POSITIVE_INFINITY;

  return [
    ...extractAcrossSlots(grid, minLength, maxLength),
    ...extractDownSlots(grid, minLength, maxLength),
  ];
}

function getSlotCell(slot, index) {
  if (slot.direction === "across") {
    return { row: slot.row, col: slot.col + index };
  }
  return { row: slot.row + index, col: slot.col };
}

function containsCell(slot, row, col) {
  if (slot.direction === "across") {
    return row === slot.row && col >= slot.col && col < slot.col + slot.length;
  }
  return col === slot.col && row >= slot.row && row < slot.row + slot.length;
}

function getCellIndex(slot, row, col) {
  if (!containsCell(slot, row, col)) {
    return -1;
  }
  return slot.direction === "across" ? col - slot.col : row - slot.row;
}

export function buildConstraintGraph(grid, constraints = {}) {
  const slots = extractSlots(grid, constraints);
  const acrossSlots = slots.filter((slot) => slot.direction === "across");
  const downSlots = slots.filter((slot) => slot.direction === "down");
  const edges = [];

  for (const acrossSlot of acrossSlots) {
    for (let index = 0; index < acrossSlot.length; index += 1) {
      const { row, col } = getSlotCell(acrossSlot, index);
      if (!inBounds(grid, row, col) || isBlack(grid[row][col])) {
        continue;
      }

      const downSlot = downSlots.find((candidate) => containsCell(candidate, row, col));
      if (!downSlot) {
        continue;
      }

      edges.push({
        row,
        col,
        acrossIndex: index,
        downIndex: getCellIndex(downSlot, row, col),
        acrossSlot: {
          direction: acrossSlot.direction,
          row: acrossSlot.row,
          col: acrossSlot.col,
          length: acrossSlot.length,
        },
        downSlot: {
          direction: downSlot.direction,
          row: downSlot.row,
          col: downSlot.col,
          length: downSlot.length,
        },
      });
    }
  }

  return {
    slots,
    edges,
  };
}

export default buildConstraintGraph;
