from flask import Flask, render_template, request, jsonify, Response
from flask_cors import CORS
import requests
import logging
import time
import os
import subprocess
from types import SimpleNamespace
from typing import Any
from requests import RequestException
from lessons_data import LESSON_DATABASE
try:
    import config as _config_module
    app_config: Any = _config_module
except ImportError:
    _base_dir = os.path.dirname(os.path.abspath(__file__))
    app_config = SimpleNamespace(
        DEBUG=True,
        SECRET_KEY='dev-secret-key',
        LIBRETRANSLATE_URL='https://libretranslate.com/translate',
        LIBRETRANSLATE_API_KEY=None,
        LOCAL_TTS_ENABLED=False,
        LOCAL_TTS_PROVIDER='piper',
        LOCAL_TTS_URL='http://localhost:5500/api/tts',
        LOCAL_TTS_VOICE='fi_FI-harri-medium',
        PIPER_BINARY_PATH=os.path.join(_base_dir, 'vendor', 'piper', 'piper', 'piper'),
        PIPER_MODEL_PATH=os.path.join(_base_dir, 'vendor', 'piper', 'voices', 'fi_FI-harri-medium.onnx'),
        PIPER_CONFIG_PATH=os.path.join(_base_dir, 'vendor', 'piper', 'voices', 'fi_FI-harri-medium.onnx.json'),
        HOST='0.0.0.0',
        PORT=5000,
    )

app = Flask(__name__)
app.config['SECRET_KEY'] = app_config.SECRET_KEY
CORS(app)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MAX_TEXT_LENGTH = 300
MAX_BATCH_LINES = 50
TRANSLATION_RETRIES = 3
TRANSLATION_RETRY_DELAY_SECONDS = 0.6
TTS_RETRIES = 2
TTS_RETRY_DELAY_SECONDS = 0.3
TRANSLATION_CACHE_TTL_SECONDS = 24 * 60 * 60
TTS_CACHE_TTL_SECONDS = 60 * 60
TRANSLATION_CACHE_MAX_SIZE = 500
TTS_CACHE_MAX_SIZE = 200

_translation_cache = {}
_tts_cache = {}


def _cache_get(cache, key, ttl_seconds):
    entry = cache.get(key)
    if not entry:
        return None

    expires_at, value = entry
    if expires_at < time.time():
        cache.pop(key, None)
        return None
    return value


def _cache_set(cache, key, value, ttl_seconds, max_size):
    if len(cache) >= max_size:
        # Drop the oldest inserted key to keep memory bounded.
        oldest_key = next(iter(cache))
        cache.pop(oldest_key, None)

    cache[key] = (time.time() + ttl_seconds, value)


def _resolve_local_path(path_value):
    if not path_value:
        return ''
    if os.path.isabs(path_value):
        return path_value
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), path_value)


def _json_error(message, status_code=400):
    return jsonify({'success': False, 'error': message}), status_code


def get_lessons(level=None):
    lessons = LESSON_DATABASE['lessons']
    if level:
        normalized_level = level.strip().upper()
        lessons = [lesson for lesson in lessons if lesson['level'].upper() == normalized_level]
    return lessons


def get_lesson_by_id(lesson_id):
    for lesson in LESSON_DATABASE['lessons']:
        if lesson['id'] == lesson_id:
            return lesson
    return None


def translate_with_libretranslate(text):
    """Translate using LibreTranslate API"""
    cache_key = text.strip().lower()
    cached_translation = _cache_get(_translation_cache, cache_key, TRANSLATION_CACHE_TTL_SECONDS)
    if cached_translation:
        return cached_translation

    url = app_config.LIBRETRANSLATE_URL
    payload = {
        'q': text,
        'source': 'fi',
        'target': 'en',
        'format': 'text'
    }
    if app_config.LIBRETRANSLATE_API_KEY:
        payload['api_key'] = app_config.LIBRETRANSLATE_API_KEY

    last_error = None
    for attempt in range(1, TRANSLATION_RETRIES + 1):
        try:
            response = requests.post(url, json=payload, timeout=10)
            response.raise_for_status()
            data = response.json()
            if data.get('translatedText'):
                translated = data['translatedText']
                _cache_set(
                    _translation_cache,
                    cache_key,
                    translated,
                    TRANSLATION_CACHE_TTL_SECONDS,
                    TRANSLATION_CACHE_MAX_SIZE,
                )
                return translated
            raise ValueError('Translation service returned an unexpected response')
        except RequestException as exc:
            last_error = exc
            if attempt < TRANSLATION_RETRIES:
                time.sleep(TRANSLATION_RETRY_DELAY_SECONDS)
                continue
            logger.error("LibreTranslate network error after %s attempts: %s", attempt, str(exc))
            raise ConnectionError('Translation service is temporarily unavailable') from exc
        except (TypeError, ValueError) as exc:
            logger.error("LibreTranslate parse error: %s", str(exc))
            raise RuntimeError('Translation service returned an invalid response') from exc

    raise ConnectionError('Translation service is temporarily unavailable') from last_error


