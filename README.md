# analisis_datos_upea

## Plataforma IoT Agroindustrial: Monitoreo y Control Bidireccional de Relés con Supabase y Next.js 15

Este proyecto proporciona una solución completa de nivel de producción que integra:
1. **Microcontrolador ESP8266 / NodeMCU (`ejemplo.ino`)**: Lectura de sensores de campo y control físico de 2 relés mediante HTTPS seguro hacia Supabase.
2. **Base de Datos & Realtime Supabase (`supabase_setup.sql`)**: Esquema optimizado para series de tiempo, tablas de actuadores, políticas RLS y soporte WebSockets en vivo.
3. **Frontend Dashboard en Next.js 15 + Tailwind CSS**: Autenticación con correo y contraseña (Supabase Auth), KPIs en tiempo real, gráficos de evolución temporal y **conmutación interactiva de Relé 1 (Bomba de Riego) y Relé 2 (Extractor/Ventilación)**.

---

## 📁 Estructura del Proyecto

```text
analisis_datos/
├── app/
│   ├── auth/
│   │   └── actions.ts           # Server Actions para Login, Registro y Logout
│   ├── dashboard/
│   │   ├── page.tsx             # Server Component: Valida sesión y carga datos
│   │   └── dashboard-client.tsx # Client Component: Realtime, conmutación de Relés, KPIs y Gráficos
│   ├── login/
│   │   └── page.tsx             # Pantalla de acceso por correo y contraseña
│   ├── globals.css              # Estilos Tailwind e interfaz temática oscura
│   ├── layout.tsx               # Layout raíz
│   └── page.tsx                 # Redirección inteligente de rutas
├── utils/
│   └── supabase/
│       ├── client.ts            # Cliente Supabase para el navegador (use client)
│       ├── server.ts            # Cliente Supabase para Server Actions y RSC
│       └── middleware.ts        # Manejo de cookies y protección de rutas
├── middleware.ts                # Interceptor global de Next.js
├── ejemplo.ino                  # Firmware de producción para ESP8266 (Sensores + 2 Relés)
├── supabase_setup.sql           # Script SQL para tablas, RLS, Realtime y Seed Data
├── package.json                 # Dependencias y scripts
├── tsconfig.json                # Configuración TypeScript
└── .env.local                   # Credenciales de Supabase
```

---

## 🛠️ Paso 1: Configurar la Base de Datos en Supabase

1. Inicia sesión en [Supabase](https://supabase.com) y abre tu proyecto.
2. Ve a la sección **SQL Editor** en el panel izquierdo.
3. Abre y copia el contenido del archivo [`supabase_setup.sql`](./supabase_setup.sql) y pulsa **Run**.
   - Creará la tabla `sensores_iot` con índices de serie temporal.
   - Creará la tabla `actuadores_iot` para controlar `relay_1` y `relay_2`.
   - Configurará las directivas de seguridad **Row Level Security (RLS)**.
   - Habilitará la publicación **Realtime** para actualizaciones instantáneas vía WebSocket.

---

## ⚙️ Paso 2: Conectar el Hardware en el ESP8266

| Componente | Pin en ESP8266 | Descripción / Notas |
|---|---|---|
| **DHT22** (Temp/Hum Aire) | **GPIO4 (D2)** | Requiere resistencia pull-up de 10kΩ entre VCC y Datos. |
| **DS18B20** (Temp Suelo) | **GPIO5 (D1)** | Sonda sumergible. Requiere resistencia de 4.7kΩ entre VCC y Datos. |
| **YL-69** (Hum Suelo) | **A0 (ADC0)** | Salida analógica. Calibrar valores seco/húmedo en el código. |
| **Relé 1 (Bomba)** | **GPIO14 (D5)** | Módulo de relé optoacoplado de 5V (Normalmente Abierto/Cerrado). |
| **Relé 2 (Ventilador)** | **GPIO12 (D6)** | Módulo de relé optoacoplado de 5V para ventilación/extractor. |

### Configuración del Firmware en Arduino IDE:
1. Abre [`ejemplo.ino`](./ejemplo.ino).
2. Asegúrate de instalar las librerías:
   - `DHT sensor library` (Adafruit)
   - `DallasTemperature` y `OneWire`
   - `ArduinoJson` (versión 6 o 7)
3. Modifica tus credenciales en las primeras líneas:
   ```cpp
   const char* WIFI_SSID     = "TU_NOMBRE_DE_RED";
   const char* WIFI_PASSWORD = "TU_CONTRASEÑA";
   ```
4. Conecta el ESP8266 por USB, selecciona la placa y el puerto COM, y súbelo.

---

## 💻 Paso 3: Ejecutar el Dashboard en Desarrollo

1. Asegúrate de tener configurado tu archivo `.env.local`:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=tu-clave-publica
   ```
2. Inicia el servidor de desarrollo de Next.js:
   ```powershell
   npm run dev
   ```
3. Abre tu navegador en [http://localhost:3000](http://localhost:3000).
4. Crea una cuenta en la pestaña **Registrarse** con tu correo y contraseña.
5. Ingresa al dashboard y podrás:
   - **Activar o desactivar el Relé 1 y el Relé 2** con respuesta en milisegundos.
   - Observar las métricas de los sensores en tiempo real tan pronto el ESP8266 envíe telemetría.
   - Inspeccionar gráficos de tendencia y tabla de historial.

