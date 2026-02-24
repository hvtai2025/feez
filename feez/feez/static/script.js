// Store multiple phrases
let phrases = [];

// Initialize the app
let translationCancelled = false;
let isTranslating = false;

document.addEventListener('DOMContentLoaded', () => {
    // Add event listeners
    document.getElementById('generateBtn').addEventListener('click', generateWorksheet);
    document.getElementById('printBtn').addEventListener('click', printWorksheet);
    document.getElementById('addMoreBtn').addEventListener('click', addPhrase);
    document.getElementById('translateBtn').addEventListener('click', translateToEnglish);
    document.getElementById('cancelBtn').addEventListener('click', cancelTranslation);

    // Generate initial worksheet
    generateWorksheet();
});

function cancelTranslation() {
    translationCancelled = true;
    showStatus('⚠️ Translation cancelled by user', 'warning');
}

function addPhrase() {
    const finnishText = document.getElementById('finnishText').value.trim();
    const englishText = document.getElementById('englishText').value.trim();

    if (!finnishText) {
        alert('Please enter Finnish text!');
        return;
    }

    // Parse multiple lines
    const finnishLines = finnishText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const englishLines = englishText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    // Add each line pair to stored phrases
    const maxLines = Math.max(finnishLines.length, englishLines.length);
    for (let i = 0; i < maxLines; i++) {
        phrases.push({
            finnish: finnishLines[i] || '[No Finnish text]',
            english: englishLines[i] || '[No translation]'
        });
    }

    // Clear inputs for next batch
    document.getElementById('finnishText').value = '';
    document.getElementById('englishText').value = '';
    document.getElementById('finnishText').focus();

    showStatus(`✅ Added ${maxLines} phrase(s) to worksheet!`, 'success');

    // Regenerate worksheet with all phrases
    generateWorksheet();
}

function generateWorksheet() {
    const finnishText = document.getElementById('finnishText').value.trim();
    const englishText = document.getElementById('englishText').value.trim();
    const fontSize = document.getElementById('fontSize').value;
    const lineColor = document.getElementById('lineColor').value;
    const textColor = document.getElementById('textColor').value;

    let phrasesToDisplay = [];
    
    // Parse multiple lines
    if (finnishText && englishText) {
        const finnishLines = finnishText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        const englishLines = englishText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        
        // Match Finnish and English lines
        const maxLines = Math.max(finnishLines.length, englishLines.length);
        for (let i = 0; i < maxLines; i++) {
            phrasesToDisplay.push({
                finnish: finnishLines[i] || '[No Finnish text]',
                english: englishLines[i] || '[No translation]'
            });
        }
    }

    // Add stored phrases
    phrasesToDisplay = [...phrasesToDisplay, ...phrases];

    if (phrasesToDisplay.length === 0) {
        // Use default example
        phrasesToDisplay = [
            { finnish: 'Hei, mitä kuuluu?', english: 'Hello, how are you?' },
            { finnish: 'Hyvää huomenta', english: 'Good morning' },
            { finnish: 'Kiitos paljon', english: 'Thank you very much' }
        ];
    }

    const worksheet = document.getElementById('worksheet');
    worksheet.innerHTML = '';

    const practiceLines = parseInt(document.getElementById('practiceLines').value);

    phrasesToDisplay.forEach((phrase, index) => {
        const block = createPracticeBlock(phrase.finnish, phrase.english, fontSize, lineColor, textColor, index + 1, practiceLines);
        worksheet.appendChild(block);
    });
}

// Flask API base URL (adjust if needed)
const API_BASE_URL = window.location.origin;

// Translation service configurations
const translationServices = {
    mymemory: {
        name: 'MyMemory',
        dailyLimit: 1000
    },
    libretranslate: {
        name: 'LibreTranslate',
        dailyLimit: 'unlimited'
    },
    google: {
        name: 'Google Translate',
        dailyLimit: 'unofficial'
    },
    lingva: {
        name: 'Lingva Translate',
        dailyLimit: 'unlimited'
    }
};

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

