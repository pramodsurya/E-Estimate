import { supabase } from './supabase'
import { normalizeReviewedObservation, searchReviewedSorItems, sorRecord } from './sorReviewed'
import type { ReviewedSorObservation, ReviewedSorProjectZone } from '../types/sorReviewed'

export interface SorNavigationNode {
  node_id: string
  parent_node_id: string | null
  sor_year: string
  catalogue_code: string
  table_name: string
  node_type: 'table' | 'section' | 'subsection' | 'family' | 'specification_group'
  printed_reference: string
  display_title: string
  source_order: number
  available_variant_count: number
  has_children: boolean
  source_evidence: Record<string, unknown>
}
export interface SorNavigationVariant {
  node_type: 'variant'
  parent_node_id: string
  source_order: number
  observation: ReviewedSorObservation
}
export type SorNavigationEntry = SorNavigationNode | SorNavigationVariant
export interface SorNavigationLocation {
  occurrence_id: string
  sor_year: string
  parent_node_id: string
  source_order: number
  path: SorNavigationNode[]
}
export interface SorNavigationPage {
  release_id: string
  entries: SorNavigationEntry[]
  offset: number
  total_count: number
  has_more: boolean
}

async function navigationRpc(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
  const request = supabase.rpc(name, args)
  const { data, error } = await (signal ? request.abortSignal(signal) : request)
  if (error) throw new Error(error.message)
  return data
}

export async function browseReviewedSor(year: string, parent: string | null, offset = 0, anchor: string | null = null, signal?: AbortSignal, zone?: ReviewedSorProjectZone): Promise<SorNavigationPage> {
  const data = sorRecord(await navigationRpc('browse_sor_reviewed_children', {
    p_sor_year: year, p_parent_node_id: parent, p_offset: offset, p_limit: 50, p_anchor_occurrence_id: anchor, ...(zone ? { p_sor_zone: zone } : {})
  }, signal))
  if (!Array.isArray(data.entries)) throw new Error('The SOR book index is unavailable. Retry after publication.')
  return { release_id: String(data.release_id), offset: Number(data.offset), total_count: Number(data.total_count), has_more: data.has_more === true,
    entries: data.entries.map(value => {
      const entry = sorRecord(value)
      return entry.node_type === 'variant' ? { node_type: 'variant', parent_node_id: String(entry.parent_node_id), source_order: Number(entry.source_order),
        observation: normalizeReviewedObservation(entry.observation) } : entry as unknown as SorNavigationNode
    }) }
}

export async function reviewedSorLocations(ids: string[], signal?: AbortSignal): Promise<SorNavigationLocation[]> {
  if (!ids.length) return []
  const result = await navigationRpc('get_sor_reviewed_locations', { p_occurrence_ids: ids }, signal)
  return (Array.isArray(result) ? result : []) as SorNavigationLocation[]
}

/** Fetch one small edition-specific table node; never load a catalogue's observations. */
export async function reviewedSorTable(year: string, catalogue: string, signal?: AbortSignal): Promise<SorNavigationNode> {
  const request = supabase.from('sor_reviewed_navigation_node').select('*').eq('sor_year', year).eq('catalogue_code', catalogue).eq('node_type', 'table')
  const { data, error } = await (signal ? request.abortSignal(signal) : request).single()
  if (error || !data) throw new Error(error?.message || 'This schedule is unavailable in the selected edition.')
  return data as SorNavigationNode
}

export async function searchReviewedSorWithLocations(year: string, query: string, catalogue: string | null, offset = 0, signal?: AbortSignal, zone?: ReviewedSorProjectZone): Promise<{
  rows: Array<{ observation: ReviewedSorObservation; location?: SorNavigationLocation }>; hasMore: boolean
}> {
  const page = await searchReviewedSorItems(year, query, catalogue, offset, true, signal, zone)
  const locations = await reviewedSorLocations(page.rows.map(row => row.occurrence_id), signal)
  const byId = new Map(locations.map(location => [location.occurrence_id, location]))
  return { rows: page.rows.map(observation => ({ observation, location: byId.get(observation.occurrence_id) })), hasMore: page.hasMore }
}
