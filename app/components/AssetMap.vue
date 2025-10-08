<template>
  <div class="map-container">
    <!-- Connection Status Bar -->
    <div class="connection-status" :class="connectionStatus">
      <div class="status-indicator" :class="{ 'pulse': isConnected }"></div>
      <span>{{ connectionStatusText }}</span>
      <div v-if="lastUpdate" class="last-update">{{ lastUpdateFormatted }}</div>
      <button v-if="!isConnected" @click="reconnect" class="reconnect-btn-small">Reconnect</button>
    </div>

    <!-- Status Toast -->
    <div v-if="statusMessage" class="status-toast" :class="statusToastClass">
      {{ statusMessage }}
    </div>

    <!-- Debug Panel (only show if there are connection issues) -->
    <div v-if="connectionError || !isConnected" class="debug-panel">
      <h4>Debug Information</h4>
      <p><strong>Connection Status:</strong> {{ connectionStatus }}</p>
      <p v-if="connectionError"><strong>Error:</strong> {{ connectionError }}</p>
      <p><strong>Last Update:</strong> {{ lastUpdateFormatted }}</p>
      <p><strong>Has Location:</strong> {{ hasLocation }}</p>
      <p v-if="currentPosition"><strong>Current Position:</strong> {{ currentPosition.lat }}, {{ currentPosition.lng }}</p>
    </div>

    <div ref="mapRef" class="map"></div>
    <div v-if="loading" class="loading">Loading map...</div>
    <div v-if="connectionError" class="error">
      {{ connectionError }}
      <button @click="reconnect" class="reconnect-btn">Reconnect</button>
    </div>
    
    <!-- Enhanced Map Controls -->
    <div class="map-controls">
      <button 
        @click="centerOnCurrentPosition" 
        :disabled="!hasLocation"
        class="control-btn"
        title="Center on current position"
      >
        <span class="icon">📍</span>
      </button>
      <button 
        @click="autoFitMap" 
        :disabled="!hasLocation"
        class="control-btn"
        title="Fit to view"
      >
        <span class="icon">🔍</span>
      </button>
      <button 
        @click="toggleTrail" 
        :class="{ active: showTrail }"
        class="control-btn"
        title="Toggle movement trail"
      >
        <span class="icon">📈</span>
      </button>
      <button 
        @click="clearTrail" 
        :disabled="!hasTrail"
        class="control-btn"
        title="Clear trail"
      >
        <span class="icon">🗑️</span>
      </button>
    </div>

    <!-- Enhanced Status Panel -->
    <div v-if="hasLocation" class="status-panel" :class="{ 'moving': isMoving, 'arrived': arrivalStatus?.arrived }">
      <div class="panel-header">
        <div class="movement-indicator" :class="movementStatus">
          <span class="status-icon">{{ movementStatusIcon }}</span>
          <span class="status-text">{{ movementStatusText }}</span>
        </div>
        <div v-if="gpsQuality" class="gps-quality" :class="gpsQuality">
          {{ gpsQuality.toUpperCase() }}
        </div>
      </div>

      <div class="status-grid">
        <div v-if="isMoving" class="status-item speed">
          <label>Speed</label>
          <span class="value">{{ currentSpeed.toFixed(1) }} km/h</span>
        </div>

        <div v-if="currentHeading >= 0" class="status-item heading">
          <label>Heading</label>
          <span class="value">{{ formatHeading(currentHeading) }}</span>
        </div>

        <div v-if="hasDestination" class="status-item destination">
          <label>Destination</label>
          <span class="value">{{ destination.address }}</span>
        </div>

        <div v-if="distanceToDestinationKm" class="status-item distance">
          <label>Distance</label>
          <span class="value">{{ distanceToDestinationKm }} km</span>
        </div>

        <div v-if="estimatedTimeToDestination" class="status-item eta">
          <label>ETA</label>
          <span class="value">{{ estimatedTimeToDestination }}</span>
        </div>
      </div>

      <!-- Trail Statistics -->
      <div v-if="hasTrail && trailStats" class="trail-stats">
        <h4>Journey Stats</h4>
        <div class="stats-row">
          <div class="stat">
            <span class="label">Distance</span>
            <span class="value">{{ trailStats.totalDistance }} km</span>
          </div>
          <div class="stat">
            <span class="label">Avg Speed</span>
            <span class="value">{{ trailStats.averageSpeed }} km/h</span>
          </div>
          <div class="stat">
            <span class="label">Max Speed</span>
            <span class="value">{{ trailStats.maxSpeed }} km/h</span>
          </div>
        </div>
      </div>

      <!-- Arrival Notification -->
      <div v-if="arrivalStatus?.arrived" class="arrival-notification">
        <div class="arrival-content">
          <span class="arrival-icon">🎉</span>
          <div class="arrival-text">
            <strong>Arrived!</strong>
            <p>{{ arrivalStatus.destination }}</p>
            <small>{{ formatArrivalTime(arrivalStatus.arrivalTime) }}</small>
          </div>
        </div>
        <button @click="resetArrivalStatus" class="dismiss-btn">×</button>
      </div>
    </div>

    <!-- Loading Overlay -->
    <div v-if="!isConnected && !connectionError" class="loading-overlay">
      <div class="loading-spinner"></div>
      <p>Connecting to asset tracking...</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch, computed } from 'vue'
