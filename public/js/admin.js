// ── Content Saving ──────────────────────────
async function saveContent(key) {
    const input = document.querySelector(`[data-key="${key}"]`);
    const value = input.value;
    const statusEl = input.parentElement.querySelector('.save-status');

    try {
        const response = await fetch(`/api/content/${key}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value })
        });

        if (response.ok) {
            statusEl.textContent = '✓ Saved!';
            statusEl.style.color = '#28a745';
            setTimeout(() => statusEl.textContent = '', 2000);
        } else {
            statusEl.textContent = '✗ Error';
            statusEl.style.color = '#dc3545';
        }
    } catch (err) {
        statusEl.textContent = '✗ Error';
        statusEl.style.color = '#dc3545';
        console.error('Save error:', err);
    }
}

// ── Hours Saving ───────────────────────────
async function saveHours(day) {
    const row = document.querySelector(`tr[data-day="${day}"]`);
    const data = {
        bar_open: row.querySelector('.bar-open').value,
        bar_close: row.querySelector('.bar-close').value,
        kitchen_open: row.querySelector('.kitchen-open').value,
        kitchen_close: row.querySelector('.kitchen-close').value
    };

    try {
        const response = await fetch(`/api/hours/${day}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (response.ok) {
            showFlash('Hours saved!', 'success');
        } else {
            showFlash('Error saving hours', 'error');
        }
    } catch (err) {
        showFlash('Error: ' + err.message, 'error');
        console.error('Save error:', err);
    }
}

// ── Gift Card Redemption ───────────────────
async function redeemGiftCard(code, amount = null) {
    try {
        const response = await fetch(`/api/gift-cards/${code}/redeem`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount })
        });

        if (response.ok) {
            const data = await response.json();
            showFlash(amount ? `Redeemed £${amount}!` : 'Redeemed!', 'success');
            setTimeout(() => location.reload(), 1000);
        } else {
            const error = await response.json();
            showFlash('Error: ' + (error.message || 'Could not redeem'), 'error');
        }
    } catch (err) {
        showFlash('Error: ' + err.message, 'error');
        console.error('Redemption error:', err);
    }
}

// ── Redirect Management ────────────────────
async function addRedirect(fromPath, toUrl) {
    try {
        const response = await fetch('/api/redirects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ from_path: fromPath, to_url: toUrl })
        });

        if (response.ok) {
            showFlash('Redirect added!', 'success');
            setTimeout(() => location.reload(), 500);
        } else {
            showFlash('Error adding redirect', 'error');
        }
    } catch (err) {
        showFlash('Error: ' + err.message, 'error');
        console.error('Add redirect error:', err);
    }
}

async function deleteRedirect(id) {
    if (!confirm('Delete this redirect?')) return;

    try {
        const response = await fetch(`/api/redirects/${id}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showFlash('Redirect deleted!', 'success');
            setTimeout(() => location.reload(), 500);
        } else {
            showFlash('Error deleting redirect', 'error');
        }
    } catch (err) {
        showFlash('Error: ' + err.message, 'error');
        console.error('Delete error:', err);
    }
}

// ── CSV Import ─────────────────────────────
async function importCSV(file) {
    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('/api/gift-cards/import', {
            method: 'POST',
            body: formData
        });

        if (response.ok) {
            const data = await response.json();
            showFlash(`Imported ${data.imported} cards!`, 'success');
            setTimeout(() => location.reload(), 1000);
        } else {
            const error = await response.json();
            showFlash('Import failed: ' + (error.message || 'Unknown error'), 'error');
        }
    } catch (err) {
        showFlash('Error: ' + err.message, 'error');
        console.error('Import error:', err);
    }
}

// ── Flash Messages ─────────────────────────
function showFlash(message, type = 'info') {
    const flashEl = document.createElement('div');
    flashEl.className = `flash-message alert-${type}`;
    flashEl.textContent = message;
    document.body.appendChild(flashEl);

    setTimeout(() => {
        flashEl.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => flashEl.remove(), 300);
    }, 3000);
}

// Add slide-out animation
const style = document.createElement('style');
style.textContent = `
    @keyframes slideOut {
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// ── Utility: Format Time ───────────────────
function formatTime(timeStr) {
    if (!timeStr) return '-';
    const [hours, mins] = timeStr.split(':');
    const h = parseInt(hours);
    const m = parseInt(mins);
    const period = h >= 12 ? 'pm' : 'am';
    const displayH = h > 12 ? h - 12 : (h === 0 ? 12 : h);
    return `${displayH}:${String(m).padStart(2, '0')}${period}`;
}

// ── Search Functionality ───────────────────
function setupSearch(dataSelector, searchSelector) {
    const searchInput = document.querySelector(searchSelector);
    if (!searchInput) return;

    searchInput.addEventListener('keyup', () => {
        const query = searchInput.value.toLowerCase();
        const items = document.querySelectorAll(dataSelector);

        items.forEach(item => {
            const text = item.textContent.toLowerCase();
            item.style.display = text.includes(query) ? '' : 'none';
        });
    });
}

// ── Active Link Highlighting ───────────────
function setActiveNavLink() {
    const path = window.location.pathname;
    const links = document.querySelectorAll('.sidebar-link');

    links.forEach(link => {
        if (link.getAttribute('href') === path) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', setActiveNavLink);
