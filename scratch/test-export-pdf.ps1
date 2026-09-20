
$xl = New-Object -ComObject Excel.Application
$xl.Visible = $false
$xl.DisplayAlerts = $false
try {
  $wb = $xl.Workbooks.Open('C:\Users\napra\OneDrive\Desktop\Software E-estimate\scratch\test-workbook-output.xlsx')
  $ws = $wb.Worksheets.Item(1)
  $ws.ExportAsFixedFormat(0, 'C:\Users\napra\OneDrive\Desktop\Software E-estimate\scratch\test-workbook-output.pdf')
  $wb.Close($false)
  Write-Host 'SUCCESS'
} catch {
  Write-Host 'ERROR:' $_.Exception.Message
} finally {
  $xl.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($xl) | Out-Null
}
