---
title: "SwiftUI: quitar Liquid Glass de un toolbar (sin renunciar al sistema)"
title_en: "SwiftUI: removing Liquid Glass from a toolbar (without leaving the system)"
date: 2026-11-11 00:00:00
description: "Cómo usar sharedBackgroundVisibility(.hidden) para mantener un grupo de la barra de navegación sin Liquid Glass, y por qué UIDesignRequiresCompatibility ya no sirve."
description_en: "How to use sharedBackgroundVisibility(.hidden) to keep a navigation bar group without Liquid Glass, and why UIDesignRequiresCompatibility no longer works."
lang: es
tags: [iOS, SwiftUI, Liquid Glass, Toolbar]
categories: blog
layout: blog
reading_time: 8
---

<div class="lang-es" lang="es" markdown="1">

Liquid Glass es el lenguaje visual que Apple introdujo en iOS 26. Cambia la forma en que se agrupan y se dibujan las barras, los botones y las sheets: los elementos del toolbar comparten un fondo de Liquid Glass que se adapta al contenido que hay detrás. En la mayoría de los casos, adoptarlo es lo correcto.

Pero hay excepciones. A veces, por diseño de producto o por identidad de marca, nos piden mantener un componente concreto sin ese fondo: un logo que ya tiene su propia forma, un avatar que necesita un color sólido o un control que debe integrarse en una superficie propia. No hace falta renunciar al sistema entero para conseguirlo. SwiftUI tiene una API pensada precisamente para esta excepción.

## La API: `sharedBackgroundVisibility(.hidden)`

El modificador se aplica al contenido del toolbar, no a la vista que hay dentro. Este es el ejemplo mínimo:

```swift
import SwiftUI

struct ToolbarWithoutGlassView: View {
    var body: some View {
        NavigationStack {
            Text("Test")
                .toolbar {
                    ToolbarItemGroup(placement: .topBarLeading) {
                        Button("Test") {
                            print("Tapped")
                        }
                    }
                    .sharedBackgroundVisibility(.hidden)
                }
        }
    }
}
```

Lo importante es dónde va: después del cierre de `ToolbarItemGroup`, no dentro del `Button`. `sharedBackgroundVisibility` es una API de `ToolbarContent`; si la aplicas a una `View`, el compilador no la encontrará. El ejemplo da por hecho un target de iOS 26 o superior; si tu app soporta versiones anteriores, usa la extensión de compatibilidad que veremos más adelante.

## Qué hace exactamente

Antes de usarlo, merece la pena entender qué cambia y qué no. El nombre describe el comportamiento: controla la visibilidad del fondo que comparten los elementos del toolbar. Al pasarle `.hidden`, el sistema deja de dibujar ese fondo compartido y coloca el elemento en su propio grupo. No es un `background(.clear)` ni un juego de transparencias: es una instrucción al sistema para que no aplique el efecto de Liquid Glass a ese contenido.

Con un solo elemento, el resultado es ese elemento sin la cápsula compartida; con varios, el grupo entero deja de usar el fondo común. Los botones siguen siendo interactivos: lo que cambia es el tratamiento visual del contenedor, no su comportamiento. El resto de elementos del toolbar conserva el suyo.

## Un caso real: una marca que ya tiene su propia identidad

Veamos un caso típico. Imagina el logo de una marca en la esquina superior izquierda. Si lo metes en una cápsula de Liquid Glass, el sistema añade una capa que compite con el logo y puede hacer que parezca un botón genérico. Ocultar el fondo compartido permite que el logo se lea como contenido de la barra.

```swift
import SwiftUI

struct BrandToolbarView: View {
    var body: some View {
        NavigationStack {
            Text("Home")
                .toolbar {
                    ToolbarItemGroup(placement: .topBarLeading) {
                        Button {
                            print("Brand tapped")
                        } label: {
                            HStack(spacing: 8) {
                                Image(systemName: "sparkles")
                                    .foregroundStyle(.tint)

                                Text("Acme")
                                    .font(.headline)
                            }
                        }
                        .accessibilityLabel("Acme")
                    }
                    .sharedBackgroundVisibility(.hidden)
                }
        }
    }
}
```

