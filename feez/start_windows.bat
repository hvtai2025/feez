@echo off
REM Finnish Learning App - Windows Startup Script

ECHO 🇫🇮 Starting Finnish Practice Worksheet Generator...

REM Check for Docker
where docker >nul 2>nul || (
    ECHO Docker is not installed or not in PATH. Please install Docker Desktop and ensure it is running.
    PAUSE
    EXIT /B 1
)

REM Check if Docker is running
FOR /F "tokens=2 delims=: " %%I IN ('docker info 2^>nul ^| findstr /C:"Server Version"') DO SET DOCKER_RUNNING=1
IF NOT DEFINED DOCKER_RUNNING (
    ECHO Docker does not appear to be running. Please start Docker Desktop.
    PAUSE
    EXIT /B 1
)

REM Check if LibreTranslate image exists
FOR /F "tokens=*" %%i IN ('docker images -q libretranslate/libretranslate') DO SET LIBRE_IMG=%%i
IF "%LIBRE_IMG%"=="" (
    ECHO Pulling LibreTranslate Docker image...
    docker pull libretranslate/libretranslate
)

REM Check if LibreTranslate container is running
FOR /F "tokens=*" %%i IN ('docker ps -q -f name=libretranslate') DO SET LIBRE_RUNNING=%%i
IF "%LIBRE_RUNNING%"=="" (
    REM Check if container exists but is stopped
    FOR /F "tokens=*" %%i IN ('docker ps -aq -f name=libretranslate') DO SET LIBRE_EXISTS=%%i
    IF NOT "%LIBRE_EXISTS%"=="" (
        ECHO Starting existing LibreTranslate container...
        docker start libretranslate
    ) ELSE (
        ECHO Running new LibreTranslate container...
        docker run -d --name libretranslate -p 5001:5000 libretranslate/libretranslate --load-only en,fi
    )
    ECHO LibreTranslate started on http://localhost:5001
) ELSE (
    ECHO LibreTranslate is already running
)

REM Check for Python
where python >nul 2>nul || (
    ECHO Python is not installed. Please install Python 3.7+ and rerun this script.
    PAUSE
    EXIT /B 1
)

REM Create virtual environment if it doesn't exist
IF NOT EXIST venv (
    ECHO Creating virtual environment...
    python -m venv venv
    IF ERRORLEVEL 1 (
        ECHO Failed to create virtual environment.
        PAUSE
        EXIT /B 1
    )
)

REM Activate virtual environment
CALL venv\Scripts\activate

REM Install dependencies
ECHO Installing dependencies...
pip install -r requirements.txt

ECHO Starting Flask server...
ECHO Open your browser to: http://localhost:5000
ECHO Press CTRL+C to stop the server
python app.py
