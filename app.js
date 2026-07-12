// Supabase edge functions (keys stay server-side)
const EDGE_FUNCTION_URL = "https://ufcwkasuazmgqvneuwhy.supabase.co/functions/v1/manage-arcades";
const REVIEWS_EDGE_FUNCTION_URL = "https://ufcwkasuazmgqvneuwhy.supabase.co/functions/v1/manage-reviews";
const FEEDBACK_EDGE_FUNCTION_URL = "https://ufcwkasuazmgqvneuwhy.supabase.co/functions/v1/send-feedback";

// Map setup
// preferCanvas + tile-loading tweaks reduce jank on mobile, especially during zoom gestures
const map = L.map('map', { preferCanvas: true }).setView([3.1390, 101.6869], 11);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    updateWhenZooming: false, // wait until the zoom gesture finishes before loading new tiles
    keepBuffer: 2
}).addTo(map);

// Marker clustering: at low zoom (e.g. zoomed out), nearby arcades group into a
// single cluster bubble instead of rendering 60 individual pins at once — this
// is what was causing the bad lag when zooming out on mobile.
const markerGroup = L.markerClusterGroup({
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    maxClusterRadius: 50
});
map.addLayer(markerGroup);

// App state
let arcades = [];
let markersByName = {}; // lets the dropdown jump to a marker and open its popup
let userLocationMarker = null;
let userAccuracyCircle = null;

// Fetch all arcades via the Supabase edge function
async function fetchArcadesFromCloud() {
    try {
        const response = await fetch(EDGE_FUNCTION_URL, { method: 'GET' });
        if (!response.ok) throw new Error("Cloud function rejected fetch request.");

        arcades = await response.json();
        renderPins();
    } catch (err) {
        console.error("Fetch failure:", err);
        alert("Failed to load map data. Please refresh the page.");
    } finally {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) overlay.classList.add('hidden');
    }
}

// Render all arcade pins + popups
function renderPins() {
    markerGroup.clearLayers();
    markersByName = {};

    arcades.forEach(arcade => {
        const navUrl = `https://www.google.com/maps/search/?api=1&query=${arcade.lat},${arcade.long}`;
        const transitUrl = `https://www.google.com/maps/dir/?api=1&destination=${arcade.lat},${arcade.long}&travelmode=transit`;

        const marker = L.marker([arcade.lat, arcade.long])
            .addTo(markerGroup)
            .bindPopup(`
                <div style="font-family: Arial, sans-serif; line-height: 1.4;">
                    <strong style="font-size: 14px; color: #333;">${arcade.name}</strong><br>
                    <span style="color: #666;">Version: ${arcade.version}</span><br>
                    <span style="color: #666;">Cabs: ${arcade.cabs}</span><br>
                    <span style="color: #f5a623; font-size: 13px;">${renderStarsHtml(arcade.avg_rating)}</span>
                    <span style="color: #888; font-size: 12px;">${arcade.avg_rating ? `${arcade.avg_rating} (${arcade.review_count})` : 'No reviews yet'}</span>
                    <hr style="border: 0; border-top: 1px solid #eee; margin: 8px 0;">
                    <a href="${navUrl}" target="_blank"
                       style="display: block; background: #007bff; color: white; padding: 6px 12px; margin-bottom: 6px; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 12px; text-align: center;">
                       🚗 Navigate on Google Maps
                    </a>
                    <a href="${transitUrl}" target="_blank"
                       style="display: block; background: #28a745; color: white; padding: 6px 12px; margin-bottom: 6px; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 12px; text-align: center;">
                       🚌 Public Transport Directions
                    </a>
                    <button onclick="openReviewsModal(${arcade.id})"
                       style="display: block; width: 100%; background: #6f42c1; color: white; padding: 6px 12px; border: none; border-radius: 4px; font-weight: bold; font-size: 12px; text-align: center; cursor: pointer;">
                       💬 Reviews
                    </button>
                </div>
            `);

        markersByName[arcade.name] = marker;
    });
}

