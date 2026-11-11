# analisis_datos_upea

## Sistema SCADA IoT Agroindustrial: Monitoreo Multivariable y Control Bidireccional de Actuadores con Supabase y Next.js 15

> **Proyecto de Grado de Ingeniería de Sistemas / Informática / Telecomunicaciones**  
> **Universidad Pública de El Alto (UPEA)**

---

## 📋 Resumen del Proyecto

Este proyecto implementa una arquitectura SCADA IoT distribuida en la nube para la supervisión y control de variables microclimáticas y del sustrato en ambientes agrícolas controlados (invernaderos o viveros inteligentes):

1. **Hardware de Campo (ESP8266)**: Adquisición de telemetría de 4 variables ambientales y control físico conmutado de 2 relés de potencia (bomba de riego y extractor de aire).
2. **Base de Datos y Motor en la Nube (Supabase / PostgreSQL)**:
   - Esquema en Tercera Forma Normal (3FN) con catálogo de nodos, umbrales y alertas agronómicas.
   - Algoritmo en PL/pgSQL para cálculo del **Déficit de Presión de Vapor (VPD)** y control en lazo cerrado.
   - Trazabilidad y auditoría de comandos mediante WebSockets con Supabase Realtime.
3. **Plataforma Web (Next.js 15 + React 19 + Tailwind CSS)**:
   - Autenticación segura de operadores e investigadores.
   - Panel de control SCADA con conmutación manual y automática de relés.
   - Gráficas de tendencias temporales y exportación de datos en formato CSV para análisis estadístico (SPSS, Python, R).

---

## 🛠️ Especificaciones de Hardware y Lista de Componentes (BOM)

| Componente | Función en el Sistema | Parámetros Operativos |
|---|---|---|
| **ESP8266 NodeMCU v3 (ESP-12E)** | Unidad de Control de Campo (MCU) | Wi-Fi 802.11 b/g/n, 80MHz, 3.3V lógica |
| **DHT22 / AM2302** | Temperatura y Humedad del Aire | -40 a 80°C (±0.5°C), 0 a 100% RH (±2%) |
| **DS18B20 Sonda Sumergible** | Temperatura del Suelo / Sustrato | -55 a +125°C (±0.5°C), protocolo 1-Wire, acero inox |
| **YL-69 / Sensor Capacitivo** | Humedad de Suelo (Humedad Volumétrica) | Salida analógica 0 - 3.3V (ADC A0) |
| **Módulo de Relés Dual (2 Canales)** | Conmutación de Cargas (Bomba y Extractor) | Bobina 5V DC, Optoacoplado, Contactos 10A/250VAC |
| **Resistencia 4.7 kΩ (1/4 W)** | Pull-Up obligatoria para bus 1-Wire | Entre VCC (3.3V) y línea DATA del DS18B20 |
| **Resistencia 10 kΩ (1/4 W)** | Pull-Up para sensor DHT22 | Entre VCC (3.3V) y línea DATA del DHT22 |
| **Fuente de Alimentación 5V / 2A** | Alimentación del ESP8266 y bobinas de relé | Conexión a pin VIN del NodeMCU y VCC de relés |

---

## 🔌 Esquema y Tabla de Conexión de Pines (Pinout)

| Componente Físico | Pin del Sensor / Módulo | Pin NodeMCU (Serigrafía) | GPIO ESP8266 | Tipo de Señal |
|---|---|---|---|---|
| **DHT22** | Pin 1 (VCC) | **3V3** | 3.3V DC | Alimentación |
| **DHT22** | Pin 2 (DATA) | **D2** | **GPIO 4** | Digital Bidireccional (con R 10kΩ a 3V3) |
| **DHT22** | Pin 4 (GND) | **GND** | GND | Tierra común |
| **DS18B20** | Cable Rojo (VCC) | **3V3** | 3.3V DC | Alimentación |
| **DS18B20** | Cable Amarillo/Blanco (DATA) | **D1** | **GPIO 5** | Bus 1-Wire (con R 4.7kΩ a 3V3) |
| **DS18B20** | Cable Negro (GND) | **GND** | GND | Tierra común |
| **YL-69 (Suelo)** | Pin A0 (Salida Analógica) | **A0** | **ADC0** | Entrada Analógica (0 - 1.0V máx interno) |
| **YL-69 (Suelo)** | VCC / GND | **3V3 / GND** | 3.3V / GND | Alimentación del circuito sensor |
| **Módulo Relé** | VCC / GND | **VIN (5V) / GND** | 5V / GND | Alimentación bobina |
| **Relé 1 (Bomba)** | IN1 (Disparo Relé 1) | **D5** | **GPIO 14** | Salida Digital (Activo en LOW) |
| **Relé 2 (Extractor)**| IN2 (Disparo Relé 2) | **D6** | **GPIO 12** | Salida Digital (Activo en LOW) |

> ⚠️ **Importante**: Ambos relés son conmutados en lógica **Activa en BAJO (`LOW`)**, común en módulos optoacoplados industriales de 5V. La alimentación del módulo de relés debe conectarse al pin `VIN` (5V del USB) y compartir la tierra (`GND`) con el ESP8266.

---

## 💻 Configuración de Arduino IDE

### 1. Agregar soporte para placas ESP8266:
1. Abre **Arduino IDE** (versión 2.x o 1.8.x).
2. Ve a **Archivo** ➔ **Preferencias** (o `Ctrl + Coma`).
3. En el campo *"Gestor de URLs Adicionales de Tarjetas"*, pega la siguiente URL:
   ```text
   http://arduino.esp8266.com/stable/package_esp8266com_index.json
   ```
