# Test Documentation

## Overview
Comprehensive unit tests for the Finnish Practice Worksheet Generator Flask application.

## Test Files

### test_app.py (unittest)
- **26 test cases** using Python's built-in unittest framework
- Tests API endpoints, translation functions, rate limiting, and edge cases

### test_app_pytest.py (pytest)
- **9 test cases** using pytest framework
- Demonstrates pytest fixtures and parametrized tests

## Running Tests

### Quick Run
```bash
./run_tests.sh
```

### Run unittest tests
```bash
python -m pytest test_app.py -v
```

### Run pytest tests
```bash
python -m pytest test_app_pytest.py -v
```

### Run all tests with coverage
```bash
python -m pytest test_app.py test_app_pytest.py -v --cov=app --cov-report=html
```

## Test Coverage

**Current Coverage: 77%**

### Covered Areas
- ✅ API endpoint routing
- ✅ Request validation
- ✅ Translation service selection
- ✅ Rate limiting logic
- ✅ Error handling
- ✅ Service availability checking

### Not Covered (23%)
- Some error paths in translation functions
- Network timeout scenarios
- Complex service failure combinations

## Test Categories

### API Endpoint Tests (14 tests)
- GET / - Index page
- POST /api/translate - Single translation
- POST /api/translate-batch - Batch translation
- GET /api/services - Service status

### Rate Limiting Tests (4 tests)
- Service availability
- Rate limit marking
- Rate limit expiration
- Error detection

### Translation Function Tests (8 tests)
- MyMemory API
- LibreTranslate API
- Google Translate API
- Lingva Translate API

### Integration Tests (3 tests)
- Service fallback
- All services failure
- Rate limit marking

### Edge Cases (6 tests)
- Invalid JSON
- Special characters
- Very long text
- Large batches
- Empty input

## Viewing Coverage Report

After running tests with coverage, open:
```
htmlcov/index.html
```

in your browser to see detailed coverage report.
