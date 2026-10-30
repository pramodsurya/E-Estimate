//! Thin memory/JSON ABI. All engineering is in estimate-core, shared with Excel.
use estimate_core::canal_engine::bank_statement::{
    measure_bank_quantities, measure_bank_section, BankExportInput, BankSectionInput,
};

#[no_mangle]
pub extern "C" fn canal_alloc(length: usize) -> *mut u8 {
    Box::into_raw(vec![0u8; length].into_boxed_slice()) as *mut u8
}

/// The caller owns allocations and frees both input and output after each call.
#[no_mangle]
pub unsafe extern "C" fn canal_free(pointer: *mut u8, length: usize) {
    drop(Box::from_raw(std::ptr::slice_from_raw_parts_mut(
        pointer, length,
    )));
}

#[no_mangle]
pub unsafe extern "C" fn canal_section(pointer: *const u8, length: usize) -> u64 {
    let source = std::slice::from_raw_parts(pointer, length);
    let result = serde_json::from_slice::<serde_json::Value>(source)
        .map_err(|e| e.to_string())
        .and_then(|query| {
            if query["operation"].as_str() == Some("quantities") {
                serde_json::from_value::<BankExportInput>(query["input"].clone())
                    .map_err(|e| e.to_string())
                    .and_then(|input| measure_bank_quantities(&input))
                    .and_then(|data| serde_json::to_value(data).map_err(|e| e.to_string()))
            } else {
                serde_json::from_value::<BankSectionInput>(query)
                    .map_err(|e| e.to_string())
                    .and_then(|input| measure_bank_section(&input))
                    .and_then(|data| serde_json::to_value(data).map_err(|e| e.to_string()))
            }
        });
    let bytes = match result {
        Ok(value) => serde_json::to_vec(&serde_json::json!({"data":value})),
        Err(error) => serde_json::to_vec(&serde_json::json!({"error":error})),
    }
    .expect("serializable section result")
    .into_boxed_slice();
    let size = bytes.len() as u64;
    let pointer = Box::into_raw(bytes) as *mut u8 as u64;
    (size << 32) | pointer
}
