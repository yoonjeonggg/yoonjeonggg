#!/usr/bin/env node
// 3D contribution graph + snake that eats the blocks.
// Usage (GitHub Actions): GITHUB_TOKEN=... USERNAME=... node scripts/snake-3d.mjs
// Preview with random data: node scripts/snake-3d.mjs --sample
import fs from "node:fs";
import path from "node:path";

const SAMPLE = process.argv.includes("--sample");
const OUT = process.env.OUTPUT_PATH || "profile-3d-snake/snake-3d.svg";
const USER = process.env.USERNAME || process.env.GITHUB_REPOSITORY_OWNER;
const TOKEN = process.env.GITHUB_TOKEN;

// ---------------------------------------------------------------- data
async function fetchData() {
  const query = `query($login:String!){ user(login:$login){
    contributionsCollection{
      totalCommitContributions totalIssueContributions totalPullRequestContributions
      totalPullRequestReviewContributions totalRepositoryContributions restrictedContributionsCount
      contributionCalendar{ totalContributions weeks{ contributionDays{ contributionCount date weekday } } }
      commitContributionsByRepository(maxRepositories:100){
        repository{ primaryLanguage{ name color } }
        contributions(first:100){ totalCount nodes{ occurredAt commitCount } }
      }
    }
    repositories(first:100, ownerAffiliations:OWNER, isFork:false){ nodes{ stargazerCount forkCount } }
  }}`;
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { login: USER } }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  const u = json.data.user, cc = u.contributionsCollection;
  const langMap = {}, byDay = {};
  for (const r of cc.commitContributionsByRepository) {
    const l = r.repository.primaryLanguage;
    if (!l) continue;
    langMap[l.name] ??= { name: l.name, color: l.color || "#888", value: 0 };
    langMap[l.name].value += r.contributions.totalCount;
    for (const n of r.contributions.nodes) {
      const day = n.occurredAt.slice(0, 10);
      (byDay[day] ??= {})[l.name] = (byDay[day][l.name] || 0) + n.commitCount;
    }
  }
  // the language you committed in most on each day colors that day's block
  const dayLang = d => {
    const m = byDay[d];
    if (!m) return null;
    const name = Object.keys(m).sort((x, y) => m[y] - m[x])[0];
    return name;
  };
  return {
    weeks: cc.contributionCalendar.weeks.map(w => w.contributionDays.map(d => ({ count: d.contributionCount, date: d.date, weekday: d.weekday, lang: dayLang(d.date) }))),
    total: cc.contributionCalendar.totalContributions,
    radar: {
      Commit: cc.totalCommitContributions + cc.restrictedContributionsCount,
      Issue: cc.totalIssueContributions,
      PullReq: cc.totalPullRequestContributions,
      Review: cc.totalPullRequestReviewContributions,
      Repo: cc.totalRepositoryContributions,
    },
    langs: Object.values(langMap).sort((x, y) => y.value - x.value),
    stars: u.repositories.nodes.reduce((s, r) => s + r.stargazerCount, 0),
    forks: u.repositories.nodes.reduce((s, r) => s + r.forkCount, 0),
  };
}

function sampleData() {
  let seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const start = new Date("2025-10-05");
  const weeks = [];
  let total = 0;
  for (let i = 0; i < 53; i++) {
    const days = [];
    for (let j = 0; j < 7; j++) {
      if (i === 52 && j > 4) break;
      const busy = i > 14 && i < 22 ? 0.35 : 0;
      const r = rnd();
      const c = r < 0.32 - busy ? 0 : Math.floor(Math.pow(rnd(), 1.8) * 14) + 1;
      total += c;
      const d = new Date(start.getTime() + (i * 7 + j) * 864e5);
      const lr = rnd(), lang = c === 0 ? null : lr < .6 ? "Java" : lr < .75 ? "TypeScript" : lr < .85 ? "Python" : lr < .9 ? "JavaScript" : null;
      days.push({ count: c, date: d.toISOString().slice(0, 10), weekday: j, lang });
    }
    weeks.push(days);
  }
  return {
    weeks, total,
    radar: { Commit: 684, Issue: 62, PullReq: 97, Review: 41, Repo: 9 },
    langs: [
      { name: "Java", color: "#b07219", value: 68 },
      { name: "TypeScript", color: "#3178c6", value: 14 },
      { name: "JavaScript", color: "#f1e05a", value: 8 },
      { name: "Python", color: "#3572A5", value: 10 },
    ],
    stars: 12, forks: 3,
  };
}

