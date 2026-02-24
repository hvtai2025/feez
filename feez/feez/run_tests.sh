#!/bin/bash

# Run tests with coverage

echo "🧪 Running Finnish App Unit Tests..."
echo ""

# Activate virtual environment
source venv/bin/activate

# Install test dependencies if needed
pip install -q pytest pytest-mock pytest-cov coverage

echo "Running unittest tests..."
python -m pytest test_app.py -v --tb=short

echo ""
echo "Running pytest tests..."
python -m pytest test_app_pytest.py -v --tb=short

echo ""
echo "Running coverage report..."
python -m pytest test_app.py test_app_pytest.py --cov=app --cov-report=term-missing --cov-report=html

echo ""
echo "✅ Tests complete! Coverage report saved to htmlcov/index.html"