// Search UI: filters arcades by name as you type, click a result to jump to it
function renderSearchResults(query) {
    const resultsEl = document.getElementById('arcade-search-results');
    if (!resultsEl) return;

    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
        resultsEl.classList.add('hidden');
        resultsEl.innerHTML = "";
        return;
    }

    const matches = arcades
        .filter(a => a.name.toLowerCase().includes(trimmed))
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, 20); // cap so a broad query doesn't render a huge list

    resultsEl.innerHTML = "";

    if (matches.length === 0) {
        resultsEl.innerHTML = `<li class="no-results">No arcades found</li>`;
        resultsEl.classList.remove('hidden');
        return;
    }

    matches.forEach(arcade => {
        const li = document.createElement('li');
        li.textContent = arcade.name;
        li.onclick = () => {
            jumpToArcade(arcade.name);
            document.getElementById('arcade-search-input').value = arcade.name;
            resultsEl.classList.add('hidden');
        };
        resultsEl.appendChild(li);
    });

    resultsEl.classList.remove('hidden');
}

function jumpToArcade(name) {
    if (!name) return;
    const arcade = arcades.find(a => a.name === name);
    const marker = markersByName[name];
    if (!arcade || !marker) return;

    // zoomToShowLayer only zooms enough to reveal the marker out of its
    // cluster — if it's already visible at the current zoom, it does nothing
    // at all, which is why selecting a search result wasn't re-centering the
    // map. Explicitly fly to the coordinates afterward to guarantee centering.
    markerGroup.zoomToShowLayer(marker, () => {
        map.flyTo([arcade.lat, arcade.long], Math.max(map.getZoom(), 15), { animate: true, duration: 0.8 });
        marker.openPopup();
    });
}

function renderStarsHtml(avgRating) {
    if (!avgRating) return "☆☆☆☆☆";
    const rounded = Math.round(avgRating); // nearest whole star for the compact popup view
    return "★".repeat(rounded) + "☆".repeat(5 - rounded);
}

// ==========================================
// Reviews modal
// ==========================================
let currentReviewArcadeId = null;
let selectedRating = 0;

async function openReviewsModal(arcadeId) {
    currentReviewArcadeId = arcadeId;
    selectedRating = 0;

    const arcade = arcades.find(a => a.id === arcadeId);
    document.getElementById('reviews-modal-title').innerText = arcade ? arcade.name : "Reviews";
    document.getElementById('review-comment-input').value = "";
    document.getElementById('review-name-input').value = "";
    document.getElementById('review-submit-status').innerText = "";
    renderStarPicker(0);

    document.getElementById('reviews-modal-backdrop').classList.remove('hidden');
    document.getElementById('reviews-list').innerHTML = `<li class="reviews-loading">Loading reviews...</li>`;

    try {
        const response = await fetch(`${REVIEWS_EDGE_FUNCTION_URL}?arcade_id=${arcadeId}`);
        if (!response.ok) throw new Error(`Server responded with ${response.status}`);
        const reviews = await response.json();
        renderReviewsList(reviews);
    } catch (err) {
        console.error("Failed to load reviews:", err);
        document.getElementById('reviews-list').innerHTML = `<li class="reviews-loading">Couldn't load reviews. Try again later.</li>`;
    }
}

function closeReviewsModal() {
    document.getElementById('reviews-modal-backdrop').classList.add('hidden');
    currentReviewArcadeId = null;
}

function renderReviewsList(reviews) {
    const listEl = document.getElementById('reviews-list');
    listEl.innerHTML = "";

    if (!reviews || reviews.length === 0) {
        listEl.innerHTML = `<li class="reviews-loading">No reviews yet. Be the first!</li>`;
        return;
    }

    reviews.forEach(review => {
        const li = document.createElement('li');
        li.className = "review-item";

        const date = new Date(review.created_at);
        const dateStr = date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

        li.innerHTML = `
            <div class="review-header">
                <span class="review-author">${escapeHtml(review.author_name || 'Anonymous')}</span>
                <span class="review-date">${dateStr}</span>
            </div>
            <div class="review-stars">${"★".repeat(review.rating)}${"☆".repeat(5 - review.rating)}</div>
            ${review.comment ? `<div class="review-comment">${escapeHtml(review.comment)}</div>` : ''}
        `;
        listEl.appendChild(li);
    });
}

