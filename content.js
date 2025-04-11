// --- START OF FILE content.js ---
/**
 * Coursera Summarizer - Content Script
 * Injects UI, extracts transcripts, calls API, displays summaries, allows saving.
 */
;(function () {
  'use strict'

  // --- Constants ---
  const WINDOW_ID = 'coursera-summarizer-window'
  const STORAGE_KEYS = {
    API_KEY: 'openrouter_api_key',
    WINDOW_POS: 'windowPos',
    WINDOW_SIZE: 'windowSize',
    WINDOW_STATE: 'windowState',
    THEME: 'theme',
    SAVED_SUMMARIES: 'savedSummaries'
  }
  const API_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'
  const MODEL_NAME = 'google/gemini-2.0-flash-thinking-exp:free'
  const TRANSCRIPT_CONTAINER_SELECTOR = 'div.phrases'
  const PHRASE_SELECTOR = 'div.rc-Phrase'
  const EXTENSION_NAME = 'Coursera Summarizer'

  // --- Global Variables ---
  let currentRawSummary = null // Holds the latest raw summary text

  // --- Prevent Multiple Injections ---
  if (document.getElementById(WINDOW_ID)) {
    return
  }
  console.log('Coursera Summarizer: Initializing...')

  // --- Create Summarizer Window ---
  const summarizerWindow = document.createElement('div')
  summarizerWindow.id = WINDOW_ID
  summarizerWindow.classList.add('light-mode') // Default theme
  summarizerWindow.innerHTML = `
        <div id="coursera-summarizer-header">
            <h3>Coursera Summarizer</h3>
            <div id="coursera-summarizer-controls">
                <button id="coursera-summarizer-theme-btn" title="Toggle Theme"></button>
                <button id="coursera-summarizer-minimize-btn" title="Minimize/Maximize"></button>
            </div>
        </div>
        <div id="coursera-summarizer-content">
            <div class="cs-button-row">
                 <button id="coursera-summarizer-button">Summarize Transcript</button>
                 <button id="coursera-summarizer-save-button" class="cs-icon-button" style="display: none;" title="Save this summary">
                     <!-- Icon added via CSS -->
                 </button>
            </div>
            <div id="coursera-summarizer-status">Ready. Select 'Summarize Transcript'.</div>
            <div id="coursera-summarizer-output"></div>
        </div>
    `
  document.body.appendChild(summarizerWindow)

  // --- Get Element References ---
  const header = document.getElementById('coursera-summarizer-header')
  const minimizeBtn = document.getElementById('coursera-summarizer-minimize-btn')
  const themeBtn = document.getElementById('coursera-summarizer-theme-btn')
  const summarizeButton = document.getElementById('coursera-summarizer-button')
  const saveSummarizeButton = document.getElementById('coursera-summarizer-save-button')
  const statusArea = document.getElementById('coursera-summarizer-status')
  const outputArea = document.getElementById('coursera-summarizer-output')

  // --- Basic Element Check ---
  if (!header || !minimizeBtn || !themeBtn || !summarizeButton || !saveSummarizeButton || !statusArea || !outputArea) {
    console.error('Coursera Summarizer: Failed to find critical window elements. Aborting.')
    summarizerWindow.remove()
    return
  }

  // --- State Restoration ---
  chrome.storage.local.get(
    [STORAGE_KEYS.WINDOW_POS, STORAGE_KEYS.WINDOW_SIZE, STORAGE_KEYS.WINDOW_STATE, STORAGE_KEYS.THEME],
    function (result) {
      if (result.windowPos?.top && result.windowPos?.left) {
        summarizerWindow.style.top = result.windowPos.top
        summarizerWindow.style.left = result.windowPos.left
      }
      const isMinimized = result.windowState === 'minimized'
      if (isMinimized) {
        summarizerWindow.classList.add('minimized')
      }
      if (result.windowSize?.width && result.windowSize?.height && !isMinimized) {
        summarizerWindow.style.width = result.windowSize.width
        summarizerWindow.style.height = result.windowSize.height
      }
      const currentTheme = result.theme === 'dark' ? 'dark' : 'light'
      summarizerWindow.classList.remove('light-mode', 'dark-mode')
      summarizerWindow.classList.add(`${currentTheme}-mode`)
    }
  )

  // --- State Saving Functions ---
  const saveStateItem = (key, value) => {
    chrome.storage.local.set({ [key]: value }, () => {
      if (chrome.runtime.lastError) console.error(`Error saving ${key}:`, chrome.runtime.lastError)
    })
  }
  const saveWindowPos = () =>
    saveStateItem(STORAGE_KEYS.WINDOW_POS, {
      top: summarizerWindow.style.top,
      left: summarizerWindow.style.left
    })
  let resizeTimeout
  const saveWindowSize = () => {
    if (summarizerWindow.classList.contains('minimized')) return
    clearTimeout(resizeTimeout)
    resizeTimeout = setTimeout(() => {
      requestAnimationFrame(() => {
        const newSize = {
          width: summarizerWindow.style.width || window.getComputedStyle(summarizerWindow).width,
          height: summarizerWindow.style.height || window.getComputedStyle(summarizerWindow).height
        }
        saveStateItem(STORAGE_KEYS.WINDOW_SIZE, newSize)
      })
    }, 300)
  }
  const saveWindowState = (state) => saveStateItem(STORAGE_KEYS.WINDOW_STATE, state)
  const saveTheme = (theme) => saveStateItem(STORAGE_KEYS.THEME, theme)

  // --- UI Interaction Handlers ---
  themeBtn.addEventListener('click', (e) => {
    // Theme Toggle
    e.stopPropagation()
    const newTheme = summarizerWindow.classList.contains('dark-mode') ? 'light' : 'dark'
    summarizerWindow.classList.remove('light-mode', 'dark-mode')
    summarizerWindow.classList.add(`${newTheme}-mode`)
    saveTheme(newTheme)
  })
  minimizeBtn.addEventListener('click', (e) => {
    // Minimize/Maximize
    e.stopPropagation()
    const isMinimized = summarizerWindow.classList.toggle('minimized')
    saveWindowState(isMinimized ? 'minimized' : 'maximized')
    if (!isMinimized) {
      chrome.storage.local.get(STORAGE_KEYS.WINDOW_SIZE, (res) => {
        if (res.windowSize?.width && res.windowSize?.height) {
          summarizerWindow.style.width = res.windowSize.width
          summarizerWindow.style.height = res.windowSize.height
        }
      })
    }
  })
  let isDragging = false
  let startX, startY, initialLeft, initialTop // Drag Handling
  header.addEventListener('mousedown', (e) => {
    if (e.target.closest('button')) return
    isDragging = true
    startX = e.clientX
    startY = e.clientY
    initialLeft = summarizerWindow.offsetLeft
    initialTop = summarizerWindow.offsetTop
    header.style.cursor = 'grabbing'
    document.addEventListener('mousemove', onDragMove)
    document.addEventListener('mouseup', onDragEnd)
  })
  function onDragMove(e) {
    if (!isDragging) return
    const dx = e.clientX - startX
    const dy = e.clientY - startY
    let newTop = initialTop + dy
    let newLeft = initialLeft + dx
    newTop = Math.max(0, Math.min(newTop, window.innerHeight - header.offsetHeight))
    newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - summarizerWindow.offsetWidth))
    summarizerWindow.style.top = `${newTop}px`
    summarizerWindow.style.left = `${newLeft}px`
  }
  function onDragEnd() {
    if (isDragging) {
      isDragging = false
      header.style.cursor = 'move'
      document.removeEventListener('mousemove', onDragMove)
      document.removeEventListener('mouseup', onDragEnd)
      saveWindowPos()
    }
  }
  let isResizing = false // Resize Handling
  summarizerWindow.addEventListener('mousedown', (e) => {
    const rect = summarizerWindow.getBoundingClientRect()
    if (
      !summarizerWindow.classList.contains('minimized') &&
      e.clientX > rect.right - 15 &&
      e.clientY > rect.bottom - 15
    ) {
      isResizing = true
      summarizerWindow.classList.add('resizing')
    }
  })
  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false
      summarizerWindow.classList.remove('resizing')
      saveWindowSize()
    }
  })
  const resizeObserver = new ResizeObserver(() => {
    if (!isResizing && !summarizerWindow.classList.contains('minimized')) {
      saveWindowSize()
    }
  })
  resizeObserver.observe(summarizerWindow)

  // --- Core Functionality ---
  function extractTranscriptText() {
    // Extracts transcript text from page
    statusArea.textContent = 'Extracting transcript...'
    const container = document.querySelector(TRANSCRIPT_CONTAINER_SELECTOR)
    if (!container) {
      statusArea.textContent = 'Error: Transcript container not found.'
      outputArea.textContent = 'Is transcript panel open?'
      return null
    }
    const phrases = container.querySelectorAll(PHRASE_SELECTOR)
    if (!phrases || phrases.length === 0) {
      statusArea.textContent = 'Error: No phrases found.'
      outputArea.textContent = 'Transcript seems empty.'
      return null
    }
    const lines = Array.from(phrases)
      .map((el) => el.innerText?.trim())
      .filter(Boolean)
    const text = lines.join(' ')
    if (!text || text.length < 20) {
      statusArea.textContent = 'Error: Extracted transcript too short.'
      return null
    }
    statusArea.textContent = 'Transcript extracted.'
    return text
  }

  async function callOpenRouterAPI(transcriptText, apiKey) {
    // Calls API for summary
    statusArea.textContent = 'Sending transcript to AI...'
    outputArea.innerHTML = '<p><i>Generating summary...</i></p>'
    const systemPrompt =
      'You are an expert summarizer. Provide a concise summary of the key points from the video transcript. Format output using Markdown with headings (## Key Points, ## Summary) and bullet points.'
    const userPrompt = `Please summarize this transcript:\n\n---\n${transcriptText}\n---`
    const requestBody = {
      model: MODEL_NAME,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    }
    try {
      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'X-Title': EXTENSION_NAME
        },
        body: JSON.stringify(requestBody)
      })
      if (!response.ok) {
        let msg = `API Error ${response.status}`
        try {
          const err = await response.json()
          msg = err?.error?.message || msg
        } catch (e) {}
        throw new Error(msg)
      }
      const data = await response.json()
      const summary = data.choices?.[0]?.message?.content?.trim()
      if (!summary) {
        throw new Error('Failed to parse summary from API response.')
      }
      return summary
    } catch (error) {
      console.error('API Call Error:', error)
      statusArea.textContent = `Error: ${error.message}`
      outputArea.innerHTML = `<p><b>API Call Failed.</b> Check console (F12).</p>`
      throw error
    }
  }

  function renderMarkdown(markdownText) {
    // Renders Markdown to HTML
    if (typeof marked === 'object' && typeof marked.parse === 'function') {
      try {
        return marked.parse(markdownText, {
          sanitize: false,
          headerIds: false,
          mangle: false
        })
      } catch (e) {
        console.error('Markdown Error:', e)
        statusArea.textContent = 'Warning: Failed to format summary.'
      }
    } else {
      console.warn("'marked' library not found.")
      statusArea.textContent = 'Summary generated (raw).'
    }
    return `<pre>${markdownText}</pre>`
  }

  // --- Summarize Button Action ---
  summarizeButton.addEventListener('click', () => {
    statusArea.textContent = 'Starting...'
    outputArea.innerHTML = ''
    summarizeButton.disabled = true
    statusArea.classList.add('loading')
    saveSummarizeButton.style.display = 'none'
    saveSummarizeButton.disabled = true
    saveSummarizeButton.classList.remove('saved') // Reset save button
    currentRawSummary = null

    chrome.storage.local.get(STORAGE_KEYS.API_KEY, async (result) => {
      const apiKey = result[STORAGE_KEYS.API_KEY]
      if (!apiKey) {
        statusArea.textContent = 'Error: API Key not set.'
        outputArea.innerHTML = '<p>Set API Key in options.</p>'
        summarizeButton.disabled = false
        statusArea.classList.remove('loading')
        return
      }

      try {
        const transcript = extractTranscriptText()
        if (!transcript) {
          throw new Error('Transcript extraction failed.')
        }
        const rawSummary = await callOpenRouterAPI(transcript, apiKey)
        currentRawSummary = rawSummary // Store raw summary
        const htmlSummary = renderMarkdown(rawSummary)
        outputArea.innerHTML = htmlSummary
        statusArea.textContent = 'Summary generated!'
        saveSummarizeButton.style.display = 'inline-flex'
        saveSummarizeButton.disabled = false // Show & enable save button
      } catch (error) {
        console.error('Summarization process failed:', error) /* Status already set by failing function */
      } finally {
        summarizeButton.disabled = false
        statusArea.classList.remove('loading')
      }
    })
  })

  // --- Save Summary Button Action ---
  saveSummarizeButton.addEventListener('click', async () => {
    if (!currentRawSummary) {
      statusArea.textContent = 'Error: Nothing to save.'
      return
    }
    const summaryData = {
      id: `summary-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      url: window.location.href,
      summary: currentRawSummary
    }
    saveSummarizeButton.disabled = true
    statusArea.textContent = 'Saving summary...' // Disable button immediately

    try {
      const result = await chrome.storage.local.get([STORAGE_KEYS.SAVED_SUMMARIES])
      const summaries = result[STORAGE_KEYS.SAVED_SUMMARIES] || []
      summaries.push(summaryData)
      await chrome.storage.local.set({
        [STORAGE_KEYS.SAVED_SUMMARIES]: summaries
      })
      statusArea.textContent = 'Summary saved!'
      saveSummarizeButton.classList.add('saved') // Add 'saved' class (stays disabled)
    } catch (error) {
      console.error('Error saving summary:', error)
      statusArea.textContent = `Error saving: ${error.message}`
      saveSummarizeButton.disabled = false /* Re-enable only on error */
    }
  })

  console.log('Coursera Summarizer: Initialization complete.')
})() // End of IIFE
// --- END OF FILE content.js ---
