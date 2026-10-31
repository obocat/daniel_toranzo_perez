---
title: "ViewBuilder y applyIf: el coste oculto de una condición en SwiftUI"
title_en: "ViewBuilder and applyIf: the hidden cost of a condition in SwiftUI"
date: 2026-11-04 00:00:00
description: "Por qué un if dentro de @ViewBuilder cambia la identidad estructural de la vista y puede reiniciar su estado."
description_en: "Why an if inside @ViewBuilder changes the view's structural identity and can reset its state."
lang: es
tags: [iOS, SwiftUI, ViewBuilder, State, Architecture]
categories: blog
layout: blog
reading_time: 6
---

<div class="lang-es" lang="es" markdown="1">

Hay un helper que aparece una y otra vez en proyectos SwiftUI:

```swift
extension View {
    @ViewBuilder
    func applyIf<Content: View>(
        _ condition: Bool,
        transform: (Self) -> Content
    ) -> some View {
        if condition {
            transform(self)
        } else {
            self
        }
    }
}
```

La intención es buena: aplicar un modificador solo cuando se cumple una condición, sin repetir un `if` en cada vista. Compila, es cómodo y parece inocuo. Pero no lo es del todo.

## Lo que realmente construye ViewBuilder

`@ViewBuilder` no es solo azúcar sintáctico para elegir una vista u otra. Es un result builder: transforma el cuerpo de la función en una estructura de tipos.

Cuando usamos el helper de esta forma:

```swift
MyView()
    .applyIf(isEnabled) {
        $0.background(Color.red)
    }
```

el compilador genera algo equivalente a:

```swift
_ConditionalContent<Content, Self>
```

`_ConditionalContent` es un tipo interno de SwiftUI que representa dos ramas posibles. En el ejemplo, una rama contiene la vista modificada y la otra contiene la vista original:

```swift
_ConditionalContent<
    ModifiedContent<MyView, _BackgroundModifier<Color>>,
    MyView
>
```

No deberíamos usar `_ConditionalContent` directamente; lo importante es entender que el `if` no se evalúa como una simple condición dentro de un mismo modificador. La vista resultante tiene dos identidades estructurales posibles.

## Identidad estructural, no solo valores

SwiftUI distingue entre el valor de una vista y su identidad en la jerarquía. La identidad estructural depende del tipo y de la posición de la vista en el árbol. Un `if/else` dentro de un `ViewBuilder` crea dos posiciones distintas: la rama verdadera y la falsa.

Cuando `condition` cambia, SwiftUI no está cambiando el parámetro de un mismo modificador. Está eliminando una rama e insertando la otra. Si hay una animación, el resultado habitual es una transición —por ejemplo, un fade— en lugar de una interpolación entre los dos valores.

Eso también afecta al estado. SwiftUI asocia `@State`, `@StateObject`, `@FocusState` y `@GestureState` al ciclo de vida y a la identidad de la vista. Si la vista cambia de rama, su almacenamiento puede desaparecer y volver a inicializarse.

Con el helper definido arriba, el ejemplo se puede probar directamente en un `#Preview`:

```swift
struct Stateful: View {
    @State private var text = ""

    var body: some View {
        TextField("Name", text: $text)
            .textFieldStyle(.roundedBorder)
            .padding()
    }
}

struct Sample: View {
    let isEnabled: Bool

    var body: some View {
        Stateful()
            .applyIf(isEnabled) {
                $0.background(Color.red)
            }
    }
}

struct SamplePreview: View {
    @State private var isEnabled = false

    var body: some View {
        VStack(spacing: 24) {
            Sample(isEnabled: isEnabled)

            Button {
                isEnabled.toggle()
            } label: {
                Text(isEnabled ? "Disable applyIf" : "Enable applyIf")
                    .fontWeight(.semibold)
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.blue)
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }

            Text("isEnabled: \(isEnabled.description)")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding()
    }
}

#Preview {
    SamplePreview()
}
```

Al alternar `isEnabled`, el `TextField` puede perder el texto que el usuario había escrito. Lo mismo puede ocurrir con un `@StateObject` que se cree dentro de la vista condicional. No es que SwiftUI borre el estado porque sí: para SwiftUI, la vista ha cambiado de posición en el árbol.

Hay un matiz importante: si el estado vive en un padre que no cambia de identidad, sobrevive. El problema afecta al estado que pertenece a la vista que cambia de rama.

## El caso de las animaciones

El mismo mecanismo explica por qué `applyIf` puede romper una animación que debería ser continua:

```swift
Rectangle()
    .applyIf(isExpanded) {
        $0.frame(width: 200)
    }
```

frente a:

```swift
Rectangle()
    .frame(width: isExpanded ? 200 : 100)
```

