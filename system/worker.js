/**
 * Founder-interview intake page + voice-dump receiver (generic).
 *
 * GET  /i/{PAGE_TOKEN}        -> the interview page (questions + recorder)
 * POST /upload?t={PAGE_TOKEN} -> stores one take (audio blob or text/plain) in KV
 * GET  /health                -> {ok:true}
 *
 * Storage: Workers KV (R2 not enabled on this account). One KV key per take,
 * content-type kept in metadata. Per-take cap 20MB (KV limit is 25MB); the page
 * records Opus/AAC at voice bitrate, so an hour of audio stays well under it.
 * Retrieval: system/ingest.sh (wrangler kv + local whisper).
 *
 * Security model: unguessable 20-hex token gates both page and upload; noindex;
 * uploads are write-only (no public read path); token rotation = redeploy.
 */

// QUESTIONS are regenerated PER CLIENT by the skill (SKILL.md stage 2): Claude
// rewrites this constant from the client's website evidence, then redeploys.
// The set below is the fictional demo client (ClearView Exterior Care) so the
// system works out of the box.
const QUESTIONS = [
  { id: "your-story", short: "Your story", title: "Your story", min: 3, qs: [
    "Your site says over 20 years of experience. What got you started, and was there a moment you decided this was the business?",
    "What do other window cleaning outfits around Maplewood do that you refuse to do?",
    "Tell me about one customer or job you still remember. What happened?",
    "When a customer thanks you, what do they usually say you did differently?",
  ]},
  { id: "the-person", short: "The person", title: "The person behind the business", min: 3, qs: [
    "Be honest: window cleaning probably wasn't the childhood dream. What was the plan before this, and how did this become the thing you built your life around?",
    "What are your values? The two or three things you won't compromise on, in business or in life?",
    "Outside the work: family, hobbies, what does a good Saturday look like when you're not up a ladder?",
    "Ten years from now, what do you want people in Maplewood to say about you and ClearView?",
  ]},
  { id: "services", short: "Services", title: "The services", min: 2, qs: [
    "Your site lists 6 services (window cleaning inside and out, eavestrough cleaning, pressure washing, house washing, solar panel cleaning, seasonal property checks). Which ONE do you most want more of?",
    "\u201cSeasonal property checks\u201d is the broadest one on your site. What exactly does it include, and do you offer any packages or services that aren't on the site yet?",
  ]},
  { id: "claims", short: "Claims", title: "The claims (we only publish what you confirm)", min: 2, qs: [
    "Your site says \u201cfully insured.\u201d What are we allowed to publish beyond that? Coverage amount, anything else a homeowner or property manager would want to see?",
    "Your site says \u201cwe stand behind every job.\u201d What is the guarantee exactly, word for word, and what are its conditions?",
    "Your site shows \u201c4.9 stars from 40+ Google reviews.\u201d Is that current, and are you happy for us to always quote the live number as it grows?",
  ]},
  { id: "win-work", short: "Win work", title: "How you win work (this is where reports get their magic)", min: 2, qs: [
    "What's the most common question people ask when they first call, word for word? And what do you say back?",
    "Think of the moment right before someone says yes. What's the last thing they usually say or ask? That final little doubt?",
    "What do people get wrong about what a job costs? What does the price really depend on that homeowners never think of?",
  ]},
  { id: "twenty-years", short: "20 years", title: "Twenty years of knowing things others don't", min: 3, qs: [
    "Walk me through your year: when does the phone go crazy, when is it quiet, and what do you wish people booked earlier than they do?",
    "Your site mentions a water-fed pole system that reaches third-storey windows from the ground. What made you invest in that gear, and what can you do now that most outfits around Maplewood can't?",
    "After 20 years: what can you tell about a house in the first two minutes of pulling up that the homeowner has no idea about?",
  ]},
  { id: "working", short: "Working together", title: "Working together (so this stays fun)", min: 2, qs: [
    "Text, call, or email? When's the best time to reach you, and how often do you actually want to hear from us? Weekly note, monthly summary, only when something needs you?",
    "When we write something in your name, do you want to read every word before it goes live, or approve the first few and then trust us with spot-checks?",
    "What has a supplier or vendor done in the past that drove you nuts? Tell us so we can do the opposite.",
  ]},
  { id: "customers-area", short: "Customers & area", title: "The customers & the area", min: 4, qs: [
    "Who usually calls you, and is the person who calls the same person who pays? What are they worried about before they call?",
    "When you lose a job to someone else, who wins it and why?",
    "Which customers are the easiest? The jobs that go smooth, pay on time, no drama. What do those people have in common?",
    "And your whales: the biggest jobs or most valuable regulars you have. What are they, and what makes them worth so much?",
    "If we could fill your calendar with just one kind of customer, who would it be? Describe them like you're describing a real person.",
    "Your site lists Maplewood, Cedar Falls, and Bruxton. Where do you WANT more work, and anywhere you'd rather not go?",
  ]},
];

