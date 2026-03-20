"use client";

import { useEffect, useState } from "react";
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

export default function HomePage() {
  const [games, setGames] = useState<LiveGame[]>([]);
  const [groupStandings, setGroupStandings] = useState<GroupStanding[]>([]);
  const [chartData, setChartData] = useState<HistoryRow[]>([]);
  const [fetchedAt, setFetchedAt] = useState("");

  useEffect(() => {
    const fetchGames = async () => {
      try {
        const res = await fetch("/api/live-games");
        if (!res.ok) return;

        const data = await res.json();
        if (Array.isArray(data)) {
          setGames(data);
        } else {
          setGames([]);
        }
      } catch {
        setGames([]);
      }
    };

    fetchGames();
    const interval = setInterval(fetchGames, 5000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const fetchGroupStandings = async () => {
      try {
        const res = await fetch(`/group-standings.json?t=${Date.now()}`, {
          cache: "no-store",
        });
        if (!res.ok) return;

        const data = await res.json();
        if (Array.isArray(data?.standings)) {
          setGroupStandings(data.standings);
          setFetchedAt(data.fetchedAt ?? "");
        } else {
          setGroupStandings([]);
          setFetchedAt("");
        }
      } catch {
        setGroupStandings([]);
        setFetchedAt("");
      }
    };

    fetchGroupStandings();
    const interval = setInterval(fetchGroupStandings, 5000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await fetch(`/history.json?t=${Date.now()}`, {
          cache: "no-store",
        });
        if (!res.ok) return;

        const data = await res.json();
        if (Array.isArray(data)) {
          setChartData(data);
        } else {
          setChartData([]);
        }
      } catch {
        setChartData([]);
      }
    };

    fetchHistory();
    const interval = setInterval(fetchHistory, 5000);

    return () => clearInterval(interval);
  }, []);

  const maxScore = Math.max(
    0,
    ...chartData.flatMap((row) =>
      players.map((player) => {
        const value = row[player as keyof typeof row];
        return typeof value === "number" ? value : 0;
      })
    )
  );

  const yMax = Math.min(maxScore + 100, 1920);

  const latestScores: Record<string, number> = {};
  const liveMaxPoints: Record<string, number> = {};

  players.forEach((player) => {
    latestScores[player] = 0;
    liveMaxPoints[player] = 0;
  });

  groupStandings.forEach((row) => {
    if (row.player in latestScores) {
      latestScores[row.player] = row.pts ?? 0;
      liveMaxPoints[row.player] = row.max ?? 0;
    }
  });

  const sortedPlayers = [...players].sort((a, b) => {
    const scoreDiff = latestScores[b] - latestScores[a];
    if (scoreDiff !== 0) return scoreDiff;

    const maxDiff = liveMaxPoints[b] - liveMaxPoints[a];
    if (maxDiff !== 0) return maxDiff;

    return a.localeCompare(b);
  });

  const leader = sortedPlayers[0];
  const loser = sortedPlayers[sortedPlayers.length - 1];

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

          {/* {fetchedAt && (
            <div className="mt-3 text-[11px] text-neutral-500">
              Bracket Scores Last{" "}
              {new Date(fetchedAt).toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
                second: "2-digit",
              })}
            </div>
          )} */}
        </header>

        <section className="mb-4 rounded-2xl border border-neutral-800 bg-neutral-900 p-3 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-white">Live Games</h2>
              <p className="text-[11px] text-neutral-500">Updates every 5s</p>
            </div>
          </div>

          <div
            className={`grid gap-2 ${
              games.length > 2 ? "grid-cols-2" : "grid-cols-1"
            }`}
          >
            {games.length === 0 ? (
              <div className="text-xs text-neutral-500">
                No started games right now
              </div>
            ) : (
              games.map((game) => {
                const isClose =
                  game.isLive &&
                  !game.status.includes("1st") &&
                  Math.abs(game.homeScore - game.awayScore) <= 5;

                return (
                  <div
                    key={game.id}
                    className={`relative overflow-hidden rounded-xl border p-3 transition-all ${
                      isClose
                        ? "border-yellow-400/40 bg-yellow-500/10 shadow-[0_0_18px_rgba(250,204,21,0.14)]"
                        : "border-neutral-800 bg-neutral-950/50"
                    }`}
                  >
                    {isClose && (
                      <div className="pointer-events-none absolute inset-0 rounded-xl bg-yellow-400/5 blur-xl" />
                    )}

                    <div className="relative">
                      <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              game.isLive
                                ? "bg-red-500/15 text-red-300"
                                : "bg-neutral-800 text-neutral-400"
                            }`}
                          >
                            {game.isLive ? "LIVE" : "FINAL"}
                          </span>

                          {isClose && (
                            <span className="rounded-full bg-yellow-400/15 px-2 py-0.5 text-[10px] font-medium text-yellow-300">
                              CLOSE
                            </span>
                          )}
                        </div>

                        <span className="truncate text-[10px] text-neutral-500">
                          {game.status}
                        </span>
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-3">
                          <span className="truncate text-sm text-neutral-200">
                            {game.awayTeam}
                          </span>
                          <span
                            className={`font-mono text-base font-semibold ${
                              isClose ? "text-yellow-100" : "text-white"
                            }`}
                          >
                            {game.awayScore}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-3">
                          <span className="truncate text-sm text-neutral-200">
                            {game.homeTeam}
                          </span>
                          <span
                            className={`font-mono text-base font-semibold ${
                              isClose ? "text-yellow-100" : "text-white"
                            }`}
                          >
                            {game.homeScore}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-3 shadow-sm sm:p-4">
          <div className="mb-3 overflow-x-auto [-webkit-overflow-scrolling:touch]">
            <div className="flex min-w-max gap-2">
              {[
                ["Round of 64", "Mar 19–20"],
                ["Round of 32", "Mar 21–22"],
                ["Sweet 16", "Mar 26–27"],
                ["Elite 8", "Mar 28–29"],
                ["Final Four", "Apr 4"],
                ["Natty", "Apr 6"],
              ].map(([title, date]) => (
                <div
                  key={title}
                  className="rounded-lg border border-neutral-800 bg-neutral-800 px-3 py-2 text-center text-[11px] leading-tight text-neutral-200"
                >
                  <div className="font-medium">{title}</div>
                  <div className="mt-1 text-neutral-400">{date}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-2">
            <div className="overflow-x-auto [-webkit-overflow-scrolling:touch]">
              <div className="min-w-[820px] sm:min-w-[980px]">
                <LineChart
                  width={980}
                  height={360}
                  data={chartData}
                  margin={{ top: 16, right: 16, left: 0, bottom: 12 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />

                  <XAxis
                    dataKey="day"
                    interval={0}
                    height={36}
                    tick={{ fontSize: 10, fill: "#a1a1aa" }}
                    axisLine={{ stroke: "#3f3f46" }}
                    tickLine={{ stroke: "#3f3f46" }}
                  />

                  <YAxis
                    domain={[0, yMax]}
                    tickCount={5}
                    width={38}
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

                  {days.map((day: string) => (
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

                  {sortedPlayers.map((player: string) => (
                    <Line
                      key={player}
                      type="monotone"
                      dataKey={player}
                      stroke={playerColors[player]}
                      strokeWidth={player === leader ? 3.5 : 2.25}
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
                            fill={playerColors[props.dataKey]}
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
              Click dots for stats and swipe sideways to view the graph
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
            <div className="text-xs text-neutral-500">score • max</div>
          </div>

          <div className="space-y-2">
            {sortedPlayers.map((player: string, index) => (
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

                    {player === leader && (
                      <div className="mt-1 text-[11px] text-yellow-300/80">
                        Leading on score + tiebreak
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