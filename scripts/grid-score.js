function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function isBlack(cell) {
  return cell === "#";
}

function countWhiteCells(grid) {
  let count = 0;
  for (const row of grid) {
    for (const cell of row) {
      if (!isBlack(cell)) {
        count += 1;
      }
    }
  }
  return count;
}

function checkWhiteConnectivity(grid) {
  const size = grid.length;
  const visited = Array.from({ length: size }, () => Array(size).fill(false));
  let start = null;
  let whiteCount = 0;

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (!isBlack(grid[row][col])) {
        whiteCount += 1;
        if (!start) {
          start = [row, col];
        }
      }
    }
  }

  if (whiteCount === 0) {
    return false;
  }

  const queue = [start];
  visited[start[0]][start[1]] = true;
  let reached = 0;

  while (queue.length > 0) {
    const [row, col] = queue.shift();
    reached += 1;

    const deltas = [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ];

    for (const [dr, dc] of deltas) {
      const nr = row + dr;
      const nc = col + dc;
      if (
        nr >= 0 &&
        nr < size &&
        nc >= 0 &&
        nc < size &&
        !visited[nr][nc] &&
        !isBlack(grid[nr][nc])
      ) {
        visited[nr][nc] = true;
        queue.push([nr, nc]);
      }
    }
  }

  return reached === whiteCount;
}

