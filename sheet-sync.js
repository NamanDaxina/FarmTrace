// 1. Initialize Firebase App and Firestore Database
const firebaseConfig = {
  apiKey: "AIzaSyBeN1EfNT-IuchTqwm3PLgki5qXaJsCuB0",
  authDomain: "farmtrace-9cd9f.firebaseapp.com",
  projectId: "farmtrace-9cd9f",
  storageBucket: "farmtrace-9cd9f.firebasestorage.app",
  messagingSenderId: "1050512053557",
  appId: "1:1050512053557:web:f6065a44cd25062482687c",
  measurementId: "G-C38DXD637T"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// 2. Prototype Users from notebook
const PROTOTYPE_USERS = {
  "2011namandaxina@gmail.com": { pass: "201129naman", role: "Origin Farmer / Farm Lead" },
  "kushal@FT.com": { pass: "2129kushal", role: "Cold Chain Transit Supervisor" },
  "Vot@FT.com": { pass: "Vot@FTvot", role: "Quality Assurance Inspector" },
  "mop@FT.com": { pass: "mop@tipmop", role: "Delivery Partner" }
};

let activeUser = null;
let activeBatchId = null;
let unsubscribeBatchListener = null;

// 3. Extract batch ID from URL (#trace?batch=TOM-001 or ?batch=TOM-001)
function getBatchFromUrl() {
  const fullUrl = window.location.href;
  const queryIndex = fullUrl.indexOf("?");
  if (queryIndex === -1) return null;

  const searchParams = new URLSearchParams(fullUrl.substring(queryIndex));
  const batch = searchParams.get("batch");
  return batch ? batch.trim().toUpperCase() : null;
}

// 4. Realtime Firestore Listener for Batch Updates
function listenToBatch(batchId) {
  const batchContainer = document.getElementById("batch-container");
  const batchHeader = document.getElementById("current-batch-header");
  const batchCropName = document.getElementById("batch-crop-name");
  const timelineEl = document.getElementById("batch-timeline");
  const recordBtn = document.getElementById("btn-record-stop");

  if (!batchId) {
    if (batchContainer) batchContainer.style.display = "none";
    return;
  }

  activeBatchId = batchId;
  batchContainer.style.display = "block";
  batchHeader.innerText = `Batch: ${batchId}`;
  timelineEl.innerHTML = `<p style="color: #666;">Connecting to cloud database...</p>`;

  // Stop listening to previous batch if any
  if (unsubscribeBatchListener) {
    unsubscribeBatchListener();
  }

  const docRef = db.collection("batches").doc(batchId);

  unsubscribeBatchListener = docRef.onSnapshot(async (doc) => {
    if (!doc.exists) {
      // Auto-create document if it doesn't exist yet
      const initialData = {
        crop: batchId.startsWith("TOM") ? "Fresh Vine Tomatoes" : (batchId.startsWith("POT") ? "Yukon Potatoes" : "Organic Produce"),
        isComplete: false,
        stops: [
          {
            place: "Farm Origin Hub, Anand",
            time: new Date().toLocaleString(),
            recorder: "System / Origin Seed",
            location: "https://www.google.com/maps?q=22.5645,72.9289",
            notes: "Batch registered and initialized at harvest packhouse."
          }
        ]
      };
      await docRef.set(initialData);
      return;
    }

    const data = doc.data();
    batchCropName.innerText = data.crop || "Farm Produce";

    if (!data.stops || data.stops.length === 0) {
      timelineEl.innerHTML = `<p style="color: #666; font-style: italic;">No checkpoints logged yet for ${batchId}.</p>`;
    } else {
      timelineEl.innerHTML = data.stops.map((stop) => `
        <div class="timeline-item">
          <div class="timeline-title">${stop.place}</div>
          <div class="timeline-meta">
            <strong>Time:</strong> ${stop.time} &bull; <strong>Recorded by:</strong> ${stop.recorder}
          </div>
          <div class="timeline-notes">${stop.notes}</div>
          <a class="timeline-link" href="${stop.location}" target="_blank" rel="noopener">
            📍 View Verified GPS Coordinates
          </a>
        </div>
      `).join("");
    }

    // Toggle "Record a Stop" button
    if (!data.isComplete) {
      recordBtn.style.display = "inline-block";
    } else {
      recordBtn.style.display = "none";
    }
  }, (err) => {
    console.error("Firestore error:", err);
    timelineEl.innerHTML = `<p style="color: red;">Error syncing batch: Make sure Firestore Rules are open for development.</p>`;
  });
}

// 5. Manual Search Bar Handler
function handleManualSearch() {
  const input = document.getElementById("manual-batch-input");
  const code = input.value.trim().toUpperCase();
  if (!code) return;
  window.location.hash = `trace?batch=${encodeURIComponent(code)}`;
  listenToBatch(code);
}

// 6. Authentication Handling
function openLoginModal() {
  if (activeUser) {
    openRecordModal();
  } else {
    document.getElementById("ft-login-modal").style.display = "flex";
  }
}

function closeFtModal(modalId) {
  document.getElementById(modalId).style.display = "none";
}

function authenticateUser() {
  const emailInput = document.getElementById("ft-email").value.trim();
  const passInput = document.getElementById("ft-password").value.trim();
  const errEl = document.getElementById("ft-auth-err");

  if (PROTOTYPE_USERS[emailInput] && PROTOTYPE_USERS[emailInput].pass === passInput) {
    activeUser = {
      email: emailInput,
      role: PROTOTYPE_USERS[emailInput].role
    };
    errEl.style.display = "none";
    closeFtModal("ft-login-modal");
    openRecordModal();
  } else {
    errEl.style.display = "block";
  }
}

// 7. Auto-fill Modal Fields (Batch, User Role, Time, GPS)
function openRecordModal() {
  document.getElementById("ft-record-modal").style.display = "flex";
  document.getElementById("rec-batch").value = activeBatchId;
  document.getElementById("rec-role").value = `${activeUser.email} (${activeUser.role})`;

  // Current Local Time
  const now = new Date();
  document.getElementById("rec-time").value = now.toLocaleString();

  // Fetch Live GPS Coordinates
  const locField = document.getElementById("rec-location");
  locField.value = "Acquiring live GPS coordinates...";

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(6);
        const lng = pos.coords.longitude.toFixed(6);
        locField.value = `https://www.google.com/maps?q=${lat},${lng}`;
      },
      () => {
        locField.value = "Location permission denied / unavailable";
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  } else {
    locField.value = "Geolocation not supported by device";
  }
}

