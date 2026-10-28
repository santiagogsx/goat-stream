' Goat Stream for Roku — screens and logic.
'   1. Find the PC (or type its address)  2. Click Allow on the PC  3. Library rows  4. Play (direct, up to 4K)

sub init()
    m.reg = CreateObject("roRegistrySection", "goatstream")
    m.status = m.top.FindNode("status")
    m.hint = m.top.FindNode("hint")
    m.menu = m.top.FindNode("menu")
    m.rows = m.top.FindNode("rows")
    m.detail = m.top.FindNode("detail")
    m.video = m.top.FindNode("video")
    m.tasks = []
    m.menuActions = []
    m.progress = {}

    m.menu.ObserveField("itemSelected", "onMenu")
    m.rows.ObserveField("rowItemSelected", "onRowSelect")
    m.rows.ObserveField("rowItemFocused", "onRowFocus")
    m.video.ObserveField("state", "onVideoState")

    m.pollTimer = CreateObject("roSGNode", "Timer")
    m.pollTimer.duration = 1.5
    m.pollTimer.repeat = true
    m.pollTimer.ObserveField("fire", "onPairPoll")

    m.base = m.reg.Read("server")
    m.token = m.reg.Read("token")
    if m.base <> "" and m.token <> ""
        loadLibrary()
    else
        startDiscovery()
    end if
end sub

' ---------- helpers ----------
function newTask(req as object, callback as string) as object
    t = CreateObject("roSGNode", "ApiTask")
    t.request = req
    t.ObserveField("response", callback)
    t.control = "RUN"
    m.tasks.Push(t)
    if m.tasks.Count() > 20 then m.tasks.Shift()
    return t
end function

sub api(kind as string, path as string, method as string, body as string, callback as string)
    newTask({ kind: kind, url: m.base + path, method: method, body: body, token: m.token }, callback)
end sub

sub showMessage(title as string, hint as string)
    m.rows.visible = false
    m.detail.text = ""
    m.status.text = title
    m.hint.text = hint
end sub

sub showMenu(items as object)
    root = CreateObject("roSGNode", "ContentNode")
    m.menuActions = []
    for each it in items
        n = root.CreateChild("ContentNode")
        n.title = it.label
        m.menuActions.Push(it)
    end for
    m.menu.content = root
    m.menu.visible = items.Count() > 0
    if items.Count() > 0 then m.menu.SetFocus(true)
end sub

function nowMs() as double
    dt = CreateObject("roDateTime")
    return dt.AsSeconds() * 1000# + dt.GetMilliseconds()
end function

' missing values from the PC come through as invalid — comparing those to text would crash, so normalise first
function txt(v as dynamic) as string
    if v = invalid then return ""
    if type(v) = "roString" or type(v) = "String" then return v
    return Str(v).Trim()
end function

function absUrl(u as dynamic) as string
    if u = invalid or u = "" then return ""
    if Left(u, 1) = "/" then return m.base + u + "?t=" + m.token
    return u
end function

' ---------- 1. find the PC ----------
sub startDiscovery()
    m.menu.visible = false
    showMessage("Looking for Goat Stream on your PC…", "Make sure Goat Stream is open on your PC and both are on the same network.")
    newTask({ kind: "discover" }, "onDiscovered")
end sub

sub onDiscovered(event as object)
    servers = event.GetData().servers
    items = []
    for each s in servers
        items.Push({ label: s.name + "   (" + s.host + ")", action: "pair", url: "http://" + s.host + ":" + Str(s.port).Trim() })
    end for
    if servers.Count() = 1
        startPairing(items[0].url)
        return
    end if
    if servers.Count() = 0
        showMessage("Couldn't find your PC", "Open Goat Stream on your PC, check you're on the same Wi-Fi, then search again. Get the PC app at santiagogsx.github.io/goat-stream")
    else
        showMessage("Pick your PC", "")
    end if
    items.Push({ label: "Search again", action: "search" })
    items.Push({ label: "Type the PC address", action: "manual" })
    showMenu(items)
end sub

sub onMenu()
    a = m.menuActions[m.menu.itemSelected]
    if a = invalid then return
    if a.action = "pair" then startPairing(a.url)
    if a.action = "search" then startDiscovery()
    if a.action = "manual" then askAddress()
    if a.action = "unlink" then unlink()
    if a.action = "retry" then loadLibrary()
end sub

sub askAddress()
    kb = CreateObject("roSGNode", "KeyboardDialog")
    kb.title = "PC address (shown in Goat Stream → Settings), e.g. 192.168.1.20"
    kb.buttons = ["Connect", "Cancel"]
    kb.ObserveField("buttonSelected", "onAddress")
    m.top.dialog = kb
