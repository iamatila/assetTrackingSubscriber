# Nuxt Minimal Starter

Look at the [Nuxt documentation](https://nuxt.com/docs/getting-started/introduction) to learn more.

# Asset Tracking Subscriber

This is the Nuxt.js application for subscribing to asset location data.

## Environment Variables

Create a `.env` file in the root of this project with the following variable:

```
ABLY_KEY=your_ably_api_key_here
```

## Setup

1. Create an Ably account and get your API key from the [Ably dashboard](https://ably.com/accounts)
2. Add your key to the `.env` file
3. Run `npm install` to install dependencies
4. Run `npm run dev` to start the development server

## Features

- Real-time location tracking visualization
- Map display with current asset position
- Destination marker display when set by the publisher
- Status updates and connection monitoring

## Setup

Make sure to install dependencies:

```bash
# npm
npm install

# pnpm
pnpm install

# yarn
yarn install

# bun
bun install
```

## Development Server

Start the development server on `http://localhost:3000`:

```bash
# npm
npm run dev

# pnpm
pnpm dev

# yarn
yarn dev

# bun
bun run dev
```

## Production

Build the application for production:

```bash
# npm
npm run build

# pnpm
pnpm build

# yarn
yarn build

# bun
bun run build
```

Locally preview production build:

```bash
# npm
npm run preview

# pnpm
pnpm preview

# yarn
yarn preview

# bun
bun run preview
```

Check out the [deployment documentation](https://nuxt.com/docs/getting-started/deployment) for more information.
"# assetTrackingSubscriber" 
