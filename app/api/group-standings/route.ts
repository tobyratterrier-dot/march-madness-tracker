import { load } from "cheerio";

const GROUP_URL =
  "https://fantasy.espn.com/games/tournament-challenge-bracket-2026/group?id=155ef3d6-da10-40b3-9929-63257c68eef7&joinKey=6b3c9035-60f2-327e-a22b-c4f8bb4fe49e&joining=true";

export async function GET() {
  const res = await fetch(GROUP_URL, {
    cache: "no-store",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    },
  });

  const html = await res.text();

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}