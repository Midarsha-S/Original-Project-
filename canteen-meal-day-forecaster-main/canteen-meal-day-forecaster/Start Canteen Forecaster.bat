@echo off
setlocal
cd /d "%~dp0"
if not exist out mkdir out
echo Compiling Canteen Meal Day Forecaster...
javac --add-modules jdk.httpserver -d out src\*.java
if errorlevel 1 (
  echo.
  echo Compilation failed. Install JDK 17 or newer and make sure javac is on PATH.
  pause
  exit /b 1
)
echo.
echo Starting the web app at http://localhost:8080
echo Keep this window open while using the app. Press Ctrl+C to stop.
java --add-modules jdk.httpserver -cp out CanteenWebServer
if errorlevel 1 pause
