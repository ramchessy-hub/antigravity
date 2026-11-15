StakeCruncher Desktop — Remote Screen Protection
=================================================

This Electron app wraps the StakeCruncher dashboard with OS-level content
protection. When a remote-access tool (AnyDesk, TeamViewer, RustDesk, etc.)
is detected running on the system, the app:

1. Enables `setContentProtection(true)` on the main window — Windows and
   macOS exclude protected windows from screen capture APIs, so AnyDesk
   and similar tools see only a black rectangle where the page should be.
2. Shows a decoy TaskMonk.io marketing page behind the main window —
   the remote viewer sees a plausible task-automation website instead
   of your dashboard or a suspicious black screen.

The local user sees the dashboard normally at all times.

## Running

1. Install Node.js on the Windows computer that displays the dashboard.
2. In this directory, run:
   npm install
   npm start

The wrapper opens the hosted dashboard directly and keeps Electron content
protection enabled continuously. Do not open the dashboard in Chrome or
another normal browser when you need capture protection.

## Building a standalone .exe

   npm install
   npm run build

This produces a portable .exe in electron/dist/ that bundles Electron
and the protection logic. Double-click to launch the protected dashboard.

## How it works

Every 2 seconds the app runs `tasklist` filtered for known remote-access
process names. If any are found, content protection is turned on and the
blocker window is shown. When the remote tool is closed, protection is
turned off and the blocker window is hidden automatically.

## Supported remote tools

AnyDesk, TeamViewer, TightVNC, RealVNC, Microsoft RDP (mstsc),
RustDesk, SunLogin, ToDesk, GoToMyHost, Supremo, Splashtop,
NVIDIA Share (GeForce screen capture), OBS Studio.
