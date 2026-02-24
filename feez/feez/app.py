from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
import requests
import time
from urllib.parse import quote
import logging

# Import configuration
try:
    import config
except ImportError:
    # If config.py doesn't exist, use default settings
    class config:
        DEBUG = True
        SECRET_KEY = 'dev-secret-key'
        MYMEMORY_API_KEY = None
        LIBRETRANSLATE_URL = 'https://libretranslate.com/translate'
        LIBRETRANSLATE_API_KEY = None
        GOOGLE_TRANSLATE_API_KEY = None
        GOOGLE_TRANSLATE_ENABLED = False
        DEEPL_API_KEY = None
        DEEPL_ENABLED = False
        MICROSOFT_TRANSLATOR_KEY = None
        MICROSOFT_TRANSLATOR_REGION = 'global'
        MICROSOFT_TRANSLATOR_ENABLED = False
        RATE_LIMIT_COOLDOWN = 60
        HOST = '0.0.0.0'
        PORT = 5000

app = Flask(__name__)
app.config['SECRET_KEY'] = config.SECRET_KEY
CORS(app)  # Enable CORS for all routes

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Rate limiting tracking
rate_limited_services = {}
RATE_LIMIT_COOLDOWN = config.RATE_LIMIT_COOLDOWN  # seconds

# Translation service configurations
translation_services = {
    'mymemory': {
        'name': 'MyMemory',
        'daily_limit': 1000,
    },
    'libretranslate': {
        'name': 'LibreTranslate (Local)',
        'daily_limit': 'unlimited',
    },
    'google': {
        'name': 'Google Translate',
        'daily_limit': 'unofficial',
    },
    'lingva': {
        'name': 'Lingva Translate',
        'daily_limit': 'unlimited',
    }
}

def is_service_available(service_key):
    """Check if a service is available (not rate-limited)"""
    if service_key in rate_limited_services:
        time_elapsed = time.time() - rate_limited_services[service_key]
        if time_elapsed < RATE_LIMIT_COOLDOWN:
            return False
        else:
            del rate_limited_services[service_key]
    return True

def mark_service_rate_limited(service_key):
    """Mark a service as rate-limited"""
    rate_limited_services[service_key] = time.time()
    logger.info(f"{service_key} marked as rate-limited")

def is_rate_limit_error(error_msg):
    """Check if error is related to rate limiting"""
    rate_limit_keywords = ['rate limit', 'too many requests', '429', 'quota', 'limit exceeded']
    return any(keyword in str(error_msg).lower() for keyword in rate_limit_keywords)

# Translation functions
def translate_with_mymemory(text):
    """Translate using MyMemory API"""
    try:
        url = f"https://api.mymemory.translated.net/get?q={quote(text)}&langpair=fi|en"
        
        # Add API key if available for higher limits
        if config.MYMEMORY_API_KEY:
            url += f"&key={config.MYMEMORY_API_KEY}"
        
        response = requests.get(url, timeout=10)
        
        if response.status_code == 429:
            raise Exception('Rate limit exceeded')
        
        data = response.json()
        
        if data.get('responseStatus') == 200 and data.get('responseData', {}).get('translatedText'):
            return data['responseData']['translatedText']
        
        raise Exception('MyMemory translation failed')
    except Exception as e:
        logger.error(f"MyMemory error: {str(e)}")
        raise

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
        
        # Add API key if available
        if config.LIBRETRANSLATE_API_KEY:
            payload['api_key'] = config.LIBRETRANSLATE_API_KEY
        
        response = requests.post(url, json=payload, timeout=10)
        
        if response.status_code == 429:
            raise Exception('Rate limit exceeded')
        
        data = response.json()
        
        if data.get('translatedText'):
            return data['translatedText']
        
        raise Exception('LibreTranslate failed')
    except Exception as e:
        logger.error(f"LibreTranslate error: {str(e)}")
        raise

def translate_with_google(text):
    """Translate using Google Translate (unofficial API)"""
    try:
        url = f"https://translate.googleapis.com/translate_a/single?client=gtx&sl=fi&tl=en&dt=t&q={quote(text)}"
        response = requests.get(url, timeout=10)
        
        if response.status_code == 429:
            raise Exception('Rate limit exceeded')
        
        data = response.json()
        
        if data and data[0] and data[0][0] and data[0][0][0]:
            return data[0][0][0]
        
        raise Exception('Google Translate failed')
    except Exception as e:
        logger.error(f"Google Translate error: {str(e)}")
        raise

def translate_with_lingva(text):
    """Translate using Lingva Translate API"""
    try:
        url = f"https://lingva.ml/api/v1/fi/en/{quote(text)}"
        response = requests.get(url, timeout=10)
        
        if response.status_code == 429:
            raise Exception('Rate limit exceeded')
        
        data = response.json()
        
        if data.get('translation'):
            return data['translation']
        
        raise Exception('Lingva Translate failed')
    except Exception as e:
        logger.error(f"Lingva Translate error: {str(e)}")
        raise

