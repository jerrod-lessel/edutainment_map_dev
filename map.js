// Initialize the map
const map = L.map('map', {
  zoomControl: true,
  attributionControl: false
});

// Guadalupe-focused view (rough center)
map.setView([34.9715, -120.5713], 13);

// Clean basemap (calm, modern)
L.tileLayer(
  'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  {
    maxZoom: 18
  }
).addTo(map);

// Guadalupe world bounds (approximate, we refine later)
const guadalupeBounds = L.latLngBounds(
  [34.920, -120.640], // Southwest (ocean)
  [35.010, -120.500]  // Northeast (river / county line)
);

// Keep map inside Guadalupe
map.setMaxBounds(guadalupeBounds);

map.on('drag', function () {
  map.panInsideBounds(guadalupeBounds, { animate: false });
});

L.rectangle(guadalupeBounds, {
  color: '#666',
  weight: 1,
  dashArray: '4,4',
  fillOpacity: 0
}).addTo(map);

// --- Knowledge Nodes (GeoJSON) ---

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function storageKey(nodeId) {
  return `pc_progress_${nodeId}`;
}

function getProgress(nodeId) {
  const raw = localStorage.getItem(storageKey(nodeId));
  const n = raw ? parseInt(raw, 10) : 0;
  return Number.isFinite(n) ? n : 0;
}

function setProgress(nodeId, idx) {
  localStorage.setItem(storageKey(nodeId), String(idx));
}

function renderNodeCard(feature) {
  const p = feature.properties;
  const nodeId = p.id;
  const questions = p.questions || [];
  const idx = Math.min(getProgress(nodeId), Math.max(questions.length - 1, 0));
  const q = questions[idx] || { question: "No questions yet.", hint: "", answer: "" };

  const done = idx >= questions.length - 1;

  return `
    <div class="pc-card" data-node="${escapeHtml(nodeId)}">
      <div class="pc-title">${escapeHtml(p.title || "Knowledge Node")}</div>
      ${p.subtitle ? `<div class="pc-subtitle">${escapeHtml(p.subtitle)}</div>` : ""}

      <div class="pc-qmeta">Question ${idx + 1} of ${questions.length} • Level ${escapeHtml(q.level ?? (idx + 1))}</div>
      <div class="pc-question">${escapeHtml(q.question)}</div>

      ${q.hint ? `<div class="pc-hint"><b>Hint:</b> ${escapeHtml(q.hint)}</div>` : ""}

      <details class="pc-answer">
        <summary>Show answer</summary>
        <div class="pc-answer-body">${escapeHtml(q.answer || "")}</div>
      </details>

      <div class="pc-actions">
        <button class="pc-btn" data-action="reset">Reset</button>
        <button class="pc-btn pc-primary" data-action="next" ${done ? "disabled" : ""}>
          ${done ? "Completed" : "Next"}
        </button>
      </div>
    </div>
  `;
}

function wirePopupBehavior(popup) {
  // Event delegation inside popup
  const el = popup.getElement();
  if (!el) return;

  el.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;

    const card = e.target.closest(".pc-card");
    if (!card) return;

    const nodeId = card.getAttribute("data-node");
    const action = btn.getAttribute("data-action");

    if (action === "reset") {
      setProgress(nodeId, 0);
    }

    if (action === "next") {
      const current = getProgress(nodeId);
      setProgress(nodeId, current + 1);
    }

    // Re-render the popup content by re-opening it (simple & reliable)
    // We'll store the feature JSON on the popup for a refresh.
    const feature = popup._pcFeature;
    popup.setContent(renderNodeCard(feature));
    setTimeout(() => wirePopupBehavior(popup), 0);
  });
}

// Load and add nodes
fetch("data/knowledge_nodes.geojson")
  .then((r) => {
    if (!r.ok) throw new Error(`Failed to load GeoJSON: ${r.status}`);
    return r.json();
  })
  .then((geojson) => {
    L.geoJSON(geojson, {
      pointToLayer: (feature, latlng) => {
        // Simple “knowledge node” marker
        return L.circleMarker(latlng, {
          radius: 8,
          weight: 2,
          fillOpacity: 0.9
        });
      },
      onEachFeature: (feature, layer) => {
        layer.on("click", () => {
          const popup = L.popup({ maxWidth: 320 })
            .setLatLng(layer.getLatLng())
            .setContent(renderNodeCard(feature));

          // stash feature for refresh
          popup._pcFeature = feature;

          popup.openOn(map);
          map.once("popupopen", (evt) => wirePopupBehavior(evt.popup));
        });
      }
    }).addTo(map);
  })
  .catch((err) => {
    console.error(err);
    alert("Could not load knowledge nodes. Check the console for details.");
  });
