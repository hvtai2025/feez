# Default configuration - copy from config.example.py and modify
import os

DEBUG = True
SECRET_KEY = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')

# Translation API Keys
MYMEMORY_API_KEY = None
LIBRETRANSLATE_URL = 'http://localhost:5001/translate'
LIBRETRANSLATE_API_KEY = None

# Google Cloud Translation API
GOOGLE_TRANSLATE_API_KEY = None
GOOGLE_TRANSLATE_ENABLED = False

# DeepL Translation API
DEEPL_API_KEY = None
DEEPL_ENABLED = False

# Microsoft Translator
MICROSOFT_TRANSLATOR_KEY = None
MICROSOFT_TRANSLATOR_REGION = 'global'
MICROSOFT_TRANSLATOR_ENABLED = False

# Rate Limiting
RATE_LIMIT_COOLDOWN = 60

# Server Configuration
HOST = '0.0.0.0'
PORT = 5000
