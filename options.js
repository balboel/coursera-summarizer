// --- START OF FILE options.js ---
/**
 * Coursera Summarizer - Options Script
 *
 * Handles the logic for the extension's options page, specifically
 * saving and loading the OpenRouter API key to/from chrome.storage.local.
 */
document.addEventListener('DOMContentLoaded', () => {
  'use strict'

  const STORAGE_API_KEY = 'openrouter_api_key' // Match the key used in content.js

  const apiKeyInput = document.getElementById('apiKey')
  const saveButton = document.getElementById('saveButton')
  const statusDiv = document.getElementById('status')

  if (!apiKeyInput || !saveButton || !statusDiv) {
    console.error('Options Page Error: Could not find required elements (apiKey, saveButton, status).')
    if (statusDiv) statusDiv.textContent = 'Error loading options page elements.'
    return
  }

  // --- Load existing key when options page opens ---
  function loadApiKey() {
    chrome.storage.local.get([STORAGE_API_KEY], function (result) {
      if (chrome.runtime.lastError) {
        console.error('Error loading API Key:', chrome.runtime.lastError)
        displayStatus(`Error loading key: ${chrome.runtime.lastError.message}`, 'error')
      } else if (result[STORAGE_API_KEY]) {
        apiKeyInput.value = result[STORAGE_API_KEY]
        console.log('API Key loaded from storage.')
        // Optional: displayStatus('API Key loaded.', 'info');
      } else {
        console.log('No API Key found in storage.')
        // Optional: displayStatus('Enter your OpenRouter API Key.', 'info');
      }
    })
  }

  // --- Save key when button is clicked ---
  function saveApiKey() {
    const apiKey = apiKeyInput.value.trim()

    if (apiKey) {
      chrome.storage.local.set({ [STORAGE_API_KEY]: apiKey }, function () {
        if (chrome.runtime.lastError) {
          console.error('Error saving API Key:', chrome.runtime.lastError)
          displayStatus(`Error saving: ${chrome.runtime.lastError.message}`, 'error')
        } else {
          console.log('API Key saved successfully.')
          displayStatus('API Key Saved!', 'success')
        }
      })
    } else {
      displayStatus('Please enter an API key before saving.', 'error')
    }
  }

  // --- Display Status Message ---
  let statusTimeout
  function displayStatus(message, type = 'info') {
    // type can be 'info', 'success', 'error'
    clearTimeout(statusTimeout)
    statusDiv.textContent = message
    statusDiv.className = `status-${type}` // Use classes for styling

    // Automatically clear the message after a few seconds
    statusTimeout = setTimeout(() => {
      statusDiv.textContent = ''
      statusDiv.className = ''
    }, 3500)
  }

  // --- Event Listeners ---
  saveButton.addEventListener('click', saveApiKey)

  // --- Initial Load ---
  loadApiKey()
})
// --- END OF FILE options.js ---
