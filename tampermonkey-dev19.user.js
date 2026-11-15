// ==UserScript==
// @name         StakeCruncher Balance & Cooldown Tracker - Dev 19
// @namespace    http://tampermonkey.net/
// @version      3.1
// @description  Tracks balance & remaining drip time to Supabase for Dev 19 (device-a9ho4dl) with auto-refresh error fallback.
// @match        *://*.stakecruncher.com/*
// @match        *://stakecruncher.com/*
// @exclude      https://*.hcaptcha.com/*
// @exclude      https://hcaptcha.com/*
// @exclude      *://*.hcaptcha.com/*
// @exclude      *://hcaptcha.com/*
// @exclude      *://*.discord.com/*
// @exclude      *://discord.com/*
// @grant        GM_xmlhttpRequest
// @connect      ekjivkdpczvamcysmxlr.supabase.co
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function () {
    'use strict';

    // Only run in the top page (iframes were sending balance 0 / "None" and overwriting real data)
    if (window.top !== window.self) return;
    if (!location.hostname.includes('stakecruncher.com') || location.hostname.includes('hcaptcha.com')) return;

    const API = "https://ekjivkdpczvamcysmxlr.supabase.co/functions/v1/sync-device";
    const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVraml2a2RwY3p2YW1jeXNteGxyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0OTE4MzEsImV4cCI6MjEwNzA2NzgzMX0.SKez8C6cPipQyZ5NRQzPqAmBusxzQT2b20Ly03tCYkI";
    const TOKEN = "f9b3e7a2d8c14f5e9a6b2c8d4e1f7a3b";
    const INJECTED_DEVICE_ID = "device-a9ho4dl";

    const SYNC_INTERVAL_MS = 5000;
    const INITIAL_WAIT_MS = 8000;
    const FLIP_CHECK_INTERVAL_MS = 2000;
    const RELOAD_COOLDOWN_MS = 60000; // never reload more than once a minute
    const MAX_TEXT_LEN = 80;          // ignore big container elements when searching text

    const FLIP_TRIGGERS = [/finish your flip/i];

    let isReloading = false;
    let lastGoodBalance = 0;

    // ---------- UI overlay ----------
    function updateUI(id, msg, color, slot) {
        if (!document.body) return;
        let el = document.getElementById(id);
        if (!el) {
            el = document.createElement('div');
            el.id = id;
            el.style.cssText =
                'position:fixed;left:8px;background:rgba(0,0,0,0.85);padding:4px 8px;' +
                'font-size:10px;border-radius:4px;z-index:999999;pointer-events:none;max-width:90vw;';
            el.style.bottom = (8 + (slot || 0) * 24) + 'px';
            document.body.appendChild(el);
        }
        el.textContent = msg;
        el.style.color = color || '#fff';
    }

    // ---------- Reload logic (with loop protection) ----------
    function canReload() {
        try {
            const last = parseInt(sessionStorage.getItem('tm_last_reload') || '0', 10);
            return Date.now() - last > RELOAD_COOLDOWN_MS;
        } catch (e) {
            return true;
        }
    }

    function triggerReload(reason) {
        if (isReloading || !canReload()) return;
        isReloading = true;
        try { sessionStorage.setItem('tm_last_reload', String(Date.now())); } catch (e) {}
        updateUI('tm-error', `⚠️ ${reason} - Reloading in 3s...`, '#ef4444', 1);
        setTimeout(() => location.reload(), 3000);
    }

    function checkFlipMessage() {
        if (isReloading) return;
        const pageText = document.body ? document.body.innerText : '';
        for (const pattern of FLIP_TRIGGERS) {
            if (pattern.test(pageText)) {
                triggerReload('Finish your flip detected');
                return;
            }
        }
    }

    // ---------- DOM helpers ----------
    // Returns the SHORTEST element whose text passes `test`.
    // (Old version returned the first match = a giant parent container with the whole page's text.)
    function findText(test, selector) {
        const els = document.querySelectorAll(selector || 'button, div, span, p, a, h1, h2, h3');
        let best = null;
        for (const el of els) {
            if (el.id && el.id.startsWith('tm-')) continue; // skip our own overlay
            const txt = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ');
            if (!txt || txt.length > MAX_TEXT_LEN) continue;
            if (!test(txt)) continue;
            if (!best || txt.length < best.length) best = { el, txt, length: txt.length };
        }
        return best;
    }

    function parseDripSeconds(text) {
        if (!text) return null;

        // h:mm:ss  or  mm:ss (e.g. 167:53)
        const clock = text.match(/(\d+):(\d{2})(?::(\d{2}))?/);
        if (clock) {
            if (clock[3] !== undefined) {
                return parseInt(clock[1], 10) * 3600 + parseInt(clock[2], 10) * 60 + parseInt(clock[3], 10);
            }
            return parseInt(clock[1], 10) * 60 + parseInt(clock[2], 10);
        }

        // 2h 5m 3s  /  2 hours 5 minutes
        let total = 0;
        let matched = false;
        const h = text.match(/(\d+)\s*h(?:ours?|rs?)?\b/i);
        const m = text.match(/(\d+)\s*m(?:in(?:ute)?s?)?\b/i);
        const s = text.match(/(\d+)\s*s(?:ec(?:ond)?s?)?\b/i);
        if (h) { total += parseInt(h[1], 10) * 3600; matched = true; }
        if (m) { total += parseInt(m[1], 10) * 60; matched = true; }
        if (s) { total += parseInt(s[1], 10); matched = true; }
        return matched ? total : null;
    }

    function getDripInfo() {
        const drip = findText(t => /next\s+drip\s+in/i.test(t) && /\d/.test(t));
        if (drip) {
            const seconds = parseDripSeconds(drip.txt);
            if (seconds !== null) {
                return { text: drip.txt, wait_seconds: seconds };
            }
        }

        const claim = findText(t => /claim\s+your\s+drop/i.test(t) || /^ready(?:\s+to\s+claim)?$/i.test(t) || /ready\s+now/i.test(t));
        if (claim) {
            return { text: "Ready to claim", wait_seconds: 0 };
        }

        return { text: "Ready to claim", wait_seconds: 0 };
    }

    function toNumber(str) {
        const n = parseFloat(str.replace(/[$,\s]/g, ''));
        return isNaN(n) ? null : n;
    }

    // Returns a number, or null if nothing found (so we never overwrite a good balance with 0)
    function getBalance() {
        const numRegex = /^\$?\s?[\d,]+(\.\d{1,8})?$/;

        // 1) element that is only a decimal number, e.g. "$0.0123"
        const decimal = findText(t => numRegex.test(t) && t.includes('.'));
        if (decimal) return toNumber(decimal.txt);

        // 2) element that mentions "balance" and has a number, e.g. "Balance: $0.05"
        const labeled = findText(t => /balance/i.test(t) && /\d/.test(t));
        if (labeled) {
            const m = labeled.txt.match(/\$?\s?([\d,]+(?:\.\d+)?)/);
            if (m) return toNumber(m[1]);
        }

        // 3) element that is only an integer
        const integer = findText(t => numRegex.test(t));
        if (integer) return toNumber(integer.txt);

        return null;
    }

    function getDeviceId() {
        if (INJECTED_DEVICE_ID && INJECTED_DEVICE_ID.startsWith('device-')) {
            return INJECTED_DEVICE_ID;
        }
        const keys = ['sc_device_id', 'device_id', 'deviceId', 'faucet_device_id', 'vm_device_id'];
        for (const k of keys) {
            const v = localStorage.getItem(k);
            if (v && v.trim()) return v.trim().toLowerCase();
        }
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.toLowerCase().includes('device')) {
                const v = localStorage.getItem(k);
                if (v && v.length < 60) return v.trim().toLowerCase();
            }
        }
        return INJECTED_DEVICE_ID || 'unknown';
    }

    // ---------- Sync ----------
    function syncState() {
        if (isReloading) return;

        const drip = getDripInfo();
        const found = getBalance();
        if (found !== null) lastGoodBalance = found;
        const bal = lastGoodBalance;
        const devId = getDeviceId();

        updateUI('tm-bal-sync', `[Tracker] ${devId} | Bal: $${bal.toFixed(4)} | Timer: ${drip.text}`, '#facc15', 0);

        GM_xmlhttpRequest({
            method: "POST",
            url: API,
            timeout: 15000,
            headers: {
                "Content-Type": "application/json",
                "apikey": SUPABASE_KEY,
                "Authorization": "Bearer " + SUPABASE_KEY,
                "X-Device-Token": TOKEN
            },
            data: JSON.stringify({
                device_id: devId,
                balance: bal,
                wait_time_text: drip.text,
                wait_seconds: drip.wait_seconds,
                url: location.href,
                timestamp: new Date().toISOString()
            }),
            onload: function (res) {
                if (res.status >= 200 && res.status < 300) {
                    updateUI('tm-bal-sync',
                        `[Tracker] Synced ${new Date().toLocaleTimeString()} | ${devId} | $${bal.toFixed(4)} | ${drip.text}`,
                        '#10b981', 0);
                } else {
                    const body = (res.responseText || '').slice(0, 80);
                    console.error('[Tracker] Sync failed', res.status, res.responseText);
                    updateUI('tm-bal-sync', `[Tracker] Sync Err ${res.status}: ${body}`, '#ef4444', 0);
                }
            },
            onerror: function (err) {
                console.error('[Tracker] Network error', err);
                updateUI('tm-bal-sync', '[Tracker] Network error (blocked by Tampermonkey/@connect or offline)', '#ef4444', 0);
            },
            ontimeout: function () {
                updateUI('tm-bal-sync', '[Tracker] Sync timeout', '#ef4444', 0);
            }
        });
    }

    function init() {
        updateUI('tm-bal-sync', '[Tracker] Dev 19 - Loaded, first sync in 8s...', '#facc15', 0);
        setInterval(checkFlipMessage, FLIP_CHECK_INTERVAL_MS);
        setTimeout(() => {
            syncState();
            setInterval(syncState, SYNC_INTERVAL_MS);
        }, INITIAL_WAIT_MS);
    }

    init();
})();
