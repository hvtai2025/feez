const API_BASE_URL = window.location.origin;
const MAX_LINES = 50;
const MAX_CHARS_PER_LINE = 300;
const STORAGE_KEYS = {
    phrases: 'feezWorksheetPhrases',
    progress: 'feezProgressByPhrase',
    learning: 'feezLearningState',
    schemaVersion: 'feezStorageSchemaVersion'
};
const STORAGE_SCHEMA_VERSION = '2';

const MODE_LEVELS = ['review', 'recall', 'dictation', 'listening'];
const DAY_MS = 24 * 60 * 60 * 1000;

let worksheetPhrases = [];
let progressByPhrase = {};
let lessonCatalog = [];
let lessonDetailsById = {};
let activeLesson = null;
let lessonPracticeState = {
    currentIndex: 0,
    currentPhraseKey: '',
    lastResult: null,
    retryLocked: false,
    cardSession: null
};
let learningState = {
    streakDays: 0,
    lastActiveDate: '',
    daily: {
        date: '',
        completed: 0,
        goal: 25
    }
};
let sessionStats = {
    score: 0,
    attempts: 0,
    completed: 0,
    correct: 0,
    incorrect: 0
};

let lessonUiAudioContext = null;
let lessonUiFxState = {
    lastGreetingLessonId: '',
};

let translationCancelled = false;
let isTranslating = false;

const defaultPhrases = [
    { finnish: 'Hei, mita kuuluu?', english: 'Hello, how are you?' },
    { finnish: 'Hyvaa huomenta', english: 'Good morning' },
    { finnish: 'Kiitos paljon', english: 'Thank you very much' }
];

document.addEventListener('DOMContentLoaded', () => {
    bindEvents();
    loadState();
    initializeLessons().finally(() => {
        updateSourceUI();
        generateWorksheet();
        renderProgressSummary();
        updateSessionStatsUI();
    });
});

function bindEvents() {
    document.getElementById('printBtn').addEventListener('click', printWorksheet);
    document.getElementById('addToWorksheetBtn').addEventListener('click', addToWorksheet);
    document.getElementById('clearWorksheetBtn').addEventListener('click', clearWorksheet);
    document.getElementById('translateBtn').addEventListener('click', translateToEnglish);
    document.getElementById('cancelBtn').addEventListener('click', cancelTranslation);
    document.getElementById('contentSource').addEventListener('change', handleContentSourceChange);
    document.getElementById('lessonLevel').addEventListener('change', handleLessonLevelChange);
    document.getElementById('lessonSkill').addEventListener('change', () => {
        resetLessonPracticeState();
        generateWorksheet();
    });
    document.getElementById('loadLessonBtn').addEventListener('click', () => loadSelectedLesson(true));
    document.getElementById('startLessonBtn').addEventListener('click', openLessonPlayModal);
    document.getElementById('closeModalBtn').addEventListener('click', closeLessonPlayModal);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeLessonPlayModal();
    });

    ['fontSize', 'lineColor', 'textColor', 'practiceLines', 'practiceMode'].forEach((id) => {
        document.getElementById(id).addEventListener('change', generateWorksheet);
    });

    ['grammarFilter', 'smartDrillOnly'].forEach((id) => {
        document.getElementById(id).addEventListener('change', () => {
            if (isLessonSource()) {
                lessonPracticeState.currentIndex = 0;
            }
            generateWorksheet();
        });
    });

    document.getElementById('dailyGoal').addEventListener('change', handleDailyGoalChange);
}

function loadState() {
    try {
        const savedSchemaVersion = localStorage.getItem(STORAGE_KEYS.schemaVersion);
        if (savedSchemaVersion && savedSchemaVersion !== STORAGE_SCHEMA_VERSION) {
            resetStoredState();
        }

        const savedPhrases = JSON.parse(localStorage.getItem(STORAGE_KEYS.phrases) || '[]');
        const savedProgress = JSON.parse(localStorage.getItem(STORAGE_KEYS.progress) || '{}');
        const savedLearning = JSON.parse(localStorage.getItem(STORAGE_KEYS.learning) || '{}');
        if (Array.isArray(savedPhrases)) {
            worksheetPhrases = savedPhrases;
        }
        if (savedProgress && typeof savedProgress === 'object') {
            progressByPhrase = savedProgress;
        }
        if (savedLearning && typeof savedLearning === 'object') {
            learningState = {
                ...learningState,
                ...savedLearning,
                daily: {
                    ...learningState.daily,
                    ...(savedLearning.daily || {})
                }
            };
        }

        rotateDailyState();
        document.getElementById('dailyGoal').value = learningState.daily.goal;
        localStorage.setItem(STORAGE_KEYS.schemaVersion, STORAGE_SCHEMA_VERSION);
    } catch (error) {
        console.error('Failed to load local state:', error);
        resetStoredState();
    }
}

function resetStoredState() {
    localStorage.removeItem(STORAGE_KEYS.phrases);
    localStorage.removeItem(STORAGE_KEYS.progress);
    localStorage.removeItem(STORAGE_KEYS.learning);
    localStorage.setItem(STORAGE_KEYS.schemaVersion, STORAGE_SCHEMA_VERSION);
}

