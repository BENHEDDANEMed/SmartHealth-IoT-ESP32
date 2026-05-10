from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pymongo import MongoClient
import json
from typing import List
from datetime import datetime

app = FastAPI(title="Smart Health IoT API")

# Configuration CORS pour permettre la communication avec le dashboard React
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Configuration MongoDB ---
# Assure-toi que ton service MongoDB est bien lancé localement
try:
    mongo_client = MongoClient("mongodb://localhost:27017/")
    db = mongo_client["smart_health_db"]
    collection = db["health_data"]
    print("✅ Connecté à MongoDB avec succès !")
except Exception as e:
    print(f"❌ Erreur de connexion MongoDB : {e}")

# --- Modèle de Données Pydantic ---
# Ce modèle doit correspondre exactement au JSON envoyé par l'ESP32
class HealthData(BaseModel):
    heart_rate: int
    tension_sys: int
    glucose: float
    temperature: float
    humidity: float
    status: int       # 0: Stable, 1: Alerte, 2: Danger
    message: str      # Le message diagnostic (ex: "DANGER CRITIQUE")

# --- Gestionnaire WebSocket ---
# Permet de pousser les données vers l'interface React sans rafraîchir la page
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception:
                # Gère les connexions fantômes
                pass

manager = ConnectionManager()

# --- Route principale pour l'ESP32 ---
@app.post("/data/")
async def receive_data(data: HealthData):
    print("\n" + "="*40)
    print(f"🏥 DONNÉES REÇUES LE {datetime.now().strftime('%H:%M:%S')}")
    print(f"Statut : {data.status} | Message : {data.message}")
    print(f"BPM : {data.heart_rate} | Tension : {data.tension_sys} | Glucose : {data.glucose}")
    
    # Détermine si c'est une anomalie pour le dashboard React
    is_anomaly = True if data.status == 2 else False
    
    # 1. Préparation du message pour le WebSocket (Frontend React)
    ws_payload = {
        "heart_rate": data.heart_rate,
        "tension_sys": data.tension_sys,
        "glucose": data.glucose,
        "temperature": data.temperature,
        "humidity": data.humidity,
        "status": data.status,
        "message": data.message,
        "anomaly": is_anomaly,
        "timestamp": datetime.now().isoformat()
    }
    
    try:
        await manager.broadcast(json.dumps(ws_payload))
    except Exception as e:
        print(f"⚠️ Erreur lors de la diffusion WebSocket : {e}")

    # 2. Sauvegarde dans la base de données MongoDB
    try:
        db_record = data.dict()
        db_record["anomaly_detected"] = is_anomaly
        db_record["timestamp"] = datetime.now()
        collection.insert_one(db_record)
        print("💾 Données archivées dans MongoDB")
    except Exception as e:
        print(f"❌ Erreur MongoDB : {e}")

    # 3. Réponse de succès à l'ESP32
    return {"status": "success", "info": "Données traitées"}

# --- Endpoint WebSocket ---
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # On attend les messages (même si React ne fait qu'écouter ici)
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        print("🔌 Client WebSocket déconnecté")

if __name__ == "__main__":
    import uvicorn
    # Lancement du serveur sur le port 8000
    uvicorn.run(app, host="0.0.0.0", port=8000)