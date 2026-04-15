const http = require("http");
const fs = require("fs");
const path = require("path");

const port = process.env.PORT || 3000;
const root = __dirname;
const desktopBase = "https://www.koreabaseball.com";
const mobileBase = "https://m.koreabaseball.com";
const srId = "0,1,3,4,5,6,7,8,9";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon"
};

const teamMeta = {
  LG: { short: "LG", color: "#a50034" },
  LT: { short: "LOT", color: "#041e42" },
  OB: { short: "DOO", color: "#131230" },
  SK: { short: "SSG", color: "#ce0e2d" },
  KT: { short: "KT", color: "#111111" },
  NC: { short: "NC", color: "#315288" },
  WO: { short: "KIW", color: "#570514" },
  HT: { short: "KIA", color: "#d71920" },
  SS: { short: "SAM", color: "#074ca1" },
  HH: { short: "HAN", color: "#ff6600" }
};

function json(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

async function postForm(baseUrl, endpoint, params) {
  const body = new URLSearchParams(params);
  const response = await fetch(`${baseUrl}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "User-Agent": "Mozilla/5.0 KBO-Live-Center",
      "Accept": "application/json, text/javascript, */*; q=0.01"
    },
    body
  });

  if (!response.ok) {
    throw new Error(`Upstream request failed: ${response.status}`);
  }

  return response.json();
}

function parseDate(dateString) {
  if (dateString && /^\d{8}$/.test(dateString)) {
    return dateString;
  }

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date()).replaceAll("-", "");
}

function shiftDate(dateString, diffDays) {
  const year = Number(dateString.slice(0, 4));
  const month = Number(dateString.slice(4, 6)) - 1;
  const day = Number(dateString.slice(6, 8));
  const date = new Date(Date.UTC(year, month, day));
  date.setUTCDate(date.getUTCDate() + diffDays);

  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0")
  ].join("");
}

function mapGameStatus(code) {
  switch (String(code)) {
    case "1":
      return "PRE";
    case "2":
      return "LIVE";
    case "3":
      return "FINAL";
    case "4":
      return "CANCEL";
    default:
      return "UNKNOWN";
  }
}

function getStatusLabel(status) {
  switch (status) {
    case "PRE":
      return "경기전";
    case "LIVE":
      return "진행중";
    case "FINAL":
      return "종료";
    case "CANCEL":
      return "취소";
    default:
      return "미정";
  }
}

function teamInfo(teamId, fallbackName = teamId) {
  const meta = teamMeta[teamId] || { short: teamId, color: "#555" };
  return {
    id: teamId,
    name: fallbackName,
    short: meta.short,
    color: meta.color
  };
}

async function fetchGameList(date) {
  return postForm(desktopBase, "/ws/Main.asmx/GetKboGameList", {
    leId: "1",
    srId,
    date
  });
}

async function fetchGameState(game) {
  return postForm(mobileBase, "/ws/Kbo.asmx/GetGameState", {
    le_id: String(game.LE_ID),
    sr_id: String(game.SR_ID),
    g_id: game.G_ID
  }).catch(() => ({ game: [] }));
}

function mapOverviewGame(game, stateData) {
  const state = stateData?.game?.[0];
  const status = mapGameStatus(state?.SECTION_ID ?? game.GAME_STATE_SC);
  const away = teamInfo(game.AWAY_ID, game.AWAY_NM);
  const home = teamInfo(game.HOME_ID, game.HOME_NM);

  return {
    gameId: game.G_ID,
    leId: String(game.LE_ID),
    srId: String(game.SR_ID),
    seasonId: String(game.SEASON_ID),
    stadium: game.S_NM,
    startTime: game.G_TM,
    date: game.G_DT,
    status,
    statusLabel: getStatusLabel(status),
    inningLabel: state ? `${state.INN_NO}회${state.TB_NM}` : `예정 ${game.G_TM}`,
    inning: state?.INN_NO ?? 0,
    half: state?.TB_SC ?? null,
    outs: Number(state?.OUT_CN ?? 0),
    balls: Number(state?.BALL_CN ?? 0),
    strikes: Number(state?.STRIKE_CN ?? 0),
    bases: [
      String(state?.BASE_SC ?? "").includes("1"),
      String(state?.BASE_SC ?? "").includes("2"),
      String(state?.BASE_SC ?? "").includes("3")
    ],
    away: {
      ...away,
      score: Number(state?.A_SCORE_CN ?? game.T_SCORE_CN ?? 0),
      rank: game.T_RANK_NO,
      starter: (game.T_PIT_P_NM || "").trim()
    },
    home: {
      ...home,
      score: Number(state?.H_SCORE_CN ?? game.B_SCORE_CN ?? 0),
      rank: game.B_RANK_NO,
      starter: (game.B_PIT_P_NM || "").trim()
    }
  };
}

function parseTableJson(raw, fallback = { rows: [] }) {
  return raw ? JSON.parse(raw) : fallback;
}

function extractLogs(liveTextData) {
  const logs = [];
  for (const inningBlock of liveTextData?.listInnTb || []) {
    for (const batOrder of inningBlock.listBatOrder || []) {
      for (const item of batOrder.listData || []) {
        logs.push({
          inning: `${inningBlock.INN_NO}회${inningBlock.TB_NM}`,
          text: item.LIVETEXT_IF
        });
      }
    }
  }
  return logs.slice(-12).reverse();
}

function mapGround(data) {
  return {
    nextHitters: (data?.listNextHitter || []).map((item) => `${item.BAT_ORDER_NO}번 ${item.P_NM}`),
    defense: (data?.listDefense || []).map((item) => `${item.POS_SC}:${item.P_NM}`),
    runners: (data?.listRunner || []).map((item) => `${item.POS_SC}루 ${item.P_NM}`),
    hitter: data?.listHitter?.[0]?.P_NM || ""
  };
}

function mapRecentGame(game, teamId) {
  const isAway = game.AWAY_ID === teamId;
  const teamName = isAway ? game.AWAY_NM : game.HOME_NM;
  const opponentId = isAway ? game.HOME_ID : game.AWAY_ID;
  const opponentName = isAway ? game.HOME_NM : game.AWAY_NM;
  const teamScore = Number(isAway ? game.T_SCORE_CN : game.B_SCORE_CN);
  const opponentScore = Number(isAway ? game.B_SCORE_CN : game.T_SCORE_CN);
  const result = teamScore > opponentScore ? "W" : teamScore < opponentScore ? "L" : "D";

  return {
    gameId: game.G_ID,
    date: game.G_DT,
    stadium: game.S_NM,
    team: teamInfo(teamId, teamName),
    opponent: teamInfo(opponentId, opponentName),
    isHome: !isAway,
    teamScore,
    opponentScore,
    result,
    resultLabel: result === "W" ? "승" : result === "L" ? "패" : "무",
    summary: `${teamName} ${teamScore} : ${opponentScore} ${opponentName}`
  };
}

async function handleLiveApi(res, url) {
  try {
    const date = parseDate(url.searchParams.get("date"));
    const listData = await fetchGameList(date);
    const games = listData.game || [];
    const stateResults = await Promise.all(games.map(fetchGameState));
    const mapped = games.map((game, index) => mapOverviewGame(game, stateResults[index]));

    json(res, 200, {
      date,
      updatedAt: new Date().toISOString(),
      games: mapped
    });
  } catch (error) {
    json(res, 500, {
      error: "live_fetch_failed",
      message: error.message
    });
  }
}

async function handleGameApi(res, url) {
  try {
    const gameId = url.searchParams.get("gameId");
    const leId = url.searchParams.get("leId") || "1";
    const srIdForGame = url.searchParams.get("srId") || "0";

    if (!gameId) {
      json(res, 400, { error: "missing_game_id" });
      return;
    }

    const [stateData, scoreData, groundData] = await Promise.all([
      postForm(mobileBase, "/ws/Kbo.asmx/GetGameState", {
        le_id: leId,
        sr_id: srIdForGame,
        g_id: gameId
      }),
      postForm(mobileBase, "/ws/Kbo.asmx/GetLiveTextScore", {
        le_id: leId,
        sr_id: srIdForGame,
        g_id: gameId,
        sc_id: srIdForGame === "8" ? "41" : "0"
      }),
      postForm(mobileBase, "/ws/Kbo.asmx/GetLiveTextGround", {
        le_id: leId,
        sr_id: srIdForGame,
        g_id: gameId
      })
    ]);

    const state = stateData.game?.[0];
    const inning = state?.INN_NO
      ? String(state.INN_NO > 9 ? "10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25" : state.INN_NO)
      : "1";
    const order = state?.SECTION_ID === 3 ? "ASC" : "DESC";

    const [liveTextData, resultData] = await Promise.all([
      postForm(mobileBase, "/ws/Kbo.asmx/GetLiveText", {
        le_id: leId,
        sr_id: srIdForGame,
        g_id: gameId,
        inning,
        order
      }).catch(() => ({ listInnTb: [] })),
      postForm(mobileBase, "/ws/Kbo.asmx/GetLiveTextResult", {
        le_id: leId,
        sr_id: srIdForGame,
        g_id: gameId
      }).catch(() => ({ listResult: [] }))
    ]);

    const scoreRows = parseTableJson(scoreData.scoreTable).rows || [];
    const resultRows = parseTableJson(scoreData.resultTable).rows || [];

    json(res, 200, {
      updatedAt: new Date().toISOString(),
      state,
      inningScores: {
        away: scoreRows[0]?.row?.map((cell) => cell.Text) || [],
        home: scoreRows[1]?.row?.map((cell) => cell.Text) || []
      },
      scoreInfo: {
        totals: resultRows.map((row) => row.row.map((cell) => cell.Text))
      },
      ground: mapGround(groundData),
      logs: extractLogs(liveTextData),
      resultText: (resultData.listResult || []).map((item) => item.LIVETEXT_IF)
    });
  } catch (error) {
    json(res, 500, {
      error: "game_fetch_failed",
      message: error.message
    });
  }
}

async function handleTeamApi(res, url) {
  try {
    const teamId = url.searchParams.get("teamId");
    const date = parseDate(url.searchParams.get("date"));
    const limit = Math.min(Number(url.searchParams.get("limit") || 5), 10);

    if (!teamId) {
      json(res, 400, { error: "missing_team_id" });
      return;
    }

    const todayList = await fetchGameList(date);
    const todayGames = todayList.game || [];
    const todayGame = todayGames.find((game) => game.AWAY_ID === teamId || game.HOME_ID === teamId) || null;
    const teamName =
      todayGame?.AWAY_ID === teamId ? todayGame.AWAY_NM
      : todayGame?.HOME_ID === teamId ? todayGame.HOME_NM
      : teamId;

    const recentGames = [];
    const seenGameIds = new Set();

    for (let offset = 1; offset <= 30 && recentGames.length < limit; offset += 1) {
      const targetDate = shiftDate(date, -offset);
      const list = await fetchGameList(targetDate);
      for (const game of list.game || []) {
        if (seenGameIds.has(game.G_ID)) {
          continue;
        }
        if (game.AWAY_ID !== teamId && game.HOME_ID !== teamId) {
          continue;
        }
        if (mapGameStatus(game.GAME_STATE_SC) !== "FINAL") {
          continue;
        }
        seenGameIds.add(game.G_ID);
        recentGames.push(mapRecentGame(game, teamId));
        if (recentGames.length >= limit) {
          break;
        }
      }
    }

    const wins = recentGames.filter((game) => game.result === "W").length;
    const losses = recentGames.filter((game) => game.result === "L").length;
    const draws = recentGames.filter((game) => game.result === "D").length;

    json(res, 200, {
      updatedAt: new Date().toISOString(),
      team: teamInfo(teamId, teamName),
      todayGame: todayGame
        ? {
            gameId: todayGame.G_ID,
            stadium: todayGame.S_NM,
            startTime: todayGame.G_TM,
            opponent: teamInfo(
              todayGame.AWAY_ID === teamId ? todayGame.HOME_ID : todayGame.AWAY_ID,
              todayGame.AWAY_ID === teamId ? todayGame.HOME_NM : todayGame.AWAY_NM
            ),
            isHome: todayGame.HOME_ID === teamId,
            status: mapGameStatus(todayGame.GAME_STATE_SC)
          }
        : null,
      recentSummary: {
        wins,
        losses,
        draws,
        recentForm: recentGames.map((game) => game.result).join("")
      },
      recentGames
    });
  } catch (error) {
    json(res, 500, {
      error: "team_fetch_failed",
      message: error.message
    });
  }
}

function serveStatic(req, res) {
  const requestPath = req.url === "/" ? "/index.html" : req.url;
  const safePath = path.normalize(requestPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(root, safePath);

  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(error.code === "ENOENT" ? 404 : 500, {
        "Content-Type": "text/plain; charset=utf-8"
      });
      res.end(error.code === "ENOENT" ? "Not Found" : "Server Error");
      return;
    }

    const extension = path.extname(filePath);
    res.writeHead(200, {
      "Content-Type": mimeTypes[extension] || "application/octet-stream"
    });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/api/live") {
    await handleLiveApi(res, url);
    return;
  }

  if (url.pathname === "/api/game") {
    await handleGameApi(res, url);
    return;
  }

  if (url.pathname === "/api/team") {
    await handleTeamApi(res, url);
    return;
  }

  serveStatic(req, res);
});

server.listen(port, () => {
  console.log(`KBO Live Center running on http://localhost:${port}`);
});
