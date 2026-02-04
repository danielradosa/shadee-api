import cors from "cors"
import crypto from "crypto"
import express from "express"
import fs from "fs-extra"
import { createClient } from "redis"

const app = express()
app.use(cors())
app.use(express.json({ limit: "100kb" }))

// redis
const redis = createClient({ url: process.env.REDIS_URL || "redis://localhost:6379" })
redis.connect().catch(console.error)

// file fallbach
const FILE_PATH = "./data/shaders.json"
await fs.ensureFile(FILE_PATH)
let fileStore = await fs.readJson(FILE_PATH).catch(() => ({}))

function saveFileStore() {
    return fs.writeJson(FILE_PATH, fileStore)
}

// helper
function id() {
    return crypto.randomBytes(4).toString("base64url")
}

// save shader redis and filesystem
async function storeShader(shaderId, source) {
    const payload = { source, created: Date.now() }
    await redis.set(`shader:${shaderId}`, JSON.stringify(payload), { EX: 7 * 24 * 60 * 60 })
    fileStore[shaderId] = payload
    await saveFileStore()
}

// load from redis, fallback to fs
async function getShader(shaderId) {
    let data = await redis.get(`shader:${shaderId}`)
    if (data) return JSON.parse(data)

    if (fileStore[shaderId]) {
        await redis.set(`shader:${shaderId}`, JSON.stringify(fileStore[shaderId]), { EX: 7 * 24 * 60 * 60 })
        return fileStore[shaderId]
    }
    return null
}

app.post("/save", async (req, res) => {
    const { source } = req.body;
    if (!source) return res.status(400).json({ error: "⚠️ No shader source" });

    const shaderId = id();
    await storeShader(shaderId, source);

    res.json({ id: shaderId });
});

app.get("/view/:id", async (req, res) => {
    const shader = await getShader(req.params.id);
    if (!shader) return res.status(404).send("❌ Shader not found");
    res.json(shader);
});

// start server
const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Server running on port ${PORT}`))