function renderStarPicker(hoverRating) {
    const pickerEl = document.getElementById('star-picker');

    // Build the 5 star elements once. Rebuilding them on every hover (the old
    // approach) broke mobile taps: touch fires mouseenter -> click, and
    // rebuilding mid-gesture destroyed the star being touched before the
    // click could register, so selectedRating never actually updated.
    if (pickerEl.children.length !== 5) {
        pickerEl.innerHTML = "";
        for (let i = 1; i <= 5; i++) {
            const star = document.createElement('span');
            star.className = "star-picker-star";
            star.dataset.value = i;
            star.addEventListener('click', () => {
                selectedRating = i;
                renderStarPicker(i);
            });
            star.addEventListener('mouseenter', () => renderStarPicker(i));
            star.addEventListener('mouseleave', () => renderStarPicker(selectedRating));
            pickerEl.appendChild(star);
        }
    }

    // Just update each existing star's glyph, no DOM rebuild
    Array.from(pickerEl.children).forEach((star, idx) => {
        star.innerText = (idx + 1) <= (hoverRating || selectedRating) ? "★" : "☆";
    });
}

async function submitReview() {
    const statusEl = document.getElementById('review-submit-status');
    const submitBtn = document.getElementById('review-submit-btn');
    const authorName = document.getElementById('review-name-input').value.trim();
    const comment = document.getElementById('review-comment-input').value.trim();

    if (selectedRating < 1) {
        statusEl.innerText = "Please select a star rating.";
        statusEl.className = "status-text status-error";
        return;
    }
    if (currentReviewArcadeId === null) return;

    submitBtn.disabled = true;
    submitBtn.innerText = "Submitting...";

    try {
        const response = await fetch(REVIEWS_EDGE_FUNCTION_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'insert',
                payload: {
                    arcade_id: currentReviewArcadeId,
                    author_name: authorName || 'Anonymous',
                    rating: selectedRating,
                    comment: comment
                }
            })
        });

        if (!response.ok) throw new Error(`Server responded with ${response.status}`);
        const result = await response.json();

        statusEl.innerText = "Review posted, thanks!";
        statusEl.className = "status-text status-success";

        document.getElementById('review-comment-input').value = "";
        document.getElementById('review-name-input').value = "";
        selectedRating = 0;
        renderStarPicker(0);

        // Prepend the new review locally instead of re-fetching the whole list
        const listEl = document.getElementById('reviews-list');
        const loadingPlaceholder = listEl.querySelector('.reviews-loading');
        if (loadingPlaceholder) loadingPlaceholder.remove();
        const li = document.createElement('li');
        li.className = "review-item";
        const dateStr = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
        li.innerHTML = `
            <div class="review-header">
                <span class="review-author">${escapeHtml(result.data.author_name)}</span>
                <span class="review-date">${dateStr}</span>
            </div>
            <div class="review-stars">${"★".repeat(result.data.rating)}${"☆".repeat(5 - result.data.rating)}</div>
            ${result.data.comment ? `<div class="review-comment">${escapeHtml(result.data.comment)}</div>` : ''}
        `;
        listEl.prepend(li);

        // Refresh arcade data in the background so the popup's star average updates too
        fetchArcadesFromCloud();
    } catch (err) {
        console.error("Failed to submit review:", err);
        statusEl.innerText = "Failed to submit review: " + err.message;
        statusEl.className = "status-text status-error";
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = "Submit Review";
    }
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.innerText = str;
    return div.innerHTML;
}

// ==========================================
// Feedback modal
// ==========================================
function openFeedbackModal() {
    document.getElementById('feedback-name-input').value = "";
    document.getElementById('feedback-email-input').value = "";
    document.getElementById('feedback-topic-select').value = "Website";
    document.getElementById('feedback-message-input').value = "";
    document.getElementById('feedback-submit-status').innerText = "";
    document.getElementById('feedback-modal-backdrop').classList.remove('hidden');
}

function closeFeedbackModal() {
    document.getElementById('feedback-modal-backdrop').classList.add('hidden');
}

async function submitFeedback() {
    const statusEl = document.getElementById('feedback-submit-status');
    const submitBtn = document.getElementById('feedback-submit-btn');
    const name = document.getElementById('feedback-name-input').value.trim();
    const email = document.getElementById('feedback-email-input').value.trim();
    const topic = document.getElementById('feedback-topic-select').value;
    const message = document.getElementById('feedback-message-input').value.trim();

    if (!message) {
        statusEl.innerText = "Please enter a message before submitting.";
        statusEl.className = "status-text status-error";
        return;
    }

    submitBtn.disabled = true;
    submitBtn.innerText = "Sending...";
    statusEl.innerText = "";

    try {
        const response = await fetch(FEEDBACK_EDGE_FUNCTION_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, topic, message })
        });

        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || `Server responded with ${response.status}`);

        statusEl.innerText = "Thanks! Your feedback has been sent.";
        statusEl.className = "status-text status-success";

        setTimeout(closeFeedbackModal, 1500);
    } catch (err) {
        console.error("Failed to submit feedback:", err);
        statusEl.innerText = "Failed to send feedback: " + err.message;
        statusEl.className = "status-text status-error";
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = "Submit Feedback";
    }
}

