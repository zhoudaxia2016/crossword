import { useMemo, useState } from "react";
import { Card } from "../components/ui/card";
import { cn } from "../lib/utils";
import { groupResults, loadResult } from "../data";
import type { LoadedResult, PlacedEntry, ResultRecord } from "../types";

/* ──────────────── Helpers ──────────────── */

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

/* ──────────────── Puzzle Grid ──────────────── */

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

/* ──────────────── Benchmark Page ──────────────── */

interface BenchmarkPageProps {
  records: ResultRecord[];
  run: string;
  model: string;
  onOpenTask: (taskId: number) => void;
}

export default function BenchmarkPage({
  records,
  run,
  model,
  onOpenTask,
}: BenchmarkPageProps) {
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
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Crossword Benchmark Report</h1>
      </div>
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