La primera versión cambia de tipo y de rama; la segunda mantiene el mismo modificador y solo cambia un valor. SwiftUI puede interpolar la segunda; la primera se resuelve como una transición.

## Cómo mantener la identidad

La regla práctica es: si las dos ramas representan la misma vista con una configuración distinta, intenta mantener un único tipo y cambia solo el valor.

Cuando el modificador acepta un valor condicional, es la opción más directa:

```swift
MyView()
    .background(isEnabled ? Color.red : Color.clear)

MyView()
    .frame(width: isEnabled ? 200 : nil)

MyView()
    .opacity(isEnabled ? 1 : 0)
```

También puedes encapsular la condición en un `ViewModifier` estable:

```swift
struct ConditionalBackground: ViewModifier {
    let isEnabled: Bool

    func body(content: Content) -> some View {
        content.background(isEnabled ? Color.red : Color.clear)
    }
}

extension View {
    func conditionalBackground(_ isEnabled: Bool) -> some View {
        modifier(ConditionalBackground(isEnabled: isEnabled))
    }
}
```

El tipo `ModifiedContent<MyView, ConditionalBackground>` no cambia; el `Bool` es solo un parámetro. La identidad se mantiene y el modificador puede seguir aplicándose siempre.

Si el modificador no ofrece una forma condicional, otra opción es construir un pequeño `ViewModifier` específico que reciba el valor y decida dentro de `body(content:)`.

## Cuándo sí usar un if

No se trata de prohibir `applyIf` o los `if` en `ViewBuilder`. Las ramas son la herramienta correcta cuando realmente queremos dos estructuras distintas: mostrar una pantalla de carga o el contenido, un estado vacío o una lista, una vista u otra.

La clave es elegir conscientemente:

- Si quieres cambiar la estructura, usa `if/else` y asume que la identidad cambia.
- Si quieres cambiar solo una propiedad de la misma vista, mantén la identidad y pasa el valor al modificador.
- Si el estado debe sobrevivir a un cambio estructural, súbelo a un padre estable o a un modelo que no se destruya.

También conviene evitar `AnyView` como supuesta solución: borra el tipo, pero no conserva la identidad estructural y puede añadir coste. No es un atajo gratis.

## Conclusión

`applyIf` es cómodo, pero esconde una decisión de arquitectura: cada `if` en un `ViewBuilder` crea dos ramas con identidad propia. Eso puede reiniciar estado y convertir animaciones continuas en transiciones.

Antes de añadir un helper condicional, merece la pena preguntarse si las dos ramas son realmente dos vistas distintas o la misma vista con una configuración diferente. Si es lo segundo, mantener el tipo estable suele ser la opción más predecible.

## Referencias

