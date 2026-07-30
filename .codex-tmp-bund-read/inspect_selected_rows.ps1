$xlsxPath = 'C:\Users\napra\Downloads\8______Bund estimate_1.320TMC.xlsx'
$requests = @(
    @{ Sheet = 'Qty. of bund '; Start = 45; End = 60 },
    @{ Sheet = 'bundqty-1.32TMC'; Start = 220; End = 223 },
    @{ Sheet = 'bundqty-1.32TMC'; Start = 260; End = 266 },
    @{ Sheet = 'abstract'; Start = 75; End = 84 }
)

Add-Type -AssemblyName System.IO.Compression
$fileStream = [System.IO.File]::Open($xlsxPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite -bor [System.IO.FileShare]::Delete)
$archive = [System.IO.Compression.ZipArchive]::new($fileStream, [System.IO.Compression.ZipArchiveMode]::Read, $false)
try {
    function Read-ZipText([string]$entryName) {
        $entry = $archive.GetEntry($entryName)
        if ($null -eq $entry) { return $null }
        $reader = [System.IO.StreamReader]::new($entry.Open())
        try { return $reader.ReadToEnd() } finally { $reader.Dispose() }
    }
    [xml]$workbookXml = Read-ZipText 'xl/workbook.xml'
    [xml]$relsXml = Read-ZipText 'xl/_rels/workbook.xml.rels'
    $wbNs = [System.Xml.XmlNamespaceManager]::new($workbookXml.NameTable)
    $wbNs.AddNamespace('m', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main')
    $wbNs.AddNamespace('r', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships')
    $relsNs = [System.Xml.XmlNamespaceManager]::new($relsXml.NameTable)
    $relsNs.AddNamespace('p', 'http://schemas.openxmlformats.org/package/2006/relationships')
    $sharedStrings = @()
    [xml]$sharedXml = Read-ZipText 'xl/sharedStrings.xml'
    $sharedNs = [System.Xml.XmlNamespaceManager]::new($sharedXml.NameTable)
    $sharedNs.AddNamespace('m', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main')
    foreach ($si in $sharedXml.SelectNodes('//m:si', $sharedNs)) {
        $sharedStrings += (($si.SelectNodes('.//m:t', $sharedNs) | ForEach-Object { $_.InnerText }) -join '')
    }

    foreach ($request in $requests) {
        $sheetName = $request.Sheet
        $sheet = $workbookXml.SelectSingleNode("//m:sheet[@name='$sheetName']", $wbNs)
        if ($null -eq $sheet) { Write-Output "MISSING SHEET: $sheetName"; continue }
        $relId = $sheet.GetAttribute('id', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships')
        $rel = $relsXml.SelectSingleNode("//p:Relationship[@Id='$relId']", $relsNs)
        $target = $rel.Target
        $sheetEntry = if ($target.StartsWith('/')) { $target.TrimStart('/') } else { 'xl/' + $target.TrimStart('./') }
        [xml]$sheetXml = Read-ZipText $sheetEntry
        $sheetNs = [System.Xml.XmlNamespaceManager]::new($sheetXml.NameTable)
        $sheetNs.AddNamespace('m', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main')
        Write-Output "=== $sheetName ==="
        for ($rowNumber = $request.Start; $rowNumber -le $request.End; $rowNumber++) {
            $row = $sheetXml.SelectSingleNode("//m:row[@r='$rowNumber']", $sheetNs)
            if ($null -eq $row) { continue }
            $parts = foreach ($cell in $row.SelectNodes('./m:c', $sheetNs)) {
                $ref = $cell.GetAttribute('r')
                $type = $cell.GetAttribute('t')
                $valueNode = $cell.SelectSingleNode('./m:v', $sheetNs)
                $display = ''
                if ($type -eq 's' -and $null -ne $valueNode) { $display = $sharedStrings[[int]$valueNode.InnerText] }
                elseif ($type -eq 'inlineStr') { $display = (($cell.SelectNodes('.//m:t', $sheetNs) | ForEach-Object { $_.InnerText }) -join '') }
                elseif ($null -ne $valueNode) { $display = $valueNode.InnerText }
                $formula = $cell.SelectSingleNode('./m:f', $sheetNs)
                if ($display -ne '' -or $null -ne $formula) {
                    $formulaText = if ($null -ne $formula) { " [=$($formula.InnerText)]" } else { '' }
                    "$ref=$display$formulaText"
                }
            }
            if ($parts.Count -gt 0) { Write-Output ("ROW {0}: {1}" -f $rowNumber, ($parts -join ' | ')) }
        }
    }
}
finally {
    $archive.Dispose()
    $fileStream.Dispose()
}
