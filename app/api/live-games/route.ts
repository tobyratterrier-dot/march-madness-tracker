export async function GET() {
  try {
    const res = await fetch(
      "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard",
      {
        cache: "no-store",
      }
    );

    if (!res.ok) {
      return Response.json(
        { error: "Failed to fetch scoreboard" },
        { status: 500 }
      );
    }

    const data = await res.json();

    const games =
      data?.events
        ?.map((event: any) => {
          const comp = event?.competitions?.[0];
          const competitors = comp?.competitors ?? [];

          const home = competitors.find((t: any) => t.homeAway === "home");
          const away = competitors.find((t: any) => t.homeAway === "away");

          const state = comp?.status?.type?.state ?? "";
          const completed = comp?.status?.type?.completed ?? false;

          return {
            id: event.id,
            homeTeam: home?.team?.shortDisplayName ?? "Home",
            awayTeam: away?.team?.shortDisplayName ?? "Away",
            homeScore: Number(home?.score ?? 0),
            awayScore: Number(away?.score ?? 0),
            status: comp?.status?.type?.shortDetail ?? "Scheduled",
            state,
            completed,
            isLive: state === "in",
          };
        })
        ?.filter((game: any) => game.state !== "pre") ?? [];

    return Response.json(games);
  } catch (error) {
    console.error("live-games route error:", error);
    return Response.json(
      { error: "Unexpected server error" },
      { status: 500 }
    );
  }
}