const MAX_BYTES = 20 * 1024 * 1024; // KV value limit is 25MB; keep headroom

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname === "/health") return json({ ok: true });

    if (req.method === "GET" && url.pathname === `/i/${env.PAGE_TOKEN}`) {
      return new Response(renderPage(env.PAGE_TOKEN), {
        headers: {
          "content-type": "text/html;charset=utf-8",
          "x-robots-tag": "noindex, nofollow",
          "cache-control": "no-store",
        },
      });
    }

    if (req.method === "POST" && url.pathname === "/upload") {
      if (url.searchParams.get("t") !== env.PAGE_TOKEN) return json({ error: "unauthorized" }, 401);
      const ct = (req.headers.get("content-type") || "").toLowerCase();
      const isText = ct.startsWith("text/plain");
      const isAudio = ct.startsWith("audio/") || ct.startsWith("video/mp4");
      if (!isText && !isAudio) return json({ error: "unsupported content-type" }, 415);

      const buf = await req.arrayBuffer();
      if (buf.byteLength === 0) return json({ error: "empty body" }, 400);
      if (buf.byteLength > MAX_BYTES) return json({ error: "too large (20MB per take)" }, 413);

      const ext = isText ? "txt"
        : ct.includes("mp4") ? "m4a"
        : ct.includes("webm") ? "webm"
        : ct.includes("ogg") ? "ogg"
        : ct.includes("wav") ? "wav" : "bin";
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      // mic-check uploads are prefixed so ingestion skips them
      const prefix = url.searchParams.get("test") === "1" ? "miccheck" : "take";
      const secRaw = url.searchParams.get("sec") || "";
      const sec = /^[a-z0-9-]{1,32}$/.test(secRaw) ? secRaw : "general";
      const rand = crypto.randomUUID().slice(0, 8);
      const key = `${prefix}-${stamp}-${rand}-${sec}.${ext}`;

      await env.STORE.put(key, buf, {
        metadata: { contentType: ct, bytes: buf.byteLength, receivedAt: new Date().toISOString(), sec },
      });
      return json({ ok: true, key, bytes: buf.byteLength });
    }

    return new Response("Not found", { status: 404 });
  },
};

