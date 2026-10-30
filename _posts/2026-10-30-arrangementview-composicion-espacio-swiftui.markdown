---
title: "ArrangementView: composición y distribución del espacio en SwiftUI"
title_en: "ArrangementView: composition and space distribution in SwiftUI"
date: 2026-10-30 00:00:00
description: "Cómo ArrangementView lleva la gestión del espacio en SwiftUI de la prioridad entre vistas a la composición entre secciones."
description_en: "How ArrangementView takes SwiftUI space management from view-level priority to section-level composition."
lang: es
tags: [iOS, iPhone Duo, SwiftUI, Layout, ArrangementView]
categories: blog
layout: blog
reading_time: 7
---

<div class="lang-es" lang="es" markdown="1">

En el [artículo anterior](/blog/2026/10/29/iphone-duo-layout-camara/) vimos cómo adaptamos una app al iPhone Duo: los layouts fueron mucho más sencillos de lo esperado y la cámara fue la parte difícil. Una de las piezas que hizo que el layout fuera tan llevadero fue `ArrangementView`.

Pero antes de entrar en la API, conviene entender qué problema resuelve. Y para eso hay que empezar por algo más conocido: `layoutPriority`.

## De la prioridad de layout a la composición

`layoutPriority` permite influir en cómo un contenedor reparte el espacio entre sus vistas hijas. Cuando el espacio es limitado, SwiftUI puede usar esa prioridad para decidir qué vista conserva su tamaño ideal y cuál se comprime.

Por ejemplo:

```swift
HStack {
    Text("Media")
        .layoutPriority(1)

    Text("Products")
}
```

La primera vista tiene preferencia frente a la segunda cuando hay que negociar el espacio. Es una herramienta local: actúa entre vistas hermanas dentro de un mismo contenedor.

El problema aparece cuando la decisión ya no es "qué `Text` se encoge antes", sino "cómo se relacionan dos secciones completas de la interfaz". Ahí `layoutPriority` se queda corto: no expresa una política de composición.

## Composition-level layout

`ArrangementView` sube un nivel de abstracción. En lugar de repartir espacio entre vistas individuales, permite declarar una relación entre una sección primaria y una secundaria, y dejar que el contenedor decida cómo componerlas según el espacio disponible y la pose del dispositivo.

En el iPhone Duo esto encaja especialmente bien: la geometría cambia entre pantallas y poses, pero la relación principal/secundaria puede mantenerse aunque cambie la disposición.

Un ejemplo:

```swift
ArrangementView {
    mediaSection
        .splitArrangementFixedLayoutSize(
            horizontal: false,
            vertical: false
        )
} secondary: {
    productsSection
        .splitArrangementFixedLayoutSize(
            horizontal: false,
            vertical: true
        )
}
.arrangementViewStyle(.split)
```

Aquí hay tres decisiones distintas:

- `ArrangementView` establece la relación entre `mediaSection` y `productsSection`.
- `.arrangementViewStyle(.split)` elige la estrategia de composición: las dos secciones se reparten el espacio en una disposición dividida.
- `splitArrangementFixedLayoutSize(horizontal:vertical:)` indica en qué ejes cada sección debe usar su tamaño ideal en lugar de estirarse.

En el ejemplo, `mediaSection` no fija ninguno de los dos ejes, mientras que `productsSection` fija la dimensión vertical. El resultado no es un `frame` rígido: es una restricción de tamaño que el contenedor interpreta según el espacio y la pose. Si no hay sitio para mantener la split, `ArrangementView` puede mostrar solo la vista primaria.

## Qué hace cada pieza

| API | Responsabilidad |
| --- | --- |
| `layoutPriority` | Influye en la negociación del espacio entre vistas. |
| `ArrangementView` | Define cómo se componen y distribuyen las secciones primaria y secundaria. |
| `splitArrangementFixedLayoutSize` | Expresa restricciones de tamaño por eje para una sección. |
| `arrangementViewStyle(.split)` | Establece la estrategia visual de composición. |

La diferencia importante es de nivel. `layoutPriority` responde a una pregunta local: "¿qué vista debería conservar su tamaño preferido?". `ArrangementView` responde a una pregunta estructural: "¿qué relación hay entre estas dos secciones y cómo debe cambiar cuando el contenedor cambia de forma?".

