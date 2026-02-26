# Recipe Pantry - Personal Edition

Una aplicación web progresiva (PWA) moderna para gestionar tus recetas personales, con diseño Material 3 Expressive, soporte OCR y sincronización en la nube vía Supabase.

## 🚀 Características

- **Diseño Premium**: Interfaz Material 3 adaptada a móviles y escritorio.
- **Gestión de Recetas**: Crea, edita y organiza tus recetas favoritas.
- **OCR Integrado**: Escanea fotos de recetas físicas para extraer texto automáticamente.
- **Modo Cocina**: Guía paso a paso interactiva.
- **Privacidad**: Datos almacenados de forma segura en tu propia cuenta.

## 🛠️ Stack Tecnológico

- **Frontend**: HTML5, Vanilla CSS3, JavaScript (ES Modules).
- **Backend**: Supabase (PostgreSQL, Auth, Storage).
- **OCR**: Tesseract.js.
- **Iconos**: Phosphor Icons / Material Symbols.

## 📂 Estructura del Proyecto

```
recipe-pantry/
├── index.html              # Punto de entrada
├── css/
│   ├── styles.css         # Variables globales y reset
│   ├── components.css     # Estilos de componentes (tarjetas, botones)
│   └── responsive.css     # Media queries
├── js/
│   ├── app.js             # Lógica principal y routing
│   ├── supabase-client.js # Cliente de conexión a BD
│   ├── auth.js            # Gestión de usuarios
│   └── ocr.js             # Procesamiento de imágenes
└── assets/                 # Recursos estáticos
```

## 🔧 Configuración

1.  **Requisitos**:
    - Navegador moderno.
    - Conexión a internet (para Supabase).

2.  **Instalación**:
    - Clona el repositorio.
    - Configura tus credenciales de Supabase en `js/supabase-client.js`.
    - Abre `index.html` en tu navegador o sírvelo con un servidor local (ej. Live Server).

## 📄 Licencia

Uso personal.
