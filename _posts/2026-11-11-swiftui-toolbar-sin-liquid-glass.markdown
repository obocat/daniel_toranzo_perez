---
title: "SwiftUI: quitar Liquid Glass de un toolbar (sin renunciar al sistema)"
title_en: "SwiftUI: removing Liquid Glass from a toolbar (without leaving the system)"
date: 2026-11-11 00:00:00
description: "Cómo usar sharedBackgroundVisibility(.hidden) para mantener un grupo de la barra de navegación sin Liquid Glass, y por qué UIDesignRequiresCompatibility ya no es una salida global."
description_en: "How to use sharedBackgroundVisibility(.hidden) to keep a navigation bar group without Liquid Glass, and why UIDesignRequiresCompatibility is no longer a global escape hatch."
lang: es
tags: [iOS, SwiftUI, Liquid Glass, Toolbar]
categories: blog
layout: blog
reading_time: 8
---

<div class="lang-es" lang="es" markdown="1">

Liquid Glass es el lenguaje visual que Apple introdujo en iOS 26. Cambia la forma en que se agrupan y se dibujan las barras, los botones y las hojas: los ítems del toolbar comparten un fondo de cristal que se adapta al contenido que hay detrás. Para la mayoría de pantallas, adoptarlo es lo correcto.

Pero hay excepciones. A veces el diseño de producto o la identidad de marca piden que un componente concreto no lleve ese fondo: un logo que ya tiene su propia forma, un avatar que necesita un color sólido o un control que debe integrarse con una superficie propia. En esos casos no hace falta renunciar al sistema entero. SwiftUI tiene una API pensada para esta excepción.

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

La posición del modificador es la parte importante: va después del cierre de `ToolbarItemGroup`, no dentro del `Button`. `sharedBackgroundVisibility` es una API de `ToolbarContent`; si la aplicas a una `View`, el compilador no la encontrará. El ejemplo asume un deployment target de iOS 26 o superior; si tu app soporta versiones anteriores, usa el helper de la sección de compatibilidad.

El código original usaba `.navigationBarLeading`. Esa colocación sigue existiendo, pero está en la sección de APIs obsoletas. `.topBarLeading` es la forma actual y expresa mejor que el ítem vive en la barra superior, no en una navigation bar concreta.

## Qué hace exactamente

El nombre describe el comportamiento: controla la visibilidad del fondo que comparten los ítems del toolbar. Al pasarle `.hidden`, el sistema deja de dibujar ese fondo compartido y coloca el ítem en su propio grupo. No es un `background(.clear)` ni un truco de transparencia: es una instrucción al sistema para que no aplique el efecto de cristal a ese contenido.

Si el grupo tiene un solo ítem, el resultado es ese ítem sin la cápsula compartida. Si tiene varios, el grupo deja de usar el fondo común. Los botones siguen siendo interactivos; lo que cambia es el tratamiento visual del contenedor. El resto de ítems del toolbar conserva su tratamiento.

Conviene no confundir dos capas distintas:

- `sharedBackgroundVisibility(.hidden)` actúa sobre el fondo compartido del contenido del toolbar.
- Las APIs de fondo de la barra controlan la superficie de la barra de navegación.

Ocultar el fondo de un ítem no rediseña toda la barra. Si lo que necesitas es que la barra completa deje de tener un fondo, esta no es la herramienta; y, en cualquier caso, piensa primero si realmente quieres separarte del sistema.

## Un caso real: una marca que ya tiene su propio fondo

Imagina un logo de marca en la esquina superior izquierda. Si lo metes en una cápsula de Liquid Glass, el sistema añade una capa que compite con el logo y puede hacer que parezca un botón genérico. Ocultar el fondo compartido permite que el logo se lea como contenido de la barra.

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

Si el logo no es interactivo, no lo escribas como un `Button` solo para que parezca parte del toolbar. Un `HStack` normal, con una etiqueta de accesibilidad adecuada, suele ser más honesto. Si sí es interactivo, mantén el área táctil y el foco de teclado que tendría cualquier otro botón.

## Qué se pierde al quitar el cristal

Liquid Glass no es solo decoración. El fondo de cristal separa el contenido del toolbar de lo que hay detrás y ayuda a mantener la legibilidad cuando la pantalla tiene fotos, mapas o colores vivos. Al ocultarlo, esa responsabilidad pasa a tu diseño.