## El matiz de `.split`

`.split` no significa "siempre lado a lado". Significa que el contenedor intentará repartir el espacio entre las dos secciones y decidirá la orientación según el espacio disponible. En el iPhone Duo también tiene en cuenta regiones reservadas como el pliegue.

Si quieres limitar la split a un eje concreto, puedes usar:

```swift
.arrangementViewStyle(.split.axes(.horizontal))
```

Eso es útil cuando el diseño solo tiene sentido en horizontal. Pero conviene no forzarlo sin necesidad: parte del valor de `ArrangementView` es precisamente adaptar la composición a la pose del dispositivo.

## Cuándo usarlo y cuándo no

`ArrangementView` no es un sustituto general de `HStack`, `VStack` o `ZStack`. Es un contenedor especializado para una relación estable entre contenido principal y secundario. Antes de usarlo, merece la pena responder:

- ¿La relación principal/secundaria tiene sentido en todas las poses?
- ¿Qué sección puede desaparecer cuando no hay espacio?
- ¿La vista secundaria sigue siendo accesible si el contenedor la oculta?
- ¿El cambio entre split y overlay requiere intercambiar los roles de primary y secondary?

Ese último punto es fácil de pasar por alto. En una split, la vista primaria es la que permanece cuando no cabe la división. En un overlay, la primaria es la que queda por encima. La misma palabra no siempre implica la misma jerarquía visual. Si el diseño alterna entre estilos, conviene revisar los roles.

También hay que recordar que estas configuraciones expresan preferencias, no resultados garantizados. El contenedor decide al final. Si la interfaz necesita saber exactamente qué disposición se está mostrando, puede que `ArrangementView` no sea la herramienta adecuada.

## Conclusión

Podemos entender `ArrangementView` como una evolución conceptual de la gestión tradicional del espacio en SwiftUI, pero aplicada a un nivel superior.

Mientras `layoutPriority` interviene en la negociación del espacio entre vistas individuales, `ArrangementView` permite definir políticas de composición entre bloques completos de contenido.

En otras palabras: pasamos de decidir qué vista tiene prioridad durante el layout a definir cómo queremos que se componga y distribuya una interfaz.

Una forma de resumir la diferencia:

- `layoutPriority`: layout negotiation priority.
- `ArrangementView`: compositional layout policy.

Esa distinción ayuda a pensar la interfaz desde una perspectiva más estructural, separando las decisiones de composición de los detalles internos del layout de cada sección.

## Referencias

