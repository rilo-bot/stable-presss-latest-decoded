import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

// Tailwind base/components/utilities. theme.css + brand.css are imported
// inside App.tsx and override the default tokens declared here.
import './index.css'

import App from './App'
import { installAssetFallback } from './lib/assetUrl'

// Images from our S3 bucket that the bucket refuses to serve directly (no public
// read policy) are retried through the API's file proxy — see lib/assetUrl.ts.
installAssetFallback()

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
