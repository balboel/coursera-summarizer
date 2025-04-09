# Coursera Summarizer Chrome Extension

A Chrome extension that injects a summarization tool into Coursera video pages, allowing users to generate AI-powered summaries of video transcripts using the OpenRouter API.

## Features

*   Injects a draggable, resizable, and minimizable UI window onto Coursera pages.
*   Light/Dark theme support for the UI window.
*   Extracts transcript text directly from the Coursera transcript tab.
*   Sends transcript to OpenRouter API for summarization.
*   Saves window position, size, state, and theme preference.
*   Options page to securely save your OpenRouter API key.

## Installation (Manual - Load Unpacked)

1.  Download the repository files (either clone it or download the ZIP and extract it).
    ```bash
    git clone https://github.com/balboel/coursera-summarizer.git
    ```

2.  Open Google Chrome, type `chrome://extensions` in the address bar, and press Enter.

3.  Ensure the "Developer mode" toggle switch (usually in the top-right corner) is turned ON.

4.  Click the "Load unpacked" button (usually in the top-left corner).

5.  Navigate to and select the folder where you downloaded/cloned the extension files (the folder containing `manifest.json`).

6.  The "Coursera Summarizer" extension should now appear in your list of extensions and be active.

## Usage

1.  **Set API Key**
    *   Click on the Coursera Summarizer extension icon in your Chrome toolbar (you might need to pin it first).
    *   Click "Extension options" or right-click the icon and select "Options".
    *   Enter your [OpenRouter API key](https://openrouter.ai/keys) into the input field and click "Save Key".
2.  Go to a Coursera video page (e.g., `https://www.coursera.org/learn/.../lecture/...`).
3.  Make sure the video transcript panel is open and visible on the page.
4.  **Inject Summarizer (if needed)** If the summarizer window doesn't appear automatically (depending on your `manifest.json` setup), click the Coursera Summarizer extension icon in your toolbar.
5.  Click the "Summarize Transcript" button within the injected window. The summary will appear in the output area.
6.  Drag the window header to move it, use the bottom-right corner to resize, and use the header buttons to toggle the theme or minimize/maximize.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request or open an Issue.