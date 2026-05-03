function normalizeGrid(input) {
  if (Array.isArray(input)) {
    return input;
  }

  if (input && Array.isArray(input.grid)) {
    return input.grid;
  }

  throw new Error("Expected a grid matrix or an object with a grid field");
}

function inferSize(grid, slots) {
  if (grid) {
    return grid.length;
  }
  let maxIndex = 0;
  for (const slot of slots ?? []) {
    const endRow = slot.direction === "down" ? slot.row + slot.length - 1 : slot.row;
    const endCol = slot.direction === "across" ? slot.col + slot.length - 1 : slot.col;
    maxIndex = Math.max(maxIndex, endRow, endCol);
  }
  return maxIndex + 1;
}

function buildGridFromSlots(size, slots) {
  const grid = Array.from({ length: size }, () => Array(size).fill("#"));
  for (const slot of slots ?? []) {
    for (let index = 0; index < slot.length; index += 1) {
      const row = slot.direction === "across" ? slot.row : slot.row + index;
      const col = slot.direction === "across" ? slot.col + index : slot.col;
      grid[row][col] = ".";
    }
  }
  return grid;
}

function normalizeGridAndSize(input, slots) {
  if (Array.isArray(input)) {
    return input;
  }

  if (input && Array.isArray(input.grid)) {
    return input.grid;
  }

  const size = inferSize(null, slots);
  if (size > 0) {
    return buildGridFromSlots(size, slots);
  }

  throw new Error("Expected a grid matrix, an object with a grid field, or enough slot data to infer a grid");
}

function buildSlotMask(grid, slots) {
  const size = grid.length;
  const mask = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => ({ across: false, down: false, black: false })),
  );

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (grid[row][col] === "#") {
        mask[row][col].black = true;
      }
    }
  }

  for (const slot of slots) {
    for (let index = 0; index < slot.length; index += 1) {
      const row = slot.direction === "across" ? slot.row : slot.row + index;
      const col = slot.direction === "across" ? slot.col + index : slot.col;
      mask[row][col][slot.direction] = true;
    }
  }

  return mask;
}

function buildEntryCharMap(entries = []) {
  const charMap = new Map();

  for (const entry of entries) {
    const chars = Array.from(entry.reading ?? "");
    for (let index = 0; index < chars.length; index += 1) {
      const row = entry.direction === "across" ? entry.row : entry.row + index;
      const col = entry.direction === "across" ? entry.col + index : entry.col;
      const key = `${row}:${col}`;
      const nextChar = chars[index];
      const prevChar = charMap.get(key);
      charMap.set(key, prevChar && prevChar !== nextChar ? "Ｘ" : nextChar);
    }
  }

  return charMap;
}

function slotChar(mask, row, col) {
  const cell = mask[row][col];
  if (cell.black) {
    return " ";
  }

  const left = col > 0 && mask[row][col - 1].across && cell.across;
  const right = col + 1 < mask.length && mask[row][col + 1].across && cell.across;
  const up = row > 0 && mask[row - 1][col].down && cell.down;
  const down = row + 1 < mask.length && mask[row + 1][col].down && cell.down;

  if ((left || right || cell.across) && (up || down || cell.down)) {
    if ((left || right || cell.across) && (up || down || cell.down)) {
      return "┼";
    }
  }
  if (left || right || cell.across) {
    return "─";
  }
  if (up || down || cell.down) {
    return "│";
  }
  return "·";
}

export function printGridWithHeaders(input, slots) {
  const grid = normalizeGridAndSize(input, slots);
  const size = grid.length;
  const indexWidth = String(size - 1).length;
  const mask = buildSlotMask(grid, slots);
  const rowCanvasSize = size * 2 - 1;
  const colStep = 4;
  const colCanvasSize = (size - 1) * colStep + 1;
  const canvas = Array.from({ length: rowCanvasSize }, () => Array(colCanvasSize).fill(" "));

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const centerRow = row * 2;
      const centerCol = col * colStep;
      const cell = mask[row][col];

      if (cell.black) {
        canvas[centerRow][centerCol] = " ";
        continue;
      }

      canvas[centerRow][centerCol] = slotChar(mask, row, col);

      if (cell.across && col + 1 < size && !mask[row][col + 1].black && mask[row][col + 1].across) {
        for (let offset = 1; offset < colStep; offset += 1) {
          canvas[centerRow][centerCol + offset] = "─";
        }
      }

      if (cell.down && row + 1 < size && !mask[row + 1][col].black && mask[row + 1][col].down) {
        canvas[centerRow + 1][centerCol] = "│";
      }
    }
  }

  const headerChars = Array(colCanvasSize).fill(" ");
  for (let col = 0; col < size; col += 1) {
    const label = String(col);
    const centerCol = col * colStep;
    const start = Math.max(0, centerCol - Math.floor(label.length / 2));
    for (let i = 0; i < label.length && start + i < headerChars.length; i += 1) {
      headerChars[start + i] = label[i];
    }
  }
  const headerCells = headerChars.join("");
  const top = `┌${"─".repeat(colCanvasSize)}┐`;
  const bottom = `└${"─".repeat(colCanvasSize)}┘`;

  const lines = [`${" ".repeat(indexWidth + 2)}${headerCells}`, `${" ".repeat(indexWidth + 1)}${top}`];

  for (let row = 0; row < rowCanvasSize; row += 1) {
    const rowLabel = row % 2 === 0 ? String(row / 2).padStart(indexWidth, " ") : " ".repeat(indexWidth);
    const content = canvas[row].join("");
    lines.push(`${rowLabel} │${content}│`);
  }

  lines.push(`${" ".repeat(indexWidth + 1)}${bottom}`);
  return lines.join("\n");
}

export function printFilledGridWithHeaders({ size, grid, slots, entries = [] }) {
  const resolvedGrid = grid ?? buildGridFromSlots(size ?? inferSize(null, slots), slots);
  const resolvedSize = resolvedGrid.length;
  const indexWidth = String(resolvedSize - 1).length;
  const top = `┌${"──┬".repeat(resolvedSize - 1)}──┐`;
  const mid = `├${"──┼".repeat(resolvedSize - 1)}──┤`;
  const bottom = `└${"──┴".repeat(resolvedSize - 1)}──┘`;
  const charMap = buildEntryCharMap(entries);
  const header = Array.from({ length: resolvedSize }, (_, index) => `${String(index).padStart(2, " ")} `).join("").trimEnd();
  const gutter = " ".repeat(indexWidth + 1);
  const lines = [`${gutter} ${header}`, `${gutter}${top}`];

  for (let row = 0; row < resolvedSize; row += 1) {
    const cells = [];
    for (let col = 0; col < resolvedSize; col += 1) {
      if (resolvedGrid[row][col] === "#") {
        cells.push("██");
        continue;
      }

      const char = charMap.get(`${row}:${col}`) ?? "　";
      cells.push(char);
    }

    lines.push(`${String(row).padStart(indexWidth, " ")} ${"│"}${cells.join("│")}│`);
    if (row < resolvedSize - 1) {
      lines.push(`${gutter}${mid}`);
    }
  }

  lines.push(`${gutter}${bottom}`);
  return lines.join("\n");
}

export default printGridWithHeaders;
