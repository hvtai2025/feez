import json
import unittest
from unittest.mock import patch, MagicMock

from app import app, translate_with_libretranslate


class TestFlaskApp(unittest.TestCase):
    def setUp(self):
        self.app = app
        self.app.config['TESTING'] = True
        self.client = self.app.test_client()

    def test_index_route(self):
        response = self.client.get('/')
        self.assertEqual(response.status_code, 200)

    @patch('app.translate_with_libretranslate')
    def test_translate_success(self, mock_translate):
        mock_translate.return_value = 'Hello'
        response = self.client.post('/api/translate', json={'text': 'Hei'})
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertTrue(data['success'])

    def test_translate_missing_text(self):
        response = self.client.post('/api/translate', json={})
        self.assertEqual(response.status_code, 400)

    def test_translate_non_string_text(self):
        response = self.client.post('/api/translate', json={'text': 10})
        self.assertEqual(response.status_code, 400)

    def test_translate_batch_missing_lines(self):
        response = self.client.post('/api/translate-batch', json={})
        self.assertEqual(response.status_code, 400)

    @patch('app.translate_with_libretranslate')
    def test_translate_batch_success(self, mock_translate):
        mock_translate.side_effect = ['Hello', 'Thank you']
        response = self.client.post('/api/translate-batch', json={'lines': ['Hei', 'Kiitos']})
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertTrue(data['success'])
        self.assertEqual(len(data['results']), 2)

    @patch('app.requests.post')
    def test_translate_with_libretranslate_success(self, mock_post):
        mock_response = MagicMock()
        mock_response.raise_for_status.return_value = None
        mock_response.json.return_value = {'translatedText': 'Hello'}
        mock_post.return_value = mock_response

        result = translate_with_libretranslate('Hei')
        self.assertEqual(result, 'Hello')

    @patch('app.requests.post')
    def test_translate_with_libretranslate_bad_payload(self, mock_post):
        mock_response = MagicMock()
        mock_response.raise_for_status.return_value = None
        mock_response.json.return_value = {'unexpected': 'shape'}
        mock_post.return_value = mock_response

        with self.assertRaises(RuntimeError):
            translate_with_libretranslate('Hei')


if __name__ == '__main__':
    unittest.main()
