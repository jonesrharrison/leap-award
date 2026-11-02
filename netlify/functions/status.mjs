// LEAP Award Status Check: back end (single file).
// Settings you may want to change (contact email, step names, wording) are in the
// "config" section near the top of this file. Search for: CONTACT

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
var companies = {
  co1: { name: "Riverbend Bakery LLC" },
  co2: { name: "Sparrow Labs, Inc." },
  co3: { name: "Northside Makers" },
  co9: { name: "Other Pipeline Co" }
};
var awards = {
  a1: { award___project_name: "Riverbend Bakery - CBAF1", hs_pipeline: P, hs_pipeline_stage: "1062678059", hs_v2_date_entered_current_stage: ago(12), waiting_for_action_from: "LEAP" },
  a2: { award___project_name: "Sparrow Labs - CBAF1", hs_pipeline: P, hs_pipeline_stage: "1054217605", hs_v2_date_entered_current_stage: ago(90) },
  a3: { award___project_name: "Sparrow Labs - CBAF2", hs_pipeline: P, hs_pipeline_stage: "1009066058", hs_v2_date_entered_current_stage: ago(21), waiting_for_action_from: "Applicant" },
  a4: { award___project_name: "Northside Makers - CBAF1", hs_pipeline: P, hs_pipeline_stage: "1143420187", hs_v2_date_entered_current_stage: ago(30), waiting_for_action_from: "LEAP" },
  a9: { award___project_name: "Other Pipeline - X", hs_pipeline: "696371739", hs_pipeline_stage: "1018250038" }
};
function createMockHubSpot() {
  return {
    async findContactsByEmail(email) {
      return contacts[email] || [];
    },
    async associatedIds(from, id, to) {
      if (from === "contacts") return contactAwards[id] || [];
      if (to === "companies") return awardCompanies[id] || [];
      return [];
    },
    async batchRead(type, ids) {
      const src = type === "companies" ? companies : awards;
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
  // Only records created after the April 2025 Salesforce import have
  // trustworthy stage timing. Estimates are built from records on/after this date.
  statsSince: "2025-07-01",
  // How long to reuse computed stage statistics before re-reading HubSpot.
  statsCacheHours: 12
};
var CONTACT = {
  name: "the LEAP Small Business team",
  email: "smallbusiness@purelansing.com"
  // TODO: confirm the public inbox
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
    fallbackMedianDays: 25
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
var MIN_SAMPLE = 8;

// lib/status.mjs
var DAY_MS = 864e5;
var STEP_STAGES = STAGES.filter((s) => s.kind === "step");
var stageById = Object.fromEntries(STAGES.map((s) => [s.id, s]));
var statsCache = null;
function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
async function getStageStats(hs, { now: now2 = Date.now(), force = false } = {}) {
  const maxAge = HUBSPOT.statsCacheHours * 36e5;
  if (!force && statsCache && now2 - statsCache.at < maxAge) return statsCache.stats;
  const props = STEP_STAGES.flatMap((s) => [
    `hs_v2_cumulative_time_in_${s.id}`,
    `hs_v2_date_exited_${s.id}`
  ]);
  let records = [];
  try {
    records = await hs.searchAll(HUBSPOT.awardsObject, [{
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
    const days = records.filter((r) => r.properties[`hs_v2_date_exited_${s.id}`]).map((r) => Number(r.properties[`hs_v2_cumulative_time_in_${s.id}`]) / DAY_MS).filter((d) => Number.isFinite(d) && d > 0.01).sort((a, b) => a - b);
    if (days.length >= MIN_SAMPLE) {
      stats[s.id] = {
        p25: quantile(days, 0.25),
        median: quantile(days, 0.5),
        p75: quantile(days, 0.75),
        sample: days.length,
        source: "live"
      };
    } else {
      const m = s.fallbackMedianDays;
      stats[s.id] = { p25: m * 0.6, median: m, p75: m * 1.5, sample: days.length, source: "fallback" };
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
  const elapsedDays = enteredAt ? Math.max(0, (now2 - enteredAt) / DAY_MS) : null;
  const waitingKey = p.waiting_for_action_from || stage?.defaultWaitingFor || null;
  const waiting = waitingKey ? { key: waitingKey, ...WAITING_FOR[waitingKey] } : null;
  const base = {
    awardName: publicAwardName(p.award___project_name),
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
    approxDate: new Date(now2 + totalDays * DAY_MS).toISOString().slice(0, 7)
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
  const awards2 = (await hs.batchRead(HUBSPOT.awardsObject, [...awardIds], AWARD_PROPS)).filter((a) => a.properties.hs_pipeline === HUBSPOT.sbiPipelineId);
  const matched = [];
  for (const a of awards2) {
    const companyIds = await hs.associatedIds(HUBSPOT.awardsObject, a.id, "companies");
    const companies2 = await hs.batchRead("companies", companyIds, ["name"]);
    const names = companies2.map((c) => c.properties.name);
    const awardPrefix = (a.properties.award___project_name || "").split(" - ")[0];
    if (namesMatch(companyName, [...names, awardPrefix])) matched.push(a);
  }
  if (!matched.length) return { found: false };
  const stats = await getStageStats(hs, { now: now2 });
  return { found: true, contact: CONTACT, awards: matched.map((a) => buildEstimate(a, stats, now2)) };
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