import { useMapTracking } from '../composables/useMapTracking.js'

// Use dynamic import for Leaflet to avoid SSR issues
let L

const mapRef = ref(null)
const loading = ref(false)
const showTrail = ref(true)

// Status toast state
const statusMessage = ref('')
const statusToastClass = ref('')

// Enhanced map tracking composable
const {
  // Core state
  currentPosition,
  destination,
  movementTrail,
  isAnimating,
  
  // Connection state
  isConnected,
  connectionError,
  lastUpdate,
  locationData,
  
  // Movement tracking
  routeInfo,
  isMoving,
  currentSpeed,
  currentHeading,
  arrivalStatus,
  gpsQuality,
  
  // Status state
  currentStatus,
  statusTimestamp,
  
  // Computed properties
  hasDestination,
  hasTrail,
  hasLocation,
  distanceToDestination,
  distanceToDestinationKm,
  estimatedTimeToDestination,
  routeStatus,
  isNearDestination,
  movementStatus,
  connectionStatus,
  lastUpdateFormatted,
  
  // Methods
  connectToAbly,
  disconnectFromAbly,
  initializeMap,
  animateToPosition,
  setPosition,
  setDestination,
  clearTrail: clearMovementTrail,
  setMapMarkers,
  resetArrivalStatus,
  getTrailStats,
  centerOnCurrentPosition,
  autoFitMap,
  cleanup
} = useMapTracking()

// Map instance and markers
let map = null
let currentMarker = null
let destinationMarker = null
let routePolyline = null
let trailPolyline = null

// Computed properties
const connectionStatusText = computed(() => {
  if (connectionError.value) return 'Connection Error'
  if (isConnected.value) return 'Connected'
  return 'Connecting...'
})

const movementStatusIcon = computed(() => {
  switch (movementStatus.value) {
    case 'arrived': return '🎯'
    case 'approaching': return '🏃'
    case 'moving': return '🚗'
    case 'stationary': return '⏸️'
    default: return '📍'
  }
})

const movementStatusText = computed(() => {
  switch (movementStatus.value) {
    case 'arrived': return 'Arrived'
    case 'approaching': return 'Approaching'
    case 'moving': return 'Moving'
    case 'stationary': return 'Stationary'
    default: return 'Unknown'
  }
})

const trailStats = computed(() => {
  return getTrailStats()
})

// Initialize the map with Google Maps
const initMap = async () => {
  loading.value = true
  try {
    if (mapRef.value) {
      // Initialize Google Maps
      const { Map } = await google.maps.importLibrary("maps")
      const { AdvancedMarkerElement } = await google.maps.importLibrary("marker")
      
      // Create the map centered at a default location
      map = new Map(mapRef.value, {
        center: { lat: 40.7128, lng: -74.0060 },
        zoom: 13,
        mapId: "asset-tracking-map"
      })
      
      // Initialize current location marker
      currentMarker = new AdvancedMarkerElement({
        map: map,
        position: { lat: 40.7128, lng: -74.0060 },
        content: createMarkerElement('current'),
        title: "Current Location"
      })
      
      // Initialize destination marker (not added to map yet)
      destinationMarker = new AdvancedMarkerElement({
        position: { lat: 0, lng: 0 },
        content: createMarkerElement('destination'),
        title: "Destination"
      })
      
      // Initialize polylines
      routePolyline = new google.maps.Polyline({
        path: [],
        geodesic: true,
        strokeColor: '#3388ff',
        strokeOpacity: 0.8,
        strokeWeight: 4,
        map: map
      })
      
      trailPolyline = new google.maps.Polyline({
        path: [],
        geodesic: true,
        strokeColor: '#ff6b6b',
        strokeOpacity: 0.6,
        strokeWeight: 2,
        map: map
      })
      
      // Initialize map tracking
      initializeMap(map)
      setMapMarkers(currentMarker, destinationMarker, routePolyline, trailPolyline)
      
      loading.value = false
    }
  } catch (err) {
    console.error('Error initializing Google Maps:', err)
    loading.value = false
  }
}

