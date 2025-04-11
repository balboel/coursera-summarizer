// --- START OF FILE content.js ---
/**
 * Coursera Summarizer - Content Script
 *
 * Injects the summarizer UI into Coursera video pages, handles UI interactions
 * (drag, resize, minimize, theme), extracts video transcripts, calls the
 * OpenRouter API for summarization, and displays the results.
 */
(function() {
    'use strict';

    // --- Constants ---
    const WINDOW_ID = 'coursera-summarizer-window';
    const STORAGE_KEYS = {
        API_KEY: 'openrouter_api_key',
        WINDOW_POS: 'windowPos',
        WINDOW_SIZE: 'windowSize',
        WINDOW_STATE: 'windowState',
        THEME: 'theme',
    };
    const API_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
    const MODEL_NAME = "google/gemini-2.0-flash-thinking-exp:free"; // Or choose another model
    const TRANSCRIPT_CONTAINER_SELECTOR = 'div.phrases';
    const PHRASE_SELECTOR = 'div.rc-Phrase';
    const EXTENSION_NAME = 'Coursera Summarizer'; 

    // --- Prevent Multiple Injections ---
    if (document.getElementById(WINDOW_ID)) {
        console.log('Coursera Summarizer: Already injected.');
        return;
    }
    console.log('Coursera Summarizer: Initializing...');

    // --- Create Summarizer Window ---
    const summarizerWindow = document.createElement('div');
    summarizerWindow.id = WINDOW_ID;
    summarizerWindow.classList.add('light-mode'); // Default theme
    summarizerWindow.innerHTML = `
        <div id="coursera-summarizer-header">
            <h3>Coursera Summarizer</h3>
            <div id="coursera-summarizer-controls">
                <button id="coursera-summarizer-theme-btn" title="Toggle Theme"></button>
                <button id="coursera-summarizer-minimize-btn" title="Minimize/Maximize"></button>
            </div>
        </div>
        <div id="coursera-summarizer-content">
            <button id="coursera-summarizer-button">Summarize Transcript</button>
            <div id="coursera-summarizer-status">Ready. Select 'Summarize Transcript'.</div>
            <div id="coursera-summarizer-output"></div>
        </div>
    `;
    document.body.appendChild(summarizerWindow);
    console.log('Coursera Summarizer: Popup window injected.');

    // --- Get Element References ---
    const header = document.getElementById('coursera-summarizer-header');
    const minimizeBtn = document.getElementById('coursera-summarizer-minimize-btn');
    const themeBtn = document.getElementById('coursera-summarizer-theme-btn');
    const contentDiv = document.getElementById('coursera-summarizer-content'); // Used? Maybe remove if not needed directly
    const summarizeButton = document.getElementById('coursera-summarizer-button');
    const statusArea = document.getElementById('coursera-summarizer-status');
    const outputArea = document.getElementById('coursera-summarizer-output');

    // --- Basic Element Check ---
    if (!header || !minimizeBtn || !themeBtn || !summarizeButton || !statusArea || !outputArea) {
        console.error('Coursera Summarizer: Failed to find critical window elements. Aborting.');
        summarizerWindow.remove(); // Clean up injected div
        return;
    }

    // --- State Restoration ---
    chrome.storage.local.get([
        STORAGE_KEYS.WINDOW_POS,
        STORAGE_KEYS.WINDOW_SIZE,
        STORAGE_KEYS.WINDOW_STATE,
        STORAGE_KEYS.THEME
    ], function(result) {
        // Restore Position
        if (result.windowPos?.top && result.windowPos?.left) {
            summarizerWindow.style.top = result.windowPos.top;
            summarizerWindow.style.left = result.windowPos.left;
        }
        // Restore State (Minimized/Maximized) - Must happen before size potentially
        const isMinimized = result.windowState === 'minimized';
        if (isMinimized) {
            summarizerWindow.classList.add('minimized');
        }
        // Restore Size (Apply only if NOT minimized)
        if (result.windowSize?.width && result.windowSize?.height && !isMinimized) {
             summarizerWindow.style.width = result.windowSize.width;
             summarizerWindow.style.height = result.windowSize.height;
        }
        // Restore Theme
        const currentTheme = result.theme === 'dark' ? 'dark' : 'light'; // Default to light
        summarizerWindow.classList.remove('light-mode', 'dark-mode');
        summarizerWindow.classList.add(`${currentTheme}-mode`);
        console.log(`Coursera Summarizer: Restored state - Theme: ${currentTheme}, Minimized: ${isMinimized}`);
    });

    // --- State Saving Functions ---
    const saveWindowPos = () => {
        const pos = { top: summarizerWindow.style.top, left: summarizerWindow.style.left };
        chrome.storage.local.set({ [STORAGE_KEYS.WINDOW_POS]: pos }, () => {
            if (chrome.runtime.lastError) console.error('Error saving position:', chrome.runtime.lastError);
            // else console.log('Window position saved:', pos); // Optional: Keep for debugging
        });
    };

    let resizeTimeout;
    const saveWindowSize = () => {
        if (summarizerWindow.classList.contains('minimized')) return; // Don't save size if minimized

        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
             requestAnimationFrame(() => { // Get final computed style after potential reflow
                const newSize = {
                    width: summarizerWindow.style.width || window.getComputedStyle(summarizerWindow).width,
                    height: summarizerWindow.style.height || window.getComputedStyle(summarizerWindow).height
                };
                chrome.storage.local.set({ [STORAGE_KEYS.WINDOW_SIZE]: newSize }, () => {
                    if (chrome.runtime.lastError) console.error('Error saving size:', chrome.runtime.lastError);
                    // else console.log('Window size saved (debounced):', newSize); // Optional: Keep for debugging
                });
             });
        }, 300); // Debounce save
    };

    const saveWindowState = (state) => { // state = 'minimized' or 'maximized'
        chrome.storage.local.set({ [STORAGE_KEYS.WINDOW_STATE]: state }, () => {
            if (chrome.runtime.lastError) console.error('Error saving state:', chrome.runtime.lastError);
            // else console.log('Window state saved:', state); // Optional: Keep for debugging
        });
    };

    const saveTheme = (theme) => { // theme = 'light' or 'dark'
        chrome.storage.local.set({ [STORAGE_KEYS.THEME]: theme }, () => {
            if (chrome.runtime.lastError) console.error('Error saving theme:', chrome.runtime.lastError);
            // else console.log('Theme saved:', theme); // Optional: Keep for debugging
        });
    };

    // --- UI Interaction Handlers ---

    // Theme Toggle
    themeBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent triggering drag
        const isDark = summarizerWindow.classList.contains('dark-mode');
        const newTheme = isDark ? 'light' : 'dark';
        summarizerWindow.classList.remove('light-mode', 'dark-mode');
        summarizerWindow.classList.add(`${newTheme}-mode`);
        saveTheme(newTheme);
    });

    // Minimize/Maximize Toggle
    minimizeBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent triggering drag
        const isMinimized = summarizerWindow.classList.toggle('minimized');
        const newState = isMinimized ? 'minimized' : 'maximized';
        saveWindowState(newState);
        // If maximizing, restore size if it was previously saved
        if (!isMinimized) {
             chrome.storage.local.get(STORAGE_KEYS.WINDOW_SIZE, (result) => {
                if (result.windowSize?.width && result.windowSize?.height) {
                   summarizerWindow.style.width = result.windowSize.width;
                   summarizerWindow.style.height = result.windowSize.height;
                }
             });
        }
    });

    // Drag Handling
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    header.addEventListener('mousedown', (e) => {
        // Prevent dragging if clicking on buttons within the header
        if (e.target.closest('button')) return;

        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        initialLeft = summarizerWindow.offsetLeft;
        initialTop = summarizerWindow.offsetTop;
        header.style.cursor = 'grabbing';
        document.addEventListener('mousemove', onDragMove);
        document.addEventListener('mouseup', onDragEnd);
    });

    function onDragMove(e) {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        let newTop = initialTop + dy;
        let newLeft = initialLeft + dx;

        // Boundary checks (keep header visible)
        const maxTop = window.innerHeight - header.offsetHeight;
        const maxLeft = window.innerWidth - summarizerWindow.offsetWidth;
        newTop = Math.max(0, Math.min(newTop, maxTop));
        newLeft = Math.max(0, Math.min(newLeft, maxLeft));

        summarizerWindow.style.top = `${newTop}px`;
        summarizerWindow.style.left = `${newLeft}px`;
    }

    function onDragEnd() {
        if (isDragging) {
            isDragging = false;
            header.style.cursor = 'move';
            document.removeEventListener('mousemove', onDragMove);
            document.removeEventListener('mouseup', onDragEnd);
            saveWindowPos(); // Save position on mouse up
        }
    }

    // Resize Handling (using native CSS resize + JS saving)
    let isResizing = false;
    summarizerWindow.addEventListener('mousedown', (e) => {
        // Detect if mousedown is near the bottom-right corner (resize handle area)
        const rect = summarizerWindow.getBoundingClientRect();
        const handleSize = 15; // Area size for detection
        if (!summarizerWindow.classList.contains('minimized') &&
            e.clientX > rect.right - handleSize && e.clientY > rect.bottom - handleSize)
        {
            isResizing = true;
            summarizerWindow.classList.add('resizing'); // Disable transitions during resize
            // console.log('Resize potentially started'); // Optional debug
        }
    });

    document.addEventListener('mouseup', () => {
        // Mouse up anywhere ends the resize attempt
        if (isResizing) {
            isResizing = false;
            summarizerWindow.classList.remove('resizing'); // Re-enable transitions
            // console.log('Resize ended'); // Optional debug
            saveWindowSize(); // Save size immediately on mouse up after resize
        }
    });

    // ResizeObserver as a fallback and for non-mouse resizes (e.g., dev tools)
    const resizeObserver = new ResizeObserver(entries => {
        // Only trigger save via observer if not actively mouse-resizing
        if (!isResizing && !summarizerWindow.classList.contains('minimized')) {
            saveWindowSize(); // Debounced save
        }
    });
    resizeObserver.observe(summarizerWindow);

    // --- Core Functionality ---

    /**
     * Extracts transcript text from the Coursera page.
     * @returns {string|null} The extracted transcript text or null if failed.
     */
    function extractTranscriptText() {
        statusArea.textContent = 'Extracting transcript...';
        console.log('Coursera Summarizer: Attempting transcript extraction...');

        const transcriptContainer = document.querySelector(TRANSCRIPT_CONTAINER_SELECTOR);
        if (!transcriptContainer) {
            console.error(`Coursera Summarizer: Transcript container not found ('${TRANSCRIPT_CONTAINER_SELECTOR}')`);
            statusArea.textContent = 'Error: Transcript container not found.';
            outputArea.textContent = 'Please ensure the transcript panel is visible on the page.';
            return null;
        }

        const phraseElements = transcriptContainer.querySelectorAll(PHRASE_SELECTOR);
        if (!phraseElements || phraseElements.length === 0) {
            console.error(`Coursera Summarizer: No phrase elements found ('${PHRASE_SELECTOR}') inside container.`);
            statusArea.textContent = 'Error: No phrases found in the transcript container.';
            outputArea.textContent = 'The transcript appears to be empty.';
            return null;
        }

        const lines = Array.from(phraseElements)
                           .map(el => el.innerText?.trim())
                           .filter(Boolean); // Remove empty lines

        const transcriptText = lines.join(' ');

        if (!transcriptText || transcriptText.length < 20) { // Basic sanity check
            console.warn('Coursera Summarizer: Extracted transcript seems very short or empty.');
            statusArea.textContent = 'Error: Extracted transcript is too short or empty.';
            outputArea.textContent = `(Extraction resulted in very short text. Length: ${transcriptText.length})`;
            return null;
        }

        console.log(`Coursera Summarizer: Transcript extracted (${transcriptText.length} chars).`);
        // console.log(`Coursera Summarizer: Transcript start: ${transcriptText.substring(0, 200)}...`); // Optional debug
        statusArea.textContent = 'Transcript extracted successfully.';
        return transcriptText;
    }

    /**
     * Calls the OpenRouter API to summarize the provided text.
     * @param {string} transcriptText The text to summarize.
     * @param {string} apiKey The OpenRouter API key.
     * @returns {Promise<string>} A promise that resolves with the summary text.
     * @throws {Error} Throws an error if the API call fails.
     */
    async function callOpenRouterAPI(transcriptText, apiKey) {
        console.log('Coursera Summarizer: Calling OpenRouter API...');
        statusArea.textContent = 'Sending transcript to AI...';
        outputArea.innerHTML = '<p><i>Generating summary... Please wait.</i></p>'; // Use HTML for italics

        const systemPrompt = "You are an expert summarizer. Provide a concise, easy-to-understand summary of the key points from the following video transcript. Focus on the main topics and conclusions. Format the output using Markdown with clear headings (e.g., ## Key Points, ## Summary) and bullet points for key takeaways.";
        const userPrompt = `Please summarize this transcript:\n\n---\n${transcriptText}\n---`;

        const requestBody = {
            model: MODEL_NAME,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            // max_tokens: 500, // Optional: Adjust as needed
            // temperature: 0.6, // Optional: Adjust for creativity vs consistency
        };

        try {
            const response = await fetch(API_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'X-Title': EXTENSION_NAME,     // Recommended for OpenRouter tracking
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                let errorData;
                let errorMessage = `API Error ${response.status}: ${response.statusText}`;
                try {
                    errorData = await response.json();
                    errorMessage = errorData?.error?.message || errorMessage; // Use specific message if available
                    console.error('Coursera Summarizer: API Error Data:', errorData);
                } catch (e) {
                     console.warn('Coursera Summarizer: Could not parse JSON error response body.');
                }
                throw new Error(errorMessage);
            }

            const data = await response.json();
            // console.log('Coursera Summarizer: API Response Data:', data); // Optional debug

            const summary = data.choices?.[0]?.message?.content?.trim();

            if (!summary) {
                 console.error('Coursera Summarizer: Summary content not found in API response structure.', data);
                throw new Error('Failed to parse summary from API response.');
            }

            console.log('Coursera Summarizer: Summary received successfully.');
            return summary; // Return the raw summary text (likely Markdown)

        } catch (error) {
             console.error('Coursera Summarizer: Error during OpenRouter API call:', error);
             statusArea.textContent = `Error: ${error.message}`;
             outputArea.innerHTML = `<p><b>API Call Failed:</b></p><p>${error.message}</p><p><small>Check console (F12) for details. Verify API key, funds, and model ('${MODEL_NAME}') availability on OpenRouter.</small></p>`;
             throw error; // Re-throw to be caught by the main handler
        }
    }

    /**
     * Renders Markdown text as HTML using the 'marked' library.
     * Falls back to plain text if 'marked' is not available.
     * @param {string} markdownText The Markdown text to render.
     * @returns {string} The rendered HTML or plain text.
     */
    function renderMarkdown(markdownText) {
        // Check if the 'marked' library is loaded (it should be included via manifest.json)
        if (typeof marked === 'object' && typeof marked.parse === 'function') {
            try {
               console.log("Coursera Summarizer: Formatting summary using marked.parse().");
               // Ensure options prevent raw HTML injection from the LLM potentially
               const htmlSummary = marked.parse(markdownText, { sanitize: false, headerIds: false, mangle: false }); // Adjust options as needed
               return htmlSummary;
            } catch (parseError) {
               console.error("Coursera Summarizer: Error parsing Markdown:", parseError);
               statusArea.textContent = 'Warning: Failed to format summary (displaying raw).';
               return `<pre>${markdownText}</pre>`; // Show raw but wrap in pre for readability
            }
        } else {
            console.warn("Coursera Summarizer: 'marked' library not found. Displaying raw text.");
            statusArea.textContent = 'Summary generated (raw format - marked library missing).';
            return `<pre>${markdownText}</pre>`; // Show raw but wrap in pre
        }
    }


    // --- Summarize Button Action ---
    summarizeButton.addEventListener('click', () => {
        console.log('Coursera Summarizer: Summarize button clicked.');
        statusArea.textContent = 'Starting...';
        outputArea.innerHTML = ''; // Clear previous output
        summarizeButton.disabled = true;
        statusArea.classList.add('loading');

        chrome.storage.local.get(STORAGE_KEYS.API_KEY, async (result) => {
            const apiKey = result[STORAGE_KEYS.API_KEY];

            if (!apiKey) {
                console.error('Coursera Summarizer: API Key not found in storage.');
                statusArea.textContent = 'Error: API Key not set.';
                outputArea.innerHTML = '<p>Please set your OpenRouter API Key in the extension options.</p>';
                summarizeButton.disabled = false;
                statusArea.classList.remove('loading');
                return;
            }
            console.log('Coursera Summarizer: API Key retrieved.');

            try {
                // 1. Extract Transcript
                const transcript = extractTranscriptText();
                if (!transcript) {
                    // Error message already set by extractTranscriptText
                    summarizeButton.disabled = false;
                    statusArea.classList.remove('loading');
                    return;
                }

                // 2. Call API
                // Status updates handled within callOpenRouterAPI
                const rawSummary = await callOpenRouterAPI(transcript, apiKey);

                // 3. Render and Display Summary
                if (rawSummary) {
                    const htmlSummary = renderMarkdown(rawSummary);
                    outputArea.innerHTML = htmlSummary;
                    statusArea.textContent = 'Summary generated!';
                    console.log("Coursera Summarizer: Summary displayed.");
                } else {
                    // This case should ideally be handled by errors in callOpenRouterAPI
                    console.error("Coursera Summarizer: API call succeeded but returned no summary content.");
                    statusArea.textContent = 'Error: Received empty summary from API.';
                    outputArea.innerHTML = '<p>The API returned an empty response.</p>';
                }

            } catch (error) {
                // Errors during extraction or API call are caught here.
                // User-facing messages should already be set by the failing function.
                console.error("Coursera Summarizer: Summarization process failed.", error);
                // No need to set status/output again, it's done in the failing function.
            } finally {
                // 4. Cleanup: Re-enable Button & Remove Loading Class
                summarizeButton.disabled = false;
                statusArea.classList.remove('loading');
                console.log('Coursera Summarizer: Summarize process finished (successfully or with errors).');
            }
        }); // End of chrome.storage.local.get callback
    }); // End of summarizeButton listener

    console.log('Coursera Summarizer: Initialization complete.');

})(); // End of IIFE
// --- END OF FILE content.js ---