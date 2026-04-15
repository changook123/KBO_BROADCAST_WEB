const FAVORITE_TEAM_KEY = "kbo.favoriteTeam";
const FAVORITE_FILTER_KEY = "kbo.favoriteFilter";

const state = {
  date: getKstDate(),
  games: [],
  selectedGameId: null,
  selectedGameDetail: null,
  favoriteHome: null,
  loading: true,
  error: null,
  favoriteTeamId: window.localStorage.getItem(FAVORITE_TEAM_KEY) || "",
  favoriteOnly: window.localStorage.getItem(FAVORITE_FILTER_KEY) === "true"
};

const elements = {
  gamesGrid: document.querySelector("#gamesGrid"),
  teamsBoard: document.querySelector("#teamsBoard"),
  spotlight: document.querySelector("#spotlight"),
  favoriteHome: document.querySelector("#favoriteHome"),
  lastUpdated: document.querySelector("#lastUpdated"),
  gamesToday: document.querySelector("#gamesToday"),
  teamsLive: document.querySelector("#teamsLive"),
  boardNotice: document.querySelector("#boardNotice"),
  gameCardTemplate: document.querySelector("#gameCardTemplate"),
  favoriteTeamSelect: document.querySelector("#favoriteTeamSelect"),
  favoriteTeamToggle: document.querySelector("#favoriteTeamToggle")
};

function getKstDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date()).replaceAll("-", "");
}

function formatClock(date = new Date()) {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date);
}

function formatDateLabel(dateString) {
  return `${dateString.slice(4, 6)}.${dateString.slice(6, 8)}`;
}

function getFavoriteGames() {
  if (!state.favoriteTeamId) {
    return [];
  }

  return state.games.filter((game) => game.away.id === state.favoriteTeamId || game.home.id === state.favoriteTeamId);
}

function getVisibleGames() {
  const favoriteGames = getFavoriteGames();

  if (state.favoriteOnly && state.favoriteTeamId) {
    return favoriteGames;
  }

  if (!state.favoriteTeamId) {
    return state.games;
  }

  const rest = state.games.filter((game) => !favoriteGames.includes(game));
  return [...favoriteGames, ...rest];
}

function getVisibleTeams() {
  const sourceGames = state.favoriteOnly && state.favoriteTeamId ? getFavoriteGames() : getVisibleGames();
  return sourceGames.flatMap((game) => [game.away, game.home].map((team) => ({ team, game })));
}

function persistFavoriteState() {
  if (state.favoriteTeamId) {
    window.localStorage.setItem(FAVORITE_TEAM_KEY, state.favoriteTeamId);
  } else {
    window.localStorage.removeItem(FAVORITE_TEAM_KEY);
  }
  window.localStorage.setItem(FAVORITE_FILTER_KEY, String(state.favoriteOnly));
}

function hydrateFavoriteTeamOptions() {
  const teams = new Map();
  state.games.forEach((game) => {
    teams.set(game.away.id, game.away.name);
    teams.set(game.home.id, game.home.name);
  });

  const options = ['<option value="">전체 팀 보기</option>'];
  Array.from(teams.entries())
    .sort((a, b) => a[1].localeCompare(b[1], "ko"))
    .forEach(([id, name]) => {
      options.push(`<option value="${id}">${name}</option>`);
    });

  elements.favoriteTeamSelect.innerHTML = options.join("");
  elements.favoriteTeamSelect.value = state.favoriteTeamId;
}

