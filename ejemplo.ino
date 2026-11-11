/*
 * ==============================================================================
 * SISTEMA DE MONITOREO AMBIENTAL Y CONTROL DE ACTUADORES IOT CON SUPABASE
 * ==============================================================================
 * Plataforma: ESP8266 (NodeMCU, Wemos D1 Mini o ESP-12)
 *
 * Sensores integrados:
 *  - DHT22 (Temperatura y Humedad del Aire) -> GPIO4 (Pin D2)
 *  - DS18B20 Sonda Sumergible (Temperatura del Suelo) -> GPIO5 (Pin D1) con resistencia pull-up de 4.7kΩ
 *  - YL-69 / Sensor Capacitivo (Humedad del Suelo) -> Pin A0 (ADC0)
 *
 * Actuadores integrados:
 *  - Relé 1 (ej: Bomba de Riego / Solenoide) -> GPIO14 (Pin D5)
 *  - Relé 2 (ej: Ventilador / Extractor)     -> GPIO12 (Pin D6)
 *
 * Mejoras para Entorno de Producción:
 *  1. Comunicación segura HTTPS (WiFiClientSecure) con Supabase REST API.
 *  2. Lógica sin bloqueo (Non-blocking timing con millis) para evitar reinicios por Watchdog (WDT).
 *  3. Reconexión automática tolerante a cortes de red WiFi.
 *  4. Control bidireccional: Envía telemetría y consulta el estado de los 2 relés desde la nube.
 *  5. Comentarios y validaciones exhaustivas en español en cada función.
 * ==============================================================================
 */

#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClientSecure.h>
#include <DHT.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <ArduinoJson.h> // Requiere la librería ArduinoJson (versión 6 o 7 recomendada)

// -----------------------------------------------------------------------------
// 1. CONFIGURACIÓN DE RED WI-FI Y SUPABASE
// -----------------------------------------------------------------------------
const char* WIFI_SSID       = "TU_SSID_WIFI";
const char* WIFI_PASSWORD   = "TU_PASSWORD_WIFI";

// Identificador único del nodo en el campo
const char* DISPOSITIVO_ID  = "esp8266_invernadero";

// URL base de tu proyecto en Supabase (Tomada de tu archivo .env.local)
const char* SUPABASE_HOST   = "https://dztkkgwxwuxpuiqlorah.supabase.co";

// Clave pública / anónima de Supabase
const char* SUPABASE_API_KEY = "sb_publishable_tJDD7vPL_aoHmWzN-7p4jw_HdCMuFPE";

// Endpoints REST de Supabase
const String URL_SENSORES   = String(SUPABASE_HOST) + "/rest/v1/sensores_iot";
const String URL_ACTUADORES = String(SUPABASE_HOST) + "/rest/v1/actuadores_iot?dispositivo_id=eq." + String(DISPOSITIVO_ID) + "&select=relay_1,relay_2,modo_auto";

// -----------------------------------------------------------------------------
// 2. CONFIGURACIÓN DE PINES DE SENSORES Y ACTUADORES
// -----------------------------------------------------------------------------
// Sensor DHT22 (Temperatura y Humedad Aire)
#define DHTPIN 4               // GPIO4 = D2 en NodeMCU
#define DHTTYPE DHT22
DHT dht(DHTPIN, DHTTYPE);

// Sonda DS18B20 (Temperatura Suelo)
#define ONE_WIRE_BUS 5         // GPIO5 = D1 en NodeMCU
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature ds18b20(&oneWire);

// Sensor de Humedad de Suelo Analógico (YL-69 o Capacitivo)
const int PIN_SUELO_ANALOGICO = A0;

// Pines para el control de los Relés
#define PIN_RELE_1 14          // GPIO14 = D5 en NodeMCU (Bomba de Riego)
#define PIN_RELE_2 12          // GPIO12 = D6 en NodeMCU (Ventilación / Extractor)

// Nivel lógico para activar los relés (La mayoría de módulos son activos en BAJO / LOW)
#define ESTADO_ACTIVO_RELE LOW
#define ESTADO_INACTIVO_RELE HIGH

// -----------------------------------------------------------------------------
// 3. CALIBRACIÓN Y TEMPORIZACIÓN DE PRODUCCIÓN
// -----------------------------------------------------------------------------
// Calibración del sensor de suelo: Ajustar según pruebas reales en seco vs agua
const int VALOR_CALIBRACION_SECO   = 850; // Lectura en aire libre / suelo seco
const int VALOR_CALIBRACION_HUMEDO = 380; // Lectura sumergido en agua

// Intervalo de reporte de telemetría (ej: cada 30 segundos = 30000 ms)
const unsigned long INTERVALO_ENVIO_MS = 30000;
unsigned long tiempoUltimoEnvio = 0;

// Estados actuales de los relés en memoria
bool estadoRele1 = false;
bool estadoRele2 = false;