// 8. Submit Checkpoint Record directly to Cloud Firestore
async function submitStopRecord(event) {
  event.preventDefault();

  const submitBtn = document.getElementById("rec-submit-btn");
  submitBtn.disabled = true;
  submitBtn.innerText = "Syncing with Cloud...";

  const newStop = {
    place: document.getElementById("rec-place").value.trim(),
    notes: document.getElementById("rec-notes").value.trim(),
    time: document.getElementById("rec-time").value,
    recorder: document.getElementById("rec-role").value,
    location: document.getElementById("rec-location").value
  };

  try {
    const docRef = db.collection("batches").doc(activeBatchId);
    await docRef.update({
      stops: firebase.firestore.FieldValue.arrayUnion(newStop)
    });

    closeFtModal("ft-record-modal");
    document.getElementById("ft-record-form").reset();
  } catch (err) {
    console.error("Failed to save stop to Firestore:", err);
    alert("Could not update stop. Check browser console or Firestore security rules.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerText = "Save Checkpoint to Cloud";
  }
}

// Trigger initial scan check on load and URL change
function handleRoute() {
  const batchId = getBatchFromUrl();
  listenToBatch(batchId);
}

window.addEventListener("DOMContentLoaded", handleRoute);
window.addEventListener("hashchange", handleRoute);
