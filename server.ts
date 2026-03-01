import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import { GoogleGenAI, Type } from "@google/genai";

// Vite middleware setup
async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Initialize SQLite database
  const dbPath = process.env.NODE_ENV === "production" ? "/tmp/plant_monitor.db" : "plant_monitor.db";
  const db = new Database(dbPath);
  
  // Create tables for Collectors and Telemetry
  db.exec(`
    CREATE TABLE IF NOT EXISTS collectors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      device_id TEXT UNIQUE NOT NULL,
      description TEXT,
      location TEXT,
      plant TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS telemetry (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      power REAL NOT NULL,
      energy_today REAL NOT NULL,
      status TEXT NOT NULL
    );
  `);

  // Add columns if they don't exist (for existing DBs)
  try {
    db.exec("ALTER TABLE collectors ADD COLUMN location TEXT DEFAULT ''");
    db.exec("ALTER TABLE collectors ADD COLUMN plant TEXT DEFAULT ''");
  } catch (e) {
    // Columns likely already exist
  }

  // Insert a default collector if none exists
  try {
    const count = db.prepare("SELECT COUNT(*) as count FROM collectors").get() as { count: number };
    if (count.count === 0) {
      db.prepare("INSERT INTO collectors (name, device_id, description, location, plant) VALUES (?, ?, ?, ?, ?)").run(
        "主發電站收集器", "ECU-1051-MAIN", "預設的研華資料收集器", "台北市內湖區", "內湖一廠"
      );
    }
  } catch (e) {
    console.error("Error initializing default collector:", e);
  }

  // Initialize Gemini AI (simulating PyTorch inference for anomaly detection)
  let ai: GoogleGenAI | null = null;
  const apiKey = process.env.GEMINI_API_KEY;

  if (apiKey && apiKey !== "MY_GEMINI_API_KEY" && apiKey.trim().length > 0) {
    try {
      ai = new GoogleGenAI({ apiKey });
    } catch (e) {
      console.warn("Gemini API Key initialization failed. Using fallback logic.");
    }
  } else {
    console.warn("Valid Gemini API Key not found. Using fallback logic for anomaly detection.");
  }

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // --- Collector APIs ---
  app.get("/api/collectors", (req, res) => {
    try {
      const rows = db.prepare("SELECT * FROM collectors ORDER BY created_at DESC").all();
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  app.post("/api/collectors", (req, res) => {
    try {
      const { name, device_id, description, location, plant } = req.body;
      if (!name || !device_id) return res.status(400).json({ error: "Missing required fields" });
      
      const stmt = db.prepare("INSERT INTO collectors (name, device_id, description, location, plant) VALUES (?, ?, ?, ?, ?)");
      const info = stmt.run(name, device_id, description || "", location || "", plant || "");
      res.json({ id: info.lastInsertRowid, name, device_id, description, location, plant });
    } catch (error: any) {
      if (error.message.includes("UNIQUE constraint failed")) {
        return res.status(400).json({ error: "設備 ID 已存在" });
      }
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  app.delete("/api/collectors/:id", (req, res) => {
    try {
      db.prepare("DELETE FROM collectors WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // --- AI Analysis API ---
  app.post("/api/analyze-image", async (req, res) => {
    try {
      const { imageBase64 } = req.body;
      if (!imageBase64) return res.status(400).json({ error: "Missing image data" });

      if (!ai) {
        return res.status(503).json({ error: "AI 服務未設定 (API Key 遺失)" });
      }

      // Remove the data:image/png;base64, prefix if present
      const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");

      const prompt = `你是一位專業的太陽能電站分析師。請分析這張電站監控儀表板的截圖。
      請提供：
      1. 當前發電狀況的簡短總結。
      2. 是否有任何異常或需要注意的地方。
      3. 給維運人員的建議。
      請用繁體中文回答，並使用 Markdown 格式排版。`;

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview", // Using Gemini 3.1 Pro as requested
        contents: [
          {
            inlineData: {
              data: base64Data,
              mimeType: "image/png"
            }
          },
          prompt
        ]
      });

      res.json({ analysis: response.text });
    } catch (error: any) {
      console.error("AI Analysis Error:", error);
      res.status(500).json({ error: "AI 分析失敗: " + error.message });
    }
  });

  // --- Telemetry APIs ---
  app.get("/api/telemetry", (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
      const rows = db.prepare(`
        SELECT t.*, c.name as collector_name 
        FROM telemetry t 
        LEFT JOIN collectors c ON t.device_id = c.device_id 
        ORDER BY t.timestamp DESC LIMIT ?
      `).all(limit);
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  app.get("/api/telemetry/chart", (req, res) => {
    try {
      // Get the last 24 records for the chart
      const rows = db.prepare(`
        SELECT timestamp, power, energy_today 
        FROM telemetry 
        ORDER BY timestamp DESC LIMIT 24
      `).all();
      // Reverse to chronological order
      res.json(rows.reverse());
    } catch (error) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  app.get("/api/history", (req, res) => {
    try {
      const { start, end, device_id } = req.query;
      let query = `
        SELECT t.*, c.name as collector_name 
        FROM telemetry t 
        LEFT JOIN collectors c ON t.device_id = c.device_id 
        WHERE 1=1
      `;
      const params: any[] = [];
      
      if (start) {
        query += ` AND t.timestamp >= ?`;
        params.push(start);
      }
      if (end) {
        query += ` AND t.timestamp <= ?`;
        params.push(end);
      }
      if (device_id) {
        query += ` AND t.device_id = ?`;
        params.push(device_id);
      }
      
      query += ` ORDER BY t.timestamp DESC LIMIT 1000`;
      
      const rows = db.prepare(query).all(...params);
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  app.delete("/api/telemetry", (req, res) => {
    try {
      db.prepare("DELETE FROM telemetry").run();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // The Pub/Sub push handler endpoint (Simulating MQTT data from EdgeLink)
  app.post("/push-handler", async (req, res) => {
    try {
      const envelope = req.body;
      if (!envelope || !envelope.message || !envelope.message.data) {
        return res.status(400).send("Bad Request: Invalid Pub/Sub message format");
      }

      const dataPayload = Buffer.from(envelope.message.data, "base64").toString("utf-8");
      const msgJson = JSON.parse(dataPayload);
      
      const deviceId = msgJson.device_id || "unknown_device";
      const power = msgJson.power || 0;
      const energyToday = msgJson.energy_today || 0;
      let status = "正常";

      // Simulate AI anomaly detection for power drops or spikes
      if (ai) {
        try {
          const prompt = `Analyze this solar PV telemetry data. Is there an anomaly (e.g., sudden drop in power, zero power during day)? 
          Respond with ONLY a JSON object: {"is_anomaly": true/false}.
          Data: {"power_kw": ${power}, "energy_kwh": ${energyToday}}`;
          
          const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: prompt,
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  is_anomaly: { type: Type.BOOLEAN },
                },
                required: ["is_anomaly"],
              },
            },
          });
          
          const result = JSON.parse(response.text || "{}");
          if (result.is_anomaly === true) status = "異常";
        } catch (aiError: any) {
          if (power < 0 || power > 1000) status = "異常";
        }
      } else {
        if (power < 0 || power > 1000) status = "異常";
      }

      const stmt = db.prepare("INSERT INTO telemetry (device_id, power, energy_today, status) VALUES (?, ?, ?, ?)");
      stmt.run(deviceId, power, energyToday, status);

      console.log(`Processed PV data for ${deviceId}: power=${power}kW, status=${status}`);
      res.status(200).send("OK");
    } catch (error) {
      console.error("Error processing message:", error);
      res.status(500).send("Internal Server Error");
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use((req, res, next) => {
      if (req.path.startsWith('/api') || req.path === '/push-handler') {
        next();
      } else {
        vite.middlewares(req, res, next);
      }
    });
  } else {
    app.use(express.static("dist"));
    // SPA fallback for production
    app.get("*", (req, res) => {
      res.sendFile("dist/index.html", { root: process.cwd() });
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
