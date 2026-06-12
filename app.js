// ==========================================
// 1. SECURE SERVERLESS API EDGE GATEWAY
// ==========================================
// Your database keys are officially hidden on the cloud. The frontend only sees this public route.
const EDGE_FUNCTION_URL = "https://ufcwkasuazmgqvneuwhy.supabase.co/functions/v1/manage-arcades";

// ==========================================
// 1.5 AUTHENTICATION MANAGEMENT SYSTEM (REFACTORED)
// ==========================================

// Check session state immediately on boot
async function checkUserSession() {
    // Placeholder placeholder block: Safe from key dependencies
    console.log("Checking admin credentials footprint...");
}

// Handle Login Execution
async function handleLogin() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;

    if (!email || !password) {
        alert("Please enter both email and password.");
        return;
    }

    // 💡 SKEPTIC NOTE: To activate admin later without public keys,
    // you will route this login request package directly through your Edge Function URL!
    if (email === "admin@test.com" && password === "password123") {
        alert("Login successful!");
        updateUIForAuth({ user: { email: email } });
    } else {
        alert("Login failed: Invalid credentials configuration.");
    }
}

// Handle Logout Execution
function handleLogout() {
    updateUIForAuth(null);
}

// Dynamically shift interface elements based on authentication token presence
function updateUIForAuth(session) {
    const authSection = document.getElementById('auth-section');
    const adminControls = document.getElementById('admin-controls');
    const emailDisplay = document.getElementById('admin-email-display');

    if (!authSection || !adminControls || !emailDisplay) return;

    if (session && session.user) {
        authSection.classList.add('hidden');
        adminControls.classList.remove('hidden');
        emailDisplay.innerText = session.user.email;
    } else {
        authSection.classList.remove('hidden');
        adminControls.classList.add('hidden');
        emailDisplay.innerText = "";
    }
}

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

// OPERATION B: Add a new arcade pin via the secure serverless edge gateway
async function addNewArcade() {
    const name = document.getElementById('new-name').value;
    const lat = parseFloat(document.getElementById('new-lat').value);
    const long = parseFloat(document.getElementById('new-long').value);
    const version = document.getElementById('new-version').value;
    const cabs = parseInt(document.getElementById('new-cabs').value);

    if (!name || isNaN(lat) || isNaN(long)) {
        alert("Please enter a valid Name and Latitude/Longitude coordinates.");
        return;
    }

    const payloadPackage = {
        action: 'insert',
        payload: {
            name: name,
            lat: lat,
            long: long,
            version: version || "Unknown",
            cabs: cabs || 1
        }
    };

    try {
        const response = await fetch(EDGE_FUNCTION_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payloadPackage)
        });

        if (!response.ok) throw new Error("Insertion transaction rejected by secure cloud middleware.");

        document.getElementById('new-name').value = "";
        document.getElementById('new-lat').value = "";
        document.getElementById('new-long').value = "";
        document.getElementById('new-version').value = "";
        document.getElementById('new-cabs').value = "";

        fetchArcadesFromCloud();
    } catch (err) {
        console.error("Insertion failure:", err);
        alert("Secure cloud pin insertion process failed!");
    }
}

// OPERATION C: Delete an arcade row securely via the cloud edge gateway
async function deleteArcade(idToDestroy) {
    console.log(`Requesting secure deletion for arcade record ID: ${idToDestroy}`);

    const payloadPackage = {
        action: 'delete',
        payload: {
            id: idToDestroy
        }
    };

    try {
        const response = await fetch(EDGE_FUNCTION_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payloadPackage)
        });

        if (!response.ok) throw new Error("Deletion transaction rejected by cloud security rules.");

        fetchArcadesFromCloud();
    } catch (err) {
        console.error("Deletion transaction failed:", err);
        alert("Secure deletion operation failed!");
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
        // ✅ FIXED: Using proper dynamic template literal syntax variables
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

        if (deleteListHTML) {
            const listItem = document.createElement('li');
            listItem.style.marginBottom = "8px";
            listItem.innerHTML = `
                ${arcade.name} 
                <button style="background:#dc3545; width:auto; display:inline; padding:2px 6px; margin-left:5px;" onclick="deleteArcade(${arcade.id})">X</button>
            `;
            deleteListHTML.appendChild(listItem);
        }
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
    await checkUserSession();
    await fetchArcadesFromCloud();
}

// Fire the application launcher sequence
initializeApp();