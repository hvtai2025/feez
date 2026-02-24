
# Minimal configuration for LibreTranslate only
import os

DEBUG = True
SECRET_KEY = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')
LIBRETRANSLATE_URL = os.environ.get('LIBRETRANSLATE_URL', 'http://localhost:5001/translate')
LIBRETRANSLATE_API_KEY = os.environ.get('LIBRETRANSLATE_API_KEY', None)
HOST = '0.0.0.0'
PORT = 5000
