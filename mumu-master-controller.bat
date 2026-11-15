@echo off
setlocal enabledelayedexpansion
title MuMu 24/7 Master Controller (Scheduled Cycles)
:: ===========================================================================
::   MuMu 24/7 StakeCruncher Master Controller (Scheduled Cycle Mode)
::   - Runs StakeCruncher claim cycles on a fixed cooldown timer.
::   - No external command polling required.
:: ===========================================================================

:: =============================================
:: 1. DIRECTORIES & SINGLE-INSTANCE CHECK
:: =============================================
set "BASE_DIR=C:\Users\thris\OneDrive\Desktop\needed"
if not exist "%BASE_DIR%" mkdir "%BASE_DIR%"
set "LOCK_FILE=%BASE_DIR%\mumu_master_24x7.lock"
set "LOG=%BASE_DIR%\rotate_log.txt"
set "COOLDOWN_SECONDS=10560"

2>nul (
    >>"%LOCK_FILE%" (call )
) || (
    echo [%date% %time%] Master script is already running! Exiting...
    ping -n 5 127.0.0.1 >nul
    exit /b 0
)

:: =============================================
:: 2. CONFIGURATION & PATHS
:: =============================================
set "MUMU=C:\Program Files\Netease\MuMuPlayer\nx_main\MuMuManager.exe"
set "ADB=C:\Program Files\Netease\MuMuPlayer\nx_main\adb.exe"
set "MUMUAPP=C:\Program Files\Netease\MuMuPlayer\nx_main\MuMuNxMain.exe"
set "BOOT_WAIT_SECONDS=130"
set "STAKE_HOLD_SECONDS=100"
set "GAP_SECONDS=4"
set "STAKE_URL=https://stakecruncher.com/"

echo ============================================= >> "%LOG%"
echo [%date% %time%] 24/7 Master Script Started (Scheduled Cycle Mode) >> "%LOG%"

:: === STARTUP MENU ===
:startup_menu
cls
echo ========================================================
echo MuMu 24/7 StakeCruncher Master Controller
echo ========================================================
echo.
echo 1. Start 24/7 Scheduled Cycles [Default - every %COOLDOWN_SECONDS%s]
echo 2. Force StakeCruncher Full Cycle Now
echo 3. Exit
echo.
choice /t 10 /c 123 /d 1 /n >nul
set "start_opt=%errorlevel%"
if "%start_opt%"=="3" (
    if exist "%LOCK_FILE%" del /f /q "%LOCK_FILE%" >nul 2>&1
    exit /b 0
)
if "%start_opt%"=="2" (
    call :force_stakecruncher_cycle
)

:: =============================================
:: 3. MAIN 24/7 SCHEDULED LOOP
:: =============================================
:main_loop
call :force_stakecruncher_cycle

cls
echo ========================================================
echo MuMu 24/7 StakeCruncher Master Controller
echo ========================================================
echo Current Time        : %date% %time%
echo Cooldown            : %COOLDOWN_SECONDS%s
echo Status              : Cooling down before next cycle
echo Log File            : %LOG%
echo ========================================================
echo Next cycle in %COOLDOWN_SECONDS%s...
call :smart_sleep %COOLDOWN_SECONDS%
goto main_loop

:: =============================================
:: 4. SMART SLEEP (interruptible countdown display)
:: =============================================
:smart_sleep
set "WAIT_TOTAL=%~1"
for /L %%S in (1,1,%WAIT_TOTAL%) do (
    ping -n 2 127.0.0.1 >nul
)
goto :eof

:: =============================================
:: 5. STAKECRUNCHER CYCLES
:: =============================================
:force_stakecruncher_cycle
echo ============================================= >> "%LOG%"
echo [%date% %time%] === Starting StakeCruncher Cycle === >> "%LOG%"
call :mumu_restart
call :run_stake_batch "1 2 3 4 5 6"
call :run_stake_batch "7 8 9 10 11 12"
call :run_stake_batch "13 14 15 16 17 18"
call :run_stake_batch "19 20 21 22 23 24"
call :run_stake_batch "25 26 27 28 29 30"
taskkill /F /IM MuMuNxMain.exe /T >> "%LOG%" 2>&1
echo [%date% %time%] StakeCruncher Cycle completed. >> "%LOG%"
goto :eof

