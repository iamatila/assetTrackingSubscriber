import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { Realtime } from 'ably'

export function useMapTracking() {
  // Reactive state
  const currentPosition = ref(null)
  const previousPosition = ref(null)
  const destination = ref(null)
  const route = ref([])
  const movementTrail = ref([])
  const isAnimating = ref(false)
  const animationSpeed = ref(1000) // milliseconds
  const maxTrailLength = ref(50) // Maximum number of trail points

  // Ably connection state
  const isConnected = ref(false)
  const connectionError = ref(null)
  const lastUpdate = ref(null)
  const locationData = ref(null)

  // Route and movement tracking
  const routeInfo = ref(null)
  const isMoving = ref(false)
  const currentSpeed = ref(0)
  const currentHeading = ref(0)
  const arrivalStatus = ref(null)
  const gpsQuality = ref('unknown')

  // Status state
  const currentStatus = ref('')
  const statusTimestamp = ref(null)

  // Map instance reference
  const mapInstance = ref(null)
  const currentMarker = ref(null)
  const destinationMarker = ref(null)
  const routePolyline = ref(null)
  const trailPolyline = ref(null)

  // Ably connection
  let ably = null
  let channel = null

  // Animation state
  let animationFrame = null
  let animationStartTime = null
  let animationStartPosition = null
  let animationTargetPosition = null

  // Ably connection methods
  const connectToAbly = async () => {
    try {
      // Get Ably key from Nuxt runtime config
      const config = useRuntimeConfig()
      const ablyKey = config.public.ablyKey || import.meta.env.VITE_ABLY_KEY
      
      if (!ablyKey || ablyKey === 'your_ably_api_key_here') {
        throw new Error('Ably API key not configured. Please check your .env file.')
      }

      console.log('Connecting to Ably...')
      ably = new Realtime({ 
        key: ablyKey,
        autoConnect: true,
        disconnectedRetryTimeout: 15000,
        suspendedRetryTimeout: 30000
      })
      
      // Wait for connection
      await new Promise((resolve, reject) => {
        ably.connection.on('connected', () => {
          console.log('Ably connected successfully')
          resolve()
        })
        ably.connection.on('failed', (error) => {
          console.error('Ably connection failed:', error)
          reject(error)
        })
        ably.connection.on('suspended', () => {
          console.warn('Ably connection suspended')
        })
        ably.connection.on('disconnected', () => {
          console.warn('Ably disconnected')
          isConnected.value = false
        })
      })

      channel = ably.channels.get('asset-tracking:locations')
      
      // Subscribe to location updates
      await channel.subscribe('location-update', (message) => {
        console.log('Received location update:', message.data)
        handleLocationUpdate(message)
      })
      
      // Subscribe to route updates
      await channel.subscribe('route-update', (message) => {
        console.log('Received route update:', message.data)
        handleRouteUpdate(message)
      })
      
      // Subscribe to arrival notifications
      await channel.subscribe('arrival-notification', (message) => {
        console.log('Received arrival notification:', message.data)
        handleArrivalNotification(message)
      })
      
      // Subscribe to status updates
      await channel.subscribe('status-update', (message) => {
        console.log('Received status update:', message.data)
        handleStatusUpdate(message)
      })
      
      isConnected.value = true
      connectionError.value = null
      console.log('Successfully subscribed to all channels')
    } catch (err) {
      console.error('Ably connection error:', err)
      connectionError.value = err.message || 'Failed to connect to Ably'
      isConnected.value = false
    }
  }

  const disconnectFromAbly = () => {
    if (channel) {
      channel.unsubscribe()
    }
    if (ably) {
      ably.close()
    }
    isConnected.value = false
  }

  // Handle incoming location updates
  const handleLocationUpdate = (message) => {
    console.log('Processing location update:', message.data)
    const data = message.data
    
    // Validate required data
    if (!data.latitude || !data.longitude) {
      console.error('Invalid location data received:', data)
      return
    }
    
    locationData.value = data
    lastUpdate.value = new Date()
    
    // Store previous position for smooth animation
    if (currentPosition.value) {
      previousPosition.value = { ...currentPosition.value }
    }
    
    // Update movement state
    isMoving.value = data.isMoving || data.movementStatus === 'moving' || false
    currentSpeed.value = data.speedKmh || data.speed * 3.6 || 0
    currentHeading.value = data.heading || 0
    gpsQuality.value = data.gpsQuality || 'unknown'
    
    // Update destination if provided
    if (data.destinationCoords) {
      setDestination({
        lat: data.destinationCoords.latitude,
        lng: data.destinationCoords.longitude,
        address: data.destination || 'Unknown destination'
      })
    }
    
    // Create new position object
    const newPosition = {
      lat: data.latitude,
      lng: data.longitude,
      timestamp: data.timestamp,
      speed: data.speedKmh || data.speed * 3.6 || 0,
      heading: data.heading || 0,
      accuracy: data.accuracy || 0
    }
    
    console.log('Setting new position:', newPosition)
    
    // Always set position directly for now to ensure it updates
    // We can add animation back later once we confirm basic functionality works
    setPosition(newPosition)
    
    connectionError.value = null
  }

  // Handle route updates
  const handleRouteUpdate = (message) => {
    const data = message.data
    routeInfo.value = data.routeInfo
    
    // Update route visualization if we have route data
    if (data.routeInfo && data.routeInfo.hasRoute && currentPosition.value && destination.value) {
      updateRoute(currentPosition.value, destination.value)
    }
  }

  // Handle arrival notifications
  const handleArrivalNotification = (message) => {
    const data = message.data
    arrivalStatus.value = {
      arrived: true,
      timestamp: data.timestamp,
      destination: data.destination,
      finalDistance: data.finalDistance,
      journeyDuration: data.journeyDuration,
      arrivalTime: data.arrivalTime
    }
    
    // Clear route since we've arrived
    route.value = []
    if (routePolyline.value) {
      routePolyline.value.setLatLngs([])
    }
  }

  // Handle status updates
  const handleStatusUpdate = (message) => {
    const data = message.data
    console.log('Status update received:', data)
    if (data.status) {
      currentStatus.value = data.status
      statusTimestamp.value = data.timestamp
      locationData.value = {
        ...locationData.value,
        status: data.status,
        statusTimestamp: data.timestamp
      }
    }
  }

  // Calculate animation duration based on distance and speed
  const calculateAnimationDuration = (startPos, endPos) => {
    const distance = calculateDistance(startPos, endPos)
    const speed = currentSpeed.value || 1 // km/h
    
    // Base duration on distance and speed, with min/max limits
    let duration = Math.min(Math.max(distance / speed * 100, 500), 3000)
    
    // If moving slowly or stationary, use shorter animation
    if (speed < 5) {
      duration = Math.min(duration, 1500)
    }
    
    return duration
  }

  // Computed properties
  const hasDestination = computed(() => destination.value !== null)
  const hasRoute = computed(() => route.value.length > 0)
  const hasTrail = computed(() => movementTrail.value.length > 0)
  const hasLocation = computed(() => currentPosition.value !== null)
  
  const distanceToDestination = computed(() => {
    if (!currentPosition.value || !destination.value) return null
    return calculateDistance(currentPosition.value, destination.value)
  })

  const distanceToDestinationKm = computed(() => {
    const distance = distanceToDestination.value
    return distance ? (distance / 1000).toFixed(2) : null
  })

  const estimatedTimeToDestination = computed(() => {
    if (!locationData.value?.estimatedTimeToDestination) return null
    
    const seconds = locationData.value.estimatedTimeToDestination
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`
    } else if (minutes > 0) {
      return `${minutes}m`
    } else {
      return '<1m'
    }
  })

  const routeStatus = computed(() => {
    return locationData.value?.routeStatus || 'unknown'
  })

  const isNearDestination = computed(() => {
    const distance = distanceToDestination.value
    return distance && distance <= 100 // Within 100 meters
  })

  const movementStatus = computed(() => {
    if (arrivalStatus.value?.arrived) return 'arrived'
    if (isNearDestination.value) return 'approaching'
    if (isMoving.value) return 'moving'
    return 'stationary'
  })

  const connectionStatus = computed(() => {
    if (connectionError.value) return 'error'
    if (isConnected.value) return 'connected'
    return 'disconnected'
  })

  const lastUpdateFormatted = computed(() => {
    if (!lastUpdate.value) return 'Never'
    const now = new Date()
    const diff = now - lastUpdate.value
    
    if (diff < 60000) return 'Just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    return `${Math.floor(diff / 3600000)}h ago`
  })

  // Initialize map tracking
  function initializeMap(mapRef) {
    mapInstance.value = mapRef
    return mapInstance.value
  }

  // Animate marker to new position
  function animateToPosition(newPosition, duration = animationSpeed.value) {
    if (!mapInstance.value || !currentMarker.value || isAnimating.value) {
      // If can't animate, just set position directly
      setPosition(newPosition)
      return
    }

    const startPosition = currentPosition.value
    if (!startPosition) {
      setPosition(newPosition)
      return
    }

    // Start animation
    isAnimating.value = true
    animationStartTime = Date.now()
    animationStartPosition = { ...startPosition }
    animationTargetPosition = { ...newPosition }

    const animate = () => {
      const elapsed = Date.now() - animationStartTime
      const progress = Math.min(elapsed / duration, 1)

      // Easing function (ease-out)
      const easedProgress = 1 - Math.pow(1 - progress, 3)

      // Interpolate position
      const interpolatedPosition = {
        lat: animationStartPosition.lat + 
             (animationTargetPosition.lat - animationStartPosition.lat) * easedProgress,
        lng: animationStartPosition.lng + 
             (animationTargetPosition.lng - animationStartPosition.lng) * easedProgress
      }

      // Update marker position
      if (currentMarker.value && mapInstance.value) {
        currentMarker.value.setLatLng([interpolatedPosition.lat, interpolatedPosition.lng])
      }

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate)
      } else {
        // Animation complete
        isAnimating.value = false
        setPosition(newPosition)
        animationFrame = null
      }
    }

    animationFrame = requestAnimationFrame(animate)
  }

  // Set position without animation
  function setPosition(position) {
    if (!position) return

    currentPosition.value = {
      lat: position.lat,
      lng: position.lng,
      timestamp: position.timestamp || Date.now(),
      speed: position.speed || 0,
      heading: position.heading || 0,
      accuracy: position.accuracy || 0
    }

    // Update marker if it exists (Google Maps)
    if (currentMarker.value && mapInstance.value) {
      currentMarker.value.position = { lat: position.lat, lng: position.lng }
      
      // Update marker rotation based on heading
      if (position.heading !== undefined) {
        const markerElement = currentMarker.value.content
        if (markerElement) {
          markerElement.style.transform = `rotate(${position.heading}deg)`
        }
      }
    }

    // Add to trail
    addToTrail(currentPosition.value)

    // Center map on new position only if it's the first position or we're far from current view
    if (mapInstance.value) {
      const currentCenter = mapInstance.value.getCenter()
      const distance = calculateDistance(
        { lat: currentCenter.lat(), lng: currentCenter.lng() },
        position
      )
      
      // Only recenter if we're more than 1km away from current view or it's the first position
      if (!previousPosition.value || distance > 1000) {
        mapInstance.value.setCenter({ lat: position.lat, lng: position.lng })
        if (mapInstance.value.getZoom() < 13) {
          mapInstance.value.setZoom(13)
        }
      }
    }
  }

  // Update route between current position and destination
  function updateRoute(startPos, endPos) {
    if (!startPos || !endPos) {
      route.value = []
      return
    }

    // For now, create a simple straight line route
    // In a real implementation, you might call a routing service
    route.value = [
      { lat: startPos.lat, lng: startPos.lng },
      { lat: endPos.lat, lng: endPos.lng }
    ]

    // Update route polyline on map (Google Maps)
    if (mapInstance.value && routePolyline.value) {
      routePolyline.value.setPath(route.value)
    }
  }

  // Add position to movement trail
  function addToTrail(position) {
    if (!position) return

    const trailPoint = {
      lat: position.lat,
      lng: position.lng,
      timestamp: position.timestamp || Date.now(),
      speed: position.speed || 0,
      heading: position.heading || 0
    }

    // Only add to trail if position has changed significantly (> 5 meters)
    const lastPoint = movementTrail.value[movementTrail.value.length - 1]
    if (lastPoint) {
      const distance = calculateDistance(lastPoint, trailPoint)
      if (distance < 5) return // Skip if too close to last point
    }

    // Add to trail
    movementTrail.value.push(trailPoint)

    // Limit trail length
    if (movementTrail.value.length > maxTrailLength.value) {
      movementTrail.value.shift()
    }

    // Update trail polyline on map with speed-based styling (Google Maps)
    if (mapInstance.value && trailPolyline.value) {
      const trailPath = movementTrail.value.map(p => ({ lat: p.lat, lng: p.lng }))
      trailPolyline.value.setPath(trailPath)
      
      // Update trail style based on movement
      const avgSpeed = movementTrail.value.reduce((sum, p) => sum + (p.speed || 0), 0) / movementTrail.value.length
      const color = avgSpeed > 30 ? '#ff4444' : avgSpeed > 10 ? '#ffaa00' : '#4444ff'
      trailPolyline.value.setOptions({ 
        strokeColor: color, 
        strokeWeight: 3, 
        strokeOpacity: 0.7 
      })
    }
  }

  // Set destination
  function setDestination(dest) {
    destination.value = dest ? {
      lat: dest.lat,
      lng: dest.lng,
      address: dest.address || 'Unknown'
    } : null

    // Update route if we have current position
    if (currentPosition.value && destination.value) {
      updateRoute(currentPosition.value, destination.value)
    }

    // Update destination marker (Google Maps)
    if (mapInstance.value && destinationMarker.value) {
      if (destination.value) {
        destinationMarker.value.position = { lat: destination.value.lat, lng: destination.value.lng }
        destinationMarker.value.map = mapInstance.value
      } else {
        destinationMarker.value.map = null
      }
    }
  }

  // Clear trail
  function clearTrail() {
    movementTrail.value = []
    if (trailPolyline.value) {
      trailPolyline.value.setPath([])
    }
  }

  // Calculate distance between two points (Haversine formula)
  function calculateDistance(pos1, pos2) {
    const R = 6371e3 // Earth's radius in meters
    const φ1 = pos1.lat * Math.PI / 180
    const φ2 = pos2.lat * Math.PI / 180
    const Δφ = (pos2.lat - pos1.lat) * Math.PI / 180
    const Δλ = (pos2.lng - pos1.lng) * Math.PI / 180

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))

    return R * c // Distance in meters
  }

  // Calculate bearing between two points
  function calculateBearing(pos1, pos2) {
    const φ1 = pos1.lat * Math.PI / 180
    const φ2 = pos2.lat * Math.PI / 180
    const Δλ = (pos2.lng - pos1.lng) * Math.PI / 180

    const y = Math.sin(Δλ) * Math.cos(φ2)
    const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)

    const θ = Math.atan2(y, x)
    return (θ * 180 / Math.PI + 360) % 360 // Bearing in degrees
  }

  // Check if asset has arrived at destination
  function checkArrival(threshold = 50) { // 50 meters threshold
    if (!currentPosition.value || !destination.value) return false
    
    const distance = calculateDistance(currentPosition.value, destination.value)
    return distance <= threshold
  }

  // Fit map bounds to show all relevant points
  function fitMapBounds() {
    if (!mapInstance.value) return

    const points = []
    
    if (currentPosition.value) {
      points.push([currentPosition.value.lat, currentPosition.value.lng])
    }
    
    if (destination.value) {
      points.push([destination.value.lat, destination.value.lng])
    }

    if (points.length > 0) {
      const group = new L.featureGroup(points.map(p => L.marker(p)))
      mapInstance.value.fitBounds(group.getBounds().pad(0.1))
    }
  }

  // Set map markers
  function setMapMarkers(currentMarkerRef, destinationMarkerRef, routePolylineRef, trailPolylineRef) {
    currentMarker.value = currentMarkerRef
    destinationMarker.value = destinationMarkerRef
    routePolyline.value = routePolylineRef
    trailPolyline.value = trailPolylineRef
  }

  // Reset arrival status
  function resetArrivalStatus() {
    arrivalStatus.value = null
  }

  // Get trail statistics
  function getTrailStats() {
    if (movementTrail.value.length < 2) return null
    
    const totalDistance = movementTrail.value.reduce((total, point, index) => {
      if (index === 0) return 0
      return total + calculateDistance(movementTrail.value[index - 1], point)
    }, 0)
    
    const avgSpeed = movementTrail.value.reduce((sum, p) => sum + (p.speed || 0), 0) / movementTrail.value.length
    const maxSpeed = Math.max(...movementTrail.value.map(p => p.speed || 0))
    
    return {
      totalDistance: (totalDistance / 1000).toFixed(2), // km
      averageSpeed: avgSpeed.toFixed(1), // km/h
      maxSpeed: maxSpeed.toFixed(1), // km/h
      points: movementTrail.value.length
    }
  }

  // Center map on current position
  function centerOnCurrentPosition() {
    if (mapInstance.value && currentPosition.value) {
      mapInstance.value.setCenter({ lat: currentPosition.value.lat, lng: currentPosition.value.lng })
      mapInstance.value.setZoom(15)
    }
  }

  // Auto-fit map to show current position and destination
  function autoFitMap() {
    if (!mapInstance.value) return

    const bounds = new google.maps.LatLngBounds()
    let hasPoints = false
    
    if (currentPosition.value) {
      bounds.extend({ lat: currentPosition.value.lat, lng: currentPosition.value.lng })
      hasPoints = true
    }
    
    if (destination.value) {
      bounds.extend({ lat: destination.value.lat, lng: destination.value.lng })
      hasPoints = true
    }

    if (hasPoints) {
      mapInstance.value.fitBounds(bounds, { padding: 50 })
    }
  }

  // Cleanup function
  function cleanup() {
    if (animationFrame) {
      cancelAnimationFrame(animationFrame)
      animationFrame = null
    }
    disconnectFromAbly()
    isAnimating.value = false
  }

  // Watch for position changes to update trail
  watch(currentPosition, (newPos, oldPos) => {
    if (newPos && oldPos && (newPos.lat !== oldPos.lat || newPos.lng !== oldPos.lng)) {
      addToTrail(newPos)
    }
  })

  // Watch for arrival status changes
  watch(arrivalStatus, (status) => {
    if (status?.arrived) {
      // Could trigger notifications or other arrival actions
      console.log(`Asset arrived at ${status.destination}`)
    }
  })

  // Auto-connect on mount
  onMounted(() => {
    connectToAbly()
  })

  // Clean up on unmount
  onUnmounted(() => {
    cleanup()
  })

  return {
    // Core state
    currentPosition,
    previousPosition,
    destination,
    route,
    movementTrail,
    isAnimating,
    animationSpeed,
    maxTrailLength,

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
    hasRoute,
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

    // Connection methods
    connectToAbly,
    disconnectFromAbly,

    // Map methods
    initializeMap,
    animateToPosition,
    setPosition,
    updateRoute,
    addToTrail,
    setDestination,
    clearTrail,
    setMapMarkers,

    // Utility methods
    calculateDistance,
    calculateBearing,
    checkArrival,
    fitMapBounds,
    resetArrivalStatus,
    getTrailStats,
    centerOnCurrentPosition,
    autoFitMap,
    cleanup
  }
}