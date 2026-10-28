sub init()
    m.top.functionName = "runRequest"
end sub

sub runRequest()
    req = m.top.request
    if req.kind = "discover"
        m.top.response = { kind: "discover", servers: discover() }
    else
        m.top.response = httpCall(req)
    end if
end sub

' Shout "GOATSTREAM_DISCOVER" on the home network (UDP 8788); Goat Stream on the PC answers with its name.
function discover() as object
    found = []
    port = CreateObject("roMessagePort")
    sock = CreateObject("roDatagramSocket")
    sock.SetMessagePort(port)
    local = CreateObject("roSocketAddress")
    local.SetPort(0)
    sock.SetAddress(local)
    sock.SetBroadcast(true)
    dest = CreateObject("roSocketAddress")
    dest.SetHostName("255.255.255.255")
    dest.SetPort(8788)
    sock.SetSendToAddress(dest)
    sock.NotifyReadable(true)
    for attempt = 1 to 3
        sock.SendStr("GOATSTREAM_DISCOVER")
        clock = CreateObject("roTimespan")
        while clock.TotalMilliseconds() < 1000
            msg = wait(250, port)
            if type(msg) = "roSocketEvent" and sock.IsReadable()
                data = sock.ReceiveStr(2048)
                from = sock.GetReceivedFromAddress()
                j = ParseJson(data)
                if j <> invalid and j.app = "goatstream" and from <> invalid
                    host = from.GetAddress().Split(":")[0]
                    known = false
                    for each s in found
                        if s.host = host then known = true
                    end for
                    if not known then found.Push({ host: host, port: j.port, name: j.name })
                end if
            end if
        end while
        if found.Count() > 0 then exit for
    end for
    sock.Close()
    return found
end function

function httpCall(req as object) as object
    xfer = CreateObject("roUrlTransfer")
    port = CreateObject("roMessagePort")
    xfer.SetMessagePort(port)
    xfer.SetUrl(req.url)
    xfer.RetainBodyOnError(true)
    xfer.AddHeader("Content-Type", "application/json")
    if req.token <> invalid and req.token <> "" then xfer.AddHeader("x-goat-token", req.token)
    if req.method = "POST"
        xfer.AsyncPostFromString(req.body)
    else
        xfer.AsyncGetToString()
    end if
    msg = wait(15000, port)
    if type(msg) = "roUrlEvent"
        return { kind: req.kind, code: msg.GetResponseCode(), body: msg.GetString(), ctx: req.ctx }
    end if
    xfer.AsyncCancel()
    return { kind: req.kind, code: 0, body: "", ctx: req.ctx }
end function