// ==========================================
// Geolocation
// ==========================================
// A single getCurrentPosition() call is often inaccurate because the browser
// returns the fastest fix it has (which can be a stale, low-accuracy Wi-Fi/
// cell-tower estimate) rather than waiting for the GPS chip to lock on.
// watchPosition() keeps listening for a few seconds and we keep the most
// accurate reading we see, which noticeably improves results on phones.
// On desktops there's no GPS hardware at all, so accuracy is capped by
// Wi-Fi/IP-based positioning (often 500m-several km) no matter what the code does.
let locateWatchId = null;

function autoLocateUser() {
    const DEFAULT_COORDINATES = [3.1390, 101.6869];
    const btn = document.getElementById('locate-me-btn');

    if (!navigator.geolocation) {
        console.warn("Geolocation not supported on this device.");
        map.setView(DEFAULT_COORDINATES, 11);
        return;
    }

    if (locateWatchId !== null) {
        navigator.geolocation.clearWatch(locateWatchId);
        locateWatchId = null;
    }

    if (btn) {
        btn.disabled = true;
        btn.querySelector('.btn-label').innerText = "Locating...";
    }

    let bestPosition = null;
    const SEARCH_DURATION_MS = 8000;
    const GOOD_ENOUGH_ACCURACY_METERS = 30;

    const finishLocating = () => {
        if (locateWatchId !== null) {
            navigator.geolocation.clearWatch(locateWatchId);
            locateWatchId = null;
        }
        if (btn) {
            btn.disabled = false;
            btn.querySelector('.btn-label').innerText = "Find My Location";
        }

        if (!bestPosition) {
            map.setView(DEFAULT_COORDINATES, 11);
            alert("Couldn't get your location. Please enable location access for this site.");
            return;
        }

        const { latitude, longitude, accuracy } = bestPosition.coords;
        map.flyTo([latitude, longitude], 15, { animate: true, duration: 1.5 });

        if (userLocationMarker) map.removeLayer(userLocationMarker);
        if (userAccuracyCircle) map.removeLayer(userAccuracyCircle);

        userAccuracyCircle = L.circle([latitude, longitude], {
            radius: accuracy,
            color: "#007bff",
            fillColor: "#007bff",
            fillOpacity: 0.1,
            weight: 1
        }).addTo(map);

        userLocationMarker = L.circleMarker([latitude, longitude], {
            radius: 8,
            fillColor: "#007bff",
            color: "#fff",
            weight: 2,
            opacity: 1,
            fillOpacity: 0.8
        })
        .addTo(map)
        .bindPopup(`<b>You are here</b><br>Accuracy: ~${Math.round(accuracy)}m`)
        .openPopup();
    };

    locateWatchId = navigator.geolocation.watchPosition(
        (position) => {
            if (!bestPosition || position.coords.accuracy < bestPosition.coords.accuracy) {
                bestPosition = position;
            }
            if (position.coords.accuracy <= GOOD_ENOUGH_ACCURACY_METERS) {
                finishLocating();
            }
        },
        (error) => {
            console.warn("Geolocation error:", error.message);
            finishLocating();
        },
        {
            enableHighAccuracy: true,
            timeout: SEARCH_DURATION_MS,
            maximumAge: 0
        }
    );

    setTimeout(finishLocating, SEARCH_DURATION_MS);
}

// ==========================================
// Bootstrap
// ==========================================
async function initializeApp() {
    // Safety net: force-hide the loading overlay after 10s no matter what,
    // so a hung request can never permanently block the UI.
    setTimeout(() => {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) overlay.classList.add('hidden');
    }, 10000);

    await fetchArcadesFromCloud();

    const searchInput = document.getElementById('arcade-search-input');
    const resultsEl = document.getElementById('arcade-search-results');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => renderSearchResults(e.target.value));
        searchInput.addEventListener('focus', (e) => renderSearchResults(e.target.value));
    }

    // Click outside the search box closes the results list
    document.addEventListener('click', (e) => {
        const container = document.getElementById('arcade-search-container');
        if (container && !container.contains(e.target)) {
            resultsEl.classList.add('hidden');
        }
    });
}

initializeApp();