// Call Flask API to translate text
async function translateViaAPI(text, service = 'auto') {
    try {
        const response = await fetch(`${API_BASE_URL}/api/translate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                text: text,
                service: service
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            return {
                success: true,
                translation: data.translation,
                service: data.service
            };
        } else {
            throw new Error(data.error || 'Translation failed');
        }
    } catch (error) {
        console.error('API translation error:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// Call Flask API to translate multiple lines
async function translateBatchViaAPI(lines, service = 'auto') {
    try {
        const response = await fetch(`${API_BASE_URL}/api/translate-batch`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                lines: lines,
                service: service
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            return data.results;
        } else {
            throw new Error(data.error || 'Batch translation failed');
        }
    } catch (error) {
        console.error('API batch translation error:', error);
        throw error;
    }
}

// Main translation function for multiple lines (runs in background)
async function translateToEnglish() {
    const finnishText = document.getElementById('finnishText').value.trim();
    const translateBtn = document.getElementById('translateBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    const englishInput = document.getElementById('englishText');
    const selectedService = document.getElementById('translatorSelect').value;

    if (!finnishText) {
        showStatus('⚠️ Please enter Finnish text first!', 'warning');
        return;
    }

    if (isTranslating) {
        showStatus('⚠️ Translation already in progress!', 'warning');
        return;
    }

    // Split into lines and filter empty lines
    const finnishLines = finnishText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    if (finnishLines.length === 0) {
        showStatus('⚠️ Please enter at least one line of Finnish text!', 'warning');
        return;
    }

    // Set translation state
    isTranslating = true;
    translationCancelled = false;
    
    // Update UI for background mode
    translateBtn.textContent = '⏳ Translating...';
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
        showStatus(`🔄 Translating ${finnishLines.length} line(s) in background...`, 'info');

        // Run translation in background using async iteration
        for (let i = 0; i < finnishLines.length; i++) {
            if (translationCancelled) {
                showStatus(`⚠️ Translation cancelled after ${successCount} line(s)`, 'warning');
                break;
            }

            const line = finnishLines[i];
            updateProgress(i + 1, finnishLines.length, line);

            // Use setTimeout to yield control back to UI
            await new Promise(resolve => setTimeout(resolve, 0));

            try {
                // Call Flask API for translation
                const result = await translateViaAPI(line, selectedService);

                if (result.success) {
                    translations.push(result.translation);
                    successCount++;
                    showStatus(`✅ Translated with ${result.service}`, 'info');
                } else {
                    translations.push('[Translation failed]');
                    failCount++;
                }

                // Update English textarea in real-time
                englishInput.value = translations.join('\n');

                // Add delay between translations to avoid overwhelming APIs
                if (i < finnishLines.length - 1 && !translationCancelled) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            } catch (error) {
                console.error(`Error translating line ${i + 1}:`, error);
                translations.push('[Translation failed]');
                failCount++;
                englishInput.value = translations.join('\n');
            }
        }

        // Final status
        progressDiv.classList.remove('active');
        
        if (translationCancelled) {
            // Status already shown
        } else if (failCount === 0) {
            showStatus(`✅ Successfully translated all ${successCount} line(s)!`, 'success');
        } else if (successCount > 0) {
            showStatus(`⚠️ Translated ${successCount} line(s), ${failCount} failed`, 'warning');
        } else {
            showStatus('❌ All translations failed. Please try again or enter manually.', 'error');
        }

    } catch (error) {
        console.error('Translation error:', error);
        showStatus(`❌ Translation failed: ${error.message}`, 'error');
        progressDiv.classList.remove('active');
    } finally {
        // Reset UI state
        isTranslating = false;
        translateBtn.textContent = '🔄 Translate All Lines';
        translateBtn.style.opacity = '1';
        cancelBtn.style.display = 'none';
        translationCancelled = false;
    }
}

function updateProgress(current, total, currentLine) {
    const percentage = Math.round((current / total) * 100);
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    
    if (progressFill) {
        progressFill.style.width = `${percentage}%`;
        progressFill.textContent = `${percentage}%`;
    }
    
    if (progressText) {
        const shortLine = currentLine.length > 30 ? currentLine.substring(0, 30) + '...' : currentLine;
        progressText.textContent = `Translating line ${current} of ${total}: "${shortLine}"`;
    }
}

function createPracticeBlock(finnishText, englishText, fontSize, lineColor, textColor, blockNumber, practiceLines = 5) {
    const block = document.createElement('div');
    block.className = 'practice-block';

    // Block title
    const title = document.createElement('h3');
    title.textContent = `Practice ${blockNumber}`;
    title.className = 'practice-title';
    title.style.color = textColor;
    title.style.marginBottom = '15px';
    block.appendChild(title);

    // Finnish line (now first)
    const finnishLine = document.createElement('div');
    finnishLine.className = 'practice-line finnish-line';
    finnishLine.setAttribute('data-label', 'Finnish');
    finnishLine.setAttribute('data-short-label', 'fi');
    finnishLine.setAttribute('data-text', finnishText);
    finnishLine.textContent = `Finnish: ${finnishText}`;
    finnishLine.style.fontSize = `${fontSize}px`;
    finnishLine.style.color = textColor;
    block.appendChild(finnishLine);

    // English line (now second)
    const englishLine = document.createElement('div');
    englishLine.className = 'practice-line english-line';
    englishLine.setAttribute('data-label', 'English');
    englishLine.setAttribute('data-short-label', 'en');
    englishLine.setAttribute('data-text', englishText);
    englishLine.textContent = `English: ${englishText}`;
    englishLine.style.fontSize = `${fontSize}px`;
    englishLine.style.color = '#6c757d';
    block.appendChild(englishLine);

    // Divider
    const divider = document.createElement('hr');
    divider.style.margin = '20px 0';
    divider.style.border = 'none';
    divider.style.borderTop = `2px dashed ${lineColor}`;
    block.appendChild(divider);

    // Practice label
    const practiceLabel = document.createElement('div');
    practiceLabel.textContent = 'Practice Writing:';
    practiceLabel.className = 'practice-label';
    practiceLabel.style.fontSize = '14px';
    practiceLabel.style.color = '#6c757d';
    practiceLabel.style.marginBottom = '10px';
    practiceLabel.style.fontWeight = '600';
    block.appendChild(practiceLabel);

    // Empty practice lines (user adjustable)
    for (let i = 1; i <= practiceLines; i++) {
        const emptyLine = document.createElement('div');
        emptyLine.className = 'empty-line';
        emptyLine.style.borderBottomColor = lineColor;
        emptyLine.style.height = `${parseInt(fontSize) * 2}px`;
        
        // Add line number
        const lineNumber = document.createElement('span');
        lineNumber.className = 'line-number';
        lineNumber.textContent = i;
        emptyLine.appendChild(lineNumber);
        
        block.appendChild(emptyLine);
    }

    return block;
}

function printWorksheet() {
    window.print();
}

// Add some common Finnish phrases
const commonPhrases = [
    { finnish: 'Hei, mitä kuuluu?', english: 'Hello, how are you?' },
    { finnish: 'Hyvää huomenta', english: 'Good morning' },
    { finnish: 'Hyvää iltaa', english: 'Good evening' },
    { finnish: 'Kiitos paljon', english: 'Thank you very much' },
    { finnish: 'Ole hyvä', english: 'You\'re welcome' },
    { finnish: 'En ymmärrä', english: 'I don\'t understand' },
    { finnish: 'Mikä sinun nimesi on?', english: 'What is your name?' },
    { finnish: 'Minun nimeni on...', english: 'My name is...' },
    { finnish: 'Hauska tavata', english: 'Nice to meet you' },
    { finnish: 'Nähdään myöhemmin', english: 'See you later' }
];

// Optional: Add quick select for common phrases
function addQuickSelectButtons() {
    const controls = document.querySelector('.controls');
    const quickSelect = document.createElement('div');
    quickSelect.style.marginTop = '20px';
    quickSelect.innerHTML = '<h4>Quick Select Common Phrases:</h4>';
    
    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.flexWrap = 'wrap';
    buttonContainer.style.gap = '10px';
    buttonContainer.style.marginTop = '10px';
    
    commonPhrases.forEach(phrase => {
        const btn = document.createElement('button');
        btn.textContent = phrase.finnish;
        btn.className = 'btn-secondary';
        btn.style.fontSize = '12px';
        btn.style.padding = '8px 15px';
        btn.onclick = () => {
            document.getElementById('finnishText').value = phrase.finnish;
            document.getElementById('englishText').value = phrase.english;
            generateWorksheet();
        };
        buttonContainer.appendChild(btn);
    });
    
    quickSelect.appendChild(buttonContainer);
    controls.appendChild(quickSelect);
}

// Uncomment to enable quick select
// addQuickSelectButtons();
