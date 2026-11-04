---
title: "SF Symbols personalizados: color y animación más allá del catálogo"
title_en: "Custom SF Symbols: color and motion beyond the catalog"
date: 2026-11-06 00:00:00
description: "Los SF Symbols personalizados no son iconos estáticos: con las anotaciones correctas heredan los modos de color y las animaciones del sistema."
description_en: "Custom SF Symbols are not static icons: with the right annotations they inherit the system's rendering modes and animations."
lang: es
tags: [iOS, SwiftUI, SF Symbols, Design, Accessibility]
categories: blog
layout: blog
reading_time: 8
---

<div class="lang-es" lang="es" markdown="1">

Hay una idea bastante extendida entre desarrolladores y diseñadores: los SF Symbols son el catálogo de iconos que Apple incluye en el sistema, y si necesitas algo distinto, toca dibujar un PNG o un PDF y olvidarte de las ventajas. No es así.

Los SF Symbols personalizados existen desde hace varias versiones. No son imágenes normales: son plantillas vectoriales que se comportan como símbolos del sistema. Si las preparas bien, pueden usar los mismos modos de color y la misma familia de animaciones que los iconos de Apple.

La diferencia importante está en una palabra: **anotaciones**. Un SVG bonito no basta. El símbolo necesita capas y metadatos para que SwiftUI sepa qué partes colorear, qué orden seguir y qué animar.

## Qué es realmente un SF Symbol personalizado

Un SF Symbol personalizado es un SVG validado por la app SF Symbols y añadido a un asset catalog como **Symbol Image Set**, no como un image set normal. Esa distinción importa: si lo metes como una imagen corriente, pierdes el comportamiento de símbolo.

El flujo habitual es:

1. Buscar en la app SF Symbols un símbolo parecido y usar `File > Duplicate as Custom Symbol` o `File > Export Template`.
2. Editar el SVG en una herramienta vectorial. Convierte trazos a paths, usa rellenos planos y evita sombras, efectos y paths ocultos.
3. Importar el SVG de vuelta en la app SF Symbols y validarlo.
4. Anotar los modos de renderizado y, si hace falta, las animaciones.
5. Exportar el símbolo y añadirlo al asset catalog como Symbol Image Set.
6. Usarlo con `Image("custom.orbit")`, no con `Image(systemName:)`.

La app SF Symbols es la que valida que el SVG cumple el formato. También es donde se guardan las anotaciones. De hecho, si exportas una plantilla para editarla, esa exportación **no incluye** las anotaciones. Para conservarlas, hay que arrastrar el SVG editado sobre el símbolo existente.

## De un SVG normal a un SF Symbol

La app SF Symbols espera una plantilla con una estructura muy concreta. Si ya tienes el icono dibujado en SVG, no hace falta redibujarlo desde cero: hay herramientas que generan el envoltorio de símbolo a partir de un SVG convencional.

