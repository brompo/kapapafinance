# Kapapa Finance

A local-only, offline-first personal finance tracker with PIN protection. All data stays on your device.

## Features

- 💰 Track income and expenses
- 📊 View transaction history
- 🔒 PIN lock for privacy
- 📱 PWA - works offline and can be installed on devices
- 🔐 All data stored locally in your browser

## Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions to Netlify, Vercel, GitHub Pages, or traditional hosting.

## Quick Deploy

The easiest way to deploy:

1. Build the app: `npm run build`
2. Go to [netlify.com/drop](https://app.netlify.com/drop)
3. Drag the `dist` folder onto the page
4. Done! Your site is live.

## Tech Stack

- React 18
- Vite
- PWA (Progressive Web App)
- Local Storage for data persistence
