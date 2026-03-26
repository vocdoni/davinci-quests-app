import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { type EnvSource, parseAppConfig } from './config'
import './index.css'
import { ConfigErrorView } from './components/ConfigErrorView'
import { AppProviders } from './providers/AppProviders'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element not found.')
}

const appRoot = createRoot(rootElement)

try {
  const config = parseAppConfig(import.meta.env as unknown as EnvSource)

  appRoot.render(
    <StrictMode>
      <AppProviders config={config}>
        <App config={config} />
      </AppProviders>
    </StrictMode>,
  )
} catch (error) {
  const message =
    error instanceof Error ? error.message : 'Unknown configuration error.'

  appRoot.render(
    <StrictMode>
      <ConfigErrorView message={message} />
    </StrictMode>,
  )
}
