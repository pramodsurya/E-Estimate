import { columnLabel } from '../excel-output/detailGrid'

export type CalculationExpression =
  | { op: 'ref'; id: string }
  | { op: 'literal'; value: number }
  | { op: 'add'; terms: CalculationExpression[] }
  | { op: 'subtract'; left: CalculationExpression; right: CalculationExpression }
  | { op: 'multiply'; factors: CalculationExpression[] }
  | { op: 'divide'; numerator: CalculationExpression; denominator: CalculationExpression }
  | { op: 'average'; values: CalculationExpression[] }
  | { op: 'sum'; values: CalculationExpression[] }
  | { op: 'round'; value: CalculationExpression; digits: number }

export interface CalculatedValue {
  id: string
  value: number
  expression?: CalculationExpression
}

export interface SemanticCellAddress {
  sheet?: string
  r: number
  c: number
}

export class SemanticCellRegistry {
  private readonly addresses = new Map<string, SemanticCellAddress>()

  register(id: string, address: SemanticCellAddress): void {
    if (!id) throw new Error('Calculation cell ID cannot be empty.')
    this.addresses.set(id, address)
  }

  resolve(id: string): SemanticCellAddress | undefined {
    return this.addresses.get(id)
  }
}

function quoteSheet(name: string): string {
  return `'${name.replace(/'/g, "''")}'`
}

export function semanticAddressFormula(address: SemanticCellAddress): string {
  const cell = `${columnLabel(address.c)}${address.r + 1}`
  return address.sheet ? `${quoteSheet(address.sheet)}!${cell}` : cell
}

/** Compile the backend-owned expression; this function contains no business arithmetic. */
export function compileCalculationExpression(
  expression: CalculationExpression,
  registry: SemanticCellRegistry
): string {
  // Excel accepts at most 255 arguments per function. Bund schedules can have
  // hundreds of intervals, so pack consecutive semantic cell references into
  // ranges before emitting a SUM (and nest SUMs for non-contiguous inputs).
  const aggregateArguments = (nodes: CalculationExpression[]): string[] => {
    const arguments_: string[] = []
    for (let index = 0; index < nodes.length;) {
      const first = nodes[index]
      if (first.op !== 'ref') {
        arguments_.push(compile(first))
        index++
        continue
      }
      const start = registry.resolve(first.id)
      if (!start) throw new Error(`No Excel cell is registered for calculation '${first.id}'.`)
      let end = start
      let next = index + 1
      while (next < nodes.length) {
        const candidate = nodes[next]
        if (candidate.op !== 'ref') break
        const address = registry.resolve(candidate.id)
        if (!address) throw new Error(`No Excel cell is registered for calculation '${candidate.id}'.`)
        if (address.sheet !== start.sheet || address.c !== start.c || address.r !== end.r + 1) break
        end = address
        next++
      }
      arguments_.push(end === start
        ? semanticAddressFormula(start)
        : `${semanticAddressFormula(start)}:${columnLabel(end.c)}${end.r + 1}`)
      index = next
    }
    return arguments_
  }

  const sumArguments = (arguments_: string[]): string => {
    if (arguments_.length === 0) return '0'
    if (arguments_.length <= 255) return `SUM(${arguments_.join(',')})`
    const chunks: string[] = []
    for (let index = 0; index < arguments_.length; index += 255) {
      chunks.push(sumArguments(arguments_.slice(index, index + 255)))
    }
    return sumArguments(chunks)
  }

  const compile = (node: CalculationExpression): string => {
    switch (node.op) {
      case 'ref': {
        const address = registry.resolve(node.id)
        if (!address) throw new Error(`No Excel cell is registered for calculation '${node.id}'.`)
        return semanticAddressFormula(address)
      }
      case 'literal': return String(node.value)
      case 'add': return sumArguments(aggregateArguments(node.terms))
      case 'subtract': return `(${compile(node.left)}-${compile(node.right)})`
      case 'multiply': return node.factors.map((factor) => `(${compile(factor)})`).join('*')
      case 'divide': return `(${compile(node.numerator)})/(${compile(node.denominator)})`
      case 'average': return `AVERAGE(${node.values.map(compile).join(',')})`
      case 'sum': return sumArguments(aggregateArguments(node.values))
      case 'round': return `ROUND(${compile(node.value)},${node.digits})`
    }
  }
  return `=${compile(expression)}`
}

export const calcRef = (id: string): CalculationExpression => ({ op: 'ref', id })