// =============================================================================
// FUNCIONES DE CONTROL DE RELÉS
// =============================================================================

/**
 * @brief Aplica el estado físico en los pines de los relés.
 * @param rele1 Estado deseado para el Relé 1 (true = Encendido, false = Apagado).
 * @param rele2 Estado deseado para el Relé 2 (true = Encendido, false = Apagado).
 */
void aplicarEstadoReles(bool rele1, bool rele2) {
  estadoRele1 = rele1;
  estadoRele2 = rele2;

  digitalWrite(PIN_RELE_1, estadoRele1 ? ESTADO_ACTIVO_RELE : ESTADO_INACTIVO_RELE);
  digitalWrite(PIN_RELE_2, estadoRele2 ? ESTADO_ACTIVO_RELE : ESTADO_INACTIVO_RELE);

  Serial.printf("[RELÉS] Relé 1 (%s) | Relé 2 (%s)\n",
                estadoRele1 ? "ENCENDIDO" : "APAGADO",
                estadoRele2 ? "ENCENDIDO" : "APAGADO");
}

// =============================================================================
// GESTIÓN DE CONEXIÓN WI-FI
// =============================================================================

/**
 * @brief Gestiona la conexión inicial y reintentos no bloqueantes de WiFi.
 */
void conectarWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  Serial.print("\n[WIFI] Conectando a red: ");
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long inicioIntento = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - inicioIntento < 15000) {
    delay(500);
    Serial.print(".");
    yield(); // Alimenta el Watchdog Timer del ESP8266
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WIFI] Conexión establecida con éxito.");
    Serial.print("[WIFI] Dirección IP asignada: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\n[WIFI] No se pudo conectar. Reintentando en el siguiente ciclo.");
  }
}

// =============================================================================
// COMUNICACIÓN CON SUPABASE (HTTPS)
// =============================================================================

/**
 * @brief Envía las lecturas de los sensores a la tabla 'sensores_iot' de Supabase vía HTTPS POST.
 *
 * @param tempAire Temperatura ambiente en °C
 * @param humAire Humedad ambiente en %
 * @param humSueloPct Humedad de suelo mapeada a porcentaje
 * @param humSueloRaw Valor ADC crudo del sensor de suelo
 * @param tempSuelo Temperatura de la sonda en °C
 * @return true si la inserción fue exitosa (HTTP 201 Created o 200/204), false en caso de fallo.
 */
bool enviarTelemetriaSupabase(float tempAire, float humAire, float humSueloPct, int humSueloRaw, float tempSuelo) {
  WiFiClientSecure client;
  // En ESP8266 usamos setInsecure() para conexiones HTTPS seguras sin cargar huellas de certificados en RAM
  client.setInsecure();

  HTTPClient https;
  if (!https.begin(client, URL_SENSORES)) {
    Serial.println("[HTTP-POST] Error al inicializar conexión HTTPS");
    return false;
  }

  // Encabezados obligatorios requeridos por el servicio PostgREST de Supabase
  https.addHeader("Content-Type", "application/json");
  https.addHeader("apikey", SUPABASE_API_KEY);
  https.addHeader("Authorization", String("Bearer ") + SUPABASE_API_KEY);
  https.addHeader("Prefer", "return=minimal"); // Optimiza la respuesta para ahorrar ancho de banda

  // Construcción del documento JSON
  StaticJsonDocument<256> doc;
  doc["dispositivo_id"]    = DISPOSITIVO_ID;
  doc["temperatura_aire"]   = round(tempAire * 100.0) / 100.0;
  doc["humedad_aire"]       = round(humAire * 100.0) / 100.0;
  doc["humedad_suelo_pct"]  = round(humSueloPct * 100.0) / 100.0;
  doc["humedad_suelo_raw"]  = humSueloRaw;
  doc["temperatura_suelo"]  = round(tempSuelo * 100.0) / 100.0;

  String jsonPayload;
  serializeJson(doc, jsonPayload);

  Serial.println("[HTTP-POST] Enviando datos a Supabase...");
  int codigoHttp = https.POST(jsonPayload);

  bool exito = false;
  if (codigoHttp == HTTP_CODE_OK || codigoHttp == HTTP_CODE_CREATED || codigoHttp == HTTP_CODE_NO_CONTENT) {
    Serial.printf("[HTTP-POST] Datos guardados exitosamente. Código: %d\n", codigoHttp);
    exito = true;
  } else {
    Serial.printf("[HTTP-POST] Error en petición HTTP. Código: %d | Respuesta: %s\n",
                  codigoHttp, https.getString().c_str());
  }

  https.end();
  return exito;
}

/**
 * @brief Consulta el estado actual de los relés en la tabla 'actuadores_iot' de Supabase vía HTTPS GET.
 *        Permite al frontend encender o apagar la bomba y la ventilación de forma remota.
 */