end sub

sub onAddress()
    kb = m.top.dialog
    if kb.buttonSelected = 0 and kb.text <> ""
        v = kb.text.Trim()
        if Left(v, 4) <> "http" then v = "http://" + v
        if v.Split(":").Count() < 3 then v = v + ":8787"
        kb.close = true
        startPairing(v)
    else
        kb.close = true
    end if
end sub

' ---------- 2. link with the PC ----------
sub startPairing(url as string)
    m.menu.visible = false
    m.pairBase = url
    showMessage("Connecting…", "")
    name = CreateObject("roDeviceInfo").GetFriendlyName()
    if name = invalid or name = "" then name = "Roku"
    newTask({ kind: "pair", url: url + "/api/pair/request", method: "POST", body: FormatJson({ deviceName: name }) }, "onPairRequested")
end sub

sub onPairRequested(event as object)
    r = event.GetData()
    j = ParseJson(r.body)
    if r.code <> 200 or j = invalid or j.requestId = invalid
        showMessage("Couldn't connect to your PC", m.pairBase)
        showMenu([{ label: "Search again", action: "search" }, { label: "Type the PC address", action: "manual" }])
        return
    end if
    m.pairId = j.requestId
    m.pairTries = 0
    showMessage("On your PC, click Allow", "Goat Stream on your PC is showing a pop-up so this Roku can watch your movies.")
    m.pollTimer.control = "start"
end sub

sub onPairPoll()
    m.pairTries = m.pairTries + 1
    if m.pairTries > 100
        m.pollTimer.control = "stop"
        showMessage("The request wasn't approved", "")
        showMenu([{ label: "Search again", action: "search" }])
        return
    end if
    newTask({ kind: "pairStatus", url: m.pairBase + "/api/pair/status/" + m.pairId, method: "GET" }, "onPairStatus")
end sub

sub onPairStatus(event as object)
    j = ParseJson(event.GetData().body)
    if j = invalid then return
    state = txt(j.state)
    if state = "approved"
        m.pollTimer.control = "stop"
        m.base = m.pairBase
        m.token = j.token
        m.reg.Write("server", m.base)
        m.reg.Write("token", m.token)
        m.reg.Flush()
        loadLibrary()
    else if state = "denied" or state = "expired"
        m.pollTimer.control = "stop"
        showMessage("The request wasn't approved", "")
        showMenu([{ label: "Search again", action: "search" }])
    end if
end sub

sub unlink()
    m.reg.Delete("server")
    m.reg.Delete("token")
    m.reg.Flush()
    m.base = ""
    m.token = ""
    startDiscovery()
end sub

' ---------- 3. library ----------
sub loadLibrary()
    m.menu.visible = false
    showMessage("Loading your movies…", "")
    api("userdata", "/api/userdata", "GET", "", "onUserData")
    api("library", "/api/library", "GET", "", "onLibrary")
end sub

sub onUserData(event as object)
    j = ParseJson(event.GetData().body)
    if j <> invalid and j.progress <> invalid then m.progress = j.progress
end sub

sub onLibrary(event as object)
    r = event.GetData()
    if r.code = 401
        unlink()
        return
    end if
    j = ParseJson(r.body)
    if r.code <> 200 or j = invalid
        showMessage("Your PC is offline", "Turn on your PC — Goat Stream runs in the tray — and try again.")
        showMenu([{ label: "Try again", action: "retry" }, { label: "Find another PC", action: "search" }])
        return
    end if
    items = j.items
    if items.Count() = 0
        showMessage("No movies yet", "Add movie folders or a cloud drive in Goat Stream on your PC.")
        showMenu([{ label: "Refresh", action: "retry" }, { label: "Unlink this Roku", action: "unlink" }])
        return
    end if

    movies = []
    episodes = []
    uhd = []
    for each it in items
        if it.show <> invalid then episodes.Push(it) else movies.Push(it)
        if txt(it.quality) = "4K" then uhd.Push(it)
    end for
    recent = []
    recent.Append(items)
    recent.SortBy("added", "r")
    movies.SortBy("title")
    episodes.SortBy("episode")
    episodes.SortBy("season")
    episodes.SortBy("show")

    root = CreateObject("roSGNode", "ContentNode")
    addRow(root, "Recently Added", recent, 30)
    if uhd.Count() > 0 then addRow(root, "4K Ultra HD", uhd, 60)
    if movies.Count() > 0 then addRow(root, "Movies", movies, 500)
    if episodes.Count() > 0 then addRow(root, "TV Shows", episodes, 500)
    addSettingsRow(root)

    m.status.text = ""
    m.hint.text = ""
    m.rows.content = root
    m.rows.visible = true
    m.rows.SetFocus(true)
