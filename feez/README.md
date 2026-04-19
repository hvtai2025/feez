# Finnish Practice Worksheet Generator

A web application for Finnish language practice with a Python Flask backend and LibreTranslate integration.

## Installation

```bash
pip install -r requirements.txt
python app.py
```

## Clean Docker Run (LibreTranslate)

Use this script to force-stop/remove any previous `libretranslate` container and start a fresh one:

```bash
./start_clean.sh
```

Open browser to `http://localhost:5000`

## API Endpoints

- `GET /` - Main application
- `POST /api/translate` - Translate single line
- `POST /api/translate-batch` - Translate multiple lines

## Features

- Multi-line Finnish input with auto-translation
- LibreTranslate-only backend (single consistent translation provider)
- Background translation with cancel
- Real-time progress updates
- Interactive on-screen practice modes:
    - Review mode (show both lines)
    - Recall mode (hide English until reveal)
    - Dictation mode (type Finnish and check answer)
- Session score and accuracy tracking
- Persistent phrase progress tracking in local storage
- Printable practice worksheets

## Better Local TTS (Piper)

The app now supports direct local Piper TTS for Finnish pronunciation and uses it by default when the Piper binary and model are available.

Install the local Piper runtime and Finnish voice model:

```bash
./setup_piper.sh
```

Start everything normally:

```bash
./start.sh
```

Useful environment variables:

```bash
export LOCAL_TTS_ENABLED=true
export LOCAL_TTS_PROVIDER=piper
export PIPER_BINARY_PATH=vendor/piper/piper/piper
export PIPER_MODEL_PATH=vendor/piper/voices/fi_FI-harri-medium.onnx
export PIPER_CONFIG_PATH=vendor/piper/voices/fi_FI-harri-medium.onnx.json
```

The frontend tries the Flask `/api/tts` endpoint first and falls back to browser speech only if local Piper is unavailable.

## Project Structure

```
feez/
├── app.py              # Flask backend
├── requirements.txt    # Dependencies
├── templates/
│   └── index.html     # HTML template
└── static/
    ├── styles.css     # Styles
    └── script.js      # Frontend JS
```
