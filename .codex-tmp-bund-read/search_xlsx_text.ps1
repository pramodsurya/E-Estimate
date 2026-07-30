$xlsxPath = 'C:\Users\napra\Downloads\8______Bund estimate_1.320TMC.xlsx'
$patterns = @('revetment', 'toe wall', 'toe drain', '450 mm', '300 mm')

Add-Type -AssemblyName System.IO.Compression
$fileStream = [System.IO.File]::Open(
    $xlsxPath,
    [System.IO.FileMode]::Open,
    [System.IO.FileAccess]::Read,
    [System.IO.FileShare]::ReadWrite -bor [System.IO.FileShare]::Delete
)
$archive = [System.IO.Compression.ZipArchive]::new(
    $fileStream,
    [System.IO.Compression.ZipArchiveMode]::Read,
    $false
)
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
    $sharedText = Read-ZipText 'xl/sharedStrings.xml'
    if ($sharedText) {
        [xml]$sharedXml = $sharedText
        $sharedNs = [System.Xml.XmlNamespaceManager]::new($sharedXml.NameTable)
        $sharedNs.AddNamespace('m', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main')
        foreach ($si in $sharedXml.SelectNodes('//m:si', $sharedNs)) {
            $sharedStrings += (($si.SelectNodes('.//m:t', $sharedNs) | ForEach-Object { $_.InnerText }) -join '')
        }
    }

    foreach ($sheet in $workbookXml.SelectNodes('//m:sheet', $wbNs)) {
        $sheetName = $sheet.GetAttribute('name')
        $relId = $sheet.GetAttribute('id', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships')
        $rel = $relsXml.SelectSingleNode("//p:Relationship[@Id='$relId']", $relsNs)
        if ($null -eq $rel) { continue }
        $target = $rel.Target
        $sheetEntry = if ($target.StartsWith('/')) { $target.TrimStart('/') } else { 'xl/' + $target.TrimStart('./') }
        $sheetText = Read-ZipText $sheetEntry
        if (-not $sheetText) { continue }
        [xml]$sheetXml = $sheetText
        $sheetNs = [System.Xml.XmlNamespaceManager]::new($sheetXml.NameTable)
        $sheetNs.AddNamespace('m', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main')
        foreach ($cell in $sheetXml.SelectNodes('//m:c', $sheetNs)) {
            $type = $cell.GetAttribute('t')
            $display = ''
            $valueNode = $cell.SelectSingleNode('./m:v', $sheetNs)
            if ($type -eq 's' -and $null -ne $valueNode) {
                $display = $sharedStrings[[int]$valueNode.InnerText]
            } elseif ($type -eq 'inlineStr') {
                $display = (($cell.SelectNodes('.//m:t', $sheetNs) | ForEach-Object { $_.InnerText }) -join '')
            }
            if (-not $display) { continue }
            foreach ($pattern in $patterns) {
                if ($display -like "*$pattern*") {
                    $formula = $cell.SelectSingleNode('./m:f', $sheetNs)
                    $formulaText = if ($null -ne $formula) { " FORMULA=$($formula.InnerText)" } else { '' }
                    Write-Output "$sheetName!$($cell.GetAttribute('r')) | $display$formulaText"
                    break
                }
            }
        }
    }
}
finally {
    $archive.Dispose()
    $fileStream.Dispose()
}
