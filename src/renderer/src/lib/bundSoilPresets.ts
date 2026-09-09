import type {
  BundHomogeneousSoilType,
  BundHeartingSlopeProfile,
  BundHeartingSoilType
} from '../types/project'
import type {
  BundSimulationMaterial,
  BundSimulationMaterialRole
} from '../types/bundSimulation'

export interface BundSoilPreset {
  id: BundHomogeneousSoilType | BundHeartingSoilType
  label: string
  summary: string
  homogeneousSuitable?: boolean
  properties: Pick<
    BundSimulationMaterial,
    | 'gamma'
    | 'gammaSat'
    | 'cPrime'
    | 'phiPrime'
    | 'kx'
    | 'ky'
    | 'elasticModulusKpa'
    | 'poissonRatio'
  >
}

/**
 * Screening values for compacted soils, not design values. Strength and density
 * are centred on FHWA NHI-06-088 table 5-15 (after USBR, 1960); permeability
 * is checked against FHWA NHI-05-037 tables 5-56/5-57. Stiffness is deliberately
 * rounded because it is stress-, density- and drainage-dependent.
 */
const PRESETS: Record<string, BundSoilPreset> = {
  'well-graded-gravel': {
    id: 'well-graded-gravel',
    label: 'Well-graded gravel',
    summary: 'Dense, free-draining gravel with a broad particle-size range.',
    properties: { gamma: 19.5, gammaSat: 21, cPrime: 0, phiPrime: 38, kx: 0.01, ky: null, elasticModulusKpa: 60000, poissonRatio: 0.28 }
  },
  'poorly-graded-gravel': {
    id: 'poorly-graded-gravel',
    label: 'Poorly graded gravel',
    summary: 'Free-draining gravel with a narrow or missing range of particle sizes.',
    properties: { gamma: 18.5, gammaSat: 20, cPrime: 0, phiPrime: 37, kx: 0.03, ky: null, elasticModulusKpa: 50000, poissonRatio: 0.28 }
  },
  'gravelly-well-graded-sand': {
    id: 'gravelly-well-graded-sand',
    label: 'Well-graded sand',
    summary: 'Dense, free-draining sand with a broad particle-size range.',
    properties: { gamma: 19.5, gammaSat: 20.5, cPrime: 0, phiPrime: 38, kx: 0.001, ky: null, elasticModulusKpa: 50000, poissonRatio: 0.3 }
  },
  'gravelly-poorly-graded-sand': {
    id: 'gravelly-poorly-graded-sand',
    label: 'Poorly graded sand',
    summary: 'Free-draining sand with a narrow or missing range of particle sizes.',
    properties: { gamma: 18.5, gammaSat: 20, cPrime: 0, phiPrime: 37, kx: 0.003, ky: null, elasticModulusKpa: 40000, poissonRatio: 0.3 }
  },
  'clayey-gravel': {
    id: 'clayey-gravel',
    label: 'Clayey gravel',
    summary: 'Gravel containing enough clay fines to reduce drainage.',
    properties: { gamma: 19.5, gammaSat: 21, cPrime: 5, phiPrime: 31, kx: 1e-7, ky: null, elasticModulusKpa: 40000, poissonRatio: 0.32 }
  },
  'silty-gravel': {
    id: 'silty-gravel',
    label: 'Silty gravel',
    summary: 'Gravel with silt fines; drainage and strength depend strongly on fines content.',
    properties: { gamma: 19.5, gammaSat: 21, cPrime: 0, phiPrime: 34, kx: 3e-7, ky: null, elasticModulusKpa: 40000, poissonRatio: 0.31 }
  },
  'clayey-sand': {
    id: 'clayey-sand',
    label: 'Clayey sand',
    summary: 'Sand with clay fines; suitable for an impervious zone only after verification.',
    properties: { gamma: 19.5, gammaSat: 20.5, cPrime: 11, phiPrime: 31, kx: 1e-8, ky: null, elasticModulusKpa: 30000, poissonRatio: 0.33 }
  },
  'silty-sand': {
    id: 'silty-sand',
    label: 'Silty sand',
    summary: 'Sand with silt fines and moderate drainage.',
    properties: { gamma: 19.5, gammaSat: 20.5, cPrime: 20, phiPrime: 34, kx: 8e-8, ky: null, elasticModulusKpa: 30000, poissonRatio: 0.33 }
  },
  'low-plasticity-clay': {
    id: 'low-plasticity-clay',
    label: 'Low-plasticity clay',
    summary: 'Compactable fine-grained clay with relatively low permeability.',
    properties: { gamma: 18.5, gammaSat: 20, cPrime: 13, phiPrime: 28, kx: 2e-9, ky: null, elasticModulusKpa: 20000, poissonRatio: 0.36 }
  },
  'low-plasticity-silt': {
    id: 'low-plasticity-silt',
    label: 'Low-plasticity silt',
    summary: 'Fine-grained silt whose strength and permeability are moisture-sensitive.',
    properties: { gamma: 18.5, gammaSat: 20, cPrime: 9, phiPrime: 32, kx: 2e-8, ky: null, elasticModulusKpa: 22000, poissonRatio: 0.35 }
  },
  'high-plasticity-clay': {
    id: 'high-plasticity-clay',
    label: 'High-plasticity clay',
    summary: 'Very low-permeability clay with greater shrink-swell and deformation sensitivity.',
    properties: { gamma: 18.5, gammaSat: 19.5, cPrime: 11, phiPrime: 19, kx: 1e-9, ky: null, elasticModulusKpa: 12000, poissonRatio: 0.4 }
  },
  'high-plasticity-silt': {
    id: 'high-plasticity-silt',
    label: 'High-plasticity silt',
    summary: 'Compressible fine-grained silt with low permeability.',
    properties: { gamma: 17.5, gammaSat: 19, cPrime: 20, phiPrime: 25, kx: 5e-9, ky: null, elasticModulusKpa: 15000, poissonRatio: 0.38 }
  }
}

