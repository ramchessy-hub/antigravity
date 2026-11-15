import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Lock,
  Download,
  FileText,
  Terminal,
  MousePointerClick,
  CheckCircle2,
  Copy,
  ArrowRight,
  ShieldCheck,
  ListChecks,
  AlertCircle,
} from 'lucide-react';

const PASSWORD = import.meta.env.VITE_DOWNLOADS_PASSWORD || '83410';
const STORAGE_KEY = 'sc_downloads_unlocked';

// Step-by-step guide text (also downloadable as .txt)
const GUIDE_TEXT = `==================================================
 STAKECRUNCHER — REMOTE WITHDRAW SETUP GUIDE
==================================================

This guide walks you through setting up the full remote
withdraw flow. Once done, you can click "Withdraw All" on
the dashboard from anywhere and every device will run the
withdraw automatically.

--------------------------------------------------
 WHAT YOU NEED
--------------------------------------------------
  1. A Windows PC running the MuMu emulators (30 devices).
  2. The Tampermonkey browser extension installed in each
     emulator's browser (or any Chrome-based browser).
  3. This dashboard (you're already here).

--------------------------------------------------
 STEP 1 — Install the Tampermonkey Script (per device)
--------------------------------------------------
  1. Open the StakeCruncher website in the device's browser.
  2. Make sure the Tampermonkey extension is installed.
  3. Download "tampermonkey-script.user.js" from this page.
  4. Open Tampermonkey -> Dashboard -> Utilities -> Import.
  5. Paste the script contents and click Import.
  6. Make sure the script is ENABLED.
  7. Refresh the StakeCruncher page. You should see a small
     "SC Monitor" panel in the top-left corner showing
     "IDLE — waiting...".

  The script is IDLE by default. It does NOT auto-click
  anything. It only runs the withdraw when the dashboard
  sends a remote command.

  REPEAT FOR EVERY DEVICE. Each device gets a unique
  device id automatically.

--------------------------------------------------
 STEP 2 — Run the .bat Master Controller (your PC)
--------------------------------------------------
  1. Download "mumu-master-controller.bat" from this page.
  2. Save it anywhere on your PC (e.g. Desktop).
  3. Double-click to run it. A console window opens.
  4. Choose option 1 (default) to start idle polling.
  5. The script:
       - Polls this dashboard every 10 seconds for
         pending "Withdraw All" commands.
       - Boots all 30 MuMu emulators automatically when
         a command is found.
       - Opens StakeCruncher in each emulator.
       - Holds 100 seconds for the claim to process.
       - Shuts the emulators down and returns to idle.
  6. Leave the console window open 24/7.

  DISABLING THE .BAT (Tampermonkey-only mode):
    If you only want the Tampermonkey scripts to handle
    withdraws (no .bat controller), choose option 3 in
    the startup menu to toggle the local listener off.
    Or create this file:
      C:\\Users\\thris\\OneDrive\\Desktop\\needed\\listener_disabled.flag
    The .bat will then only poll Supabase and will NOT
    start the local HTTP listener.

  On the DASHBOARD, use the "BAT ON / BAT OFF" button in
  the Withdraw section to control whether "Withdraw All"
  also pings the local .bat listener. When BAT is OFF,
  the dashboard only creates the command — devices running
  the Tampermonkey script will pick it up when they come
  online on their own.

--------------------------------------------------
 STEP 3 — Trigger a Withdraw
--------------------------------------------------
  1. Open this dashboard from anywhere (phone, laptop, etc).
  2. Click "Withdraw All" in the Withdraw section.
  3. A withdraw command is created with a 7-day expiry.
     Offline devices will still pick it up later.
  4. If BAT is ON, your .bat controller polls within 10s,
     boots the emulators, and runs the cycle.
  5. Each device's Tampermonkey script polls within 15s of
     the browser loading, finds the command, clicks
     Withdraw -> Send USDC, and reports "executed".
  6. Watch the "Recent commands" list for live status.

--------------------------------------------------
 STOP / RESET A REQUEST
--------------------------------------------------
  - To stop ALL active withdraw commands: click "Stop all"
    in the yellow banner that appears above the command
    list when there are pending commands.
  - To stop a SINGLE command: click "Reset" on that
    command's row.
  - Stopped commands are marked as "expired" so devices
    will not pick them up.

--------------------------------------------------
 WITHDRAWALS DETECTED
--------------------------------------------------
  The "Withdrawals Detected" feed only shows balance drops
  of $0.50 or more. Smaller drops are ignored.

--------------------------------------------------
 TROUBLESHOOTING
--------------------------------------------------
  - SC Monitor panel says "IDLE" forever?
      -> Make sure Tampermonkey is enabled and you
         refreshed the StakeCruncher page after install.

  - .bat controller says "not reachable"?
      -> Only relevant if BAT is ON. The Supabase poll
         works from anywhere. Make sure the .bat console
         window is open and running.

  - Withdraw command stays "pending"?
      -> The .bat controller is not running (or BAT is OFF
         and no devices are online). Check the .bat console
         log at:
         C:\\Users\\thris\\OneDrive\\Desktop\\needed\\rotate_log.txt

  - Device says "failed"?
      -> The withdraw or Send USDC button was not ready.
         The device may need to be refreshed.

--------------------------------------------------
 FILES
--------------------------------------------------
  - tampermonkey-script.user.js (v9.1)
      Small idle monitor. Install in Tampermonkey on each
      device's browser. Pre-filled with credentials.

  - mumu-master-controller.bat
      Run on your Windows PC. Polls the dashboard and
      boots the MuMu emulators automatically. Local
      listener can be toggled on/off.

  - setup-guide.txt
      This file.

==================================================
`;

