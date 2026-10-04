import type { CanalData, TemplateMaterialRef } from './project'

/** Missing dimensions stay null: an unknown member is never a zero-volume member. */
export type SlrbPresence = 'unknown' | 'none' | 'provided'
export type SlrbGrade = 'unknown' | 'M10' | 'M15' | 'M20' | 'M25' | 'M30'
export interface SlrbSolid {
  shape: 'rectangle' | 'stadium' | 'trapezoid'
  length: number | null
  width: number | null
  bottomWidth: number | null
  height: number | null
  grade: SlrbGrade
}
export interface SlrbSpan {
  id: string
  clearSpan: number | null
  panelLength: number | null
  thickness: number | null
  grade: SlrbGrade
}
export interface SlrbSupport {
  id: string
  kind: 'abutment' | 'pier'
  body: SlrbSolid
  capPresence: SlrbPresence
  cap: SlrbSolid
  bearingStack: number | null
  footingType: 'unknown' | 'spread' | 'other'
  footing: SlrbSolid
  footingLevelMode: 'absolute' | 'below-bed'
  footingTopRl: number | null
  footingBedOffset: number | null
  beddingPresence: SlrbPresence
  bedding: SlrbSolid
  excavationPresence: SlrbPresence
  excavation: SlrbSolid
}
export interface SlrbApproach {
  id: string
  presence: SlrbPresence
  slab: SlrbSolid
  backingPresence: SlrbPresence
  backingDepth: number | null
}
export interface SlrbWall {
  id: string
  label: string
  length: number | null
  startHeight: number | null
  endHeight: number | null
  topThickness: number | null
  bottomThickness: number | null
  grade: SlrbGrade
  footingPresence: SlrbPresence
  footing: SlrbSolid
}
export type SlrbWorkKind = 'kerb' | 'rail-concrete' | 'joint' | 'drain' | 'fill' | 'gravel' | 'formwork'
export interface SlrbWork {
  id: string
  label: string
  kind: SlrbWorkKind
  presence: SlrbPresence
  length: number | null
  width: number | null
  depth: number | null
  count: number | null
  quantity: number | null
  grade: SlrbGrade
  distinctScope: boolean
  reference: string
}
export interface SlrbBarGroup {
  id: string
  memberId: string
  mark: string
  diameterMm: number | null
  count: number | null
  cutLengthM: number | null
  shape: string
  reference: string
  reviewed: boolean
}
export interface SlrbMaterial extends TemplateMaterialRef {
  projectDataId?: string
  reviewed: boolean
  includesFormwork: boolean
  includesBackfill: boolean
  scopeNote: string
}
export interface SlrbParentSnapshot {
  parentId: string
  parentName: string
  revision: string
  chainage: number | null
  bedRl: number | null
  fsl: number | null
  bankRl: number | null
}
export interface SlrbData {
  schemaVersion: 1
  packageVersion: string
  purpose: 'drawing' | 'brief' | 'unknown'
  reference: string
  sourceStatus: 'reviewed' | 'draft' | 'unknown'
  loadingBasis: string
  datum: string
  estimateBasis: 'unknown' | 'irrigation-ssr' | 'approved-other'
  structuralReview: string
  crossingAngle: number | null
  slabWidth: number | null
  carriagewayWidth: number | null
  spans: SlrbSpan[]
  supports: SlrbSupport[]
  roadLevelMode: 'absolute' | 'above-bank'
  roadRl: number | null
  roadBankOffset: number | null
  chainageOverride: number | null
  crossingConfirmationKey?: string
  acceptedParentId?: string | null
  lastResolvedParent?: SlrbParentSnapshot
  wearingPresence: SlrbPresence
  wearingThickness: number | null
  wearingGrade: SlrbGrade
  wearingWidth: number | null
  approaches: SlrbApproach[]
  wallsPresence: SlrbPresence
  walls: SlrbWall[]
  fittingsPresence: SlrbPresence
  works: SlrbWork[]
  reinforcementPresence: SlrbPresence
  bars: SlrbBarGroup[]
  materials: Record<string, SlrbMaterial | undefined>
  materialItems: Array<{ key: string; itemNodeId: string }>
  sourceConflicts: Array<{ id: string; message: string; resolved: boolean; resolution: string }>
}
export interface SlrbContext extends SlrbParentSnapshot {
  mode: 'manual' | 'canal'
  canal?: CanalData
  locationKey: string
  needsParentReview: boolean
  candidates: number[]
  issue?: string
}
export interface SlrbMeasurement {
  id: string
  memberId: string
  label: string
  mappingKey: string
  unit: 'CUM' | 'KG' | 'SQM' | 'RM' | 'NO'
  quantity: number | null
  expression: string
  chapter: number
  issue?: string
  material?: SlrbMaterial
  billable: boolean
}
export interface SlrbOutputModel {
  version: string
  context: SlrbContext
  roadRl: number | null
  heights: Record<string, number | null>
  measurements: SlrbMeasurement[]
  issues: Array<{ chapter: number; memberId: string; message: string }>
  measurementsReady: boolean
  mappingsReady: boolean
  designStatus: 'Review required'
}
