sub onContent()
    c = m.top.itemContent
    if c = invalid then return
    m.top.FindNode("title").text = c.TITLE
    m.top.FindNode("fallback").text = c.TITLE
    m.top.FindNode("art").uri = c.HDPOSTERURL
    is4k = c.SHORTDESCRIPTIONLINE2 = "4K"
    m.top.FindNode("badge").visible = is4k
    m.top.FindNode("badgeBg").visible = is4k
end sub
