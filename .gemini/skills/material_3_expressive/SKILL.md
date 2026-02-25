---
name: material_3_expressive
description: Guía y recursos para el uso del sistema de diseño Material 3 Expressive en RecipeHub.
---

# Material 3 Expressive Skill

Esta skill contiene las directrices, componentes y patrones necesarios para implementar Material 3 Expressive utilizando la librería `material-esm/material`.

## Configuración de Infraestructura

Para utilizar los componentes, es necesario incluir el siguiente `importmap` en el `<head>` del documento:

```html
<script type="importmap">
  {
    "imports": {
      "lit": "https://cdn.jsdelivr.net/npm/lit@3/index.js",
      "lit/": "https://cdn.jsdelivr.net/npm/lit@3/",
      "@lit/localize": "https://cdn.jsdelivr.net/npm/@lit/localize/lit-localize.js",
      "@lit/reactive-element": "https://cdn.jsdelivr.net/npm/@lit/reactive-element@1/reactive-element.js",
      "@lit/reactive-element/": "https://cdn.jsdelivr.net/npm/@lit/reactive-element@1/",
      "lit-element/lit-element.js": "https://cdn.jsdelivr.net/npm/lit-element@4/lit-element.js",
      "lit-html": "https://cdn.jsdelivr.net/npm/lit-html@3/lit-html.js",
      "lit-html/": "https://cdn.jsdelivr.net/npm/lit-html@3/",
      "material/": "https://cdn.jsdelivr.net/gh/material-esm/material@1/"
    }
  }
</script>
```

## Importación de Componentes

Los componentes se importan como módulos de JavaScript:

```javascript
// Botones
import 'material/buttons/button.js'
import 'material/buttons/filled-button.js'
import 'material/buttons/outlined-button.js'

// Entradas de texto
import 'material/text-field/text-field.js'

// Chips
import 'material/chips/chip-set.js'
import 'material/chips/assist-chip.js'
import 'material/chips/filter-chip.js'
```

## Principios de Diseño Expressive

1. **Tipografía Bolder**: Utilizar pesos más gruesos para títulos y estados activos.
2. **Formas Dinámicas**: Radios de esquina aumentados (normalmente 16px o más para cards y botones).
3. **Motion Pronunciado**: Animaciones con curvas de tipo "spring" (elásticas).
4. **Colores Vibrantes**: Salir de los tonos pastel hacia una paleta con mayor contraste y saturación.

## Ejemplo de Uso Directo

```html
<md-filled-button>
  Guardar Receta
</md-filled-button>

<md-text-field label="Ingrediente" type="outlined"></md-text-field>
```
