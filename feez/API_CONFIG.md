# API Configuration Guide

## Where to Update API Keys

### Option 1: Configuration File (Recommended)

1. Copy the example config:
```bash
cp config.example.py config.py
```

2. Edit [config.py](config.py) and add your API keys:
```python
# DeepL API Example
DEEPL_API_KEY = 'your-deepl-api-key-here'
DEEPL_ENABLED = True

# Google Cloud Translation API Example
GOOGLE_TRANSLATE_API_KEY = 'your-google-api-key-here'
GOOGLE_TRANSLATE_ENABLED = True
```

### Option 2: Environment Variables

1. Copy the example env file:
```bash
cp .env.example .env
```

2. Edit `.env` and add your keys:
```bash
DEEPL_API_KEY=your-deepl-api-key-here
GOOGLE_TRANSLATE_API_KEY=your-google-api-key-here
```

3. Install python-dotenv:
```bash
pip install python-dotenv
```

## Available API Services

### 1. MyMemory (Currently Active)
- **Status**: Works without API key
- **Free Tier**: 1000 requests/day
- **With Key**: 10,000 requests/day
- **Get Key**: Contact api@mymemory.translated.net
- **Config**: `MYMEMORY_API_KEY`

### 2. LibreTranslate (Currently Active)
- **Status**: Works without API key
- **Free Tier**: Unlimited (public instance)
- **Self-hosted**: You can host your own
- **Get Key**: https://libretranslate.com
- **Config**: `LIBRETRANSLATE_API_KEY`

### 3. Google Translate (Currently Active - Unofficial)
- **Status**: Works without API key (unofficial API)
- **Note**: May be rate-limited by Google

### 4. Google Cloud Translation API (Optional)
- **Status**: Requires API key
- **Free Tier**: $10/month credit (~500k characters)
- **Sign Up**: https://cloud.google.com/translate
- **Config**:
  ```python
  GOOGLE_TRANSLATE_API_KEY = 'YOUR-KEY-HERE'
  GOOGLE_TRANSLATE_ENABLED = True
  ```

### 5. DeepL API (Optional)
- **Status**: Requires API key
- **Free Tier**: 500,000 characters/month
- **Sign Up**: https://www.deepl.com/pro-api
- **Config**:
  ```python
  DEEPL_API_KEY = 'YOUR-KEY-HERE'
  DEEPL_ENABLED = True
  ```

### 6. Microsoft Translator (Optional)
- **Status**: Requires API key
- **Free Tier**: 2 million characters/month
- **Sign Up**: https://azure.microsoft.com/services/cognitive-services/translator/
- **Config**:
  ```python
  MICROSOFT_TRANSLATOR_KEY = 'YOUR-KEY-HERE'
  MICROSOFT_TRANSLATOR_REGION = 'YOUR-REGION'
  MICROSOFT_TRANSLATOR_ENABLED = True
  ```

### 7. Lingva Translate (Currently Active)
- **Status**: Works without API key
- **Free Tier**: Unlimited
- **Privacy-focused**: No API key needed

## Quick Setup Examples

### Example 1: Add DeepL API Key

Edit `config.py`:
```python
DEEPL_API_KEY = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890:fx'
DEEPL_ENABLED = True
```

### Example 2: Add Google Cloud Translation

Edit `config.py`:
```python
GOOGLE_TRANSLATE_API_KEY = 'AIzaSyA_your_actual_key_here'
GOOGLE_TRANSLATE_ENABLED = True
```

### Example 3: Use Environment Variables

Create `.env`:
```bash
SECRET_KEY=your-secret-key-for-production
DEEPL_API_KEY=your-deepl-key
GOOGLE_TRANSLATE_API_KEY=your-google-key
```

Then install dotenv:
```bash
pip install python-dotenv
```

Add to top of `app.py`:
```python
from dotenv import load_dotenv
load_dotenv()
```

## Current Setup (No Keys Required)

The app currently works **without any API keys** using:
- ✅ MyMemory (free, no key)
- ✅ LibreTranslate (free, no key)
- ✅ Google Translate unofficial (free, no key)
- ✅ Lingva Translate (free, no key)

These services automatically fall back to each other if rate limits are hit.

## Security Notes

⚠️ **Important**:
- Never commit `config.py` or `.env` to version control
- Both are already in `.gitignore`
- Use environment variables in production
- Keep API keys secret and secure