Si el logo no es interactivo, no lo escribas como un `Button` solo para que parezca parte del toolbar. Un `HStack` normal, con una etiqueta de accesibilidad adecuada, suele ser más coherente. Si lo es, mantén el área táctil y el foco de teclado que tendría cualquier otro botón.

## Qué se pierde al quitar el fondo de Liquid Glass

Ahora bien, quitar Liquid Glass tiene un coste. No es solo decoración: el fondo de Liquid Glass separa el contenido del toolbar de lo que hay detrás y ayuda a mantener la legibilidad cuando la pantalla tiene fotos, mapas o colores vivos. Al ocultarlo, esa responsabilidad recae ahora en tu diseño.

Antes de dar por buena una excepción, comprueba:

- El contraste en modo claro y oscuro.
- El contenido que queda detrás del elemento, especialmente al hacer scroll.
- Los ajustes Reducir transparencia y Aumentar contraste.
- El tamaño de texto dinámico (Dynamic Type): el texto no debería romper el grupo.
- El área táctil, que debe seguir siendo cómoda.
- VoiceOver: si el elemento es un botón, necesita una etiqueta clara; si es una marca, no debería anunciarse como una acción.

Ocultar el fondo es fácil. Lo difícil es que el resultado siga siendo claro, accesible y coherente con el resto de la pantalla.

## Compatibilidad con versiones anteriores

`sharedBackgroundVisibility` está disponible a partir de iOS 26.0, y también en iPadOS 26 y macOS 26. El ejemplo usa posiciones de la barra de navegación en iOS; en macOS, usa la posición que corresponda a su barra de herramientas. Si tu app da soporte a versiones anteriores, necesitas compilar con el SDK de iOS 26 o posterior y proteger la ejecución con `#available`.

Una extensión reutilizable evita duplicar el contenido del toolbar:

```swift
import SwiftUI

extension ToolbarContent {
    @ToolbarContentBuilder
    func hideSharedGlassIfAvailable() -> some ToolbarContent {
        if #available(iOS 26.0, *) {
            sharedBackgroundVisibility(.hidden)
        } else {
            self
        }
    }
}

struct CompatibleToolbarView: View {
    var body: some View {
        NavigationStack {
            Text("Test")
                .toolbar {
                    ToolbarItemGroup(placement: .topBarLeading) {
                        Button("Test") {
                            print("Tapped")
                        }
                    }
                    .hideSharedGlassIfAvailable()
                }
        }
    }
}

#Preview {
    CompatibleToolbarView()
}
```

La extensión aprovecha `ToolbarContentBuilder` para devolver el mismo contenido con o sin el modificador. En iOS 26 y posteriores oculta el fondo; en versiones anteriores devuelve `self` y no cambia nada.

## `UIDesignRequiresCompatibility`: el final de la prórroga

Todo esto nos lleva a la pregunta que suele aparecer después: ¿y la clave global? Durante la transición a iOS 26, Apple ofreció una vía de escape: `UIDesignRequiresCompatibility` en `Info.plist`.

```xml
<key>UIDesignRequiresCompatibility</key>
<true/>
```

Con `YES`, la app se ejecuta en modo de compatibilidad y conserva el aspecto anterior. Fue útil para ganar tiempo, pero nunca fue una estrategia de diseño: es una prórroga para adaptar la app, no una forma de mantener dos lenguajes visuales indefinidamente.

Según la documentación de Apple, el sistema ignora esta clave cuando compilas con el SDK de iOS 27 o posterior. Si tu app se compila con el SDK de iOS 27, `UIDesignRequiresCompatibility` ya no te devuelve el diseño anterior.

Hay un matiz que no conviene pasar por alto: si sigues compilando con el SDK de iOS 26, la clave todavía puede tener efecto en iOS 26. Pero eso significa quedarse en un SDK antiguo, con las consecuencias de mantenimiento y compatibilidad que eso implica. No es una solución a largo plazo.

