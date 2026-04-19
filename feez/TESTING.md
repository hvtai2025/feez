# Test Documentation

## Overview
Unit and integration-style API tests for the LibreTranslate-only Flask application.

## Test Files

### test_app.py (unittest)
- Covers endpoint behavior and core translation helper behavior

### test_app_pytest.py (pytest)
- Covers request validation, success/failure status codes, and batch behavior

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

## Covered Areas

- ✅ API endpoint routing
- ✅ Request validation and limits
- ✅ Batch translation behavior
- ✅ LibreTranslate helper success and malformed response handling
- ✅ Temporary service unavailability handling

## Test Categories

### API Endpoint Tests
- GET / - Index page
- POST /api/translate - Single translation
- POST /api/translate-batch - Batch translation

### Edge Cases
- Invalid payload shape
- Non-string text
- Very long lines
- Too many batch lines
- Mixed success/failure in a batch

## Viewing Coverage Report

After running tests with coverage, open:
```
htmlcov/index.html
```

in your browser to see detailed coverage report.
