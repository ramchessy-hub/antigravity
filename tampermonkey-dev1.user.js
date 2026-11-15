// ==UserScript==
// @name         StakeCruncher Balance & Cooldown Tracker - Dev 1
// @namespace    http://tampermonkey.net/
// @version      3.4
// @description  Tracks balance & remaining drip time with dual local telemetry and Supabase backup. Does not withdraw.
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
// @connect      127.0.0.1
// @connect      10.0.2.2
// @connect      *
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function () {
    'use strict';

    if (window.top !== window.self) return;
    if (!location.hostname.includes('stakecruncher.com') || location.hostname.includes('hcaptcha.com')) return;

    const API = "https://ekjivkdpczvamcysmxlr.supabase.co/functions/v1/sync-device";
    const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVraml2a2RwY3p2YW1jeXNteGxyIiwicm9sZSI6ImFub24iLCJYXQiOjE3OTE0OTE4MzEsImV4cCI6MjEwNzA2NzgzMX0.SKez8C6cPipQyZ5NRQzPqAmBusxzQT2b20Ly03tCYkI";
    const TOKEN = "f9b3e7a2d8c14f5e9a6b2c8d4e1f7a3b";
    const INJECTED_DEVICE_ID = "device-lk9e6b4";

    const SYNC_INTERVAL_MS = 4000;
    const INITIAL_WAIT_MS = 5000;
    const FLIP_CHECK_INTERVAL_MS = 2000;
    const RELOAD_COOLDOWN_MS = 60000;

    const FLIP_TRIGGERS = [/finish your flip/i];

    let isReloading = false;
    let lastGoodBalance = 0;

    function updateUI(id, msg, color, slot) {
        if (!document.body) return;
        let el = document.getElementById(id);
        if (!el) {
            el = document.createElement('div');
            el.id = id;
            el.style.cssText =
                'position:fixed;left:8px;background:rgba(0,0,0,0.85);padding:4px 8px;' +
                'font-size:10px;border-radius:4px;z-index:999999;pointer-events:none;' +
                'max-width:320px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;';
            el.style.bottom = (8 + (slot || 0) * 24) + 'px';
            document.body.appendChild(el);
        }
        el.textContent = msg;
        el.style.color = color || '#fff';
    }

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

    // ---------- DOM text helpers ----------
    function findText(test, selector) {
        const els = document.querySelectorAll(selector || 'button, div, span, p, a, h1, h2, h3, h4, time, small, code, label');
        let best = null;
        for (const el of els) {
            if (el.id && el.id.startsWith('tm-')) continue;
            const txt = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ');
            if (!txt || txt.length > 80) continue;
            if (!test(txt)) continue;
            if (!best || txt.length < best.length) best = { el, txt, length: txt.length };
        }
        return best;
    }

    function parseDripSeconds(text) {
        if (!text) return null;
        const clock = text.match(/(\d+):(\d{2})(?::(\d{2}))?/);
        if (clock) {
            if (clock[3] !== undefined) {
                return parseInt(clock[1], 10) * 3600 + parseInt(clock[2], 10) * 60 + parseInt(clock[3], 10);
            }
            return parseInt(clock[1], 10) * 60 + parseInt(clock[2], 10);
        }
        let total = 0;
        let hit = false;
        const h = text.match(/(\d+)\s*h(?:ours?|rs?)?\b/i);
        const m = text.match(/(\d+)\s*m(?:in(?:ute)?s?)?\b/i);
        const s = text.match(/(\d+)\s*s(?:ec(?:ond)?s?)?\b/i);
        if (h) { total += parseInt(h[1], 10) * 3600; hit = true; }
        if (m) { total += parseInt(m[1], 10) * 60; hit = true; }
        if (s) { total += parseInt(s[1], 10); hit = true; }
        return hit ? total : null;
    }

    function getDripInfo() {
        const pageText = document.body ? document.body.innerText : '';
        const match = pageText.match(/next\s*drip\s*in\s*([0-9:]+|\d+\s*[hms\s\w]+)/i);
        if (match) {
            const seconds = parseDripSeconds(match[1]);
            if (seconds !== null) {
                return { text: `Next drip in ${match[1].trim()}`, wait_seconds: seconds };
            }
        }

        if (/claim\s+your\s+drop|ready(?:\s+to\s+claim)?|ready\s+now/i.test(pageText)) {
            return { text: "Ready to claim", wait_seconds: 0 };
        }

        return { text: "Ready to claim", wait_seconds: 0 };
    }

    function toNumber(str) {
        const n = parseFloat(str.replace(/[$,\s]/g, ''));
        return isNaN(n) ? null : n;
    }

    function getBalance() {
        const numRegex = /^\$?\s?[\d,]+(\.\d{1,8})?$/;

        // 1) Shortest element that is only a decimal number, e.g. "$0.0123"
        const decimal = findText(t => numRegex.test(t) && t.includes('.'));
        if (decimal) {
            const val = toNumber(decimal.txt);
            if (val !== null && val >= 0) return val;
        }

        // 2) Element that mentions "balance" and has a number, e.g. "Balance: $0.05"
        const labeled = findText(t => /balance/i.test(t) && /\d/.test(t));
        if (labeled) {
            const m = labeled.txt.match(/\$?\s?([\d,]+(?:\.\d+)?)/);
            if (m) {
                const val = toNumber(m[1]);
                if (val !== null && val >= 0) return val;
            }
        }

        // 3) Shortest element that is only an integer
        const integer = findText(t => numRegex.test(t));
        if (integer) {
            const val = toNumber(integer.txt);
            if (val !== null && val >= 0) return val;
        }

        return null;
    }

    function getDeviceId() {
        if (INJECTED_DEVICE_ID && INJECTED_DEVICE_ID.startsWith('device-')) {
            return INJECTED_DEVICE_ID;
        }
        return "device-lk9e6b4";
    }

    // ---------- Sync ----------
    function syncState() {
        if (isReloading) return;

        const drip = getDripInfo();
        const found = getBalance();
        if (found !== null) lastGoodBalance = found;
        const bal = lastGoodBalance;
        const devId = getDeviceId();

        updateUI('tm-bal-sync', `[Tracker] ${devId} | Bal: ${bal.toFixed(4)} | ${drip.text}`, '#10b981', 0);
        console.log(`[SC_TM_SYNC] vm=1 dev=${devId} bal=${bal} cd=${drip.wait_seconds} text="${drip.text}"`);

        const localPayload = JSON.stringify({
            vm: 1,
            device_id: devId,
            balance: bal,
            wait_seconds: drip.wait_seconds,
            wait_text: drip.text,
            timestamp: Date.now()
        });

        try {
            GM_xmlhttpRequest({
                method: "POST",
                url: "http://127.0.0.1:18999/telemetry",
                timeout: 3000,
                headers: { "Content-Type": "application/json" },
                data: localPayload
            });
        } catch (e) {}

        try {
            GM_xmlhttpRequest({
                method: "POST",
                url: API,
                timeout: 10000,
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
                })
            });
        } catch (e) {}
    }

    function init() {
        updateUI('tm-bal-sync', '[Tracker] Dev 1 - Initializing...', '#facc15', 0);
        setInterval(checkFlipMessage, FLIP_CHECK_INTERVAL_MS);
        setTimeout(() => {
            syncState();
            setInterval(syncState, SYNC_INTERVAL_MS);
        }, INITIAL_WAIT_MS);
    }

    init();
})();
