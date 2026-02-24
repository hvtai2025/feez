import pytest
from app import app, rate_limited_services


@pytest.fixture
def client():
    """Create test client"""
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client


@pytest.fixture(autouse=True)
def reset_rate_limits():
    """Reset rate limits before each test"""
    rate_limited_services.clear()
    yield
    rate_limited_services.clear()


def test_index_page(client):
    """Test that index page loads"""
    response = client.get('/')
    assert response.status_code == 200


def test_translate_success(client, mocker):
    """Test successful translation"""
    mock_translate = mocker.patch('app.try_all_services')
    mock_translate.return_value = {
        'success': True,
        'translation': 'Hello',
        'service': 'mymemory'
    }
    
    response = client.post('/api/translate', json={
        'text': 'Hei',
        'service': 'auto'
    })
    
    assert response.status_code == 200
    data = response.get_json()
    assert data['success'] is True
    assert data['translation'] == 'Hello'


def test_translate_missing_text(client):
    """Test translation without text"""
    response = client.post('/api/translate', json={'service': 'auto'})
    assert response.status_code == 400


def test_translate_batch(client, mocker):
    """Test batch translation"""
    mock_translate = mocker.patch('app.try_all_services')
    mock_translate.side_effect = [
        {'success': True, 'translation': 'Hello', 'service': 'google'},
        {'success': True, 'translation': 'Thanks', 'service': 'google'}
    ]
    
    response = client.post('/api/translate-batch', json={
        'lines': ['Hei', 'Kiitos'],
        'service': 'auto'
    })
    
    assert response.status_code == 200
    data = response.get_json()
    assert data['success'] is True
    assert len(data['results']) == 2


def test_get_services_status(client):
    """Test getting services status"""
    response = client.get('/api/services')
    assert response.status_code == 200
    data = response.get_json()
    assert 'services' in data
    assert 'mymemory' in data['services']


@pytest.mark.parametrize('text,expected', [
    ('Rate limit exceeded', True),
    ('429 error', True),
    ('Too many requests', True),
    ('Connection error', False),
])
def test_rate_limit_detection(text, expected):
    """Test rate limit error detection"""
    from app import is_rate_limit_error
    assert is_rate_limit_error(text) == expected
