@echo off
title YunMeet Local Server
setlocal
cd /d "%~dp0"

rem ---- check yunmeet.html in same folder ----
if exist "yunmeet.html" goto :checkpy

echo [ERROR] yunmeet.html not found in this folder.
echo Please put this .bat file and yunmeet.html in the SAME folder,
echo then double-click this file again.
echo.
pause
exit /b

:checkpy
where python >nul 2>nul
if %errorlevel%==0 goto :runpy
where py >nul 2>nul
if %errorlevel%==0 goto :runpy3
goto :nopython

:runpy
start /b "" python -m http.server 8944 --bind 127.0.0.1 >nul 2>&1
goto :waitopen

:runpy3
start /b "" py -m http.server 8944 --bind 127.0.0.1 >nul 2>&1
goto :waitopen

:waitopen
timeout /t 1 /nobreak >nul
netstat -an | find ":8944" | find "LISTENING" >nul 2>nul
if %errorlevel%==0 goto :open

echo [ERROR] Local service failed to start.
echo Possible reasons:
echo   1. Port 8944 is busy - restart the PC and try again;
echo   2. Only a fake "python" from Microsoft Store exists -
echo      install real Python from python.org (check Add to PATH);
echo   3. Blocked by antivirus software.
echo Take a screenshot of this window and send it back to me.
echo.
pause
exit /b

:open
start "" "http://localhost:8944/yunmeet.html"
echo ==================================================
echo   YunMeet local service is RUNNING
echo.
echo   Meeting page: http://localhost:8944/yunmeet.html
echo   (Your browser should have opened automatically.)
echo.
echo   KEEP THIS WINDOW OPEN during the meeting.
echo   You can minimize it. Closing it stops the service.
echo   (Do NOT press any key - just minimize this window.)
echo ==================================================
echo.

rem ---- keep the service alive until the window is closed ----
:keepalive
timeout /t 3600 /nobreak >nul
goto :keepalive

:nopython
echo [HINT] Python was not detected on this computer.
echo Two options:
echo   1. Install Python from python.org
echo      (remember to check "Add to PATH" in the installer),
echo      then double-click this file again.
echo   2. Contact me for an alternative solution.
echo.
pause
exit /b