async function initializeLessons() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/lessons`);
        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Failed to load lessons');
        }

        lessonCatalog = data.lessons || [];
        lessonDetailsById = {};
        populateLessonSelect();

        if (lessonCatalog.length > 0) {
            await loadSelectedLesson(false);
        }
    } catch (error) {
        console.error('Failed to initialize lessons:', error);
        showStatus('Lesson database is unavailable. Custom drills still work.', 'warning');
    }
}

function isLessonSource() {
    return document.getElementById('contentSource').value === 'lesson';
}

function updateSourceUI() {
    const lessonSource = isLessonSource();
    document.getElementById('lessonPanel').classList.toggle('hidden', !lessonSource);
    document.getElementById('customInputPanel').classList.toggle('hidden', lessonSource);
    document.getElementById('customModeGroup').classList.toggle('hidden', lessonSource);
    document.getElementById('customActionsPanel').classList.toggle('hidden', lessonSource);
    document.getElementById('optionsRow').classList.toggle('hidden', lessonSource);
    document.getElementById('printBtn').classList.toggle('hidden', lessonSource);
    document.getElementById('gamificationBanner').classList.toggle('hidden', !lessonSource);
}

async function handleContentSourceChange() {
    updateSourceUI();
    if (isLessonSource() && !activeLesson && lessonCatalog.length > 0) {
        await loadSelectedLesson(false);
    }
    generateWorksheet();
}

async function handleLessonLevelChange() {
    populateLessonSelect();
    await loadSelectedLesson(false);
}

function populateLessonSelect() {
    const lessonSelect = document.getElementById('lessonSelect');
    const lessonLevel = document.getElementById('lessonLevel').value;
    const filteredLessons = lessonLevel === 'all'
        ? lessonCatalog
        : lessonCatalog.filter((lesson) => lesson.level === lessonLevel);

    lessonSelect.innerHTML = '';

    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = 'All lessons for selected level';
    lessonSelect.appendChild(allOption);

    filteredLessons.forEach((lesson) => {
        const option = document.createElement('option');
        option.value = lesson.id;
        option.textContent = `${lesson.code} | ${lesson.title}`;
        lessonSelect.appendChild(option);
    });
}

function resetLessonPracticeState() {
    lessonPracticeState = {
        currentIndex: 0,
        currentPhraseKey: '',
        lastResult: null,
        retryLocked: false,
        cardSession: null
    };
}

async function loadSelectedLesson(showMessage = true) {
    const lessonSelect = document.getElementById('lessonSelect');
    const selectedLessonId = lessonSelect.value;
    const lessonLevel = document.getElementById('lessonLevel').value;

    if (selectedLessonId === 'all') {
        try {
            activeLesson = await buildCombinedLesson(lessonLevel);
            resetLessonPracticeState();
            activeLesson.items.forEach((item) => ensureProgressEntry(item.finnish, item.grammarTag));
            generateWorksheet();
            showStartButton();

            if (showMessage) {
                showStatus(`Loaded ${activeLesson.title}.`, 'success');
            }
        } catch (error) {
            console.error('Failed to load all lessons:', error);
            showStatus('Failed to load lessons.', 'error');
        }
        return;
    }

    if (!lessonSelect.value) {
        activeLesson = null;
        generateWorksheet();
        return;
    }

    try {
        activeLesson = await getLessonDetail(selectedLessonId);
        resetLessonPracticeState();
        activeLesson.items.forEach((item) => ensureProgressEntry(item.finnish, item.grammarTag));
        generateWorksheet();
        showStartButton();

        if (showMessage) {
            showStatus(`Loaded lesson ${activeLesson.code}.`, 'success');
        }
    } catch (error) {
        console.error('Failed to load lesson:', error);
        showStatus('Failed to load lesson.', 'error');
    }
}

async function getLessonDetail(lessonId) {
    if (lessonDetailsById[lessonId]) {
        return lessonDetailsById[lessonId];
    }

    const response = await fetch(`${API_BASE_URL}/api/lessons/${lessonId}`);
    const data = await response.json();
    if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to load lesson');
    }

    lessonDetailsById[lessonId] = data.lesson;
    return data.lesson;
}

async function buildCombinedLesson(level) {
    const selectedLessons = level === 'all'
        ? lessonCatalog
        : lessonCatalog.filter((lesson) => lesson.level === level);

    const detailLessons = await Promise.all(selectedLessons.map((lesson) => getLessonDetail(lesson.id)));

    const combinedItems = detailLessons.flatMap((lesson) => lesson.items.map((item) => ({
        ...item,
        lessonCode: lesson.code,
        lessonTitle: lesson.title,
        lessonLevel: lesson.level,
        lessonTheme: lesson.theme,
    })));

    const uniqueGrammar = [...new Set(detailLessons.flatMap((lesson) => lesson.grammar || []))];
    const uniqueObjectives = [...new Set(detailLessons.flatMap((lesson) => lesson.objectives || []))];
    const uniqueSkills = [...new Set(detailLessons.flatMap((lesson) => lesson.skills || []))];
    const labelLevel = level === 'all' ? 'A1-A2' : level;

    return {
        id: `all-${level}`,
        code: `${labelLevel}-ALL`,
        level: labelLevel,
        title: `All ${labelLevel} Lessons`,
        theme: 'Mixed lesson set',
        grammar: uniqueGrammar,
        objectives: uniqueObjectives,
        skills: uniqueSkills,
        lessonCount: detailLessons.length,
        items: combinedItems,
        isCombined: true,
    };
}

function saveState() {
    localStorage.setItem(STORAGE_KEYS.phrases, JSON.stringify(worksheetPhrases));
    localStorage.setItem(STORAGE_KEYS.progress, JSON.stringify(progressByPhrase));
    localStorage.setItem(STORAGE_KEYS.learning, JSON.stringify(learningState));
    localStorage.setItem(STORAGE_KEYS.schemaVersion, STORAGE_SCHEMA_VERSION);
}

function handleDailyGoalChange() {
    const raw = parseInt(document.getElementById('dailyGoal').value, 10);
    learningState.daily.goal = Number.isNaN(raw) ? 25 : Math.min(200, Math.max(5, raw));
    document.getElementById('dailyGoal').value = learningState.daily.goal;
    saveState();
    renderProgressSummary();
}

function getDateKey(date = new Date()) {
    return date.toISOString().slice(0, 10);
}

function rotateDailyState() {
    const today = getDateKey();
    if (!learningState.daily.date) {
        learningState.daily.date = today;
        learningState.lastActiveDate = today;
        return;
    }

    if (learningState.daily.date !== today) {
        const lastDate = new Date(`${learningState.lastActiveDate || learningState.daily.date}T00:00:00Z`);
        const todayDate = new Date(`${today}T00:00:00Z`);
        const gapDays = Math.round((todayDate - lastDate) / DAY_MS);

        if (gapDays === 1) {
            learningState.streakDays += 1;
        } else if (gapDays > 1) {
            learningState.streakDays = 0;
        }

        learningState.daily.date = today;
        learningState.daily.completed = 0;
    }
}

function cancelTranslation() {
    translationCancelled = true;
    showStatus('Translation cancelled by user', 'warning');
}

function addToWorksheet() {
    const finnishText = document.getElementById('finnishText').value.trim();
    const englishText = document.getElementById('englishText').value.trim();

    if (!finnishText) {
        showStatus('Please enter Finnish text first.', 'warning');
        return;
    }

    const finnishLines = finnishText.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
    const englishLines = englishText.split('\n').map((line) => line.trim());

    if (finnishLines.length > MAX_LINES) {
        showStatus(`Please keep to ${MAX_LINES} lines or fewer.`, 'warning');
        return;
    }

    const filteredLines = finnishLines.filter((line) => line.length <= MAX_CHARS_PER_LINE);
    if (filteredLines.length !== finnishLines.length) {
        showStatus(`Some lines exceeded ${MAX_CHARS_PER_LINE} characters and were skipped.`, 'warning');
    }

    const added = [];
    filteredLines.forEach((finnish, index) => {
        const english = englishLines[index] || '[No translation]';
        added.push({ finnish, english, grammarTag: inferGrammarTag(finnish) });
        ensureProgressEntry(finnish);
    });

    worksheetPhrases = [...worksheetPhrases, ...added];
    saveState();
    generateWorksheet();
    renderProgressSummary();

    showStatus(`Added ${added.length} phrase(s) to worksheet.`, 'success');
}

function clearWorksheet() {
    worksheetPhrases = [];
    sessionStats = {
        score: 0,
        attempts: 0,
        completed: 0,
        correct: 0,
        incorrect: 0
    };
    saveState();
    generateWorksheet();
    updateSessionStatsUI();
    renderQueueSummary([]);
    showStatus('Worksheet cleared.', 'info');
}

function getInputPhrases() {
    const finnishText = document.getElementById('finnishText').value.trim();
    const englishText = document.getElementById('englishText').value.trim();

    if (!finnishText) {
        return [];
    }

    const finnishLines = finnishText.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
    const englishLines = englishText.split('\n').map((line) => line.trim());

    return finnishLines.slice(0, MAX_LINES).map((finnish, index) => ({
        finnish,
        english: englishLines[index] || '[No translation]',
        grammarTag: inferGrammarTag(finnish)
    }));
}

function getAllPhrases() {
    const liveInputPhrases = getInputPhrases();
    const merged = [...liveInputPhrases, ...worksheetPhrases];
    const fallback = merged.length === 0 ? defaultPhrases.map((p) => ({ ...p, grammarTag: inferGrammarTag(p.finnish) })) : merged;
    const byFinnish = new Map();

    fallback.forEach((phrase) => {
        const normalized = phrase.finnish.trim();
        if (!byFinnish.has(normalized)) {
            byFinnish.set(normalized, {
                finnish: normalized,
                english: phrase.english || '[No translation]',
                grammarTag: phrase.grammarTag || inferGrammarTag(normalized)
            });
        }
        ensureProgressEntry(normalized, phrase.grammarTag || inferGrammarTag(normalized));
    });

    return [...byFinnish.values()];
}

function getLessonItems() {
    if (!activeLesson || !Array.isArray(activeLesson.items)) {
        return [];
    }

    return activeLesson.items.map((item) => ({
        finnish: item.finnish,
        english: item.english,
        grammarTag: item.grammarTag || inferGrammarTag(item.finnish),
        cue: item.cue || '',
        lessonCode: item.lessonCode || activeLesson.code,
        lessonTitle: item.lessonTitle || activeLesson.title,
        lessonLevel: item.lessonLevel || activeLesson.level,
        lessonTheme: item.lessonTheme || activeLesson.theme,
    }));
}

function resolveLessonSkill(selectedSkill, phrase, index) {
    if (
        lessonPracticeState.cardSession
        && lessonPracticeState.cardSession.finnishPhrase === phrase.finnish
        && lessonPracticeState.cardSession.skill
    ) {
        return lessonPracticeState.cardSession.skill;
    }

    if (isLessonRetryLocked() && lessonPracticeState.lastResult && lessonPracticeState.lastResult.finnishPhrase === phrase.finnish) {
        return mapModeToLessonSkill(lessonPracticeState.lastResult.mode);
    }

    if (selectedSkill !== 'all') {
        return selectedSkill;
    }

    const skillCycle = ['reading', 'writing', 'listening', 'speaking'];
    const stats = progressByPhrase[phrase.finnish] || { attempts: 0 };
    const cycleIndex = Math.abs((stats.attempts || 0) + index) % skillCycle.length;
    return skillCycle[cycleIndex];
}

function getCurrentLessonDisplayItems() {
    const lessonItems = getLessonItems();
    const smartDrill = document.getElementById('smartDrillOnly').checked;
    const queue = buildStudyQueue(lessonItems);

    if (!smartDrill || queue.length === 0) {
        return lessonItems;
    }

    const anchorPhrase = lessonPracticeState.currentPhraseKey
        || (lessonPracticeState.cardSession && lessonPracticeState.cardSession.finnishPhrase)
        || '';

    if (!anchorPhrase) {
        return queue;
    }

    if (queue.some((item) => item.finnish === anchorPhrase)) {
        return queue;
    }

    const pinnedItem = lessonItems.find((item) => item.finnish === anchorPhrase);
    if (!pinnedItem) {
        return queue;
    }

    // Keep the current card visible when queue slicing/reordering would otherwise drop it.
    return [pinnedItem, ...queue.slice(0, 19)];
}

function ensureProgressEntry(finnishPhrase, grammarTag = null) {
    if (!progressByPhrase[finnishPhrase]) {
        progressByPhrase[finnishPhrase] = {
            attempts: 0,
            correct: 0,
            incorrect: 0,
            updatedAt: '',
            modeLevel: 0,
            ease: 2.3,
            intervalDays: 0,
            dueAt: new Date().toISOString(),
            consecutiveCorrect: 0,
            lastCompletedDate: '',
            grammarTag: grammarTag || inferGrammarTag(finnishPhrase)
        };
    } else if (!progressByPhrase[finnishPhrase].grammarTag) {
        progressByPhrase[finnishPhrase].grammarTag = grammarTag || inferGrammarTag(finnishPhrase);
    }
}

function inferGrammarTag(finnishText) {
    const text = (finnishText || '').toLowerCase();
    if (text.includes('?') || text.startsWith('mita') || text.startsWith('miksi') || text.startsWith('milloin')) {
        return 'question';
    }
    if (text.includes('kiitos') || text.includes('ole hyva')) {
        return 'polite';
    }
    if (/\b(a|ta|tta|sta|ssa|lla)\b/.test(text)) {
        return 'partitive';
    }
    if (text.includes('huomenta') || text.includes('myohemmin') || text.includes('tanaan')) {
        return 'time';
    }
    if (/\b(on|olen|olet|olemme|ovat)\b/.test(text)) {
        return 'verb-form';
    }
    return 'other';
}

function getPhraseAccuracy(stats) {
    if (!stats || stats.attempts === 0) {
        return 0;
    }
    return Math.round((stats.correct / stats.attempts) * 100);
}

function getEffectiveMode(phrase, selectedMode) {
    if (selectedMode !== 'adaptive') {
        return selectedMode;
    }
    const stats = progressByPhrase[phrase.finnish];
    return MODE_LEVELS[Math.min(MODE_LEVELS.length - 1, Math.max(0, stats.modeLevel || 0))];
}

function isDue(stats) {
    return new Date(stats.dueAt).getTime() <= Date.now();
}

function sortByLearningPriority(phrases) {
    return [...phrases].sort((a, b) => {
        const aStats = progressByPhrase[a.finnish];
        const bStats = progressByPhrase[b.finnish];

        const aDue = isDue(aStats) ? 0 : 1;
        const bDue = isDue(bStats) ? 0 : 1;
        if (aDue !== bDue) {
            return aDue - bDue;
        }

        const aAcc = getPhraseAccuracy(aStats);
        const bAcc = getPhraseAccuracy(bStats);
        if (aAcc !== bAcc) {
            return aAcc - bAcc;
        }

        const aDueAt = new Date(aStats.dueAt).getTime();
        const bDueAt = new Date(bStats.dueAt).getTime();
        return aDueAt - bDueAt;
    });
}

function buildStudyQueue(phrases) {
    const grammarFilter = document.getElementById('grammarFilter').value;
    const smartDrill = document.getElementById('smartDrillOnly').checked;

    let filtered = phrases;
    if (grammarFilter !== 'all') {
        filtered = phrases.filter((phrase) => {
            const stats = progressByPhrase[phrase.finnish];
            return (stats.grammarTag || 'other') === grammarFilter;
        });
    }

    const queue = smartDrill ? sortByLearningPriority(filtered) : filtered;
    return queue.slice(0, 20);
}

function showStartButton() {
    const btn = document.getElementById('startLessonBtn');
    if (btn) btn.classList.remove('hidden');
}

function openLessonPlayModal() {    if (!activeLesson) return;
    const modal = document.getElementById('lessonPlayModal');
    const titleEl = document.getElementById('modalLessonTitle');
    if (titleEl) titleEl.textContent = activeLesson.title || activeLesson.code || 'Lesson Practice';
    modal.classList.remove('hidden');
    document.body.classList.add('modal-open');
    // Render gamification banner into modal
    renderGamificationBannerInto(
        document.getElementById('modalGamificationBanner'),
        document.getElementById('lessonSkill').value
    );
    // Render the lesson card into the modal worksheet
    const fontSize = document.getElementById('fontSize').value;
    const lineColor = document.getElementById('lineColor').value;
    const textColor = document.getElementById('textColor').value;
    const practiceLines = parseInt(document.getElementById('practiceLines').value, 10);
    generateLessonPractice({
        worksheet: document.getElementById('modalWorksheet'),
        fontSize, lineColor, textColor, practiceLines
    });
    playGreetingEffect();
}

function closeLessonPlayModal() {
    const modal = document.getElementById('lessonPlayModal');
    if (!modal || modal.classList.contains('hidden')) return;
    modal.classList.add('hidden');
    document.body.classList.remove('modal-open');
}

function generateWorksheet() {
    const worksheet = document.getElementById('worksheet');
    const fontSize = document.getElementById('fontSize').value;
    const lineColor = document.getElementById('lineColor').value;
    const textColor = document.getElementById('textColor').value;
    const practiceLines = parseInt(document.getElementById('practiceLines').value, 10);
    const practiceMode = document.getElementById('practiceMode').value;

    if (isLessonSource()) {
        generateLessonPractice({ worksheet, fontSize, lineColor, textColor, practiceLines });
        // Also update the modal if it's open
        const modal = document.getElementById('lessonPlayModal');
        if (modal && !modal.classList.contains('hidden')) {
            generateLessonPractice({
                worksheet: document.getElementById('modalWorksheet'),
                fontSize, lineColor, textColor, practiceLines
            });
            renderGamificationBannerInto(
                document.getElementById('modalGamificationBanner'),
                document.getElementById('lessonSkill').value
            );
        }
        return;
    }

    const allPhrases = getAllPhrases();
    const queue = buildStudyQueue(allPhrases);
    const phrasesToDisplay = queue.length > 0 ? queue : allPhrases;
    renderQueueSummary(queue);

    worksheet.innerHTML = '';

    phrasesToDisplay.forEach((phrase, index) => {
        const effectiveMode = getEffectiveMode(phrase, practiceMode);
        const block = createPracticeBlock({
            phrase,
            index,
            fontSize,
            lineColor,
            textColor,
            practiceLines,
            practiceMode: effectiveMode
        });
        worksheet.appendChild(block);
    });
}

function generateLessonPractice({ worksheet, fontSize, lineColor, textColor, practiceLines }) {
    const lessonItems = getLessonItems();
    const selectedLessonSkill = document.getElementById('lessonSkill').value;

    if (!activeLesson || lessonItems.length === 0) {
        worksheet.innerHTML = '<div class="lesson-empty-state">Choose a lesson to begin guided A1-A2 practice.</div>';
        renderQueueSummary([]);
        renderGamificationBanner(null);
        return;
    }

    const itemsToDisplay = getCurrentLessonDisplayItems();

    if (lessonPracticeState.currentPhraseKey) {
        const pinnedIndex = itemsToDisplay.findIndex((item) => item.finnish === lessonPracticeState.currentPhraseKey);
        if (pinnedIndex >= 0) {
            lessonPracticeState.currentIndex = pinnedIndex;
        }
    }

    if (lessonPracticeState.currentIndex >= itemsToDisplay.length) {
        lessonPracticeState.currentIndex = 0;
    }

    const currentPhrase = itemsToDisplay[lessonPracticeState.currentIndex] || itemsToDisplay[0];
    lessonPracticeState.currentPhraseKey = currentPhrase ? currentPhrase.finnish : '';
    const lessonSkill = currentPhrase ? resolveLessonSkill(selectedLessonSkill, currentPhrase, lessonPracticeState.currentIndex) : selectedLessonSkill;

    if (currentPhrase && (!lessonPracticeState.cardSession || lessonPracticeState.cardSession.finnishPhrase !== currentPhrase.finnish)) {
        lessonPracticeState.cardSession = {
            finnishPhrase: currentPhrase.finnish,
            skill: lessonSkill,
            readingOptions: []
        };
    }

    worksheet.innerHTML = '';
    renderQueueSummary(itemsToDisplay);

    const block = createLessonPracticeBlock({
        phrase: currentPhrase,
        index: lessonPracticeState.currentIndex,
        fontSize,
        lineColor,
        textColor,
        practiceLines,
        lessonSkill,
        lessonItems: itemsToDisplay
    });
    worksheet.appendChild(block);
    renderGamificationBanner(lessonSkill);
}

function renderGamificationBanner(lessonSkill) {
    const banner = document.getElementById('gamificationBanner');
    if (!banner) {
        return;
    }
    renderGamificationBannerInto(banner, lessonSkill);
}

function renderGamificationBannerInto(banner, lessonSkill) {
    if (!banner) return;

    if (!isLessonSource() || !activeLesson) {
        banner.classList.add('hidden');
        banner.innerHTML = '';
        return;
    }

    const level = Math.floor(sessionStats.score / 100) + 1;
    const xpInLevel = sessionStats.score % 100;
    const xpNeeded = 100;
    const xpPercent = Math.max(0, Math.min(100, Math.round((xpInLevel / xpNeeded) * 100)));
    const streak = learningState.streakDays > 0 ? learningState.streakDays + 1 : 1;
    const skillLabel = lessonSkill ? capitalizeLabel(lessonSkill) : 'Quest';
    const hour = new Date().getHours();
    const dayGreeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const greeting = streak > 1
        ? `${dayGreeting}, champion. ${streak}-day streak is active.`
        : `${dayGreeting}. Welcome to your Finnish quest.`;

    banner.classList.remove('hidden');
    banner.innerHTML = `
        <div class="game-headline game-headline-greet">${greeting}</div>
        <div class="game-subline">Now training: ${skillLabel} | Level ${level}</div>
        <div class="game-metrics">
            <span>XP: <strong>${sessionStats.score}</strong></span>
            <span>Completed: <strong>${sessionStats.completed}</strong></span>
            <span>Accuracy: <strong>${sessionStats.attempts > 0 ? Math.round((sessionStats.correct / sessionStats.attempts) * 100) : 0}%</strong></span>
        </div>
        <div class="game-xp-track">
            <div class="game-xp-fill" style="width: ${xpPercent}%;"></div>
        </div>
        <div class="game-xp-caption">${xpInLevel}/${xpNeeded} XP to next level</div>
    `;
}

function showLessonFxBadge(message, kind = 'greeting') {
    const host = (document.getElementById('lessonPlayModal') && !document.getElementById('lessonPlayModal').classList.contains('hidden'))
        ? document.getElementById('lessonPlayModal')
        : document.querySelector('.lesson-block');

    if (!host) {
        return;
    }

    const badge = document.createElement('div');
    badge.className = `lesson-fx-badge ${kind}`;
    badge.textContent = message;
    host.appendChild(badge);

    window.setTimeout(() => {
        badge.remove();
    }, 1700);
}

function playGreetingEffect() {
    if (!activeLesson) {
        return;
    }

    // Show greeting once per selected lesson to avoid repeating on each rerender.
    if (lessonUiFxState.lastGreetingLessonId === activeLesson.id) {
        return;
    }

    lessonUiFxState.lastGreetingLessonId = activeLesson.id;
    showLessonFxBadge('Ready? Let\'s play Finnish!', 'greeting');
    playKidUiSound('greeting');
}

function playLevelUpEffect(newLevel) {
    showLessonFxBadge(`Level Up! You are now level ${newLevel}!`, 'levelup');
    playKidUiSound('levelup');
}

function playGamificationEffect(isCorrect, pointDelta) {
    const card = document.querySelector('.lesson-block');
    if (!card) {
        return;
    }

    card.classList.remove('reward-glow-correct', 'reward-glow-wrong');
    // Trigger a fresh animation each answer.
    // eslint-disable-next-line no-unused-expressions
    card.offsetWidth;
    card.classList.add(isCorrect ? 'reward-glow-correct' : 'reward-glow-wrong');

    const xpFloat = document.createElement('div');
    xpFloat.className = `xp-float ${isCorrect ? 'correct' : 'wrong'}`;
    xpFloat.textContent = `${pointDelta > 0 ? '+' : ''}${pointDelta} XP`;
    card.appendChild(xpFloat);

    let sparkle = null;
    if (isCorrect) {
        sparkle = document.createElement('div');
        sparkle.className = 'reward-sparkle';
        for (let i = 0; i < 8; i += 1) {
            const dot = document.createElement('span');
            dot.className = 'reward-spark';
            dot.style.setProperty('--angle', `${i * 45}deg`);
            sparkle.appendChild(dot);
        }
        card.appendChild(sparkle);
    }

    window.setTimeout(() => {
        xpFloat.remove();
        if (sparkle) {
            sparkle.remove();
        }
        card.classList.remove('reward-glow-correct', 'reward-glow-wrong');
    }, 900);
}

function getLessonUiAudioContext() {
    if (typeof window === 'undefined') {
        return null;
    }

    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) {
        return null;
    }

    if (!lessonUiAudioContext || lessonUiAudioContext.state === 'closed') {
        lessonUiAudioContext = new AudioCtor();
    }

    if (lessonUiAudioContext.state === 'suspended') {
        lessonUiAudioContext.resume().catch(() => {});
    }

    return lessonUiAudioContext;
}

function playKidUiSound(kind = 'tap') {
    const audioCtx = getLessonUiAudioContext();
    if (!audioCtx) {
        return;
    }

    const presets = {
        tap: {
            waveform: 'triangle',
            notes: [660],
            noteDuration: 0.06,
            step: 0.07,
            gainPeak: 0.04
        },
        nav: {
            waveform: 'triangle',
            notes: [587.33, 659.25],
            noteDuration: 0.07,
            step: 0.08,
            gainPeak: 0.045
        },
        success: {
            waveform: 'sine',
            notes: [523.25, 659.25, 783.99],
            noteDuration: 0.1,
            step: 0.1,
            gainPeak: 0.06
        },
        greeting: {
            waveform: 'triangle',
            notes: [523.25, 587.33, 659.25],
            noteDuration: 0.08,
            step: 0.09,
            gainPeak: 0.05
        },
        levelup: {
            waveform: 'sine',
            notes: [523.25, 659.25, 783.99, 1046.5],
            noteDuration: 0.11,
            step: 0.1,
            gainPeak: 0.07
        },
        oops: {
            waveform: 'square',
            notes: [392.0, 329.63, 293.66],
            noteDuration: 0.08,
            step: 0.08,
            gainPeak: 0.045
        }
    };

    const preset = presets[kind] || presets.tap;
    const gain = audioCtx.createGain();
    gain.connect(audioCtx.destination);
    gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);

    preset.notes.forEach((frequency, idx) => {
        const osc = audioCtx.createOscillator();
        const start = audioCtx.currentTime + idx * preset.step;
        const end = start + preset.noteDuration;

        osc.type = preset.waveform;
        osc.frequency.setValueAtTime(frequency, start);
        osc.connect(gain);

        gain.gain.linearRampToValueAtTime(preset.gainPeak, start + 0.01);
        gain.gain.linearRampToValueAtTime(0.0001, end);

        osc.start(start);
        osc.stop(end);
    });
}

function createPronunciationButton(text, label = 'Speak') {
    const speakBtn = document.createElement('button');
    speakBtn.type = 'button';
    speakBtn.className = 'btn-pronunciation';

    if (label === 'Speak') {
        speakBtn.textContent = '\ud83d\udd0a';
        speakBtn.classList.add('btn-pronunciation-icon');
    } else {
        speakBtn.textContent = label;
    }

    speakBtn.setAttribute('aria-label', `Speak Finnish sentence: ${text}`);
    speakBtn.addEventListener('click', () => speakFinnish(text, 1));
    return speakBtn;
}

function createLessonPracticeBlock({ phrase, index, fontSize, textColor, lessonSkill, lessonItems }) {
    const block = document.createElement('div');
    block.className = 'practice-block lesson-block';

    const title = document.createElement('h3');
    title.textContent = `${capitalizeLabel(lessonSkill)} Challenge`;
    title.className = 'practice-title quest-title';
    title.style.color = textColor;
    block.appendChild(title);

    const columns = document.createElement('div');
    columns.className = 'lesson-card-columns';

    const leftColumn = document.createElement('div');
    leftColumn.className = 'lesson-left-column';

    const rightColumn = document.createElement('div');
    rightColumn.className = 'lesson-right-column';

    if (lessonSkill === 'reading') {
        const readingOptions = getLessonReadingOptions(phrase, lessonItems);
        const finnishRow = document.createElement('div');
        finnishRow.className = 'finnish-row';

        const finnishLine = document.createElement('div');
        finnishLine.className = 'practice-line finnish-line';
        finnishLine.textContent = `Finnish: ${phrase.finnish}`;
        finnishLine.style.fontSize = `${fontSize}px`;
        finnishLine.style.color = textColor;

        finnishRow.appendChild(finnishLine);
        finnishRow.appendChild(createPronunciationButton(phrase.finnish));
        leftColumn.appendChild(finnishRow);
        leftColumn.appendChild(buildLessonReadingControls(phrase, lessonItems, readingOptions, index, lessonItems.length));
    } else {
        const englishLine = document.createElement('div');
        englishLine.className = 'practice-line english-line';
        englishLine.setAttribute('data-text', phrase.english);
        englishLine.textContent = `English: ${phrase.english}`;
        englishLine.style.fontSize = `${fontSize}px`;
        leftColumn.appendChild(englishLine);

        if (lessonSkill === 'writing') {
            leftColumn.appendChild(buildLessonWritingControls(phrase, index, lessonItems.length));
        } else if (lessonSkill === 'listening') {
            leftColumn.appendChild(buildListeningControls(phrase, englishLine, index, lessonItems.length));
        } else {
            leftColumn.appendChild(buildSpeakingControls(phrase));
        }
    }

    rightColumn.appendChild(buildLessonBelowCardFeedback(lessonItems, phrase));

    columns.appendChild(leftColumn);
    columns.appendChild(rightColumn);
    block.appendChild(columns);

    return block;
}

function buildLessonNavigation(currentIndex, totalItems) {
    const nav = document.createElement('div');
    nav.className = 'lesson-navigation';
    const retryLocked = isLessonRetryLocked();

    const prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'btn-eval secondary';
    prevBtn.textContent = 'Previous';
    prevBtn.disabled = currentIndex === 0 || retryLocked;
    prevBtn.addEventListener('click', () => {
        playKidUiSound('nav');
        changeLessonCard(-1);
    });

    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'btn-eval secondary';
    nextBtn.textContent = 'Next';
    nextBtn.disabled = currentIndex >= totalItems - 1 || retryLocked;
    nextBtn.addEventListener('click', () => {
        playKidUiSound('nav');
        changeLessonCard(1);
    });

    nav.appendChild(prevBtn);
    nav.appendChild(nextBtn);
    return nav;
}

function createLessonActionGroup(currentIndex, totalItems, primaryButton) {
    const group = document.createElement('div');
    group.className = 'lesson-action-group';

    const nav = buildLessonNavigation(currentIndex, totalItems);
    group.appendChild(nav);

    if (primaryButton) {
        primaryButton.classList.add('btn-check-main');
        group.appendChild(primaryButton);
    }

    return group;
}

function changeLessonCard(offset) {
    if (isLessonRetryLocked()) {
        return;
    }

    const displayItems = getCurrentLessonDisplayItems();
    if (displayItems.length === 0) {
        return;
    }

    lessonPracticeState.currentIndex = Math.max(0, Math.min(displayItems.length - 1, lessonPracticeState.currentIndex + offset));
    lessonPracticeState.currentPhraseKey = displayItems[lessonPracticeState.currentIndex].finnish;
    lessonPracticeState.cardSession = null;
    generateWorksheet();
}

function isLessonRetryLocked() {
    return Boolean(
        isLessonSource()
        && activeLesson
        && lessonPracticeState.retryLocked
        && lessonPracticeState.lastResult
        && !lessonPracticeState.lastResult.isCorrect
        && lessonPracticeState.lastResult.finnishPhrase === lessonPracticeState.currentPhraseKey
    );
}

function getLessonReadingOptions(phrase, lessonItems) {
    if (
        lessonPracticeState.cardSession
        && lessonPracticeState.cardSession.finnishPhrase === phrase.finnish
        && Array.isArray(lessonPracticeState.cardSession.readingOptions)
        && lessonPracticeState.cardSession.readingOptions.length > 0
    ) {
        return [...lessonPracticeState.cardSession.readingOptions];
    }

    const result = lessonPracticeState.lastResult;
    if (
        isLessonRetryLocked()
        && result
        && result.finnishPhrase === phrase.finnish
        && Array.isArray(result.readingOptions)
        && result.readingOptions.length > 0
    ) {
        return [...result.readingOptions];
    }

    const options = buildReadingOptions(phrase, lessonItems);
    if (lessonPracticeState.cardSession && lessonPracticeState.cardSession.finnishPhrase === phrase.finnish) {
        lessonPracticeState.cardSession.readingOptions = [...options];
    }
    return options;
}

function buildLessonReadingControls(phrase, lessonItems, options, currentIndex, totalItems) {
    const wrapper = document.createElement('div');
    wrapper.className = 'lesson-activity';

    const prompt = document.createElement('div');
    prompt.className = 'lesson-prompt';
    prompt.textContent = 'Choose the best English meaning.';
    wrapper.appendChild(prompt);

    const feedback = document.createElement('div');
    feedback.className = 'dictation-feedback';
    const selectedAnswer = {
        value: ''
    };

    options.forEach((option) => {
        const optionBtn = document.createElement('button');
        optionBtn.type = 'button';
        optionBtn.className = 'btn-option';
        optionBtn.textContent = option;
        optionBtn.addEventListener('click', () => {
            selectedAnswer.value = option;
            wrapper.querySelectorAll('.btn-option').forEach((button) => {
                button.classList.toggle('selected', button.textContent === option);
                button.classList.remove('wrong-answer', 'correct-answer');
            });
            setFeedbackState(feedback, {
                status: 'neutral',
                title: 'Selected Answer',
                rows: [
                    { label: 'Choice', value: option, emphasize: true }
                ]
            });
        });
        wrapper.appendChild(optionBtn);
    });

    const checkBtn = document.createElement('button');
    checkBtn.type = 'button';
    checkBtn.className = 'btn-eval secondary';
    checkBtn.textContent = 'Check Answer';
    checkBtn.addEventListener('click', () => {
        playKidUiSound('tap');
        if (!selectedAnswer.value) {
            setFeedbackState(feedback, {
                status: 'wrong',
                title: 'Check Needed',
                rows: [
                    { label: 'Action', value: 'Select an answer before checking.' }
                ]
            });
            return;
        }

        const isCorrect = selectedAnswer.value === phrase.english;
        wrapper.querySelectorAll('.btn-option').forEach((button) => {
            button.classList.remove('wrong-answer', 'correct-answer');
            const isSelected = button.textContent === selectedAnswer.value;
            const isExpected = button.textContent === phrase.english;

            if (!isCorrect && isSelected) {
                button.classList.add('wrong-answer');
            }

            if (isExpected) {
                button.classList.add('correct-answer');
            }
        });

        const explanation = buildLessonExplanation({
            phrase,
            isCorrect,
            learnerAnswer: selectedAnswer.value,
            expectedAnswer: phrase.english,
            skill: 'reading'
        });
        setFeedbackState(feedback, explanation);
        markPhraseOutcome(phrase.finnish, isCorrect, 'reading', {
            feedbackMessage: serializeFeedbackMessage(explanation),
            focusTag: phrase.grammarTag,
            expectedAnswer: phrase.english,
            learnerAnswer: selectedAnswer.value,
            cue: phrase.cue,
            readingOptions: options,
        });
    });

    wrapper.appendChild(createLessonActionGroup(currentIndex, totalItems, checkBtn));
    wrapper.appendChild(feedback);
    return wrapper;
}

function buildLessonWritingControls(phrase, currentIndex, totalItems) {
    const wrapper = document.createElement('div');
    wrapper.className = 'lesson-activity';

    const prompt = document.createElement('div');
    prompt.className = 'lesson-prompt';
    prompt.textContent = 'Write the Finnish sentence from the English prompt.';
    wrapper.appendChild(prompt);

    wrapper.appendChild(buildDictationControls(phrase, currentIndex, totalItems));
    return wrapper;
}

function buildSpeakingControls(phrase) {
    const wrapper = document.createElement('div');
    wrapper.className = 'lesson-activity';

    const prompt = document.createElement('div');
    prompt.className = 'lesson-prompt';
    prompt.textContent = 'Say the Finnish sentence aloud. Use speech recognition if available.';
    wrapper.appendChild(prompt);

    const controlRow = document.createElement('div');
    controlRow.className = 'practice-interaction';

    const playBtn = createPronunciationButton(phrase.finnish, 'Play Model');
    const speakBtn = document.createElement('button');
    speakBtn.type = 'button';
    speakBtn.className = 'btn-eval secondary';
    speakBtn.textContent = 'Start Speaking';

    const revealBtn = document.createElement('button');
    revealBtn.type = 'button';
    revealBtn.className = 'btn-eval warning';
    revealBtn.textContent = 'Reveal Answer';

    const transcript = document.createElement('div');
    transcript.className = 'speech-transcript';

    const feedback = document.createElement('div');
    feedback.className = 'dictation-feedback';

    const answer = document.createElement('div');
    answer.className = 'speech-answer hidden';
    answer.textContent = `Finnish model answer: ${phrase.finnish}`;

    revealBtn.addEventListener('click', () => {
        answer.classList.remove('hidden');
    });

    speakBtn.addEventListener('click', () => startSpeechPractice(phrase, transcript, feedback));

    controlRow.appendChild(playBtn);
    controlRow.appendChild(speakBtn);
    controlRow.appendChild(revealBtn);
    wrapper.appendChild(controlRow);
    wrapper.appendChild(transcript);
    wrapper.appendChild(feedback);
    wrapper.appendChild(answer);

    return wrapper;
}

function buildReadingOptions(targetPhrase, lessonItems) {
    const distractors = lessonItems
        .filter((item) => item.english !== targetPhrase.english)
        .slice(0, 3)
        .map((item) => item.english);

    return shuffleArray([targetPhrase.english, ...distractors]);
}

function mapModeToLessonSkill(mode) {
    if (mode === 'dictation') {
        return 'writing';
    }
    if (mode === 'review' || mode === 'recall') {
        return 'reading';
    }
    return mode;
}

function shuffleArray(items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

function capitalizeLabel(label) {
    return label.charAt(0).toUpperCase() + label.slice(1);
}

function renderQueueSummary(queue) {
    const queueSummary = document.getElementById('queueSummary');
    const total = queue.length;
    let dueCount = 0;
    let newCount = 0;

    queue.forEach((phrase) => {
        const stats = progressByPhrase[phrase.finnish];
        if (stats.attempts === 0) {
            newCount += 1;
        }
        if (isDue(stats)) {
            dueCount += 1;
        }
    });

    queueSummary.textContent = `Queue: ${total} items | Due now: ${dueCount} | New: ${newCount} | Daily ${learningState.daily.completed}/${learningState.daily.goal}`;
}

function createPracticeBlock({ phrase, index, fontSize, lineColor, textColor, practiceLines, practiceMode }) {
    const block = document.createElement('div');
    block.className = 'practice-block';

    const title = document.createElement('h3');
    const stats = progressByPhrase[phrase.finnish] || { attempts: 0, grammarTag: 'other' };
    const accuracy = getPhraseAccuracy(stats);
    title.textContent = `Practice ${index + 1} (${practiceMode})`;
    title.className = 'practice-title';
    title.style.color = textColor;
    title.style.marginBottom = '12px';
    block.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'practice-meta';
    meta.textContent = `Tag: ${stats.grammarTag || 'other'} | Accuracy: ${accuracy}% | Due: ${formatDueLabel(stats.dueAt)}`;
    block.appendChild(meta);

    const finnishLine = document.createElement('div');
    finnishLine.className = 'practice-line finnish-line';
    finnishLine.setAttribute('data-short-label', 'fi');
    finnishLine.setAttribute('data-text', phrase.finnish);
    finnishLine.textContent = `Finnish: ${phrase.finnish}`;
    finnishLine.style.fontSize = `${fontSize}px`;
    finnishLine.style.color = textColor;

    const finnishRow = document.createElement('div');
    finnishRow.className = 'finnish-row';

    const speakBtn = document.createElement('button');
    speakBtn.type = 'button';
    speakBtn.className = 'btn-pronunciation';
    speakBtn.textContent = 'Speak';
    speakBtn.setAttribute('aria-label', `Speak Finnish sentence: ${phrase.finnish}`);
    speakBtn.addEventListener('click', () => speakFinnish(phrase.finnish, 1));

    const englishLine = document.createElement('div');
    englishLine.className = 'practice-line english-line';
    englishLine.setAttribute('data-short-label', 'en');
    englishLine.setAttribute('data-text', phrase.english);
    englishLine.textContent = `English: ${phrase.english}`;
    englishLine.style.fontSize = `${fontSize}px`;
    englishLine.style.color = '#6c757d';

    finnishRow.appendChild(finnishLine);
    finnishRow.appendChild(speakBtn);
    block.appendChild(finnishRow);
    block.appendChild(englishLine);

    if (practiceMode === 'listening') {
        finnishLine.classList.add('hidden-answer');
    }

    const interaction = buildInteraction(phrase, practiceMode, englishLine, finnishLine);
    if (interaction) {
        block.appendChild(interaction);
    }

    const divider = document.createElement('hr');
    divider.style.margin = '16px 0';
    divider.style.border = 'none';
    divider.style.borderTop = `2px dashed ${lineColor}`;
    block.appendChild(divider);

    const practiceLabel = document.createElement('div');
    practiceLabel.textContent = 'Practice Writing:';
    practiceLabel.className = 'practice-label';
    practiceLabel.style.fontSize = '14px';
    practiceLabel.style.color = '#6c757d';
    practiceLabel.style.marginBottom = '10px';
    practiceLabel.style.fontWeight = '600';
    block.appendChild(practiceLabel);

    for (let i = 1; i <= practiceLines; i++) {
        const emptyLine = document.createElement('div');
        emptyLine.className = 'empty-line';
        emptyLine.style.borderBottomColor = lineColor;
        emptyLine.style.height = `${parseInt(fontSize, 10) * 2}px`;

        const lineNumber = document.createElement('span');
        lineNumber.className = 'line-number';
        lineNumber.textContent = i;
        emptyLine.appendChild(lineNumber);
        block.appendChild(emptyLine);
    }

    return block;
}

function buildInteraction(phrase, mode, englishLine) {
    if (mode === 'review') {
        return buildReviewControls(phrase);
    }

    if (mode === 'recall') {
        englishLine.classList.add('hidden-answer');
        return buildRecallControls(phrase, englishLine);
    }

    if (mode === 'dictation') {
        return buildDictationControls(phrase);
    }

    if (mode === 'listening') {
        return buildListeningControls(phrase, englishLine);
    }

    return null;
}

function buildReviewControls(phrase) {
    const controls = document.createElement('div');
    controls.className = 'practice-interaction';

    const easyBtn = document.createElement('button');
    easyBtn.type = 'button';
    easyBtn.className = 'btn-eval success';
    easyBtn.textContent = 'Mark Easy';
    easyBtn.addEventListener('click', () => markPhraseOutcome(phrase.finnish, true, 'review'));

    const hardBtn = document.createElement('button');
    hardBtn.type = 'button';
    hardBtn.className = 'btn-eval warning';
    hardBtn.textContent = 'Mark Hard';
    hardBtn.addEventListener('click', () => markPhraseOutcome(phrase.finnish, false, 'review'));

    controls.appendChild(easyBtn);
    controls.appendChild(hardBtn);
    return controls;
}

function buildRecallControls(phrase, englishLine) {
    const controls = document.createElement('div');
    controls.className = 'practice-interaction';

    const revealBtn = document.createElement('button');
    revealBtn.type = 'button';
    revealBtn.className = 'btn-eval secondary';
    revealBtn.textContent = 'Reveal English';
    revealBtn.addEventListener('click', () => {
        englishLine.classList.remove('hidden-answer');
    });

    const correctBtn = document.createElement('button');
    correctBtn.type = 'button';
    correctBtn.className = 'btn-eval success';
    correctBtn.textContent = 'I got it right';
    correctBtn.addEventListener('click', () => markPhraseOutcome(phrase.finnish, true, 'recall'));

    const wrongBtn = document.createElement('button');
    wrongBtn.type = 'button';
    wrongBtn.className = 'btn-eval danger';
    wrongBtn.textContent = 'I got it wrong';
    wrongBtn.addEventListener('click', () => markPhraseOutcome(phrase.finnish, false, 'recall'));

    controls.appendChild(revealBtn);
    controls.appendChild(correctBtn);
    controls.appendChild(wrongBtn);
    return controls;
}

function buildDictationControls(phrase, currentIndex = 0, totalItems = 0) {
    const wrapper = document.createElement('div');
    wrapper.className = 'practice-interaction dictation-wrap';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'dictation-input';
    input.placeholder = 'Type Finnish from memory';

    const checkBtn = document.createElement('button');
    checkBtn.type = 'button';
    checkBtn.className = 'btn-eval secondary';
    checkBtn.textContent = 'Check Answer';

    const feedback = document.createElement('div');
    feedback.className = 'dictation-feedback';

    const audioBtn = document.createElement('button');
    audioBtn.type = 'button';
    audioBtn.className = 'btn-eval secondary';
    audioBtn.textContent = 'Play Audio';
    audioBtn.addEventListener('click', () => speakFinnish(phrase.finnish, 1));

    const slowAudioBtn = document.createElement('button');
    slowAudioBtn.type = 'button';
    slowAudioBtn.className = 'btn-eval secondary';
    slowAudioBtn.textContent = 'Play Slow';
    slowAudioBtn.addEventListener('click', () => speakFinnish(phrase.finnish, 0.8));

    checkBtn.addEventListener('click', () => {
        playKidUiSound('tap');
        const isCorrect = normalizeText(input.value) === normalizeText(phrase.finnish);
        const explanation = buildLessonExplanation({
            phrase,
            isCorrect,
            learnerAnswer: input.value,
            expectedAnswer: phrase.finnish,
            skill: 'writing'
        });
        setFeedbackState(feedback, explanation);
        markPhraseOutcome(phrase.finnish, isCorrect, 'dictation', {
            feedbackMessage: serializeFeedbackMessage(explanation),
            focusTag: phrase.grammarTag,
            expectedAnswer: phrase.finnish,
            learnerAnswer: input.value,
            cue: phrase.cue,
        });
    });

    wrapper.appendChild(input);

    if (totalItems > 0) {
        wrapper.appendChild(createLessonActionGroup(currentIndex, totalItems, checkBtn));
    } else {
        wrapper.appendChild(checkBtn);
    }

    const audioRow = document.createElement('div');
    audioRow.className = 'practice-interaction';
    audioRow.appendChild(audioBtn);
    audioRow.appendChild(slowAudioBtn);
    wrapper.appendChild(audioRow);
    wrapper.appendChild(feedback);
    return wrapper;
}

function buildListeningControls(phrase, englishLine, currentIndex = 0, totalItems = 0) {
    const wrapper = document.createElement('div');
    wrapper.className = 'practice-interaction dictation-wrap';

    const prompt = document.createElement('div');
    prompt.className = 'listening-prompt';
    prompt.textContent = `Prompt (English): ${englishLine.getAttribute('data-text')}`;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'dictation-input';
    input.placeholder = 'Type what you hear in Finnish';

    const playBtn = document.createElement('button');
    playBtn.type = 'button';
    playBtn.className = 'btn-eval secondary';
    playBtn.textContent = 'Play';
    playBtn.addEventListener('click', () => speakFinnish(phrase.finnish, 1));

    const playSlowBtn = document.createElement('button');
    playSlowBtn.type = 'button';
    playSlowBtn.className = 'btn-eval secondary';
    playSlowBtn.textContent = 'Play Slow';
    playSlowBtn.addEventListener('click', () => speakFinnish(phrase.finnish, 0.75));

    const checkBtn = document.createElement('button');
    checkBtn.type = 'button';
    checkBtn.className = 'btn-eval success';
    checkBtn.textContent = 'Check';

    const feedback = document.createElement('div');
    feedback.className = 'dictation-feedback';

    checkBtn.addEventListener('click', () => {
        playKidUiSound('tap');
        const isCorrect = normalizeText(input.value) === normalizeText(phrase.finnish);
        const explanation = buildLessonExplanation({
            phrase,
            isCorrect,
            learnerAnswer: input.value,
            expectedAnswer: phrase.finnish,
            skill: 'listening'
        });
        setFeedbackState(feedback, explanation);
        markPhraseOutcome(phrase.finnish, isCorrect, 'listening', {
            feedbackMessage: serializeFeedbackMessage(explanation),
            focusTag: phrase.grammarTag,
            expectedAnswer: phrase.finnish,
            learnerAnswer: input.value,
            cue: phrase.cue,
        });
    });

    wrapper.appendChild(prompt);
    wrapper.appendChild(input);

    const audioRow = document.createElement('div');
    audioRow.className = 'practice-interaction';
    audioRow.appendChild(playBtn);
    audioRow.appendChild(playSlowBtn);
    wrapper.appendChild(audioRow);

    if (totalItems > 0) {
        wrapper.appendChild(createLessonActionGroup(currentIndex, totalItems, checkBtn));
    } else {
        wrapper.appendChild(checkBtn);
    }

    wrapper.appendChild(feedback);
    return wrapper;
}

function buildErrorFeedback(userAnswer, expectedAnswer) {
    const userTokens = normalizeText(userAnswer).split(' ').filter(Boolean);
    const expectedTokens = normalizeText(expectedAnswer).split(' ').filter(Boolean);

    const missingTokens = expectedTokens.filter((token) => !userTokens.includes(token));
    const extraTokens = userTokens.filter((token) => !expectedTokens.includes(token));
    const sameTokens = userTokens.filter((token) => expectedTokens.includes(token));

    let likelyError = 'spelling';
    if (missingTokens.length > 0 && extraTokens.length === 0) {
        likelyError = 'missing word';
    } else if (extraTokens.length > 0 && missingTokens.length === 0) {
        likelyError = 'extra word';
    } else if (sameTokens.length === expectedTokens.length && normalizeText(userAnswer) !== normalizeText(expectedAnswer)) {
        likelyError = 'word order';
    } else if (missingTokens.length > 0 && extraTokens.length > 0) {
        likelyError = 'morphology/word choice';
    }

    return `Not quite. Likely issue: ${likelyError}. Missing: ${missingTokens.join(', ') || '-'} | Extra: ${extraTokens.join(', ') || '-'} | Correct: ${expectedAnswer}`;
}

function buildLessonExplanation({ phrase, isCorrect, learnerAnswer, expectedAnswer, skill }) {
    const coachingRows = [];

    const rows = [];

    if (learnerAnswer) {
        rows.push({ label: 'Your answer', value: learnerAnswer });
    }

    rows.push({ label: 'Correct answer', value: expectedAnswer, emphasize: true });

    if (!isCorrect && (skill === 'writing' || skill === 'listening')) {
        coachingRows.push({ label: 'Fix', value: buildErrorFeedback(learnerAnswer, expectedAnswer) });
    }

    if (skill === 'reading') {
        coachingRows.push({ label: 'Finnish text', value: phrase.finnish });
    }

    if (phrase.grammarTag) {
        coachingRows.push({ label: 'Focus', value: phrase.grammarTag });
    }

    if (phrase.cue) {
        coachingRows.push({ label: 'Hint', value: phrase.cue });
    }

    return {
        status: isCorrect ? 'correct' : 'wrong',
        title: isCorrect ? 'Right Answer' : 'Wrong Answer',
        subtitle: isCorrect ? 'Keep this pattern in memory.' : 'Pause, study the correction, then repeat it once.',
        memoryTitle: 'Remember This',
        memoryRows: [
            { label: 'Finnish', value: phrase.finnish, emphasize: true },
            { label: 'English', value: phrase.english }
        ],
        rows,
        coachingTitle: coachingRows.length > 0 ? 'Coaching' : '',
        coachingRows,
    };
}

function setFeedbackState(feedbackElement, payload) {
    feedbackElement.innerHTML = '';
    feedbackElement.className = `dictation-feedback ${payload.status}`;

    const header = document.createElement('div');
    header.className = 'feedback-header';

    const badge = document.createElement('div');
    badge.className = 'feedback-badge';
    badge.textContent = payload.title;
    header.appendChild(badge);

    if (payload.subtitle) {
        const subtitle = document.createElement('div');
        subtitle.className = 'feedback-subtitle';
        subtitle.textContent = payload.subtitle;
        header.appendChild(subtitle);
    }

    feedbackElement.appendChild(header);

    if ((payload.rows || []).length > 0) {
        feedbackElement.appendChild(createFeedbackSection('', payload.rows, 'feedback-details'));
    }

    if ((payload.memoryRows || []).length > 0) {
        feedbackElement.appendChild(createFeedbackSection(payload.memoryTitle || 'Remember This', payload.memoryRows, 'feedback-memory'));
    }

    if ((payload.coachingRows || []).length > 0) {
        feedbackElement.appendChild(createFeedbackSection(payload.coachingTitle || 'Coaching', payload.coachingRows, 'feedback-coaching'));
    }
}

function serializeFeedbackMessage(payload) {
    return [
        payload.title,
        payload.subtitle,
        ...(payload.rows || []).map((row) => `${row.label}: ${row.value}`),
        ...(payload.memoryRows || []).map((row) => `${row.label}: ${row.value}`),
        ...(payload.coachingRows || []).map((row) => `${row.label}: ${row.value}`),
    ].filter(Boolean).join(' | ');
}

function createFeedbackSection(titleText, rows, className) {
    const section = document.createElement('div');
    section.className = `feedback-section ${className}`.trim();

    if (titleText) {
        const title = document.createElement('div');
        title.className = 'feedback-section-title';
        title.textContent = titleText;
        section.appendChild(title);
    }

    rows.forEach((row) => {
        const line = document.createElement('div');
        line.className = `feedback-row${row.emphasize ? ' emphasize' : ''}`;

        const label = document.createElement('span');
        label.className = 'feedback-label';
        label.textContent = `${row.label}: `;

        const value = document.createElement('span');
        value.className = 'feedback-value';
        value.textContent = row.value;

        line.appendChild(label);
        line.appendChild(value);
        section.appendChild(line);
    });

    return section;
}

let ttsAudio = null;

async function speakFinnish(text, rate = 1) {
    const localTtsPlayed = await speakViaLocalTts(text);
    if (localTtsPlayed) {
        return;
    }
    speakViaBrowserTts(text, rate);
}

async function speakViaLocalTts(text) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/tts`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ text })
        });

        if (!response.ok) {
            return false;
        }

        const audioBlob = await response.blob();
        const blobUrl = URL.createObjectURL(audioBlob);

        if (ttsAudio) {
            ttsAudio.pause();
        }

        ttsAudio = new Audio(blobUrl);
        ttsAudio.onended = () => URL.revokeObjectURL(blobUrl);
        ttsAudio.onerror = () => URL.revokeObjectURL(blobUrl);
        await ttsAudio.play();
        return true;
    } catch (error) {
        return false;
    }
}

