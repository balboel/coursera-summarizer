document.addEventListener('DOMContentLoaded', () => {
    const summariesContainer = document.getElementById('summariesContainer');
    const loadingStatus = document.getElementById('loadingStatus');
    const deleteAllButton = document.getElementById('deleteAllButton');
    const cardTemplate = document.querySelector('.summary-card-placeholder'); // Get template

    async function loadSummaries() {
        summariesContainer.innerHTML = ''; // Clear previous content
        loadingStatus.textContent = 'Loading summaries...';
        loadingStatus.style.display = 'block';

        try {
            const result = await chrome.storage.local.get(['savedSummaries']);
            const summaries = result.savedSummaries || [];

            if (summaries.length === 0) {
                loadingStatus.textContent = 'No summaries saved yet.';
                deleteAllButton.style.display = 'none'; // Hide delete all if empty
            } else {
                loadingStatus.style.display = 'none';
                deleteAllButton.style.display = 'inline-block'; // Show delete all

                // Sort summaries by timestamp, newest first
                summaries.sort((a, b) => b.timestamp - a.timestamp);

                summaries.forEach(summary => {
                    const card = createSummaryCard(summary);
                    summariesContainer.appendChild(card);
                });
            }
        } catch (error) {
            console.error("Error loading summaries:", error);
            loadingStatus.textContent = `Error loading summaries: ${error.message}`;
        }
    }

    function createSummaryCard(summary) {
        const card = cardTemplate.cloneNode(true); // Clone the template
        card.classList.remove('summary-card-placeholder');
        card.classList.add('summary-card'); // Add the actual class
        card.style.display = 'flex'; // Make it visible and use flex
        card.dataset.summaryId = summary.id; // Store ID for deletion

        const timestampEl = card.querySelector('.card-timestamp');
        const urlLinkEl = card.querySelector('.card-url a');
        const summaryContentEl = card.querySelector('.card-summary-content');
        const deleteButton = card.querySelector('.delete-button');

        timestampEl.textContent = new Date(summary.timestamp).toLocaleString(); // Format date/time
        urlLinkEl.href = summary.url;
        urlLinkEl.textContent = summary.url; // Display the URL
        // Optional: Display a cleaner title if you stored one

        // Render Markdown summary using marked.js
        if (typeof marked === 'object' && typeof marked.parse === 'function') {
            summaryContentEl.innerHTML = marked.parse(summary.summary || '', { sanitize: false, headerIds: false, mangle: false });
        } else {
            summaryContentEl.textContent = summary.summary || '[Error: marked.js not loaded]';
        }

        // Add delete functionality
        deleteButton.addEventListener('click', async () => {
            if (confirm('Are you sure you want to delete this summary?')) {
                await deleteSummary(summary.id);
            }
        });

        return card;
    }

    async function deleteSummary(summaryId) {
        try {
            const result = await chrome.storage.local.get(['savedSummaries']);
            let summaries = result.savedSummaries || [];

            // Filter out the summary to delete
            const updatedSummaries = summaries.filter(s => s.id !== summaryId);

            await chrome.storage.local.set({ savedSummaries: updatedSummaries });

            console.log("Summary deleted:", summaryId);
            // Remove card from UI directly or reload all
            const cardToRemove = summariesContainer.querySelector(`.summary-card[data-summary-id="${summaryId}"]`);
            if (cardToRemove) {
                cardToRemove.remove();
            }
            // Update status/check if empty
            if (updatedSummaries.length === 0) {
                 loadingStatus.textContent = 'No summaries saved yet.';
                 loadingStatus.style.display = 'block';
                 deleteAllButton.style.display = 'none';
            }

        } catch (error) {
            console.error("Error deleting summary:", error);
            alert(`Error deleting summary: ${error.message}`); // Simple alert
        }
    }

    deleteAllButton.addEventListener('click', async () => {
         if (confirm('ARE YOU SURE you want to delete ALL saved summaries? This cannot be undone.')) {
             try {
                await chrome.storage.local.remove('savedSummaries'); // Or set to []
                console.log("All summaries deleted.");
                await loadSummaries(); // Reload to show empty state
             } catch (error) {
                console.error("Error deleting all summaries:", error);
                alert(`Error deleting all summaries: ${error.message}`);
             }
         }
    });


    // Initial load
    loadSummaries();
});