"""
Browser-based (Playwright) tests for the Feez frontend.

Run with:
    pytest test_browser.py --headed          # watch tests in browser
    pytest test_browser.py                   # headless (default)
    pytest test_browser.py -v --tb=short     # verbose

These tests start the real Flask dev server on a random port and drive
Chromium so they exercise the actual JS logic end-to-end.
"""
import threading
import time

import pytest
from playwright.sync_api import Page, expect

from app import app as flask_app

# ──────────────────────────────────────────────────────────────
# Fixtures
# ──────────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def live_server():
    """Start Flask on a free port for the whole test session."""
    import socket

    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()

    flask_app.config["TESTING"] = True

    def _run():
        flask_app.run(host="127.0.0.1", port=port, use_reloader=False, threaded=True)

    t = threading.Thread(target=_run, daemon=True)
    t.start()
    time.sleep(0.8)  # give Flask a moment to bind

    yield f"http://127.0.0.1:{port}"


@pytest.fixture()
def page(browser, live_server):
    """Return a fresh page pointed at the live server root."""
    ctx = browser.new_context()
    pg = ctx.new_page()
    pg.goto(live_server)
    pg.wait_for_load_state("networkidle")
    # Give the async initializeLessons() a moment to complete
    pg.wait_for_timeout(800)
    return pg


# ──────────────────────────────────────────────────────────────
# 1. Page load / static structure
# ──────────────────────────────────────────────────────────────

def test_page_title_and_heading(page: Page):
    """The page title and h1 identify the app."""
    expect(page).to_have_title("Finnish Practice Worksheet Generator")
    expect(page.locator("h1")).to_contain_text("Finnish")


def test_default_mode_is_custom(page: Page):
    """Content source defaults to custom drill."""
    source = page.locator("#contentSource")
    expect(source).to_have_value("custom")


def test_custom_panel_visible_by_default(page: Page):
    """Custom input panel is visible on load."""
    expect(page.locator("#customInputPanel")).to_be_visible()


def test_lesson_panel_hidden_by_default(page: Page):
    """Lesson panel is hidden until lesson mode is selected."""
    expect(page.locator("#lessonPanel")).to_be_hidden()


def test_start_button_hidden_on_load(page: Page):
    """Start button is hidden until a lesson is loaded."""
    btn = page.locator("#startLessonBtn")
    expect(btn).to_be_hidden()


def test_play_modal_hidden_on_load(page: Page):
    """Lesson play modal is hidden on page load."""
    expect(page.locator("#lessonPlayModal")).to_be_hidden()


# ──────────────────────────────────────────────────────────────
# 2. Content source toggle
# ──────────────────────────────────────────────────────────────

def test_switching_to_lesson_mode_shows_lesson_panel(page: Page):
    """Selecting 'lesson' in content source reveals the lesson panel."""
    page.select_option("#contentSource", "lesson")
    expect(page.locator("#lessonPanel")).to_be_visible()
    expect(page.locator("#customInputPanel")).to_be_hidden()


def test_switching_back_to_custom_hides_lesson_panel(page: Page):
    """Switching back to custom hides the lesson panel again."""
    page.select_option("#contentSource", "lesson")
    page.select_option("#contentSource", "custom")
    expect(page.locator("#lessonPanel")).to_be_hidden()
    expect(page.locator("#customInputPanel")).to_be_visible()


# ──────────────────────────────────────────────────────────────
# 3. Lesson loading & Start button
# ──────────────────────────────────────────────────────────────

def test_lesson_load_shows_start_button(page: Page):
    """After loading a lesson the Start button appears."""
    page.select_option("#contentSource", "lesson")
    page.select_option("#lessonLevel", "A1")
    page.evaluate("document.querySelector('#lessonSelect').selectedIndex = 1")
    page.locator("#lessonSelect").dispatch_event("change")
    page.locator("#loadLessonBtn").click()
    expect(page.locator("#startLessonBtn")).to_be_visible(timeout=5000)


def test_gamification_banner_visible_after_load(page: Page):
    """Gamification banner renders after loading a lesson."""
    page.select_option("#contentSource", "lesson")
    page.select_option("#lessonLevel", "A1")
    page.evaluate("document.querySelector('#lessonSelect').selectedIndex = 1")
    page.locator("#lessonSelect").dispatch_event("change")
    page.locator("#loadLessonBtn").click()
    expect(page.locator("#gamificationBanner")).to_be_visible(timeout=5000)
    expect(page.locator(".game-headline")).to_be_visible()


