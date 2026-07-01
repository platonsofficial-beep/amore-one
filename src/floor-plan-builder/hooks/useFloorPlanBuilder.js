import { useContext } from 'react'
import { FloorPlanBuilderContext } from '../context/floorPlanBuilderContext'

export function useFloorPlanBuilder() {
  const context = useContext(FloorPlanBuilderContext)
  if (!context) {
    throw new Error('useFloorPlanBuilder must be used within FloorPlanBuilderProvider')
  }
  return context
}
