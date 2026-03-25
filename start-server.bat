@echo off
echo Starting Surf Game server...
echo Open your browser to: http://localhost:8080
echo Press Ctrl+C to stop.
echo.
python -m http.server 8080
pause