| Necesidad | Herramienta |
| --- | --- |
| Ocultar Liquid Glass de un elemento o grupo del toolbar | `.sharedBackgroundVisibility(.hidden)` en iOS 26+ |
| Separar grupos manteniendo Liquid Glass | `ToolbarSpacer` en iOS 26+ |
| Modo de compatibilidad para toda la app | `UIDesignRequiresCompatibility` (ignorado con el SDK de iOS 27) |

## Mi opinión: excepciones, no una norma

Con todo esto sobre la mesa, mi postura es clara: la consistencia con el sistema debería ser la opción por defecto. Los usuarios aprenden una vez cómo se ven y se comportan los controles de iOS, y Liquid Glass forma parte de ese lenguaje visual. Cambiarlo en un componente aislado puede hacer que el usuario dude si eso es un botón, un elemento decorativo o contenido.

Pero la consistencia no es una regla absoluta. Hay excepciones legítimas: una marca que ya tiene su propio lenguaje, un control que necesita un fondo propio para ser legible o una superficie que no debe competir con el Liquid Glass del sistema. Lo importante es que sea una excepción deliberada, documentada y probada, no una forma de evitar adaptar la app.

Si alguien pide "sin Liquid Glass en toda la app", la conversación correcta no consiste en buscar otra clave mágica, sino en explicar el coste: el modo de compatibilidad global deja de funcionar en las apps compiladas con el SDK de iOS 27, y las excepciones por componente hay que mantenerlas. Propón adoptar el sistema por defecto y aislar las excepciones con una justificación concreta.

## Lista de comprobación antes de ocultar el fondo

Antes de cerrar, un repaso rápido. No todo es diseño: una excepción visual también puede afectar a la accesibilidad, a la compatibilidad o al mantenimiento.

**Diseño**

- ¿La excepción está justificada por marca o legibilidad, y no solo por preferencia?
- ¿El componente necesita realmente su propio fondo?
- ¿Sigue siendo coherente con el resto de la pantalla y con el sistema?

**Técnica**

- ¿Es un elemento del toolbar y no la barra completa?
- ¿El modificador está en el `ToolbarItem` o `ToolbarItemGroup`, no en la vista interior?
- ¿Usas `.topBarLeading` o `.topBarTrailing`?
- ¿Tienes una alternativa para iOS anterior a 26?
- ¿Compilas con el SDK de iOS 26 o posterior?

**Accesibilidad**

- ¿Probaste el contraste, el modo oscuro, Reducir transparencia, Aumentar contraste, Dynamic Type y VoiceOver?
- ¿El área táctil y el foco de teclado siguen siendo adecuados?

**Mantenimiento**

- ¿La excepción está documentada y tiene una prueba visual o una revisión de diseño que evite que se convierta en la norma?
- ¿Sabes cuándo revisarla o eliminarla?

## Referencias

