import express from "express"
import fs from "fs"
import path from "path"
import OBSWebSocket from "obs-websocket-js"

const PORT = Number(process.env.PORT || 8080)
const OBS_WS_URL = process.env.OBS_WS_URL || "ws://127.0.0.1:4455"
const OBS_WS_PASSWORD = process.env.OBS_WS_PASSWORD || ""
const PANEL_TOKEN = process.env.PANEL_TOKEN || ""
const PANEL_JSON_PATH = process.env.PANEL_JSON_PATH || "/app/panel.json"

const app = express()
app.use(express.json({ limit: "200kb" }))

function requireToken(req, res, next) {
  if (!PANEL_TOKEN) return next()
  const t = req.header("x-panel-token") || ""
  if (t !== PANEL_TOKEN) return res.status(401).send("Unauthorized")
  next()
}

const obs = new OBSWebSocket()
let obsConnected = false
let lastObsError = ""

async function connectObsLoop() {
  for (;;) {
    try {
      await obs.connect(OBS_WS_URL, OBS_WS_PASSWORD)
      obsConnected = true
      lastObsError = ""
      break
    } catch (e) {
      obsConnected = false
      lastObsError = e?.message || String(e)
      await new Promise(r => setTimeout(r, 2000))
    }
  }
}

obs.on("ConnectionClosed", () => {
  obsConnected = false
  connectObsLoop().catch(() => {})
})

await connectObsLoop()

app.get("/api/health", requireToken, (req, res) => {
  res.json({ ok: obsConnected, obsConnected, lastObsError })
})

app.get("/api/panel", requireToken, (req, res) => {
  try {
    const raw = fs.readFileSync(PANEL_JSON_PATH, "utf8")
    const j = JSON.parse(raw)
    res.json(j)
  } catch (e) {
    res.status(500).send("panel.json not readable")
  }
})

async function doAction(body) {
  const action = body?.action

  if (!obsConnected) {
    throw new Error("OBS not connected")
  }

  if (action === "scene") {
    const sceneName = body?.sceneName
    if (!sceneName) throw new Error("sceneName missing")
    await obs.call("SetCurrentProgramScene", { sceneName })
    return `Scene set to ${sceneName}`
  }

  if (action === "start_stream") {
    await obs.call("StartStream")
    return "Stream started"
  }

  if (action === "stop_stream") {
    await obs.call("StopStream")
    return "Stream stopped"
  }

  if (action === "start_recording") {
    await obs.call("StartRecord")
    return "Recording started"
  }

  if (action === "stop_recording") {
    await obs.call("StopRecord")
    return "Recording stopped"
  }

  if (action === "mute") {
    const inputName = body?.inputName
    if (!inputName) throw new Error("inputName missing")
    await obs.call("SetInputMute", { inputName, inputMuted: true })
    return `Muted ${inputName}`
  }

  if (action === "unmute") {
    const inputName = body?.inputName
    if (!inputName) throw new Error("inputName missing")
    await obs.call("SetInputMute", { inputName, inputMuted: false })
    return `Unmuted ${inputName}`
  }

  throw new Error("Unknown action")
}

app.post("/api/action", requireToken, async (req, res) => {
  try {
    const msg = await doAction(req.body)
    res.json({ ok: true, message: msg })
  } catch (e) {
    res.status(400).json({ ok: false, error: e?.message || String(e) })
  }
})

const publicDir = path.join(process.cwd(), "public")
app.use("/", requireToken, express.static(publicDir))

app.listen(PORT, "0.0.0.0", () => {
  console.log(`obs-control listening on ${PORT}`)
  console.log(`obs url ${OBS_WS_URL}`)
})
