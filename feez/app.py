from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
import requests
import logging
try:
    import config
except ImportError:
    class config:
        DEBUG = True
        SECRET_KEY = 'dev-secret-key'
        LIBRETRANSLATE_URL = 'https://libretranslate.com/translate'
        LIBRETRANSLATE_API_KEY = None
        HOST = '0.0.0.0'
        PORT = 5000

app = Flask(__name__)
app.config['SECRET_KEY'] = config.SECRET_KEY
CORS(app)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def translate_with_libretranslate(text):
    """Translate using LibreTranslate API"""
    try:
        url = config.LIBRETRANSLATE_URL
        payload = {
            'q': text,
            'source': 'fi',
            'target': 'en',
            'format': 'text'
        }
        if config.LIBRETRANSLATE_API_KEY:
            payload['api_key'] = config.LIBRETRANSLATE_API_KEY
        response = requests.post(url, json=payload, timeout=10)
        data = response.json()
        if data.get('translatedText'):
            return data['translatedText']
        raise Exception('LibreTranslate failed')
    except Exception as e:
        logger.error(f"LibreTranslate error: {str(e)}")
        raise

# Routes
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/translate', methods=['POST'])
def translate():
    try:
        data = request.get_json()
        text = data.get('text', '').strip()
        if not text:
            return jsonify({'success': False, 'error': 'No text provided'}), 400
        translation = translate_with_libretranslate(text)
        return jsonify({'success': True, 'translation': translation, 'service': 'libretranslate'})
    except Exception as e:
        logger.error(f"Translation error: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/translate-batch', methods=['POST'])
def translate_batch():
    try:
        data = request.get_json()
        lines = data.get('lines', [])
        if not lines:
            return jsonify({'success': False, 'error': 'No lines provided'}), 400
        results = []
        for line in lines:
            if not line.strip():
                results.append({'success': False, 'translation': '', 'error': 'Empty line'})
                continue
            try:
                translation = translate_with_libretranslate(line)
                results.append({'success': True, 'translation': translation, 'service': 'libretranslate'})
            except Exception as e:
                results.append({'success': False, 'translation': '', 'error': str(e)})
        return jsonify({'success': True, 'results': results})
    except Exception as e:
        logger.error(f"Batch translation error: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500

if __name__ == '__main__':
    logger.info(f"Starting Flask server on {config.HOST}:{config.PORT}")
    logger.info(f"Debug mode: {getattr(config, 'DEBUG', False)}")
    logger.info(f"LibreTranslate endpoint: {config.LIBRETRANSLATE_URL}")
    app.run(debug=getattr(config, 'DEBUG', False), host=config.HOST, port=config.PORT)