end sub

sub addRow(root as object, title as string, list as object, maxItems as integer)
    row = root.CreateChild("ContentNode")
    row.TITLE = title
    n = 0
    for each it in list
        if n >= maxItems then exit for
        c = row.CreateChild("ContentNode")
        name = txt(it.title)
        if it.metaTitle <> invalid then name = txt(it.metaTitle)
        if it.show <> invalid then name = txt(it.show) + "  S" + txt(it.season) + ":E" + txt(it.episode)
        c.TITLE = name
        art = it.backdrop
        if it.still <> invalid then art = it.still
        if art = invalid then art = it.thumb
        c.HDPOSTERURL = absUrl(art)
        if txt(it.quality) = "4K" then c.SHORTDESCRIPTIONLINE2 = "4K"
        c.DESCRIPTION = txt(it.overview)
        c.URL = m.base + "/stream/" + txt(it.id) + "?t=" + m.token
        parts = txt(it.name).Split(".")
        fmt = ""
        if parts.Count() > 1 then fmt = LCase(parts[parts.Count() - 1])
        if fmt = "mkv" then c.STREAMFORMAT = "mkv" else c.STREAMFORMAT = "mp4"
        c.addFields({ goatId: txt(it.id), goatAction: "" })
        p = m.progress[it.id]
        if p <> invalid and p.pos > 60 and p.pos < p.dur * 0.94 then c.PLAYSTART = p.pos - 5
        n = n + 1
    end for
end sub

sub addSettingsRow(root as object)
    row = root.CreateChild("ContentNode")
    row.TITLE = "Settings"
    for each label in ["Refresh library", "Unlink this Roku"]
        c = row.CreateChild("ContentNode")
        c.TITLE = label
        c.addFields({ goatId: "", goatAction: label })
    end for
end sub

sub onRowFocus()
    f = m.rows.rowItemFocused
    c = m.rows.content.GetChild(f[0]).GetChild(f[1])
    if c <> invalid then m.detail.text = c.DESCRIPTION
end sub

' ---------- 4. play ----------
sub onRowSelect()
    s = m.rows.rowItemSelected
    c = m.rows.content.GetChild(s[0]).GetChild(s[1])
    if c = invalid then return
    action = txt(c.goatAction)
    if action = "Refresh library"
        loadLibrary()
        return
    end if
    if action = "Unlink this Roku"
        unlink()
        return
    end if
    m.playing = c
    m.triedConvert = false
    playNode(c, c.PLAYSTART)
end sub

sub playNode(c as object, startAt as dynamic)
    v = CreateObject("roSGNode", "ContentNode")
    v.URL = c.URL
    v.STREAMFORMAT = c.STREAMFORMAT
    v.TITLE = c.TITLE
    if startAt <> invalid and startAt > 0 then v.PLAYSTART = startAt
    m.video.content = v
    m.video.visible = true
    m.video.control = "play"
    m.video.SetFocus(true)
end sub

sub onVideoState()
    st = m.video.state
    if st = "error" and m.playing <> invalid and not m.triedConvert
        ' audio this Roku can't decode (e.g. DTS): let the PC convert the sound, keep the picture
        m.triedConvert = true
        c = m.playing
        conv = CreateObject("roSGNode", "ContentNode")
        conv.URL = c.URL + "&mode=remux&start=" + Str(Int(m.video.position)).Trim()
        conv.STREAMFORMAT = "mp4"
        conv.TITLE = c.TITLE
        m.video.content = conv
        m.video.control = "play"
    else if st = "error"
        stopVideo()
        m.detail.text = "This video couldn't play on this Roku."
    else if st = "finished"
        saveProgress(m.video.duration, m.video.duration)
        stopVideo()
    end if
end sub

sub saveProgress(pos as dynamic, dur as dynamic)
    if m.playing = invalid or dur <= 0 then return
    id = m.playing.goatId
    entry = { pos: Int(pos), dur: Int(dur), t: nowMs() }
    m.progress[id] = entry
    data = { progress: {} }
    data.progress[id] = entry
    api("save", "/api/userdata", "POST", FormatJson(data), "onSaved")
    if pos > 60 and pos < dur * 0.94 then m.playing.PLAYSTART = pos - 5 else m.playing.PLAYSTART = 0
end sub

sub onSaved(event as object)
end sub

sub stopVideo()
    m.video.control = "stop"
    m.video.visible = false
    m.rows.SetFocus(true)
end sub

function onKeyEvent(key as string, press as boolean) as boolean
    if not press then return false
    if key = "back" and m.video.visible
        saveProgress(m.video.position, m.video.duration)
        stopVideo()
        return true
    end if
    return false
end function
