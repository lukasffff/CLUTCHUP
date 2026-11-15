$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType=WindowsRuntime]
$null = [Windows.Globalization.Language, Windows.Foundation, ContentType=WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation, ContentType=WindowsRuntime]
$null = [Windows.Storage.Streams.InMemoryRandomAccessStream, Windows.Foundation, ContentType=WindowsRuntime]
$null = [Windows.Storage.Streams.DataWriter, Windows.Foundation, ContentType=WindowsRuntime]
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation' + [char]96 + '1'
} | Select-Object -First 1
function Receive-Operation($operation, [Type]$type) {
    $task = $asTask.MakeGenericMethod($type).Invoke($null, @($operation))
    $task.GetAwaiter().GetResult()
}
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new('en-US'))
if (!$engine) { throw 'Install the English Windows OCR language pack.' }
[Console]::WriteLine('ready')
while ($null -ne ($line = [Console]::ReadLine())) {
    $stream = $null
    $writer = $null
    $bitmap = $null
    try {
        $stream = [Windows.Storage.Streams.InMemoryRandomAccessStream]::new()
        $writer = [Windows.Storage.Streams.DataWriter]::new($stream)
        $writer.WriteBytes([Convert]::FromBase64String($line))
        $null = Receive-Operation ($writer.StoreAsync()) ([UInt32])
        $null = $writer.DetachStream()
        $stream.Seek(0)
        $decoder = Receive-Operation ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
        $bitmap = Receive-Operation ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
        $result = Receive-Operation ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
        $words = @(
            foreach ($row in $result.Lines) {
                foreach ($word in $row.Words) {
                    $r = $word.BoundingRect
                    @{ text = $word.Text; x = $r.X; y = $r.Y; width = $r.Width; height = $r.Height }
                }
            }
        )
        [Console]::WriteLine((ConvertTo-Json -InputObject @{ words = $words } -Compress -Depth 4))
    } catch {
        [Console]::WriteLine('{"error":"Windows could not read this HUD sample."}')
    } finally {
        if ($bitmap) { $bitmap.Dispose() }
        if ($writer) { $writer.Dispose() }
        if ($stream) { $stream.Dispose() }
    }
}