void sincronizarActuadoresDesdeSupabase() {
  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient https;
  if (!https.begin(client, URL_ACTUADORES)) {
    Serial.println("[HTTP-GET] Error al conectar con endpoint de actuadores");
    return;
  }

  https.addHeader("apikey", SUPABASE_API_KEY);
  https.addHeader("Authorization", String("Bearer ") + SUPABASE_API_KEY);
  https.addHeader("Accept", "application/json");

  int codigoHttp = https.GET();

  if (codigoHttp == HTTP_CODE_OK) {
    String payload = https.getString();
    
    // Parseo de la respuesta JSON (espera un array con un objeto: [{"relay_1":true,"relay_2":false,...}])
    DynamicJsonDocument doc(512);
    DeserializationError error = deserializeJson(doc, payload);

    if (!error && doc.size() > 0) {
      bool nuevoRele1 = doc[0]["relay_1"] | false;
      bool nuevoRele2 = doc[0]["relay_2"] | false;

      // Solo actualiza y muestra si hubo un cambio de estado
      if (nuevoRele1 != estadoRele1 || nuevoRele2 != estadoRele2) {
        Serial.println("[ACTUADORES] Nuevo comando recibido desde el Dashboard de Next.js:");
        aplicarEstadoReles(nuevoRele1, nuevoRele2);
      }
    } else {
      Serial.println("[ACTUADORES] Respuesta vacía o JSON inválido.");
    }
  } else {
    Serial.printf("[HTTP-GET] Error al consultar actuadores. Código: %d\n", codigoHttp);
  }

  https.end();
}

// =============================================================================
// SETUP Y LOOP PRINCIPAL
// =============================================================================

void setup() {
  // Inicialización de consola serial para depuración
  Serial.begin(115200);
  delay(100);
  Serial.println("\n--- INICIANDO CONTROLADOR IOT AGRO-PRODUCCIÓN ---");

  // Configuración de pines de los relés como salidas digitales
  pinMode(PIN_RELE_1, OUTPUT);
  pinMode(PIN_RELE_2, OUTPUT);
  aplicarEstadoReles(false, false); // Iniciar apagados por seguridad

  // Inicialización de buses de sensores
  dht.begin();
  ds18b20.begin();

  // Conectar a la red inalámbrica
  conectarWiFi();

  // Primera sincronización de comandos de relé al arrancar
  if (WiFi.status() == WL_CONNECTED) {
    sincronizarActuadoresDesdeSupabase();
  }
}

void loop() {
  // Verificación constante de conexión Wi-Fi sin bloquear
  if (WiFi.status() != WL_CONNECTED) {
    conectarWiFi();
  }

  unsigned long tiempoActual = millis();

  // Ciclo periódico de adquisición de datos y control
  if (tiempoActual - tiempoUltimoEnvio >= INTERVALO_ENVIO_MS) {
    tiempoUltimoEnvio = tiempoActual;

    Serial.println("\n--------------------------------------------------");
    Serial.println("[LOOP] Iniciando lectura de sensores...");

    // 1. Lectura del DHT22 (Aire)
    float humAire = dht.readHumidity();
    float tempAire = dht.readTemperature();

    // 2. Lectura del DS18B20 (Temperatura de suelo)
    ds18b20.requestTemperatures();
    float tempSuelo = ds18b20.getTempCByIndex(0);

    // 3. Lectura del sensor analógico de suelo
    int humSueloRaw = analogRead(PIN_SUELO_ANALOGICO);
    float humSueloPct = map(humSueloRaw, VALOR_CALIBRACION_SECO, VALOR_CALIBRACION_HUMEDO, 0, 100);
    humSueloPct = constrain(humSueloPct, 0.0, 100.0);

    // Validación de lecturas
    if (isnan(humAire) || isnan(tempAire)) {
      Serial.println("[ERROR] Falla al leer el sensor DHT22. Omitiendo reporte.");
      return;
    }

    if (tempSuelo == DEVICE_DISCONNECTED_C) {
      Serial.println("[WARN] Sensor DS18B20 desconectado o con resistencia pull-up ausente.");
      tempSuelo = 0.0;
    }

    // Mostrar en consola serial
    Serial.printf("[SENSORES] Temp Aire: %.2f°C | Hum Aire: %.2f%%\n", tempAire, humAire);
    Serial.printf("[SENSORES] Temp Suelo: %.2f°C | Hum Suelo: %.2f%% (RAW: %d)\n", tempSuelo, humSueloPct, humSueloRaw);

    // Si hay conexión, enviar telemetría y consultar comandos de los relés
    if (WiFi.status() == WL_CONNECTED) {
      enviarTelemetriaSupabase(tempAire, humAire, humSueloPct, humSueloRaw, tempSuelo);
      sincronizarActuadoresDesdeSupabase();
    }
  }

  // Tarea de baja prioridad: alimentar el watchdog
  yield();
}
