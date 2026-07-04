@echo off
cd /d "%~dp0.."
echo.
echo ====================================
echo   E-Estimate - Publish Update      
echo ====================================
echo.
echo Bump type: patch (0.1.0 → 0.1.1)
echo.
powershell -ExecutionPolicy Bypass -File "scripts\publish.ps1" patch
echo.
echo Press any key to exit...
pause >nul
