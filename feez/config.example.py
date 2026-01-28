# Configuration file for Finnish Practice Worksheet Generator
# Copy this file to config.py and add your API keys

import os

# Flask Configuration
DEBUG = True
SECRET_KEY = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')

# Translation API Keys
# Most services below work without API keys, but you can add them for better limits

# MyMemory Translation API (Free tier: 1000 requests/day)
# No API key required for basic usage
MYMEMORY_API_KEY = os.environ.get('MYMEMORY_API_KEY', None)

# LibreTranslate (Self-hosted or public instance)
# Public instance: https://libretranslate.com
LIBRETRANSLATE_URL = os.environ.get('LIBRETRANSLATE_URL', 'https://libretranslate.com/translate')
LIBRETRANSLATE_API_KEY = os.environ.get('LIBRETRANSLATE_API_KEY', None)

# Google Cloud Translation API (Official - requires API key)
# Sign up: https://cloud.google.com/translate
# Free tier: $10/month credit (500k characters)
GOOGLE_TRANSLATE_API_KEY = os.environ.get('GOOGLE_TRANSLATE_API_KEY', None)
GOOGLE_TRANSLATE_ENABLED = False  # Set to True when you have an API key

# DeepL Translation API (Free tier: 500k characters/month)
# Sign up: https://www.deepl.com/pro-api
DEEPL_API_KEY = os.environ.get('DEEPL_API_KEY', None)
DEEPL_ENABLED = False  # Set to True when you have an API key

# Microsoft Translator (Azure Cognitive Services)
# Sign up: https://azure.microsoft.com/en-us/services/cognitive-services/translator/
# Free tier: 2M characters/month
MICROSOFT_TRANSLATOR_KEY = os.environ.get('MICROSOFT_TRANSLATOR_KEY', None)
MICROSOFT_TRANSLATOR_REGION = os.environ.get('MICROSOFT_TRANSLATOR_REGION', 'global')
MICROSOFT_TRANSLATOR_ENABLED = False  # Set to True when you have an API key

# Rate Limiting
RATE_LIMIT_COOLDOWN = 60  # seconds

# Server Configuration
HOST = '0.0.0.0'
PORT = 5000
