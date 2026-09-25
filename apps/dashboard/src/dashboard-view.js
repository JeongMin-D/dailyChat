function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatTime(value) {
  if (!value) return "시간 미상";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "시간 미상";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function empty(text) {
  return `<div class="empty">${escapeHtml(text)}</div>`;
}

function moodChart(items) {
  if (items.length === 0) return empty("아직 기분 기록이 없습니다.");
  return `<div class="mood-chart" aria-label="최근 기분 점수">${items.slice().reverse().map((item) => `
    <div class="mood-bar" title="${escapeHtml(item.day)} · ${escapeHtml(item.label)} · ${item.score}/5">
      <span style="height:${Math.max(16, Number(item.score) * 18)}%"></span>
      <small>${escapeHtml(item.day.slice(5))}</small>
    </div>`).join("")}</div>`;
}

function timeline(data) {
  const items = [
    ...data.messages.map((item) => ({
      at: item.sent_at,
      badge: item.role === "user" ? "나" : "AI",
      text: item.content,
      tone: item.role === "user" ? "user" : "assistant"
    })),
    ...data.events.map((item) => ({ at: item.occurred_at, badge: item.type, text: item.summary, tone: "event" })),
    ...data.health.map((item) => ({ at: item.occurred_at, badge: "건강", text: `${item.symptom}${item.note ? ` · ${item.note}` : ""}`, tone: "health" }))
  ].sort((a, b) => String(a.at || "").localeCompare(String(b.at || "")));
  if (items.length === 0) return empty("이 날짜에는 타임라인 기록이 없습니다.");
  return `<ol class="timeline">${items.map((item) => `
    <li class="${item.tone}"><time>${formatTime(item.at)}</time><span class="badge">${escapeHtml(item.badge)}</span><p>${escapeHtml(item.text)}</p></li>`).join("")}</ol>`;
}

export function renderDashboard(data) {
  const latestDiaryByDay = new Map();
  for (const item of data.diaryIndex) if (!latestDiaryByDay.has(item.day)) latestDiaryByDay.set(item.day, item);
  const dayLinks = data.availableDays.slice(0, 31).map((day) => {
    const item = latestDiaryByDay.get(day);
    return `<a class="day ${day === data.selectedDay ? "active" : ""}" href="/dashboard?day=${encodeURIComponent(day)}">
      <strong>${escapeHtml(day.slice(5))}</strong><span>${escapeHtml(item?.title || "대화 기록")}</span>
    </a>`;
  }).join("");
  const diaryBody = data.diary
    ? `<header class="diary-header"><div><span class="eyebrow">DIARY · v${data.diary.version}</span><h2>${escapeHtml(data.diary.title)}</h2></div><div class="tags">${data.diary.tags.map((tag) => `<span>#${escapeHtml(tag)}</span>`).join("")}</div></header>
       ${data.diary.summary_mood ? `<p class="mood-summary">${escapeHtml(data.diary.summary_mood)}</p>` : ""}
       <div class="diary-copy">${data.blocks.map((block) => `<p>${escapeHtml(block.text)}</p>`).join("")}</div>`
    : empty("이 날짜에는 아직 생성된 일기가 없습니다.");
  const search = data.query
    ? `<div class="search-results"><h3>“${escapeHtml(data.query)}” 검색 결과 <span>${data.searchResults.length}</span></h3>${data.searchResults.length
      ? data.searchResults.map((item) => `<article><span>${escapeHtml(item.kind)}</span><time>${formatTime(item.at)}</time><p>${escapeHtml(item.text)}</p></article>`).join("")
      : empty("일치하는 기록을 찾지 못했습니다.")}</div>`
    : "";
  const health = data.health.length
    ? `<ul class="health-list">${data.health.map((item) => `<li><span class="severity severity-${item.severity || 0}">${item.severity ? `강도 ${item.severity}` : "강도 미기록"}</span><strong>${escapeHtml(item.symptom)}</strong>${item.note ? `<p>${escapeHtml(item.note)}</p>` : ""}</li>`).join("")}</ul>`
    : empty("이 날짜에는 건강 기록이 없습니다.");

  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MindCompanion · ${escapeHtml(data.selectedDay)}</title><link rel="stylesheet" href="/dashboard/styles.css"></head>
<body><div class="shell">
  <aside><a class="brand" href="/dashboard"><span>MC</span><div><strong>MindCompanion</strong><small>나의 하루 아카이브</small></div></a>
    <nav><a href="#today">오늘</a><a href="#diary">일기</a><a href="#timeline">타임라인</a><a href="#wellbeing">기분·건강</a></nav>
    <div class="calendar"><div class="section-label">최근 기록</div>${dayLinks || empty("아직 기록이 없습니다.")}</div>
    <footer><span class="status-dot"></span> Telegram · Supabase 연결</footer>
  </aside>
  <main>
    <header class="topbar"><div><span class="eyebrow">PERSONAL DAILY LOG</span><h1>${escapeHtml(data.selectedDay)}</h1></div>
      <form action="/dashboard" method="get"><input type="hidden" name="day" value="${escapeHtml(data.selectedDay)}"><label><span>기록 검색</span><input name="q" value="${escapeHtml(data.query)}" maxlength="100" placeholder="키워드를 입력하세요"></label><button>검색</button></form>
    </header>
    ${search}
    <section id="today" class="stats">
      <article><span>대화</span><strong>${data.messages.filter(({ role }) => role === "user").length}</strong><small>내가 남긴 메시지</small></article>
      <article><span>이벤트</span><strong>${data.events.length}</strong><small>근거가 연결된 사건</small></article>
      <article><span>기분</span><strong>${data.moods.at(-1)?.score || "–"}</strong><small>${escapeHtml(data.moods.at(-1)?.label || "기록 없음")}</small></article>
      <article><span>일기</span><strong>${data.diary ? `v${data.diary.version}` : "–"}</strong><small>${data.diary ? "생성 완료" : "대기 중"}</small></article>
    </section>
    <section id="diary" class="card diary">${diaryBody}</section>
    <div class="grid">
      <section id="timeline" class="card"><div class="card-title"><div><span class="eyebrow">TIMELINE</span><h2>하루의 흐름</h2></div><span>${data.messages.length + data.events.length + data.health.length}개</span></div>${timeline(data)}</section>
      <section id="wellbeing" class="stack">
        <article class="card"><div class="card-title"><div><span class="eyebrow">MOOD</span><h2>최근 기분</h2></div></div>${moodChart(data.recentMoods)}</article>
        <article class="card"><div class="card-title"><div><span class="eyebrow">HEALTH</span><h2>건강 메모</h2></div></div>${health}</article>
      </section>
    </div>
  </main>
</div></body></html>`;
}

export const dashboardStyles = `
:root{color-scheme:dark;--bg:#0b0e0d;--panel:#131816;--panel2:#181e1b;--line:#2a322e;--text:#f1f5f2;--muted:#9aa69f;--mint:#a8f0c6;--mint2:#4ecb86;--amber:#e9b76a}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:radial-gradient(circle at 80% 0,#163326 0,transparent 30%),var(--bg);color:var(--text);font:15px/1.6 Inter,Pretendard,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.shell{min-height:100vh;display:grid;grid-template-columns:270px 1fr}aside{position:sticky;top:0;height:100vh;padding:28px 22px;border-right:1px solid var(--line);background:rgba(11,14,13,.88);backdrop-filter:blur(18px);display:flex;flex-direction:column}.brand{display:flex;align-items:center;gap:12px;color:inherit;text-decoration:none}.brand>span{width:44px;height:44px;display:grid;place-items:center;border-radius:14px;background:var(--mint);color:#0a2517;font-weight:900}.brand strong{display:block;font-size:16px}.brand small{color:var(--muted)}nav{display:grid;gap:5px;margin:42px 0 30px}nav a{color:var(--muted);text-decoration:none;padding:10px 12px;border-radius:9px}nav a:hover{background:var(--panel2);color:var(--text)}.section-label,.eyebrow{font-size:11px;letter-spacing:.16em;color:var(--mint2);font-weight:800}.calendar{min-height:0;overflow:auto}.day{display:grid;padding:10px 12px;margin:6px 0;border:1px solid transparent;border-radius:10px;text-decoration:none;color:var(--muted)}.day strong{color:var(--text)}.day span{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.day:hover,.day.active{border-color:#385344;background:#17221c}.day.active strong{color:var(--mint)}aside footer{margin-top:auto;color:var(--muted);font-size:12px}.status-dot{display:inline-block;width:8px;height:8px;margin-right:7px;border-radius:50%;background:var(--mint2);box-shadow:0 0 12px var(--mint2)}main{width:min(1200px,100%);padding:44px 5vw 80px}.topbar{display:flex;justify-content:space-between;align-items:end;gap:30px;margin-bottom:28px}h1,h2,h3,p{margin-top:0}h1{font-size:clamp(32px,5vw,56px);line-height:1;margin:8px 0 0;letter-spacing:-.04em}h2{font-size:22px;margin:5px 0;letter-spacing:-.02em}.topbar form{display:flex;align-items:end;gap:8px}.topbar label span{display:block;color:var(--muted);font-size:12px}.topbar input{width:min(300px,42vw);padding:12px 14px;background:var(--panel);border:1px solid var(--line);border-radius:10px;color:var(--text)}button{padding:12px 16px;border:0;border-radius:10px;background:var(--mint);color:#102519;font-weight:800;cursor:pointer}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px}.stats article,.card,.search-results{background:linear-gradient(145deg,rgba(27,34,31,.96),rgba(17,22,20,.96));border:1px solid var(--line);border-radius:18px}.stats article{padding:20px}.stats span,.stats small{display:block;color:var(--muted)}.stats strong{display:block;font-size:30px;color:var(--mint);margin:4px 0}.card{padding:26px;margin-bottom:16px}.diary{min-height:300px;background:radial-gradient(circle at 100% 0,rgba(78,203,134,.13),transparent 34%),linear-gradient(145deg,#1b211e,#111513)}.diary-header,.card-title{display:flex;justify-content:space-between;gap:20px}.tags{display:flex;gap:6px;flex-wrap:wrap;justify-content:end}.tags span,.card-title>span{font-size:12px;color:var(--mint);border:1px solid #345442;border-radius:999px;padding:5px 10px}.mood-summary{color:var(--amber);font-size:16px}.diary-copy{font-family:Georgia,"Noto Serif KR",serif;font-size:18px;line-height:1.9;max-width:760px}.grid{display:grid;grid-template-columns:1.35fr .8fr;gap:16px}.stack>.card{min-height:190px}.timeline{list-style:none;padding:0;margin:18px 0 0}.timeline li{display:grid;grid-template-columns:55px 48px 1fr;gap:12px;padding:14px 0;border-top:1px solid var(--line)}.timeline time{font-size:12px;color:var(--muted)}.timeline p{margin:0;white-space:pre-wrap}.badge{font-size:11px;text-align:center;height:24px;border-radius:999px;background:#273029;color:var(--mint);padding:2px 6px}.timeline .assistant .badge{color:#b8c6ff}.timeline .event .badge{color:var(--amber)}.timeline .health .badge{color:#ffb7b7}.mood-chart{height:145px;display:flex;align-items:end;gap:8px;padding-top:15px}.mood-bar{height:100%;flex:1;display:flex;flex-direction:column;justify-content:end;align-items:center;gap:6px}.mood-bar span{display:block;width:100%;max-width:24px;border-radius:8px 8px 3px 3px;background:linear-gradient(var(--mint),var(--mint2))}.mood-bar small{color:var(--muted);font-size:9px;writing-mode:vertical-rl}.health-list{list-style:none;padding:0}.health-list li{padding:12px 0;border-top:1px solid var(--line)}.health-list strong{display:block}.health-list p{color:var(--muted);margin:4px 0}.severity{font-size:10px;color:var(--muted)}.empty{padding:28px;border:1px dashed #39413d;border-radius:12px;color:var(--muted);text-align:center}.search-results{padding:22px;margin-bottom:16px}.search-results h3 span{color:var(--mint)}.search-results article{padding:12px 0;border-top:1px solid var(--line)}.search-results article>span{color:var(--mint);margin-right:10px}.search-results time{color:var(--muted);font-size:12px}.search-results p{margin:5px 0;white-space:pre-wrap}@media(max-width:900px){.shell{grid-template-columns:1fr}aside{position:relative;height:auto;border-right:0;border-bottom:1px solid var(--line)}nav{display:flex;margin:22px 0;overflow:auto}.calendar{display:flex;gap:6px}.day{min-width:120px}.brand{justify-content:center}aside footer{display:none}main{padding:28px 18px 60px}.topbar{align-items:stretch;flex-direction:column}.topbar form{width:100%}.topbar label{flex:1}.topbar input{width:100%}.stats{grid-template-columns:repeat(2,1fr)}.grid{grid-template-columns:1fr}}@media(max-width:520px){.stats{grid-template-columns:1fr 1fr}.stats article{padding:15px}.card{padding:19px}.diary-header{display:block}.tags{justify-content:start}.timeline li{grid-template-columns:46px 42px 1fr}}
`;

export function renderDashboardError() {
  return "<!doctype html><html lang=\"ko\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>MindCompanion</title><link rel=\"stylesheet\" href=\"/dashboard/styles.css\"></head><body><main><section class=\"card\"><span class=\"eyebrow\">TEMPORARY ERROR</span><h1>기록을 불러오지 못했습니다.</h1><p>잠시 후 다시 시도해 주세요.</p></section></main></body></html>";
}
