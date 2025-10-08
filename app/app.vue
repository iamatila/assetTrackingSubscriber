<template>
  <div id="app">
    <header>
      <h1>Asset Tracking Subscriber</h1>
    </header>
    <main>
      <div class="container">
        <div class="controls">
          <button 
            @click="toggleSubscription" 
            :class="isConnected ? 'stop-btn' : 'start-btn'"
            :disabled="false"
          >
            {{ isConnected ? 'Stop Tracking' : 'Start Tracking' }}
          </button>
          <div class="status">
            Status: {{ connectionStatusText }}
          </div>
        </div>
        
        <div class="info-panel" v-if="currentPosition">
          <h2>Current Asset Position</h2>
          <div class="info-item">
            <strong>Latitude:</strong>
            <span>{{ currentPosition.lat.toFixed(6) }}</span>
          </div>
          <div class="info-item">
            <strong>Longitude:</strong>
            <span>{{ currentPosition.lng.toFixed(6) }}</span>
          </div>
          <div class="info-item">
            <strong>Last Update:</strong>
            <span>{{ lastUpdateFormatted || 'Never' }}</span>
          </div>
          <div v-if="currentStatus" class="info-item status-item">
            <strong>Status:</strong>
            <span class="status-badge" :class="getStatusClass(currentStatus)">{{ currentStatus }}</span>
          </div>
        </div>
        
        <div class="map-section">
          <h2>Asset Location</h2>
          <client-only>
            <AssetMap :currentPosition="currentPosition" />
            <template #fallback>
              <div class="map-placeholder">
                Loading map...
              </div>
            </template>
          </client-only>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import AssetMap from './components/AssetMap.vue'
import { useMapTracking } from '../composables/useMapTracking.js'

// Use the map tracking composable
const {
  currentPosition,
  isConnected,
  connectionError,
  lastUpdate,
  currentStatus,
  connectToAbly,
  disconnectFromAbly
} = useMapTracking()

// Computed properties
const connectionStatusText = computed(() => {
  if (connectionError.value) return 'Connection Error'
  if (isConnected.value) return 'Connected'
  return 'Connecting...'
})

const lastUpdateFormatted = computed(() => {
  if (!lastUpdate.value) return 'Never'
  return lastUpdate.value.toLocaleTimeString()
})

// Get status CSS class
const getStatusClass = (status) => {
  switch(status?.toLowerCase()) {
    case 'almost there':
      return 'status-warning'
    case 'arrived':
      return 'status-info'
    case 'completed':
      return 'status-success'
    default:
      return 'status-default'
  }
}

// Toggle subscription
const toggleSubscription = () => {
  if (isConnected.value) {
    disconnectFromAbly()
  } else {
    connectToAbly()
  }
}
</script>

<style>
#app {
  font-family: Arial, sans-serif;
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

header {
  text-align: center;
  margin-bottom: 30px;
}

header h1 {
  color: #333;
}

.container {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.controls {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 20px;
  background-color: #f5f5f5;
  border-radius: 8px;
}

.start-btn, .stop-btn {
  padding: 10px 20px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 16px;
}

.start-btn {
  background-color: #4CAF50;
  color: white;
}

.start-btn:hover {
  background-color: #45a049;
}

.start-btn:disabled, .stop-btn:disabled {
  background-color: #cccccc;
  cursor: not-allowed;
}

.stop-btn {
  background-color: #f44336;
  color: white;
}

.stop-btn:hover {
  background-color: #da190b;
}

.status {
  font-weight: bold;
}

.info-panel {
  padding: 20px;
  background-color: #e3f2fd;
  border-radius: 8px;
}

.info-panel h2 {
  margin-top: 0;
}

.info-item {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
}

.info-item span {
  color: #666;
}

.status-item {
  border-top: 1px solid #eee;
  padding-top: 8px;
  margin-top: 8px;
}

.status-badge {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  text-transform: uppercase;
}

.status-success {
  background: #e8f5e8;
  color: #2e7d32;
}

.status-warning {
  background: #fff3e0;
  color: #f57c00;
}

.status-info {
  background: #e3f2fd;
  color: #1976d2;
}

.status-default {
  background: #f5f5f5;
  color: #666;
}

.map-section {
  flex: 1;
}

.map-section h2 {
  margin-bottom: 10px;
}

.map-placeholder {
  width: 100%;
  height: 400px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #f0f0f0;
  border: 1px solid #ddd;
  border-radius: 8px;
  color: #666;
}
</style>