import { createDefaultWorkspace } from './floorWorkspace'

export function createInitialFloors() {
  const workspace = createDefaultWorkspace()

  return [
    { id: 'main-dining', label: 'Main Dining', workspace: { ...workspace } },
    { id: 'patio', label: 'Patio', workspace: { ...createDefaultWorkspace() } },
    { id: 'rooftop', label: 'Rooftop', workspace: { ...createDefaultWorkspace() } },
  ]
}