function validateGrid(grid, gridConstraints = {}) {
  const size = gridConstraints.size;
  const errors = [];

  if (!Array.isArray(grid) || grid.length !== size) {
    errors.push("grid must have exactly size rows");
    return { valid: false, errors, slots: [] };
  }

  for (const row of grid) {
    if (!Array.isArray(row) || row.length !== size) {
      errors.push("grid must be square with exactly size columns");
      return { valid: false, errors, slots: [] };
    }
  }

  if (!checkWhiteConnectivity(grid)) {
    errors.push("white cells must form a single connected component");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function validateSlots(grid, slots, gridConstraints = {}) {
  const minEntryLength = gridConstraints.minEntryLength ?? 3;
  const maxEntryLength = gridConstraints.maxEntryLength ?? Number.POSITIVE_INFINITY;
  const errors = [];

  for (const slot of slots) {
    if (slot.length < minEntryLength) {
      errors.push(`slot shorter than minEntryLength: ${slot.direction} at (${slot.row}, ${slot.col})`);
    }
    if (slot.length > maxEntryLength) {
      errors.push(`slot longer than maxEntryLength: ${slot.direction} at (${slot.row}, ${slot.col})`);
    }

    for (let index = 0; index < slot.length; index += 1) {
      const cell = getSlotCell(slot, index);
      if (!grid[cell.row] || !grid[cell.row][cell.col]) {
        errors.push(`slot out of bounds: ${slot.direction} at (${slot.row}, ${slot.col})`);
        break;
      }
      if (grid[cell.row][cell.col] === "#") {
        errors.push(`slot overlaps black cell: ${slot.direction} at (${slot.row}, ${slot.col})`);
        break;
      }
    }
  }

  return errors;
}

function getSlotCell(slot, index) {
  if (slot.direction === "across") {
    return { row: slot.row, col: slot.col + index };
  }
  return { row: slot.row + index, col: slot.col };
}

function buildConstraintGraphFromSlots(grid, slots) {
  const acrossSlots = slots.filter((slot) => slot.direction === "across");
  const downSlots = slots.filter((slot) => slot.direction === "down");
  const edges = [];

  for (const acrossSlot of acrossSlots) {
    for (let acrossIndex = 0; acrossIndex < acrossSlot.length; acrossIndex += 1) {
      const cell = getSlotCell(acrossSlot, acrossIndex);
      if (grid[cell.row]?.[cell.col] === "#") {
        continue;
      }

      for (const downSlot of downSlots) {
        if (
          cell.col === downSlot.col &&
          cell.row >= downSlot.row &&
          cell.row < downSlot.row + downSlot.length
        ) {
          edges.push({
            row: cell.row,
            col: cell.col,
            acrossIndex,
            downIndex: cell.row - downSlot.row,
            acrossSlot,
            downSlot,
          });
          break;
        }
      }
    }
  }

  return {
    slots,
    edges,
  };
}

function slotKey(slot) {
  return `${slot.direction}:${slot.row}:${slot.col}:${slot.length}`;
}

function buildAdjacency(graph) {
  const adjacency = new Map();

  for (const slot of graph.slots) {
    adjacency.set(slotKey(slot), new Set());
  }

  for (const edge of graph.edges) {
    const acrossKey = slotKey(edge.acrossSlot);
    const downKey = slotKey(edge.downSlot);
    adjacency.get(acrossKey)?.add(downKey);
    adjacency.get(downKey)?.add(acrossKey);
  }

  return adjacency;
}

function scoreSlotLengthQuality(graph, size) {
  if (graph.slots.length === 0) {
    return 0;
  }

  const shortThreshold = Math.max(2, Math.floor(size * 0.33));
  const idealMin = Math.max(shortThreshold + 1, Math.floor(size * 0.5));
  const idealMax = Math.max(idealMin, Math.ceil(size * 0.75));
  const longThreshold = Math.ceil(size * 0.9);

  let idealCount = 0;
  let shortCount = 0;
  let fullSpanCount = 0;

  for (const slot of graph.slots) {
    if (slot.length >= idealMin && slot.length <= idealMax) {
      idealCount += 1;
    }
    if (slot.length <= shortThreshold) {
      shortCount += 1;
    }
    if (slot.length >= longThreshold) {
      fullSpanCount += 1;
    }
  }

  const idealRatio = idealCount / graph.slots.length;
  const shortRatio = shortCount / graph.slots.length;
  const fullSpanRatio = fullSpanCount / graph.slots.length;

  return clamp(
    0.6 * idealRatio +
      0.25 * (1 - clamp(shortRatio / 0.45, 0, 1)) +
      0.15 * (1 - clamp(fullSpanRatio / 0.35, 0, 1)),
    0,
    1,
  );
}

function scoreCrossingQuality(graph, size) {
  if (graph.slots.length === 0) {
    return {
      score: 0,
      averageCrossRatio: 0,
    };
  }

  const adjacency = buildAdjacency(graph);
  let crossRatioSum = 0;
  let lowCrossCount = 0;
  let saturatedCount = 0;

  for (const slot of graph.slots) {
    const degree = adjacency.get(slotKey(slot))?.size ?? 0;
    const crossRatio = degree / slot.length;
    crossRatioSum += crossRatio;

    if (crossRatio < 0.34) {
      lowCrossCount += 1;
    }
    if (crossRatio > (size <= 6 ? 1.05 : 0.9)) {
      saturatedCount += 1;
    }
  }

  const averageCrossRatio = crossRatioSum / graph.slots.length;
  const target = size <= 6 ? 0.78 : 0.55;
  const tolerance = size <= 6 ? 0.24 : 0.22;
  const densityScore = clamp(1 - Math.abs(averageCrossRatio - target) / tolerance, 0, 1);
  const lowCrossPenalty = clamp((lowCrossCount / graph.slots.length) / 0.45, 0, 1);
  const saturatedPenalty = clamp((saturatedCount / graph.slots.length) / (size <= 6 ? 0.7 : 0.3), 0, 1);

  return {
    score: clamp(densityScore - 0.2 * lowCrossPenalty - 0.08 * saturatedPenalty, 0, 1),
    averageCrossRatio,
  };
}

function scoreSlotStructureQuality(graph, size) {
  if (graph.slots.length === 0) {
    return {
      score: 0,
      slotCountQuality: 0,
      corridorPenalty: 1,
      startSpreadScore: 0,
    };
  }

  const slotCount = graph.slots.length;
  const targetMin = size <= 6 ? size * 2.1 : size * 1.9;
  const targetMax = size <= 6 ? size * 2.8 : size * 2.5;
  let slotCountQuality = 1;

  if (slotCount < targetMin) {
    slotCountQuality = clamp(1 - (targetMin - slotCount) / Math.max(size * 0.8, 1), 0, 1);
  } else if (slotCount > targetMax) {
    slotCountQuality = clamp(1 - (slotCount - targetMax) / Math.max(size, 1), 0, 1);
  }

  const nearFullSpanCount = graph.slots.filter((slot) => slot.length >= size - 1).length;
  const corridorPenalty = clamp(nearFullSpanCount / Math.max(graph.slots.length * 0.35, 1), 0, 1);

  const rowStarts = Array(size).fill(0);
  const colStarts = Array(size).fill(0);
  for (const slot of graph.slots) {
    rowStarts[slot.row] += 1;
    colStarts[slot.col] += 1;
  }
  const rowStartSpread = (Math.max(...rowStarts) - Math.min(...rowStarts)) / Math.max(slotCount, 1);
  const colStartSpread = (Math.max(...colStarts) - Math.min(...colStarts)) / Math.max(slotCount, 1);
  const startSpreadScore = clamp(1 - (rowStartSpread + colStartSpread) / 0.9, 0, 1);

  return {
    score: clamp(0.55 * slotCountQuality + 0.25 * (1 - corridorPenalty) + 0.2 * startSpreadScore, 0, 1),
    slotCountQuality,
    corridorPenalty,
    startSpreadScore,
  };
}

function countWhiteNeighbors(grid, row, col) {
  let neighbors = 0;
  const deltas = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];

  for (const [dr, dc] of deltas) {
    const nr = row + dr;
    const nc = col + dc;
    if (grid[nr]?.[nc] && grid[nr][nc] !== "#") {
      neighbors += 1;
    }
  }

  return neighbors;
}

function scoreShapeBalance(grid, graph, size) {
  if (graph.slots.length === 0) {
    return {
      score: 0,
      rowColBalance: 0,
      lowNeighborRatio: 1,
      whiteRatio: 0,
      sparseBlockPenalty: 1,
    };
  }

  const rowWhiteCounts = [];
  const colWhiteCounts = Array(size).fill(0);
  let lowNeighborCount = 0;
  let whiteCount = 0;

  for (let row = 0; row < size; row += 1) {
    let rowWhite = 0;
    for (let col = 0; col < size; col += 1) {
      if (!isBlack(grid[row][col])) {
        rowWhite += 1;
        colWhiteCounts[col] += 1;
        whiteCount += 1;
        if (countWhiteNeighbors(grid, row, col) <= 1) {
          lowNeighborCount += 1;
        }
      }
    }
    rowWhiteCounts.push(rowWhite);
  }

  const whiteRatio = whiteCount / (size * size);
  const rowSpread = (Math.max(...rowWhiteCounts) - Math.min(...rowWhiteCounts)) / size;
  const colSpread = (Math.max(...colWhiteCounts) - Math.min(...colWhiteCounts)) / size;
  const rowColBalance = clamp(1 - (rowSpread + colSpread) / 1.4, 0, 1);
  const lowNeighborRatio = whiteCount === 0 ? 1 : lowNeighborCount / whiteCount;
  const lowNeighborScore = clamp(1 - lowNeighborRatio / 0.18, 0, 1);
  const targetWhiteRatio = size <= 6 ? 0.72 : 0.68;
  const whiteRatioScore = clamp(1 - Math.abs(whiteRatio - targetWhiteRatio) / 0.16, 0, 1);
  const blackCount = size * size - whiteCount;
  const minUsefulBlocks = Math.max(1, Math.floor(size / 2));
  const sparseBlockPenalty = clamp(1 - blackCount / minUsefulBlocks, 0, 1);

  return {
    score: clamp(
      0.35 * rowColBalance +
        0.25 * lowNeighborScore +
        0.4 * whiteRatioScore -
        0.2 * sparseBlockPenalty,
      0,
      1,
    ),
    rowColBalance,
    lowNeighborRatio,
    whiteRatio,
    sparseBlockPenalty,
  };
}

export function scoreGrid({ grid, slots, gridConstraints = {} }) {
  if (!Array.isArray(slots)) {
    throw new Error("scoreGrid requires explicit slots");
  }

  const validation = validateGrid(grid, gridConstraints);
  const slotErrors = validateSlots(grid, slots, gridConstraints);

  if (!validation.valid || slotErrors.length > 0) {
    return {
      score: 0,
      valid: false,
      errors: [...validation.errors, ...slotErrors],
      breakdown: {
        legality: 0,
        slotLengthQuality: 0,
        crossingQuality: 0,
        slotStructureQuality: 0,
        shapeBalance: 0,
      },
    };
  }

  const size = gridConstraints.size ?? grid.length;
  const graph = buildConstraintGraphFromSlots(grid, slots);

  const slotLengthQuality = scoreSlotLengthQuality(graph, size);
  const crossingQuality = scoreCrossingQuality(graph, size);
  const slotStructureQuality = scoreSlotStructureQuality(graph, size);
  const shapeBalance = scoreShapeBalance(grid, graph, size);

  const score =
    0.3 * slotLengthQuality +
    0.3 * crossingQuality.score +
    0.25 * slotStructureQuality.score +
    0.15 * shapeBalance.score;

  return {
    score: Number(score.toFixed(4)),
    valid: true,
    errors: [],
    breakdown: {
      legality: 1,
      slotLengthQuality: Number(slotLengthQuality.toFixed(4)),
      crossingQuality: Number(crossingQuality.score.toFixed(4)),
      slotStructureQuality: Number(slotStructureQuality.score.toFixed(4)),
      shapeBalance: Number(shapeBalance.score.toFixed(4)),
    },
    stats: {
      whiteCellCount: countWhiteCells(grid),
      slotCount: graph.slots.length,
      edgeCount: graph.edges.length,
      averageCrossRatio: Number(crossingQuality.averageCrossRatio.toFixed(4)),
      slotCountQuality: Number(slotStructureQuality.slotCountQuality.toFixed(4)),
      corridorPenalty: Number(slotStructureQuality.corridorPenalty.toFixed(4)),
      startSpreadScore: Number(slotStructureQuality.startSpreadScore.toFixed(4)),
      rowColBalance: Number(shapeBalance.rowColBalance.toFixed(4)),
      lowNeighborRatio: Number(shapeBalance.lowNeighborRatio.toFixed(4)),
      whiteRatio: Number(shapeBalance.whiteRatio.toFixed(4)),
      sparseBlockPenalty: Number(shapeBalance.sparseBlockPenalty.toFixed(4)),
    },
  };
}

export default scoreGrid;
