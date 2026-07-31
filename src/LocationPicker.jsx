import { Marker, TileLayer, MapContainer, useMapEvents } from 'react-leaflet';
import L from 'leaflet';

const defaultCenter = [17.3850, 78.4867];

const pinIcon = L.divIcon({
  html: '<div class="map-pin"></div>',
  className: 'leaflet-div-icon',
  iconSize: [20, 20],
  iconAnchor: [10, 10]
});

function MapClickHandler({ onSelect }) {
  useMapEvents({
    click(event) {
      onSelect(event.latlng);
    }
  });

  return null;
}

export default function LocationPicker({ value, onChange }) {
  const position = value ? [value.lat, value.lng] : defaultCenter;

  return (
    <div className="location-picker">
      <div className="location-picker-header">
        <span>Select the encroachment location</span>
        {value ? (
          <span>Chosen: {value.lat.toFixed(4)}, {value.lng.toFixed(4)}</span>
        ) : (
          <span>Click the map to choose a location</span>
        )}
      </div>
      <MapContainer center={position} zoom={13} scrollWheelZoom className="map-container">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapClickHandler onSelect={onChange} />
        {value ? <Marker position={position} icon={pinIcon} /> : null}
      </MapContainer>
      <button type="button" className="secondary-btn" onClick={() => onChange(null)}>
        Clear location
      </button>
    </div>
  );
}
