#!/usr/bin/env node
// Supabase keep-alive — pings every project so free-tier ones don't auto-pause
// after ~7 days of inactivity. Harmless: a tiny read that reaches the project's
// API gateway (which is what counts as "activity"). Run on a schedule every
// ~3 days (GitHub Actions / VPS cron / Windows Task Scheduler).
//
//   node keepalive.mjs
//
// Config: projects.json — an array of { name, url, key?, table? }.
//   url    : https://<ref>.supabase.co
//   key    : anon / publishable key (PUBLIC by design — safe to commit).
//   table  : optional table for the read; omit to hit the REST root.
//
// Success = the request reached the project's gateway (HTTP 200 is ideal; 401
// still counts as a real request → activity). Only DNS/timeout (status 0) is a
// true failure. NOTE: this PREVENTS pausing; it cannot REVIVE an already-paused
// project — restore those once from the dashboard, then keep-alive maintains them.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const TIMEOUT_MS = 15000;

async function ping(url, headers = {}) {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    await res.arrayBuffer().catch(() => {}); // drain so the socket closes cleanly
    return { status: res.status };
  } catch (e) {
    return { status: 0, error: e?.name === 'TimeoutError' ? 'timeout' : String(e?.message || e) };
  }
}

async function keepAlive(p) {
  const base = p.url.replace(/\/+$/, '');
  // 1) DB-touching read through PostgREST (the strongest activity signal).
  if (p.key && !/TODO|REPLACE/i.test(p.key)) {
    const path = p.table ? `/rest/v1/${p.table}?select=*&limit=1` : '/rest/v1/';
    const r = await ping(base + path, { apikey: p.key });
    if (r.status > 0) return { ...p, method: p.table ? `rest:${p.table}` : 'rest:root', ...r };
  }
  // 2) Keyless fallback — auth health endpoint (still a real gateway request).
  const r = await ping(base + '/auth/v1/health');
  return { ...p, method: 'auth:health', ...r };
}

const cfg = JSON.parse(await readFile(join(HERE, 'projects.json'), 'utf8'));
const projects = (Array.isArray(cfg) ? cfg : cfg.projects || []).filter(
  (p) => p && p.url && !/TODO|REPLACE/i.test(p.url),
);

if (!projects.length) {
  console.error('No usable projects in projects.json — fill in url + key first.');
  process.exit(1);
}

async function runOnce() {
  const stamp = new Date().toISOString();
  console.log(`[${stamp}] keep-alive: pinging ${projects.length} project(s)`);
  let failed = 0;
  for (const p of projects) {
    const r = await keepAlive(p); // sequential — avoids Windows libuv teardown crash
    const ok = r.status > 0;
    if (!ok) failed++;
    console.log(
      `  ${ok ? 'OK ' : 'FAIL'} ${String(r.name || r.url).padEnd(16)} ${String(r.status).padEnd(4)} ${r.method}${r.error ? '  ' + r.error : ''}`,
    );
  }
  console.log(`[${stamp}] done — ${projects.length - failed} ok, ${failed} failed`);
  return failed;
}

// Loop mode (for Coolify / any always-on container): ping, then sleep and
// repeat forever. Enable with --loop or KEEPALIVE_LOOP=1. Interval defaults to
// 72h; override with KEEPALIVE_INTERVAL_HOURS.
const LOOP = process.argv.includes('--loop') || /^(1|true|yes)$/i.test(process.env.KEEPALIVE_LOOP || '');
if (LOOP) {
  const hours = Number(process.env.KEEPALIVE_INTERVAL_HOURS) || 72;
  const ms = Math.max(1, hours) * 3600 * 1000;
  console.log(`keep-alive daemon: every ${hours}h`);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try { await runOnce(); } catch (e) { console.error('run error:', e); }
    await new Promise((r) => setTimeout(r, ms));
  }
} else {
  process.exit((await runOnce()) ? 1 : 0);
}