4. Ve a **Herramientas** ➔ **Placa** ➔ **Gestor de Tarjetas...**.
5. Busca `esp8266` e instala el paquete oficial de **ESP8266 Community**.

### 2. Instalación de Librerías Requeridas:
En Arduino IDE ve a **Herramientas** ➔ **Administrar Bibliotecas...** e instala:
* **`ArduinoJson`** (por Benoit Blanchon) ➔ Versión **6.21.x** o **7.x**.
* **`DHT sensor library`** (por Adafruit) ➔ Instalar junto con su dependencia `Adafruit Unified Sensor`.
* **`DallasTemperature`** (por Miles Burton).
* **`OneWire`** (por Paul Stoffregen).

### 3. Cargar el Firmware:
1. Abre el archivo [`ejemplo.ino`](./ejemplo.ino).
2. Edita las constantes de conexión:
   ```cpp
   const char* WIFI_SSID     = "TU_RED_WIFI";
   const char* WIFI_PASSWORD = "TU_CONTRASEÑA";
   ```
3. Selecciona la placa: **NodeMCU 1.0 (ESP-12E Module)** o **Generic ESP8266 Module**.
4. Selecciona el puerto COM correspondiente y pulsa **Subir (Upload)**.
5. Abre el **Monitor Serie** a `115200 baudios` para verificar las lecturas de telemetría y los comandos de relé.

---

## 🗄️ Configuración de la Base de Datos en Supabase

1. Entra a tu cuenta en [Supabase](https://supabase.com) y crea o selecciona tu proyecto.
2. Abre la sección **SQL Editor** en el menú izquierdo.
3. Copia todo el contenido del archivo [`supabase_setup.sql`](./supabase_setup.sql) y haz clic en **Run**.
   * Crea las tablas normalizadas: `dispositivos_iot`, `umbrales_agronomicos`, `sensores_iot`, `actuadores_iot`, `auditoria_comandos_actuadores` y `alertas_incidentes_iot`.
   * Habilita los disparadores en PL/pgSQL para cálculo de **VPD (Déficit de Presión de Vapor)** y reglas en lazo cerrado.
   * Configura las políticas **Row Level Security (RLS)** y las suscripciones **Realtime**.

4. **Configuración de Autenticación para Producción**:
   - Ve a **Authentication** ➔ **URL Configuration**:
     - **Site URL**: Cambia `http://localhost:3000` por la URL de producción (o tu IP local de red).
     - **Redirect URLs**: Agrega `http://localhost:3000/**` y tu dominio en producción.
   - Ve a **Authentication** ➔ **Providers** ➔ **Email**:
     - *Recomendación*: Desmarca **"Confirm email"** para que los operadores puedan registrarse e ingresar al dashboard de inmediato.

---

## 🚀 Despliegue del Proyecto en Otra Computadora (Paso a Paso)

Sigue estos pasos para clonar y ejecutar el panel web en cualquier otra máquina (Windows, Linux o Mac):

### 1. Prerrequisitos:
* Tener instalado **Node.js** (versión 18.x, 20.x o superior) y **npm**:
  - Descargar desde: [https://nodejs.org](https://nodejs.org)
* Tener instalado **Git**:
  - Descargar desde: [https://git-scm.com](https://git-scm.com)

### 2. Clonar el repositorio:
Abre una terminal o PowerShell y ejecuta:
```bash
git clone https://github.com/nvruben10-cyber/analisis_datos_upea.git
cd analisis_datos_upea
```

### 3. Configurar variables de entorno (`.env.local`):
Crea un archivo llamado `.env.local` en la raíz del proyecto (basado en `.env.example`):
```env
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=tu-clave-anon-publica
```
*(Puedes obtener estas dos claves en tu panel de Supabase: **Project Settings** ➔ **API**).*

### 4. Instalar dependencias:
```bash
npm install
```

### 5. Iniciar el servidor en modo desarrollo:
```bash
npm run dev
```

Abre tu navegador en:
```text
http://localhost:3000
```

### 6. Compilar para Producción (Opcional):
```bash
npm run build
npm run start
```

---

## 📊 Características del Dashboard SCADA

* **Control Remoto de Relés**:
  - **Relé 1 (Bomba de Riego)**: Conmutación manual o por regla automática cuando la humedad del suelo cae por debajo del 30%.
  - **Relé 2 (Extractor de Aire)**: Conmutación manual o por regla automática cuando la temperatura del aire supera los 30°C.
* **Telemetría Multivariable en Vivo**:
  - Temperatura del aire (°C) y humedad relativa (% RH).
  - Humedad del sustrato (%) con barra de capacidad de campo y valor analógico ADC crudo.
  - Temperatura de suelo (°C) con sonda sumergible DS18B20.
  - **Cálculo de VPD Agronómico (kPa)** y **Punto de Rocío (°C)** en tiempo real.
* **Gestión de Incidentes y Auditoría**:
  - Visualización y resolución de alarmas críticas.
  - Bitácora inmutable con el usuario, fecha y justificación de cada orden enviada.
* **Exportación de Datos**:
  - Botón integrado para descargar todo el histórico en formato **CSV compatible con Excel, SPSS y Python/Pandas**.

---

## 👥 Créditos y Autoría

* **Universidad**: Universidad Pública de El Alto (UPEA)
* **Carrera**: Ingeniería de Sistemas / Informática
* **Repositorio**: [https://github.com/nvruben10-cyber/analisis_datos_upea.git](https://github.com/nvruben10-cyber/analisis_datos_upea.git)
* **Licencia**: MIT
