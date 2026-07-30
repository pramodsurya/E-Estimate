$xlsxPath = 'C:\Users\napra\Downloads\8______Bund estimate_1.320TMC.xlsx'
$needles = @('AV222', 'AW222', 'AV263', 'AW263')
Add-Type -AssemblyName System.IO.Compression
$stream = [System.IO.File]::Open($xlsxPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite -bor [System.IO.FileShare]::Delete)
$zip = [System.IO.Compression.ZipArchive]::new($stream, [System.IO.Compression.ZipArchiveMode]::Read, $false)
try {
    foreach ($entry in $zip.Entries | Where-Object { $_.FullName -like 'xl/worksheets/*.xml' }) {
        $reader = [System.IO.StreamReader]::new($entry.Open())
        try { $text = $reader.ReadToEnd() } finally { $reader.Dispose() }
        foreach ($needle in $needles) {
            if ($text.Contains($needle)) {
                Write-Output "$($entry.FullName) contains $needle"
            }
        }
    }
}
finally {
    $zip.Dispose()
    $stream.Dispose()
}
