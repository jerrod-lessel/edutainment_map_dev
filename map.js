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
  const q = questions[idx] || {};

  const answered = localStorage.getItem(`pc_answered_${nodeId}_${idx}`) === "1";

  const choices = Array.isArray(q.choices) ? q.choices : [];
  const choicesHtml = choices.length
    ? `<div class="pc-choices">
        ${choices.map((c, i) => `
          <button class="pc-choice" data-action="choose" data-choice="${i}" ${answered ? "disabled" : ""}>
            ${escapeHtml(c)}
          </button>
        `).join("")}
      </div>`
    : `<div class="pc-hint"><b>Hint:</b> ${escapeHtml(q.hint || "No choices yet for this question.")}</div>`;

  const explainHtml = answered && q.explain
    ? `<div class="pc-explain"><b>Explanation:</b> ${escapeHtml(q.explain)}</div>`
    : "";

  const done = idx >= questions.length - 1;
  const canNext = answered && !done;

  return `
    <div class="pc-card" data-node="${escapeHtml(nodeId)}" data-idx="${idx}">
      <div class="pc-title">${escapeHtml(p.title || "Knowledge Node")}</div>
      ${p.subtitle ? `<div class="pc-subtitle">${escapeHtml(p.subtitle)}</div>` : ""}

      <div class="pc-qmeta">Question ${idx + 1} of ${questions.length}</div>
      <div class="pc-question">${escapeHtml(q.question || "No question yet.")}</div>

      ${choicesHtml}
      ${explainHtml}

      <div class="pc-actions">
        <button class="pc-btn" data-action="reset">Reset</button>
        <button class="pc-btn pc-primary" data-action="next" ${canNext ? "" : "disabled"}>
          ${done ? "Completed" : "Next"}
        </button>
      </div>
    </div>
  `;
}

function wirePopupBehavior(popup) {
  const el = popup.getElement();
  if (!el) return;

  // HARD stop: prevent map clicks from closing the popup
  el.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();

    const btn = e.target.closest("button[data-action]");
    if (!btn) return;

    const card = e.target.closest(".pc-card");
    if (!card) return;

    const nodeId = card.getAttribute("data-node");
    const idx = parseInt(card.getAttribute("data-idx"), 10);
    const action = btn.getAttribute("data-action");

    const feature = popup._pcFeature;
    const questions = (feature?.properties?.questions) || [];
    const q = questions[idx];

    if (action === "reset") {
      setProgress(nodeId, 0);
      // clear answered flags for this node
      for (let i = 0; i < questions.length; i++) {
        localStorage.removeItem(`pc_answered_${nodeId}_${i}`);
      }
    }

    if (action === "choose") {
      const choice = parseInt(btn.getAttribute("data-choice"), 10);
      if (q && Number.isInteger(q.correct)) {
        if (choice === q.correct) {
          localStorage.setItem(`pc_answered_${nodeId}_${idx}`, "1");
        } else {
          // gentle feedback
          alert("Not quite — try again 🙂");
        }
      }
    }

    if (action === "next") {
      const answered = localStorage.getItem(`pc_answered_${nodeId}_${idx}`) === "1";
      if (answered) setProgress(nodeId, idx + 1);
    }

    // Re-render without closing the popup
    popup.setContent(renderNodeCard(feature));
    setTimeout(() => wirePopupBehavior(popup), 0);
  }, { passive: false });
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
        layer.bindPopup(() => renderNodeCard(feature), { maxWidth: 320 });
      
        layer.on("popupopen", (e) => {
          const popup = e.popup;
          popup._pcFeature = feature; // stash for refresh
      
          // defer one tick so the DOM exists
          setTimeout(() => wirePopupBehavior(popup), 0);
        });
      }

    }).addTo(map);
  })
  .catch((err) => {
    console.error(err);
    alert("Could not load knowledge nodes. Check the console for details.");
  });
