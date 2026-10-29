import App from '../../App.jsx'
import { useAuth } from '../../context/AuthContext'

/** Remounts the app when the active venue changes so every module reloads its data cleanly. */
export function WorkspaceKeyedApp() {
  const { membership, workspace } = useAuth()
  const workspaceKey = `${membership?.workspaceId ?? workspace?.id ?? 'none'}`
  return <App key={workspaceKey} />
}
