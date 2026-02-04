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