- [ArrangementView](https://developer.apple.com/documentation/swiftui/arrangementview)
- [splitArrangementFixedLayoutSize(horizontal:vertical:)](https://developer.apple.com/documentation/swiftui/view/splitarrangementfixedlayoutsize(horizontal:vertical:))
- [arrangementViewStyle(_:)](https://developer.apple.com/documentation/swiftui/view/arrangementviewstyle(_:))
- [ArrangementView: Think Before You Arrange](https://fatbobman.com/en/posts/arrangementview-think-before-you-arrange)
- [Adaptar una app al iPhone Duo](/blog/2026/10/29/iphone-duo-layout-camara/)

</div>

<div class="lang-en" lang="en" markdown="1">

In the [previous article](/blog/2026/10/29/iphone-duo-layout-camara/) we saw how we adapted an app to iPhone Duo: layouts were much easier than expected, and the camera was the hard part. One of the pieces that made the layout so manageable was `ArrangementView`.

But before getting into the API, it's worth understanding what problem it solves. And for that, we should start with something more familiar: `layoutPriority`.

## From layout priority to composition

`layoutPriority` lets you influence how a container distributes space among its child views. When space is limited, SwiftUI can use that priority to decide which view keeps its ideal size and which one gets compressed.

For example:

```swift
HStack {
    Text("Media")
        .layoutPriority(1)

    Text("Products")
}
```

The first view has preference over the second when space has to be negotiated. It is a local tool: it acts between sibling views inside the same container.

The problem appears when the decision is no longer "which `Text` shrinks first", but "how do two complete sections of the interface relate to each other?". That's where `layoutPriority` falls short: it doesn't express a composition policy.

## Composition-level layout

`ArrangementView` raises the level of abstraction. Instead of distributing space between individual views, it lets you declare a relationship between a primary and a secondary section, and lets the container decide how to compose them based on available space and device pose.

This fits iPhone Duo especially well: the geometry changes between displays and poses, but the primary/secondary relationship can remain even when the arrangement changes.

An example:

```swift
ArrangementView {
    mediaSection
        .splitArrangementFixedLayoutSize(
            horizontal: false,
            vertical: false
        )
} secondary: {
    productsSection
        .splitArrangementFixedLayoutSize(
            horizontal: false,
            vertical: true
        )
}
.arrangementViewStyle(.split)
```

There are three distinct decisions here:

- `ArrangementView` establishes the relationship between `mediaSection` and `productsSection`.
- `.arrangementViewStyle(.split)` chooses the composition strategy: both sections share space in a split arrangement.
- `splitArrangementFixedLayoutSize(horizontal:vertical:)` indicates which axes each section should keep at its ideal size instead of stretching.

In the example, `mediaSection` doesn't fix either axis, while `productsSection` fixes the vertical dimension. The result is not a rigid `frame`: it is a size constraint that the container interprets according to available space and pose. If there isn't enough room to keep the split, `ArrangementView` may show only the primary view.

## What each piece does

| API | Responsibility |
| --- | --- |
| `layoutPriority` | Influences space negotiation between views. |
| `ArrangementView` | Defines how primary and secondary sections are composed and distributed. |
| `splitArrangementFixedLayoutSize` | Expresses per-axis size constraints for a section. |
| `arrangementViewStyle(.split)` | Sets the visual composition strategy. |

The important difference is one of level. `layoutPriority` answers a local question: "which view should keep its preferred size?". `ArrangementView` answers a structural question: "what relationship exists between these two sections, and how should it change when the container changes shape?".

## The `.split` nuance

`.split` doesn't mean "always side by side". It means the container will try to share space between the two sections and decide the orientation based on available space. On iPhone Duo it also accounts for reserved regions such as the fold.

If you want to constrain the split to a specific axis, you can use:

```swift
.arrangementViewStyle(.split.axes(.horizontal))
```

That's useful when the design only makes sense horizontally. But don't force it without need: part of `ArrangementView`'s value is precisely adapting the composition to the device pose.

## When to use it, and when not to

`ArrangementView` is not a general replacement for `HStack`, `VStack`, or `ZStack`. It is a specialised container for a stable relationship between primary and secondary content. Before using it, it's worth answering:

- Does the primary/secondary relationship make sense in every pose?
- Which section can disappear when there isn't enough space?
- Is the secondary view still accessible if the container hides it?
- Does switching between split and overlay require swapping the primary and secondary roles?

That last point is easy to miss. In a split, the primary view is the one that remains when the division doesn't fit. In an overlay, the primary is the one on top. The same word doesn't always imply the same visual hierarchy. If the design alternates between styles, review the roles.

Also remember that these configurations express preferences, not guaranteed outcomes. The container makes the final call. If the interface needs to know exactly which arrangement is being shown, `ArrangementView` may not be the right tool.

## Conclusion

We can understand `ArrangementView` as a conceptual evolution of traditional space management in SwiftUI, applied at a higher level.

While `layoutPriority` takes part in space negotiation between individual views, `ArrangementView` lets you define composition policies between complete blocks of content.

In other words: we move from deciding which view has priority during layout to defining how we want an interface to be composed and distributed.

One way to summarise the difference:

- `layoutPriority`: layout negotiation priority.
- `ArrangementView`: compositional layout policy.

That distinction helps us think about interfaces from a more structural perspective, separating composition decisions from the internal layout details of each section.

## References

- [ArrangementView](https://developer.apple.com/documentation/swiftui/arrangementview)
- [splitArrangementFixedLayoutSize(horizontal:vertical:)](https://developer.apple.com/documentation/swiftui/view/splitarrangementfixedlayoutsize(horizontal:vertical:))
- [arrangementViewStyle(_:)](https://developer.apple.com/documentation/swiftui/view/arrangementviewstyle(_:))
- [ArrangementView: Think Before You Arrange](https://fatbobman.com/en/posts/arrangementview-think-before-you-arrange)
- [Adapting an app to iPhone Duo](/blog/2026/10/29/iphone-duo-layout-camara/)

</div>