export const CASING_SOIL_OPTIONS: BundSoilPreset[] = [
  PRESETS['well-graded-gravel'],
  PRESETS['poorly-graded-gravel'],
  { ...PRESETS['gravelly-well-graded-sand'], label: 'Well-graded gravelly sand' },
  { ...PRESETS['gravelly-poorly-graded-sand'], label: 'Poorly graded gravelly sand' },
  PRESETS['clayey-gravel'],
  PRESETS['clayey-sand']
]

export const HEARTING_SOIL_OPTIONS: BundSoilPreset[] = [
  PRESETS['clayey-sand'],
  PRESETS['silty-sand'],
  PRESETS['low-plasticity-clay'],
  PRESETS['low-plasticity-silt'],
  PRESETS['high-plasticity-clay'],
  PRESETS['high-plasticity-silt']
]

export const HOMOGENEOUS_SOIL_OPTIONS: BundSoilPreset[] = [
  { ...PRESETS['well-graded-gravel'], homogeneousSuitable: false },
  { ...PRESETS['poorly-graded-gravel'], homogeneousSuitable: false },
  { ...PRESETS['gravelly-well-graded-sand'], homogeneousSuitable: false },
  { ...PRESETS['gravelly-poorly-graded-sand'], homogeneousSuitable: false },
  PRESETS['clayey-gravel'],
  PRESETS['silty-gravel'],
  PRESETS['clayey-sand'],
  PRESETS['silty-sand'],
  PRESETS['low-plasticity-clay'],
  PRESETS['low-plasticity-silt'],
  PRESETS['high-plasticity-clay'],
  PRESETS['high-plasticity-silt']
]

export function soilPreset(id: string | null | undefined): BundSoilPreset | null {
  return id ? PRESETS[id] ?? null : null
}

export function broadCoreAllowed(soil: BundHeartingSoilType | null | undefined): boolean {
  return soil === 'low-plasticity-clay' || soil === 'low-plasticity-silt' || soil === 'high-plasticity-clay' || soil === 'high-plasticity-silt'
}

export function recommendedZonedSlopes(
  soil: BundHeartingSoilType,
  profile: BundHeartingSlopeProfile
): { casing: number; hearting: number } {
  if (profile === 'broad-core' && broadCoreAllowed(soil)) {
    const casing = soil === 'high-plasticity-clay' || soil === 'high-plasticity-silt' ? 3 : 2.5
    return { casing, hearting: 1 }
  }
  return { casing: 2, hearting: 0.5 }
}

export function homogeneousSoilSuitable(
  soil: BundHomogeneousSoilType | null | undefined
): boolean {
  return !(
    soil === 'well-graded-gravel' ||
    soil === 'poorly-graded-gravel' ||
    soil === 'gravelly-well-graded-sand' ||
    soil === 'gravelly-poorly-graded-sand'
  )
}

export function recommendedHomogeneousSlopes(
  soil: BundHomogeneousSoilType
): { upstream: number; downstream: number } | null {
  if (!homogeneousSoilSuitable(soil)) return null
  if (
    soil === 'clayey-gravel' ||
    soil === 'silty-gravel' ||
    soil === 'clayey-sand' ||
    soil === 'silty-sand'
  ) {
    return { upstream: 2.5, downstream: 2 }
  }
  if (soil === 'low-plasticity-clay' || soil === 'low-plasticity-silt') {
    return { upstream: 3, downstream: 2.5 }
  }
  return { upstream: 3.5, downstream: 2.5 }
}

export function applySoilPreset(
  material: BundSimulationMaterial,
  presetId: string,
  role: BundSimulationMaterialRole
): BundSimulationMaterial {
  const preset = soilPreset(presetId)
  if (!preset) return material
  return {
    ...material,
    ...preset.properties,
    role,
    name: preset.label,
    soilPresetId: preset.id,
    propertiesSource: 'preliminary-default',
    rapidD: null,
    rapidPsi: null
  }
}
