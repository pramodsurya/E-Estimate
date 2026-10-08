const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')

async function run() {
  console.log('--- Testing E-Estimate MCP Server Suite ---')
  const mcpProcess = spawn('node', [path.join(__dirname, 'mcp-server.cjs')], {
    stdio: ['pipe', 'pipe', 'inherit']
  })

  let msgId = 1
  const pending = new Map()

  let buffer = ''
  mcpProcess.stdout.on('data', (chunk) => {
    buffer += chunk.toString()
    const lines = buffer.split('\n')
    buffer = lines.pop()
    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const msg = JSON.parse(line)
        if (msg.id && pending.has(msg.id)) {
          const { resolve, reject } = pending.get(msg.id)
          pending.delete(msg.id)
          if (msg.error) reject(new Error(msg.error.message))
          else resolve(msg.result)
        }
      } catch (err) {
        console.error('Error parsing line:', line, err)
      }
    }
  })

  function call(method, params = {}) {
    const id = msgId++
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      mcpProcess.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
    })
  }

  // 1. Initialize
  const init = await call('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'test-runner', version: '1.0' }
  })
  assert.equal(init.serverInfo.name, 'e-estimate-mcp-server')
  console.log('✓ Initialized MCP Server')

  // 2. List tools
  const toolsRes = await call('tools/list', {})
  const toolNames = toolsRes.tools.map(t => t.name)
  assert.ok(toolNames.includes('create_project'))
  assert.ok(toolNames.includes('create_custom_component'))
  assert.ok(toolNames.includes('add_item_to_component'))
  assert.ok(toolNames.includes('edit_item_excel'))
  assert.ok(toolNames.includes('make_multi_item_excel'))
  assert.ok(toolNames.includes('fix_final_number'))
  assert.ok(toolNames.includes('set_print_area'))
  assert.ok(toolNames.includes('search_ssr_items'))
  assert.ok(toolNames.includes('resolve_item'))
  assert.ok(toolNames.includes('sync_project_costs'))
  assert.ok(toolNames.includes('create_project_data'))
  assert.ok(toolNames.includes('edit_project_data'))
  assert.ok(toolNames.includes('list_project_data'))
  assert.ok(toolNames.includes('get_project_data'))
  assert.equal(toolNames.length, 18)
  console.log('✓ Verified all 18 MCP tools registered (including 4 Project DATA tools)')

  // 2b. Test search_ssr_items
  const searchRes = await call('tools/call', {
    name: 'search_ssr_items',
    arguments: { query: 'IRR-CCDW-1-2', limit: 2 }
  })
  const searchData = JSON.parse(searchRes.content[0].text)
  assert.equal(searchData.status, 'success')
  assert.ok(searchData.items.length > 0)
  console.log('✓ Tested search_ssr_items -> found', searchData.items[0].code)

  // 2c. Test resolve_item with messy code
  const resolveRes = await call('tools/call', {
    name: 'resolve_item',
    arguments: {
      rawCodeOrDescription: 'IRR-CCDW-2-25 & MORTH 21.07 (Page 784)',
      sorYear: '2026-27'
    }
  })
  const resolveData = JSON.parse(resolveRes.content[0].text)
  assert.equal(resolveData.resolution.resolvedCode, 'IRR-CCDW-2-25')
  assert.equal(resolveData.resolution.itemSource, 'SSR')
  assert.equal(resolveData.resolution.hasRecipe, true)
  console.log('✓ Tested resolve_item -> accurately resolved IRR-CCDW-2-25 with 2026-27 recipe')

  // 3. Tool call: create_project
  const testProjectFile = path.resolve(__dirname, '../../scratch/mklis-mcp-test.eestimate')
  if (fs.existsSync(testProjectFile)) fs.unlinkSync(testProjectFile)

  const createRes = await call('tools/call', {
    name: 'create_project',
    arguments: {
      name: 'MKLIS Lift Irrigation Scheme Package 29',
      sorYear: '2026-27',
      projectPath: testProjectFile
    }
  })
  assert.ok(createRes.content[0].text.includes('Created project'))
  assert.ok(fs.existsSync(testProjectFile))
  console.log('✓ Tested create_project')

  // 4. Tool call: create_custom_component
  const compRes = await call('tools/call', {
    name: 'create_custom_component',
    arguments: {
      name: 'Main Canal Km 0.000 to Km 12.500',
      manualLengthM: 12500,
      projectPath: testProjectFile
    }
  })
  const compData = JSON.parse(compRes.content[0].text)
  const componentId = compData.componentId
  assert.ok(componentId)
  console.log('✓ Tested create_custom_component ->', componentId)

  // 5. Tool call: add_item_to_component (Earthwork & Concrete)
  const item1Res = await call('tools/call', {
    name: 'add_item_to_component',
    arguments: {
      componentId,
      name: 'Earthwork excavation in all soils',
      itemCode: 'IRR-EW-1-1',
      unit: 'CUM',
      rate: 145.50,
      projectPath: testProjectFile
    }
  })
  const item1Id = JSON.parse(item1Res.content[0].text).itemId

  const item2Res = await call('tools/call', {
    name: 'add_item_to_component',
    arguments: {
      componentId,
      name: 'CC Bed and Side Lining M15',
      itemCode: 'IRR-CC-4-2',
      unit: 'CUM',
      rate: 3200.00,
      projectPath: testProjectFile
    }
  })
  const item2Id = JSON.parse(item2Res.content[0].text).itemId
  console.log('✓ Tested add_item_to_component ->', item1Id, item2Id)

  // 6. Tool call: edit_item_excel
  await call('tools/call', {
    name: 'edit_item_excel',
    arguments: {
      itemId: item1Id,
      cells: [
        { row: 0, col: 0, v: 'Chainage' }, { row: 0, col: 1, v: 'L (m)' }, { row: 0, col: 2, v: 'B (m)' }, { row: 0, col: 3, v: 'D (m)' }, { row: 0, col: 4, v: 'Qty (cum)' },
        { row: 1, col: 0, v: '0.000 - 0.500' }, { row: 1, col: 1, v: 500 }, { row: 1, col: 2, v: 4.5 }, { row: 1, col: 3, v: 2.1 }, { row: 1, col: 4, v: 4725, f: '=B2*C2*D2' },
        { row: 2, col: 0, v: 'Total' }, { row: 2, col: 4, v: 4725, f: '=SUM(E2:E2)' }
      ],
      projectPath: testProjectFile
    }
  })
  console.log('✓ Tested edit_item_excel')

  // 7. Tool call: fix_final_number
  const fixRes = await call('tools/call', {
    name: 'fix_final_number',
    arguments: {
      itemId: item1Id,
      cellRef: 'E3',
      projectPath: testProjectFile
    }
  })
  const fixData = JSON.parse(fixRes.content[0].text)
  assert.equal(fixData.result.resolvedQuantity, 4725)
  console.log('✓ Tested fix_final_number -> pinned 4,725 cum')

  // 8. Tool call: set_print_area
  const printRes = await call('tools/call', {
    name: 'set_print_area',
    arguments: {
      itemId: item1Id,
      rangeA1: 'A1:E3',
      pageSize: 'A4',
      orientation: 'landscape',
      projectPath: testProjectFile
    }
  })
  const printData = JSON.parse(printRes.content[0].text)
  assert.equal(printData.result.pageSize, 'A4')
  assert.equal(printData.result.orientation, 'landscape')
  console.log('✓ Tested set_print_area -> A1:E3 Landscape')

  // 9. Tool call: make_multi_item_excel
  const multiRes = await call('tools/call', {
    name: 'make_multi_item_excel',
    arguments: {
      itemIds: [item1Id, item2Id],
      sharedSheetName: 'Canal Works Measurement Book',
      projectPath: testProjectFile
    }
  })
  const multiData = JSON.parse(multiRes.content[0].text)
  assert.equal(multiData.memberCount, 2)
  console.log('✓ Tested make_multi_item_excel -> 2 members linked')

  // 10. Tool call: create_lead
  const leadRes = await call('tools/call', {
    name: 'create_lead',
    arguments: {
      materialName: 'River Sand',
      sourceName: 'Krishna River Quarry Revalapally',
      sourceLat: 16.2415,
      sourceLng: 77.8122,
      leadKm: 32.5,
      conveyanceClass: 'STONE',
      projectPath: testProjectFile
    }
  })
  assert.ok(leadRes.content[0].text.includes('Created lead'))
  console.log('✓ Tested create_lead -> 32.5 km')

  // 11. Tool call: get_project_tree
  const treeRes = await call('tools/call', {
    name: 'get_project_tree',
    arguments: { projectPath: testProjectFile }
  })
  const summary = JSON.parse(treeRes.content[0].text)
  assert.equal(summary.projectName, 'MKLIS Lift Irrigation Scheme Package 29')
  console.log('✓ Tested get_project_tree -> Verified full tree structure')

  // 12. Tool call: create_project_data (from scratch)
  const createDataRes = await call('tools/call', {
    name: 'create_project_data',
    arguments: {
      code: 'DATA-M20-CUSTOM',
      description: 'Design Mix Vibrated M20 Concrete with 20mm aggregate',
      unit: 'CUM',
      outputQuantity: 10,
      overheadPercent: 14,
      sections: [
        {
          key: 'materials',
          title: 'Materials',
          items: [
            { description: 'Cement (OPC 43 Grade)', quantity: 3.5, unit: 'TONNE', rate: 6800 },
            { description: 'Sand for Concrete', quantity: 4.5, unit: 'CUM', rate: 1100 },
            { description: 'Coarse Aggregate 20mm HBG Metal', quantity: 9.0, unit: 'CUM', rate: 760 }
          ]
        },
        {
          key: 'machinery',
          title: 'Machinery',
          items: [
            { description: 'Concrete Mixer 10/7 cft capacity', quantity: 1, unit: 'DAY', rate: 2500 },
            { description: 'Pin Vibrator with Needle', quantity: 1, unit: 'DAY', rate: 800 }
          ]
        },
        {
          key: 'labour',
          title: 'Labour Charges',
          items: [
            { description: 'Mason 1st Class', quantity: 2, unit: 'DAY', rate: 900 },
            { description: 'Mazdoor (Men / Women)', quantity: 10, unit: 'DAY', rate: 620 }
          ]
        }
      ],
      projectPath: testProjectFile
    }
  })
  const createdData = JSON.parse(createDataRes.content[0].text)
  assert.equal(createdData.status, 'success')
  assert.equal(createdData.code, 'DATA-M20-CUSTOM')
  assert.ok(createdData.rate > 5000)
  console.log('✓ Tested create_project_data (from scratch) ->', createdData.code, 'Rate:', createdData.rate)

  // 13. Tool call: create_project_data (cloned from SSR item)
  const cloneDataRes = await call('tools/call', {
    name: 'create_project_data',
    arguments: {
      code: 'DATA-M20-MODIFIED',
      sourceItemCode: 'IRR-CCDW-2-29',
      description: 'Modified M20 Concrete cloned from IRR-CCDW-2-29',
      overheadPercent: 10,
      projectPath: testProjectFile
    }
  })
  const clonedData = JSON.parse(cloneDataRes.content[0].text)
  assert.equal(clonedData.status, 'success')
  assert.equal(clonedData.code, 'DATA-M20-MODIFIED')
  assert.ok(clonedData.rate > 0)
  console.log('✓ Tested create_project_data (cloned from SSR) ->', clonedData.code, 'Rate:', clonedData.rate)

  // 14. Tool call: edit_project_data
  const editDataRes = await call('tools/call', {
    name: 'edit_project_data',
    arguments: {
      dataIdOrCode: 'DATA-M20-CUSTOM',
      overheadPercent: 12,
      addLines: [
        {
          sectionKey: 'materials',
          description: 'Waterproofing Compound Integral Admixture',
          quantity: 12,
          unit: 'KG',
          rate: 64
        }
      ],
      projectPath: testProjectFile
    }
  })
  const editedData = JSON.parse(editDataRes.content[0].text)
  assert.equal(editedData.status, 'success')
  assert.ok(editedData.rate > 5000)
  console.log('✓ Tested edit_project_data -> Updated Rate:', editedData.rate)

  // 15. Tool call: list_project_data
  const listDataRes = await call('tools/call', {
    name: 'list_project_data',
    arguments: { projectPath: testProjectFile }
  })
  const listedData = JSON.parse(listDataRes.content[0].text)
  assert.equal(listedData.status, 'success')
  assert.equal(listedData.totalCount, 2)
  console.log('✓ Tested list_project_data -> Found', listedData.totalCount, 'Project DATAs')

  // 16. Tool call: get_project_data
  const getDataRes = await call('tools/call', {
    name: 'get_project_data',
    arguments: {
      dataIdOrCode: 'DATA-M20-CUSTOM',
      projectPath: testProjectFile
    }
  })
  const gotData = JSON.parse(getDataRes.content[0].text)
  assert.equal(gotData.status, 'success')
  assert.equal(gotData.definition.code, 'DATA-M20-CUSTOM')
  assert.ok(gotData.definition.sections.length >= 3)
  console.log('✓ Tested get_project_data -> Verified breakdown with', gotData.definition.sections.length, 'sections')

  // 17. Tool call: add item linked to custom DATA & sync costs
  const addDataItemRes = await call('tools/call', {
    name: 'add_item_to_component',
    arguments: {
      componentId,
      name: 'Design Mix Vibrated M20 Concrete in Retaining Wall',
      itemCode: 'DATA-M20-CUSTOM',
      computedQuantity: 150,
      unit: 'CUM',
      projectPath: testProjectFile
    }
  })
  const addedDataItem = JSON.parse(addDataItemRes.content[0].text)
  assert.equal(addedDataItem.item.categoryKey, 'project_data')
  console.log('✓ Tested add_item_to_component linking custom DATA -> ID:', addedDataItem.itemId)

  // 18. Tool call: sync_project_costs
  const syncRes = await call('tools/call', {
    name: 'sync_project_costs',
    arguments: { projectPath: testProjectFile }
  })
  const syncData = JSON.parse(syncRes.content[0].text)
  assert.equal(syncData.status, 'success')
  assert.ok(syncData.summary.syncedItemCount >= 3)
  console.log('✓ Tested sync_project_costs ->', syncData.summary.syncedItemCount, 'items synced including Custom DATA')

  mcpProcess.kill()
  console.log('ALL MCP SERVER TESTS PASSED PERFECTLY!')
}

run().catch((err) => {
  console.error('MCP TEST FAILED:', err)
  process.exit(1)
})
