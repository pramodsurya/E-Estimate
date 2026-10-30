const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { execFileSync } = require('node:child_process')
const root = path.resolve(__dirname, '..')
const output = path.join(root, 'src/renderer/src/generated/canal-section-engine.wasm')
const stamp = `${output}.sha256`
function ensureCanalSectionEngine() {
  const sources = ['src-tauri/Cargo.toml','src-tauri/Cargo.lock','src-tauri/canal-section-wasm/Cargo.toml','src-tauri/canal-section-wasm/src/lib.rs',
    'src-tauri/estimate-core/Cargo.toml','src-tauri/estimate-core/src/canal_engine/bank_statement.rs',
    'src-tauri/estimate-core/src/canal_engine/models.rs']
  const digest = crypto.createHash('sha256')
  for (const file of sources) digest.update(fs.readFileSync(path.join(root,file)))
  const hash=digest.digest('hex')
  if(fs.existsSync(output)&&fs.existsSync(stamp)&&fs.readFileSync(stamp,'utf8')===hash)return output
  const target=path.join(process.env.LOCALAPPDATA||require('node:os').tmpdir(),'e-estimate','canal-section-wasm-target')
  execFileSync('cargo',['build','--manifest-path',path.join(root,'src-tauri/Cargo.toml'),'-p','canal-section-wasm','--target','wasm32-unknown-unknown','--release'],{
    cwd:root,stdio:'inherit',windowsHide:true,env:{...process.env,CARGO_TARGET_DIR:target}})
  fs.mkdirSync(path.dirname(output),{recursive:true})
  const temporary=`${output}.${process.pid}.tmp`
  fs.copyFileSync(path.join(target,'wasm32-unknown-unknown/release/canal_section_wasm.wasm'),temporary)
  fs.renameSync(temporary,output)
  fs.writeFileSync(stamp,hash)
  return output
}
module.exports={ensureCanalSectionEngine}
if(require.main===module)ensureCanalSectionEngine()
