# Project memory

## Product intent & audience

- StakeCruncher Balance Tracker is a production dashboard for balances, earnings, device status, claim readiness, and privacy protection.
- A Tampermonkey integration supplies source data; the dashboard and Electron wrapper remain separate from the userscript.
- The app is intended for a local operator who may share the computer with someone viewing through remote-access software.
- Security behavior should protect the local operator while preventing a remote viewer from seeing the real dashboard.

## Brand personality & voice

- “Bulletproof” means dependable security and clear status feedback without overstating browser, OS, or capture-control guarantees.
- Use concise, calm language for authentication failures, blocked devices, remote-view protection, and recovery states.
- Clearly distinguish device blocking, normal privacy mode, and remote viewers receiving a decoy surface.

## Visual design & UX direction

- Preserve the existing production-grade React/Tailwind/Lucide dashboard style and established balance, earnings, device, claim, and privacy surfaces.
- Authentication shows remaining attempts after each failed password entry; after the fifth failure, it changes to a clear “Device Blocked” state.
- A blocked-device screen explains that access is denied and persists beyond reloads or browser storage clearing.
- The local operator continues seeing the real dashboard while the Electron remote-capture path displays a full decoy TaskMonk.io-style marketing page rather than a black “Screen blocked” surface.
- The decoy should resemble a legitimate task-automation startup page, including branding, navigation, hero content, feature cards, statistics, and footer. Its window title is “TaskMonk — Task Automation Platform.”
- The protection state returns to normal after monitored remote-access software is disconnected or no longer detected.
- Preserve existing privacy-mode behavior and distinguish it from Electron/OS-level capture protection.
- Keep status messaging accessible and avoid claims that cannot be verified by the implementation.

## Decisions, constraints & rationale

- Password authentication is limited to five failed attempts per device.
- After five failures, the device is added to a persistent Supabase blocklist and subsequent access is denied until an authorized operator removes the block.
- The current identity mechanism is described as a hardware/environment-based device fingerprint, not a cookie. A true MAC-address blocklist is unconfirmed and generally unavailable to ordinary browser code.
- Blocklist enforcement occurs before normal dashboard access and survives reloads and client-side storage clearing.
- Desktop remote-view protection is implemented in the separate Electron wrapper under `electron/`, using `BrowserWindow.setContentProtection(...)` plus a decoy fallback window.
- The Electron wrapper polls approximately every two seconds for AnyDesk, TeamViewer, RustDesk, and other monitored remote-access processes. Detection is desktop/OS-specific and unavailable to the ordinary web page.
- The local protected window remains visible to the operator while the remote capture view is intended to show the TaskMonk decoy. Behavior depends on platform support and whether the remote tool honors OS capture-protection APIs; it is not an absolute anti-recording guarantee.
- Do not modify the Tampermonkey userscript unless explicitly requested.
- Existing synchronization, daily IST reset behavior, stale-data safeguards, Supabase backend pieces, and privacy preferences remain in force.
- The current build was reported as passing. Electron dependencies and execution remain managed from its own directory; packaging is available through its build script.

## Open questions & assumptions

- Confirm whether the desired identity key is a real MAC address, a generated device fingerprint, or an administrator-managed device identifier.
- Define administrator authentication and removal procedures for Supabase blocklist entries.
- Confirm database schema, retention policy, and whether failed-attempt counters are server-enforced against client-side bypass.
- Confirm supported operating systems and consistent remote-tool support for Electron content protection.
- Decide whether process-detection failures should fail open or fail closed when permissions, names, or platform APIs are unavailable.
- Determine the default and persistence policy for dashboard privacy mode versus automatic Electron remote-view decoy behavior.
- Confirm whether the TaskMonk.io branding/content should be treated as a permanent decoy or remain configurable.