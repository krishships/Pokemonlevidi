-- emerald_bridge.lua — mGBA Lua bridge for Pokemon Emerald.
--
-- Runs inside mGBA (Tools -> Scripting -> Load script), opens a TCP socket,
-- and answers line commands so an external agent can read the game's memory
-- and press buttons.
--
-- Protocol: one command per line, one response per line.
--   READ8  <addr>            -> <value>
--   READ16 <addr>            -> <value>
--   READ32 <addr>            -> <value>
--   KEYS   <mask>            -> OK      (bitmask, see KEY_* below)
--   FRAME                    -> <frame count>
--   PING                     -> PONG
--
-- Addresses are hex without 0x. This mirrors the socket-bridge pattern used
-- by gpt-play-pokemon-firered, reduced to what Emerald needs.

local PORT = 8888

-- GBA keypad bits as mGBA's setKeys expects them (active-low internally,
-- mGBA handles that; these are the logical masks).
local KEY = {
  A = 0x001, B = 0x002, SELECT = 0x004, START = 0x008,
  RIGHT = 0x010, LEFT = 0x020, UP = 0x040, DOWN = 0x080,
  R = 0x100, L = 0x200,
}

local server = nil
local clients = {}
local nextId = 1

local function log(msg)
  console:log("[emerald-bridge] " .. tostring(msg))
end

local function parseHex(s)
  return tonumber(s:gsub("^0x", ""), 16)
end

local function handle(cmd, arg)
  if cmd == "PING" then return "PONG" end
  if cmd == "FRAME" then return tostring(emu:currentFrame()) end
  if cmd == "READ8" then
    local a = parseHex(arg); if not a then return "ERR addr" end
    return tostring(emu:read8(a))
  end
  if cmd == "READ16" then
    local a = parseHex(arg); if not a then return "ERR addr" end
    return tostring(emu:read16(a))
  end
  if cmd == "READ32" then
    local a = parseHex(arg); if not a then return "ERR addr" end
    return tostring(emu:read32(a))
  end
  if cmd == "KEYS" then
    local m = parseHex(arg)
    if not m then return "ERR mask" end
    emu:setKeys(m)
    return "OK"
  end
  return "ERR cmd"
end

local function onReceived(id)
  local sock = clients[id]
  local data = sock:read(4096)
  if not data then return end
  for line in data:gmatch("[^\r\n]+") do
    local cmd, arg = line:match("^(%u+)%s*(.*)$")
    local ok, res = pcall(handle, cmd, arg)
    if not ok then res = "ERR " .. tostring(res) end
    sock:write(res .. "\n")
  end
end

local function onAccept()
  local sock, err = server:accept()
  if not sock then return end
  local id = nextId
  nextId = nextId + 1
  clients[id] = sock
  sock:add("received", function() onReceived(id) end)
  sock:add("error", function()
    sock:close()
    clients[id] = nil
  end)
end

function begin()
  local port = PORT
  while not server do
    local s, err = socket.bind(nil, port)
    if err then
      if err == socket.ERRORS.ADDRESS_IN_USE then port = port + 1 else
        log("bind failed: " .. tostring(err)); return
      end
    else
      local ok, lerr = s:listen()
      if lerr then s:close(); log("listen failed: " .. tostring(lerr)); return end
      server = s
      server:add("received", onAccept)
      log("listening on " .. port)
    end
  end
end

callbacks:add("frame", function() end)   -- keeps the script loaded
begin()
