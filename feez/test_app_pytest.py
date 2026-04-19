from types import SimpleNamespace

import pytest
from app import app, synthesize_speech_with_local_tts, synthesize_speech_with_piper


@pytest.fixture
def client():
    app.config['TESTING'] = True
    with app.test_client() as test_client:
        yield test_client


def test_index_page(client):
    response = client.get('/')
    assert response.status_code == 200


def test_index_contains_adaptive_and_listening_modes(client):
    response = client.get('/')
    body = response.get_data(as_text=True)
    assert 'value="adaptive"' in body
    assert 'value="listening"' in body


def test_index_contains_smart_drill_and_goal_controls(client):
    response = client.get('/')
    body = response.get_data(as_text=True)
    assert 'id="smartDrillOnly"' in body
    assert 'id="grammarFilter"' in body
    assert 'id="dailyGoal"' in body
    assert 'id="queueSummary"' in body


def test_index_contains_lesson_mode_controls(client):
    response = client.get('/')
    body = response.get_data(as_text=True)
    assert 'id="contentSource"' in body
    assert 'id="lessonSelect"' in body
    assert 'id="lessonSkill"' in body
    assert 'Lesson Practice (A1-A2)' in body


def test_index_contains_start_button_and_modal(client):
    response = client.get('/')
    body = response.get_data(as_text=True)
    assert 'id="startLessonBtn"' in body
    assert 'id="lessonPlayModal"' in body
    assert 'id="closeModalBtn"' in body
    assert 'id="modalWorksheet"' in body


    response = client.post('/api/translate', json={})
    assert response.status_code == 400
    data = response.get_json()
    assert data['success'] is False


def test_translate_invalid_type(client):
    response = client.post('/api/translate', json={'text': 123})
    assert response.status_code == 400


def test_translate_too_long(client):
    response = client.post('/api/translate', json={'text': 'a' * 301})
    assert response.status_code == 400


def test_translate_success(client, mocker):
    mocker.patch('app.translate_with_libretranslate', return_value='Hello')
    response = client.post('/api/translate', json={'text': 'Hei'})
    assert response.status_code == 200
    data = response.get_json()
    assert data['success'] is True
    assert data['translation'] == 'Hello'
    assert data['service'] == 'libretranslate'


def test_translate_unavailable(client, mocker):
    mocker.patch('app.translate_with_libretranslate', side_effect=ConnectionError('down'))
    response = client.post('/api/translate', json={'text': 'Hei'})
    assert response.status_code == 503


def test_translate_batch_missing_lines(client):
    response = client.post('/api/translate-batch', json={})
    assert response.status_code == 400


def test_translate_batch_invalid_shape(client):
    response = client.post('/api/translate-batch', json={'lines': 'not-an-array'})
    assert response.status_code == 400


def test_translate_batch_too_many_lines(client):
    response = client.post('/api/translate-batch', json={'lines': ['Hei'] * 51})
    assert response.status_code == 400


def test_translate_batch_success(client, mocker):
    mocker.patch('app.translate_with_libretranslate', side_effect=['Hello', 'Thanks'])
    response = client.post('/api/translate-batch', json={'lines': ['Hei', 'Kiitos']})
    assert response.status_code == 200
    data = response.get_json()
    assert data['success'] is True
    assert len(data['results']) == 2
    assert data['results'][0]['success'] is True


def test_translate_batch_mixed_results(client, mocker):
    mocker.patch('app.translate_with_libretranslate', side_effect=['Hello', RuntimeError('bad')])
    response = client.post('/api/translate-batch', json={'lines': ['Hei', 'Kiitos']})
    assert response.status_code == 200
    data = response.get_json()
    assert data['results'][0]['success'] is True
    assert data['results'][1]['success'] is False


def test_tts_missing_text(client):
    response = client.post('/api/tts', json={})
    assert response.status_code == 400


def test_tts_success(client, mocker):
    mocker.patch('app.synthesize_speech_with_local_tts', return_value=(b'RIFF....', 'audio/wav'))
    response = client.post('/api/tts', json={'text': 'Hei'})
    assert response.status_code == 200
    assert response.mimetype == 'audio/wav'
    assert response.data.startswith(b'RIFF')


def test_tts_unavailable(client, mocker):
    mocker.patch('app.synthesize_speech_with_local_tts', side_effect=ConnectionError('down'))
    response = client.post('/api/tts', json={'text': 'Hei'})
    assert response.status_code == 503


def test_lessons_list_success(client):
    response = client.get('/api/lessons')
    assert response.status_code == 200
    data = response.get_json()
    assert data['success'] is True
    assert len(data['lessons']) >= 20


def test_lessons_filter_by_level(client):
    response = client.get('/api/lessons?level=A1')
    assert response.status_code == 200
    data = response.get_json()
    assert data['success'] is True
    assert all(lesson['level'] == 'A1' for lesson in data['lessons'])


def test_lesson_detail_success(client):
    response = client.get('/api/lessons/a1-01-greetings-introductions')
    assert response.status_code == 200
    data = response.get_json()
    assert data['success'] is True
    assert data['lesson']['code'] == 'A1-01-greetings-introductions'
    assert len(data['lesson']['items']) == 8


def test_lesson_detail_not_found(client):
    response = client.get('/api/lessons/does-not-exist')
    assert response.status_code == 404


def test_synthesize_speech_with_piper_success(mocker):
    mocker.patch('app.os.path.isfile', return_value=True)
    mock_run = mocker.patch('app.subprocess.run')
    mock_run.return_value = SimpleNamespace(returncode=0, stdout=b'RIFFDATA', stderr=b'')

    audio_bytes, content_type = synthesize_speech_with_piper('Hei')

    assert audio_bytes == b'RIFFDATA'
    assert content_type == 'audio/wav'
    mock_run.assert_called_once()


def test_synthesize_speech_with_local_tts_routes_to_piper(mocker):
    mocker.patch('app.app_config', SimpleNamespace(LOCAL_TTS_ENABLED=True, LOCAL_TTS_PROVIDER='piper'))
    mock_piper = mocker.patch('app.synthesize_speech_with_piper', return_value=(b'RIFFDATA', 'audio/wav'))

    result = synthesize_speech_with_local_tts('Hei')

    assert result == (b'RIFFDATA', 'audio/wav')
    mock_piper.assert_called_once_with('Hei')