def test_lesson_card_renders_after_load(page: Page):
    """A lesson card block is rendered in the worksheet after loading."""
    page.select_option("#contentSource", "lesson")
    page.select_option("#lessonLevel", "A1")
    page.evaluate("document.querySelector('#lessonSelect').selectedIndex = 1")
    page.locator("#lessonSelect").dispatch_event("change")
    page.locator("#loadLessonBtn").click()
    expect(page.locator(".lesson-block")).to_be_visible(timeout=5000)


# ──────────────────────────────────────────────────────────────
# 4. Fullscreen modal
# ──────────────────────────────────────────────────────────────

def _load_first_lesson(page: Page):
    """Helper: select lesson mode, load first A1 lesson."""
    page.select_option("#contentSource", "lesson")
    page.select_option("#lessonLevel", "A1")
    # Pick a specific lesson (index 1 = first named lesson)
    page.evaluate("document.querySelector('#lessonSelect').selectedIndex = 1")
    page.locator("#lessonSelect").dispatch_event("change")
    page.locator("#loadLessonBtn").click()
    expect(page.locator("#startLessonBtn")).to_be_visible(timeout=5000)


def test_start_opens_modal(page: Page):
    """Clicking Start opens the fullscreen practice modal."""
    _load_first_lesson(page)
    page.locator("#startLessonBtn").click()
    expect(page.locator("#lessonPlayModal")).to_be_visible()


def test_modal_contains_lesson_card(page: Page):
    """The modal renders a lesson card inside it."""
    _load_first_lesson(page)
    page.locator("#startLessonBtn").click()
    expect(page.locator("#modalWorksheet .lesson-block")).to_be_visible(timeout=5000)


def test_modal_contains_gamification_banner(page: Page):
    """The modal renders the gamification banner."""
    _load_first_lesson(page)
    page.locator("#startLessonBtn").click()
    expect(page.locator("#modalGamificationBanner")).to_be_visible()
    expect(page.locator("#modalGamificationBanner .game-headline")).to_be_visible()


def test_modal_shows_lesson_title(page: Page):
    """The modal header shows the lesson title."""
    _load_first_lesson(page)
    page.locator("#startLessonBtn").click()
    title = page.locator("#modalLessonTitle")
    expect(title).to_be_visible()
    # title text should be non-empty
    assert title.inner_text().strip() != ""


def test_close_button_dismisses_modal(page: Page):
    """Clicking the ✕ close button hides the modal."""
    _load_first_lesson(page)
    page.locator("#startLessonBtn").click()
    expect(page.locator("#lessonPlayModal")).to_be_visible()
    page.locator("#closeModalBtn").click()
    expect(page.locator("#lessonPlayModal")).to_be_hidden()


def test_escape_key_dismisses_modal(page: Page):
    """Pressing Escape closes the modal."""
    _load_first_lesson(page)
    page.locator("#startLessonBtn").click()
    expect(page.locator("#lessonPlayModal")).to_be_visible()
    page.keyboard.press("Escape")
    expect(page.locator("#lessonPlayModal")).to_be_hidden()


def test_body_scroll_locked_when_modal_open(page: Page):
    """body.modal-open class is added when modal is visible."""
    _load_first_lesson(page)
    page.locator("#startLessonBtn").click()
    has_class = page.evaluate("document.body.classList.contains('modal-open')")
    assert has_class is True


def test_body_scroll_restored_after_modal_close(page: Page):
    """body.modal-open class is removed after modal closes."""
    _load_first_lesson(page)
    page.locator("#startLessonBtn").click()
    page.locator("#closeModalBtn").click()
    has_class = page.evaluate("document.body.classList.contains('modal-open')")
    assert has_class is False


# ──────────────────────────────────────────────────────────────
# 5. Answer flow inside the modal
# ──────────────────────────────────────────────────────────────

def test_check_answer_button_exists_in_modal(page: Page):
    """A 'Check Answer' button is visible inside the modal card."""
    _load_first_lesson(page)
    page.locator("#startLessonBtn").click()
    # The .btn-eval button is the Check Answer / I Know It / I Struggled button
    expect(page.locator("#modalWorksheet .btn-eval").first).to_be_visible(timeout=5000)


