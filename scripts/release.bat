@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0.."

rem  E-Estimate - Release through GitHub Actions
rem
rem  Usage:  scripts\release.bat [patch|minor|major]      (default: patch)
rem
rem  This does NOT build on your machine. It asks GitHub to build, which means
rem  the installer is made from exactly what is on master, by a clean runner,
rem  only after the tests pass. publish.ps1 still exists for building locally.
rem
rem  What it publishes reaches every installed copy through the auto-updater,
rem  so it checks a few things first and asks before firing.

set "BUMP=%~1"
if "%BUMP%"=="" set "BUMP=patch"
if /i not "%BUMP%"=="patch" if /i not "%BUMP%"=="minor" if /i not "%BUMP%"=="major" (
    echo ERROR: bump must be patch, minor or major - got "%BUMP%".
    goto :fail
)

echo.
echo ====================================
echo   E-Estimate - Release (%BUMP%)
echo ====================================
echo.

rem --- GitHub CLI -----------------------------------------------------------
rem  The installer usually lands outside PATH for the current shell; look where
rem  it actually installs before giving up.
set "GH=gh"
where gh >nul 2>&1
if errorlevel 1 (
    if exist "%ProgramFiles%\GitHub CLI\gh.exe" set "GH=%ProgramFiles%\GitHub CLI\gh.exe"
    if exist "%ProgramFiles(x86)%\GitHub CLI\gh.exe" set "GH=%ProgramFiles(x86)%\GitHub CLI\gh.exe"
)
"%GH%" --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: GitHub CLI not found. Install it from https://cli.github.com
    goto :fail
)

"%GH%" auth status >nul 2>&1
if errorlevel 1 (
    echo ERROR: GitHub CLI is not signed in. Run:  gh auth login
    goto :fail
)

rem --- The release is built from master, so that is what must be ready ------
for /f "delims=" %%B in ('git rev-parse --abbrev-ref HEAD') do set "BRANCH=%%B"
if /i not "!BRANCH!"=="master" (
    echo ERROR: on branch "!BRANCH!". Releases are built from master.
    goto :fail
)

rem  A dirty tree is the quiet way to ship something you did not mean to: the
rem  runner builds what is pushed, not what is on your disk.
for /f "delims=" %%S in ('git status --porcelain') do (
    echo ERROR: you have uncommitted changes. Commit or stash them first -
    echo        the release is built from what is on GitHub, not from this folder.
    echo.
    git status --short
    goto :fail
)

echo Fetching origin...
git fetch origin master --quiet
if errorlevel 1 goto :fail

for /f "delims=" %%A in ('git rev-list --count origin/master..HEAD') do set "AHEAD=%%A"
for /f "delims=" %%A in ('git rev-list --count HEAD..origin/master') do set "BEHIND=%%A"

if not "!BEHIND!"=="0" (
    echo ERROR: master is !BEHIND! commit^(s^) behind origin. Pull first.
    goto :fail
)

if not "!AHEAD!"=="0" (
    echo You have !AHEAD! commit^(s^) not yet pushed. Pushing them now...
    git push origin master
    if errorlevel 1 goto :fail
    echo Pushed.
    echo.
)

rem --- Confirm, because this ships ------------------------------------------
for /f "tokens=2 delims=:, " %%V in ('findstr /r /c:"\"version\"" package.json') do (
    if not defined CURRENT set "CURRENT=%%~V"
)
echo Current version: !CURRENT!
echo Bump:            %BUMP%
echo.
echo This builds on GitHub and publishes a release. Every installed copy of
echo E-Estimate will be offered the update automatically.
echo.
set /p "CONFIRM=Type YES to release: "
if /i not "!CONFIRM!"=="YES" (
    echo Cancelled. Nothing was released.
    goto :done
)

echo.
echo Asking GitHub to build and release...
"%GH%" workflow run release.yml --ref master -f bump=%BUMP%
if errorlevel 1 (
    echo.
    echo ERROR: could not start the workflow. Check that .github\workflows\release.yml
    echo        is committed and pushed, and that Actions is enabled for the repo.
    goto :fail
)

echo Started. Waiting for GitHub to pick it up...
rem  `workflow run` returns before the run exists, so give the API a moment
rem  rather than watching a run that is not there yet.
timeout /t 8 /nobreak >nul

for /f "tokens=1" %%R in ('"%GH%" run list --workflow=release.yml --limit 1 --json databaseId --jq ".[0].databaseId"') do set "RUNID=%%R"
if defined RUNID (
    echo Watching run !RUNID! - this takes several minutes.
    echo.
    "%GH%" run watch !RUNID! --exit-status
    if errorlevel 1 (
        echo.
        echo The release FAILED. Open the log with:
        echo     gh run view !RUNID! --log-failed
        goto :fail
    )
    echo.
    echo Released. Assets:
    "%GH%" release view --json tagName,assets --jq ".tagName, (.assets[].name)"
) else (
    echo Could not find the run to watch. Check progress at:
    "%GH%" browse --no-browser --settings 2>nul
    echo     https://github.com/pramodsurya/E-Estimate/actions
)

goto :done

:fail
echo.
echo Release did not happen.
echo.
echo Press any key to exit...
pause >nul
endlocal
exit /b 1

:done
echo.
echo Press any key to exit...
pause >nul
endlocal
exit /b 0
