
# Minimal configuration for LibreTranslate only
import os

DEBUG = True
SECRET_KEY = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')
LIBRETRANSLATE_URL = os.environ.get('LIBRETRANSLATE_URL', 'http://localhost:5001/translate')
LIBRETRANSLATE_API_KEY = os.environ.get('LIBRETRANSLATE_API_KEY', None)
LOCAL_TTS_ENABLED = os.environ.get('LOCAL_TTS_ENABLED', 'true').lower() == 'true'
LOCAL_TTS_PROVIDER = os.environ.get('LOCAL_TTS_PROVIDER', 'piper')
LOCAL_TTS_URL = os.environ.get('LOCAL_TTS_URL', 'http://localhost:5500/api/tts')
LOCAL_TTS_VOICE = os.environ.get('LOCAL_TTS_VOICE', 'fi_FI-harri-medium')
PIPER_BINARY_PATH = os.environ.get('PIPER_BINARY_PATH', 'vendor/piper/piper/piper')
PIPER_MODEL_PATH = os.environ.get('PIPER_MODEL_PATH', 'vendor/piper/voices/fi_FI-harri-medium.onnx')
PIPER_CONFIG_PATH = os.environ.get('PIPER_CONFIG_PATH', 'vendor/piper/voices/fi_FI-harri-medium.onnx.json')
HOST = '0.0.0.0'
PORT = 5000
