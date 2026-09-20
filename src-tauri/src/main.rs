#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() >= 4 && args[1] == "--compile-excel" {
        let input_path = &args[2];
        let output_path = &args[3];
        let json_str = match std::fs::read_to_string(input_path) {
            Ok(s) => s,
            Err(e) => {
                eprintln!("Failed to read input JSON: {}", e);
                std::process::exit(1);
            }
        };
        let req: e_estimate_lib::excel_compile::ExcelCompileRequest = match serde_json::from_str(&json_str) {
            Ok(r) => r,
            Err(e) => {
                eprintln!("Failed to deserialize request JSON: {}", e);
                std::process::exit(2);
            }
        };
        let bytes = match e_estimate_lib::excel_compile::generate_workbook(&req) {
            Ok(b) => b,
            Err(e) => {
                eprintln!("Failed to generate excel workbook: {}", e);
                std::process::exit(3);
            }
        };
        if let Err(e) = std::fs::write(output_path, bytes) {
            eprintln!("Failed to write output XLSX: {}", e);
            std::process::exit(4);
        }
        println!("EXCEL_COMPILED_OK");
        return;
    }
    e_estimate_lib::run();
}
