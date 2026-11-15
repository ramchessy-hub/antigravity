// ==UserScript==
// @name         hCaptcha Challenge → Supabase Verify Redirect (Dynamic Rotation + Dashboard Support)
// @namespace    http://tampermonkey.net/
// @version      4.5
// @description  Dynamic 1-N rotation with dashboard/accessibility UI support for stakecruncher.com
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

    let deviceId = localStorage.getItem('sc_device_id');
    if (!deviceId) {
        deviceId = Math.random().toString(36).slice(2, 10);
        localStorage.setItem('sc_device_id', deviceId);
    }
    const DEVICE_ID = 'device-' + deviceId;

    const RETURN_URL = 'https://stakecruncher.com';
    const COOLDOWN_MS = 20000;
    const WAIT_MS = 60000; // 1-minute window

    let lastTrigger = 0;

    // ---------- UI Status & Stats Panel ----------
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
            el.innerHTML = `<div id="hcap-status-text" style="margin-bottom: 6px;">${text}</div><div id="hcap-stats-box" style="font-size: 11px; color: #94a3b8; max-height: 120px; overflow-y: auto; border-top: 1px solid #1e293b; padding-top: 6px;">Loading usage stats...</div>`;
        }
        el.style.borderColor = color;
    }

    function updateStatsUI(data) {
        const statsBox = document.getElementById('hcap-stats-box');
        if (!statsBox || !data.usage) return;

        // Dynamically derive all URL labels from the backend response (works for 40, 50, or any future count)
        const labels = Array.isArray(data.labels) && data.labels.length > 0
            ? data.labels
            : Object.keys(data.usage).sort((a, b) => {
                const numA = parseInt(a.replace(/\D/g, ''), 10) || 0;
                const numB = parseInt(b.replace(/\D/g, ''), 10) || 0;
                return numA - numB;
            });

        const totalAvailable = data.total_available || labels.length;

        let html = `<div style="font-weight: bold; margin-bottom: 4px; color: #e2e8f0;">Today: ${data.count_today}/${totalAvailable} used (${data.completed_today} done)</div>`;
        html += `<table style="width: 100%; border-collapse: collapse; font-size: 11px;">`;
        html += `<tr style="border-bottom: 1px solid #334155; text-align: left;"><th style="padding: 2px;">Link</th><th style="padding: 2px;">Used</th><th style="padding: 2px;">Done</th></tr>`;

        for (const label of labels) {
            const stats = data.usage[label] || { assigned: 0, completed: 0 };
            const color = stats.assigned > 0 ? '#38bdf8' : '#64748b';
            html += `<tr><td style="padding: 2px; color: ${color};">${label}</td><td style="padding: 2px;">${stats.assigned}</td><td style="padding: 2px;">${stats.completed}</td></tr>`;
        }
        html += `</table>`;
        statsBox.innerHTML = html;
    }

    function apiRequest(endpoint, payload) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: payload ? 'POST' : 'GET',
                url: `${SUPABASE_URL}/functions/v1/assign-hcaptcha${endpoint}`,
                headers: {
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                    'Content-Type': 'application/json'
                },
                data: payload ? JSON.stringify(payload) : undefined,
                onload: (response) => {
                    try {
                        const data = JSON.parse(response.responseText);
                        if (response.status >= 200 && response.status < 300) {
                            resolve(data);
                        } else {
                            const err = new Error(data.error || (`HTTP ${response.status}`));
                            err.code = data.error;
                            reject(err);
                        }
                    } catch (e) {
                        reject(new Error('Invalid JSON response'));
                    }
                },
                onerror: () => reject(new Error('Network request failed'))
            });
        });
    }

    async function fetchCounts() {
        try {
            const data = await apiRequest('?action=count');
            updateStatsUI(data);
        } catch { /* ignore */ }
    }

    async function requestVerifyUrl() {
        return await apiRequest('?action=request', { device_id: DEVICE_ID });
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
        setTimeout(() => {
            el.style.outline = '';
            el.style.outlineOffset = '';
            delete el.dataset.hcapMarked;
        }, 6000);
    }

    function isVisible(el) {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        if (r.width < 70 || r.height < 70) return false;
        const s = getComputedStyle(el);
        return s.display !== 'none' && s.visibility !== 'hidden' && parseFloat(s.opacity) > 0.4;
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
        return areaRatio > 0.15 || rect.width > vw * 0.5 || rect.height > vh * 0.4;
    }

    async function triggerRedirect() {
        if (Date.now() - lastTrigger < COOLDOWN_MS) return;
        if (sessionStorage.getItem('hcap_requesting') === '1') return;
        lastTrigger = Date.now();
        sessionStorage.setItem('hcap_requesting', '1');

        showStatus('Requesting verify URL...');

        try {
            const data = await requestVerifyUrl();

            sessionStorage.setItem('hcap_assigned_label', data.label || '');
            sessionStorage.setItem('hcap_assigned_url', data.url);
            sessionStorage.setItem('hcap_redirect_start', Date.now().toString());

            showStatus(`Assigned ${data.label} → Redirecting in 5s`);
            setTimeout(() => {
                showStatus('Redirecting...');
                location.href = data.url;
            }, 5000);
        } catch (err) {
            sessionStorage.removeItem('hcap_requesting');
            if (err.code === 'no_urls_available') {
                showStatus('No verify URLs left today', '#ef4444');
            } else {
                showStatus('API error: ' + err.message, '#ef4444');
            }
        }
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
            showStatus('Challenge detected!');
            triggerRedirect();
            return;
        }
    }

    // ---------- Main Flow ----------
    const host = location.hostname;

    if (host.includes('stakecruncher.com')) {
        const startVal = sessionStorage.getItem('hcap_redirect_start');
        const label = sessionStorage.getItem('hcap_assigned_label');
        const requesting = sessionStorage.getItem('hcap_requesting');

        if (startVal && label) {
            const elapsed = Date.now() - parseInt(startVal, 10);
            if (elapsed >= WAIT_MS - 5000) {
                showStatus('Verify complete — reporting...', '#10b981');
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

        showStatus('Waiting for challenge...', '#10b981');
        fetchCounts();
        setInterval(fetchCounts, 10000);

        const observer = new MutationObserver(() => checkChallenge());
        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['src']
        });

        setInterval(checkChallenge, 2000);
    }
    else if (host.includes('hcaptcha.com')) {
        let remaining = Math.ceil(WAIT_MS / 1000);
        showStatus(`On verification page → returning in ${remaining}s`, '#3b82f6');

        const timer = setInterval(() => {
            remaining--;
            if (remaining <= 0) {
                clearInterval(timer);
                showStatus('Returning...', '#3b82f6');
                location.href = RETURN_URL;
                return;
            }
            showStatus(`Returning in ${remaining}s...`, '#3b82f6');
        }, 1000);
    }
})();