// Create marker elements for Google Maps
const createMarkerElement = (type) => {
  const element = document.createElement('div')
  
  if (type === 'current') {
    element.className = 'current-location-marker'
    element.innerHTML = '<div class="marker-pulse"></div>'
  } else if (type === 'destination') {
    element.className = 'destination-marker'
    element.innerHTML = '🎯'
  }
  
  return element
}

// Update map position with enhanced animation
const updateMapPosition = (position) => {
  if (!position || !map) return
  
  // Update current marker position
  if (currentMarker) {
    currentMarker.position = { lat: position.lat, lng: position.lng }
    
    // Update marker rotation based on heading
    if (position.heading !== undefined) {
      const markerElement = currentMarker.content
      if (markerElement) {
        markerElement.style.transform = `rotate(${position.heading}deg)`
      }
    }
  }
  
  // Update destination marker if we have destination
  if (destination.value && destinationMarker) {
    destinationMarker.position = { lat: destination.value.lat, lng: destination.value.lng }
    if (!destinationMarker.map) {
      destinationMarker.map = map
    }
  }
  
  // Update route polyline
  if (destination.value && routePolyline) {
    const routePoints = [
      { lat: position.lat, lng: position.lng },
      { lat: destination.value.lat, lng: destination.value.lng }
    ]
    routePolyline.setPath(routePoints)
  }
}

// Update marker style based on movement status
const updateMarkerStyle = (status) => {
  if (!currentMarker) return
  
  const markerElement = currentMarker.getElement()
  if (markerElement) {
    // Remove existing status classes
    markerElement.classList.remove('moving', 'stationary', 'approaching', 'arrived')
    // Add current status class
    markerElement.classList.add(status)
  }
}

// Control functions
const toggleTrail = () => {
  showTrail.value = !showTrail.value
  if (trailPolyline) {
    trailPolyline.setOptions({ 
      strokeOpacity: showTrail.value ? 0.6 : 0 
    })
  }
}

const clearTrail = () => {
  clearMovementTrail()
  if (trailPolyline) {
    trailPolyline.setPath([])
  }
}

const reconnect = async () => {
  console.log('Manual reconnect triggered')
  disconnectFromAbly()
  await new Promise(resolve => setTimeout(resolve, 1000)) // Wait 1 second
  await connectToAbly()
}

// Show status toast
const showStatusToast = (status) => {
  statusMessage.value = `Asset Status: ${status}`
  // Set toast color based on status
  switch(status.toLowerCase()) {
    case 'almost there':
      statusToastClass.value = 'toast-warning'
      break
    case 'arrived':
      statusToastClass.value = 'toast-info'
      break
    case 'completed':
      statusToastClass.value = 'toast-success'
      break
    default:
      statusToastClass.value = 'toast-info'
  }
  // Hide toast after 5 seconds
  setTimeout(() => {
    statusMessage.value = ''
  }, 5000)
}

// Utility functions
const formatDistance = (meters) => {
  if (meters < 1000) {
    return `${Math.round(meters)} m`
  }
  return `${(meters / 1000).toFixed(1)} km`
}

const formatTime = (seconds) => {
  if (seconds < 60) {
    return `${seconds} sec`
  } else if (seconds < 3600) {
    return `${Math.round(seconds / 60)} min`
  }
  return `${Math.round(seconds / 3600)} hr`
}

const formatHeading = (degrees) => {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  const index = Math.round(degrees / 45) % 8
  return `${directions[index]} (${Math.round(degrees)}°)`
}

const formatArrivalTime = (isoString) => {
  if (!isoString) return ''
  const date = new Date(isoString)
  return date.toLocaleTimeString()
}

