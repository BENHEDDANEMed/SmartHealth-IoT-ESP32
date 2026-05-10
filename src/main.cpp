#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <DHTesp.h>
#include <LiquidCrystal_I2C.h>

// --- CONFIGURATION RÉSEAU ---
const char* ssid = "Wokwi-GUEST";
const char* password = "";
const char* serverName = "https://5k6xq3wq-8000.uks1.devtunnels.ms/data/";

// --- BROCHES ---
const int LED_VERTE = 18;
const int LED_ORANGE = 19;
const int LED_ROUGE = 2;
const int BUZZER_PIN = 4;
const int PIN_BPM = 34;
const int PIN_TENSION = 35;
const int PIN_GLUCOSE = 32;
const int DHT_PIN = 15; // Broche du capteur de température

DHTesp dht;
LiquidCrystal_I2C lcd(0x27, 16, 2);

// 🔊 FONCTION ALARME SONORE
void alarmeSonore() {
  for(int i = 0; i < 200; i++) {
    digitalWrite(BUZZER_PIN, HIGH);
    delayMicroseconds(500); 
    digitalWrite(BUZZER_PIN, LOW);
    delayMicroseconds(500);
  }
}

void connecterWifi() {
  if (WiFi.status() == WL_CONNECTED) return;
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) { delay(500); }
}

void setup() {
  Serial.begin(115200);
  pinMode(LED_VERTE, OUTPUT);
  pinMode(LED_ORANGE, OUTPUT);
  pinMode(LED_ROUGE, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  
  // Initialisation Capteurs et Écran
  dht.setup(DHT_PIN, DHTesp::DHT22);
  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0); 
  lcd.print("SmartHealth v4");
  
  // --- TEST DU BUZZER ---
  digitalWrite(LED_ROUGE, HIGH); 
  alarmeSonore(); 
  digitalWrite(LED_ROUGE, LOW); 
  
  connecterWifi();
}

void loop() {
  connecterWifi(); 

  // 1. LECTURE DES CAPTEURS
  int bpm = map(analogRead(PIN_BPM), 0, 4095, 40, 180);
  int sys = map(analogRead(PIN_TENSION), 0, 4095, 80, 190);
  float glu = map(analogRead(PIN_GLUCOSE), 0, 4095, 50, 250) / 100.0;
  
  // Lecture du DHT22
  TempAndHumidity dhtData = dht.getTempAndHumidity();
  float temp = dhtData.temperature;
  float hum = dhtData.humidity;
  
  // Sécurité si le capteur bug au démarrage
  if (isnan(temp)) temp = 37.0; 

  // 2. LOGIQUE DE DIAGNOSTIC MEDICAL
  int status = 0; 
  String msg = "PATIENT STABLE";

  // DANGER : Problèmes cardiaques, tension extrême, ou température critique (>39 ou <35)
  if (bpm > 115 || bpm < 50 || sys > 155 || glu > 1.35 || temp >= 39.0 || temp <= 35.0) {
    status = 2;
    msg = "DANGER CRITIQUE";
  } 
  // ALERTE : Paramètres élevés ou Fièvre modérée (>38)
  else if (bpm > 95 || sys > 135 || glu > 1.15 || temp >= 38.0) {
    status = 1;
    msg = "SURVEILLANCE";
  }

  // 3. ACTIONS PHYSIQUES IMMÉDIATES
  if (status == 2) { 
    digitalWrite(LED_ROUGE, HIGH); digitalWrite(LED_ORANGE, LOW); digitalWrite(LED_VERTE, LOW);
    alarmeSonore(); delay(100); alarmeSonore(); // Double Bip
  } 
  else if (status == 1) {
    digitalWrite(LED_ROUGE, LOW); digitalWrite(LED_ORANGE, HIGH); digitalWrite(LED_VERTE, LOW);
  } 
  else {
    digitalWrite(LED_ROUGE, LOW); digitalWrite(LED_ORANGE, LOW); digitalWrite(LED_VERTE, HIGH);
  }

  // 4. AFFICHAGE LCD ULTRA-COMPACT (Max 16 caractères)
  lcd.clear();
  lcd.setCursor(0, 0); 
  lcd.print("B"); lcd.print(bpm); 
  lcd.print(" G"); lcd.print(glu, 1);
  lcd.print(" T"); lcd.print(temp, 1); // Ex: B120 G1.2 T38.5
  
  lcd.setCursor(0, 1); 
  lcd.print(msg);

  // 5. ENVOI AU BACKEND (Inclut maintenant Temp & Hum)
  if (WiFi.status() == WL_CONNECTED) {
    WiFiClientSecure client;
    client.setInsecure();
    HTTPClient http;
    http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
    
    if (http.begin(client, serverName)) {
      http.addHeader("Content-Type", "application/json");
      http.addHeader("X-Skip-Browser-Warning", "true"); 

      JsonDocument doc;
      doc["heart_rate"] = bpm;
      doc["tension_sys"] = sys;
      doc["glucose"] = glu;
      doc["temperature"] = temp; // Ajouté !
      doc["humidity"] = hum;     // Ajouté !
      doc["status"] = status;
      doc["message"] = msg;

      String json;
      serializeJson(doc, json);
      http.POST(json);
      http.end();
    }
  }
  
  delay(1200); 
}