function speakViaBrowserTts(text, rate = 1) {
    if (!('speechSynthesis' in window)) {
        showStatus('Audio playback not supported in this browser.', 'warning');
        return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'fi-FI';
    utterance.rate = rate;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    showStatus('Using browser speech fallback. Enable local TTS for better quality.', 'info');
}

function getSpeechRecognitionConstructor() {
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function startSpeechPractice(phrase, transcriptElement, feedbackElement) {
    const SpeechRecognitionCtor = getSpeechRecognitionConstructor();
    if (!SpeechRecognitionCtor) {
        transcriptElement.textContent = 'Speech recognition is not available in this browser. Play the model, speak aloud, then self-check with reveal.';
        setFeedbackState(feedbackElement, {
            status: 'wrong',
            title: 'Speaking Unavailable',
            rows: [
                { label: 'Reason', value: 'Speech recognition is unavailable in this browser.' }
            ]
        });
        return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = 'fi-FI';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    transcriptElement.textContent = 'Listening...';
    feedbackElement.textContent = '';

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        const isCorrect = isAcceptableSpeechMatch(transcript, phrase.finnish);
        transcriptElement.textContent = `You said: ${transcript}`;
        const explanation = buildLessonExplanation({
            phrase,
            isCorrect,
            learnerAnswer: transcript,
            expectedAnswer: phrase.finnish,
            skill: 'speaking'
        });
        setFeedbackState(feedbackElement, explanation);
        markPhraseOutcome(phrase.finnish, isCorrect, 'speaking', {
            feedbackMessage: serializeFeedbackMessage(explanation),
            focusTag: phrase.grammarTag,
            expectedAnswer: phrase.finnish,
            learnerAnswer: transcript,
            cue: phrase.cue,
        });
    };

    recognition.onerror = () => {
        transcriptElement.textContent = 'Speech recognition could not capture your answer.';
        setFeedbackState(feedbackElement, {
            status: 'wrong',
            title: 'Try Again',
            rows: [
                { label: 'Reason', value: 'Speech recognition could not capture your answer.' },
                { label: 'Next step', value: 'Please try again.' }
            ]
        });
    };

    recognition.start();
}

function isAcceptableSpeechMatch(transcript, expectedText) {
    const normalizedTranscript = normalizeText(transcript);
    const normalizedExpected = normalizeText(expectedText);

    if (normalizedTranscript === normalizedExpected) {
        return true;
    }

    const transcriptTokens = normalizedTranscript.split(' ').filter(Boolean);
    const expectedTokens = normalizedExpected.split(' ').filter(Boolean);
    if (expectedTokens.length === 0) {
        return false;
    }

    const overlap = expectedTokens.filter((token) => transcriptTokens.includes(token)).length;
    return overlap / expectedTokens.length >= 0.8;
}

function normalizeText(text) {
    return (text || '')
        .toLowerCase()
        .trim()
        .replace(/[.,!?;:]/g, '')
        .replace(/\s+/g, ' ');
}

function playLessonFeedbackTone(isCorrect) {
    try {
        playKidUiSound(isCorrect ? 'success' : 'oops');
    } catch (error) {
        // Ignore audio feedback failures to keep practice flow uninterrupted.
    }
}

function announceLiveFeedback(message) {
    const liveRegion = document.getElementById('liveFeedback');
    if (!liveRegion) {
        return;
    }

    liveRegion.textContent = '';
    window.setTimeout(() => {
        liveRegion.textContent = message;
    }, 20);
}

function markPhraseOutcome(finnishPhrase, isCorrect, mode = 'review', details = {}) {
    rotateDailyState();
    ensureProgressEntry(finnishPhrase);
    const todayKey = getDateKey();

    const entry = progressByPhrase[finnishPhrase];
    entry.attempts += 1;
    if (isCorrect) {
        entry.correct += 1;
        entry.consecutiveCorrect += 1;
        entry.ease = Math.min(2.8, (entry.ease || 2.3) + 0.1);
        const currentInterval = entry.intervalDays || 0;
        const nextInterval = currentInterval === 0 ? 1 : Math.max(1, Math.round(currentInterval * entry.ease));
        entry.intervalDays = nextInterval;
        entry.dueAt = new Date(Date.now() + nextInterval * DAY_MS).toISOString();
    }
    if (!isCorrect) {
        entry.incorrect += 1;
        entry.consecutiveCorrect = 0;
        entry.ease = Math.max(1.3, (entry.ease || 2.3) - 0.2);
        entry.intervalDays = 0;
        entry.dueAt = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
    }

    adaptModeLevel(entry, isCorrect, mode);
    entry.updatedAt = new Date().toISOString();

    sessionStats.attempts += 1;
    learningState.lastActiveDate = getDateKey();
    const previousLevel = Math.floor(sessionStats.score / 100) + 1;
    const pointDelta = isCorrect ? 10 : -3;
    if (isCorrect) {
        sessionStats.correct += 1;
        sessionStats.score += pointDelta;

        // Count completion once per phrase per day to prevent goal inflation via repeated checks.
        if (entry.lastCompletedDate !== todayKey) {
            entry.lastCompletedDate = todayKey;
            sessionStats.completed += 1;
            learningState.daily.completed += 1;
        }
    } else {
        sessionStats.incorrect += 1;
        sessionStats.score = Math.max(0, sessionStats.score + pointDelta);
    }

    saveState();
    const currentLevel = Math.floor(sessionStats.score / 100) + 1;
    if (isLessonSource() && activeLesson) {
        playLessonFeedbackTone(isCorrect);
        lessonPracticeState.lastResult = {
            finnishPhrase,
            isCorrect,
            mode,
            feedbackMessage: details.feedbackMessage || (isCorrect ? 'Correct.' : 'Incorrect.'),
            focusTag: details.focusTag || entry.grammarTag || 'other',
            expectedAnswer: details.expectedAnswer || '',
            learnerAnswer: details.learnerAnswer || '',
            cue: details.cue || '',
            readingOptions: Array.isArray(details.readingOptions) ? [...details.readingOptions] : []
        };
        announceLiveFeedback([
            isCorrect ? 'Right answer.' : 'Wrong answer.',
            details.expectedAnswer ? `Correct answer: ${details.expectedAnswer}.` : '',
            details.cue ? `Hint: ${details.cue}.` : ''
        ].filter(Boolean).join(' '));
        lessonPracticeState.retryLocked = !isCorrect;

        const displayItems = getCurrentLessonDisplayItems();
        const currentPhraseIndex = displayItems.findIndex((item) => item.finnish === finnishPhrase);
        if (currentPhraseIndex >= 0) {
            lessonPracticeState.currentIndex = currentPhraseIndex;
            lessonPracticeState.currentPhraseKey = finnishPhrase;
        }
    }
    generateWorksheet();
    if (isLessonSource() && activeLesson) {
        window.setTimeout(() => {
            playGamificationEffect(isCorrect, pointDelta);
        }, 40);
        if (currentLevel > previousLevel) {
            window.setTimeout(() => {
                playLevelUpEffect(currentLevel);
            }, 120);
        }
    }
    renderProgressSummary();
    updateSessionStatsUI();
}

function buildLessonBelowCardFeedback(lessonItems, currentPhrase) {
    const panel = document.createElement('div');
    panel.className = 'lesson-below-feedback';

    if (!currentPhrase) {
        panel.innerHTML = '<div class="lesson-result neutral">Answer feedback will appear here.</div>';
        return panel;
    }

    const weakFocus = getWeakLessonFocus(lessonItems, currentPhrase);
    const result = lessonPracticeState.lastResult;

    let resultHtml = '<div class="lesson-result neutral">Check your answer to see right or wrong feedback.</div>';
    if (result && result.finnishPhrase === currentPhrase.finnish) {
        const statusText = result.isCorrect ? 'Right Answer' : 'Wrong Answer';
        const learnerLine = result.learnerAnswer
            ? `<div class="lesson-answer-line"><strong>Your answer:</strong> ${result.learnerAnswer}</div>`
            : '';
        const correctLine = result.expectedAnswer
            ? `<div class="lesson-answer-line"><strong>Correct answer:</strong> ${result.expectedAnswer}</div>`
            : '';
        resultHtml = `
            <div class="lesson-result ${result.isCorrect ? 'correct' : 'wrong'}">
                <div class="lesson-result-title">${statusText}</div>
                ${learnerLine}
                ${correctLine}
            </div>
        `;
    }

    const hint = currentPhrase.cue || weakFocus.reason || 'Listen carefully and repeat once before checking.';

    panel.innerHTML = `
        ${resultHtml}
        <div class="lesson-hint-line"><strong>Hint:</strong> ${hint}</div>
    `;

    return panel;
}

function getWeakLessonFocus(lessonItems, currentPhrase) {
    const tagStats = new Map();
    lessonItems.forEach((item) => {
        const stats = progressByPhrase[item.finnish] || { attempts: 0, correct: 0, incorrect: 0, grammarTag: item.grammarTag };
        const tag = stats.grammarTag || item.grammarTag || 'other';
        if (!tagStats.has(tag)) {
            tagStats.set(tag, { tag, attempts: 0, correct: 0, incorrect: 0, items: [] });
        }
        const entry = tagStats.get(tag);
        entry.attempts += stats.attempts || 0;
        entry.correct += stats.correct || 0;
        entry.incorrect += stats.incorrect || 0;
        entry.items.push(item);
    });

    const forcedTag = lessonPracticeState.lastResult && !lessonPracticeState.lastResult.isCorrect
        ? lessonPracticeState.lastResult.focusTag
        : null;

    let weakEntry = null;
    if (forcedTag && tagStats.has(forcedTag)) {
        weakEntry = tagStats.get(forcedTag);
    } else {
        weakEntry = [...tagStats.values()].sort((a, b) => {
            const aRate = a.attempts > 0 ? a.incorrect / a.attempts : 0;
            const bRate = b.attempts > 0 ? b.incorrect / b.attempts : 0;
            return bRate - aRate || b.incorrect - a.incorrect;
        })[0];
    }

    const fallbackEntry = weakEntry || {
        tag: currentPhrase.grammarTag || 'other',
        attempts: 0,
        incorrect: 0,
        items: lessonItems
    };

    const relatedItems = fallbackEntry.items
        .filter((item) => item.finnish !== currentPhrase.finnish)
        .slice(0, 3);

    if (relatedItems.length === 0) {
        relatedItems.push(currentPhrase);
    }

    const incorrectRate = fallbackEntry.attempts > 0
        ? Math.round((fallbackEntry.incorrect / fallbackEntry.attempts) * 100)
        : 0;

    return {
        tagLabel: fallbackEntry.tag,
        reason: fallbackEntry.attempts > 0
            ? `${incorrectRate}% of answers in this focus have been incorrect, so these related phrases are shown for extra reinforcement.`
            : 'No weakness data yet, so related phrases for the current focus are shown to reinforce the pattern.',
        relatedItems,
    };
}

function buildWeaknessSupportPanel(currentPhrase, lessonItems) {
    const support = document.createElement('div');
    support.className = 'lesson-support-panel';
    const weakFocus = getWeakLessonFocus(lessonItems, currentPhrase);

    const title = document.createElement('div');
    title.className = 'lesson-support-title';
    title.textContent = `Related help: ${weakFocus.tagLabel}`;
    support.appendChild(title);

    const reason = document.createElement('div');
    reason.className = 'lesson-support-reason';
    reason.textContent = weakFocus.reason;
    support.appendChild(reason);

    const list = document.createElement('div');
    list.className = 'lesson-support-items';
    weakFocus.relatedItems.forEach((item) => {
        const row = document.createElement('div');
        row.className = 'lesson-support-item';
        row.textContent = `${item.finnish} -> ${item.english}`;
        list.appendChild(row);
    });
    support.appendChild(list);

    return support;
}

function adaptModeLevel(entry, isCorrect, mode) {
    if (mode === 'adaptive') {
        return;
    }

    if (isCorrect && entry.consecutiveCorrect >= 2) {
        entry.modeLevel = Math.min(MODE_LEVELS.length - 1, (entry.modeLevel || 0) + 1);
        return;
    }

    if (!isCorrect) {
        entry.modeLevel = Math.max(0, (entry.modeLevel || 0) - 1);
    }
}

function formatDueLabel(isoDate) {
    const due = new Date(isoDate);
    const diffMs = due.getTime() - Date.now();
    if (diffMs <= 0) {
        return 'now';
    }
    const hours = Math.round(diffMs / (60 * 60 * 1000));
    if (hours < 24) {
        return `${hours}h`;
    }
    const days = Math.round(hours / 24);
    return `${days}d`;
}

function updateSessionStatsUI() {
    const accuracy = sessionStats.attempts > 0
        ? Math.round((sessionStats.correct / sessionStats.attempts) * 100)
        : 0;

    document.getElementById('sessionScore').textContent = sessionStats.score;
    document.getElementById('sessionCompleted').textContent = sessionStats.completed;
    document.getElementById('sessionAccuracy').textContent = `${accuracy}%`;
    renderGamificationBanner(document.getElementById('lessonSkill').value);
}

function renderProgressSummary() {
    const summary = document.getElementById('progressSummary');
    const entries = Object.entries(progressByPhrase);

    if (entries.length === 0) {
        summary.textContent = 'No historical progress yet. Complete interactions to build your learning profile.';
        return;
    }

    const weakest = entries
        .map(([phrase, stats]) => {
            const accuracy = stats.attempts > 0 ? Math.round((stats.correct / stats.attempts) * 100) : 0;
            return { phrase, accuracy, attempts: stats.attempts };
        })
        .sort((a, b) => a.accuracy - b.accuracy || b.attempts - a.attempts)
        .slice(0, 3);

    const weakText = weakest
        .map((item) => `${item.phrase} (${item.accuracy}% over ${item.attempts} attempts)`)
        .join(' | ');

    const streakText = learningState.streakDays > 0 ? `${learningState.streakDays + 1} days` : '1 day';
    const goalLeft = Math.max(0, learningState.daily.goal - learningState.daily.completed);
    summary.textContent = `Focus next: ${weakText} | Streak: ${streakText} | Remaining today: ${goalLeft}`;
}

function showStatus(message, type = 'info') {
    const statusDiv = document.getElementById('translationStatus');
    statusDiv.textContent = message;
    statusDiv.className = `translation-status active ${type}`;

    if (type === 'success' || type === 'error') {
        setTimeout(() => {
            statusDiv.classList.remove('active');
        }, 5000);
    }
}

async function translateViaAPI(text) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/translate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ text })
        });

        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Translation failed');
        }

        return {
            success: true,
            translation: data.translation,
            service: data.service
        };
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

