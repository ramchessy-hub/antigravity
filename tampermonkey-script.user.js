// ==UserScript==
// @name         hCaptcha Challenge → Aggressive 1-40 Rotation (Cloud + Local Failover)
// @namespace    http://tampermonkey.net/
// @version      5.0
// @description  Aggressive 1-40 continuous rotation with instant redirect and local failover
// @author       You
// @match        *://stakecruncher.com/*
// @match        *://*.stakecruncher.com/*
// @match        *://accounts.hcaptcha.com/*
// @match        *://dashboard.hcaptcha.com/*
// @match        *://*.hcaptcha.com/*
// @connect      ekjivkdpczvamcysmxlr.supabase.co
// @grant        GM_xmlhttpRequest
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const SUPABASE_URL = 'https://ekjivkdpczvamcysmxlr.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3QiOiJzdXBhYmFzZSIsInJlZiI6ImVraml2a2RwY3p2YW1jeXNteGxyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0OTE4MzEsImV4cCI6MjEwNzA2NzgzMX0.SKez8C6cPipQyZ5NRQzPqAmBusxzQT2b20Ly03tCYkI';

    const FALLBACK_URLS = [
        { label: "URL_1",  url: "https://accounts.hcaptcha.com/verify_email/e1e7ee0a-d569-48ea-a826-dd0dda0d438a" },
        { label: "URL_2",  url: "https://accounts.hcaptcha.com/verify_email/fb44ffdf-d83c-4a43-892a-e5bb8bd54027" },
        { label: "URL_3",  url: "https://accounts.hcaptcha.com/verify_email/43361230-bf41-4ba9-9041-5f0d53056ae8" },
        { label: "URL_4",  url: "https://accounts.hcaptcha.com/verify_email/302f6237-c995-46ce-ae10-33e83be3baf0" },
        { label: "URL_5",  url: "https://accounts.hcaptcha.com/verify_email/cb076e26-7e02-4021-a008-e6a8b2375906" },
        { label: "URL_6",  url: "https://accounts.hcaptcha.com/verify_email/f64f66ba-ceaa-430d-951d-913ab2497fa9" },
        { label: "URL_7",  url: "https://accounts.hcaptcha.com/verify_email/9f50283e-d840-40b4-a675-82dd142921cc" },
        { label: "URL_8",  url: "https://accounts.hcaptcha.com/verify_email/401a44ac-d296-456f-9167-ed167fa7913d" },
        { label: "URL_9",  url: "https://accounts.hcaptcha.com/verify_email/14246df8-bba3-4d8a-9466-08e2d457bfd5" },
        { label: "URL_10", url: "https://accounts.hcaptcha.com/verify_email/6a533eb7-0dd9-583a-aa4e-f549f387761f" },
        { label: "URL_11", url: "https://accounts.hcaptcha.com/verify_email/3d52861f-1195-4df7-b370-184f5157b4c7" },
        { label: "URL_12", url: "https://accounts.hcaptcha.com/verify_email/c45951ab-5c2e-4c02-81ca-8a1cad9b290f" },
        { label: "URL_13", url: "https://accounts.hcaptcha.com/verify_email/d713d486-c973-4263-8892-d8285542a1a4" },
        { label: "URL_14", url: "https://accounts.hcaptcha.com/verify_email/63fd95b5-0851-4ef9-9c68-aab84627aeac" },
        { label: "URL_15", url: "https://accounts.hcaptcha.com/verify_email/0ac3f3e5-8e1a-4fbe-8df2-25a5a5428aa1" },
        { label: "URL_16", url: "https://accounts.hcaptcha.com/verify_email/8650b147-1ed8-46a8-9464-9179e9d088b4" },
        { label: "URL_17", url: "https://accounts.hcaptcha.com/verify_email/6adc58eb-0bc5-f526-040a-8df54193ba82" },
        { label: "URL_18", url: "https://accounts.hcaptcha.com/verify_email/ba244034-c494-4790-8d80-f35b57d6aa16" },
        { label: "URL_19", url: "https://accounts.hcaptcha.com/verify_email/f33c2027-21aa-442f-91dd-45006c593a67" },
        { label: "URL_20", url: "https://accounts.hcaptcha.com/verify_email/8e35bc66-3907-4c65-9e59-d44374508daf" },
        { label: "URL_21", url: "https://accounts.hcaptcha.com/verify_email/954250c0-ea58-4e66-aad4-9127e90eb160" },
        { label: "URL_22", url: "https://accounts.hcaptcha.com/verify_email/f1a4760f-8bf1-4e2e-928e-5576f9a232df" },
        { label: "URL_23", url: "https://accounts.hcaptcha.com/verify_email/1de3b9c0-6087-443b-9d7d-25159a2d6e79" },
        { label: "URL_24", url: "https://accounts.hcaptcha.com/verify_email/6af4f57b-3139-e3a8-e05e-2860d887aecd" },
        { label: "URL_25", url: "https://accounts.hcaptcha.com/verify_email/ac173a84-82ef-47e3-b4ca-f88d5e1df109" },
        { label: "URL_26", url: "https://accounts.hcaptcha.com/verify_email/9ec84a95-e41e-4960-b699-235250c589a3" },
        { label: "URL_27", url: "https://accounts.hcaptcha.com/verify_email/6af50e79-6101-02be-2f91-82241ed50883" },
        { label: "URL_28", url: "https://accounts.hcaptcha.com/verify_email/d7884703-ac06-4115-ae94-47c4af363b88" },
        { label: "URL_29", url: "https://accounts.hcaptcha.com/verify_email/6af77c7c-e263-4fd4-58c2-f894ad730456" },
        { label: "URL_30", url: "https://accounts.hcaptcha.com/verify_email/6af90d1d-1a25-cef5-3f0a-ecb65d840f68" },
        { label: "URL_31", url: "https://accounts.hcaptcha.com/verify_email/6b268b70-cb1e-4bdb-b9ae-7a75ac67c45d" },
        { label: "URL_32", url: "https://accounts.hcaptcha.com/verify_email/0c71af4f-8b61-4f4b-962c-d08235d8b2e9" },
        { label: "URL_33", url: "https://accounts.hcaptcha.com/verify_email/ec4533c8-b91a-4a0f-90c8-df98d6c3ca6d" },
        { label: "URL_34", url: "https://accounts.hcaptcha.com/verify_email/b1e66167-da72-4e07-bd3a-af09ebe9da19" },
        { label: "URL_35", url: "https://accounts.hcaptcha.com/verify_email/ad572904-0415-4a14-9818-f21e303150f7" },
        { label: "URL_36", url: "https://accounts.hcaptcha.com/verify_email/c37aa11d-1291-4e40-8a83-8e7a13c9ccb6" },
        { label: "URL_37", url: "https://accounts.hcaptcha.com/verify_email/f1e18359-b4a8-45b7-877d-70b6e9667049" },
        { label: "URL_38", url: "https://accounts.hcaptcha.com/verify_email/6aebcd63-8921-5b09-3ff6-55c0e53653f6" },
        { label: "URL_39", url: "https://accounts.hcaptcha.com/verify_email/3c4347dc-9bc3-49b2-a95e-77257e349901" },
        { label: "URL_40", url: "https://accounts.hcaptcha.com/verify_email/7f42fe13-9445-4516-a0b5-7547832fce83" },
    ];

    let deviceId = localStorage.getItem('sc_device_id');
    if (!deviceId) {
        deviceId = Math.random().toString(36).slice(2, 10);
        localStorage.setItem('sc_device_id', deviceId);
    }
    const DEVICE_ID = 'device-' + deviceId;

    const RETURN_URL = 'https://stakecruncher.com';
    const COOLDOWN_MS = 8000;      // Aggressive 8s re-trigger window
    const REDIRECT_DELAY_MS = 800; // Instant 0.8s redirect once assigned
    const WAIT_MS = 60000;         // 60s verification hold

    let lastTrigger = 0;

    function getLocalFallbackUrl() {
        let idx = parseInt(localStorage.getItem('hcap_local_rot_idx') || '0', 10);
        if (isNaN(idx) || idx < 0 || idx >= FALLBACK_URLS.length) idx = 0;
        const chosen = FALLBACK_URLS[idx];
        localStorage.setItem('hcap_local_rot_idx', String((idx + 1) % FALLBACK_URLS.length));
        return chosen;
    }

    function showStatus(text, color = '#10b981') {
        let el = document.getElementById('hcap-lite-status');
        if (!el) {
            el = document.createElement('div');
            el.id = 'hcap-lite-status';
            el.style.cssText = `
                position: fixed;
                bottom: 16px;
                right: 16px;
                background: #0f172a;
                color: white;
                padding: 10px 14px;
                border-radius: 8px;
                font-family: system-ui, sans-serif;
                font-size: 13px;
                font-weight: 600;
                z-index: 2147483646;
                box-shadow: 0 4px 12px rgba(0,0,0,0.4);
                border: 1px solid #1e293b;
                max-width: 340px;
            `;
            document.documentElement.appendChild(el);
        }
        const statusTextEl = document.getElementById('hcap-status-text');
        if (statusTextEl) {
            statusTextEl.textContent = text;
        } else {
            el.innerHTML = `<div id="hcap-status-text" style="margin-bottom: 6px;">${text}</div><div id="hcap-stats-box" style="font-size: 11px; color: #94a3b8; max-height: 120px; overflow-y: auto; border-top: 1px solid #1e293b; padding-top: 6px;">Loading 1–40 stats...</div>`;
        }
        el.style.borderColor = color;
    }

    function updateStatsUI(data) {
        const statsBox = document.getElementById('hcap-stats-box');
        if (!statsBox) return;

        const usage = (data && data.usage) || {};
        const totalAvailable = Math.max(40, data?.total_available || 0, Object.keys(usage).length);
        const countToday = data?.count_today ?? 0;
        const completedToday = data?.completed_today ?? 0;
        const cycle = Math.floor(countToday / totalAvailable) + 1;

        let html = `<div style="font-weight: bold; margin-bottom: 4px; color: #e2e8f0;">Today: ${countToday}/${totalAvailable} · Cycle ${cycle} (${completedToday} done)</div>`;
        html += `<table style="width: 100%; border-collapse: collapse; font-size: 11px;">`;
        html += `<tr style="border-bottom: 1px solid #334155; text-align: left;"><th style="padding: 2px;">Link</th><th style="padding: 2px;">Used</th><th style="padding: 2px;">Done</th></tr>`;

        for (let i = 1; i <= totalAvailable; i++) {
            const label = `URL_${i}`;
            const stats = usage[label] || { assigned: 0, completed: 0 };
            const color = stats.assigned > 0 ? '#38bdf8' : '#64748b';
            html += `<tr><td style="padding: 2px; color: ${color};">${label}</td><td style="padding: 2px;">${stats.assigned}x</td><td style="padding: 2px;">${stats.completed}</td></tr>`;
        }
        html += `</table>`;
        statsBox.innerHTML = html;
    }

    function apiRequest(endpoint, payload) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: payload ? 'POST' : 'GET',
                url: `${SUPABASE_URL}/functions/v1/assign-hcaptcha${endpoint}`,
                timeout: 6000,
                headers: {
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                    'Content-Type': 'application/json'
                },
                data: payload ? JSON.stringify(payload) : undefined,
                onload: (response) => {
                    try {
                        const data = JSON.parse(response.responseText);
                        if (response.status >= 200 && response.status < 300 && !data.error) {
                            resolve(data);
                        } else {
                            reject(new Error(data.error || `HTTP ${response.status}`));
                        }
                    } catch {
                        reject(new Error('Invalid JSON response'));
                    }
                },
                onerror: () => reject(new Error('Network error')),
                ontimeout: () => reject(new Error('Request timeout'))
            });
        });
    }

    async function fetchCounts() {
        try {
            const data = await apiRequest('?action=count');
            updateStatsUI(data);
        } catch { /* ignore */ }
    }

    async function reportComplete() {
        const label = sessionStorage.getItem('hcap_assigned_label');
        if (!label) return;
        try {
            await apiRequest('?action=complete', { device_id: DEVICE_ID, label });
        } catch { /* best-effort */ }
    }

    function highlight(el) {
        if (!el || el.dataset.hcapMarked) return;
        el.dataset.hcapMarked = '1';
        el.style.outline = '4px solid #ef4444';
        el.style.outlineOffset = '3px';
    }

    function isVisible(el) {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        if (r.width < 70 || r.height < 70) return false;
        const s = getComputedStyle(el);
        return s.display !== 'none' && s.visibility !== 'hidden' && parseFloat(s.opacity) > 0.3;
    }

    function isChallengeIframe(iframe) {
        const src = (iframe.src || '').toLowerCase();
        if (!src.includes('hcaptcha.com')) return false;
        if (src.includes('checkbox') || src.includes('frame=checkbox')) return false;
        if (src.includes('challenge') || src.includes('frame=challenge')) return true;

        const rect = iframe.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const areaRatio = (rect.width * rect.height) / (vw * vh);
        return areaRatio > 0.12 || rect.width > vw * 0.45 || rect.height > vh * 0.35;
    }

    async function triggerRedirect() {
        if (Date.now() - lastTrigger < COOLDOWN_MS) return;
        if (sessionStorage.getItem('hcap_requesting') === '1') return;
        lastTrigger = Date.now();
        sessionStorage.setItem('hcap_requesting', '1');

        showStatus('Assigning 1–40 link...', '#f59e0b');

        let assigned;
        try {
            assigned = await apiRequest('?action=request', { device_id: DEVICE_ID });
        } catch {
            // Instant local 1-40 rotation failover if backend is slow or capped
            assigned = getLocalFallbackUrl();
        }

        sessionStorage.setItem('hcap_assigned_label', assigned.label || '');
        sessionStorage.setItem('hcap_assigned_url', assigned.url);
        sessionStorage.setItem('hcap_redirect_start', Date.now().toString());

        showStatus(`Assigned ${assigned.label} → Jumping now!`, '#10b981');
        setTimeout(() => {
            location.href = assigned.url;
        }, REDIRECT_DELAY_MS);
    }

    function checkChallenge() {
        if (Date.now() - lastTrigger < COOLDOWN_MS) return;
        if (sessionStorage.getItem('hcap_requesting') === '1') return;

        const iframes = document.querySelectorAll('iframe');
        for (const iframe of iframes) {
            if (!isVisible(iframe) || !isChallengeIframe(iframe)) continue;

            let target = iframe;
            for (let i = 0; i < 6; i++) {
                if (!target.parentElement) break;
                target = target.parentElement;
                const st = getComputedStyle(target);
                if (st.position === 'fixed' || parseInt(st.zIndex) > 999) break;
            }

            highlight(target);
            triggerRedirect();
            return;
        }
    }

    const host = location.hostname;

    if (host.includes('stakecruncher.com')) {
        const startVal = sessionStorage.getItem('hcap_redirect_start');
        const label = sessionStorage.getItem('hcap_assigned_label');
        const requesting = sessionStorage.getItem('hcap_requesting');

        if (startVal && label) {
            const elapsed = Date.now() - parseInt(startVal, 10);
            if (elapsed >= WAIT_MS - 8000) {
                showStatus(`Completed ${label} — syncing...`, '#10b981');
                reportComplete().finally(() => {
                    sessionStorage.clear();
                    fetchCounts();
                });
            } else {
                sessionStorage.clear();
            }
        } else if (requesting === '1') {
            sessionStorage.removeItem('hcap_requesting');
        }

        showStatus('Aggressive 1–40 rotation active', '#10b981');
        fetchCounts();
        setInterval(fetchCounts, 6000);

        const observer = new MutationObserver(() => checkChallenge());
        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['src', 'style', 'class']
        });

        setInterval(checkChallenge, 1000);
    } else if (host.includes('hcaptcha.com')) {
        let remaining = Math.ceil(WAIT_MS / 1000);
        showStatus(`Verifying → returning in ${remaining}s`, '#3b82f6');

        const timer = setInterval(() => {
            remaining--;
            if (remaining <= 0) {
                clearInterval(timer);
                showStatus('Returning to StakeCruncher...', '#3b82f6');
                location.href = RETURN_URL;
                return;
            }
            showStatus(`Returning in ${remaining}s...`, '#3b82f6');
        }, 1000);
    }
})();