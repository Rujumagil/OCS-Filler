const DEFAULT_SHEET_ID = "1eEOZqf5PjoY9QRqDaXmPN3OGPzmUpPUgQ7eSYHdTHyI";
const GOOGLE_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
let googleTokenCache = null;

const enc = new TextEncoder();
const dec = new TextDecoder();

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function base64Url(bytes) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function base64UrlText(text) {
  return base64Url(enc.encode(text));
}

function decodeBase64Url(input) {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - input.length % 4) % 4);
  const binary = atob(base64);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

async function hmac(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(value)));
}

async function createSession(env, name) {
  const now = Math.floor(Date.now() / 1000);
  const payload = base64UrlText(JSON.stringify({ name, iat: now, exp: now + 12 * 60 * 60 }));
  const sig = base64Url(await hmac(env.SESSION_SECRET, payload));
  return payload + "." + sig;
}

async function verifySession(env, request) {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const [payload, signature] = token.split(".");
  if (!payload || !signature || !env.SESSION_SECRET) return null;

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(env.SESSION_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const ok = await crypto.subtle.verify("HMAC", key, decodeBase64Url(signature), enc.encode(payload));
    if (!ok) return null;
    const data = JSON.parse(dec.decode(decodeBase64Url(payload)));
    if (!data.exp || data.exp < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch {
    return null;
  }
}

function pemToBuffer(pem) {
  const cleaned = String(pem || "")
    .replace(/\\n/g, "\n")
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");
  const binary = atob(cleaned);
  return Uint8Array.from(binary, c => c.charCodeAt(0)).buffer;
}

async function googleAccessToken(env) {
  if (googleTokenCache && googleTokenCache.expiresAt > Date.now() + 60000) {
    return googleTokenCache.token;
  }
  if (!env.GOOGLE_CLIENT_EMAIL || !env.GOOGLE_PRIVATE_KEY) {
    throw new Error("google_credentials_missing");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlText(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64UrlText(JSON.stringify({
    iss: env.GOOGLE_CLIENT_EMAIL,
    scope: GOOGLE_SCOPE,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  }));
  const unsigned = header + "." + claims;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToBuffer(env.GOOGLE_PRIVATE_KEY),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(unsigned)));
  const assertion = unsigned + "." + base64Url(signature);

  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error("google_auth_failed");

  googleTokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000
  };
  return data.access_token;
}

function sheetId(env) {
  return env.GOOGLE_SHEET_ID || DEFAULT_SHEET_ID;
}

async function sheetsFetch(env, path, init = {}) {
  const token = await googleAccessToken(env);
  const response = await fetch("https://sheets.googleapis.com/v4/spreadsheets/" + sheetId(env) + path, {
    ...init,
    headers: {
      authorization: "Bearer " + token,
      "content-type": "application/json",
      ...(init.headers || {})
    }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    console.error("Sheets error", response.status, data);
    throw new Error("google_sheets_failed");
  }
  return data;
}

async function getRange(env, range) {
  const path = "/values/" + encodeURIComponent(range) + "?valueRenderOption=UNFORMATTED_VALUE";
  const data = await sheetsFetch(env, path);
  return data.values || [];
}

async function updateRange(env, range, values) {
  return sheetsFetch(
    env,
    "/values/" + encodeURIComponent(range) + "?valueInputOption=USER_ENTERED",
    { method: "PUT", body: JSON.stringify({ range, majorDimension: "ROWS", values }) }
  );
}

async function batchUpdateRanges(env, data) {
  return sheetsFetch(env, "/values:batchUpdate", {
    method: "POST",
    body: JSON.stringify({ valueInputOption: "USER_ENTERED", data })
  });
}

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function inventoryItem(row) {
  const min = number(row[4]);
  const max = number(row[5]);
  const stock = number(row[10]);
  let status = "OK";
  if (min > 0 && stock <= min) status = "PEDIR";
  else if (min > 0 && stock <= min * 1.25) status = "POR ACABARSE";
  else if (max > 0 && stock > max) status = "SOBRESTOCK";

  return {
    code: String(row[0] || ""),
    name: String(row[1] || ""),
    family: String(row[2] || ""),
    unit: String(row[3] || ""),
    min,
    max,
    initial: number(row[6]),
    entries: number(row[7]),
    exits: number(row[8]),
    waste: number(row[9]),
    stock,
    status,
    suggested: max > 0 ? Math.max(max - stock, 0) : 0
  };
}

async function loadInventory(env) {
  const rows = await getRange(env, "Inventario!A4:N1000");
  return rows.filter(r => r[0] && r[1]).map(inventoryItem);
}

function stats(items) {
  return {
    products: items.length,
    needOrder: items.filter(i => i.min > 0 && i.stock <= i.min).length,
    low: items.filter(i => i.min > 0 && i.stock > i.min && i.stock <= i.min * 1.25).length,
    overstock: items.filter(i => i.max > 0 && i.stock > i.max).length,
    zero: items.filter(i => i.stock === 0).length
  };
}

function mxDateTime() {
  const parts = new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Mexico_City",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return map.day + "/" + map.month + "/" + map.year + " " + map.hour + ":" + map.minute + ":" + map.second;
}

function folio(prefix) {
  const d = new Date();
  const stamp = d.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  return prefix + "-" + stamp + "-" + crypto.randomUUID().slice(0, 4).toUpperCase();
}

async function firstBlankRow(env, range, startRow, limit) {
  const values = await getRange(env, range);
  for (let i = 0; i < limit; i++) {
    if (!values[i] || values[i][0] === "" || values[i][0] == null) return startRow + i;
  }
  throw new Error("movement_capacity_reached");
}

async function recordSurtido(env, item, type, qty, reason, responsible) {
  const row = await firstBlankRow(env, "Surtido Almacén!B21:B2020", 21, 2000);
  const code = item.code;
  const id = folio(type === "Entrada" ? "ENT" : "SAL");
  await batchUpdateRanges(env, [
    { range: "Surtido Almacén!A" + row + ":B" + row, values: [[mxDateTime(), code]] },
    { range: "Surtido Almacén!G" + row + ":J" + row, values: [[type, qty, reason || "", responsible || ""]] }
  ]);
  return { row, folio: id };
}

async function recordWaste(env, item, qty, reason, responsible) {
  const row = await firstBlankRow(env, "Mermas!C4:C2003", 4, 2000);
  const id = folio("MER");
  await updateRange(env, "Mermas!A" + row + ":J" + row, [[
    mxDateTime(),
    id,
    item.code,
    item.name,
    item.family,
    qty,
    item.unit,
    reason || "Merma",
    "",
    responsible || ""
  ]]);
  return { row, folio: id };
}

async function recordCount(env, item, counted, difference, responsible, notes, movement, adjustment) {
  const row = await firstBlankRow(env, "Conteos!B4:B1999", 4, 1996);
  await updateRange(env, "Conteos!A" + row + ":L" + row, [[
    mxDateTime(),
    item.code,
    item.name,
    item.family,
    item.unit,
    item.stock,
    counted,
    difference,
    movement,
    adjustment,
    responsible || "",
    notes || ""
  ]]);
}

function parseDate(value) {
  if (typeof value === "number") return value;
  const s = String(value || "");
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)).getTime();
  const p = Date.parse(s);
  return Number.isFinite(p) ? p : 0;
}

