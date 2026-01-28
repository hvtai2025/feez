# Finnish Practice Worksheet Generator - Flask Backend

A web application for generating custom Finnish language practice worksheets with **Python Flask backend** for translation services.

## Installation

```bash
pip install -r requirements.txt
python app.py
```

Open browser to `http://localhost:5000`

## API Endpoints

- `GET /` - Main application
- `POST /api/translate` - Translate single line
- `POST /api/translate-batch` - Translate multiple lines
- `GET /api/services` - Get service status

## Features

- Multi-line Finnish input with auto-translation
- Multiple translation services (MyMemory, LibreTranslate, Google, Lingva)
- Auto-switching when rate limits hit
- Background translation with cancel
- Real-time progress updates
- Printable practice worksheets

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
