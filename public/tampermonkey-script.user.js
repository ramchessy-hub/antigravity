// ==UserScript==
// @name         StakeCruncher Ultimate Tracker + Remote Withdraw
// @namespace    http://tampermonkey.net/
// @version      9.1
// @description  All-in-one: DOM balance reading, API balance interception, countdown timer tracking, remote withdraw commands, auto-reload on "finish your flip", get-cooldowns integration. Install on every device.
// @downloadURL  https://ekjivkdpczvamcysmxlr.supabase.co/functions/v1/serve-script
// @updateURL    https://ekjivkdpczvamcysmxlr.supabase.co/functions/v1/serve-script
// @match        *://*.stakecruncher.com/*
// @match        *://stakecruncher.com/*
// @exclude      https://*.hcaptcha.com/*
// @exclude      https://hcaptcha.com/*
// @exclude      *://*.hcaptcha.com/*
// @exclude      *://hcaptcha.com/*
// @exclude      *://*.discord.com/*
// @exclude      *://discord.com/*
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      ekjivkdpczvamcysmxlr.supabase.co
// @run-at       document-start
// @noframes
// ==UserScript==

(function () {
    'use strict';

    // Only run in the top frame — iframes send balance 0 / "None" and overwrite real data
    if (window.top !== window.self) return;

    const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

    // ============================================================
    // CONFIG
    // ============================================================
    const SUPABASE_URL = 'https://ekjivkdpczvamcysmxlr.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVraml2a2RwY3p2YW1jeXNteGxyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0OTE4MzEsImV4cCI6MjEwNzA2NzgzMX0.SKez8C6cPipQyZ5NRQzPqAmBusxzQT2b20Ly03tCYkI';

    const SYNC_INTERVAL_MS = 5000;        // sync balance + cooldown every 5s
    const COMMAND_POLL_INTERVAL_MS = 10000; // poll for withdraw commands every 10s
    const DETECT_INTERVAL_MS = 2000;       // re-scan DOM for balance/timer every 2s
    const FLIP_CHECK_INTERVAL_MS = 3000;   // check for "finish your flip" every 3s
    const RELOAD_COOLDOWN_MS = 60000;      // never reload more than once a minute
    const STEP1_DELAY = 3000;              // wait before clicking withdraw button
    const STEP2_DELAY = 2000;              // wait between withdraw click and send click
    const MAX_TEXT_LEN = 80;               // ignore large container elements when scanning text
    const INITIAL_WAIT_MS = 6000;          // wait for page to load before first scan

    const FLIP_TRIGGERS = [/finish\s+your\s+flip/i, /flip\s+to\s+finish/i, /finish\s+to\s+flip/i];

    const UI_ID = 'scv9-panel';

    // ============================================================
    // DEVICE ID — robust persistence (localStorage → sessionStorage → cookie)
    // ============================================================
    function getOrCreateDeviceId() {
        const KEY = 'sc_device_id';
        const sanitize = v => String(v || '').replace(/[^a-z0-9]/gi, '').slice(0, 12);
        const persist = id => {
            try { localStorage.setItem(KEY, id); } catch (_) {}
            try { sessionStorage.setItem(KEY, id); } catch (_) {}
            try {
                const d = new Date(); d.setFullYear(d.getFullYear() + 1);
                document.cookie = `${KEY}=${id}; expires=${d.toUTCString()}; path=/; SameSite=Lax`;
            } catch (_) {}
        };

        try { const v = sanitize(localStorage.getItem(KEY)); if (v) return 'device-' + v; } catch (_) {}
        try {
            const v = sanitize(sessionStorage.getItem(KEY));
            if (v) { try { localStorage.setItem(KEY, v); } catch (_) {} return 'device-' + v; }
        } catch (_) {}
        try {
            const m = document.cookie.match(new RegExp('(?:^|; )' + KEY + '=([^;]+)'));
            if (m) { const v = sanitize(m[1]); if (v) { try { localStorage.setItem(KEY, v); } catch (_) {} return 'device-' + v; } }
        } catch (_) {}
        const fresh = Math.random().toString(36).slice(2, 10);
        persist(fresh);
        return 'device-' + fresh;
    }

    const DEVICE_ID = getOrCreateDeviceId();
    console.log('%c[SC v9.1] Device ID: %c' + DEVICE_ID,
        'color:#38bdf8;font-weight:bold', 'color:#4ade80;font-weight:bold;font-size:13px');

    // ============================================================
    // STATE
    // ============================================================
    const state = {
        lastSeenBalance: null,      // balance from API interception
        domBalance: null,           // balance from DOM scanning
        waitSeconds: null,          // seconds until next claim
        waitTimeText: null,         // raw countdown text
        isProcessing: false,        // true while running withdraw steps
        currentCommandId: null,     // active withdraw command ID
        apiSynced: false,           // true after first successful API 200
        isReloading: false,         // true while a reload is pending
    };

    let lastGoodBalance = 0;

    // ============================================================
    // DOM HELPERS
    // ============================================================

    // Returns the SHORTEST element whose text passes `test`.
    function findText(test, selector) {
        const els = document.querySelectorAll(selector || 'button, div, span, p, a, h1, h2, h3, h4, time, small, code, label');
        let best = null;
        for (const el of els) {
            if (el.id && el.id.startsWith('scv9-')) continue; // skip our own overlay
            const txt = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ');
            if (!txt || txt.length > MAX_TEXT_LEN) continue;
            if (!test(txt)) continue;
            if (!best || txt.length < best.length) best = { el, txt, length: txt.length };
        }
        return best;
    }

    function toNumber(str) {
        const n = parseFloat(String(str).replace(/[$,\s]/g, ''));
        return isNaN(n) ? null : n;
    }

    // Read balance from the DOM. Returns a number or null.
    // Tries multiple strategies so it works even if the page layout changes.
    function getDomBalance() {
        const numRegex = /^\$?\s?[\d,]+(\.\d{1,8})?$/;

        // 1) element that is only a decimal number, e.g. "$0.0123"
        const decimal = findText(t => numRegex.test(t) && t.includes('.'));
        if (decimal) {
            const n = toNumber(decimal.txt);
            if (n !== null && n >= 0) return n;
        }

        // 2) element that mentions "balance" and has a number
        const labeled = findText(t => /balance/i.test(t) && /\d/.test(t));
        if (labeled) {
            const m = labeled.txt.match(/\$?\s?([\d,]+(?:\.\d+)?)/);
            if (m) {
                const n = toNumber(m[1]);
                if (n !== null && n >= 0) return n;
            }
        }

        // 3) element that is only an integer
        const integer = findText(t => numRegex.test(t));
        if (integer) {
            const n = toNumber(integer.txt);
            if (n !== null && n >= 0) return n;
        }

        return null;
    }

    // Parse a countdown string into seconds.
    function parseWaitTextToSeconds(txt) {
        if (!txt) return null;
        const s = String(txt).trim();

        // H:MM:SS or MM:SS
        const m1 = s.match(/(\d{1,3}):(\d{2}):(\d{2})/);
        if (m1) return parseInt(m1[1], 10) * 3600 + parseInt(m1[2], 10) * 60 + parseInt(m1[3], 10);
        const m2 = s.match(/(\d{1,3}):(\d{2})/);
        if (m2) return parseInt(m2[1], 10) * 60 + parseInt(m2[2], 10);

        // 2h 5m 3s / 2 hours 5 minutes / 45s / 2h
        let total = 0; let hit = false;
        const h = s.match(/(\d+)\s*h(?:ours?|rs?)?\b/i);
        const mn = s.match(/(\d+)\s*m(?:in(?:ute)?s?)?\b/i);
        const sec = s.match(/(\d+)\s*s(?:ec(?:ond)?s?)?\b/i);
        if (h) { total += parseInt(h[1], 10) * 3600; hit = true; }
        if (mn) { total += parseInt(mn[1], 10) * 60; hit = true; }
        if (sec) { total += parseInt(sec[1], 10); hit = true; }
        return hit ? total : null;
    }

    // Detect cooldown / wait time from the page.
    // Priority: "Claim your drop" / "Ready" text → wait_seconds = 0
    //           "Next drip in HH:MM:SS" → parsed seconds
    //           Withdraw button present & enabled → wait_seconds = 0
    function detectWaitTime() {
        try {
            // Check for "claim your drop" / "ready" text
            const claim = findText(t => /claim\s+your\s+drop/i.test(t) || /^ready$/i.test(t) || /ready\s+now/i.test(t));
            if (claim) {
                state.waitTimeText = claim.txt;
                state.waitSeconds = 0;
                return;
            }

            // Check for "next drip in" countdown
            const drip = findText(t => /next\s+drip\s+in/i.test(t) && /\d/.test(t));
            if (drip) {
                const sec = parseWaitTextToSeconds(drip.txt);
                if (sec !== null && sec >= 0) {
                    state.waitTimeText = drip.txt;
                    state.waitSeconds = sec;
                    return;
                }
            }

            // Check for any countdown-like text near a withdraw/claim button
            const btn = getWithdrawBtn();
            if (btn) {
                const root = btn.closest('div, section, form, main') || document.body;
                const candidates = root.querySelectorAll('div, span, p, time, small, code, h1, h2, h3, h4');
                let bestText = null;
                let bestSeconds = -1;
                for (const el of candidates) {
                    if (el.id && el.id.startsWith('scv9-')) continue;
                    const txt = (el.innerText || el.textContent || '').trim();
                    if (!txt || txt.length > 24) continue;
                    if (/\d{1,3}:\d{2}(:\d{2})?/.test(txt) || /\d+\s*[hms]/i.test(txt)) {
                        const sec = parseWaitTextToSeconds(txt);
                        if (sec !== null && sec > bestSeconds && sec < 86400) {
                            bestSeconds = sec;
                            bestText = txt;
                        }
                    }
                }
                if (bestText !== null) {
                    state.waitTimeText = bestText;
                    state.waitSeconds = bestSeconds;
                    return;
                }

                // Button is present and enabled = ready to claim
                if (!btn.disabled) {
                    state.waitTimeText = 'Ready';
                    state.waitSeconds = 0;
                    return;
                }
            }

            // Check for "finish your flip" — long cooldown
            const flip = findText(t => /finish\s+(your\s+)?flip/i.test(t) || /flip\s+to\s+finish/i.test(t));
            if (flip) {
                state.waitTimeText = flip.txt;
                state.waitSeconds = 3 * 60 * 60; // 3 hours
                return;
            }

            // Check for "access restricted" network error
            const restricted = findText(t => /access\s+restricted\s+from\s+this\s+network/i.test(t));
            if (restricted) {
                state.waitTimeText = 'Access restricted from this network';
                state.waitSeconds = null;
                reportNetworkError(restricted.txt);
                return;
            }
        } catch (_) {}
    }

    // Scan DOM for balance + timer — called every DETECT_INTERVAL_MS
    function scanDOM() {
        if (state.isReloading) return;

        // Balance
        const found = getDomBalance();
        if (found !== null) {
            state.domBalance = found;
            lastGoodBalance = found;
        }

        // Wait time
        detectWaitTime();
    }

    // ============================================================
    // API INTERCEPTOR (captures balance from fetch/XHR responses)
    // ============================================================
    function isValidApiCall(url) {
        if (!url || typeof url !== 'string') return false;
        if (/\.(png|jpg|jpeg|svg|css|js|woff2?|ico|gif|webp|map)(\?|#|$)/i.test(url)) return false;
        if (/google-analytics|googletagmanager|sentry|cloudflare|hotjar|facebook|segment/i.test(url)) return false;
        if (url.includes('supabase.co')) return false;
        return true;
    }

    function extractBalance(body) {
        if (!body || typeof body !== 'object') return null;
        const candidates = [
            body.balance, body.amount, body.total, body.value,
            body.data?.balance, body.data?.amount, body.data?.total, body.data?.value,
            body.result?.balance, body.result?.amount, body.result?.total, body.result?.value,
        ];
        for (const c of candidates) {
            if (typeof c === 'number' && c >= 0) return c;
        }
        return null;
    }

    function recordApiSuccess(url, status) {
        if (!isValidApiCall(url)) return;
        if (status >= 200 && status < 300) {
            state.apiSynced = true;
        }
    }

    const origFetch = pageWindow.fetch;
    if (origFetch) {
        pageWindow.fetch = async function (...args) {
            const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
            try {
                const response = await origFetch.apply(this, args);
                if (response.ok && response.headers.get('content-type')?.includes('application/json')) {
                    try {
                        response.clone().json().then(b => {
                            const bal = extractBalance(b);
                            if (typeof bal === 'number' && bal >= 0) {
                                state.lastSeenBalance = bal;
                                lastGoodBalance = bal;
                            }
                        }).catch(() => { });
                    } catch (_) { }
                }
                recordApiSuccess(url, response.status);
                return response;
            } catch (err) { throw err; }
        };
    }

    const origOpen = pageWindow.XMLHttpRequest.prototype.open;
    pageWindow.XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        this._scv9Url = String(url);
        this.addEventListener('load', () => {
            recordApiSuccess(this._scv9Url, this.status);
            try {
                if (this.status >= 200 && this.status < 300) {
                    const ct = this.getResponseHeader('content-type') || '';
                    if (ct.includes('application/json')) {
                        const body = JSON.parse(this.responseText);
                        const bal = extractBalance(body);
                        if (typeof bal === 'number' && bal >= 0) {
                            state.lastSeenBalance = bal;
                            lastGoodBalance = bal;
                        }
                    }
                }
            } catch (_) { }
        });
        return origOpen.call(this, method, url, ...rest);
    };

    // ============================================================
    // CLICK HELPERS
    // ============================================================
    function triggerClick(btn) {
        if (!btn) return;
        ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(type =>
            btn.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: pageWindow }))
        );
    }

    function getWithdrawBtn() {
        return document.querySelector('button.faucet-withdraw-btn')
            || document.querySelector('button[class*="withdraw"]')
            || [...document.querySelectorAll('button')].find(b => {
                const t = (b.innerText || b.textContent || '').trim().toLowerCase();
                return t.includes('withdraw') && !t.includes('send');
            });
    }

    function getSendBtn() {
        return [...document.querySelectorAll('button')].find(b => {
            const t = (b.innerText || b.textContent || '').trim();
            return t.includes('Send') && t.includes('USDC');
        });
    }

    // ============================================================
    // WITHDRAW COMMAND FLOW (Step 1 → Step 2)
    // ============================================================
    function resetToIdle() {
        state.isProcessing = false;
        state.currentCommandId = null;
    }

    function runStep2(commandId) {
        setStatus('Step 2: Looking for Send...', '#f59e0b');
        const sendBtn = getSendBtn();
        if (sendBtn && !sendBtn.disabled) {
            triggerClick(sendBtn);
            setStatus('Done — withdraw complete', '#10b981');
            ackCommand(commandId, 'executed', 'Step 2 clicked');
            reportWithdrawComplete();
            setTimeout(() => { resetToIdle(); updateUI(); }, 4000);
            return;
        }
        let retries = 0;
        const timer = setInterval(() => {
            retries++;
            const btn = getSendBtn();
            if (btn && !btn.disabled) {
                clearInterval(timer);
                triggerClick(btn);
                setStatus('Done — withdraw complete', '#10b981');
                ackCommand(commandId, 'executed', 'Step 2 clicked after wait');
                reportWithdrawComplete();
                setTimeout(() => { resetToIdle(); updateUI(); }, 4000);
            } else if (retries >= 15) {
                clearInterval(timer);
                setStatus('Step 2: Send button not found', '#ef4444');
                ackCommand(commandId, 'failed', 'Send button not ready');
                resetToIdle();
                updateUI();
            }
        }, 500);
    }

    function runStep1(commandId, manual) {
        const btn = getWithdrawBtn();
        if (!btn || btn.disabled) {
            if (manual) setStatus('Withdraw button not ready', '#ef4444');
            if (commandId) ackCommand(commandId, 'failed', 'Withdraw button not ready');
            resetToIdle();
            return;
        }
        state.isProcessing = true;
        setStatus('Step 1: Clicking withdraw...', '#38bdf8');
        updateUI();
        setTimeout(() => {
            const now = getWithdrawBtn();
            if (now && !now.disabled) {
                triggerClick(now);
                setStatus('Step 1 done — waiting for Send...', '#a855f7');
                setTimeout(() => runStep2(commandId), STEP2_DELAY);
            } else {
                setStatus('Withdraw button disappeared', '#ef4444');
                if (commandId) ackCommand(commandId, 'failed', 'Withdraw button disappeared');
                resetToIdle();
                updateUI();
            }
        }, manual ? 200 : STEP1_DELAY);
    }

    // ============================================================
    // COMMAND POLLING (trigger-withdraw edge function)
    // ============================================================
    async function pollForCommands() {
        if (state.isProcessing || state.isReloading) return;
        try {
            const url = `${SUPABASE_URL}/functions/v1/trigger-withdraw?action=poll&device_id=${encodeURIComponent(DEVICE_ID)}`;
            const res = await fetch(url, {
                headers: {
                    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
                    'X-Device-Id': DEVICE_ID,
                },
            });
            if (!res.ok) return;
            const data = await res.json();
            if (data?.ok && data.command) {
                const cmd = data.command;
                state.currentCommandId = cmd.command_id;
                setStatus(`Command: ${String(cmd.command_id).slice(0, 8)}`, '#38bdf8');
                updateUI();
                await ackCommand(cmd.command_id, 'picked_up', 'Device picked up');
                runStep1(cmd.command_id, true);
            }
        } catch (_) { }
    }

    async function ackCommand(commandId, status, message) {
        if (!commandId) return;
        try {
            await fetch(`${SUPABASE_URL}/functions/v1/trigger-withdraw?action=ack`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
                    'Content-Type': 'application/json',
                    'X-Device-Id': DEVICE_ID,
                },
                body: JSON.stringify({ command_id: commandId, device_id: DEVICE_ID, status, message }),
            });
        } catch (_) { }
    }

    // Report withdraw completion to get-cooldowns (so it can clear the command)
    async function reportWithdrawComplete() {
        // Clear the API-intercepted balance so the next sync uses the DOM
        // reading (the API may still return the pre-withdrawal balance).
        state.lastSeenBalance = null;
        try {
            await fetch(`${SUPABASE_URL}/functions/v1/get-cooldowns`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ action: 'complete_withdraw', device_id: DEVICE_ID }),
            });
        } catch (_) { }
    }

    // Report network restriction
    async function reportNetworkError(message) {
        try {
            await fetch(`${SUPABASE_URL}/functions/v1/get-cooldowns`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    action: 'report_network_error',
                    device_id: DEVICE_ID,
                    error_message: message,
                }),
            });
        } catch (_) { }
    }

    // ============================================================
    // BALANCE + COOLDOWN SYNC (sync-device edge function)
    // ============================================================
    function getCurrentBalance() {
        // After a withdrawal the API can return a stale 0 while the DOM already
        // shows new earnings. Prefer the DOM value when the API balance is 0 but
        // the DOM sees a positive balance — balance only drops to 0 via
        // withdrawal, so a positive DOM reading is always more current.
        const api = state.lastSeenBalance;
        const dom = state.domBalance;
        if (api !== null && api !== undefined && api > 0) return api;
        if (dom !== null && dom !== undefined && dom > 0) return dom;
        if (api !== null && api !== undefined) return api;
        if (dom !== null && dom !== undefined) return dom;
        return lastGoodBalance;
    }

    async function syncBalanceToDashboard() {
        if (state.isReloading) return;

        // Re-scan right before sync for freshest data
        scanDOM();

        const balance = getCurrentBalance();
        if (balance === null || balance === undefined) return;

        try {
            await fetch(`${SUPABASE_URL}/functions/v1/sync-device`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
                    'Content-Type': 'application/json',
                    'X-Device-Id': DEVICE_ID,
                },
                body: JSON.stringify({
                    device_id: DEVICE_ID,
                    balance: balance,
                    wait_seconds: state.waitSeconds,
                    wait_time_text: state.waitTimeText,
                }),
            });
        } catch (_) { }
    }

    // ============================================================
    // FLIP DETECTION + AUTO-RELOAD
    // ============================================================
    function canReload() {
        try {
            const last = parseInt(sessionStorage.getItem('scv9_last_reload') || '0', 10);
            return Date.now() - last > RELOAD_COOLDOWN_MS;
        } catch (e) { return true; }
    }

    function triggerReload(reason) {
        if (state.isReloading || !canReload()) return;
        state.isReloading = true;
        try { sessionStorage.setItem('scv9_last_reload', String(Date.now())); } catch (e) { }
        setStatus(`Reloading: ${reason}`, '#ef4444');
        setTimeout(() => location.reload(), 3000);
    }

    function checkFlipMessage() {
        if (state.isReloading) return;
        const pageText = document.body ? document.body.innerText : '';
        for (const pattern of FLIP_TRIGGERS) {
            if (pattern.test(pageText)) {
                triggerReload('Finish your flip detected');
                return;
            }
        }
    }

    // ============================================================
    // UI OVERLAY
    // ============================================================
    let ui = {};
    const safeDeviceId = DEVICE_ID.replace(/[<>&"']/g, '');

    function createUI() {
        if (document.getElementById(UI_ID) || !document.body) return;

        const box = document.createElement('div');
        box.id = UI_ID;
        box.style.cssText = `
            position: fixed; top: 8px; left: 8px;
            background: rgba(15, 23, 42, 0.96); color: #e2e8f0;
            border: 1px solid #334155; border-radius: 8px; padding: 8px 10px;
            font-family: system-ui, sans-serif; font-size: 11px; line-height: 1.4;
            z-index: 2147483647; box-shadow: 0 4px 16px rgba(0,0,0,0.55);
            width: 240px; user-select: none;
        `;

        box.innerHTML = `
            <div style="display:flex; align-items:center; gap:5px; margin-bottom:4px;">
                <span id="scv9-dot" style="width:8px;height:8px;border-radius:50%;background:#64748b;display:inline-block;"></span>
                <strong style="color:#38bdf8;font-size:11px;">SC Tracker v9.1</strong>
                <span id="scv9-mode" style="margin-left:auto;font-size:9px;font-weight:700;color:#94a3b8;background:#1e293b;padding:1px 5px;border-radius:3px;">IDLE</span>
            </div>
            <div id="scv9-status" style="color:#94a3b8;font-size:10px;margin-bottom:4px;">Idle — waiting...</div>
            <div style="display:flex;gap:10px;font-size:9px;color:#64748b;margin-bottom:4px;">
                <span>API: <span id="scv9-api" style="color:#fbbf24;">wait</span></span>
                <span>Bal: <span id="scv9-bal" style="color:#4ade80;">—</span></span>
                <span>Timer: <span id="scv9-timer" style="color:#facc15;">—</span></span>
            </div>
            <div style="background:#0b1220;border:1px solid #1e293b;border-radius:4px;padding:5px 6px;margin-bottom:6px;">
                <div style="font-size:8px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px;">Device ID (click to copy)</div>
                <div id="scv9-device" style="
                    font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
                    font-size:12px;color:#4ade80;font-weight:700;letter-spacing:0.5px;
                    cursor:pointer;text-align:center;padding:2px 0;border-radius:2px;
                    transition:background 0.15s;
                ">${safeDeviceId}</div>
            </div>
            <div style="display:flex;gap:3px;">
                <button id="scv9-btn-sync" style="flex:1;background:#eab308;color:#000;font-weight:700;border:none;padding:4px;border-radius:3px;cursor:pointer;font-size:9px;">Sync Now</button>
                <button id="scv9-btn-step1" style="flex:1;background:#2563eb;color:#fff;border:none;padding:4px;border-radius:3px;cursor:pointer;font-size:9px;">Withdraw</button>
                <button id="scv9-btn-reset" style="flex:1;background:#475569;color:#fff;border:none;padding:4px;border-radius:3px;cursor:pointer;font-size:9px;">Reset</button>
            </div>
        `;

        document.body.appendChild(box);

        ui = {
            dot: box.querySelector('#scv9-dot'),
            mode: box.querySelector('#scv9-mode'),
            status: box.querySelector('#scv9-status'),
            api: box.querySelector('#scv9-api'),
            bal: box.querySelector('#scv9-bal'),
            timer: box.querySelector('#scv9-timer'),
            device: box.querySelector('#scv9-device'),
        };

        ui.device.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(DEVICE_ID);
            } catch (_) {
                const ta = document.createElement('textarea');
                ta.value = DEVICE_ID;
                document.body.appendChild(ta);
                ta.select();
                try { document.execCommand('copy'); } catch (_) { }
                document.body.removeChild(ta);
            }
            ui.device.textContent = 'Copied!';
            ui.device.style.color = '#fbbf24';
            setTimeout(() => { ui.device.textContent = safeDeviceId; ui.device.style.color = '#4ade80'; }, 1200);
        });

        box.querySelector('#scv9-btn-sync').addEventListener('click', () => {
            scanDOM();
            syncBalanceToDashboard();
            setStatus('Manual sync sent', '#10b981');
        });
        box.querySelector('#scv9-btn-step1').addEventListener('click', () => runStep1(null, true));
        box.querySelector('#scv9-btn-reset').addEventListener('click', () => {
            resetToIdle();
            setStatus('Reset to idle', '#60a5fa');
            updateUI();
        });
    }

    function ensureUI() {
        if (document.getElementById(UI_ID)) return;
        if (!document.body) return;
        createUI();
    }

    function setStatus(msg, color) {
        if (ui.status) { ui.status.textContent = msg; ui.status.style.color = color || '#94a3b8'; }
        if (ui.dot) ui.dot.style.background = color || '#64748b';
    }

    function updateUI() {
        if (!ui.api) return;
        if (state.isProcessing) {
            ui.mode.textContent = 'WORKING';
            ui.mode.style.color = '#38bdf8';
            ui.mode.style.background = '#0c4a6e';
        } else {
            ui.mode.textContent = 'IDLE';
            ui.mode.style.color = '#94a3b8';
            ui.mode.style.background = '#1e293b';
        }
        ui.api.textContent = state.apiSynced ? 'ok' : 'wait';
        ui.api.style.color = state.apiSynced ? '#4ade80' : '#fbbf24';

        const bal = getCurrentBalance();
        if (bal !== null && bal !== undefined) {
            ui.bal.textContent = bal >= 1 ? '$' + bal.toFixed(2) : '$' + bal.toFixed(4);
        }

        if (state.waitTimeText) {
            const t = state.waitTimeText.length > 12 ? state.waitTimeText.slice(0, 12) : state.waitTimeText;
            ui.timer.textContent = t;
        } else {
            ui.timer.textContent = '—';
        }
    }

    // ============================================================
    // MAIN LOOP + BOOT
    // ============================================================

    // Ensure UI exists as soon as body is available
    if (document.body) ensureUI();
    else {
        const obs = new MutationObserver(() => {
            if (document.body) { ensureUI(); obs.disconnect(); }
        });
        try { obs.observe(document.documentElement, { childList: true, subtree: true }); } catch (_) { }
    }

    // Start scanning after initial wait for page to render
    setTimeout(() => {
        scanDOM();
        syncBalanceToDashboard();
    }, INITIAL_WAIT_MS);

    // Continuous DOM scanning
    setInterval(() => {
        ensureUI();
        scanDOM();
        updateUI();
    }, DETECT_INTERVAL_MS);

    // Flip detection
    setInterval(checkFlipMessage, FLIP_CHECK_INTERVAL_MS);

    // Balance sync
    setInterval(syncBalanceToDashboard, SYNC_INTERVAL_MS);

    // Withdraw command polling
    setInterval(pollForCommands, COMMAND_POLL_INTERVAL_MS);

    console.log('%c[SC v9.1] Started — DOM scan every ' + DETECT_INTERVAL_MS + 'ms, sync every ' + SYNC_INTERVAL_MS + 'ms, command poll every ' + COMMAND_POLL_INTERVAL_MS + 'ms',
        'color:#4ade80;font-size:11px;');

})();
