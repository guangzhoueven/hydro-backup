@echo off
setlocal
rem Hydro OJ launcher (local install at D:\hydro\node_modules)
set "USERPROFILE=D:\hydro"
set "TEMP=D:\hydro\tmp"
set "TMP=D:\hydro\tmp"
set "NODE_APP_INSTANCE=0"
node "%~dp0node_modules\hydrooj\bin\hydrooj.js" %*
exit /b %ERRORLEVEL%