async function translateToEnglish() {
    const finnishText = document.getElementById('finnishText').value.trim();
    const translateBtn = document.getElementById('translateBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    const englishInput = document.getElementById('englishText');

    if (!finnishText) {
        showStatus('Please enter Finnish text first.', 'warning');
        return;
    }

    if (isTranslating) {
        showStatus('Translation already in progress.', 'warning');
        return;
    }

    const finnishLines = finnishText.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);

    if (finnishLines.length === 0) {
        showStatus('Please enter at least one line of Finnish text.', 'warning');
        return;
    }

    if (finnishLines.length > MAX_LINES) {
        showStatus(`Please keep to ${MAX_LINES} lines or fewer.`, 'warning');
        return;
    }

    isTranslating = true;
    translationCancelled = false;

    translateBtn.textContent = 'Translating...';
    translateBtn.style.opacity = '0.6';
    cancelBtn.style.display = 'inline-block';
    englishInput.value = '';

    const progressDiv = document.getElementById('translationProgress');
    progressDiv.className = 'translation-progress active';
    progressDiv.innerHTML = `
        <div class="progress-bar">
            <div class="progress-fill" id="progressFill" style="width: 0%">0%</div>
        </div>
        <div class="progress-text" id="progressText">Starting translation...</div>
    `;

    const translations = [];
    let successCount = 0;
    let failCount = 0;

    try {
        for (let i = 0; i < finnishLines.length; i++) {
            if (translationCancelled) {
                showStatus(`Translation cancelled after ${successCount} line(s).`, 'warning');
                break;
            }

            const line = finnishLines[i];
            if (line.length > MAX_CHARS_PER_LINE) {
                translations.push('[Line too long]');
                failCount += 1;
                continue;
            }

            updateProgress(i + 1, finnishLines.length, line);
            await new Promise((resolve) => setTimeout(resolve, 0));

            const result = await translateViaAPI(line);
            if (result.success) {
                translations.push(result.translation);
                successCount += 1;
            } else {
                translations.push('[Translation failed]');
                failCount += 1;
            }

            englishInput.value = translations.join('\n');

            if (i < finnishLines.length - 1 && !translationCancelled) {
                await new Promise((resolve) => setTimeout(resolve, 300));
            }
        }

        generateWorksheet();
        progressDiv.classList.remove('active');

        if (!translationCancelled) {
            if (failCount === 0) {
                showStatus(`Successfully translated ${successCount} line(s).`, 'success');
            } else if (successCount > 0) {
                showStatus(`Translated ${successCount} line(s), ${failCount} failed.`, 'warning');
            } else {
                showStatus('All translations failed. Please try again.', 'error');
            }
        }
    } catch (error) {
        console.error('Translation loop error:', error);
        progressDiv.classList.remove('active');
        showStatus('Translation failed. Please try again.', 'error');
    } finally {
        isTranslating = false;
        translationCancelled = false;
        translateBtn.textContent = 'Translate All Lines';
        translateBtn.style.opacity = '1';
        cancelBtn.style.display = 'none';
    }
}

function updateProgress(current, total, line) {
    const percentage = Math.round((current / total) * 100);
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');

    if (progressFill) {
        progressFill.style.width = `${percentage}%`;
        progressFill.textContent = `${percentage}%`;
    }

    if (progressText) {
        const shortLine = line.length > 40 ? `${line.slice(0, 40)}...` : line;
        progressText.textContent = `Translating ${current}/${total}: "${shortLine}"`;
    }
}

function printWorksheet() {
    window.print();
}