onMounted(() => {
  initMap()
  // Also manually trigger connection to ensure it happens
  connectToAbly()
})

onBeforeUnmount(() => {
  cleanup()
  if (map) {
    map.remove()
  }
})

// Watch for position changes from the composable
watch(currentPosition, (newPosition) => {
  if (newPosition && map) {
    updateMapPosition(newPosition)
  }
})

// Watch for trail visibility changes
watch(showTrail, (show) => {
  if (trailPolyline) {
    trailPolyline.setStyle({ opacity: show ? 0.6 : 0 })
  }
})

// Watch for movement status changes to update marker style
watch(movementStatus, (status) => {
  updateMarkerStyle(status)
})

// Watch for status changes
watch(currentStatus, (newStatus) => {
  if (newStatus) {
    showStatusToast(newStatus)
  }
})
</script>

<style scoped>
.map-container {
  width: 100%;
  height: 100%;
  position: relative;
}

.connection-status {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  background: rgba(255, 255, 255, 0.95);
  padding: 8px 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  z-index: 1001;
  border-bottom: 1px solid #ddd;
  font-size: 14px;
}

.connection-status.connected {
  background: rgba(76, 175, 80, 0.1);
  border-bottom-color: #4CAF50;
}

.connection-status.error {
  background: rgba(244, 67, 54, 0.1);
  border-bottom-color: #f44336;
}

.status-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ccc;
}

.status-indicator.pulse {
  background: #4CAF50;
  animation: pulse 2s infinite;
}

.connection-status.error .status-indicator {
  background: #f44336;
}

.last-update {
  margin-left: auto;
  font-size: 12px;
  color: #666;
}

.map {
  width: 100%;
  height: 100%;
  min-height: 400px;
  border: 1px solid #ddd;
  border-radius: 8px;
  margin-top: 40px; /* Account for connection status bar */
}

.loading,
.error {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  padding: 16px;
  border-radius: 8px;
  z-index: 10;
  text-align: center;
}

.loading {
  background-color: rgba(255, 255, 255, 0.95);
}

.error {
  background-color: #ffebee;
  color: #c62828;
}

.reconnect-btn {
  margin-top: 8px;
  padding: 4px 12px;
  background: #f44336;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.reconnect-btn-small {
  padding: 2px 8px;
  background: #f44336;
  color: white;
  border: none;
  border-radius: 3px;
  cursor: pointer;
  font-size: 12px;
  margin-left: 8px;
}

.debug-panel {
  position: absolute;
  top: 50px;
  left: 10px;
  background: rgba(255, 255, 255, 0.95);
  padding: 12px;
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  font-size: 12px;
  z-index: 1001;
  max-width: 300px;
}

.debug-panel h4 {
  margin: 0 0 8px 0;
  font-size: 14px;
  color: #333;
}

.debug-panel p {
  margin: 4px 0;
  color: #666;
}

.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.9);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 1002;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #f3f3f3;
  border-top: 4px solid #3498db;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 16px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.map-controls {
  position: absolute;
  top: 10px;
  right: 10px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  z-index: 1000;
}

.control-btn {
  width: 40px;
  height: 40px;
  background: white;
  border: 2px solid #ccc;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  transition: all 0.2s ease;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.control-btn:hover {
  background: #f0f0f0;
  border-color: #999;
}

.control-btn.active {
  background: #4CAF50;
  border-color: #4CAF50;
  color: white;
}

.status-panel {
  position: absolute;
  bottom: 10px;
  left: 10px;
  background: rgba(255, 255, 255, 0.95);
  padding: 16px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  font-size: 13px;
  z-index: 1000;
  max-width: 300px;
  min-width: 250px;
  transition: all 0.3s ease;
}

.status-panel.moving {
  border-left: 4px solid #4CAF50;
}

.status-panel.arrived {
  border-left: 4px solid #FF9800;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid #eee;
}

.movement-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
}

.movement-indicator.moving {
  color: #4CAF50;
}

.movement-indicator.stationary {
  color: #666;
}

.movement-indicator.approaching {
  color: #FF9800;
}

.movement-indicator.arrived {
  color: #2196F3;
}

.gps-quality {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 10px;
  text-transform: uppercase;
  font-weight: 600;
}

.gps-quality.excellent {
  background: #4CAF50;
  color: white;
}