:: =============================================
:: 6. CORE EXECUTION FUNCTIONS
:: =============================================
:mumu_restart
echo [%date% %time%] Performing clean MuMuPlayer and ADB restart... >> "%LOG%"
taskkill /F /IM MuMuNxMain.exe /T >> "%LOG%" 2>&1
taskkill /F /IM MuMuNxService.exe /T >> "%LOG%" 2>&1
taskkill /F /IM MuMuManager.exe /T >> "%LOG%" 2>&1
taskkill /F /IM MuMuRemoteService.exe /T >> "%LOG%" 2>&1
taskkill /F /IM MuMuRemoteBackend.exe /T >> "%LOG%" 2>&1
taskkill /F /IM adb.exe /T >> "%LOG%" 2>&1
ping -n 16 127.0.0.1 >nul
start "" "%MUMUAPP%"
ping -n 21 127.0.0.1 >nul
goto :eof

:run_stake_batch
set "DEVICES=%~1"
for /L %%I in (1,1,30) do set "PORT_%%I="

echo [%date% %time%] [STAKE] Launching devices: %DEVICES% >> "%LOG%"
for %%D in (%DEVICES%) do (
    "%MUMU%" control --vmindex %%D launch >> "%LOG%" 2>&1
    ping -n !GAP_SECONDS! 127.0.0.1 >nul
)

echo [%date% %time%] [STAKE] Waiting %BOOT_WAIT_SECONDS%s for boot >> "%LOG%"
call :smart_sleep !BOOT_WAIT_SECONDS!

"%ADB%" disconnect >> "%LOG%" 2>&1
set "PORTMAP=%TEMP%\portmap_%RANDOM%.txt"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "try { $raw = & '%MUMU%' info -v all; $j = $raw | ConvertFrom-Json; foreach ($p in $j.PSObject.Properties) { if ($p.Value.adb_port) { Write-Output ($p.Name + '=' + $p.Value.adb_port) } } } catch { Write-Error $_ }" > "%PORTMAP%" 2>>"%LOG%"
if exist "%PORTMAP%" (
    for /f "usebackq tokens=1,2 delims==" %%A in ("%PORTMAP%") do set "PORT_%%A=%%B"
    del "%PORTMAP%" >nul 2>&1
)

echo [%date% %time%] [STAKE] Opening StakeCruncher on devices >> "%LOG%"
for %%D in (%DEVICES%) do (
    call :open_stake_url %%D
    ping -n !GAP_SECONDS! 127.0.0.1 >nul
)

echo [%date% %time%] [STAKE] Holding %STAKE_HOLD_SECONDS%s for claim >> "%LOG%"
call :smart_sleep !STAKE_HOLD_SECONDS!

echo [%date% %time%] [STAKE] Shutting down devices >> "%LOG%"
for %%D in (%DEVICES%) do (
    "%MUMU%" control --vmindex %%D shutdown >> "%LOG%" 2>&1
    ping -n !GAP_SECONDS! 127.0.0.1 >nul
)
ping -n 6 127.0.0.1 >nul
echo [%date% %time%] [STAKE] Done. >> "%LOG%"
goto :eof

:open_stake_url
set "DIDX=%~1"
call set "PORT=%%PORT_%DIDX%%%"
if "!PORT!"=="" goto :eof
"%ADB%" connect 127.0.0.1:!PORT! >> "%LOG%" 2>&1
"%ADB%" -s 127.0.0.1:!PORT! shell am start -a android.intent.action.VIEW -d "%STAKE_URL%" >> "%LOG%" 2>&1
goto :eof
