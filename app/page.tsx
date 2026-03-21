"use client";

import { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { players, days, playerColors, roundLabels } from "./data/standings";

type Player = (typeof players)[number];

type GroupStanding = {
  rank: number;
  player: string;
  pts: number;
  pct: number | null;
  max: number;
  r64: number | null;
};

type LiveGame = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  status: string;
  isLive: boolean;
};

type HistoryRow = {
  day: string;
  [key: string]: string | number | null;
};

/**
 * Safely fetch JSON from a URL.
 * Returns null on any failure instead of throwing.
 */
async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Sort players by:
 * 1. score descending
 * 2. max possible descending
 * 3. name ascending
 */
function sortPlayersByScore(
  scoreMap: Record<Player, number>,
  maxMap: Record<Player, number>
): Player[] {
  return [...players].sort((a, b) => {
    const scoreDiff = scoreMap[b] - scoreMap[a];
    if (scoreDiff !== 0) return scoreDiff;

    const maxDiff = maxMap[b] - maxMap[a];
    if (maxDiff !== 0) return maxDiff;

    return a.localeCompare(b);
  });
}

/**
 * Build score maps from live scraped standings.
 */
function buildLiveMaps(groupStandings: GroupStanding[]) {
  const latestScores = {} as Record<Player, number>;
  const liveMaxPoints = {} as Record<Player, number>;

  players.forEach((player) => {
    latestScores[player] = 0;
    liveMaxPoints[player] = 0;
  });

  groupStandings.forEach((row) => {
    if (players.includes(row.player as Player)) {
      const player = row.player as Player;
      latestScores[player] = row.pts ?? 0;
      liveMaxPoints[player] = row.max ?? 0;
    }
  });

  return { latestScores, liveMaxPoints };
}

/**
 * Sort players for one historical row.
 * Uses only that row's scores.
 */
function getSortedPlayersForHistoryRow(row: HistoryRow): Player[] {
  const scores = {} as Record<Player, number>;

  players.forEach((player) => {
    const value = row[player];
    scores[player] = typeof value === "number" ? value : 0;
  });

  return [...players].sort((a, b) => scores[b] - scores[a]);
}