# Map service keys to functions (prioritized order - local LibreTranslate first)
translation_functions = {
    'libretranslate': translate_with_libretranslate,
    'mymemory': translate_with_mymemory,
    'google': translate_with_google,
    'lingva': translate_with_lingva
}

def try_all_services(text):
    """Try all available translation services"""
    for service_key, func in translation_functions.items():
        if not is_service_available(service_key):
            logger.info(f"Skipping {service_key} - rate limited")
            continue
        
        try:
            result = func(text)
            if result:
                logger.info(f"Translation successful with {service_key}")
                return {
                    'success': True,
                    'translation': result,
                    'service': service_key
                }
        except Exception as e:
            logger.warning(f"{service_key} failed: {str(e)}")
            
            if is_rate_limit_error(str(e)):
                mark_service_rate_limited(service_key)
            
            continue
    
    return {
        'success': False,
        'error': 'All translation services failed'
    }

# Routes
@app.route('/')
def index():
    """Serve the main page"""
    return render_template('index.html')

@app.route('/api/translate', methods=['POST'])
def translate():
    """Translate a single line of text"""
    try:
        data = request.get_json()
        text = data.get('text', '').strip()
        service = data.get('service', 'auto')
        
        if not text:
            return jsonify({
                'success': False,
                'error': 'No text provided'
            }), 400
        
        if service == 'auto':
            # Try all services
            result = try_all_services(text)
        else:
            # Use specific service
            if service not in translation_functions:
                return jsonify({
                    'success': False,
                    'error': 'Invalid service'
                }), 400
            
            if not is_service_available(service):
                # Try alternatives
                result = try_all_services(text)
            else:
                try:
                    translation = translation_functions[service](text)
                    result = {
                        'success': True,
                        'translation': translation,
                        'service': service
                    }
                except Exception as e:
                    if is_rate_limit_error(str(e)):
                        mark_service_rate_limited(service)
                    result = try_all_services(text)
        
        if result['success']:
            return jsonify(result)
        else:
            return jsonify(result), 503
            
    except Exception as e:
        logger.error(f"Translation error: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/translate-batch', methods=['POST'])
def translate_batch():
    """Translate multiple lines of text"""
    try:
        data = request.get_json()
        lines = data.get('lines', [])
        service = data.get('service', 'auto')
        
        if not lines:
            return jsonify({
                'success': False,
                'error': 'No lines provided'
            }), 400
        
        results = []
        
        for line in lines:
            if not line.strip():
                results.append({
                    'success': False,
                    'translation': '',
                    'error': 'Empty line'
                })
                continue
            
            if service == 'auto':
                result = try_all_services(line)
            else:
                if service not in translation_functions:
                    result = {
                        'success': False,
                        'error': 'Invalid service'
                    }
                elif not is_service_available(service):
                    result = try_all_services(line)
                else:
                    try:
                        translation = translation_functions[service](line)
                        result = {
                            'success': True,
                            'translation': translation,
                            'service': service
                        }
                    except Exception as e:
                        if is_rate_limit_error(str(e)):
                            mark_service_rate_limited(service)
                        result = try_all_services(line)
            
            results.append(result)
            
            # Small delay between requests
            time.sleep(0.5)
        
        return jsonify({
            'success': True,
            'results': results
        })
        
    except Exception as e:
        logger.error(f"Batch translation error: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/services', methods=['GET'])
def get_services():
    """Get available translation services and their status"""
    services_status = {}
    
    for key, info in translation_services.items():
        services_status[key] = {
            'name': info['name'],
            'daily_limit': info['daily_limit'],
            'available': is_service_available(key)
        }
    
    return jsonify({
        'success': True,
        'services': services_status
    })

if __name__ == '__main__':
    logger.info(f"Starting Flask server on {config.HOST}:{config.PORT}")
    logger.info(f"Debug mode: {config.DEBUG}")
    logger.info("Available translation services:")
    logger.info(f"  - LibreTranslate (Local) at {config.LIBRETRANSLATE_URL} [PRIMARY]")
    logger.info("  - MyMemory (Free, no key required)")
    logger.info("  - Google Translate (Unofficial)")
    logger.info("  - Lingva Translate (Free)")
    if config.GOOGLE_TRANSLATE_ENABLED:
        logger.info("  - Google Cloud Translation API (ENABLED)")
    if config.DEEPL_ENABLED:
        logger.info("  - DeepL API (ENABLED)")
    if config.MICROSOFT_TRANSLATOR_ENABLED:
        logger.info("  - Microsoft Translator (ENABLED)")
    
    app.run(debug=config.DEBUG, host=config.HOST, port=config.PORT)