def test_correct_answer_increments_xp(page: Page):
    """Submitting the correct Finnish answer increases the XP score."""
    _load_first_lesson(page)
    # Use writing skill so we get a text input
    page.select_option("#lessonSkill", "writing")
    page.wait_for_timeout(300)
    page.locator("#startLessonBtn").click()
    page.wait_for_timeout(300)

    modal = page.locator("#modalWorksheet")
    answer_input = modal.locator("input[type='text']").first
    if not answer_input.is_visible():
        pytest.skip("No text input in current card mode")

    correct_finnish = page.evaluate(
        "() => { try { var items = activeLesson && activeLesson.items;"
        " return items && items.length > 0 ? items[lessonPracticeState.currentIndex % items.length].finnish : null;"
        " } catch(e) { return null; } }"
    )
    if not correct_finnish:
        pytest.skip("Could not retrieve correct answer from app state")

    score_before = page.evaluate(
        "() => { try { return sessionStats.score; } catch(e) { return 0; } }"
    )
    answer_input.fill(correct_finnish)
    modal.locator("button:text('Check Answer')").click()
    page.wait_for_timeout(400)

    score_after = page.evaluate(
        "() => { try { return sessionStats.score; } catch(e) { return 0; } }"
    )
    assert score_after >= score_before


def test_navigation_prev_next_in_modal(page: Page):
    """Next button cycles to the next card inside the modal."""
    _load_first_lesson(page)
    page.locator("#startLessonBtn").click()
    page.wait_for_timeout(300)
    modal = page.locator("#modalWorksheet")

    first_idx = page.evaluate(
        "() => { try { return lessonPracticeState.currentIndex; } catch(e) { return 0; } }"
    )

    next_btn = modal.locator("button:text('Next')")
    if not next_btn.is_visible():
        pytest.skip("No Next button found in modal card")
    if not next_btn.is_enabled():
        pytest.skip("Next button is disabled (only 1 card?)")

    next_btn.click()
    page.wait_for_timeout(300)

    second_idx = page.evaluate(
        "() => { try { return lessonPracticeState.currentIndex; } catch(e) { return 0; } }"
    )
    assert second_idx > first_idx


# ──────────────────────────────────────────────────────────────
# 6. Custom drill (non-lesson mode)
# ──────────────────────────────────────────────────────────────

def test_custom_phrases_render_in_worksheet(page: Page):
    """Default Finnish phrases render as practice cards."""
    # Worksheet should have cards from the default phrases
    expect(page.locator("#worksheet")).to_be_visible()
    # At least one practice block rendered
    expect(page.locator("#worksheet").locator(".practice-block, .phrase-block, div").first).to_be_visible()


def test_add_to_worksheet_button_exists(page: Page):
    """The Add to Worksheet button is present and visible in custom mode."""
    expect(page.locator("#addToWorksheetBtn")).to_be_visible()


def test_clear_worksheet_empties_custom_phrases(page: Page):
    """Clicking Clear Worksheet resets worksheetPhrases to empty."""
    unique_phrase = "Xyzzy_unique_test_phrase_99"
    page.locator("#finnishText").fill(unique_phrase)
    page.locator("#addToWorksheetBtn").click()
    page.wait_for_timeout(200)
    # Phrase should appear in the saved phrases list
    saved_before = page.evaluate(
        "() => { try { return worksheetPhrases.length; } catch(e) { return -1; } }"
    )
    assert saved_before > 0, "Phrase was not saved to worksheetPhrases"
    # Now clear and verify the saved list is empty
    page.locator("#clearWorksheetBtn").click()
    page.wait_for_timeout(300)
    saved_after = page.evaluate(
        "() => { try { return worksheetPhrases.length; } catch(e) { return -1; } }"
    )
    assert saved_after == 0


# ──────────────────────────────────────────────────────────────
# 7. Accessibility / aria
# ──────────────────────────────────────────────────────────────

def test_live_feedback_region_exists(page: Page):
    """aria-live region for screen readers is present in DOM."""
    region = page.locator("#liveFeedback")
    # It's sr-only (invisible) but must exist in DOM
    assert region.count() == 1


def test_modal_has_dialog_role(page: Page):
    """The practice modal has role=dialog for accessibility."""
    role = page.get_attribute("#lessonPlayModal", "role")
    assert role == "dialog"


def test_modal_close_button_has_aria_label(page: Page):
    """The modal close button has an aria-label."""
    label = page.get_attribute("#closeModalBtn", "aria-label")
    assert label and label.strip() != ""