// ---------------------------------------------------------------- helpers
const OTHER = "#4a5168";   // days with PRs / issues / private work (no language info)
const mixc = (c1, c2, u) => "#" + [0, 1, 2].map(n => {
  const x = parseInt(c1.slice(1 + 2 * n, 3 + 2 * n), 16), y = parseInt(c2.slice(1 + 2 * n, 3 + 2 * n), 16);
  return Math.round(x + (y - x) * u).toString(16).padStart(2, "0");
}).join("");
const f = n => (Math.round(n * 10) / 10).toString();
const P = pts => pts.map(([x, y]) => `${f(x)},${f(y)}`).join(" ");
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
function hsl(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12, A = s * Math.min(l, 1 - l);
  const c = n => Math.round(255 * (l - A * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  return "#" + [c(0), c(8), c(4)].map(v => v.toString(16).padStart(2, "0")).join("");
}
const HUES = [350, 320, 290, 265, 235, 205, 180, 155, 120, 85, 55, 30, 355];
function hueAt(t) {
  const x = t * (HUES.length - 1), k = Math.floor(x), fr = x - k;
  const h1 = HUES[k], h2 = HUES[Math.min(k + 1, HUES.length - 1)];
  let d = h2 - h1; if (d > 180) d -= 360; if (d < -180) d += 360;
  return (h1 + d * fr + 360) % 360;
}

// ---------------------------------------------------------------- render
function render(data) {
  const Wd = 1280, Ht = 850;
  const s = 20, a = s * Math.sqrt(3) / 2, b = s / 2;
  const ox = 150, oy = 140;
  const W = data.weeks.length;

  const nonzero = data.weeks.flat().map(d => d.count).filter(c => c > 0).sort((x, y) => x - y);
  const ref = nonzero.length ? nonzero[Math.floor(nonzero.length * 0.95)] || nonzero.at(-1) : 1;
  const height = c => (c === 0 ? 0 : 5 + 80 * Math.pow(Math.min(1, c / ref), 0.7));

  const tileTop = (i, j) => [ox + (i - j) * a, oy + (i + j) * b];
  const center = (i, j) => { const [x, y] = tileTop(i, j); return [x, y + b]; };
  const faces = (x, y, h) => [
    [[x, y - h], [x + a, y + b - h], [x, y + 2 * b - h], [x - a, y + b - h]],
    [[x - a, y + b - h], [x, y + 2 * b - h], [x, y + 2 * b], [x - a, y + b]],
    [[x, y + 2 * b - h], [x + a, y + b - h], [x + a, y + b], [x, y + 2 * b]],
  ];

  // curated palette instead of GitHub's language colors: most-used language gets the first color
  const PALETTE = (process.env.BLOCK_COLORS || "#ff7eb3,#ffb38a,#ffe28a,#b8a4ff,#8ee8d0").split(",");
  const LANG_COLOR = {};
  data.langs.forEach((l, k) => (LANG_COLOR[l.name] = PALETTE[k % PALETTE.length]));
  data.langs.forEach(l => (l.color = LANG_COLOR[l.name]));
  const cells = [];
  data.weeks.forEach((w, i) => w.forEach(d => cells.push({ i, j: d.weekday, c: d.count, h: height(d.count), lang: d.lang })));

  // --- snake route: eat blocks from the front (newest) to the back, diagonal by diagonal,
  //     so every block in front of the snake is already flat (correct occlusion).
  const eat = cells.filter(c => c.c > 0);
  const byDepth = {};
  eat.forEach(c => (byDepth[c.i + c.j] ??= []).push(c));
  const depths = Object.keys(byDepth).map(Number).sort((x, y) => y - x);
  const route = [];
  depths.forEach((d, k) => {
    const g = byDepth[d].sort((x, y) => x.i - y.i);
    if (k % 2 === 0) g.reverse();
    route.push(...g);
  });
  // walk along the grid axes (like the blocks), stepping toward the front first
  const walk = (from, to) => {
    const out = []; let [i, j] = from;
    while (i < to[0]) out.push([++i, j]);
    while (j < to[1]) out.push([i, ++j]);
    while (i > to[0]) out.push([--i, j]);
    while (j > to[1]) out.push([i, --j]);
    return out;
  };
  const cellsPath = [[W + 1, 3]];
  const routeIdx = [];
  for (const c of route) { cellsPath.push(...walk(cellsPath.at(-1), [c.i, c.j])); routeIdx.push(cellsPath.length - 1); }
  cellsPath.push(...walk(cellsPath.at(-1), [-2, 0]));

  // --- terrain-following trail: the snake climbs onto every raised block it crosses.
  const key = (i, j) => i + "," + j;
  const cellAt = new Map(cells.map(c => [key(c.i, c.j), c]));
  const visitAt = new Map(route.map((c, k) => [key(c.i, c.j), routeIdx[k]]));
  const passH = m => {
    const [i, j] = cellsPath[m], c = cellAt.get(key(i, j));
    if (!c || c.c === 0) return 0;
    const v = visitAt.get(key(i, j));
    return v !== undefined && v < m - 12 ? 0 : c.h;
  };
  const SUB = 10;
  const ri = [], rj = [];
  for (let m = 0; m < cellsPath.length - 1; m++) {
    const [i0, j0] = cellsPath[m], [i1, j1] = cellsPath[m + 1];
    for (let q = 0; q < SUB; q++) { const u = q / SUB; ri.push(i0 + (i1 - i0) * u); rj.push(j0 + (j1 - j0) * u); }
  }
  ri.push(cellsPath.at(-1)[0]); rj.push(cellsPath.at(-1)[1]);
  const avg = (arr, w) => arr.map((_, q) => {
    let s = 0;
    for (let d = -w; d <= w; d++) s += arr[Math.max(0, Math.min(arr.length - 1, q + d))];
    return s / (2 * w + 1);
  });
  const si = avg(avg(avg(ri, 3), 3), 3), sj = avg(avg(avg(rj, 3), 3), 3);    // wide, soft curves instead of grid steps
  const pts = si.map((i, q) => [ox + (i - sj[q]) * a, oy + (i + sj[q]) * b + b]);
  const cum = [0];
  for (let q = 1; q < pts.length; q++) cum.push(cum[q - 1] + Math.hypot(pts[q][0] - pts[q - 1][0], pts[q][1] - pts[q - 1][1]));
  const total = cum.at(-1);
  const pathD = "M" + pts.map(p => `${f(p[0])} ${f(p[1])}`).join("L");
  const posAt = d => {
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const mm = (lo + hi) >> 1; if (cum[mm] < d) lo = mm; else hi = mm; }
    const u = cum[hi] > cum[lo] ? (d - cum[lo]) / (cum[hi] - cum[lo]) : 0;
    return [si[lo] + (si[hi] - si[lo]) * u, sj[lo] + (sj[hi] - sj[lo]) * u];
  };

  // --- timing
  const SPEED = Number(process.env.SNAKE_SPEED || 60);   // px per second (lower = slower)
  const TRAVEL = Math.max(12, total / SPEED);
  const speed = total / TRAVEL;
  const BODY = 10;                                  // body length in blocks
  const N = BODY * 10, spacing = Math.hypot(a, b) / 10, dt = spacing / speed;
  const PAUSE = 1.6, REGROW = 0.7;
  const T = TRAVEL + N * dt + PAUSE + REGROW;
  if (process.env.DEBUG) console.log(`travel ${TRAVEL.toFixed(1)}s, speed ${speed.toFixed(0)}px/s, loop ${T.toFixed(1)}s`);
  const regrowAt = (T - REGROW) / T;
  const cellLen = Math.hypot(a, b);
  // every raised block is pressed flat right as the head reaches it,
  // so the whole body always slides along one continuous level
  const firstVisit = new Map();
  cellsPath.forEach(([i, j], m) => { if (!firstVisit.has(key(i, j))) firstVisit.set(key(i, j), m); });
  cells.forEach(c => {
    if (c.c === 0) return;
    const m = firstVisit.get(key(c.i, c.j));
    const arrive = cum[Math.min(cum.length - 1, m * SUB)] / speed;
    c.s0 = Math.max(0, arrive - 2.2 * cellLen / speed);
    c.s1 = Math.max(c.s0 + 0.05, arrive - 0.35 * cellLen / speed);
  });
  const smooth01 = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
  const heightAt = (c, tau) => {
    if (!c || c.c === 0) return 0;
    if (c.s0 === undefined || tau < c.s0) return c.h;
    if (tau >= T - REGROW) return c.h * smooth01((tau - (T - REGROW)) / REGROW);
    return c.h * (1 - smooth01((tau - c.s0) / (c.s1 - c.s0)));
  };
  const liftAt = (i, j, tau) => {
    let best = 0;
    for (const ci of [Math.floor(i), Math.ceil(i)]) for (const cj of [Math.floor(j), Math.ceil(j)]) {
      const dmax = Math.max(Math.abs(i - ci), Math.abs(j - cj));
      const w = 1 - smooth01((dmax - 0.32) / 0.36);
      if (w > 0) best = Math.max(best, w * heightAt(cellAt.get(key(ci, cj)), tau));
    }
    return best;
  };

  // --- blocks (sink in sync with the snake's weight)
  const order = [...cells].sort((p, q) => (p.i + p.j) - (q.i + q.j) || p.i - q.i);
  const blocks = order.map(c => {
    const [x, y] = tileTop(c.i, c.j);
    const flat = faces(x, y, 0);
    const tile = `<polygon points="${P(flat[0])}" fill="#1a1c2b"/>`;
    if (c.c === 0) return tile;
    const base = (c.lang && LANG_COLOR[c.lang]) || OTHER;
    const cols = [base, mixc(base, "#000000", 0.25), mixc(base, "#000000", 0.45)];
    const full = faces(x, y, c.h);
    const kt = `0;${f4(c.s0 / T)};${f4(c.s1 / T)};${f4(regrowAt)};1`;
    const spl = `calcMode="spline" keySplines="0 0 1 1;.5 0 .5 1;0 0 1 1;.5 0 .5 1"`;
    const poly = k =>
      `<polygon points="${P(full[k])}" fill="${cols[k]}"><animate attributeName="points" dur="${f(T)}s" repeatCount="indefinite" ${spl} keyTimes="${kt}" values="${P(full[k])};${P(full[k])};${P(flat[k])};${P(flat[k])};${P(full[k])}"/></polygon>`;
    return tile + poly(1) + poly(2) + poly(0);
  }).join("\n");

  // --- snake: a chain of cubes shaded like the blocks, all riding one trail;
  //     each cube rises onto whatever block is under it and settles as the block is pressed down
  // gradient-shaded cube with the same footprint as a block
  const SNAKE = (process.env.SNAKE_COLORS || "#00f5d4,#00bbf9,#9b5de5").split(",");   // head → tail gradient (Aurora)
  const mixHex = (c1, c2, u) => "#" + [0, 1, 2].map(n => {
    const x = parseInt(c1.slice(1 + 2 * n, 3 + 2 * n), 16), y = parseInt(c2.slice(1 + 2 * n, 3 + 2 * n), 16);
    return Math.round(x + (y - x) * u).toString(16).padStart(2, "0");
  }).join("");
  // default: smooth rainbow along the body (hue sweep), or a custom stop list via SNAKE_COLORS
  const snakeColor = u => { const x = u * (SNAKE.length - 1), n = Math.min(SNAKE.length - 2, Math.floor(x)); return mixHex(SNAKE[n], SNAKE[n + 1], x - n); };
  let gdefs = "";
  const grad = (id, c1, c2, x1, y1, x2, y2) =>
    (gdefs += `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>`);
  const cube = (k, sz, H, c) => {
    const a2 = sz * Math.sqrt(3) / 2, b2 = sz / 2;
    const lite = m => mixHex(c, "#ffffff", m), dark = m => mixHex(c, "#000000", m);
    // every face is shaded with its own gradient (glossy top, sides fading darker toward the floor)
    grad(`st${k}`, lite(0.15), lite(0.15), 0, 0, 1, 1);
    grad(`sl${k}`, lite(0.05), dark(0.45), 0, 0, 0, 1);
    grad(`sr${k}`, dark(0.2), dark(0.62), 0, 0, 0, 1);
    return `<polygon points="${P([[-a2, -H], [0, b2 - H], [0, b2], [-a2, 0]])}" fill="url(#sl${k})"/>` +
      `<polygon points="${P([[0, b2 - H], [a2, -H], [a2, 0], [0, b2]])}" fill="url(#sr${k})"/>` +
      `<polygon points="${P([[0, -b2 - H], [a2, -H], [0, b2 - H], [-a2, -H]])}" fill="url(#st${k})"/>`;
  };


  let defs = `<path id="route" d="${pathD}"/>`;
  const shadows = [];
  const mp = `<mpath href="#route" xlink:href="#route"/>`;
  const LFPS = 15, lsteps = Math.ceil(T * LFPS);
  const segDepth = [];
  for (let k = 0; k < N; k++) {
    const t = k / (N - 1);
    const col = snakeColor(k / (N - 1));
    const sz = s * 0.96, H = 15;
    const startT = k * dt, end = startT + TRAVEL;
    const motion = k === 0
      ? `keyTimes="0;${f4(end / T)};1" keyPoints="0;1;1"`
      : `keyTimes="0;${f4(startT / T)};${f4(end / T)};1" keyPoints="0;0;1;1"`;
    const fade = `keyTimes="0;${f4(end / T)};${f4(Math.min(end / T + 0.02, 0.999))};1" values="1;1;0;0"`;
    const dv = [];
    for (let s = 0; s <= lsteps; s++) {
      const tau = Math.min(T, s / LFPS);
      const [i, j] = posAt(Math.max(0, Math.min(total, (tau - startT) * speed)));
      dv.push(i + j + 0.001 * i);
    }
    segDepth.push(dv);
    defs +=
      `<g id="seg${k}"><animate attributeName="opacity" dur="${f(T)}s" repeatCount="indefinite" ${fade}/>` +
      `<g><animateMotion dur="${f(T)}s" repeatCount="indefinite" calcMode="linear" ${motion}>${mp}</animateMotion>` +
      cube(k, sz, H, col) + `</g></g>`;
  }
  // draw order: the snake eats from the front rows toward the back, so the head is (almost)
  // always farther away than the tail → paint head first and tail last
  const slots = [];
  for (let k = 0; k < N; k++) slots.push(`<use href="#seg${k}" xlink:href="#seg${k}"/>`);

  // --- radar
  const rx = 1040, ry = 225, rr = 110;
  const keys = ["Commit", "Issue", "PullReq", "Review", "Repo"];
  const ang = n => -Math.PI / 2 + n * 2 * Math.PI / 5;
  const at = (n, r) => [rx + Math.cos(ang(n)) * r, ry + Math.sin(ang(n)) * r];
  let radar = "";
  for (let l = 1; l <= 4; l++) radar += `<polygon points="${P(keys.map((_, n) => at(n, rr * l / 4)))}" fill="none" stroke="#5a5f73" stroke-dasharray="3 3"/>`;
  keys.forEach((_, n) => (radar += `<line x1="${rx}" y1="${ry}" x2="${f(at(n, rr)[0])}" y2="${f(at(n, rr)[1])}" stroke="#5a5f73" stroke-dasharray="3 3"/>`));
  ["1", "10", "100", "1K"].forEach((t, l) => (radar += `<text x="${rx + 4}" y="${f(ry - rr * (l + 1) / 4 + 4)}" fill="#7f86a0" font-size="10">${t}</text>`));
  const val = n => rr * Math.min(1, Math.log10((data.radar[keys[n]] || 0) + 1) / 4);
  radar += `<polygon points="${P(keys.map((_, n) => at(n, val(n))))}" fill="#ffd166" fill-opacity=".5" stroke="#ffd166" stroke-width="2.5"/>`;
  keys.forEach((k, n) => {
    const [x, y] = at(n, rr + 26);
    radar += `<text x="${f(x)}" y="${f(y + 5)}" text-anchor="middle" fill="#ffffff" font-size="16">${k}</text>`;
  });

  // --- donut
  const lsum = data.langs.reduce((s, l) => s + l.value, 0) || 1;
  let langs = data.langs.filter(l => l.value / lsum >= 0.01).slice(0, 5);
  const rest = lsum - langs.reduce((s, l) => s + l.value, 0);
  if (rest > 0) langs.push({ name: "other", color: "#444a5a", value: rest });
  const sum = langs.reduce((s, l) => s + l.value, 0) || 1;
  const dx = 150, dy = 640, R1 = 92, R0 = 54;
  let st = -Math.PI / 2, donut = "";
  langs.forEach(l => {
    const sw = (l.value / sum) * Math.PI * 2, en = st + sw - 0.0001, large = sw > Math.PI ? 1 : 0;
    const p = (r, t) => `${f(dx + Math.cos(t) * r)} ${f(dy + Math.sin(t) * r)}`;
    donut += `<path d="M${p(R1, st)} A${R1} ${R1} 0 ${large} 1 ${p(R1, en)} L${p(R0, en)} A${R0} ${R0} 0 ${large} 0 ${p(R0, st)}Z" fill="${l.color}"/>`;
    st += sw;
  });
  langs.forEach((l, k) => {
    donut += `<rect x="272" y="${578 + k * 28}" width="15" height="15" rx="2" fill="${l.color}"/>` +
      `<text x="296" y="${591 + k * 28}" fill="#ffffff" font-size="16">${esc(l.name)} <tspan fill="#8b92a8">${Math.round(l.value / sum * 100)}%</tspan></text>`;
  });
  donut += `<rect x="272" y="${578 + langs.length * 28 + 6}" width="15" height="15" rx="2" fill="${OTHER}"/>` +
    `<text x="296" y="${591 + langs.length * 28 + 6}" fill="#8b92a8" font-size="14">PR · Issue · private</text>`;

  const days = data.weeks.flat();
  const range = `${days[0].date} / ${days.at(-1).date}`;
  const fork = `<g transform="translate(700 788)" fill="none" stroke="#fff" stroke-width="2"><circle cx="4" cy="3" r="2.5"/><circle cx="14" cy="3" r="2.5"/><circle cx="9" cy="19" r="2.5"/><path d="M4 6v3a3 3 0 0 0 3 3h4a3 3 0 0 0 3-3V6M9 12v4"/></g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${Wd} ${Ht}" width="${Wd}" height="${Ht}" font-family="'Segoe UI', -apple-system, 'Helvetica Neue', Arial, sans-serif">
<defs>${gdefs}${defs}</defs>
<rect width="${Wd}" height="${Ht}" fill="#05060f"/>
<g>${blocks}</g>
<g>${shadows.join("")}</g>
<g>${slots.join("")}</g>
<g>${radar}</g>
<g>${donut}</g>
<text x="272" y="806" fill="#ffd166" font-size="30" font-weight="700">${data.total.toLocaleString("en-US")}<tspan fill="#ffffff" font-size="19" font-weight="400" dx="10">contributions</tspan></text>
<text x="590" y="806" fill="#ffffff" font-size="20">★ ${data.stars}</text>
${fork}<text x="726" y="806" fill="#ffffff" font-size="20">${data.forks}</text>
</svg>`;
}
function f4(n) { return (Math.round(n * 10000) / 10000).toString(); }

// ---------------------------------------------------------------- main
const data = SAMPLE ? sampleData() : await fetchData();
const svg = render(data);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, svg);
console.log(`wrote ${OUT} (${(svg.length / 1024).toFixed(0)} KB)`);
