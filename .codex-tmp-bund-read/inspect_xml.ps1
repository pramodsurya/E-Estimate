$xlsxPath = 'C:\Users\napra\Downloads\8______Bund estimate_1.320TMC.xlsx'
$sheetName = 'bundqty-1.32TMC'

Add-Type -AssemblyName System.IO.Compression.FileSystem
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
    $ns = [System.Xml.XmlNamespaceManager]::new($workbookXml.NameTable)
    $ns.AddNamespace('m', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main')
    $ns.AddNamespace('r', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships')
    $sheet = $workbookXml.SelectSingleNode("//m:sheet[@name='$sheetName']", $ns)
    if ($null -eq $sheet) { throw "Sheet not found: $sheetName" }
    $relId = $sheet.GetAttribute('id', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships')

    $relsNs = [System.Xml.XmlNamespaceManager]::new($relsXml.NameTable)
    $relsNs.AddNamespace('p', 'http://schemas.openxmlformats.org/package/2006/relationships')
    $rel = $relsXml.SelectSingleNode("//p:Relationship[@Id='$relId']", $relsNs)
    $target = $rel.Target
    if ($target.StartsWith('/')) {
        $sheetEntry = $target.TrimStart('/')
    } else {
        $sheetEntry = 'xl/' + $target.TrimStart('./')
    }

    $sharedStrings = @()
    $sharedText = Read-ZipText 'xl/sharedStrings.xml'
    if ($sharedText) {
        [xml]$sharedXml = $sharedText
        $sharedNs = [System.Xml.XmlNamespaceManager]::new($sharedXml.NameTable)
        $sharedNs.AddNamespace('m', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main')
        foreach ($si in $sharedXml.SelectNodes('//m:si', $sharedNs)) {
            $parts = $si.SelectNodes('.//m:t', $sharedNs) | ForEach-Object { $_.'#text' }
            $sharedStrings += ($parts -join '')
        }
    }

    [xml]$sheetXml = Read-ZipText $sheetEntry
    $sheetNs = [System.Xml.XmlNamespaceManager]::new($sheetXml.NameTable)
    $sheetNs.AddNamespace('m', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main')

    function Get-CellDisplay([System.Xml.XmlElement]$cell) {
        if ($null -eq $cell) { return '' }
        $type = $cell.GetAttribute('t')
        $valueNode = $cell.SelectSingleNode('./m:v', $sheetNs)
        if ($type -eq 's' -and $null -ne $valueNode) {
            return $sharedStrings[[int]$valueNode.InnerText]
        }
        if ($type -eq 'inlineStr') {
            return (($cell.SelectNodes('.//m:t', $sheetNs) | ForEach-Object { $_.InnerText }) -join '')
        }
        if ($null -ne $valueNode) { return $valueNode.InnerText }
        return ''
    }

    Write-Output "Sheet entry: $sheetEntry"
    foreach ($rowNumber in (1..15 + 30..40)) {
        $row = $sheetXml.SelectSingleNode("//m:row[@r='$rowNumber']", $sheetNs)
        if ($null -eq $row) { continue }
        $cells = foreach ($cell in $row.SelectNodes('./m:c', $sheetNs)) {
            $ref = $cell.GetAttribute('r')
            $display = Get-CellDisplay $cell
            $formula = $cell.SelectSingleNode('./m:f', $sheetNs)
            if ($display -ne '' -or $null -ne $formula) {
                if ($null -ne $formula) { "$ref=$display [FORMULA: $($formula.InnerText)]" }
                else { "$ref=$display" }
            }
        }
        if ($cells.Count -gt 0) { Write-Output ("ROW {0}: {1}" -f $rowNumber, ($cells -join ' | ')) }
    }
}
finally {
    if ($null -ne $archive) { $archive.Dispose() }
    if ($null -ne $fileStream) { $fileStream.Dispose() }
}
