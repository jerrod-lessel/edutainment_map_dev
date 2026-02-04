// ===============================
// Initialize the map
// ===============================
const map = L.map('map', {
  zoomControl: true,
  attributionControl: false
});

// Guadalupe-focused view
map.setView([34.9715, -120.5713], 13);

// Basemap
L.tileLayer(
  'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  { maxZoom: 18 }
).addTo(map);

// ===============================
// Guadalupe bounds
// ===============================
const guadalupeBounds = L.latLngBounds(
  [34.920, -120.640], // SW
  [35.010, -120.500]  // NE
);

map.setMaxBounds(guadalupeBounds);
map.on('drag', () => {
  map.panInsideBounds(guadalupeBounds, { animate: false });
});

L.rectangle(guadalupeBounds, {
  color: '#666',
  weight: 1,
  dashArray: '4,4',
  fillOpacity: 0
}).addTo(map);

// ===============================
// Utilities
// ===============================
function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function progressKey(nodeId) {
  return `pc_progress_${nodeId}`;
}

function answeredKey(nodeId, idx) {
  return `pc_answered_${nodeId}_${idx}`;
}

function getProgress(nodeId) {
  const raw = localStorage.getItem(progressKey(nodeId));
  const n = raw ? parseInt(raw, 10) : 0;
  return Number.isFinite(n) ? n : 0;
}

function setProgress(nodeId, idx) {
  localStorage.setItem(progressKey(nodeId), String(idx));
}

// ===============================
// Render knowledge node panel
// ===============================
function renderNodeCard(feature) {
  const p = feature.properties;
  const nodeId = p.id;
  const questions = p.questions || [];
  const idx = Math.min(getProgress(nodeId), questions.length - 1);
  const q = questions[idx] || {};

  const answered = localStorage.getItem(answeredKey(nodeId, idx)) === "1";
  const message = feature._pcMessage || "";

  const choices = Array.isArray(q.choices) ? q.choices : [];
  const choicesHtml = choices.length
    ? `<div class="pc-choices">
        ${choices.map((c, i) => `
          <button
            class="pc-choice"
            data-action="choose"
            data-choice="${i}"
            ${answered ? "disabled" : ""}
          >
            ${escapeHtml(c)}
          </button>
        `).join("")}
      </div>`
    : "";

  const explainHtml = answered && q.explain
    ? `<div class="pc-explain"><b>Explanation:</b> ${escapeHtml(q.explain)}</div>`
    : "";

  const msgHtml = message
    ? `<div class="pc-msg">${escapeHtml(message)}</div>`
    : "";

  const done = idx >= questions.length - 1;
  const canNext = answered && !done;

  return `
    <div class="pc-card" data-node="${escapeHtml(nodeId)}" data-idx="${idx}">
      <div class="pc-title">${escapeHtml(p.title || "Knowledge Node")}</div>
      ${p.subtitle ? `<div class="pc-subtitle">${escapeHtml(p.subtitle)}</div>` : ""}

      <div class="pc-qmeta">Question ${idx + 1} of ${questions.length}</div>
      <div class="pc-question">${escapeHtml(q.question || "")}</div>

      ${msgHtml}
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

// ===============================
// Popup interaction logic
// ===============================
function wirePopupBehavior(popup) {
  const el = popup.getElement();
  if (!el) return;

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
    const questions = feature.properties.questions || [];
    const q = questions[idx];

    if (action === "reset") {
      setProgress(nodeId, 0);
      for (let i = 0; i < questions.length; i++) {
        localStorage.removeItem(answeredKey(nodeId, i));
      }
      feature._pcMessage = "";
    }

    if (action === "choose") {
      const choice = parseInt(btn.getAttribute("data-choice"), 10);
      if (q && Number.isInteger(q.correct)) {
        if (choice === q.correct) {
          localStorage.setItem(answeredKey(nodeId, idx), "1");
          feature._pcMessage = "";
        } else {
          feature._pcMessage = "Not quite — try again 🙂";
        }
      }
    }

    if (action === "next") {
      if (localStorage.getItem(answeredKey(nodeId, idx)) === "1") {
        setProgress(nodeId, idx + 1);
      }
    }

    popup.setContent(renderNodeCard(feature));
    setTimeout(() => wirePopupBehavior(popup), 0);
  }, { passive: false });
}

// ===============================
// Load knowledge nodes
// ===============================
fetch(`data/knowledge_nodes.geojson?v=${Date.now()}`)
  .then(r => r.json())
  .then(geojson => {
    L.geoJSON(geojson, {
      pointToLayer: (feature, latlng) =>
        L.circleMarker(latlng, {
          radius: 8,
          weight: 2,
          fillOpacity: 0.9
        }),
      onEachFeature: (feature, layer) => {
        layer.bindPopup(() => renderNodeCard(feature), {
          maxWidth: 340,
          autoPan: true,
          keepInView: true,
          autoPanPaddingTopLeft: [20, 80],   // extra top padding so it never clips
          autoPanPaddingBottomRight: [20, 20],
          offset: L.point(0, 12)             // nudges popup down a bit
        });

        layer.on("popupopen", (e) => {
          const popup = e.popup;
          popup._pcFeature = feature;

          map.panInside(e.popup.getLatLng(), { padding: [20, 20] });

          setTimeout(() => wirePopupBehavior(popup), 0);
        });
      }
    }).addTo(map);
  })
  .catch(err => {
    console.error(err);
    alert("Failed to load knowledge nodes.");
  });

// ===============================
// Positive News Pins
// ===============================
fetch(`data/positive_news.geojson?v=${Date.now()}`)
  .then(r => r.json())
  .then(geojson => {
    L.geoJSON(geojson, {
      pointToLayer: (feature, latlng) => {
        // A simple “news pin” marker style
        return L.circleMarker(latlng, {
          radius: 9,
          weight: 2,
          fillOpacity: 0.95
        });
      },
      onEachFeature: (feature, layer) => {
        const p = feature.properties;

        const html = `
          <div class="pc-card">
            <div class="pc-title">🟡 ${escapeHtml(p.title || "Positive news")}</div>
            ${p.date ? `<div class="pc-qmeta">${escapeHtml(p.date)}</div>` : ""}
            <div class="pc-question">${escapeHtml(p.summary || "")}</div>
            <div class="pc-actions" style="flex-wrap:wrap;">
              <a class="pc-btn pc-primary" href="${p.article_url}" target="_blank" rel="noopener">Read article</a>
              <a class="pc-btn" href="${p.wiki_url}" target="_blank" rel="noopener">Wikipedia</a>
              <a class="pc-btn" href="${p.charity_url}" target="_blank" rel="noopener">How to help</a>
            </div>
          </div>
        `;

        layer.bindPopup(html, {
          maxWidth: 360,
          autoPan: true,
          keepInView: true,
          autoPanPaddingTopLeft: [20, 80],
          autoPanPaddingBottomRight: [20, 20],
          offset: L.point(0, 12)
        });
      }
    }).addTo(map);
  })
  .catch(err => {
    console.error(err);
  });