def _validate_text_input(text):
    if not isinstance(text, str):
        return 'Text must be a string'
    cleaned = text.strip()
    if not cleaned:
        return 'No text provided'
    if len(cleaned) > MAX_TEXT_LENGTH:
        return f'Text is too long (max {MAX_TEXT_LENGTH} characters per line)'
    return None


def synthesize_speech_with_local_tts(text):
    """Synthesize Finnish speech using a configured local TTS provider."""
    tts_enabled = getattr(app_config, 'LOCAL_TTS_ENABLED', False)
    tts_provider = getattr(app_config, 'LOCAL_TTS_PROVIDER', 'piper').strip().lower()
    cache_key = f'{tts_provider}:{text.strip()}'

    if not tts_enabled:
        raise ConnectionError('Local TTS is not enabled')

    cached_tts = _cache_get(_tts_cache, cache_key, TTS_CACHE_TTL_SECONDS)
    if cached_tts:
        return cached_tts

    if tts_provider == 'piper':
        result = synthesize_speech_with_piper(text)
    else:
        result = synthesize_speech_with_opentts(text)

    _cache_set(
        _tts_cache,
        cache_key,
        result,
        TTS_CACHE_TTL_SECONDS,
        TTS_CACHE_MAX_SIZE,
    )
    return result


def synthesize_speech_with_piper(text):
    piper_binary = _resolve_local_path(getattr(app_config, 'PIPER_BINARY_PATH', ''))
    piper_model = _resolve_local_path(getattr(app_config, 'PIPER_MODEL_PATH', ''))
    piper_config = _resolve_local_path(getattr(app_config, 'PIPER_CONFIG_PATH', ''))

    if not piper_binary or not os.path.isfile(piper_binary):
        raise ConnectionError('Piper binary is unavailable')
    if not piper_model or not os.path.isfile(piper_model):
        raise ConnectionError('Piper model is unavailable')

    command = [piper_binary, '--model', piper_model, '--output_file', '-']
    if piper_config and os.path.isfile(piper_config):
        command.extend(['--config', piper_config])

    try:
        result = subprocess.run(
            command,
            input=text.encode('utf-8'),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
            timeout=20,
        )
    except (FileNotFoundError, subprocess.SubprocessError) as exc:
        logger.error('Piper execution failed: %s', str(exc))
        raise ConnectionError('Piper TTS service is unavailable') from exc

    if result.returncode != 0:
        stderr = result.stderr.decode('utf-8', errors='ignore').strip()
        logger.error('Piper synthesis failed: %s', stderr)
        raise RuntimeError('Piper TTS synthesis failed')

    if not result.stdout:
        raise RuntimeError('Piper returned empty audio')

    return result.stdout, 'audio/wav'


def synthesize_speech_with_opentts(text):
    tts_url = getattr(app_config, 'LOCAL_TTS_URL', '').strip()
    tts_voice = getattr(app_config, 'LOCAL_TTS_VOICE', 'fi_FI-harri-medium')

    if not tts_url:
        raise ConnectionError('Local TTS URL is not configured')

    params = {
        'text': text,
        'voice': tts_voice
    }

    last_error = None
    for attempt in range(1, TTS_RETRIES + 1):
        try:
            response = requests.get(tts_url, params=params, timeout=15)
            response.raise_for_status()
            if not response.content:
                raise ValueError('TTS service returned empty audio')
            content_type = response.headers.get('Content-Type', 'audio/wav')
            return response.content, content_type
        except RequestException as exc:
            last_error = exc
            if attempt < TTS_RETRIES:
                time.sleep(TTS_RETRY_DELAY_SECONDS)
                continue
            logger.error('Local TTS network error after %s attempts: %s', attempt, str(exc))
            raise ConnectionError('Local TTS service is unavailable') from exc
        except ValueError as exc:
            logger.error('Local TTS parse error: %s', str(exc))
            raise RuntimeError('Local TTS service returned invalid audio') from exc

    raise ConnectionError('Local TTS service is unavailable') from last_error

