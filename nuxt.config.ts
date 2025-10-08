// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  runtimeConfig: {
    public: {
      ablyKey: process.env.ABLY_KEY,
      googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY
    }
  },
  app: {
    head: {
      script: [
        {
          src: `https://maps.googleapis.com/maps/api/js?key=${process.env.GOOGLE_MAPS_API_KEY}&libraries=maps,marker&v=beta`,
          async: true,
          defer: true
        }
      ]
    }
  }
})