export default function HomePage() {
  const [games, setGames] = useState<LiveGame[]>([]);
  const [groupStandings, setGroupStandings] = useState<GroupStanding[]>([]);
  const [chartData, setChartData] = useState<HistoryRow[]>([]);

  // ---------------------------
  // Live games polling
  // ---------------------------
  useEffect(() => {
    const loadGames = async () => {
      const data = await fetchJson<LiveGame[]>("/api/live-games");
      setGames(Array.isArray(data) ? data : []);
    };

    loadGames();
    const interval = setInterval(loadGames, 5000);
    return () => clearInterval(interval);
  }, []);

  // ---------------------------
  // Live bracket standings polling
  // ---------------------------
  useEffect(() => {
    const loadStandings = async () => {
      const data = await fetchJson<{ standings?: GroupStanding[] }>(
        `/group-standings.json?t=${Date.now()}`
      );

      if (Array.isArray(data?.standings)) {
        setGroupStandings(data.standings);
      } else {
        setGroupStandings([]);
      }
    };

    loadStandings();
    const interval = setInterval(loadStandings, 5000);
    return () => clearInterval(interval);
  }, []);

  // ---------------------------
  // Chart history polling
  // ---------------------------
  useEffect(() => {
    const loadHistory = async () => {
      const data = await fetchJson<HistoryRow[]>(`/history.json?t=${Date.now()}`);
      setChartData(Array.isArray(data) ? data : []);
    };

    loadHistory();
    const interval = setInterval(loadHistory, 5000);
    return () => clearInterval(interval);
  }, []);

  // ---------------------------
  // Derived live score maps
  // ---------------------------
  const { latestScores, liveMaxPoints } = useMemo(
    () => buildLiveMaps(groupStandings),
    [groupStandings]
  );

  // ---------------------------
  // Main leaderboard ordering
  // ---------------------------
  const sortedPlayers = useMemo(
    () => sortPlayersByScore(latestScores, liveMaxPoints),
    [latestScores, liveMaxPoints]
  );

  const leader = sortedPlayers[0];
  const loser = sortedPlayers[sortedPlayers.length - 1];

  // ---------------------------
  // Remaining possible points
  // ---------------------------
  const remainingPoints = useMemo(() => {
    const result = {} as Record<Player, number>;

    players.forEach((player) => {
      result[player] = Math.max(0, liveMaxPoints[player] - latestScores[player]);
    });

    return result;
  }, [latestScores, liveMaxPoints]);

// =========================
// HOT TODAY (same-day gain)
// =========================
const pointGainsToday = useMemo(() => {
  const gains = {} as Record<Player, number>;
  players.forEach((player) => {
    gains[player] = 0;
  });

  // Only keep rows that have at least one real score
  const scoredRows = chartData.filter((row) =>
    players.some((player) => typeof row[player] === "number")
  );

  if (scoredRows.length < 2) return gains;

  const todayRow = scoredRows[scoredRows.length - 1];
  const previousRow = scoredRows[scoredRows.length - 2];

  players.forEach((player) => {
    const todayValue =
      typeof todayRow[player] === "number" ? (todayRow[player] as number) : 0;
    const previousValue =
      typeof previousRow[player] === "number"
        ? (previousRow[player] as number)
        : 0;

    gains[player] = todayValue - previousValue;
  });

  return gains;
}, [chartData]);

const hottestPlayer = useMemo(() => {
  return [...players].sort(
    (a, b) => pointGainsToday[b] - pointGainsToday[a]
  )[0];
}, [pointGainsToday]);

const hottestGain = pointGainsToday[hottestPlayer] ?? 0;

  // ---------------------------
  // Insights
  // Biggest choke risk = top half with lowest remaining upside
  // Most alive = non-leader with highest remaining upside
  // ---------------------------
  const contenders = useMemo(
    () => sortedPlayers.slice(0, Math.max(1, Math.ceil(players.length / 2))),
    [sortedPlayers]
  );

  const biggestChokeRisk = useMemo(() => {
    return [...contenders].sort(
      (a, b) => remainingPoints[a] - remainingPoints[b]
    )[0];
  }, [contenders, remainingPoints]);

  const mostAlive = useMemo(() => {
    return [...sortedPlayers]
      .filter((player) => player !== leader)
      .sort((a, b) => remainingPoints[b] - remainingPoints[a])[0];
  }, [sortedPlayers, remainingPoints, leader]);

  // ---------------------------
  // Rank movement from chart history
  // Compares latest scored row to previous scored row
  // ---------------------------
  const rankChanges = useMemo(() => {
    const changes = {} as Record<Player, number>;
    players.forEach((player) => {
      changes[player] = 0;
    });

    const scoredRows = chartData.filter((row) =>
      players.some((player) => typeof row[player] === "number")
    );

    const latestRow = scoredRows.at(-1);
    const previousRow = scoredRows.at(-2);

    if (!latestRow || !previousRow) return changes;

    const currentOrder = getSortedPlayersForHistoryRow(latestRow);
    const previousOrder = getSortedPlayersForHistoryRow(previousRow);

    players.forEach((player) => {
      const currentRank = currentOrder.indexOf(player);
      const previousRank = previousOrder.indexOf(player);
      changes[player] = previousRank - currentRank;
    });

    return changes;
  }, [chartData]);

  const biggestClimbPlayer = useMemo(() => {
    return [...players].sort(
      (a, b) => (rankChanges[b] ?? 0) - (rankChanges[a] ?? 0)
    )[0];
  }, [rankChanges]);

  const biggestFallPlayer = useMemo(() => {
    return [...players].sort(
      (a, b) => (rankChanges[a] ?? 0) - (rankChanges[b] ?? 0)
    )[0];
  }, [rankChanges]);

  const biggestClimbValue = rankChanges[biggestClimbPlayer] ?? 0;
  const biggestFallValue = rankChanges[biggestFallPlayer] ?? 0;

  // ---------------------------
  // Chart scaling
  // ---------------------------
  const maxScore = useMemo(() => {
    return Math.max(
      0,
      ...chartData.flatMap((row) =>
        players.map((player) => {
          const value = row[player];
          return typeof value === "number" ? value : 0;
        })
      )
    );
  }, [chartData]);

  const yMax = Math.min(maxScore + 100, 1920);

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-5xl px-3 py-3 sm:px-6 sm:py-6">
        <header className="mb-4 rounded-2xl border border-neutral-800 bg-neutral-900 px-4 py-4 sm:px-5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-neutral-500">
                March Madness Tracker
              </div>
              <h1 className="truncate text-xl font-semibold tracking-tight text-white sm:text-2xl">
                Dancing 2k26
              </h1>
              <p className="mt-1 text-sm text-neutral-400">Doubledeez!</p>
            </div>

            <div className="shrink-0 rounded-full border border-neutral-700 bg-neutral-950 px-3 py-1 text-xs text-neutral-300">
              Live
            </div>
          </div>
        </header>

<section className="mb-4 rounded-2xl border border-neutral-800 bg-neutral-900 p-3 shadow-sm">
  <div className="mb-3 flex items-center justify-between">
    <div>
      <h2 className="text-sm font-semibold text-white">Live Games</h2>
      <p className="text-[11px] text-neutral-500">Updates every 5s</p>
    </div>
  </div>

  {/* Split games */}
  {(() => {
    const liveGames = games.filter((g) => g.isLive);
    const finalGames = games.filter((g) => !g.isLive);

    return (
      <div className="space-y-3">
        {/* LIVE GAMES */}
<div className="grid grid-cols-2 gap-2">
  {liveGames.map((game) => {
    const isClose =
      !game.status.includes("1st") &&
      Math.abs(game.homeScore - game.awayScore) <= 5;

    return (
      <div
        key={game.id}
        className={`relative min-w-0 overflow-hidden rounded-xl border p-3 transition-all ${
          isClose
            ? "border-yellow-400/40 bg-yellow-500/10 shadow-[0_0_18px_rgba(250,204,21,0.14)]"
            : "border-neutral-800 bg-neutral-950/50"
        }`}
      >
        {isClose && (
          <div className="pointer-events-none absolute inset-0 rounded-xl bg-yellow-400/5 blur-xl" />
        )}

        <div className="relative">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="whitespace-nowrap rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-medium text-red-300">
                LIVE
              </span>

              {isClose && (
                <span className="whitespace-nowrap rounded-full bg-yellow-400/15 px-2 py-0.5 text-[10px] font-medium text-yellow-300">
                  CLOSE
                </span>
              )}
            </div>

            <span className="shrink-0 whitespace-nowrap text-[10px] text-neutral-500">
              {game.status}
            </span>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between gap-3">
              <span className="truncate text-sm text-neutral-200">
                {game.awayTeam}
              </span>
              <span className="font-mono text-base font-semibold text-white">
                {game.awayScore}
              </span>
            </div>

            <div className="flex items-center justify-between gap-3">
              <span className="truncate text-sm text-neutral-200">
                {game.homeTeam}
              </span>
              <span className="font-mono text-base font-semibold text-white">
                {game.homeScore}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  })}
</div>

        {/* FINAL GAMES */}
        {finalGames.length > 0 && (
          <div>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-400">
              Final
            </div>

            <div className="grid grid-cols-2 gap-2">
              {finalGames.map((game) => (
                <div
                  key={game.id}
                  className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-[10px] text-neutral-400">
                      FINAL
                    </span>

                    <span className="text-[10px] text-neutral-500">
                      {game.status}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm text-neutral-300">
                        {game.awayTeam}
                      </span>
                      <span className="font-mono text-base font-semibold text-neutral-200">
                        {game.awayScore}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm text-neutral-300">
                        {game.homeTeam}
                      </span>
                      <span className="font-mono text-base font-semibold text-neutral-200">
                        {game.homeScore}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* EMPTY STATE */}
        {games.length === 0 && (
          <div className="text-xs text-neutral-500">
            No started games right now
          </div>
        )}
      </div>
    );
  })()}
</section>

        <section className="mt-4 mb-4 rounded-2xl border border-neutral-800 bg-neutral-900 p-3 shadow-sm sm:p-4">
  <div className="mb-3 flex items-center justify-between">
    <h2 className="text-base font-semibold text-white">Stats</h2>
    <div className="text-xs text-neutral-500">live insights</div>
  </div>

  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">



<div className="rounded-xl border border-orange-500/30 bg-orange-500/5 px-4 py-3">
  <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-orange-300/80">
    Hot Today
  </div>

{hottestGain > 0 ? (
  <div className="flex items-center justify-between gap-3">
    <div className="min-w-0">
      <div className="truncate text-sm font-semibold text-orange-100">
        {hottestPlayer}
      </div>
      <div className="text-xs text-orange-200/70">
        gained {hottestGain} pt{hottestGain === 1 ? "" : "s"} today
      </div>
    </div>

    <div className="shrink-0 rounded-xl bg-orange-400/10 px-3 py-2 font-mono text-lg font-bold text-orange-300">
      +{hottestGain}
    </div>
  </div>
) : (
  <div className="text-xs text-neutral-400">No points gained yet today</div>
)}
</div>

    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-300/80">
        Biggest Choke Risk
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-amber-100">
            {biggestChokeRisk}
          </div>
          <div className="text-xs text-amber-200/70">
            only {remainingPoints[biggestChokeRisk]} pts of upside left
          </div>
        </div>

        <div className="shrink-0 rounded-xl bg-amber-400/10 px-3 py-2 text-lg font-bold text-amber-300">
          ⚠️
        </div>
      </div>
    </div>

    <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 px-4 py-3">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-300/80">
        Most Alive
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-cyan-100">
            {mostAlive}
          </div>
          <div className="text-xs text-cyan-200/70">
            {remainingPoints[mostAlive]} pts still in play
          </div>
        </div>

        <div className="shrink-0 rounded-xl bg-cyan-400/10 px-3 py-2 text-lg font-bold text-cyan-300">
          🔥
        </div>
      </div>
    </div>

    {(
      <>
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300/80">
            Biggest Jump Since Last Game
          </div>

          {biggestClimbValue > 0 ? (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-emerald-100">
                  {biggestClimbPlayer}
                </div>
                <div className="text-xs text-emerald-200/70">
                  climbed {biggestClimbValue} spot
                  {biggestClimbValue === 1 ? "" : "s"}
                </div>
              </div>

              <div className="shrink-0 rounded-xl bg-emerald-400/10 px-3 py-2 font-mono text-lg font-bold text-emerald-300">
                +{biggestClimbValue}
              </div>
            </div>
          ) : (
            <div className="text-xs text-neutral-400">No one moved up</div>
          )}
        </div>

        <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 px-4 py-3">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-rose-300/80">
            Biggest Falloff Since Last Game
          </div>

          {biggestFallValue < 0 ? (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-rose-100">
                  {biggestFallPlayer}
                </div>
                <div className="text-xs text-rose-200/70">
                  dropped {Math.abs(biggestFallValue)} spot
                  {Math.abs(biggestFallValue) === 1 ? "" : "s"}
                </div>
              </div>

              <div className="shrink-0 rounded-xl bg-rose-400/10 px-3 py-2 font-mono text-lg font-bold text-rose-300">
                {biggestFallValue}
              </div>
            </div>
          ) : (
            <div className="text-xs text-neutral-400">No one moved down</div>
          )}
        </div>
      </>
    )}
  </div>
</section>



<section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-3 shadow-sm sm:p-4">
  <div className="mb-3 flex items-center justify-between">
    <h2 className="text-base font-semibold text-white">Group Points</h2>
    <div className="text-xs text-neutral-500">Every brackets points by round day</div>
  </div>

  {/* Compact round legend */}
  <div className="mb-3 flex flex-wrap gap-2 text-[10px] text-neutral-400">
    <span className="rounded-full border border-neutral-700 bg-neutral-800 px-2 py-1">
      R64 · Mar 19–20
    </span>
    <span className="rounded-full border border-neutral-700 bg-neutral-800 px-2 py-1">
      R32 · Mar 21–22
    </span>
    <span className="rounded-full border border-neutral-700 bg-neutral-800 px-2 py-1">
      S16 · Mar 26–27
    </span>
    <span className="rounded-full border border-neutral-700 bg-neutral-800 px-2 py-1">
      E8 · Mar 28–29
    </span>
    <span className="rounded-full border border-neutral-700 bg-neutral-800 px-2 py-1">
      FF · Apr 4
    </span>
    <span className="rounded-full border border-neutral-700 bg-neutral-800 px-2 py-1">
      Natty · Apr 6
    </span>
  </div>

  <div className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-2">
    <div className="overflow-x-auto [-webkit-overflow-scrolling:touch]">
      <div className="min-w-[820px] sm:min-w-[980px]">
        <LineChart
          width={900}
          height={320}
          data={chartData}
          margin={{ top: 8, right: 12, left: 0, bottom: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />

          <XAxis
            dataKey="day"
            interval={0}
            height={34}
            tick={{ fontSize: 10, fill: "#a1a1aa" }}
            axisLine={{ stroke: "#3f3f46" }}
            tickLine={{ stroke: "#3f3f46" }}
          />

          <YAxis
            domain={[0, yMax]}
            tickCount={5}
            width={34}
            tick={{ fontSize: 10, fill: "#a1a1aa" }}
            axisLine={{ stroke: "#3f3f46" }}
            tickLine={{ stroke: "#3f3f46" }}
          />

          <Tooltip
            isAnimationActive={false}
            contentStyle={{
              backgroundColor: "#18181b",
              border: "1px solid #3f3f46",
              borderRadius: "12px",
              color: "#f4f4f5",
              fontSize: "12px",
            }}
            labelStyle={{ color: "#f4f4f5" }}
            formatter={(value, name) => [value, name]}
            labelFormatter={(label) =>
              `${label} — ${roundLabels[label as string]}`
            }
          />

          {/* Round/day markers */}
          {days.map((day) => (
            <ReferenceLine
              key={day}
              x={day}
              stroke={
                day === "Apr 6"
                  ? "#fafafa"
                  : day === "Mar 18"
                  ? "#71717a"
                  : "#27272a"
              }
              strokeWidth={day === "Apr 6" ? 2 : 1}
            />
          ))}

          {sortedPlayers.map((player) => (
            <Line
              key={player}
              type="monotone"
              dataKey={player}
              stroke={playerColors[player]}
              strokeWidth={player === leader ? 3.25 : 2.25}
              connectNulls={false}
              isAnimationActive={false}
              activeDot={{ r: player === leader ? 6 : 4 }}
              dot={(props: any) => {
                if (props.value == null) return null;

                const isNatty = props.payload.day === "Apr 6";
                const isLeader = props.dataKey === leader;

                return (
                  <circle
                    cx={props.cx}
                    cy={props.cy}
                    r={isNatty ? 6 : isLeader ? 4.5 : 3}
                    fill={playerColors[props.dataKey as Player]}
                    stroke={isNatty ? "#fafafa" : "none"}
                    strokeWidth={isNatty ? 2 : 0}
                  />
                );
              }}
            />
          ))}
        </LineChart>
      </div>
    </div>

    <p className="mt-2 text-center text-[11px] text-neutral-500 sm:hidden">
      Tap dots to view points and swipe left to view more
    </p>
  </div>
</section>


        <section className="mt-4 mb-4 grid gap-3">
          <div className="relative overflow-hidden rounded-2xl border border-yellow-400/60 bg-yellow-500/10 px-4 py-4 shadow-lg">
            <div className="absolute inset-0 bg-yellow-400/10 blur-2xl" />
            <div className="relative">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-yellow-300/80">
                Current Winner
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="text-3xl">👑</span>
                  <div className="min-w-0">
                    <div className="winner-banner-text truncate text-lg font-extrabold">
                      {leader}
                    </div>
                    <div className="text-xs text-yellow-100/70">Ur tuff</div>
                  </div>
                </div>

                <div className="shrink-0 rounded-xl border border-yellow-300/40 bg-yellow-300/10 px-3 py-2 text-right">
                  <div className="winner-banner-text font-mono text-xl font-bold">
                    {latestScores[leader]}
                  </div>
                  <div className="text-[10px] text-yellow-100/70">
                    max {liveMaxPoints[leader]}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-red-500/50 bg-red-500/10 px-4 py-4 shadow-lg">
            <div className="absolute inset-0 bg-red-500/10 blur-2xl" />
            <div className="relative">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-red-300/80">
                Current Loser
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="text-3xl">💀</span>
                  <div className="min-w-0">
                    <div className="truncate text-lg font-bold text-red-200">
                      {loser}
                    </div>
                    <div className="text-xs text-red-100/70">Ur bad</div>
                  </div>
                </div>

                <div className="shrink-0 rounded-xl border border-red-300/30 bg-red-300/10 px-3 py-2 text-right">
                  <div className="font-mono text-xl font-bold text-red-100">
                    {latestScores[loser]}
                  </div>
                  <div className="text-[10px] text-red-100/60">
                    max {liveMaxPoints[loser]}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>


        <section className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-900 p-3 shadow-sm sm:p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">Brackets</h2>
            <div className="text-xs text-neutral-500">points • max</div>
          </div>

          <div className="space-y-2">
            {sortedPlayers.map((player, index) => (
              <div
                key={player}
                className={`rounded-xl border px-3 py-3 ${
                  player === leader
                    ? "border-yellow-400/40 bg-yellow-500/5"
                    : player === loser
                    ? "border-red-500/30 bg-red-500/5"
                    : "border-neutral-800 bg-neutral-950/40"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-6 shrink-0 text-sm font-semibold text-neutral-500">
                    #{index + 1}
                  </div>

                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: playerColors[player] }}
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm font-medium text-neutral-100">
                        {player}
                      </span>

                      <div className="shrink-0 text-right font-mono">
                        <div className="text-sm text-neutral-100">
                          {latestScores[player]}
                        </div>
                        <div className="text-[11px] text-neutral-500">
                          max {liveMaxPoints[player]}
                        </div>
                      </div>
                    </div>

                    {rankChanges[player] !== 0 && (
                      <div className="mt-1 flex items-center gap-2 text-[11px]">
                        {rankChanges[player] > 0 ? (
                          <span className="text-emerald-300">
                            ↑ +{rankChanges[player]} spot
                            {rankChanges[player] === 1 ? "" : "s"}
                          </span>
                        ) : (
                          <span className="text-rose-300">
                            ↓ {Math.abs(rankChanges[player])} spot
                            {Math.abs(rankChanges[player]) === 1 ? "" : "s"}
                          </span>
                        )}
                      </div>
                    )}

                    {player === leader && (
                      <div className="mt-1 text-[11px] text-yellow-300/80">
                        Leading score with max tiebreak
                      </div>
                    )}

                    {player === loser && (
                      <div className="mt-1 text-[11px] text-red-300/80">
                        Dead last right now
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}