# Routes
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/translate', methods=['POST'])
def translate():
    try:
        data = request.get_json(silent=True) or {}
        text = data.get('text', '')
        validation_error = _validate_text_input(text)
        if validation_error:
            return _json_error(validation_error, 400)
        text = text.strip()
        translation = translate_with_libretranslate(text)
        return jsonify({'success': True, 'translation': translation, 'service': 'libretranslate'})
    except ConnectionError as exc:
        logger.error("Translation error: %s", str(exc))
        return _json_error('Translation service is temporarily unavailable', 503)
    except Exception as exc:
        logger.error("Unexpected translation error: %s", str(exc))
        return _json_error('Translation failed. Please try again.', 500)

@app.route('/api/translate-batch', methods=['POST'])
def translate_batch():
    try:
        data = request.get_json(silent=True) or {}
        lines = data.get('lines', [])
        if not isinstance(lines, list):
            return _json_error('Lines must be an array of strings', 400)
        if not lines:
            return _json_error('No lines provided', 400)
        if len(lines) > MAX_BATCH_LINES:
            return _json_error(f'Too many lines (max {MAX_BATCH_LINES} per request)', 400)

        results = []
        for line in lines:
            validation_error = _validate_text_input(line)
            if validation_error:
                results.append({'success': False, 'translation': '', 'error': validation_error})
                continue
            try:
                line = line.strip()
                translation = translate_with_libretranslate(line)
                results.append({'success': True, 'translation': translation, 'service': 'libretranslate'})
            except ConnectionError:
                results.append({'success': False, 'translation': '', 'error': 'Service unavailable'})
            except Exception:
                results.append({'success': False, 'translation': '', 'error': 'Translation failed'})
        return jsonify({'success': True, 'results': results})
    except Exception as exc:
        logger.error("Batch translation error: %s", str(exc))
        return _json_error('Batch translation failed. Please try again.', 500)


@app.route('/api/tts', methods=['POST'])
def text_to_speech():
    try:
        data = request.get_json(silent=True) or {}
        text = data.get('text', '')
        validation_error = _validate_text_input(text)
        if validation_error:
            return _json_error(validation_error, 400)

        audio_bytes, content_type = synthesize_speech_with_local_tts(text.strip())
        return Response(audio_bytes, mimetype=content_type)
    except ConnectionError as exc:
        logger.error('TTS error: %s', str(exc))
        return _json_error('Local TTS is unavailable', 503)
    except Exception as exc:
        logger.error('Unexpected TTS error: %s', str(exc))
        return _json_error('TTS failed. Please try again.', 500)


@app.route('/api/lessons', methods=['GET'])
def list_lessons():
    level = request.args.get('level', '').strip()
    lessons = get_lessons(level if level else None)
    summaries = [
        {
            'id': lesson['id'],
            'code': lesson['code'],
            'level': lesson['level'],
            'title': lesson['title'],
            'theme': lesson['theme'],
            'grammar': lesson['grammar'],
            'objectives': lesson['objectives'],
            'skills': lesson['skills'],
            'itemCount': len(lesson['items']),
        }
        for lesson in lessons
    ]
    return jsonify({
        'success': True,
        'version': LESSON_DATABASE['version'],
        'title': LESSON_DATABASE['title'],
        'lessons': summaries,
    })


@app.route('/api/lessons/<lesson_id>', methods=['GET'])
def get_lesson(lesson_id):
    lesson = get_lesson_by_id(lesson_id)
    if lesson is None:
        return _json_error('Lesson not found', 404)
    return jsonify({'success': True, 'lesson': lesson})

if __name__ == '__main__':
    logger.info(f"Starting Flask server on {app_config.HOST}:{app_config.PORT}")
    logger.info(f"Debug mode: {getattr(app_config, 'DEBUG', False)}")
    logger.info(f"LibreTranslate endpoint: {app_config.LIBRETRANSLATE_URL}")
    logger.info(f"Local TTS enabled: {getattr(app_config, 'LOCAL_TTS_ENABLED', False)}")
    app.run(debug=getattr(app_config, 'DEBUG', False), host=app_config.HOST, port=app_config.PORT)
