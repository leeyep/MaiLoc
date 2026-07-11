// Supabase edge function that serves arcade data (keys stay server-side)
const EDGE_FUNCTION_URL = "https://ufcwkasuazmgqvneuwhy.supabase.co/functions/v1/manage-arcades";

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
                    <span style="color: #666;">Cabs: ${arcade.cabs}</span>
                    <hr style="border: 0; border-top: 1px solid #eee; margin: 8px 0;">
                    <a href="${navUrl}" target="_blank"
                       style="display: block; background: #007bff; color: white; padding: 6px 12px; margin-bottom: 6px; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 12px; text-align: center;">
                       🚗 Navigate on Google Maps
                    </a>
                    <a href="${transitUrl}" target="_blank"
                       style="display: block; background: #28a745; color: white; padding: 6px 12px; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 12px; text-align: center;">
                       🚌 Public Transport Directions
                    </a>
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

    // With clustering, the marker may currently be hidden inside a cluster bubble.
    // zoomToShowLayer zooms in just enough to reveal it, then runs the callback.
    markerGroup.zoomToShowLayer(marker, () => {
        marker.openPopup();
    });
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
        btn.innerText = "📍 Locating...";
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
            btn.innerText = "📍 Find My Location";
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