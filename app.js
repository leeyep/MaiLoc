// ==========================================
// 1. SECURE SERVERLESS API EDGE GATEWAY
// ==========================================
// Your database keys are officially hidden on the cloud. The frontend only sees this public route.
const EDGE_FUNCTION_URL = "https://ufcwkasuazmgqvneuwhy.supabase.co/functions/v1/manage-arcades";

// ==========================================
// 2. INITIALIZE THE LEAFLET MAP ENVIRONMENT
// ==========================================
const map = L.map('map').setView([3.1390, 101.6869], 11);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { 
    attribution: '© OpenStreetMap contributors' 
}).addTo(map);

const markerGroup = L.layerGroup().addTo(map);

// Global live application state tracking arrays
let arcades = [];
let userLocationMarker = null;

// ==========================================
// 3. THE SECURE BROKERED DATA PIPELINE OPERATIONS
// ==========================================

// OPERATION A: Fetch all arcades via the secure serverless edge gateway
async function fetchArcadesFromCloud() {
    console.log("Fetching fresh data via Secure Edge Function...");
    
    try {
        const response = await fetch(EDGE_FUNCTION_URL, { method: 'GET' });
        if (!response.ok) throw new Error("Cloud function rejected fetch request mapping.");
        
        arcades = await response.json();
        renderPins();
    } catch (err) {
        console.error("Fetch failure:", err);
        alert("Failed to load map data securely from the cloud!");
    }
}



// ==========================================
// 4. UI INTERFACE RENDERING LOOP CYCLE
// ==========================================
function renderPins() {
    markerGroup.clearLayers();
    
    const deleteListHTML = document.getElementById('arcade-delete-list');
    if (deleteListHTML) deleteListHTML.innerHTML = "";

    arcades.forEach(arcade => {
        const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${arcade.lat},${arcade.long}`;

        L.marker([arcade.lat, arcade.long])
            .addTo(markerGroup)
            .bindPopup(`
                <div style="font-family: Arial, sans-serif; line-height: 1.4;">
                    <strong style="font-size: 14px; color: #333;">${arcade.name}</strong><br>
                    <span style="color: #666;">Version: ${arcade.version}</span><br>
                    <span style="color: #666;">Cabs: ${arcade.cabs}</span>
                    <hr style="border: 0; border-top: 1px solid #eee; margin: 8px 0;">
                    <a href="${googleMapsUrl}" 
                       target="_blank" 
                       style="display: inline-block; background: #007bff; color: white; padding: 6px 12px; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 12px; text-align: center; width: 85%;">
                       🚗 Navigate on Google Maps
                    </a>
                </div>
            `);
    });
}

// ==========================================
// 4.5 MANUAL GEOLOCATION ENGINE
// ==========================================
function autoLocateUser() {
    const DEFAULT_COORDINATES = [3.1390, 101.6869];

    if (!navigator.geolocation) {
        console.warn("GPS hardware missing on this device.");
        map.setView(DEFAULT_COORDINATES, 11);
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const userLat = position.coords.latitude;
            const userLng = position.coords.longitude;
            
            map.flyTo([userLat, userLng], 14, { animate: true, duration: 1.5 });

            if (userLocationMarker) {
                map.removeLayer(userLocationMarker);
            }

            userLocationMarker = L.circleMarker([userLat, userLng], {
                radius: 8,
                fillColor: "#007bff",
                color: "#fff",
                weight: 2,
                opacity: 1,
                fillOpacity: 0.8
            })
            .addTo(map)
            .bindPopup("<b>You are here!</b>");
        },
        (error) => {
            console.warn("GPS access blocked or failed:", error.message);
            map.setView(DEFAULT_COORDINATES, 11);
            alert("Please enable your location or allow this website to access your location");
        },
        {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0
        }
    );
}

// ==========================================
// 4.7 ADMIN PANEL TOGGLE INTERFACE UTILITY
// ==========================================
let isAdminMode = false;
function toggleAdminMode() {
    isAdminMode = !isAdminMode;
    const dashboard = document.getElementById('admin-dashboard');
    const toggleBtn = document.getElementById('admin-toggle-btn');

    if (!dashboard || !toggleBtn) return;

    if (isAdminMode) {
        dashboard.classList.remove('hidden');
        toggleBtn.innerText = "Switch to User View";
        toggleBtn.style.background = "#6c757d";
    } else {
        dashboard.classList.add('hidden');
        toggleBtn.innerText = "Switch to Admin View";
        toggleBtn.style.background = "#007bff";
    }
}

// ==========================================
// 5. MASTER BOOTSTRAP INITIALIZATION PIPELINE
// ==========================================
async function initializeApp() {
    await fetchArcadesFromCloud();
}

// Fire the application launcher sequence
initializeApp();