async function loadHistory(env) {
  const [moves, waste] = await Promise.all([
    getRange(env, "Surtido Almacén!A21:M2020"),
    getRange(env, "Mermas!A4:J2003")
  ]);

  const a = moves
    .map((r, i) => ({
      date: r[0] || "",
      folio: r[10] || "",
      code: r[1] || "",
      name: r[2] || "",
      type: r[6] || "",
      quantity: number(r[7]),
      unit: r[4] || "",
      reason: r[8] || "",
      responsible: r[9] || "",
      _row: 21 + i
    }))
    .filter(x => x.code && x.quantity > 0 && (x.type === "Entrada" || x.type === "Salida"));

  const b = waste
    .map((r, i) => ({
      date: r[0] || "",
      folio: r[1] || "",
      code: r[2] || "",
      name: r[3] || "",
      type: "Merma",
      quantity: number(r[5]),
      unit: r[6] || "",
      reason: r[7] || "",
      responsible: r[9] || "",
      _row: 4 + i
    }))
    .filter(x => x.code && x.quantity > 0);

  return [...a, ...b]
    .sort((x, y) => parseDate(y.date) - parseDate(x.date) || y._row - x._row)
    .slice(0, 80)
    .map(({ _row, ...x }) => x);
}

async function readJson(request) {
  try { return await request.json(); } catch { return {}; }
}

