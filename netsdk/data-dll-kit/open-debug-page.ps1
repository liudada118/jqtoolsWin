param(
    [string]$HostName = "127.0.0.1",
    [int]$HttpPort = 19345
)

Start-Process "http://${HostName}:${HttpPort}/debug"
