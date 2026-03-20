import { chromium } from "playwright";
import fs from "fs/promises";

const GROUP_URL =
  "https://fantasy.espn.com/games/tournament-challenge-bracket-2026/group?id=155ef3d6-da10-40b3-9929-63257c68eef7&joinKey=6b3c9035-60f2-327e-a22b-c4f8bb4fe49e&joining=true";

const DAYS = [
  "Mar 18",
  "Mar 19",
  "Mar 20",
  "Mar 21",
  "Mar 22",
  "Mar 26",
  "Mar 27",
  "Mar 28",
  "Mar 29",
  "Apr 4",
  "Apr 6",
];

const PLAYERS = [
  "espnfan0099",
  "will3burns Picks 1",
  "Acuff 1.01",
  "Beverly Hillbilly",
  "PHILONPHILON",
  "Cant bet against the zags",
  "Slobonmyhawgggg",
  "G Goff",
];

function normalizeBracketName(raw) {
  const mappings = [
    ["espnfan0099115102's Picks 1espnfan0099115102", "espnfan0099"],
    ["Beverly Hillbilly ESPNFAN0076243832", "Beverly Hillbilly"],
    ["PHILONPHILONPHILONdaltonns13", "PHILONPHILON"],
    ["Cant bet against the zagsespn30615890", "Cant bet against the zags"],
    ["will3burns's Picks 1will3burns", "will3burns Picks 1"],
    ["Acuff 1.01espn71685244", "Acuff 1.01"],
    ["Slobonmyhawggggespn73595594", "Slobonmyhawgggg"],
    ["G GoffGarrett Goff", "G Goff"],
  ];

  for (const [match, clean] of mappings) {
    if (raw === match) return clean;
  }

  return raw;
}

function getTodayLabel() {
  return new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "America/New_York",
  });
}

async function readJsonIfExists(path, fallback) {
  try {
    const raw = await fs.readFile(path, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function buildEmptyHistory() {
  return DAYS.map((day) => {
    const row = { day };
    for (const player of PLAYERS) {
      row[player] = day === "Mar 18" ? 0 : null;
    }
    return row;
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto(GROUP_URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);
  await page.waitForSelector("text=GROUP RESULTS", { timeout: 15000 });

  const rows = await page.locator("table tbody tr").evaluateAll((trs) =>
    trs.map((tr) => {
      const cells = Array.from(tr.querySelectorAll("td")).map((td) =>
        (td.textContent || "").replace(/\s+/g, " ").trim()
      );
      return cells;
    })
  );

  const standings = rows
    .map((cells) => {
      if (cells.length < 6) return null;

      return {
        rank: Number(cells[0]) || 0,
        player: normalizeBracketName(cells[2] || ""),
        pts: Number(cells[3]) || 0,
        pct: Number(cells[4]) || null,
        max: Number(cells[5]) || 0,
        r64: cells[6] ? Number(cells[6]) || null : null,
      };
    })
    .filter(Boolean);

  await fs.mkdir("public", { recursive: true });

  // Write live standings file
  const fetchedAt = new Date().toISOString();
  await fs.writeFile(
    "public/group-standings.json",
    JSON.stringify(
      {
        fetchedAt,
        standings,
      },
      null,
      2
    )
  );

  // Read or initialize history
  let history = await readJsonIfExists("public/history.json", buildEmptyHistory());

  // Make sure all expected days exist
  history = DAYS.map((day) => {
    const existing = history.find((row) => row.day === day);
    if (existing) return existing;

    const row = { day };
    for (const player of PLAYERS) {
      row[player] = day === "Mar 18" ? 0 : null;
    }
    return row;
  });

  const today = getTodayLabel();

  if (DAYS.includes(today)) {
    const todayRow = history.find((row) => row.day === today);

    if (todayRow) {
      for (const player of PLAYERS) {
        todayRow[player] = null;
      }

      for (const row of standings) {
        if (row.player in todayRow) {
          todayRow[row.player] = row.pts;
        }
      }
    }
  } else {
    console.warn(`Today's label "${today}" is not in DAYS, so history was not updated.`);
  }

  await fs.writeFile("public/history.json", JSON.stringify(history, null, 2));

  console.log("Saved public/group-standings.json");
  console.log("Saved public/history.json");
  console.log("Updated day:", today);
  console.log(standings);

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});