Antes de dar por buena una excepción, comprueba:

- El contraste en modo claro y oscuro.
- El contenido que queda detrás del ítem, especialmente al hacer scroll.
- Los ajustes de Reduce Transparency y Increase Contrast.
- Dynamic Type: el texto no debería romper el grupo.
- El área táctil, que debe seguir siendo cómoda.
- VoiceOver: si el ítem es un botón, necesita una etiqueta clara; si es una marca, no debería anunciarse como una acción.

Ocultar el fondo es fácil. Lo difícil es que el resultado siga siendo claro, accesible y coherente con el resto de la pantalla.

## Compatibilidad con versiones anteriores

`sharedBackgroundVisibility` está disponible en iOS 26.0 o posterior, y también en iPadOS 26 y macOS 26. El ejemplo usa colocaciones de la barra de navegación de iOS; en macOS, usa la colocación que corresponda a su barra de herramientas. Si tu deployment target es anterior, necesitas compilar con el SDK de iOS 26 o posterior y proteger la ejecución con `#available`.

Un helper reutilizable evita duplicar el contenido del toolbar:

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

El helper usa el resultado del `ToolbarContentBuilder` para devolver el mismo contenido con o sin el modificador. En iOS 26 y posteriores oculta el fondo; en versiones anteriores devuelve `self` y no cambia nada.

Un matiz importante: `#available` protege la ejecución, no la compilación. Si compilas con un SDK anterior a iOS 26, el símbolo `sharedBackgroundVisibility` no existe y el código no compila. Para usar esta API necesitas Xcode 26 o posterior, aunque tu app siga dando soporte a iOS 17 u 18.

## `UIDesignRequiresCompatibility`: el final de la prórroga

Durante la transición a iOS 26, Apple ofreció una salida global: la clave `UIDesignRequiresCompatibility` en `Info.plist`.

```xml
<key>UIDesignRequiresCompatibility</key>
<true/>
```

Con `YES`, la app se ejecuta en modo de compatibilidad y conserva el aspecto anterior. Fue útil para ganar tiempo, pero nunca fue una estrategia de diseño: es una prórroga para adaptar la app, no una forma de mantener dos lenguajes visuales indefinidamente.

Apple documenta que el sistema ignora esta clave cuando compilas con el SDK de iOS 27 o posterior, y lo mismo ocurre con iPadOS 27, Mac Catalyst 27, macOS 27 y tvOS 27. Dicho de otra forma: si tu app se compila con el SDK de iOS 27, la clave ya no te devuelve el diseño anterior.

Hay un matiz que conviene no perder: si sigues compilando con el SDK de iOS 26, la clave todavía puede tener efecto en iOS 26. Pero eso significa quedarse en un SDK antiguo, con las consecuencias de mantenimiento y compatibilidad que eso implica. No es una salida a largo plazo.

Además, la clave es global. No sirve para decir "solo esta pantalla sin Liquid Glass". Para una excepción por componente, la API que vimos arriba es la adecuada.

| Necesidad | Herramienta |
| --- | --- |
| Ocultar el cristal de un ítem o grupo del toolbar | `.sharedBackgroundVisibility(.hidden)` en iOS 26+ |
| Separar grupos manteniendo el cristal | `ToolbarSpacer` en iOS 26+ |
| Modo de compatibilidad para toda la app | `UIDesignRequiresCompatibility` (ignorado con el SDK de iOS 27) |

## Mi opinión: excepciones, no régimen

Personalmente, creo que la consistencia con el sistema debe ser la opción por defecto. Los usuarios aprenden una vez cómo se ven y se comportan los controles de iOS; Liquid Glass forma parte de ese contrato visual. Cambiarlo en un componente aislado puede hacer que la persona dude si eso es un botón, un adorno o contenido.

Pero la consistencia no es un dogma. Hay excepciones legítimas: una marca que ya tiene su propio lenguaje, un control que necesita un fondo propio para ser legible o una superficie que no debe competir con el cristal del sistema. La clave es que sea una excepción deliberada, documentada y probada, no una forma de evitar adaptar la app.

Si alguien pide "sin Liquid Glass en toda la app", la conversación correcta no es buscar otra clave mágica. Es explicar el coste: la compatibilidad global se acaba con el SDK de iOS 27 y las excepciones por componente hay que mantenerlas. Propón adoptar el sistema por defecto y aislar las excepciones con una justificación concreta.