- [`sharedBackgroundVisibility(_:)`](https://developer.apple.com/documentation/swiftui/toolbarcontent/sharedbackgroundvisibility%28_%3A%29)
- [UIDesignRequiresCompatibility](https://developer.apple.com/documentation/bundleresources/information-property-list/uidesignrequirescompatibility)
- [ToolbarItemPlacement.topBarLeading](https://developer.apple.com/documentation/swiftui/toolbaritemplacement/topbarleading)
- [Build a SwiftUI app with the new design (WWDC25)](https://developer.apple.com/videos/play/wwdc2025/323/)
- [When toolbar items share a glass background in iOS 26](https://sarunw.com/posts/swiftui-toolbar-item-grouping-ios-26/)

</div>

<div class="lang-en" lang="en" markdown="1">

Liquid Glass is the visual language Apple introduced in iOS 26. It changes how bars, buttons, and sheets are grouped and drawn: toolbar items share a Liquid Glass background that adapts to the content behind them. For most screens, adopting it is the right call.

But there are exceptions. Sometimes, because of product design or brand identity, we're asked to keep a specific component without that background: a logo that already has its own shape, an avatar that needs a solid color, or a control that should sit on its own surface. You don't have to abandon the whole system to do it. SwiftUI has an API designed for exactly this exception.

## The API: `sharedBackgroundVisibility(.hidden)`

The modifier applies to the toolbar content, not to the view inside it. Here is the minimal example:

```swift
import SwiftUI

struct ToolbarWithoutGlassView: View {
    var body: some View {
        NavigationStack {
            Text("Test")
                .toolbar {
                    ToolbarItemGroup(placement: .topBarLeading) {
                        Button("Test") {
                            print("Tapped")
                        }
                    }
                    .sharedBackgroundVisibility(.hidden)
                }
        }
    }
}
```

What matters is where it goes: after the closing brace of `ToolbarItemGroup`, not inside the `Button`. `sharedBackgroundVisibility` is a `ToolbarContent` API; if you apply it to a `View`, the compiler won't find it. The example assumes an iOS 26 or later target; if your app supports earlier versions, use the compatibility extension later in the article.

## What it actually does

Before using it, it's worth understanding what changes and what doesn't. The name describes the behavior: it controls the visibility of the background shared by toolbar items. Passing `.hidden` tells the system to stop drawing that shared background and places the item in its own grouping. It is not `background(.clear)` or a transparency trick: it is an instruction to the system not to apply the Liquid Glass effect to that content.

With a single item, the result is that item without the shared capsule; with several, the whole group stops using the shared background. The buttons remain interactive: what changes is the visual treatment of the container, not its behavior. The rest of the toolbar items keep theirs.

## A real case: a brand that already has its own identity

Let's look at a common case. Imagine a brand logo in the top-leading corner. If you put it inside a Liquid Glass capsule, the system adds a layer that competes with the logo and can make it look like a generic button. Hiding the shared background lets the logo read as toolbar content.

```swift
import SwiftUI

struct BrandToolbarView: View {
    var body: some View {
        NavigationStack {
            Text("Home")
                .toolbar {
                    ToolbarItemGroup(placement: .topBarLeading) {
                        Button {
                            print("Brand tapped")
                        } label: {
                            HStack(spacing: 8) {
                                Image(systemName: "sparkles")
                                    .foregroundStyle(.tint)

                                Text("Acme")
                                    .font(.headline)
                            }
                        }
                        .accessibilityLabel("Acme")
                    }
                    .sharedBackgroundVisibility(.hidden)
                }
        }
    }
}
```

If the logo isn't interactive, don't write it as a `Button` just to make it look at home in the toolbar. A plain `HStack` with a proper accessibility label usually fits better. If it is interactive, keep the hit target and keyboard focus any other button would have.

## What you lose when you remove the Liquid Glass background

Of course, removing it comes at a cost. Liquid Glass is not just decoration: its background separates toolbar content from what's behind it and helps keep text legible when the screen has photos, maps, or vivid colors. When you hide it, that responsibility becomes part of your design.

Before accepting an exception, check:

- Contrast in light and dark mode.
- The content behind the item, especially while scrolling.
- The Reduce Transparency and Increase Contrast settings.
- Dynamic Type: text shouldn't break the group.
- The hit target, which should remain comfortable.
- VoiceOver: if the item is a button, it needs a clear label; if it's a brand mark, it shouldn't be announced as an action.

Hiding the background is easy. The hard part is keeping the result clear, accessible, and consistent with the rest of the screen.

## Backward compatibility

`sharedBackgroundVisibility` is available starting in iOS 26.0, as well as iPadOS 26 and macOS 26. The example uses iOS navigation bar placements; on macOS, use the placement that matches its toolbar. If your app supports earlier versions, you need to build with the iOS 26 SDK or later and guard runtime execution with `#available`.

A reusable extension avoids duplicating the toolbar content:

```swift
import SwiftUI

extension ToolbarContent {
    @ToolbarContentBuilder
    func hideSharedGlassIfAvailable() -> some ToolbarContent {
        if #available(iOS 26.0, *) {
            sharedBackgroundVisibility(.hidden)
        } else {
            self
        }
    }
}

struct CompatibleToolbarView: View {
    var body: some View {
        NavigationStack {
            Text("Test")
                .toolbar {
                    ToolbarItemGroup(placement: .topBarLeading) {
                        Button("Test") {
                            print("Tapped")
                        }
                    }
                    .hideSharedGlassIfAvailable()
                }
        }
    }
}

#Preview {
    CompatibleToolbarView()
}
```

The extension uses `ToolbarContentBuilder` to return the same content with or without the modifier. On iOS 26 and later it hides the background; on earlier versions it returns `self` and changes nothing.

## `UIDesignRequiresCompatibility`: the end of the grace period

All of this leads to the question that usually comes next: what about the global key? During the transition to iOS 26, Apple offered an escape hatch: `UIDesignRequiresCompatibility` in `Info.plist`.

```xml
<key>UIDesignRequiresCompatibility</key>
<true/>
```

With `YES`, the app runs in compatibility mode and keeps the previous look. It was useful for buying time, but it was never a design strategy: it is a grace period for adapting the app, not a way to maintain two visual languages indefinitely.

According to Apple's documentation, the system ignores this key when you build with the iOS 27 SDK or later. If your app is built with the iOS 27 SDK, `UIDesignRequiresCompatibility` no longer brings the old design back.

There is a nuance worth keeping in mind: if you still build with the iOS 26 SDK, the key can still have an effect on iOS 26. But that means staying on an old SDK, with the maintenance and compatibility consequences that implies. It is not a long-term solution.

| Need | Tool |
| --- | --- |
| Hide Liquid Glass on a toolbar item or group | `.sharedBackgroundVisibility(.hidden)` on iOS 26+ |
| Separate groups while keeping Liquid Glass | `ToolbarSpacer` on iOS 26+ |
| Compatibility mode for the whole app | `UIDesignRequiresCompatibility` (ignored with the iOS 27 SDK) |

## My take: exceptions, not the norm

With all this on the table, my position is clear: consistency with the system should be the default. Users learn once how iOS controls look and behave, and Liquid Glass is part of that visual language. Changing it in one isolated component can make people wonder whether it is a button, an ornament, or content.

But consistency isn't an absolute rule. There are legitimate exceptions: a brand that already has its own language, a control that needs its own background to be legible, or a surface that shouldn't compete with the system's Liquid Glass. What matters is that it should be a deliberate, documented, and tested exception, not a way to avoid adapting the app.

If someone asks for "no Liquid Glass in the whole app", the right conversation isn't about finding another magic key. It's about explaining the cost: global compatibility mode stops working for apps built with the iOS 27 SDK, and per-component exceptions have to be maintained. Propose adopting the system by default and isolating exceptions with a concrete justification.

## Checklist before hiding the background

Before we wrap up, a quick checklist. Not everything here is about design: a visual exception can also affect accessibility, compatibility, or maintenance.

**Design**

- Is the exception justified by brand or legibility, rather than personal preference?
- Does the component really need its own background?
- Does it still feel consistent with the rest of the screen and with the system?

**Technical**

- Is it a toolbar item and not the whole bar?
- Is the modifier on `ToolbarItem` or `ToolbarItemGroup`, not on the inner view?
- Are you using `.topBarLeading` or `.topBarTrailing`?
- Do you have a fallback for iOS earlier than 26?
- Are you building with the iOS 26 SDK or later?

**Accessibility**

- Did you test contrast, dark mode, Reduce Transparency, Increase Contrast, Dynamic Type, and VoiceOver?
- Are the hit target and keyboard focus still adequate?

**Maintenance**

- Is the exception documented, with a visual test or design review to keep it from becoming the norm?
- Do you know when to revisit or remove it?

## References

- [`sharedBackgroundVisibility(_:)`](https://developer.apple.com/documentation/swiftui/toolbarcontent/sharedbackgroundvisibility%28_%3A%29)
- [UIDesignRequiresCompatibility](https://developer.apple.com/documentation/bundleresources/information-property-list/uidesignrequirescompatibility)
- [ToolbarItemPlacement.topBarLeading](https://developer.apple.com/documentation/swiftui/toolbaritemplacement/topbarleading)
- [Build a SwiftUI app with the new design (WWDC25)](https://developer.apple.com/videos/play/wwdc2025/323/)
- [When toolbar items share a glass background in iOS 26](https://sarunw.com/posts/swiftui-toolbar-item-grouping-ios-26/)

</div>