- [**Create Custom Symbols**](https://github.com/jaywcjlove/create-custom-symbols): app de macOS para arrastrar uno o varios SVG y exportar un archivo que puedes importar en la app SF Symbols. Es útil para lotes y para convertir iconos que ya existen en el diseño.
- [**SwiftDraw**](https://github.com/swhitty/SwiftDraw): herramienta de línea de comandos. Con `brew install swiftdraw`, puedes ejecutar `swiftdraw icon.svg --format sfsymbol`. Expande trazos, ajusta el winding de los paths y alinea el resultado para que Xcode lo acepte.
- **Plugins de Figma** como [**SF Symbol Generator**](https://www.figma.com/community/plugin/1487107089082698461/sf-symbol-generator) y [**SF Symbols Optimizer**](https://www.figma.com/community/plugin/1265484574589944515/sf-symbols-optimizer): exportan iconos de Figma como SVG de SF Symbols, con variantes estáticas o variables.

La advertencia es la misma que con el resto del flujo: estas herramientas ahorran el trabajo de estructura, no el de diseño. No pueden adivinar qué capas deben formar parte de una jerarquía, qué colores van en palette o qué partes deben animarse. Además, los SVG convencionales suelen traer trazos, máscaras, compound paths o grupos anidados que no siempre se convierten bien. Revisa el resultado en la app SF Symbols, comprueba la dirección de los paths y anota las capas antes de darlo por bueno.

## Color: cuatro modos, no uno

Para que los ejemplos se puedan probar sin crear un asset, uso símbolos del sistema. Los modificadores son los mismos; solo cambia cómo se carga la imagen. Cuando tengas el tuyo, sustituye `Image(systemName: "sparkles")` por `Image("tu.simbolo")`.

Los símbolos del sistema pueden renderizarse en cuatro modos. Los personalizados también, siempre que sus capas estén anotadas:

- **Monochrome:** un solo color para todas las capas.
- **Hierarchical:** un color con distintos niveles de opacidad para dar profundidad.
- **Palette:** un color por capa o grupo de capas.
- **Multicolor:** colores intrínsecos definidos en el propio símbolo.

En SwiftUI se elige con `symbolRenderingMode`:

```swift
Image(systemName: "sparkles")
    .font(.system(size: 72))
    .symbolRenderingMode(.palette)
    .foregroundStyle(.blue, .cyan)
```

La parte importante no es el modificador, sino lo que hay detrás. Para que `.palette` funcione, el símbolo tiene que tener capas anotadas para palette; los colores se pasan desde `foregroundStyle`. Para que `.hierarchical` tenga sentido, necesita grupos primario, secundario y terciario. Si no hay anotaciones, el resultado puede ser más plano de lo que esperabas.

En SF Symbols 7 también existe el renderizado con gradiente, disponible en todos los modos de color y aplicable a símbolos personalizados. Es un recurso útil para dar profundidad, pero conviene usarlo con moderación: un icono de barra de herramientas no necesita el mismo tratamiento que una ilustración a gran tamaño.

También conviene usar colores semánticos (`.primary`, `.tint`, colores del asset catalog) en lugar de valores fijos. Así el símbolo sigue funcionando en modo oscuro, con vibrancy y con los ajustes de accesibilidad.

## Animación: el mismo sistema, con matices

Desde iOS 17, los símbolos tienen efectos universales: `bounce`, `pulse`, `variableColor`, `scale`, `appear`, `disappear` y `replace`. Las versiones posteriores añadieron `wiggle`, `rotate`, `breathe` y, en SF Symbols 7, `drawOn` y `drawOff`.

La buena noticia es que estos efectos también se pueden aplicar a símbolos personalizados. La matización es que los efectos que dependen de capas —como `variableColor` o `drawOn`— necesitan que el símbolo tenga esas capas y esté anotado. Un símbolo antiguo o mal preparado puede caer en un fade genérico en lugar de hacer la animación que esperabas.

Un ejemplo mínimo en SwiftUI:

```swift
struct CustomSymbolDemo: View {
    @State private var bounceTrigger = 0
    @State private var isPulsing = false

    var body: some View {
        VStack(spacing: 32) {
            Image(systemName: "sparkles")
                .font(.system(size: 88))
                .symbolRenderingMode(.hierarchical)
                .symbolEffect(.bounce, value: bounceTrigger)
                .symbolEffect(.pulse, isActive: isPulsing)
                .accessibilityLabel("Highlight")

            HStack(spacing: 16) {
                Button("Bounce") {
                    bounceTrigger += 1
                }

                Button(isPulsing ? "Stop pulse" : "Pulse") {
                    isPulsing.toggle()
                }
            }
        }
        .padding()
    }
}

#Preview {
    CustomSymbolDemo()
}
```

`value:` se usa para efectos discretos que se disparan cuando cambia un valor. `isActive:` se usa para efectos indefinidos que siguen activos mientras la condición sea verdadera. También puedes ajustar la repetición o la velocidad con `options`.

La app SF Symbols permite copiar la configuración de un efecto con `Copy Configuration`. Es una forma cómoda de pasar del preview al código sin adivinar qué combinación de opciones estabas viendo.

Para `variableColor`, el símbolo necesita varias capas y una anotación de variable color. Un ejemplo típico es una batería o una barra de progreso:

```swift
struct BatterySymbol: View {
    let level: Double

    var body: some View {
        Image(systemName: "battery.75")
            .symbolRenderingMode(.palette)
            .foregroundStyle(.green, .yellow)
            .symbolEffect(.variableColor.iterative, value: level)
    }
}
```

No todos los símbolos personalizados tienen que soportar todo. Lo sano es probar cada efecto en la app SF Symbols antes de llevarlo al código. Si el preview se ve como un fade plano, es probable que en la app también lo sea.

## Lo que no resuelve un símbolo personalizado

Un SF Symbol no es una ilustración. Es un icono pequeño, reconocible y ópticamente alineado con el resto del sistema. Si metes un logo complejo con gradientes, sombras y detalles finos, va a sufrir en tamaños pequeños y en modo oscuro.

Tampoco conviene copiar símbolos de Apple que representan productos o features y modificar sus trazos. La app SF Symbols marca algunos símbolos como no personalizables. Para variantes, lo correcto es usar la librería de componentes o crear un símbolo propio desde cero.

Y hay una limitación práctica: las anotaciones dependen de que el número y el orden de los paths se mantengan. Si editas el SVG y eliminas o reordenas paths, las anotaciones pueden quedar desincronizadas. Valida y revisa el símbolo después de cada cambio.

## Accesibilidad y movimiento

Un icono animado sigue siendo un icono. Si transmite información, necesita una etiqueta accesible:

```swift
Image(systemName: "sparkles")
    .accessibilityLabel("Highlight")
```

Si es decorativo, ocúltalo:

```swift
Image(systemName: "sparkles")
    .accessibilityHidden(true)
```

Y no todo el mundo quiere movimiento. Respeta `accessibilityReduceMotion` y evita animaciones indefinidas cuando la persona ha pedido reducir el movimiento:

```swift
@Environment(\.accessibilityReduceMotion) private var reduceMotion

Image(systemName: "sparkles")
    .symbolEffect(.pulse, isActive: isPulsing && !reduceMotion)
```

Para tamaños, usa estilos de texto (`.font(.title)`, `.font(.largeTitle)`) en lugar de píxeles fijos. Así el símbolo acompaña a Dynamic Type.

## Checklist antes de darlo por terminado

- ¿Está en un **Symbol Image Set** del asset catalog?
- ¿Tiene capas suficientes para los modos que vas a usar?
- ¿Has probado monochrome, hierarchical, palette y multicolor?
- ¿Has probado los efectos con todas las escalas y pesos?
- ¿Se ve bien en modo claro, oscuro y con poco contraste?
- ¿Tiene etiqueta de accesibilidad o está oculto si es decorativo?
- ¿Respeta Reduce Motion?
- ¿Has validado el SVG en la app SF Symbols?

## Conclusión

Los SF Symbols personalizados son una de esas funciones que parecen un detalle de diseño y terminan siendo una decisión de arquitectura visual. Si los tratas como SVG estáticos, tienes iconos bonitos. Si los tratas como símbolos anotados, tienes iconos que se colorean, se animan y se comportan como los de Apple.

La próxima vez que necesites un icono que no está en el catálogo, no empieces por un PNG. Empieza por una plantilla de SF Symbols. El resultado encaja mejor, escala mejor y se mueve igual de bien.

## Referencias

- [Creating custom symbols](https://developer.apple.com/documentation/technologyoverviews/custom-sf-symbols)
- [Annotating custom symbols](https://developer.apple.com/documentation/technologyoverviews/annotating-sf-symbols)
- [SF Symbols](https://developer.apple.com/sf-symbols)
- [Human Interface Guidelines: SF Symbols](https://developer.apple.com/design/human-interface-guidelines/sf-symbols)
- [Symbols framework](https://developer.apple.com/documentation/symbols)
- [WWDC23: Create animated symbols](https://developer.apple.com/videos/play/wwdc2023/10257/)
- [WWDC23: Animate symbols in your app](https://developer.apple.com/videos/play/wwdc2023/10258/)
- [WWDC25: What's new in SF Symbols 7](https://developer.apple.com/videos/play/wwdc2025/337/)

</div>

<div class="lang-en" lang="en" markdown="1">

There is a common assumption among developers and designers: SF Symbols are the icon catalog Apple ships with the system, and if you need something different, you draw a PNG or PDF and lose the system benefits. That is not the case.

Custom SF Symbols have existed for several releases. They are not regular images: they are vector templates that behave like system symbols. If you prepare them properly, they can use the same rendering modes and the same family of animations as Apple's icons.

The key word is **annotations**. A pretty SVG is not enough. The symbol needs layers and metadata so SwiftUI knows which parts to color, in what order, and what to animate.

## What a custom SF Symbol really is

A custom SF Symbol is an SVG validated by the SF Symbols app and added to an asset catalog as a **Symbol Image Set**, not as a regular image set. That distinction matters: if you add it as a normal image, you lose the symbol behavior.

The usual workflow is:

1. Find a similar symbol in the SF Symbols app and use `File > Duplicate as Custom Symbol` or `File > Export Template`.
2. Edit the SVG in a vector tool. Convert strokes to paths, use flat fills, and avoid shadows, effects, and hidden paths.
3. Import the SVG back into the SF Symbols app and validate it.
4. Annotate the rendering modes and, if needed, the animations.
5. Export the symbol and add it to the asset catalog as a Symbol Image Set.
6. Use it with `Image("custom.orbit")`, not `Image(systemName:)`.

The SF Symbols app validates that the SVG follows the format. It is also where annotations live. In fact, if you export a template to edit it, that export **does not include** the annotations. To keep them, drag the edited SVG onto the existing symbol.

## From a regular SVG to an SF Symbol

The SF Symbols app expects a template with a very specific structure. If you already have the icon as an SVG, you do not have to redraw it from scratch: there are tools that generate the symbol wrapper from a conventional SVG.

- [**Create Custom Symbols**](https://github.com/jaywcjlove/create-custom-symbols): a macOS app where you drag one or more SVGs and export a file you can import into the SF Symbols app. It is useful for batches and for converting icons that already exist in the design.
- [**SwiftDraw**](https://github.com/swhitty/SwiftDraw): a command-line tool. With `brew install swiftdraw`, you can run `swiftdraw icon.svg --format sfsymbol`. It expands strokes, fixes path winding, and aligns the result so Xcode accepts it.
- **Figma plugins** such as [**SF Symbol Generator**](https://www.figma.com/community/plugin/1487107089082698461/sf-symbol-generator) and [**SF Symbols Optimizer**](https://www.figma.com/community/plugin/1265484574589944515/sf-symbols-optimizer): they export Figma icons as SF Symbols SVGs, with static or variable variants.

The warning is the same as with the rest of the workflow: these tools save you the structural work, not the design work. They cannot guess which layers belong in a hierarchy, which colors go into a palette, or which parts should animate. Conventional SVGs often contain strokes, masks, compound paths, or nested groups that do not always convert cleanly. Review the result in the SF Symbols app, check path direction, and annotate the layers before calling it done.

## Color: four modes, not one

So the examples can be tried without creating an asset, I use system symbols. The modifiers are the same; only how you load the image changes. When you have yours, replace `Image(systemName: "sparkles")` with `Image("your.symbol")`.

System symbols can render in four modes. Custom symbols can too, as long as their layers are annotated:

- **Monochrome:** one color for all layers.
- **Hierarchical:** one color with different opacity levels to create depth.
- **Palette:** one color per layer or layer group.
- **Multicolor:** intrinsic colors defined inside the symbol.

In SwiftUI you choose the mode with `symbolRenderingMode`:

```swift
Image(systemName: "sparkles")
    .font(.system(size: 72))
    .symbolRenderingMode(.palette)
    .foregroundStyle(.blue, .cyan)
```

The important part is not the modifier but what sits behind it. For `.palette` to work, the symbol needs layers annotated for palette; the colors come from `foregroundStyle`. For `.hierarchical` to make sense, it needs primary, secondary, and tertiary groups. Without annotations, the result can be flatter than you expected.

SF Symbols 7 also adds gradient rendering, available in every color mode and applicable to custom symbols. It is useful for adding depth, but use it sparingly: a toolbar icon does not need the same treatment as a large illustration.

It also pays to use semantic colors (`.primary`, `.tint`, asset catalog colors) instead of fixed values. That way the symbol keeps working in dark mode, with vibrancy, and with accessibility settings.

## Animation: the same system, with caveats

Since iOS 17, symbols have universal effects: `bounce`, `pulse`, `variableColor`, `scale`, `appear`, `disappear`, and `replace`. Later releases added `wiggle`, `rotate`, `breathe`, and, in SF Symbols 7, `drawOn` and `drawOff`.

The good news is that these effects can also be applied to custom symbols. The caveat is that layer-dependent effects — such as `variableColor` or `drawOn` — need the symbol to have those layers and to be annotated. An old or poorly prepared symbol may fall back to a generic fade instead of the animation you expected.

A minimal SwiftUI example:

```swift
struct CustomSymbolDemo: View {
    @State private var bounceTrigger = 0
    @State private var isPulsing = false

    var body: some View {
        VStack(spacing: 32) {
            Image(systemName: "sparkles")
                .font(.system(size: 88))
                .symbolRenderingMode(.hierarchical)
                .symbolEffect(.bounce, value: bounceTrigger)
                .symbolEffect(.pulse, isActive: isPulsing)
                .accessibilityLabel("Highlight")

            HStack(spacing: 16) {
                Button("Bounce") {
                    bounceTrigger += 1
                }

                Button(isPulsing ? "Stop pulse" : "Pulse") {
                    isPulsing.toggle()
                }
            }
        }
        .padding()
    }
}

#Preview {
    CustomSymbolDemo()
}
```

`value:` is for discrete effects that fire when a value changes. `isActive:` is for indefinite effects that stay active while the condition is true. You can also adjust repetition or speed with `options`.

The SF Symbols app lets you copy an effect's configuration with `Copy Configuration`. It is a convenient way to go from the preview to code without guessing which combination of options you were looking at.

For `variableColor`, the symbol needs multiple layers and a variable color annotation. A battery or a progress bar is a typical example:

```swift
struct BatterySymbol: View {
    let level: Double

    var body: some View {
        Image(systemName: "battery.75")
            .symbolRenderingMode(.palette)
            .foregroundStyle(.green, .yellow)
            .symbolEffect(.variableColor.iterative, value: level)
    }
}
```

Not every custom symbol has to support everything. The sensible approach is to test each effect in the SF Symbols app before taking it to code. If the preview looks like a flat fade, it probably will in the app too.

## What a custom symbol does not solve

An SF Symbol is not an illustration. It is a small, recognizable icon that is optically aligned with the rest of the system. If you drop in a complex logo with gradients, shadows, and fine details, it will struggle at small sizes and in dark mode.

You should also avoid copying Apple symbols that depict products or features and modifying their paths. The SF Symbols app marks some symbols as non-customizable. For variants, the right move is to use the component library or create your own symbol from scratch.

There is also a practical limitation: annotations depend on the number and order of paths staying the same. If you edit the SVG and remove or reorder paths, the annotations can become out of sync. Validate and review the symbol after every change.

## Accessibility and motion

An animated icon is still an icon. If it conveys information, it needs an accessible label:

```swift
Image(systemName: "sparkles")
    .accessibilityLabel("Highlight")
```

If it is decorative, hide it:

```swift
Image(systemName: "sparkles")
    .accessibilityHidden(true)
```

And not everyone wants motion. Respect `accessibilityReduceMotion` and avoid indefinite animations when the person has asked to reduce motion:

```swift
@Environment(\.accessibilityReduceMotion) private var reduceMotion

Image(systemName: "sparkles")
    .symbolEffect(.pulse, isActive: isPulsing && !reduceMotion)
```

For sizing, use text styles (`.font(.title)`, `.font(.largeTitle)`) instead of fixed pixels. That way the symbol follows Dynamic Type.

## Checklist before calling it done

- Is it in a **Symbol Image Set** in the asset catalog?
- Does it have enough layers for the modes you plan to use?
- Have you tested monochrome, hierarchical, palette, and multicolor?
- Have you tested the effects at every scale and weight?
- Does it look good in light mode, dark mode, and low-contrast contexts?
- Does it have an accessibility label, or is it hidden if decorative?
- Does it respect Reduce Motion?
- Have you validated the SVG in the SF Symbols app?

## Conclusion

Custom SF Symbols are one of those features that look like a design detail and end up being a visual architecture decision. If you treat them as static SVGs, you get nice icons. If you treat them as annotated symbols, you get icons that color, animate, and behave like Apple's.

The next time you need an icon that is not in the catalog, do not start with a PNG. Start with an SF Symbols template. The result fits better, scales better, and moves just as well.

## References

- [Creating custom symbols](https://developer.apple.com/documentation/technologyoverviews/custom-sf-symbols)
- [Annotating custom symbols](https://developer.apple.com/documentation/technologyoverviews/annotating-sf-symbols)
- [SF Symbols](https://developer.apple.com/sf-symbols)
- [Human Interface Guidelines: SF Symbols](https://developer.apple.com/design/human-interface-guidelines/sf-symbols)
- [Symbols framework](https://developer.apple.com/documentation/symbols)
- [WWDC23: Create animated symbols](https://developer.apple.com/videos/play/wwdc2023/10257/)
- [WWDC23: Animate symbols in your app](https://developer.apple.com/videos/play/wwdc2023/10258/)
- [WWDC25: What's new in SF Symbols 7](https://developer.apple.com/videos/play/wwdc2025/337/)

</div>