export function DownloadsPage({ onClose }: { onClose: () => void }) {
  const [unlocked, setUnlocked] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [autoDownloaded, setAutoDownloaded] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) === '1') setUnlocked(true);
  }, []);

  const handleUnlock = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput === PASSWORD) {
      setUnlocked(true);
      setError(false);
      localStorage.setItem(STORAGE_KEY, '1');
    } else {
      setError(true);
    }
  }, [passwordInput]);

  const handleLock = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setUnlocked(false);
    setPasswordInput('');
  }, []);

  // --- Download helpers ---
  const downloadFile = useCallback((filename: string, content: string, mime = 'text/plain') => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, []);

  const copyToClipboard = useCallback(async (key: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // ignore
    }
  }, []);

  // Fetch the embedded scripts at runtime so they're always current
  const fetchScript = useCallback(async (path: string): Promise<string> => {
    const res = await fetch(path);
    return await res.text();
  }, []);

  const handleDownloadBat = useCallback(async () => {
    const content = await fetchScript('/mumu-master-controller.bat');
    downloadFile('mumu-master-controller.bat', content, 'application/octet-stream');
  }, [downloadFile, fetchScript]);

  const handleDownloadTampermonkey = useCallback(async () => {
    const content = await fetchScript('/tampermonkey-script.user.js');
    downloadFile('tampermonkey-script.user.js', content, 'text/javascript');
  }, [downloadFile, fetchScript]);

  const handleDownloadGuide = useCallback(() => {
    downloadFile('setup-guide.txt', GUIDE_TEXT, 'text/plain');
  }, [downloadFile]);

  // Auto-download all three files on first unlock
  useEffect(() => {
    if (unlocked && !autoDownloaded) {
      setAutoDownloaded(true);
      handleDownloadGuide();
      const t1 = setTimeout(() => handleDownloadTampermonkey(), 600);
      const t2 = setTimeout(() => handleDownloadBat(), 1200);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, [unlocked, autoDownloaded, handleDownloadGuide, handleDownloadTampermonkey, handleDownloadBat]);

  const steps = useMemo(() => [
    {
      icon: <MousePointerClick className="w-5 h-5 text-sky-400" />,
      title: 'Install Tampermonkey script',
      desc: 'Download the .user.js file, open Tampermonkey in each device\'s browser, and import it. The script is pre-filled with your credentials.',
      action: handleDownloadTampermonkey,
      actionLabel: 'Download tampermonkey-script.user.js',
      file: 'tampermonkey-script.user.js',
    },
    {
      icon: <Terminal className="w-5 h-5 text-emerald-400" />,
      title: 'Run the .bat master controller',
      desc: 'Download and double-click the .bat file on your Windows PC. It polls the dashboard every 10s and boots the MuMu emulators when a withdraw is triggered.',
      action: handleDownloadBat,
      actionLabel: 'Download mumu-master-controller.bat',
      file: 'mumu-master-controller.bat',
    },
    {
      icon: <FileText className="w-5 h-5 text-amber-400" />,
      title: 'Read the setup guide',
      desc: 'Step-by-step instructions for installing the script, running the controller, and triggering withdraws from anywhere.',
      action: handleDownloadGuide,
      actionLabel: 'Download setup-guide.txt',
      file: 'setup-guide.txt',
    },
  ], [handleDownloadBat, handleDownloadTampermonkey, handleDownloadGuide]);

  if (!unlocked) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
        <div className="w-full max-w-sm bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl">
          <div className="flex flex-col items-center text-center mb-5">
            <div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl flex items-center justify-center shadow-lg shadow-amber-500/20 mb-3">
              <Lock className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-lg font-bold text-slate-100">Downloads Locked</h2>
            <p className="text-xs text-slate-400 mt-1">Enter the password to download the setup files.</p>
          </div>
          <form onSubmit={handleUnlock} className="space-y-3">
            <input
              type="password"
              autoFocus
              value={passwordInput}
              onChange={(e) => { setPasswordInput(e.target.value); setError(false); }}
              placeholder="Password"
              className={`w-full bg-slate-900 border ${error ? 'border-red-500' : 'border-slate-600'} rounded-lg px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors`}
            />
            {error && (
              <p className="text-xs text-red-400 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" />
                Incorrect password. Try again.
              </p>
            )}
            <button
              type="submit"
              className="w-full bg-gradient-to-r from-amber-500 to-orange-600 text-white font-semibold py-2.5 rounded-lg hover:from-amber-400 hover:to-orange-500 transition-all shadow-lg shadow-amber-500/20"
            >
              Unlock
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full text-xs text-slate-500 hover:text-slate-400 py-1"
            >
              Back to dashboard
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950">
      {/* Header */}
      <header className="border-b border-slate-800/60 bg-slate-900/40 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold text-slate-100">Downloads & Setup</h1>
              <p className="text-xs text-slate-500">Remote withdraw setup files</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleLock}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-300 hover:bg-slate-700 transition-all"
            >
              <Lock className="w-3.5 h-3.5" />
              Lock
            </button>
            <button
              onClick={onClose}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-300 hover:bg-slate-700 transition-all"
            >
              Back to dashboard
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Auto-download notice */}
        <div className="bg-emerald-900/20 border border-emerald-700/30 rounded-xl p-4 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-emerald-300">All files downloaded automatically</p>
            <p className="text-xs text-emerald-400/70 mt-0.5">
              The three setup files were downloaded to your device when you unlocked this page. You can re-download them individually below.
            </p>
          </div>
        </div>

        {/* Steps */}
        <div className="space-y-3">
          {steps.map((step, i) => (
            <div
              key={i}
              className="bg-gradient-to-br from-slate-800/60 to-slate-900/60 border border-slate-700/50 rounded-2xl p-4 sm:p-5"
            >
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-slate-800 border border-slate-700 rounded-xl flex items-center justify-center shrink-0">
                  {step.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-slate-500">STEP {i + 1}</span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-100 mb-1">{step.title}</h3>
                  <p className="text-xs text-slate-400 mb-3 leading-relaxed">{step.desc}</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={step.action}
                      className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-lg text-xs font-semibold text-white hover:from-emerald-400 hover:to-teal-500 transition-all shadow-lg shadow-emerald-500/20"
                    >
                      <Download className="w-3.5 h-3.5" />
                      {step.actionLabel}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Quick reference */}
        <div className="bg-slate-800/40 border border-slate-700/40 rounded-2xl p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-3">
            <ListChecks className="w-4 h-4 text-sky-400" />
            <h3 className="text-sm font-semibold text-slate-200">Quick Reference</h3>
          </div>
          <ul className="space-y-2 text-xs text-slate-400">
            <li className="flex items-start gap-2">
              <ArrowRight className="w-3.5 h-3.5 text-slate-600 mt-0.5 shrink-0" />
              <span><strong className="text-slate-300">Tampermonkey script</strong> goes in each device's browser. It's pre-filled with your credentials — no editing needed.</span>
            </li>
            <li className="flex items-start gap-2">
              <ArrowRight className="w-3.5 h-3.5 text-slate-600 mt-0.5 shrink-0" />
              <span><strong className="text-slate-300">.bat controller</strong> runs on your Windows PC only. Leave it open 24/7. It polls the dashboard every 10s.</span>
            </li>
            <li className="flex items-start gap-2">
              <ArrowRight className="w-3.5 h-3.5 text-slate-600 mt-0.5 shrink-0" />
              <span><strong className="text-slate-300">Withdraw All</strong> on the dashboard triggers everything. Commands persist for 7 days, so offline devices pick them up later.</span>
            </li>
            <li className="flex items-start gap-2">
              <ArrowRight className="w-3.5 h-3.5 text-slate-600 mt-0.5 shrink-0" />
              <span><strong className="text-slate-300">Local controller URL:</strong> <code className="text-slate-300 bg-slate-900 px-1.5 py-0.5 rounded">http://127.0.0.1:8765/trigger-stake</code></span>
            </li>
          </ul>
        </div>

        {/* Copy guide */}
        <div className="bg-slate-800/40 border border-slate-700/40 rounded-2xl p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-semibold text-slate-200">Setup Guide (copy)</h3>
            </div>
            <button
              onClick={() => copyToClipboard('guide', GUIDE_TEXT)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-xs text-slate-300 hover:bg-slate-600 transition-all"
            >
              {copied === 'guide' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied === 'guide' ? 'Copied' : 'Copy'}
            </button>
          </div>
          <pre className="text-[10px] text-slate-400 bg-slate-950/60 border border-slate-800 rounded-lg p-3 max-h-64 overflow-y-auto whitespace-pre-wrap font-mono leading-relaxed">
            {GUIDE_TEXT}
          </pre>
        </div>

        <footer className="pt-2 pb-8 text-center">
          <p className="text-xs text-slate-600">
            These files are pre-configured for your dashboard. Keep them private.
          </p>
        </footer>
      </main>
    </div>
  );
}