## Checklist antes de ocultar el fondo

- ¿El componente necesita realmente su propio fondo?
- ¿Es un ítem del toolbar y no la barra completa?
- ¿El modificador está en el `ToolbarItem` o `ToolbarItemGroup`, no en la vista interior?
- ¿Usas `.topBarLeading` o `.topBarTrailing` en lugar de las colocaciones obsoletas?
- ¿Tienes un fallback para iOS anterior a 26?
- ¿Probaste contraste, modo oscuro, Reduce Transparency, Dynamic Type y VoiceOver?
- ¿El ítem sigue teniendo un área táctil y un foco de teclado adecuados?
- ¿La excepción está documentada para que no se convierta en la norma?

## Referencias

- [`sharedBackgroundVisibility(_:)`](https://developer.apple.com/documentation/swiftui/toolbarcontent/sharedbackgroundvisibility%28_%3A%29)
- [UIDesignRequiresCompatibility](https://developer.apple.com/documentation/bundleresources/information-property-list/uidesignrequirescompatibility)
- [ToolbarItemPlacement.topBarLeading](https://developer.apple.com/documentation/swiftui/toolbaritemplacement/topbarleading)
- [Build a SwiftUI app with the new design (WWDC25)](https://developer.apple.com/videos/play/wwdc2025/323/)
- [When toolbar items share a glass background in iOS 26](https://sarunw.com/posts/swiftui-toolbar-item-grouping-ios-26/)

</div>

<div class="lang-en" lang="en" markdown="1">

Liquid Glass is the visual language Apple introduced in iOS 26. It changes how bars, buttons, and sheets are grouped and drawn: toolbar items share a glass background that adapts to the content behind them. For most screens, adopting it is the right call.

But there are exceptions. Sometimes product design or brand identity asks for a specific component to keep that background off: a logo that already has its own shape, an avatar that needs a solid color, or a control that should blend into a custom surface. You don't have to abandon the whole system for that. SwiftUI has an API designed for this exception.

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

The placement is the important part: it goes after the closing brace of `ToolbarItemGroup`, not inside the `Button`. `sharedBackgroundVisibility` is a `ToolbarContent` API; if you apply it to a `View`, the compiler won't find it. The example assumes an iOS 26 or later deployment target; if your app supports earlier versions, use the helper in the compatibility section.

The original code used `.navigationBarLeading`. That placement still exists, but it sits in the deprecated section. `.topBarLeading` is the current spelling and better expresses that the item lives in the top bar, not in a specific navigation bar.

## What it actually does

The name describes the behavior: it controls the visibility of the background shared by toolbar items. Passing `.hidden` tells the system to stop drawing that shared background and places the item in its own grouping. It is not `background(.clear)` or a transparency trick: it is an instruction to the system not to apply the glass effect to that content.

If the group has a single item, the result is that item without the shared capsule. If it has several, the group stops using the shared background. The buttons remain interactive; what changes is the visual treatment of the container. The rest of the toolbar items keep their treatment.

Don't confuse two different layers:

- `sharedBackgroundVisibility(.hidden)` acts on the shared background of the toolbar content.
- The bar background APIs control the surface of the navigation bar.

Hiding an item's background does not redesign the whole bar. If you need the entire bar to have no background, this is not the tool; and either way, think first about whether you really want to leave the system.

## A real case: a brand that already has its own background

Imagine a brand logo in the top-leading corner. If you put it inside a Liquid Glass capsule, the system adds a layer that competes with the logo and can make it look like a generic button. Hiding the shared background lets the logo read as toolbar content.

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

If the logo isn't interactive, don't write it as a `Button` just to make it look at home in the toolbar. A plain `HStack` with a proper accessibility label is usually more honest. If it is interactive, keep the hit target and keyboard focus any other button would have.

## What you lose when you remove the glass

Liquid Glass is not just decoration. The glass background separates toolbar content from what's behind it and helps keep text legible when the screen has photos, maps, or vivid colors. When you hide it, that responsibility moves to your design.

Before accepting an exception, check:

- Contrast in light and dark mode.
- The content behind the item, especially while scrolling.
- Reduce Transparency and Increase Contrast settings.
- Dynamic Type: text shouldn't break the group.
- The hit target, which should remain comfortable.
- VoiceOver: if the item is a button, it needs a clear label; if it's a brand mark, it shouldn't be announced as an action.

Hiding the background is easy. The hard part is keeping the result clear, accessible, and consistent with the rest of the screen.

## Backward compatibility

`sharedBackgroundVisibility` is available in iOS 26.0 and later, as well as iPadOS 26 and macOS 26. The example uses iOS navigation bar placements; on macOS, use the placement that matches its toolbar. If your deployment target is earlier, you need to build with the iOS 26 SDK or later and guard runtime execution with `#available`.

A reusable helper avoids duplicating the toolbar content:

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

The helper uses the `ToolbarContentBuilder` result to return the same content with or without the modifier. On iOS 26 and later it hides the background; on earlier versions it returns `self` and changes nothing.

One important nuance: `#available` guards runtime, not compilation. If you build with an SDK older than iOS 26, the `sharedBackgroundVisibility` symbol doesn't exist and the code won't compile. You need Xcode 26 or later to use this API, even if your app still supports iOS 17 or 18.

## `UIDesignRequiresCompatibility`: the end of the grace period

During the transition to iOS 26, Apple offered a global escape hatch: the `UIDesignRequiresCompatibility` key in `Info.plist`.

```xml
<key>UIDesignRequiresCompatibility</key>
<true/>
```

With `YES`, the app runs in compatibility mode and keeps the previous look. It was useful for buying time, but it was never a design strategy: it is a grace period for adapting the app, not a way to maintain two visual languages indefinitely.

Apple documents that the system ignores this key when you build with the iOS 27 SDK or later, and the same applies to iPadOS 27, Mac Catalyst 27, macOS 27, and tvOS 27. In other words: if your app is built with the iOS 27 SDK, the key no longer brings the old design back.

There is a nuance worth keeping: if you still build with the iOS 26 SDK, the key can still have an effect on iOS 26. But that means staying on an old SDK, with the maintenance and compatibility consequences that implies. It is not a long-term solution.

The key is also global. It cannot say "only this screen without Liquid Glass". For a per-component exception, the API above is the right tool.

| Need | Tool |
| --- | --- |
| Hide the glass on a toolbar item or group | `.sharedBackgroundVisibility(.hidden)` on iOS 26+ |
| Separate groups while keeping the glass | `ToolbarSpacer` on iOS 26+ |
| Compatibility mode for the whole app | `UIDesignRequiresCompatibility` (ignored with the iOS 27 SDK) |

## My take: exceptions, not a regime

Personally, I think consistency with the system should be the default. Users learn once how iOS controls look and behave; Liquid Glass is part of that visual contract. Changing it in one isolated component can make people wonder whether it is a button, an ornament, or content.

But consistency isn't dogma. There are legitimate exceptions: a brand that already has its own language, a control that needs its own background to be legible, or a surface that shouldn't compete with the system glass. The key is that it should be a deliberate, documented, and tested exception, not a way to avoid adapting the app.

If someone asks for "no Liquid Glass in the whole app", the right conversation isn't about finding another magic key. It's about explaining the cost: global compatibility mode ends for apps built with the iOS 27 SDK, and per-component exceptions have to be maintained. Propose adopting the system by default and isolating exceptions with a concrete justification.

## Checklist before hiding the background

- Does the component really need its own background?
- Is it a toolbar item and not the whole bar?
- Is the modifier on the `ToolbarItem` or `ToolbarItemGroup`, not on the inner view?
- Are you using `.topBarLeading` or `.topBarTrailing` instead of deprecated placements?
- Do you have a fallback for iOS earlier than 26?
- Did you test contrast, dark mode, Reduce Transparency, Dynamic Type, and VoiceOver?
- Does the item still have an adequate hit target and keyboard focus?
- Is the exception documented so it doesn't become the norm?

## References

- [`sharedBackgroundVisibility(_:)`](https://developer.apple.com/documentation/swiftui/toolbarcontent/sharedbackgroundvisibility%28_%3A%29)
- [UIDesignRequiresCompatibility](https://developer.apple.com/documentation/bundleresources/information-property-list/uidesignrequirescompatibility)
- [ToolbarItemPlacement.topBarLeading](https://developer.apple.com/documentation/swiftui/toolbaritemplacement/topbarleading)
- [Build a SwiftUI app with the new design (WWDC25)](https://developer.apple.com/videos/play/wwdc2025/323/)
- [When toolbar items share a glass background in iOS 26](https://sarunw.com/posts/swiftui-toolbar-item-grouping-ios-26/)

</div>