async function handleApi(request, env, url) {
  if (url.pathname === "/api/health") {
    return json({
      ok: true,
      service: "ocs-filler-almacen",
      runtimeConfigured: Boolean(
        env.WAREHOUSE_PIN &&
        env.SESSION_SECRET &&
        env.GOOGLE_CLIENT_EMAIL &&
        env.GOOGLE_PRIVATE_KEY
      )
    });
  }

  if (url.pathname === "/api/login" && request.method === "POST") {
    const body = await readJson(request);
    const name = String(body.name || "").trim().slice(0, 80);
    const pin = String(body.pin || "").trim();
    if (!name) return json({ ok: false, error: "name_required" }, 400);
    if (!env.WAREHOUSE_PIN) {
      return json({ ok: false, error: "pin_not_configured" }, 500);
    }
    if (pin !== String(env.WAREHOUSE_PIN).trim()) {
      return json({ ok: false, error: "invalid_pin" }, 401);
    }
    if (!env.SESSION_SECRET) return json({ ok: false, error: "session_secret_missing" }, 500);
    return json({ ok: true, token: await createSession(env, name), user: { name } });
  }

  const session = await verifySession(env, request);
  if (!session) return json({ ok: false, error: "unauthorized" }, 401);

  if (url.pathname === "/api/inventory" && request.method === "GET") {
    const items = await loadInventory(env);
    return json({ ok: true, items, stats: stats(items), user: { name: session.name }, updatedAt: new Date().toISOString() });
  }

  if (url.pathname === "/api/history" && request.method === "GET") {
    return json({ ok: true, movements: await loadHistory(env) });
  }

  if (url.pathname === "/api/movement" && request.method === "POST") {
    const body = await readJson(request);
    const type = String(body.type || "");
    const code = String(body.code || "").trim();
    const qty = number(body.quantity);
    const reason = String(body.reason || "").trim().slice(0, 250);

    if (!["entry", "exit", "waste"].includes(type)) return json({ ok: false, error: "invalid_type" }, 400);
    if (!code || qty <= 0) return json({ ok: false, error: "invalid_movement" }, 400);

    const items = await loadInventory(env);
    const item = items.find(i => i.code === code);
    if (!item) return json({ ok: false, error: "item_not_found" }, 404);
    if ((type === "exit" || type === "waste") && qty > item.stock) {
      return json({ ok: false, error: "insufficient_stock", stock: item.stock, unit: item.unit }, 409);
    }

    if (type === "entry") await recordSurtido(env, item, "Entrada", qty, reason || "Entrada de almacén", session.name);
    if (type === "exit") await recordSurtido(env, item, "Salida", qty, reason || "Salida de almacén", session.name);
    if (type === "waste") await recordWaste(env, item, qty, reason || "Merma de almacén", session.name);

    const expected = type === "entry" ? item.stock + qty : item.stock - qty;
    return json({ ok: true, item: { ...item, stock: expected }, stockBefore: item.stock, stockAfter: expected });
  }

  if (url.pathname === "/api/count" && request.method === "POST") {
    const body = await readJson(request);
    const code = String(body.code || "").trim();
    const counted = number(body.counted);
    const notes = String(body.notes || "").trim().slice(0, 250);
    if (!code || counted < 0) return json({ ok: false, error: "invalid_count" }, 400);

    const items = await loadInventory(env);
    const item = items.find(i => i.code === code);
    if (!item) return json({ ok: false, error: "item_not_found" }, 404);

    const difference = Number((counted - item.stock).toFixed(3));
    let movement = "Sin ajuste";
    let adjustment = 0;

    if (difference > 0) {
      movement = "Entrada";
      adjustment = difference;
      await recordSurtido(env, item, "Entrada", adjustment, "Ajuste por conteo físico", session.name);
    } else if (difference < 0) {
      movement = "Salida";
      adjustment = Math.abs(difference);
      await recordSurtido(env, item, "Salida", adjustment, "Ajuste por conteo físico", session.name);
    }

    await recordCount(env, item, counted, difference, session.name, notes, movement, adjustment);
    return json({
      ok: true,
      systemStock: item.stock,
      counted,
      difference,
      movement,
      adjustment,
      stockAfter: counted
    });
  }

  return json({ ok: false, error: "not_found" }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith("/api/")) return await handleApi(request, env, url);
      return env.ASSETS.fetch(request);
    } catch (error) {
      console.error(error);
      return json({ ok: false, error: error?.message || "internal_error" }, 500);
    }
  }
};