.gps-quality.good {
  background: #8BC34A;
  color: white;
}

.gps-quality.fair {
  background: #FF9800;
  color: white;
}

.gps-quality.poor {
  background: #f44336;
  color: white;
}

.status-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 12px;
}

.status-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.status-item label {
  font-size: 11px;
  color: #666;
  text-transform: uppercase;
  font-weight: 500;
}

.status-item .value {
  font-weight: 600;
  color: #333;
}

.status-item.speed .value {
  color: #4CAF50;
}

.status-item.distance .value {
  color: #2196F3;
}

.status-item.eta .value {
  color: #FF9800;
}

.trail-stats {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #eee;
}

.trail-stats h4 {
  margin: 0 0 8px 0;
  font-size: 12px;
  color: #666;
  text-transform: uppercase;
}

.stats-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
}

.stat .label {
  font-size: 10px;
  color: #666;
  margin-bottom: 2px;
}

.stat .value {
  font-size: 11px;
  font-weight: 600;
  color: #333;
}

.arrival-notification {
  margin-top: 12px;
  padding: 12px;
  background: linear-gradient(135deg, #4CAF50, #45a049);
  color: white;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  animation: slideIn 0.3s ease;
}

.arrival-content {
  display: flex;
  align-items: center;
  gap: 8px;
}

.arrival-icon {
  font-size: 20px;
}

.arrival-text strong {
  display: block;
  margin-bottom: 2px;
}

.arrival-text p {
  margin: 0;
  font-size: 12px;
  opacity: 0.9;
}

.arrival-text small {
  font-size: 10px;
  opacity: 0.8;
}

.dismiss-btn {
  background: none;
  border: none;
  color: white;
  font-size: 18px;
  cursor: pointer;
  padding: 0;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: background 0.2s;
}

.dismiss-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

@keyframes slideIn {
  from {
    transform: translateY(20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.status-toast {
  position: absolute;
  top: 60px;
  right: 10px;
  padding: 12px 16px;
  border-radius: 6px;
  color: white;
  font-weight: 500;
  z-index: 1002;
  animation: slideIn 0.3s ease-out;
}

.toast-success {
  background: #4caf50;
}

.toast-warning {
  background: #ff9800;
}

.toast-info {
  background: #2196f3;
}

/* Enhanced marker styles */
:deep(.current-location-marker) {
  background: transparent;
  transition: all 0.3s ease;
}

:deep(.marker-pulse) {
  width: 20px;
  height: 20px;
  background: #4CAF50;
  border-radius: 50%;
  position: relative;
  animation: pulse 2s infinite;
  transition: all 0.3s ease;
}

:deep(.marker-pulse::before) {
  content: '';
  position: absolute;
  top: -5px;
  left: -5px;
  width: 30px;
  height: 30px;
  background: rgba(76, 175, 80, 0.3);
  border-radius: 50%;
  animation: pulse-ring 2s infinite;
}

/* Movement status marker styles */
:deep(.current-location-marker.moving .marker-pulse) {
  background: #4CAF50;
  animation: pulse 1s infinite;
}

:deep(.current-location-marker.stationary .marker-pulse) {
  background: #666;
  animation: none;
}

:deep(.current-location-marker.approaching .marker-pulse) {
  background: #FF9800;
  animation: pulse 0.5s infinite;
}

:deep(.current-location-marker.arrived .marker-pulse) {
  background: #2196F3;
  animation: celebration 2s infinite;
}

@keyframes pulse {
  0% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.1);
  }
  100% {
    transform: scale(1);
  }
}

@keyframes pulse-ring {
  0% {
    transform: scale(0.8);
    opacity: 1;
  }
  100% {
    transform: scale(2);
    opacity: 0;
  }
}

@keyframes celebration {
  0%, 100% {
    transform: scale(1) rotate(0deg);
  }
  25% {
    transform: scale(1.2) rotate(5deg);
  }
  75% {
    transform: scale(1.2) rotate(-5deg);
  }
}

:deep(.destination-marker) {
  background: transparent;
  text-align: center;
  font-size: 20px;
  animation: bounce 2s infinite;
}

@keyframes bounce {
  0%, 20%, 50%, 80%, 100% {
    transform: translateY(0);
  }
  40% {
    transform: translateY(-5px);
  }
  60% {
    transform: translateY(-3px);
  }
}
</style>