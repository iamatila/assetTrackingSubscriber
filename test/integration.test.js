import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createApp } from 'vue'
import AssetMap from '../app/components/AssetMap.vue'
import { useMapTracking } from '../composables/useMapTracking.js'

// Mock Leaflet
const mockMap = {
  setView: vi.fn(),
  fitBounds: vi.fn(),
  hasLayer: vi.fn(() => false),
  remove: vi.fn(),
  getZoom: vi.fn(() => 13)
}

const mockMarker = {
  setLatLng: vi.fn(),
  addTo: vi.fn(),
  remove: vi.fn(),
  getElement: vi.fn(() => ({
    style: {},
    classList: {
      remove: vi.fn(),
      add: vi.fn()
    }
  }))
}

const mockPolyline = {
  setLatLngs: vi.fn(),
  setStyle: vi.fn()
}

const mockFeatureGroup = {
  getBounds: vi.fn(() => ({
    pad: vi.fn(() => 'mock-bounds')
  }))
}

// Mock Leaflet globally
global.L = {
  map: vi.fn(() => mockMap),
  tileLayer: vi.fn(() => ({
    addTo: vi.fn()
  })),
  marker: vi.fn(() => mockMarker),
  divIcon: vi.fn(() => 'mock-icon'),
  polyline: vi.fn(() => mockPolyline),
  featureGroup: vi.fn(() => mockFeatureGroup),
  Icon: {
    Default: {
      prototype: {},
      mergeOptions: vi.fn()
    }
  }
}

// Mock Ably
const mockChannel = {
  subscribe: vi.fn(),
  unsubscribe: vi.fn()
}

const mockAbly = {
  channels: {
    get: vi.fn(() => mockChannel)
  },
  close: vi.fn()
}

vi.mock('ably', () => ({
  Realtime: vi.fn(() => mockAbly)
}))

// Mock environment variables
vi.mock('import.meta', () => ({
  env: {
    VITE_ABLY_KEY: 'test_ably_key'
  }
}))