function ensureSelectedGame() {
  const visibleGames = getVisibleGames();

  if (!state.selectedGameId && visibleGames[0]) {
    state.selectedGameId = visibleGames[0].gameId;
    return;
  }

  if (state.favoriteOnly && state.favoriteTeamId) {
    const favoriteGames = getFavoriteGames();
    const hasSelectedFavorite = favoriteGames.some((game) => game.gameId === state.selectedGameId);
    if (!hasSelectedFavorite) {
      state.selectedGameId = favoriteGames[0]?.gameId || null;
    }
    return;
  }

  if (state.selectedGameId && !state.games.some((game) => game.gameId === state.selectedGameId)) {
    state.selectedGameId = visibleGames[0]?.gameId || null;
  }
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

async function loadOverview() {
  const data = await fetchJson(`/api/live?date=${state.date}`);
  state.games = data.games;
  hydrateFavoriteTeamOptions();
  ensureSelectedGame();
  state.loading = false;
  state.error = null;
  elements.lastUpdated.textContent = formatClock(new Date(data.updatedAt));
}

async function loadSelectedGame() {
  const selectedGame = state.games.find((game) => game.gameId === state.selectedGameId);
  if (!selectedGame) {
    state.selectedGameDetail = null;
    return;
  }

  state.selectedGameDetail = await fetchJson(
    `/api/game?gameId=${selectedGame.gameId}&leId=${selectedGame.leId}&srId=${selectedGame.srId}`
  );
}

async function loadFavoriteHome() {
  if (!state.favoriteTeamId) {
    state.favoriteHome = null;
    return;
  }

  state.favoriteHome = await fetchJson(`/api/team?teamId=${state.favoriteTeamId}&date=${state.date}&limit=5`);
}

async function refreshAll() {
  try {
    await loadOverview();
    await Promise.all([loadSelectedGame(), loadFavoriteHome()]);
  } catch (error) {
    state.error = "KBO 공식 데이터를 불러오지 못했습니다.";
  }

  render();
}

function render() {
  renderMeta();
  renderFavoriteControls();
  renderFavoriteHome();
  renderGames();
  renderSpotlight();
  renderTeams();
}

function renderMeta() {
  const visibleGames = getVisibleGames();
  const visibleTeams = new Set(visibleGames.flatMap((game) => [game.away.id, game.home.id]));
  elements.gamesToday.textContent = String(visibleGames.length || 0);
  elements.teamsLive.textContent = String(visibleTeams.size);

  if (state.error) {
    elements.boardNotice.textContent = state.error;
    return;
  }

  if (state.loading) {
    elements.boardNotice.textContent = "KBO 공식 데이터를 불러오는 중입니다.";
    return;
  }

  if (state.favoriteOnly && state.favoriteTeamId) {
    const favoriteGames = getFavoriteGames();
    elements.boardNotice.textContent =
      favoriteGames.length === 0
        ? `${state.favoriteHome?.team?.name || "마이 팀"} 경기만 보기로 설정되어 있지만 오늘 경기가 없습니다.`
        : `${state.favoriteHome?.team?.name || "마이 팀"} 경기 ${favoriteGames.length}개만 표시 중입니다.`;
    return;
  }

  if (state.favoriteTeamId) {
    elements.boardNotice.textContent = `${state.favoriteHome?.team?.name || "마이 팀"} 경기를 상단에 우선 표시하고 있습니다.`;
    return;
  }

  if (state.games.every((game) => game.status === "PRE")) {
    elements.boardNotice.textContent =
      `${state.date.slice(0, 4)}.${state.date.slice(4, 6)}.${state.date.slice(6, 8)} 기준 전 경기가 경기 전입니다. 경기 시작 후 자동으로 실시간 상태가 반영됩니다.`;
    return;
  }

  elements.boardNotice.textContent = "KBO 공식 실시간 데이터 기준입니다.";
}

function renderFavoriteControls() {
  elements.favoriteTeamSelect.value = state.favoriteTeamId;
  elements.favoriteTeamToggle.disabled = !state.favoriteTeamId;
  elements.favoriteTeamToggle.classList.toggle("is-active", state.favoriteOnly);
  elements.favoriteTeamToggle.textContent = state.favoriteOnly ? "마이 팀만 보기" : "전체 보기";
}

function renderFavoriteHome() {
  if (!state.favoriteTeamId) {
    elements.favoriteHome.innerHTML = `
      <div class="favorite-home__empty">
        <strong>마이 팀을 선택하면 전용 홈화면이 열립니다.</strong>
        최근 경기 기록, 오늘 경기, 최근 전적이 이 영역에 표시됩니다.
      </div>
    `;
    return;
  }

  if (!state.favoriteHome) {
    elements.favoriteHome.innerHTML = `<div class="favorite-home__empty">마이 팀 홈 데이터를 불러오는 중입니다.</div>`;
    return;
  }

  const { team, todayGame, recentSummary, recentGames } = state.favoriteHome;
  const todaySummary = todayGame
    ? `${todayGame.isHome ? "홈" : "원정"} · ${todayGame.opponent.name} · ${todayGame.stadium} · ${todayGame.startTime}`
    : "오늘 경기가 없습니다.";

  const recentItems = recentGames.map((game) => `
    <article class="recent-game recent-game--${game.result.toLowerCase()}">
      <div class="recent-game__top">
        <span class="recent-game__result">${game.resultLabel}</span>
        <span class="recent-game__date">${formatDateLabel(game.date)}</span>
      </div>
      <strong class="recent-game__score">${game.teamScore} : ${game.opponentScore}</strong>
      <p class="recent-game__meta">${game.isHome ? "홈" : "원정"} · vs ${game.opponent.name}</p>
      <p class="recent-game__meta">${game.stadium}</p>
    </article>
  `).join("");

  elements.favoriteHome.innerHTML = `
    <section class="favorite-summary" style="--team-color:${team.color}">
      <div class="favorite-summary__hero">
        <span class="favorite-summary__logo">${team.short}</span>
        <div>
          <p class="panel__eyebrow">Favorite Club</p>
          <h3>${team.name}</h3>
          <p class="favorite-summary__copy">최근 흐름과 오늘 경기를 중심으로 보는 전용 홈입니다.</p>
        </div>
      </div>

      <div class="favorite-summary__stats">
        <div class="favorite-stat">
          <span>최근 5경기</span>
          <strong>${recentSummary.wins}승 ${recentSummary.losses}패${recentSummary.draws ? ` ${recentSummary.draws}무` : ""}</strong>
        </div>
        <div class="favorite-stat">
          <span>최근 흐름</span>
          <strong>${recentSummary.recentForm || "-"}</strong>
        </div>
        <div class="favorite-stat">
          <span>오늘 경기</span>
          <strong>${todayGame ? todayGame.opponent.name : "없음"}</strong>
        </div>
      </div>

      <div class="favorite-summary__today">
        <p class="panel__eyebrow">Today</p>
        <strong>${todaySummary}</strong>
      </div>
    </section>

    <section class="favorite-recent">
      <div class="panel__header">
        <div>
          <p class="panel__eyebrow">Recent Games</p>
          <h3>최근 경기 기록</h3>
        </div>
      </div>
      <div class="recent-games">${recentItems || '<div class="favorite-home__empty">최근 경기 데이터가 없습니다.</div>'}</div>
    </section>
  `;
}

function renderGames() {
  const visibleGames = getVisibleGames();
  elements.gamesGrid.innerHTML = "";

  visibleGames.forEach((game) => {
    const node = elements.gameCardTemplate.content.firstElementChild.cloneNode(true);
    const isFavorite = state.favoriteTeamId && (game.away.id === state.favoriteTeamId || game.home.id === state.favoriteTeamId);

    node.dataset.gameId = game.gameId;
    node.classList.toggle("is-selected", game.gameId === state.selectedGameId);
    node.classList.toggle("is-favorite", isFavorite);
    node.querySelector(".game-card__status").textContent = game.statusLabel;
    node.querySelector(".game-card__stadium").textContent = `${game.stadium} | ${game.startTime}`;
    node.querySelector(".game-card__inning").textContent =
      game.status === "PRE"
        ? `선발 ${game.away.starter} vs ${game.home.starter}`
        : `${game.inningLabel} | B ${game.balls} S ${game.strikes} O ${game.outs}`;

    const teamsNode = node.querySelector(".game-card__teams");
    teamsNode.append(
      createTeamRow(game.away, `순위 ${game.away.rank ?? "-"}`),
      createTeamRow(game.home, `순위 ${game.home.rank ?? "-"}`)
    );

    const [first, second, third] = node.querySelectorAll(".base");
    first.classList.toggle("is-occupied", Boolean(game.bases[0]));
    second.classList.toggle("is-occupied", Boolean(game.bases[1]));
    third.classList.toggle("is-occupied", Boolean(game.bases[2]));

    node.querySelector(".count").textContent =
      game.status === "PRE" ? `잠시 후 ${game.startTime}` : `B ${game.balls} S ${game.strikes} O ${game.outs}`;

    node.addEventListener("click", async () => {
      state.selectedGameId = game.gameId;
      render();
      try {
        await loadSelectedGame();
      } catch {
        state.error = "선택 경기 상세를 불러오지 못했습니다.";
      }
      render();
    });

    elements.gamesGrid.appendChild(node);
  });
}

function createTeamRow(team, metaText) {
  const row = document.createElement("div");
  row.className = "game-card__row";
  row.innerHTML = `
    <div class="team-badge">
      <span class="team-badge__logo" style="background:${team.color}">${team.short}</span>
      <div>
        <span class="team-badge__name">${team.name}</span>
        <span class="team-badge__record">${metaText}</span>
      </div>
    </div>
    <strong class="team-score">${team.score}</strong>
  `;
  return row;
}

function renderSpotlight() {
  const game = state.games.find((item) => item.gameId === state.selectedGameId);
  const detail = state.selectedGameDetail;

  if (!game) {
    elements.spotlight.innerHTML = `<div class="spotlight__empty">표시할 경기가 없습니다.</div>`;
    return;
  }

  if (!detail?.state) {
    elements.spotlight.innerHTML = `
      <div class="spotlight__empty">
        <strong>${game.away.name} vs ${game.home.name}</strong><br />
        현재는 경기 전이거나 상세 데이터가 아직 열리지 않았습니다.<br />
        예정 시간 ${game.startTime}, 장소 ${game.stadium}
      </div>
    `;
    return;
  }

  const inningRows = detail.inningScores.away.map((awayScore, index) => `
    <div class="inning-line">
      <span>${index + 1}회</span>
      <strong>${game.away.short} ${awayScore} : ${game.home.short} ${detail.inningScores.home[index] ?? "-"}</strong>
    </div>
  `).join("");

  const logs = (detail.logs || []).slice(0, 8).map((entry, index) => `
    <div class="log-item">
      <strong>${entry.text}</strong>
      <span>${index === 0 ? `${entry.inning} 최신` : entry.inning}</span>
    </div>
  `).join("");

  const nextHitters = (detail.ground?.nextHitters || []).join(" / ") || "정보 없음";
  const runners = (detail.ground?.runners || []).join(", ") || "주자 없음";

  elements.spotlight.innerHTML = `
    <div class="spotlight__headline">
      <div>
        <p class="eyebrow">${game.stadium} / ${game.inningLabel}</p>
        <h2>${game.away.name} vs ${game.home.name}</h2>
      </div>
      <span class="game-card__status">${game.statusLabel}</span>
    </div>

    <div class="spotlight__scoreboard">
      <div class="score-pill">
        <span>${game.away.short}</span>
        <strong>${game.away.score}</strong>
      </div>
      <div class="score-pill">
        <span>COUNT</span>
        <strong>${game.balls}-${game.strikes}-${game.outs}</strong>
      </div>
      <div class="score-pill">
        <span>${game.home.short}</span>
        <strong>${game.home.score}</strong>
      </div>
    </div>

    <div class="spotlight__box">
      <p class="panel__eyebrow">Inning Lines</p>
      <div class="inning-lines">${inningRows || '<div class="inning-line"><span>정보</span><strong>이닝 점수 없음</strong></div>'}</div>
    </div>

    <div class="spotlight__box">
      <p class="panel__eyebrow">Field Snapshot</p>
      <div class="inning-lines">
        <div class="inning-line"><span>타석</span><strong>${detail.ground?.hitter || "정보 없음"}</strong></div>
        <div class="inning-line"><span>주자</span><strong>${runners}</strong></div>
        <div class="inning-line"><span>다음 타자</span><strong>${nextHitters}</strong></div>
      </div>
    </div>

    <div class="spotlight__box">
      <p class="panel__eyebrow">Play By Play</p>
      <div class="log-list">${logs || '<div class="log-item"><strong>문자중계 데이터가 아직 없습니다.</strong><span>대기</span></div>'}</div>
    </div>
  `;
}

function renderTeams() {
  const visibleTeams = getVisibleTeams();
  elements.teamsBoard.innerHTML = visibleTeams.map(({ team, game }) => `
    <article class="team-tile">
      <div class="team-tile__row">
        <div class="team-tile__name">
          <span class="team-badge__logo" style="background:${team.color}">${team.short}</span>
          <span>${team.name}</span>
        </div>
        <strong>${team.score}점</strong>
      </div>
      <div class="team-tile__row">
        <span class="team-tile__meta">현재 ${game.stadium}</span>
        <span class="form">${game.statusLabel}</span>
      </div>
      <div class="team-tile__row">
        <span class="team-tile__meta">${game.inningLabel}</span>
        <span class="team-tile__meta">선발 ${team.starter || "-"}</span>
      </div>
    </article>
  `).join("");
}

function bindEvents() {
  elements.favoriteTeamSelect.addEventListener("change", async (event) => {
    state.favoriteTeamId = event.target.value;
    if (!state.favoriteTeamId) {
      state.favoriteOnly = false;
    }
    persistFavoriteState();
    ensureSelectedGame();

    try {
      await Promise.all([loadSelectedGame(), loadFavoriteHome()]);
    } catch {
      state.error = "마이 팀 데이터를 불러오지 못했습니다.";
    }

    render();
  });

  elements.favoriteTeamToggle.addEventListener("click", async () => {
    if (!state.favoriteTeamId) {
      return;
    }

    state.favoriteOnly = !state.favoriteOnly;
    persistFavoriteState();
    ensureSelectedGame();

    try {
      await loadSelectedGame();
    } catch {
      state.error = "선택 경기 상세를 불러오지 못했습니다.";
    }

    render();
  });
}

function startPolling() {
  bindEvents();
  refreshAll();
  window.setInterval(refreshAll, 15000);
}

startPolling();
