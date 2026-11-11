// LEAP Award Status Check: back end (single file).
// Settings you may want to change (contact email, step names, wording, program filters) are in the
// "config" section of this file. Search for: CONTACT or PROFILE

// lib/hubspot.mjs
var BASE = "https://api.hubapi.com";
function createHubSpot({ token, fetchImpl = fetch }) {
  if (!token) throw new Error("HUBSPOT_TOKEN is not set");
  async function call(method, path, body) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetchImpl(BASE + path, {
        method,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : void 0
      });
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 1e3 * (attempt + 1)));
        continue;
      }
      if (res.status === 404 && method === "GET") return null;
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HubSpot ${method} ${path} failed: ${res.status} ${text.slice(0, 300)}`);
      }
      return res.json();
    }
    throw new Error("HubSpot rate limit: retries exhausted");
  }
  return {
    async findContactsByEmail(email) {
      const data = await call("POST", "/crm/v3/objects/contacts/search", {
        filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: email }] }],
        properties: ["email"],
        limit: 10
      });
      return data.results.map((r) => r.id);
    },
    async associatedIds(fromType, fromId, toType) {
      const ids = [];
      let after;
      do {
        const q = after ? `?after=${encodeURIComponent(after)}` : "";
        const data = await call("GET", `/crm/v4/objects/${fromType}/${fromId}/associations/${toType}${q}`);
        for (const r of data?.results || []) ids.push(String(r.toObjectId));
        after = data?.paging?.next?.after;
      } while (after);
      return ids;
    },
    async batchRead(objectType, ids, properties) {
      if (!ids.length) return [];
      const out = [];
      for (let i = 0; i < ids.length; i += 100) {
        const data = await call("POST", `/crm/v3/objects/${objectType}/batch/read`, {
          inputs: ids.slice(i, i + 100).map((id) => ({ id })),
          properties
        });
        out.push(...data.results);
      }
      return out;
    },
    async searchAll(objectType, filterGroups, properties) {
      const out = [];
      let after;
      do {
        const data = await call("POST", `/crm/v3/objects/${objectType}/search`, {
          filterGroups,
          properties,
          limit: 200,
          ...after ? { after } : {}
        });
        out.push(...data.results);
        after = data.paging?.next?.after;
      } while (after && out.length < 1e4);
      return out;
    }
  };
}

// lib/mock.mjs
var DAY = 864e5;
var now = Date.now();
var ago = (d) => new Date(now - d * DAY).toISOString();
var P = "689330762";
var contacts = {
  "owner@riverbendbakery.com": ["c1"],
  "hello@sparrowlabs.io": ["c2"],
  "team@northsidemakers.com": ["c3"],
  "someone@otherpipeline.com": ["c4"]
};
var contactAwards = { c1: ["a1"], c2: ["a2", "a3"], c3: ["a4"], c4: ["a9"] };
var awardCompanies = { a1: ["co1"], a2: ["co2"], a3: ["co2"], a4: ["co3"], a9: ["co9"] };
var records = {
  companies: {
    co1: { name: "Riverbend Bakery LLC", scale_current_stage: "accelerate", scale__date_of_intake: "2026-10-14" },
    co2: { name: "Sparrow Labs, Inc." },
    co3: { name: "Northside Makers", scale_current_stage: "start", scale__date_of_intake: "2026-09-02" },
    co9: { name: "Other Pipeline Co" }
  },
  p48151332_awards: {
    a1: { hs_createdate: ago(70), award___project_name: "Riverbend Bakery - CBAF1", hs_pipeline: P, hs_pipeline_stage: "1062678059", hs_v2_date_entered_current_stage: ago(12), waiting_for_action_from: "LEAP" },
    a2: { hs_createdate: ago(400), award___project_name: "Sparrow Labs - CBAF1", hs_pipeline: P, hs_pipeline_stage: "1054217605", hs_v2_date_entered_current_stage: ago(90) },
    a3: { hs_createdate: ago(160), award___project_name: "Sparrow Labs - CBAF2", hs_pipeline: P, hs_pipeline_stage: "1009066058", hs_v2_date_entered_current_stage: ago(21), waiting_for_action_from: "Applicant" },
    a4: { hs_createdate: ago(45), award___project_name: "Northside Makers - CBAF1", hs_pipeline: P, hs_pipeline_stage: "1143420187", hs_v2_date_entered_current_stage: ago(30), waiting_for_action_from: "LEAP" },
    a9: { award___project_name: "Other Pipeline - X", hs_pipeline: "696371739", hs_pipeline_stage: "1018250038" },
    a5: { hs_createdate: ago(560), award___project_name: "Riverbend Bakery - DTAF1", hs_pipeline: P, hs_pipeline_stage: "1054217605", hs_v2_date_entered_current_stage: ago(400) }
  },
  p48151332_programs: {
    pr1: { farmer_training_program: "One & All - Cohort 12 - 2026", program_start_date: "2026-02-25" },
    pr2: { farmer_training_program: "Biz Made Simple - 3/12/26 (Marketing Made Simple)", program_start_date: "2026-03-12" },
    pr3: { farmer_training_program: "LEAP - One & All - Applied" },
    // application list: hidden
    pr4: { farmer_training_program: "Elevate - Cohort 4 - 2025", program_start_date: "2025-04-09" }
  },
  emails: {},
  meetings: {},
  calls: {}
};
var emailDays = [10, 26, 40, 55, 70, 95, 120, 150, 200, 240, 300, 380, 420, 520];
emailDays.forEach((d, i) => {
  records.emails["e" + i] = { hs_timestamp: ago(d) };
});
[14, 89, 223, 330, 450].forEach((d, i) => {
  records.meetings["m" + i] = { hs_timestamp: ago(d), hs_meeting_outcome: "COMPLETED" };
});
records.meetings.mCanceled = { hs_timestamp: ago(60), hs_meeting_outcome: "CANCELED" };
records.meetings.mFuture = { hs_timestamp: ago(-7), hs_meeting_outcome: "SCHEDULED" };
records.calls.k0 = { hs_timestamp: ago(63), hs_call_status: "COMPLETED" };
records.calls.k1 = { hs_timestamp: ago(64), hs_call_status: "NO_ANSWER" };
["s1", "s2", "s3"].forEach((id, i) => {
  records.emails[id] = { hs_timestamp: ago(30 + i * 40) };
});
records.meetings.s4 = { hs_timestamp: ago(100), hs_meeting_outcome: "COMPLETED" };
var eRiver = Object.keys(records.emails).filter((k) => k.startsWith("e"));
var links = {
  "companies:co1:contacts": ["c1", "c5"],
  "companies:co1:emails": eRiver.slice(0, 10),
  "contacts:c1:emails": eRiver.slice(4, 12),
  // overlaps the company's emails: counted once
  "contacts:c5:emails": eRiver.slice(10, 14),
  "companies:co1:meetings": ["m0", "m1", "m2", "mCanceled", "mFuture"],
  "contacts:c1:meetings": ["m0", "m3", "m4"],
  "companies:co1:calls": ["k0", "k1"],
  "companies:co1:p48151332_programs": ["pr1", "pr2", "pr3"],
  "companies:co1:p48151332_awards": ["a1", "a5"],
  // a5 is linked to the company only
  "companies:co2:p48151332_awards": ["a2", "a3"],
  "companies:co2:contacts": ["c2"],
  "companies:co2:emails": ["s1", "s2"],
  "contacts:c2:emails": ["s2", "s3"],
  "companies:co2:meetings": ["s4"],
  "companies:co3:contacts": ["c3"]
};
function createMockHubSpot() {
  return {
    async findContactsByEmail(email) {
      return contacts[email] || [];
    },
    async associatedIds(from, id, to) {
      if (from === "contacts" && to === "p48151332_awards") return contactAwards[id] || [];
      if (from === "p48151332_awards" && to === "companies") return awardCompanies[id] || [];
      return links[`${from}:${id}:${to}`] || [];
    },
    async batchRead(type, ids) {
      const src = records[type] || {};
      return ids.filter((i) => src[i]).map((id) => ({ id, properties: { ...src[id] } }));
    },
    async searchAll() {
      return [];
    }
    // forces fallback medians
  };
}

// lib/config.mjs
var HUBSPOT = {
  awardsObject: "p48151332_awards",
  sbiPipelineId: "689330762",
  programsObject: "p48151332_programs",
  // Only records created after the April 2025 Salesforce import have
  // trustworthy stage timing. Estimates are built from records on/after this date.
  statsSince: "2025-07-01",
  // How long to reuse computed stage statistics before re-reading HubSpot.
  statsCacheHours: 12
};
var PROFILE = {
  // Program records whose names match this are lists of interest, applications or waitlists,
  // not participation, so they are not shown.
  programExclude: /\b(interested|applied|applicants?|waitlist|prospect|registered|business registration)\b/i,
  // Wording trimmed from program names before showing them.
  programStrip: [/^LEAP\s*[-–]\s*/i, /\s*[-–]\s*(participants|checked in)\s*$/i, /\s+attendance\b/i],
  // Internal shorthand shown in full: [pattern, replacement]
  programRename: [[/^BMS\b/, "Biz Made Simple"]],
  maxContacts: 50,
  // contacts per company checked for touchpoints
  maxListed: 200
  // touchpoints listed on the page (the counts include all of them)
};
var CONTACT = {
  name: "Harrison",
  email: "harrison@purelansing.com"
};
var STAGES = [
  {
    id: "1009147268",
    internal: "Intake Form",
    kind: "step",
    publicName: "Intake",
    description: "We have your intake form and are reviewing it.",
    defaultWaitingFor: "Applicant",
    fallbackMedianDays: 27
  },
  {
    id: "1054217603",
    internal: "Confirmed for Cohort",
    kind: "step",
    publicName: "Confirmed",
    description: "You have been confirmed for the program.",
    defaultWaitingFor: "Applicant",
    fallbackMedianDays: 24
  },
  {
    id: "1009066057",
    internal: "Executive Summary and Wishlist Received",
    kind: "step",
    publicName: "Executive summary and wishlist",
    description: "We have your executive summary and wishlist.",
    defaultWaitingFor: "LEAP",
    fallbackMedianDays: 5
  },
  {
    id: "1062678059",
    internal: "BAF Airtable Creation and Document Editing",
    kind: "step",
    publicName: "Application preparation",
    description: "LEAP is preparing your award application documents.",
    defaultWaitingFor: "LEAP",
    fallbackMedianDays: 41
  },
  {
    id: "1054217604",
    internal: "BAF Submitted and Awaiting Approval",
    kind: "step",
    publicName: "Committee review",
    description: "Your application has been submitted and is with the review committee.",
    defaultWaitingFor: "Review Committee",
    fallbackMedianDays: 38,
    overrideMedianDays: null
  },
  {
    id: "1009066058",
    internal: "Contracts and Application",
    kind: "step",
    publicName: "Contracts",
    description: "Contracts and final application paperwork.",
    defaultWaitingFor: "Applicant",
    fallbackMedianDays: 10
  },
  {
    id: "1009066059",
    internal: "Invoice 1",
    kind: "step",
    publicName: "First payment",
    description: "First 50% payment, based on the service provider invoice.",
    defaultWaitingFor: "Service Provider",
    fallbackMedianDays: 31
  },
  {
    id: "1009147269",
    internal: "Invoice 2 / Receipts",
    kind: "step",
    publicName: "Final payment",
    description: "Final payment, based on the second invoice and receipts.",
    defaultWaitingFor: "Applicant",
    fallbackMedianDays: 50
  },
  {
    id: "1143419225",
    internal: "Missing Information for Closeout",
    kind: "closeout",
    publicName: "Closeout",
    description: "We need a few items from you to close out your award.",
    defaultWaitingFor: "Applicant",
    fallbackMedianDays: null
  },
  {
    id: "1054217605",
    internal: "Completed",
    kind: "done",
    publicName: "Complete",
    description: "Your award is complete.",
    defaultWaitingFor: null,
    fallbackMedianDays: null
  },
  {
    id: "1143420187",
    internal: "Waitlist",
    kind: "waitlist",
    publicName: "Waitlist",
    description: "We will reach out when a spot opens.",
    defaultWaitingFor: "LEAP",
    fallbackMedianDays: null
  },
  {
    id: "1062678060",
    internal: "Rejected/Denied",
    kind: "closed",
    publicName: "Closed",
    description: "This application is closed. Please contact us with any questions.",
    defaultWaitingFor: null,
    fallbackMedianDays: null
  },
  {
    id: "1062003537",
    internal: "Inactive/Missed Cohort",
    kind: "closed",
    publicName: "Closed",
    description: "This application is closed. Please contact us with any questions.",
    defaultWaitingFor: null,
    fallbackMedianDays: null
  }
];
var WAITING_FOR = {
  "Applicant": { label: "You", message: "The next step is yours. Check your email for what we need, or contact us." },
  "LEAP": { label: "LEAP", message: "LEAP is working on the next step. Nothing is needed from you right now." },
  "Review Committee": { label: "Review committee", message: "Your application is with the review committee. Nothing is needed from you right now." },
  "Service Provider": { label: "Your service provider", message: "We are waiting on your service provider (for example, their invoice)." }
};
var STALE_DAYS = 365;
var MIN_SAMPLE = 8;

// lib/profile.mjs
var DAY_MS = 864e5;
var SCALE_STEPS = ["start", "commit", "accelerate", "leverage", "expand"];
var SCALE_LABELS = {
  start: "Start",
  commit: "Commit",
  accelerate: "Accelerate",
  leverage: "Leverage",
  expand: "Expand",
  completed: "Completed",
  regional_growth: "Regional Growth",
  "SCALE+": "SCALE+"
};
function scaleInfo(props) {
  const v = props?.scale_current_stage;
  if (!v) return null;
  const idx = SCALE_STEPS.indexOf(v);
  return {
    label: SCALE_LABELS[v] || v,
    stepIndex: idx,
    // 0-4 for the five stages, -1 otherwise
    steps: SCALE_STEPS.map((s) => SCALE_LABELS[s]),
    allDone: v === "completed",
    intakeDate: props.scale__date_of_intake || null
  };
}
function isParticipation(name) {
  return !PROFILE.programExclude.test(name || "");
}
function cleanProgramName(name) {
  let s = String(name || "").trim();
  for (const re of PROFILE.programStrip) s = s.replace(re, "");
  for (const [re, to] of PROFILE.programRename || []) s = s.replace(re, to);
  return s.replace(/\s{2,}/g, " ").replace(/[\s\-–:]+$/, "").trim();
}
function programList(records2) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const r of records2) {
    const raw = r.properties.farmer_training_program;
    if (!raw || !isParticipation(raw)) continue;
    const name = cleanProgramName(raw);
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const date = r.properties.program_start_date || r.properties.cohort_start_date || null;
    out.push({ name, date });
  }
  return out.sort((a, b) => (b.date || "").localeCompare(a.date || "") || a.name.localeCompare(b.name));
}
var TYPES = {
  meetings: { key: "meeting", props: ["hs_timestamp", "hs_meeting_outcome"] },
  calls: { key: "call", props: ["hs_timestamp", "hs_call_status"] },
  emails: { key: "email", props: ["hs_timestamp"] }
};
function countsAsTouchpoint(type, p, now2) {
  const t = Date.parse(p.hs_timestamp);
  if (!Number.isFinite(t) || t > now2) return false;
  if (type === "meetings" && ["CANCELED", "NO_SHOW"].includes(p.hs_meeting_outcome)) return false;
  if (type === "calls" && ["BUSY", "FAILED", "NO_ANSWER", "CANCELED", "QUEUED"].includes(p.hs_call_status)) return false;
  return true;
}
async function idsFor(hs, owners, toType) {
  const ids = /* @__PURE__ */ new Set();
  for (let i = 0; i < owners.length; i += 8) {
    const batch = await Promise.all(owners.slice(i, i + 8).map(([fromType, id]) => hs.associatedIds(fromType, id, toType)));
    for (const list of batch) for (const x of list) ids.add(x);
  }
  return [...ids];
}
async function touchpoints(hs, companyIds, now2 = Date.now()) {
  const contactIds = /* @__PURE__ */ new Set();
  for (const cid of companyIds) {
    const ids = await hs.associatedIds("companies", cid, "contacts");
    for (const id of ids.slice(0, PROFILE.maxContacts)) contactIds.add(id);
  }
  const owners = [...companyIds.map((id) => ["companies", id]), ...[...contactIds].map((id) => ["contacts", id])];
  const items = [];
  for (const [type, cfg] of Object.entries(TYPES)) {
    const ids = await idsFor(hs, owners, type);
    const records2 = await hs.batchRead(type, ids, cfg.props);
    for (const r of records2) {
      if (!countsAsTouchpoint(type, r.properties, now2)) continue;
      items.push({ type: cfg.key, date: String(r.properties.hs_timestamp).slice(0, 10) });
    }
  }
  items.sort((a, b) => b.date.localeCompare(a.date));
  const cutoff = new Date(now2 - 365 * DAY_MS).toISOString().slice(0, 10);
  const byType = {};
  for (const k of ["meeting", "call", "email"]) {
    const all = items.filter((i) => i.type === k);
    byType[k] = { total: all.length, last12: all.filter((i) => i.date >= cutoff).length };
  }
  return {
    total: items.length,
    last12: items.filter((i) => i.date >= cutoff).length,
    since: items.length ? items[items.length - 1].date.slice(0, 7) : null,
    // YYYY-MM of the first touchpoint
    byType,
    items: items.slice(0, PROFILE.maxListed)
  };
}
async function part(label, fn) {
  try {
    return await fn();
  } catch (err) {
    console.error(`Company overview: ${label} not loaded:`, err.message);
    return void 0;
  }
}
async function companyOverview(hs, companyIds, now2 = Date.now()) {
  if (!companyIds.length) return null;
  const companies = await part("company", () => hs.batchRead("companies", companyIds, ["name", "scale_current_stage", "scale__date_of_intake"]));
  const main = companies?.[0]?.properties;
  const withScale = (companies || []).map((c) => c.properties).filter((p) => p.scale_current_stage);
  const scaleSrc = withScale.sort((a, b) => (b.scale__date_of_intake || "").localeCompare(a.scale__date_of_intake || ""))[0];
  const [programs, tp] = await Promise.all([
    part("programs", async () => {
      const ids = await idsFor(hs, companyIds.map((id) => ["companies", id]), HUBSPOT.programsObject);
      return programList(await hs.batchRead(HUBSPOT.programsObject, ids, ["farmer_training_program", "program_start_date", "cohort_start_date"]));
    }),
    part("touchpoints", () => touchpoints(hs, companyIds, now2))
  ]);
  return {
    name: main?.name?.trim() || null,
    scale: companies ? scaleInfo(scaleSrc) : void 0,
    // null = not in SCALE; undefined = could not load
    programs,
    touchpoints: tp
  };
}

// lib/status.mjs
var DAY_MS2 = 864e5;
var STEP_STAGES = STAGES.filter((s) => s.kind === "step");
var stageById = Object.fromEntries(STAGES.map((s) => [s.id, s]));
var statsCache = null;
function survivalQuantiles(obs, qs = [0.25, 0.5, 0.75]) {
  const sorted = [...obs].sort((a, b) => a.t - b.t || b.done - a.done);
  let atRisk = sorted.length, surviving = 1;
  const curve = [];
  for (let i = 0; i < sorted.length; ) {
    const t = sorted[i].t;
    let finished = 0, waiting = 0;
    while (i < sorted.length && sorted[i].t === t) {
      sorted[i].done ? finished++ : waiting++;
      i++;
    }
    if (finished) {
      surviving *= 1 - finished / atRisk;
      curve.push([t, surviving]);
    }
    atRisk -= finished + waiting;
  }
  return qs.map((q) => curve.find(([, s]) => s <= 1 - q + 1e-9)?.[0] ?? null);
}
function stageObservations(records2, stageId, now2) {
  const obs = [];
  for (const r of records2) {
    const p = r.properties;
    if (p.hs_pipeline_stage === stageId) {
      const entered = Date.parse(p.hs_v2_date_entered_current_stage);
      const t = (now2 - entered) / DAY_MS2;
      if (Number.isFinite(t) && t >= 0 && t <= STALE_DAYS) obs.push({ t, done: false });
    } else if (p[`hs_v2_date_exited_${stageId}`]) {
      const d = Number(p[`hs_v2_cumulative_time_in_${stageId}`]) / DAY_MS2;
      if (Number.isFinite(d) && d > 0.01) obs.push({ t: d, done: true });
    }
  }
  return obs;
}
async function getStageStats(hs, { now: now2 = Date.now(), force = false } = {}) {
  const maxAge = HUBSPOT.statsCacheHours * 36e5;
  if (!force && statsCache && now2 - statsCache.at < maxAge) return statsCache.stats;
  const props = ["hs_pipeline_stage", "hs_v2_date_entered_current_stage", ...STEP_STAGES.flatMap((s) => [
    `hs_v2_cumulative_time_in_${s.id}`,
    `hs_v2_date_exited_${s.id}`
  ])];
  let records2 = [];
  try {
    records2 = await hs.searchAll(HUBSPOT.awardsObject, [{
      filters: [
        { propertyName: "hs_pipeline", operator: "EQ", value: HUBSPOT.sbiPipelineId },
        { propertyName: "hs_createdate", operator: "GTE", value: String(Date.parse(HUBSPOT.statsSince)) }
      ]
    }], props);
  } catch (err) {
    console.error("Stats query failed, using fallback medians:", err.message);
  }
  const stats = {};
  for (const s of STEP_STAGES) {
    const obs = stageObservations(records2, s.id, now2);
    const finished = obs.filter((o) => o.done).length;
    const waiting = obs.length - finished;
    let [p25, median, p75] = survivalQuantiles(obs);
    if (s.overrideMedianDays) {
      const m = s.overrideMedianDays;
      stats[s.id] = { p25: m * 0.6, median: m, p75: m * 1.5, sample: finished, waiting, source: "override" };
    } else if (finished >= MIN_SAMPLE && median !== null) {
      if (p75 === null) p75 = Math.max(median * 1.5, ...obs.map((o) => o.t));
      stats[s.id] = { p25: p25 ?? median * 0.6, median, p75, sample: finished, waiting, source: "live" };
    } else {
      const m = s.fallbackMedianDays;
      stats[s.id] = { p25: m * 0.6, median: m, p75: m * 1.5, sample: finished, waiting, source: "fallback" };
    }
  }
  statsCache = { at: now2, stats };
  return stats;
}
function roundDays(d) {
  return Math.max(1, Math.round(d));
}
function buildEstimate(award, stats, now2 = Date.now()) {
  const p = award.properties;
  const stage = stageById[p.hs_pipeline_stage];
  const enteredAt = p.hs_v2_date_entered_current_stage ? Date.parse(p.hs_v2_date_entered_current_stage) : null;
  const elapsedDays = enteredAt ? Math.max(0, (now2 - enteredAt) / DAY_MS2) : null;
  const waitingKey = p.waiting_for_action_from || stage?.defaultWaitingFor || null;
  const waiting = waitingKey ? { key: waitingKey, ...WAITING_FOR[waitingKey] } : null;
  const base = {
    awardName: publicAwardName(p.award___project_name),
    startedOn: p.hs_createdate ? String(p.hs_createdate).slice(0, 10) : null,
    // YYYY-MM-DD
    stage: stage ? { publicName: stage.publicName, description: stage.description, kind: stage.kind } : { publicName: "In progress", description: "", kind: "unknown" },
    steps: STEP_STAGES.map((s) => s.publicName),
    currentStepIndex: STEP_STAGES.findIndex((s) => s.id === p.hs_pipeline_stage),
    inStageSinceDays: elapsedDays === null ? null : Math.floor(elapsedDays),
    waitingFor: waiting,
    nextStep: null,
    completion: null,
    note: null
  };
  if (!stage || stage.kind !== "step") {
    if (stage?.kind === "closeout") base.currentStepIndex = STEP_STAGES.length;
    if (stage?.kind === "done") {
      base.currentStepIndex = STEP_STAGES.length;
      base.waitingFor = null;
    }
    if (stage?.kind === "closed") base.waitingFor = null;
    return base;
  }
  const st = stats[stage.id];
  const idx = base.currentStepIndex;
  const nextStage = STEP_STAGES[idx + 1];
  const e = elapsedDays ?? 0;
  if (e < st.p75) {
    const low = Math.max(0, st.p25 - e), high = st.p75 - e;
    base.nextStep = {
      name: nextStage ? nextStage.publicName : "Complete",
      lowDays: low < 1 ? 0 : roundDays(low),
      highDays: roundDays(high),
      typicalStageDays: roundDays(st.median)
    };
  } else {
    base.nextStep = {
      name: nextStage ? nextStage.publicName : "Complete",
      overdue: true,
      typicalStageDays: roundDays(st.median)
    };
    base.note = waitingKey === "Applicant" ? "This step is taking longer than usual. Please check what is needed from you, or contact us." : "This step is taking longer than usual. Please contact us if you have questions.";
  }
  const remainingThis = Math.max(st.median - e, e >= st.p75 ? 7 : 0);
  const later = STEP_STAGES.slice(idx + 1).reduce((sum, s) => sum + stats[s.id].median, 0);
  const totalDays = remainingThis + later;
  base.completion = {
    days: roundDays(totalDays),
    approxDate: new Date(now2 + totalDays * DAY_MS2).toISOString().slice(0, 7)
    // YYYY-MM
  };
  return base;
}
function publicAwardName(name) {
  if (!name) return "Your award";
  return name;
}
var SUFFIXES = /\b(llc|l\.l\.c|inc|incorporated|co|corp|corporation|company|ltd|limited|pllc|pc|the)\b/g;
function normalizeName(s) {
  return String(s || "").toLowerCase().replace(/&/g, " and ").replace(SUFFIXES, " ").replace(/[^a-z0-9]+/g, " ").trim();
}
function namesMatch(typed, candidates) {
  const t = normalizeName(typed);
  if (t.length < 2) return false;
  return candidates.some((c) => {
    const n = normalizeName(c);
    if (!n) return false;
    if (n === t) return true;
    const shorter = n.length < t.length ? n : t, longer = n.length < t.length ? t : n;
    return shorter.length >= 4 && ` ${longer} `.includes(` ${shorter} `);
  });
}
var AWARD_PROPS = [
  "hs_createdate",
  "award___project_name",
  "hs_pipeline",
  "hs_pipeline_stage",
  "hs_v2_date_entered_current_stage",
  "waiting_for_action_from"
];
async function lookupStatus(hs, { companyName, email }, now2 = Date.now()) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (normalizeName(companyName).length < 2 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) return { found: false };
  const contactIds = await hs.findContactsByEmail(cleanEmail);
  if (!contactIds.length) return { found: false };
  const awardIds = /* @__PURE__ */ new Set();
  for (const cid of contactIds) {
    for (const id of await hs.associatedIds("contacts", cid, HUBSPOT.awardsObject)) awardIds.add(id);
  }
  if (!awardIds.size) return { found: false };
  const awards = (await hs.batchRead(HUBSPOT.awardsObject, [...awardIds], AWARD_PROPS)).filter((a) => a.properties.hs_pipeline === HUBSPOT.sbiPipelineId);
  const matched = [];
  const matchedCompanyIds = /* @__PURE__ */ new Set();
  for (const a of awards) {
    const companyIds = await hs.associatedIds(HUBSPOT.awardsObject, a.id, "companies");
    const companies = await hs.batchRead("companies", companyIds, ["name"]);
    const names = companies.map((c) => c.properties.name);
    const awardPrefix = (a.properties.award___project_name || "").split(" - ")[0];
    if (!namesMatch(companyName, [...names, awardPrefix])) continue;
    matched.push(a);
    const byName = companies.filter((c) => namesMatch(companyName, [c.properties.name]));
    for (const c of byName.length ? byName : companies) matchedCompanyIds.add(String(c.id));
  }
  if (!matched.length) return { found: false };
  try {
    const have = new Set(matched.map((a) => String(a.id)));
    const extraIds = /* @__PURE__ */ new Set();
    for (const cid of matchedCompanyIds) {
      for (const id of await hs.associatedIds("companies", cid, HUBSPOT.awardsObject)) {
        if (!have.has(String(id))) extraIds.add(String(id));
      }
    }
    const extra = (await hs.batchRead(HUBSPOT.awardsObject, [...extraIds], AWARD_PROPS)).filter((a) => a.properties.hs_pipeline === HUBSPOT.sbiPipelineId);
    matched.push(...extra);
  } catch (err) {
    console.error("Company awards not loaded:", err.message);
  }
  const stats = await getStageStats(hs, { now: now2 });
  const created = (a) => Date.parse(a.properties.hs_createdate) || 0;
  matched.sort((a, b) => created(b) - created(a));
  const company = await companyOverview(hs, [...matchedCompanyIds], now2).catch((err) => {
    console.error("Company overview failed:", err.message);
    return null;
  });
  return { found: true, contact: CONTACT, company, awards: matched.map((a) => buildEstimate(a, stats, now2)) };
}

// lib/handler.mjs
var WINDOW_MS = 15 * 6e4;
var MAX_ATTEMPTS = 10;
var attempts = /* @__PURE__ */ new Map();
function limited(ip, now2) {
  const list = (attempts.get(ip) || []).filter((t) => now2 - t < WINDOW_MS);
  list.push(now2);
  attempts.set(ip, list);
  return list.length > MAX_ATTEMPTS;
}
async function handleStatusRequest({ method, body, ip, hs, now: now2 = Date.now() }) {
  if (method !== "POST") return { status: 405, body: { error: "Use POST" } };
  if (limited(ip || "unknown", now2)) {
    return { status: 429, body: { error: "Too many lookups. Please wait 15 minutes and try again." } };
  }
  let input;
  try {
    input = typeof body === "string" ? JSON.parse(body) : body;
  } catch {
    return { status: 400, body: { error: "Invalid request" } };
  }
  try {
    const result = await lookupStatus(hs, {
      companyName: String(input?.companyName || "").slice(0, 200),
      email: String(input?.email || "").slice(0, 200)
    }, now2);
    return { status: 200, body: result.found ? result : { found: false, contact: CONTACT } };
  } catch (err) {
    console.error(err);
    return { status: 502, body: { error: "We could not reach our records right now. Please try again later." } };
  }
}

// netlify/functions/status.mjs
export default async (req, context) => {
  const hs = process.env.DEMO_MODE === "true" ? createMockHubSpot() : createHubSpot({ token: process.env.HUBSPOT_TOKEN });
  const { status, body } = await handleStatusRequest({
    method: req.method,
    body: await req.text(),
    ip: context.ip,
    hs
  });
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
};
export const config = { path: "/api/status" };