- [ViewBuilder](https://developer.apple.com/documentation/swiftui/viewbuilder)
- [Demystify SwiftUI (WWDC21)](https://developer.apple.com/videos/play/wwdc2021/10022)
- [Why Conditional View Modifiers are a Bad Idea](https://www.objc.io/blog/2021/08/24/conditional-view-modifiers)
- [Structural identity in SwiftUI](https://swiftwithmajid.com/2021/12/09/structural-identity-in-swiftui)

</div>

<div class="lang-en" lang="en" markdown="1">

There is a helper that keeps showing up in SwiftUI projects:

```swift
extension View {
    @ViewBuilder
    func applyIf<Content: View>(
        _ condition: Bool,
        transform: (Self) -> Content
    ) -> some View {
        if condition {
            transform(self)
        } else {
            self
        }
    }
}
```

The intention is good: apply a modifier only when a condition holds, without repeating an `if` in every view. It compiles, it is convenient, and it looks harmless. But it isn't entirely harmless.

## What ViewBuilder actually builds

`@ViewBuilder` is not just syntactic sugar for choosing one view or another. It is a result builder: it transforms the function body into a type structure.

When we use the helper like this:

```swift
MyView()
    .applyIf(isEnabled) {
        $0.background(Color.red)
    }
```

the compiler produces something equivalent to:

```swift
_ConditionalContent<Content, Self>
```

`_ConditionalContent` is an internal SwiftUI type that represents two possible branches. In the example, one branch contains the modified view and the other contains the original view:

```swift
_ConditionalContent<
    ModifiedContent<MyView, _BackgroundModifier<Color>>,
    MyView
>
```

We shouldn't use `_ConditionalContent` directly; what matters is understanding that the `if` is not evaluated as a simple condition inside a single modifier. The resulting view has two possible structural identities.

## Structural identity, not just values

SwiftUI distinguishes between a view's value and its identity in the hierarchy. Structural identity depends on the view's type and position in the tree. An `if/else` inside a `ViewBuilder` creates two different positions: the true branch and the false branch.

When `condition` changes, SwiftUI is not changing the parameter of a single modifier. It is removing one branch and inserting the other. If there is an animation, the usual result is a transition —a fade, for example— instead of an interpolation between the two values.

This also affects state. SwiftUI associates `@State`, `@StateObject`, `@FocusState`, and `@GestureState` with the view's lifetime and identity. If the view changes branches, its storage may disappear and be initialized again.

With the helper defined above, the example can be tested directly in a `#Preview`:

```swift
struct Stateful: View {
    @State private var text = ""

    var body: some View {
        TextField("Name", text: $text)
            .textFieldStyle(.roundedBorder)
            .padding()
    }
}

struct Sample: View {
    let isEnabled: Bool

    var body: some View {
        Stateful()
            .applyIf(isEnabled) {
                $0.background(Color.red)
            }
    }
}

struct SamplePreview: View {
    @State private var isEnabled = false

    var body: some View {
        VStack(spacing: 24) {
            Sample(isEnabled: isEnabled)

            Button {
                isEnabled.toggle()
            } label: {
                Text(isEnabled ? "Disable applyIf" : "Enable applyIf")
                    .fontWeight(.semibold)
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.blue)
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }

            Text("isEnabled: \(isEnabled.description)")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding()
    }
}

#Preview {
    SamplePreview()
}
```

Toggling `isEnabled` can make the `TextField` lose the text the user had typed. The same can happen with a `@StateObject` created inside the conditional view. It's not that SwiftUI clears state for no reason: from its perspective, the view has moved to a different position in the tree.

There is an important nuance: if the state lives in a parent whose identity doesn't change, it survives. The problem affects state owned by the view that changes branches.

## The animation case

The same mechanism explains why `applyIf` can break an animation that should be continuous:

```swift
Rectangle()
    .applyIf(isExpanded) {
        $0.frame(width: 200)
    }
```

versus:

```swift
Rectangle()
    .frame(width: isExpanded ? 200 : 100)
```

The first version changes type and branch; the second keeps the same modifier and only changes a value. SwiftUI can interpolate the second one; the first resolves as a transition.

## How to preserve identity

The practical rule is: if both branches represent the same view with a different configuration, try to keep a single type and change only the value.

When the modifier accepts a conditional value, that is the most direct option:

```swift
MyView()
    .background(isEnabled ? Color.red : Color.clear)

MyView()
    .frame(width: isEnabled ? 200 : nil)

MyView()
    .opacity(isEnabled ? 1 : 0)
```

You can also wrap the condition in a stable `ViewModifier`:

```swift
struct ConditionalBackground: ViewModifier {
    let isEnabled: Bool

    func body(content: Content) -> some View {
        content.background(isEnabled ? Color.red : Color.clear)
    }
}

extension View {
    func conditionalBackground(_ isEnabled: Bool) -> some View {
        modifier(ConditionalBackground(isEnabled: isEnabled))
    }
}
```

The type `ModifiedContent<MyView, ConditionalBackground>` doesn't change; the `Bool` is just a parameter. Identity is preserved and the modifier can remain applied at all times.

If the modifier doesn't offer a conditional form, another option is to build a small purpose-specific `ViewModifier` that receives the value and makes the decision inside `body(content:)`.

## When an if is the right tool

This is not about banning `applyIf` or `if` statements in `ViewBuilder`. Branches are the right tool when we genuinely want two different structures: showing a loading screen or the content, an empty state or a list, one view or another.

The key is to choose deliberately:

- If you want to change the structure, use `if/else` and accept that identity changes.
- If you want to change only a property of the same view, preserve identity and pass the value to the modifier.
- If state must survive a structural change, lift it to a stable parent or to a model that isn't destroyed.

It's also worth avoiding `AnyView` as an alleged fix: it erases the type, but it doesn't preserve structural identity and can add cost. It isn't a free shortcut.

## Conclusion

`applyIf` is convenient, but it hides an architectural decision: every `if` in a `ViewBuilder` creates two branches with their own identity. That can reset state and turn continuous animations into transitions.

Before adding a conditional helper, it's worth asking whether the two branches are really two different views or the same view with a different configuration. If it's the latter, keeping the type stable is usually the more predictable option.

## References

- [ViewBuilder](https://developer.apple.com/documentation/swiftui/viewbuilder)
- [Demystify SwiftUI (WWDC21)](https://developer.apple.com/videos/play/wwdc2021/10022)
- [Why Conditional View Modifiers are a Bad Idea](https://www.objc.io/blog/2021/08/24/conditional-view-modifiers)
- [Structural identity in SwiftUI](https://swiftwithmajid.com/2021/12/09/structural-identity-in-swiftui)

</div>