describe('Asset Tracking Subscriber Integration Tests', () => {
  let wrapper
  let mapTracking

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks()
    
    // Mock DOM element for map
    const mapElement = document.createElement('div')
    mapElement.id = 'test-map'
    document.body.appendChild(mapElement)
  })

  afterEach(() => {
    if (wrapper) {
      wrapper.unmount()
    }
    // Clean up DOM
    document.body.innerHTML = ''
  })

  describe('AssetMap Component Integration', () => {
    it('should initialize map component correctly', async () => {
      wrapper = mount(AssetMap)
      await wrapper.vm.$nextTick()

      expect(wrapper.find('.map-container').exists()).toBe(true)
      expect(wrapper.find('.connection-status').exists()).toBe(true)
      expect(wrapper.find('.map-controls').exists()).toBe(true)
    })

    it('should display connection status correctly', async () => {
      wrapper = mount(AssetMap)
      await wrapper.vm.$nextTick()

      const connectionStatus = wrapper.find('.connection-status')
      expect(connectionStatus.exists()).toBe(true)
      expect(connectionStatus.text()).toContain('Connecting')
    })

    it('should show map controls', async () => {
      wrapper = mount(AssetMap)
      await wrapper.vm.$nextTick()

      const controls = wrapper.findAll('.control-btn')
      expect(controls.length).toBeGreaterThan(0)
      
      // Should have center, fit, trail toggle, and clear trail buttons
      expect(controls.length).toBe(4)
    })

    it('should handle location updates and display status panel', async () => {
      wrapper = mount(AssetMap)
      await wrapper.vm.$nextTick()

      // Simulate location update
      const mockPosition = {
        lat: 40.7128,
        lng: -74.0060,
        timestamp: Date.now(),
        speed: 25.5,
        heading: 45,
        accuracy: 5
      }

      // Trigger location update through the composable
      wrapper.vm.currentPosition = mockPosition
      wrapper.vm.isMoving = true
      wrapper.vm.currentSpeed = 25.5
      wrapper.vm.gpsQuality = 'excellent'
      
      await wrapper.vm.$nextTick()

      const statusPanel = wrapper.find('.status-panel')
      expect(statusPanel.exists()).toBe(true)
      expect(statusPanel.classes()).toContain('moving')
    })

    it('should display arrival notification', async () => {
      wrapper = mount(AssetMap)
      await wrapper.vm.$nextTick()

      // Simulate arrival
      wrapper.vm.arrivalStatus = {
        arrived: true,
        destination: 'Test Destination',
        arrivalTime: new Date().toISOString(),
        finalDistance: 25,
        journeyDuration: 1800
      }

      await wrapper.vm.$nextTick()

      const arrivalNotification = wrapper.find('.arrival-notification')
      expect(arrivalNotification.exists()).toBe(true)
      expect(arrivalNotification.text()).toContain('Arrived!')
      expect(arrivalNotification.text()).toContain('Test Destination')
    })

    it('should handle control button interactions', async () => {
      wrapper = mount(AssetMap)
      await wrapper.vm.$nextTick()

      // Mock having location
      wrapper.vm.currentPosition = { lat: 40.7128, lng: -74.0060 }
      wrapper.vm.hasLocation = true
      
      await wrapper.vm.$nextTick()

      const centerButton = wrapper.find('.control-btn[title="Center on current position"]')
      expect(centerButton.exists()).toBe(true)
      expect(centerButton.attributes('disabled')).toBeUndefined()

      // Test trail toggle
      const trailButton = wrapper.find('.control-btn[title="Toggle movement trail"]')
      expect(trailButton.exists()).toBe(true)
      
      await trailButton.trigger('click')
      // Should toggle trail visibility
    })
  })

  describe('Map Tracking Composable Integration', () => {
    beforeEach(() => {
      mapTracking = useMapTracking()
    })

    it('should initialize with default state', () => {
      expect(mapTracking.currentPosition.value).toBeNull()
      expect(mapTracking.destination.value).toBeNull()
      expect(mapTracking.isConnected.value).toBe(false)
      expect(mapTracking.isMoving.value).toBe(false)
      expect(mapTracking.movementTrail.value).toEqual([])
    })

    it('should connect to Ably successfully', async () => {
      await mapTracking.connectToAbly()
      
      expect(mockAbly.channels.get).toHaveBeenCalledWith('asset-tracking:locations')
      expect(mockChannel.subscribe).toHaveBeenCalledWith('location-update', expect.any(Function))
      expect(mockChannel.subscribe).toHaveBeenCalledWith('route-update', expect.any(Function))
      expect(mockChannel.subscribe).toHaveBeenCalledWith('arrival-notification', expect.any(Function))
    })

    it('should handle location updates correctly', () => {
      const mockLocationData = {
        latitude: 40.7128,
        longitude: -74.0060,
        timestamp: Date.now(),
        speedKmh: 25.5,
        heading: 45,
        isMoving: true,
        gpsQuality: 'excellent',
        destinationCoords: {
          latitude: 40.7589,
          longitude: -73.9851
        },
        destination: 'Times Square'
      }

      // Simulate receiving location update
      mapTracking.handleLocationUpdate({ data: mockLocationData })

      expect(mapTracking.currentPosition.value).toEqual({
        lat: mockLocationData.latitude,
        lng: mockLocationData.longitude,
        timestamp: mockLocationData.timestamp,
        speed: mockLocationData.speedKmh,
        heading: mockLocationData.heading,
        accuracy: 0
      })

      expect(mapTracking.isMoving.value).toBe(true)
      expect(mapTracking.currentSpeed.value).toBe(25.5)
      expect(mapTracking.gpsQuality.value).toBe('excellent')
    })

    it('should handle route updates', () => {
      const mockRouteData = {
        routeInfo: {
          distance: '5.2 km',
          duration: '12 mins',
          distanceValue: 5200,
          durationValue: 720,
          hasRoute: true
        }
      }

      mapTracking.handleRouteUpdate({ data: mockRouteData })

      expect(mapTracking.routeInfo.value).toEqual(mockRouteData.routeInfo)
    })

    it('should handle arrival notifications', () => {
      const mockArrivalData = {
        timestamp: Date.now(),
        destination: 'Test Destination',
        finalDistance: 15,
        journeyDuration: 1800,
        arrivalTime: new Date().toISOString()
      }

      mapTracking.handleArrivalNotification({ data: mockArrivalData })

      expect(mapTracking.arrivalStatus.value).toEqual({
        arrived: true,
        timestamp: mockArrivalData.timestamp,
        destination: mockArrivalData.destination,
        finalDistance: mockArrivalData.finalDistance,
        journeyDuration: mockArrivalData.journeyDuration,
        arrivalTime: mockArrivalData.arrivalTime
      })

      expect(mapTracking.route.value).toEqual([])
    })

    it('should calculate distances correctly', () => {
      const pos1 = { lat: 40.7128, lng: -74.0060 } // NYC
      const pos2 = { lat: 40.7589, lng: -73.9851 } // Times Square

      const distance = mapTracking.calculateDistance(pos1, pos2)
      
      expect(distance).toBeGreaterThan(0)
      expect(distance).toBeLessThan(10000) // Should be less than 10km
    })

    it('should calculate bearing correctly', () => {
      const pos1 = { lat: 40.7128, lng: -74.0060 }
      const pos2 = { lat: 40.7589, lng: -73.9851 }

      const bearing = mapTracking.calculateBearing(pos1, pos2)
      
      expect(bearing).toBeGreaterThanOrEqual(0)
      expect(bearing).toBeLessThan(360)
    })

    it('should manage movement trail correctly', () => {
      const positions = [
        { lat: 40.7128, lng: -74.0060, timestamp: Date.now(), speed: 20 },
        { lat: 40.7130, lng: -74.0058, timestamp: Date.now() + 1000, speed: 25 },
        { lat: 40.7132, lng: -74.0056, timestamp: Date.now() + 2000, speed: 30 }
      ]

      positions.forEach(pos => {
        mapTracking.addToTrail(pos)
      })

      expect(mapTracking.movementTrail.value.length).toBe(3)
      expect(mapTracking.hasTrail.value).toBe(true)

      const trailStats = mapTracking.getTrailStats()
      expect(trailStats).toBeDefined()
      expect(trailStats.points).toBe(3)
      expect(trailStats.averageSpeed).toBeDefined()
    })

    it('should set and clear destinations', () => {
      const destination = {
        lat: 40.7589,
        lng: -73.9851,
        address: 'Times Square, New York'
      }

      mapTracking.setDestination(destination)
      
      expect(mapTracking.destination.value).toEqual(destination)
      expect(mapTracking.hasDestination.value).toBe(true)

      mapTracking.setDestination(null)
      
      expect(mapTracking.destination.value).toBeNull()
      expect(mapTracking.hasDestination.value).toBe(false)
    })

    it('should animate position updates smoothly', async () => {
      const startPosition = { lat: 40.7128, lng: -74.0060 }
      const endPosition = { lat: 40.7130, lng: -74.0058 }

      mapTracking.setPosition(startPosition)
      expect(mapTracking.currentPosition.value).toEqual(expect.objectContaining(startPosition))

      // Test animation
      mapTracking.animateToPosition(endPosition, 100)
      expect(mapTracking.isAnimating.value).toBe(true)

      // Wait for animation to complete
      await new Promise(resolve => setTimeout(resolve, 150))
      
      expect(mapTracking.isAnimating.value).toBe(false)
      expect(mapTracking.currentPosition.value).toEqual(expect.objectContaining(endPosition))
    })
  })

  describe('End-to-End Subscriber Flow', () => {
    it('should handle complete tracking session', async () => {
      wrapper = mount(AssetMap)
      await wrapper.vm.$nextTick()

      // 1. Initial connection
      expect(wrapper.vm.isConnected).toBe(false)
      
      // 2. Simulate connection
      wrapper.vm.isConnected = true
      await wrapper.vm.$nextTick()
      
      const connectionStatus = wrapper.find('.connection-status')
      expect(connectionStatus.classes()).toContain('connected')

      // 3. Receive location update
      const locationUpdate = {
        latitude: 40.7128,
        longitude: -74.0060,
        timestamp: Date.now(),
        speedKmh: 25,
        heading: 90,
        isMoving: true,
        gpsQuality: 'good',
        destinationCoords: {
          latitude: 40.7589,
          longitude: -73.9851
        },
        destination: 'Times Square'
      }

      wrapper.vm.handleLocationUpdate({ data: locationUpdate })
      await wrapper.vm.$nextTick()

      // Should show status panel
      expect(wrapper.find('.status-panel').exists()).toBe(true)
      expect(wrapper.find('.movement-indicator.moving').exists()).toBe(true)

      // 4. Receive route update
      const routeUpdate = {
        routeInfo: {
          distance: '4.2 km',
          duration: '8 mins',
          hasRoute: true
        }
      }

      wrapper.vm.handleRouteUpdate({ data: routeUpdate })
      await wrapper.vm.$nextTick()

      // Should display route information
      expect(wrapper.text()).toContain('4.2 km')
      expect(wrapper.text()).toContain('8 mins')

      // 5. Simulate arrival
      const arrivalNotification = {
        timestamp: Date.now(),
        destination: 'Times Square',
        arrivalTime: new Date().toISOString()
      }

      wrapper.vm.handleArrivalNotification({ data: arrivalNotification })
      await wrapper.vm.$nextTick()

      // Should show arrival notification
      expect(wrapper.find('.arrival-notification').exists()).toBe(true)
      expect(wrapper.text()).toContain('Arrived!')
    })

    it('should handle connection errors gracefully', async () => {
      wrapper = mount(AssetMap)
      await wrapper.vm.$nextTick()

      // Simulate connection error
      wrapper.vm.connectionError = 'Network connection failed'
      wrapper.vm.isConnected = false
      
      await wrapper.vm.$nextTick()

      const errorDisplay = wrapper.find('.error')
      expect(errorDisplay.exists()).toBe(true)
      expect(errorDisplay.text()).toContain('Network connection failed')

      const reconnectButton = wrapper.find('.reconnect-btn')
      expect(reconnectButton.exists()).toBe(true)
    })

    it('should update trail and statistics correctly', async () => {
      wrapper = mount(AssetMap)
      await wrapper.vm.$nextTick()

      // Add multiple position updates to build trail
      const positions = [
        { lat: 40.7128, lng: -74.0060, speed: 20 },
        { lat: 40.7130, lng: -74.0058, speed: 25 },
        { lat: 40.7132, lng: -74.0056, speed: 30 },
        { lat: 40.7134, lng: -74.0054, speed: 28 }
      ]

      positions.forEach((pos, index) => {
        wrapper.vm.addToTrail({
          ...pos,
          timestamp: Date.now() + (index * 1000)
        })
      })

      await wrapper.vm.$nextTick()

      // Should show trail statistics
      const trailStats = wrapper.vm.getTrailStats()
      expect(trailStats).toBeDefined()
      expect(trailStats.points).toBe(4)
      expect(parseFloat(trailStats.averageSpeed)).toBeCloseTo(25.75, 1)
    })

    it('should handle map interactions correctly', async () => {
      wrapper = mount(AssetMap)
      await wrapper.vm.$nextTick()

      // Set up position and destination
      wrapper.vm.currentPosition = { lat: 40.7128, lng: -74.0060 }
      wrapper.vm.destination = { lat: 40.7589, lng: -73.9851, address: 'Times Square' }
      
      await wrapper.vm.$nextTick()

      // Test center on position
      const centerButton = wrapper.find('.control-btn[title="Center on current position"]')
      await centerButton.trigger('click')
      
      // Should call map centering function
      expect(mockMap.setView).toHaveBeenCalled()

      // Test auto-fit
      const fitButton = wrapper.find('.control-btn[title="Fit to view"]')
      await fitButton.trigger('click')
      
      // Should call map fitting function
      expect(mockMap.fitBounds).toHaveBeenCalled()
    })
  })

  describe('Performance and Optimization', () => {
    it('should handle rapid location updates efficiently', async () => {
      const mapTracking = useMapTracking()
      const startTime = Date.now()

      // Simulate 100 rapid updates
      for (let i = 0; i < 100; i++) {
        const locationData = {
          latitude: 40.7128 + (i * 0.0001),
          longitude: -74.0060 + (i * 0.0001),
          timestamp: Date.now() + (i * 100),
          speedKmh: 25 + (i % 10),
          isMoving: true
        }

        mapTracking.handleLocationUpdate({ data: locationData })
      }

      const endTime = Date.now()
      const processingTime = endTime - startTime

      // Should process updates quickly (less than 1 second for 100 updates)
      expect(processingTime).toBeLessThan(1000)
      expect(mapTracking.currentPosition.value).toBeDefined()
    })

    it('should limit trail length for performance', () => {
      const mapTracking = useMapTracking()
      mapTracking.maxTrailLength.value = 10

      // Add more points than the limit
      for (let i = 0; i < 20; i++) {
        mapTracking.addToTrail({
          lat: 40.7128 + (i * 0.001),
          lng: -74.0060 + (i * 0.001),
          timestamp: Date.now() + (i * 1000),
          speed: 25
        })
      }

      // Should not exceed max trail length
      expect(mapTracking.movementTrail.value.length).toBeLessThanOrEqual(10)
    })

    it('should optimize animation duration based on distance and speed', () => {
      const mapTracking = useMapTracking()
      
      const startPos = { lat: 40.7128, lng: -74.0060 }
      const nearEndPos = { lat: 40.7129, lng: -74.0061 } // Very close
      const farEndPos = { lat: 40.7200, lng: -74.0100 }  // Further away

      mapTracking.currentSpeed.value = 50 // 50 km/h

      const shortDuration = mapTracking.calculateAnimationDuration(startPos, nearEndPos)
      const longDuration = mapTracking.calculateAnimationDuration(startPos, farEndPos)

      expect(shortDuration).toBeLessThan(longDuration)
      expect(shortDuration).toBeGreaterThan(0)
      expect(longDuration).toBeLessThan(5000) // Should have reasonable upper limit
    })
  })

  describe('Error Handling and Recovery', () => {
    it('should handle Ably connection failures', async () => {
      // Mock Ably to throw error
      const mockAblyError = new Error('Connection failed')
      vi.mocked(mockAbly.channels.get).mockImplementation(() => {
        throw mockAblyError
      })

      const mapTracking = useMapTracking()
      await mapTracking.connectToAbly()

      expect(mapTracking.connectionError.value).toBe('Connection failed')
      expect(mapTracking.isConnected.value).toBe(false)
    })

    it('should handle malformed location data', () => {
      const mapTracking = useMapTracking()
      
      // Test with missing required fields
      const malformedData = {
        latitude: 40.7128,
        // longitude missing
        timestamp: Date.now()
      }

      // Should not crash
      expect(() => {
        mapTracking.handleLocationUpdate({ data: malformedData })
      }).not.toThrow()

      // Position should not be updated with invalid data
      expect(mapTracking.currentPosition.value).toBeNull()
    })

    it('should recover from animation errors', () => {
      const mapTracking = useMapTracking()
      
      // Set invalid animation target
      const invalidPosition = { lat: NaN, lng: NaN }
      
      expect(() => {
        mapTracking.animateToPosition(invalidPosition)
      }).not.toThrow()

      expect(mapTracking.isAnimating.value).toBe(false)
    })
  })
})