function renderPage(token) {
  const sections = QUESTIONS.map((sec, si) => {
    const start = QUESTIONS.slice(0, si).reduce((n, s) => n + s.qs.length, 1);
    return `
  <details class="qsec" id="sec-${sec.id}" data-sec="${sec.id}"${si === 0 ? " open" : ""}>
    <summary>
      <span class="qsec-title">${sec.title}</span>
      <span class="qsec-meta"><span class="chip time">~${sec.min} min</span><span class="chip done-chip" role="button" tabindex="0">✓</span></span>
    </summary>
    <ol start="${start}">
      ${sec.qs.map((q) => `<li>${q}</li>`).join("\n")}
    </ol>
    <div class="qsec-actions">
      <button class="primary small sec-rec" data-sec="${sec.id}">● Record this section</button>
      <button class="ghost small sec-skip" data-sec="${sec.id}">Skip for now</button>
    </div>
  </details>`;
  }).join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>{{BUSINESS}}: Questions for {{FOUNDER}}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:opsz,wght@9..40,300..800&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root {
    --jd-almond:#E8E4DF; --jd-night:#0F172A; --jd-pink:#FF4D8D; --jd-aqua:#5CECC6;
    --jd-honey:#FBBA2C; --jd-plum:#9B5DE5;
    --paper:var(--jd-almond); --ink:var(--jd-night);
    --card:#F4F1EC; --rule:#D4CFC7; --muted:#4A5268;
    --font-display:"Bebas Neue","Arial Narrow",sans-serif;
    --font-body:"DM Sans",ui-sans-serif,system-ui,sans-serif;
    --font-mono:"DM Mono",ui-monospace,monospace;
    --radius:14px; --ease:cubic-bezier(0.16,1,0.3,1);
  }
  * { box-sizing:border-box; }
  body { margin:0; font-family:var(--font-body); background:var(--paper); color:var(--ink); line-height:1.55; }
  .wrap { max-width:680px; margin:0 auto; padding:24px 16px calc(120px + env(safe-area-inset-bottom)); }
  h1 { font-family:var(--font-display); font-weight:400; font-size:44px; letter-spacing:0.01em; line-height:0.95; margin:10px 0 6px; text-transform:uppercase; }
  .sub { color:var(--muted); margin:0 0 22px; max-width:65ch; }
  h2 { font-family:var(--font-display); font-weight:400; font-size:24px; letter-spacing:0.02em; margin:30px 0 8px; text-transform:uppercase; }
  .card h2 { margin-top:0; }
  ol { margin:0 0 8px; padding-left:22px; }
  li { margin:0 0 10px; max-width:65ch; }
  .card { background:var(--card); border:1px solid var(--rule); border-radius:var(--radius); padding:20px; margin:24px 0; }
  .rec-controls { display:flex; gap:10px; flex-wrap:wrap; align-items:center; }
  button { font-family:var(--font-body); font-size:16px; padding:12px 22px; border-radius:10px; border:none; cursor:pointer; font-weight:700; transition:transform 140ms var(--ease); }
  button:active { transform:scale(0.97); }
  .primary { background:var(--jd-pink); color:var(--jd-night); }
  button[disabled] { opacity:.45; cursor:default; }
  .ghost { background:transparent; color:var(--ink); border:1.5px solid var(--ink); }
  .danger { background:var(--jd-night); color:var(--jd-almond); }
  .small { font-size:14px; padding:8px 16px; }
  .timer { font-family:var(--font-mono); font-variant-numeric:tabular-nums; font-size:20px; font-weight:500; }
  .status { margin-top:12px; font-size:15px; }
  .status.ok { color:var(--ink); font-weight:700; }
  .status.err { color:var(--ink); font-weight:700; background:var(--jd-honey); border-radius:8px; padding:8px 12px; display:inline-block; }
  .helpbox { display:none; margin-top:14px; padding:14px 16px; background:var(--jd-honey); color:var(--jd-night); border-radius:10px; font-size:15px; }
  .helpbox a { color:var(--jd-night); font-weight:700; }
  textarea { width:100%; min-height:120px; font:inherit; padding:12px; border-radius:10px; border:1px solid var(--rule); background:#FBF9F6; color:var(--ink); }
  audio { width:100%; margin-top:8px; }
  .foot { margin-top:36px; font-family:var(--font-mono); font-size:12px; color:var(--muted); }
  /* waveform */
  #wavebox { display:none; margin-top:14px; background:var(--jd-night); border-radius:var(--radius); padding:10px 12px; }
  #wave { width:100%; height:64px; display:block; }
  .wavemeta { display:flex; justify-content:space-between; align-items:center; margin-top:6px; color:var(--jd-almond); font-size:14px; }
  .recdot { display:inline-block; width:10px; height:10px; border-radius:50%; background:var(--jd-pink); margin-right:7px; animation:blink 1s infinite; }
  @keyframes blink { 50% { opacity:.15; } }
  /* takes list (newest on top) */
  #takesList { margin-top:16px; display:flex; flex-direction:column; gap:12px; }
  .take { border:1px solid var(--rule); border-radius:var(--radius); padding:12px 14px; background:#FBF9F6; }
  .take-head { display:flex; justify-content:space-between; align-items:center; gap:8px; }
  .take-title { font-weight:700; }
  .take-status { font-size:13px; font-weight:700; padding:3px 10px; border-radius:999px; }
  .take-status.sent { background:var(--jd-aqua); color:var(--jd-night); }
  .take-status.sending { background:transparent; color:var(--muted); }
  .take-status.failed { background:var(--jd-honey); color:var(--jd-night); }
  .take-actions { display:flex; gap:10px; margin-top:8px; flex-wrap:wrap; }
  .take-actions a { font-size:14px; font-weight:700; color:var(--ink); align-self:center; text-decoration-color:var(--jd-pink); text-decoration-thickness:2px; }
  /* floating recorder dock */
  #dock { position:fixed; left:0; right:0; bottom:0; z-index:50;
    background:var(--jd-night); color:var(--jd-almond);
    padding:10px 14px calc(10px + env(safe-area-inset-bottom));
    display:none; box-shadow:0 -4px 18px rgba(15,23,42,.28); }
  #dock.show { display:block; }
  .dock-inner { max-width:680px; margin:0 auto; display:flex; align-items:center; gap:12px; }
  .dock-hint { font-size:14px; color:#C7CBD6; flex:1; min-width:0; }
  #dock button { padding:10px 16px; font-size:15px; }
  .dock-test { background:transparent; color:var(--jd-almond); border:1.5px solid #3b4261; }
  #dockRecView { display:none; }
  #dockRecView.on { display:flex; align-items:center; gap:10px; flex:1; min-width:0; }
  #dockWave { height:34px; flex:1; min-width:40px; display:block; }
  .dock-timer { font-family:var(--font-mono); font-variant-numeric:tabular-nums; font-size:17px; font-weight:500; white-space:nowrap; }
  #dockIdle { display:flex; align-items:center; gap:12px; flex:1; min-width:0; }
  #dockStatus { font-size:13px; font-weight:700; color:var(--jd-aqua); white-space:nowrap; }
  /* progress bar */
  #progressWrap { margin:0 0 14px; }
  #progressLabel { font-family:var(--font-mono); font-size:12px; color:var(--muted); margin:0 0 6px; }
  /* WCAG 1.4.11: aqua fill on Night Blue track = 12:1, track on almond = 14:1 */
  #progressTrack { height:10px; border-radius:999px; background:var(--jd-night); overflow:hidden; }
  #progressFill { height:100%; background:var(--jd-aqua); border-radius:999px; transition:width 220ms var(--ease); }
  /* toolbar */
  #toolbar { display:flex; justify-content:flex-end; margin:0 0 18px; }
  /* accordion sections */
  .qsec { background:var(--card); border:1px solid var(--rule); border-radius:var(--radius); padding:4px 18px; margin:16px 0; }
  .qsec summary { font-family:var(--font-display); font-weight:400; font-size:22px; letter-spacing:0.02em; text-transform:uppercase; cursor:pointer; list-style:none; padding:16px 0; display:flex; align-items:center; justify-content:space-between; gap:10px; }
  .qsec summary::-webkit-details-marker { display:none; }
  .qsec summary::before { content:"▸"; display:inline-block; margin-right:10px; transition:transform 160ms var(--ease); font-size:16px; }
  .qsec[open] summary::before { transform:rotate(90deg); }
  .qsec-title { flex:1; min-width:0; }
  .qsec-meta { display:flex; align-items:center; gap:8px; flex-shrink:0; }
  .qsec ol { margin:0 0 8px; padding-left:22px; }
  .qsec-actions { display:flex; gap:10px; flex-wrap:wrap; margin:6px 0 16px; }
  /* chips */
  .chip { font-family:var(--font-body); font-size:12px; font-weight:700; border-radius:999px; padding:4px 10px; }
  .chip.time { background:transparent; border:1px solid var(--rule); color:var(--muted); }
  .chip.done-chip { background:transparent; border:1px solid var(--ink); color:var(--ink); opacity:.35; cursor:pointer; }
  .chip.done-chip.done { background:var(--jd-aqua); color:var(--jd-night); border-color:var(--jd-aqua); opacity:1; }
  .chip.done-chip.skipped { background:var(--jd-honey); color:var(--jd-night); border-color:var(--jd-honey); opacity:1; }
  /* resume card */
  #resumeSlot:empty { display:none; }
  /* focus mode */
  #focusKicker { font-family:var(--font-mono); font-size:12px; color:var(--muted); margin:0 0 10px; }
  #focusQ { font-family:var(--font-body); font-size:21px; line-height:1.4; max-width:65ch; margin:0 0 16px; }
  #focusHint { color:var(--muted); font-size:13px; margin:14px 0 0; }
</style>
</head>
<body>
<div class="wrap">
  <h1>Hey {{FOUNDER}}. ${QUESTIONS.reduce((n,s)=>n+s.qs.length,0)} Questions, One Coffee</h1>
  <p class="sub">So everything we write sounds like you and only claims what's true.
  <strong>Easiest way: hit record and just talk through them in order.</strong> Sounds like a
  lot; it's about one coffee's worth of talking. Rambling is perfect, we'll sort it out. Do it
  in one go or one take per section, whatever's comfortable. <strong>Skip anything.</strong> A
  half answer beats a perfect answer we never get.</p>

  <div id="progressWrap">
    <div id="progressLabel">0 of 8 sections covered</div>
    <div id="progressTrack"><div id="progressFill" style="width:0%"></div></div>
  </div>
  <div id="toolbar">
    <button class="ghost small" id="focusToggle">One question at a time</button>
  </div>

  <div id="resumeSlot"></div>

  <div class="card" id="focusCard" style="display:none">
    <div id="focusKicker"></div>
    <p id="focusQ"></p>
    <div class="rec-controls">
      <button class="ghost small" id="focusBack">← Back</button>
      <button class="primary small" id="focusNext">Next →</button>
    </div>
    <p id="focusHint">Record with the button below while you read.</p>
  </div>

  ${sections}

  <div class="card">
    <h2>Quick Test First</h2>
    <p style="margin:0 0 12px">Takes 10 seconds. Tap the button, <strong>count to three out
    loud</strong>, and we'll check that your mic records and that sending to {{SENDER}} works,
    before you do the real thing.</p>
    <div class="rec-controls">
      <button id="testBtn" class="ghost">🎙 Test my mic &amp; sending</button>
    </div>
    <div id="testResult" class="status"></div>
    <audio id="testPlayer" controls style="display:none"></audio>
  </div>

  <div class="card" id="recCard">
    <h2>Record Your Answers</h2>
    <div class="rec-controls">
      <button id="recBtn" class="primary">● Start recording</button>
      <button id="stopBtn" class="danger" style="display:none">■ Stop</button>
    </div>
    <div id="wavebox">
      <canvas id="wave" height="64"></canvas>
      <div class="wavemeta"><span><span class="recdot"></span>Recording. Talk away</span>
      <span class="timer" id="clock">0:00</span></div>
    </div>
    <div class="status" id="status"></div>
    <div id="takesList"></div>
    <div class="helpbox" id="helpbox">
      <strong>A take couldn't send. Nothing is lost.</strong> It stays in the list above:
      use its <em>Download</em> link to save the file, then email it to
      <a href="mailto:{{SENDER_EMAIL}}?subject=Interview%20recording">{{SENDER_EMAIL}}</a>
      or text it to {{SENDER}} like a voice note. Or tap <em>Send again</em> once you're back on
      good Wi-Fi.
    </div>
  </div>

  <div class="card">
    <h2>Prefer Typing?</h2>
    <textarea id="text" placeholder="Type any answers or extras here..."></textarea>
    <div class="rec-controls" style="margin-top:10px">
      <button id="sendTextBtn" class="primary">Send text ➤</button>
    </div>
    <div class="status" id="textStatus"></div>
  </div>

  <p class="foot">PRIVATE LINK · JUST FOR YOU · RECORDINGS GO STRAIGHT TO {{SENDER_CAPS}} · BUILT ON THE JUST DIGITAL SYSTEM</p>
</div>

<div id="dock" aria-live="polite">
  <div class="dock-inner">
    <div id="dockIdle">
      <span class="dock-hint">Ready when you are</span>
      <span id="dockStatus"></span>
      <button class="dock-test" id="dockTest">Test</button>
      <button class="primary" id="dockRec">● Record</button>
    </div>
    <div id="dockRecView">
      <span class="recdot"></span>
      <canvas id="dockWave" height="34"></canvas>
      <span class="dock-timer" id="dockClock">0:00</span>
      <button class="danger" id="dockStop" style="border:1.5px solid #3b4261">■ Stop</button>
    </div>
  </div>
</div>
<script>
(function () {
  var TOKEN = ${JSON.stringify(token)};
  var SECTIONS = ${JSON.stringify(QUESTIONS.map((s) => ({ id: s.id, short: s.short, title: s.title, min: s.min, n: s.qs.length })))};
  var recBtn = el("recBtn"), stopBtn = el("stopBtn"), status = el("status"),
      wavebox = el("wavebox"), canvas = el("wave"), clock = el("clock"),
      takesList = el("takesList"), helpbox = el("helpbox"),
      dock = el("dock"), dockIdle = el("dockIdle"), dockRecView = el("dockRecView"),
      dockWave = el("dockWave"), dockClock = el("dockClock"), dockStatus = el("dockStatus"),
      dockHint = document.querySelector(".dock-hint"),
      progressLabel = el("progressLabel"), progressFill = el("progressFill"),
      resumeSlot = el("resumeSlot"), focusToggle = el("focusToggle"),
      focusCard = el("focusCard"), focusKicker = el("focusKicker"), focusQ = el("focusQ"),
      focusBack = el("focusBack"), focusNext = el("focusNext");
  var rec = null, chunks = [], mime = "", t0 = 0, tick = null;
  var takes = [];            // newest first; {n, blob, dur, status, row, sec}
  var takeCount = 0;
  var audioCtx = null, analyser = null, raf = 0, bars = [];
  var currentSection = "general";
  var focusMode = false;

  function el(id) { return document.getElementById(id); }
  function fmt(s) { return Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0"); }

  // ---- flatten questions for focus mode indexing ----
  var FLAT = (function () {
    var out = [];
    for (var i = 0; i < SECTIONS.length; i++) {
      var sec = SECTIONS[i];
      var lis = document.querySelectorAll('#sec-' + sec.id + ' li');
      for (var j = 0; j < lis.length; j++) out.push({ secId: sec.id, secTitle: sec.title, text: lis[j].textContent });
    }
    return out;
  })();

  // ---- progress state (localStorage; degrade silently if unavailable) ----
  var progress = { done: {}, focusIdx: 0 };
  (function loadProgress() {
    try {
      var raw = window.localStorage.getItem("rm-intake-v1");
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          progress.done = parsed.done || {};
          progress.focusIdx = typeof parsed.focusIdx === "number" ? parsed.focusIdx : 0;
        }
      }
    } catch (e) {}
  })();
  function saveProgress() {
    try { window.localStorage.setItem("rm-intake-v1", JSON.stringify(progress)); } catch (e) {}
  }
  function coveredCount() {
    var n = 0;
    for (var i = 0; i < SECTIONS.length; i++) if (progress.done[SECTIONS[i].id]) n++;
    return n;
  }
  function firstUncoveredIdx() {
    for (var i = 0; i < SECTIONS.length; i++) if (!progress.done[SECTIONS[i].id]) return i;
    return -1;
  }
  function updateProgressUI() {
    var covered = coveredCount();
    progressLabel.textContent = covered >= 8 ? "All 8 covered. You legend." : covered + " of 8 sections covered";
    progressFill.style.width = Math.round((covered / 8) * 100) + "%";
    if (covered >= 8) {
      dockHint.textContent = "All done ✓";
      dockHint.style.fontFamily = "var(--font-mono)";
    } else if (covered > 0) {
      dockHint.textContent = covered + "/8 ✓";
      dockHint.style.fontFamily = "var(--font-mono)";
    } else {
      dockHint.textContent = "Ready when you are";
      dockHint.style.fontFamily = "";
    }
    document.querySelectorAll(".qsec").forEach(function (d) {
      var id = d.getAttribute("data-sec");
      var chip = d.querySelector(".done-chip");
      if (chip) {
        var st = progress.done[id];
        chip.className = "chip done-chip" + (st === "skipped" ? " skipped" : st ? " done" : "");
        chip.textContent = st === "skipped" ? "\u00bb" : "\u2713";
      }
    });
  }
  function markSectionDone(id, state) {
    progress.done[id] = state;
    saveProgress();
    updateProgressUI();
  }
  function pickMime() {
    var c = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
    for (var i = 0; i < c.length; i++)
      if (window.MediaRecorder && MediaRecorder.isTypeSupported(c[i])) return c[i];
    return "";
  }
  function showStatus(node, cls, msg) { node.className = "status " + cls; node.textContent = msg; }

  // ---- live waveform (iOS voice-memo style: amplitude bars streaming right to left) ----
  function startWave(stream) {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return; // no visualizer support; recording still works
    audioCtx = new AC();
    if (audioCtx.state === "suspended") audioCtx.resume();
    var src = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);
    var data = new Uint8Array(analyser.fftSize);
    var dpr = window.devicePixelRatio || 1;
    var targets = [[canvas, 64], [dockWave, 34]].map(function (pair) {
      var c = pair[0];
      c.width = Math.max(1, c.clientWidth) * dpr;
      c.height = pair[1] * dpr;
      return { c: c, ctx: c.getContext("2d") };
    });
    var BAR_W = 3 * dpr, GAP = 2 * dpr;
    var maxBars = Math.max.apply(null, targets.map(function (t) { return Math.floor(t.c.width / (BAR_W + GAP)); }));
    bars = [];
    // interval-driven (not RAF): keeps sampling steady even when the browser
    // throttles animation frames (backgrounded tab, embedded webview)
    raf = setInterval(function () {
      analyser.getByteTimeDomainData(data);
      var sum = 0;
      for (var i = 0; i < data.length; i++) { var v = (data[i] - 128) / 128; sum += v * v; }
      var rms = Math.sqrt(sum / data.length);        // 0..~1
      var amp = Math.min(1, rms * 4);                // boost speech range
      bars.push(amp);
      if (bars.length > maxBars) bars.shift();
      targets.forEach(function (tg) {
        var ctx = tg.ctx, W = tg.c.width, H = tg.c.height;
        // canvases can gain/change layout after startWave ran; resize lazily
        var want = tg.c.clientWidth * dpr;
        if (want > 0 && Math.abs(W - want) > 2) { tg.c.width = W = want; }
        var fit = Math.floor(W / (BAR_W + GAP));
        var view = bars.slice(-fit);
        ctx.clearRect(0, 0, W, H);
        var mid = H / 2;
        for (var b = 0; b < view.length; b++) {
          var h = Math.max(2 * dpr, view[b] * (H - 8 * dpr));
          var x = W - (view.length - b) * (BAR_W + GAP);
          ctx.fillStyle = view[b] > 0.04 ? "#5CECC6" : "#3b4261";
          ctx.fillRect(x, mid - h / 2, BAR_W, h);
        }
      });
    }, 50);
  }
  function stopWave() {
    clearInterval(raf);
    if (audioCtx) { try { audioCtx.close(); } catch (e) {} audioCtx = null; }
  }

  // ---- takes list (newest on top; every take stays until the page closes) ----
  function sectionShort(id) {
    for (var i = 0; i < SECTIONS.length; i++) if (SECTIONS[i].id === id) return SECTIONS[i].short;
    return id;
  }
  function sectionTitle(id) {
    for (var i = 0; i < SECTIONS.length; i++) if (SECTIONS[i].id === id) return SECTIONS[i].title;
    return "";
  }
  function addTake(blob, dur, sec) {
    takeCount++;
    var t = { n: takeCount, blob: blob, dur: dur, status: "ready", sec: sec || "general" };
    var row = document.createElement("div");
    row.className = "take";
    var ext = blob.type.indexOf("mp4") > -1 ? "m4a" : blob.type.indexOf("ogg") > -1 ? "ogg" : "webm";
    var titleSuffix = t.sec !== "general" ? " · " + sectionShort(t.sec) : "";
    row.innerHTML =
      '<div class="take-head"><span class="take-title">Take ' + t.n + " · " + fmt(dur) + titleSuffix + '</span>' +
      '<span class="take-status"></span></div>' +
      '<audio controls></audio>' +
      '<div class="take-actions">' +
      '<button class="primary small send">Send to {{SENDER}} ➤</button>' +
      '<a class="dl" download="interview-take' + t.n + "." + ext + '">Download</a>' +
      "</div>";
    row.querySelector("audio").src = URL.createObjectURL(blob);
    row.querySelector(".dl").href = URL.createObjectURL(blob);
    row.querySelector(".send").onclick = function () { sendTake(t); };
    t.row = row;
    takes.unshift(t);
    takesList.prepend(row);      // newest on top
    sendTake(t);                 // auto-send; button stays as manual retry
    return t;
  }
  function setTakeStatus(t, cls, label, showSend) {
    var s = t.row.querySelector(".take-status");
    s.className = "take-status " + cls; s.textContent = label;
    var send = t.row.querySelector(".send");
    send.style.display = showSend ? "inline-block" : "none";
    send.textContent = cls === "failed" ? "Send again ➤" : "Send to {{SENDER}} ➤";
  }
  function sendTake(t) {
    if (t.status === "sending" || t.status === "sent") return;
    t.status = "sending";
    setTakeStatus(t, "sending", "Sending…", false);
    var tries = 0;
    (function attempt() {
      tries++;
      var ctl = new AbortController();
      var to = setTimeout(function () { ctl.abort(); }, 60000);
      var uploadUrl = "/upload?t=" + TOKEN + "&sec=" + encodeURIComponent(t.sec || "general");
      fetch(uploadUrl, { method: "POST", headers: { "content-type": t.blob.type || "audio/webm" }, body: t.blob, signal: ctl.signal })
        .then(function (r) { clearTimeout(to); if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
        .then(function () {
          t.status = "sent";
          setTakeStatus(t, "sent", "✅ Sent to {{SENDER}}", false);
          if (t.sec && t.sec !== "general") {
            markSectionDone(t.sec, "done");
            flashDockStatus("✓ " + sectionShort(t.sec) + " sent");
          } else {
            flashDockStatus("✓ Take " + t.n + " sent");
          }
          updateHelp();
        })
        .catch(function () {
          clearTimeout(to);
          if (tries < 3) { setTakeStatus(t, "sending", "Sending… (retry " + tries + " of 2)", false); setTimeout(attempt, 1500 * tries); }
          else { t.status = "failed"; setTakeStatus(t, "failed", "⚠️ Not sent. Saved here", true); updateHelp(); }
        });
    })();
  }
  function updateHelp() {
    helpbox.style.display = takes.some(function (t) { return t.status === "failed"; }) ? "block" : "none";
  }
  window.addEventListener("beforeunload", function (e) {
    if (takes.some(function (t) { return t.status !== "sent"; })) { e.preventDefault(); e.returnValue = ""; }
  });

  // ---- main recorder (shared by the card and the floating dock) ----
  var recording = false;
  function setDockMode(on) {
    recording = on;
    dockIdle.style.display = on ? "none" : "flex";
    dockRecView.className = on ? "on" : "";
    updateDock();
  }
  function startRecording() {
    if (recording) return;
    var takeSection = currentSection;  // snapshot: mid-recording UI changes must not retag the take
    showStatus(status, "", "");
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      mime = pickMime();
      rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 48000 } : undefined);
      chunks = [];
      rec.ondataavailable = function (e) { if (e.data.size) chunks.push(e.data); };
      rec.onstop = function () {
        stopWave();
        stream.getTracks().forEach(function (tr) { tr.stop(); });
        clearInterval(tick);
        wavebox.style.display = "none";
        stopBtn.style.display = "none";
        recBtn.style.display = "inline-block";
        recBtn.textContent = "● Record take " + (takeCount + 2);
        setDockMode(false);
        addTake(new Blob(chunks, { type: mime || "audio/webm" }), (Date.now() - t0) / 1000, takeSection);
      };
      rec.start(1000);
      t0 = Date.now();
      wavebox.style.display = "block";
      setDockMode(true);            // before startWave so the mini canvas has layout
      startWave(stream);
      stopBtn.style.display = "inline-block";
      recBtn.style.display = "none";
      tick = setInterval(function () {
        var s = fmt((Date.now() - t0) / 1000);
        clock.textContent = s; dockClock.textContent = s;
      }, 500);
    }).catch(function () {
      showStatus(status, "err", "Couldn't access the microphone. Check your browser's mic permission, or use the typing box below.");
      el("recCard").scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }
  function stopRecording() { if (rec && rec.state !== "inactive") rec.stop(); }
  recBtn.onclick = function () { currentSection = "general"; startRecording(); };
  stopBtn.onclick = stopRecording;
  el("dockRec").onclick = function () { if (!focusMode) currentSection = "general"; startRecording(); };
  el("dockStop").onclick = stopRecording;
  el("dockTest").onclick = function () {
    document.getElementById("testBtn").scrollIntoView({ block: "center", behavior: "smooth" });
  };

  // ---- per-section record / skip ----
  document.querySelectorAll(".sec-rec").forEach(function (btn) {
    btn.onclick = function () {
      currentSection = btn.getAttribute("data-sec");
      startRecording();
    };
  });
  function openSection(id, scroll) {
    document.querySelectorAll(".qsec").forEach(function (d) {
      if (d.getAttribute("data-sec") === id) d.setAttribute("open", "");
      else d.removeAttribute("open");
    });
    if (scroll === false) return;
    var target = el("sec-" + id);
    if (target) {
      var summary = target.querySelector("summary");
      (summary || target).scrollIntoView({ block: "start", behavior: "smooth" });
    }
  }
  document.querySelectorAll(".sec-skip").forEach(function (btn) {
    btn.onclick = function () {
      var id = btn.getAttribute("data-sec");
      markSectionDone(id, "skipped");
      var idx = -1;
      for (var i = 0; i < SECTIONS.length; i++) if (SECTIONS[i].id === id) idx = i;
      var next = SECTIONS[idx + 1];
      if (next) openSection(next.id);
    };
  });

  // ---- done-chip: manual toggle, accessible, doesn't toggle the <details> ----
  document.querySelectorAll(".done-chip").forEach(function (chip) {
    function toggle(e) {
      e.preventDefault();
      e.stopPropagation();
      var d = chip.closest(".qsec");
      var id = d.getAttribute("data-sec");
      if (progress.done[id]) delete progress.done[id];
      else progress.done[id] = "done";
      saveProgress();
      updateProgressUI();
    }
    chip.onclick = toggle;
    chip.onkeydown = function (e) { if (e.key === "Enter" || e.key === " ") toggle(e); };
  });

  // ---- accordion: one open at a time ----
  document.querySelectorAll(".qsec").forEach(function (d) {
    d.addEventListener("toggle", function () {
      if (d.open) {
        document.querySelectorAll(".qsec").forEach(function (other) {
          if (other !== d) other.removeAttribute("open");
        });
      }
    });
  });

  // ---- resume banner (F4) + auto-open first uncovered section ----
  (function initResume() {
    var covered = coveredCount();
    var idx = firstUncoveredIdx();
    if (idx === -1) idx = 0; // all covered: leave first section as default
    openSection(SECTIONS[idx].id, false);
    if (covered >= 1 && covered <= 7) {
      var remainingMin = 0;
      for (var i = 0; i < SECTIONS.length; i++) if (!progress.done[SECTIONS[i].id]) remainingMin += SECTIONS[i].min;
      var nextTitle = SECTIONS[idx].title;
      var card = document.createElement("div");
      card.className = "card";
      card.id = "resumeCard";
      card.innerHTML =
        "<strong>Welcome back.</strong> " + covered + " of 8 sections covered, about " + remainingMin +
        " minutes left. Pick up wherever you like." +
        '<div class="rec-controls" style="margin-top:10px">' +
        '<button class="primary small" id="resumeBtn">Continue with &quot;' + nextTitle + '&quot;</button>' +
        "</div>";
      resumeSlot.appendChild(card);
      card.setAttribute("data-covered-at-load", covered);
      el("resumeBtn").onclick = function () { openSection(SECTIONS[firstUncoveredIdx() === -1 ? 0 : firstUncoveredIdx()].id); };
    }
  })();
  // the banner is a load-time snapshot; remove it once progress moves past it
  (function () {
    var orig = updateProgressUI;
    updateProgressUI = function () {
      orig();
      var rc = el("resumeCard");
      if (rc && coveredCount() !== +rc.getAttribute("data-covered-at-load")) rc.parentNode.removeChild(rc);
    };
  })();
  updateProgressUI();

  // ---- focus mode (F6) ----
  function renderFocus() {
    var i = progress.focusIdx || 0;
    if (i < 0) i = 0;
    if (i > FLAT.length - 1) i = FLAT.length - 1;
    var q = FLAT[i];
    currentSection = q.secId;
    focusKicker.textContent = "QUESTION " + (i + 1) + " OF " + FLAT.length + " · " + q.secTitle.toUpperCase();
    focusQ.textContent = q.text;
    focusBack.disabled = i === 0;
    focusNext.textContent = i === FLAT.length - 1 ? "Done ✓" : "Next →";
  }
  function setFocusMode(on) {
    focusMode = on;
    focusToggle.textContent = on ? "Show all questions" : "One question at a time";
    focusCard.style.display = on ? "block" : "none";
    document.querySelectorAll(".qsec").forEach(function (d) { d.style.display = on ? "none" : ""; });
    var resumeCard = el("resumeCard");
    if (resumeCard) resumeCard.style.display = on ? "none" : "";
    recCard.style.display = on ? "none" : "";
    if (on) renderFocus();
    checkCardInView();
  }
  focusToggle.onclick = function () { setFocusMode(!focusMode); };
  focusBack.onclick = function () {
    if (progress.focusIdx > 0) { progress.focusIdx--; saveProgress(); renderFocus(); }
  };
  focusNext.onclick = function () {
    if (progress.focusIdx >= FLAT.length - 1) { setFocusMode(false); return; }
    progress.focusIdx++; saveProgress(); renderFocus();
  };

  // ---- floating dock visibility: hidden while the full recorder card is on screen ----
  var recCard = el("recCard");
  var cardInView = false;
  function updateDock() {
    // show the floating dock whenever the full recorder card is off screen
    dock.className = cardInView ? "" : "show";
  }
  // Rect-based check on scroll/resize (IntersectionObserver is unreliable in
  // throttled webviews; this works everywhere and is cheap at ~5 events/sec).
  function checkCardInView() {
    var r = recCard.getBoundingClientRect();
    var vh = window.innerHeight || document.documentElement.clientHeight;
    var visible = Math.min(r.bottom, vh) - Math.max(r.top, 0);
    var inView = visible > Math.min(r.height, vh) * 0.25;
    if (inView !== cardInView) { cardInView = inView; updateDock(); }
  }
  var scrollPending = false;
  function onScroll() {
    if (scrollPending) return;
    scrollPending = true;
    setTimeout(function () { scrollPending = false; checkCardInView(); }, 150);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  checkCardInView();
  updateDock();  // initial paint: checkCardInView's change-guard skips the first call
  function flashDockStatus(msg) {
    dockStatus.textContent = msg;
    setTimeout(function () { dockStatus.textContent = ""; }, 4000);
  }

  // ---- typed answers ----
  el("sendTextBtn").onclick = function () {
    var v = el("text").value.trim();
    if (!v) return;
    var st = el("textStatus");
    showStatus(st, "", "Sending…");
    fetch("/upload?t=" + TOKEN, { method: "POST", headers: { "content-type": "text/plain;charset=utf-8" }, body: v })
      .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
      .then(function () { showStatus(st, "ok", "✅ Sent!"); el("text").value = ""; })
      .catch(function () { showStatus(st, "err", "Couldn't send. Copy your text and email it to {{SENDER_EMAIL}}."); });
  };

  // ---- mic & sending self-test: 3s recording -> playback -> tiny test upload ----
  var testBtn = el("testBtn"), testResult = el("testResult"), testPlayer = el("testPlayer");
  testBtn.onclick = function () {
    testBtn.disabled = true;
    testPlayer.style.display = "none";
    showStatus(testResult, "", "Recording 3 seconds. Count to three out loud…");
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      var m = pickMime();
      var tr = new MediaRecorder(stream, m ? { mimeType: m, audioBitsPerSecond: 48000 } : undefined);
      var tChunks = [];
      tr.ondataavailable = function (e) { if (e.data.size) tChunks.push(e.data); };
      tr.onstop = function () {
        stream.getTracks().forEach(function (t) { t.stop(); });
        var tBlob = new Blob(tChunks, { type: m || "audio/webm" });
        if (tBlob.size < 1000) {
          testBtn.disabled = false;
          return showStatus(testResult, "err", "❌ The mic recorded nothing. Check the mic permission for this page in your browser settings, then try again.");
        }
        testPlayer.src = URL.createObjectURL(tBlob);
        testPlayer.style.display = "block";
        showStatus(testResult, "", "Mic works ✔ You should hear yourself above. Now testing sending…");
        var ctl = new AbortController();
        var to = setTimeout(function () { ctl.abort(); }, 30000);
        fetch("/upload?t=" + TOKEN + "&test=1", { method: "POST", headers: { "content-type": tBlob.type || "audio/webm" }, body: tBlob, signal: ctl.signal })
          .then(function (r) { clearTimeout(to); if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
          .then(function () {
            testBtn.disabled = false;
            showStatus(testResult, "ok", "✅ All good. Your mic records and sending to {{SENDER}} works. Play the clip above to hear yourself, then record the real thing below.");
          })
          .catch(function () {
            clearTimeout(to);
            testBtn.disabled = false;
            showStatus(testResult, "err", "⚠️ Your mic works (play the clip above), but sending failed. Maybe a weak connection. You can still record below: if sending fails there too, every take stays on the page with a Download link. Nothing gets lost.");
          });
      };
      tr.start();
      setTimeout(function () { if (tr.state !== "inactive") tr.stop(); }, 3000);
    }).catch(function () {
      testBtn.disabled = false;
      showStatus(testResult, "err", "❌ Couldn't access the microphone. Tap the mic icon in your browser's address bar (or Settings → Safari → Microphone) and allow it, then try again.");
    });
  };
})();
</script>
</body>
</html>`;
}
