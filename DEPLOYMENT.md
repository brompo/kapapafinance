# Deployment Guide for Kapapa Finance

Your app is now ready to be deployed to the web! The production build is in the `dist` folder.

## Quick Deployment Options

### Option 1: Netlify (Recommended - Easiest)

1. **Drag & Drop Deployment:**
   - Go to [netlify.com/drop](https://app.netlify.com/drop)
   - Drag the `dist` folder onto the page
   - Your site will be live instantly with a random URL (e.g., `random-name-123.netlify.app`)

2. **Connect to Git (for automatic deployments):**
   ```bash
   # Initialize git if not already done
   git init
   git add .
   git commit -m "Initial commit"
   
   # Push to GitHub
   gh repo create kapapafinance --public --source=. --remote=origin --push
   ```
   - Go to [netlify.com](https://www.netlify.com)
   - Click "Add new site" → "Import an existing project"
   - Connect your GitHub repo
   - Netlify will auto-detect settings from `netlify.toml`
   - Deploy!

### Option 2: Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel

# Follow the prompts:
# - Set up and deploy: Y
# - Project name: kapapafinance
# - Directory: ./
# - Deploy: Y
```

Your site will be live at `kapapafinance.vercel.app` (or similar).

### Option 3: GitHub Pages

```bash
# Initialize git if not already done
git init
git add .
git commit -m "Initial commit"

# Create and push to GitHub
gh repo create kapapafinance --public --source=. --remote=origin --push

# Install gh-pages
npm install --save-dev gh-pages

# Add deploy script to package.json (already configured below)
npm run deploy
```

Then enable GitHub Pages in your repo settings (Settings → Pages → Source: gh-pages branch).

**Note:** For GitHub Pages, you'll need to update `vite.config.js` base path:
```javascript
base: '/kapapafinance/', // Use your repo name
```

### Option 4: Self-Hosting (Traditional Web Hosting)

If you have traditional web hosting (cPanel, FTP, etc.):

1. Upload the contents of the `dist` folder to your web server's public directory
2. Make sure your `.htaccess` file (for Apache) includes:
   ```apache
   <IfModule mod_rewrite.c>
     RewriteEngine On
     RewriteBase /
     RewriteRule ^index\.html$ - [L]
     RewriteCond %{REQUEST_FILENAME} !-f
     RewriteCond %{REQUEST_FILENAME} !-d
     RewriteRule . /index.html [L]
   </IfModule>
   ```

### Option 5: Local Preview

To preview the production build locally:

```bash
npm run preview
```

This will start a local server at `http://localhost:4173` (or similar).

## Custom Domain Setup

After deploying to any platform:

1. **Netlify/Vercel:** Go to domain settings in the dashboard and add your custom domain
2. **Update DNS:** Point your domain's DNS records to the platform:
   - Netlify: Add CNAME record pointing to your `.netlify.app` domain
   - Vercel: Add CNAME record pointing to `cname.vercel-dns.com`

## Important Notes

- **This is a local-only app:** All data is stored in the browser's local storage. No backend needed!
- **PWA Features:** The app works offline once loaded and can be installed on devices
- **Security:** The PIN lock is client-side only. For production use with sensitive data, consider additional security measures
- **HTTPS Required:** PWA features (service workers, installation) require HTTPS, which all modern hosting platforms provide

## Rebuilding

If you make changes to the code:

```bash
npm run build
```

Then redeploy using your chosen method above.
