---
title: "@MainActor no es un hilo: es aislamiento"
title_en: "@MainActor is not a thread: it is isolation"
date: 2026-11-16 00:00:00
description: "Qué garantiza realmente @MainActor, hasta dónde puede comprobar el compilador y por qué mezclar formas de volver al main actor produce bugs de orden."
description_en: "What @MainActor really guarantees, how far the compiler can check, and why mixing ways of returning to the main actor causes ordering bugs."
lang: es
tags: [iOS, Swift, Concurrency, MainActor, Swift 6.2]
categories: blog
layout: blog
reading_time: 10
---

<div class="lang-es" lang="es" markdown="1">

`@MainActor` es una de esas anotaciones que se aprenden en cinco minutos y se entienden mal durante meses. La frase habitual —“pon `@MainActor` y ya se ejecuta en el main thread”— es una buena aproximación, pero mezcla dos ideas: el mecanismo de aislamiento y el lugar donde acaba ejecutándose el código.

En las plataformas de Apple, el main actor usa el main thread como executor. No es un detalle menor. Aun así, la garantía del compilador es más concreta: el estado aislado solo se toca desde código aislado al main actor. Eso no significa que tu código sea seguro en todos los sentidos ni que el estado vaya a seguir igual después de un `await`.

## Qué garantiza realmente

`@MainActor` es un global actor. Cuando anotas un tipo, una propiedad o una función, el compilador comprueba que el acceso se hace desde código aislado a ese actor:

```swift
@MainActor
final class ProfileModel {
    private(set) var name = "Ana"

    func updateName(_ newName: String) {
        name = newName
    }
}

func updateFromAnywhere(_ model: ProfileModel) async {
    await model.updateName("Bea")
}
```

`updateFromAnywhere` puede llamarse desde cualquier contexto: el `await` asegura que `updateName` se ejecute en el main actor. Dentro del método, el acceso a `name` está serializado, así que no hay dos trabajos del main actor tocándolo a la vez.

Eso es lo que garantiza `@MainActor`: aislamiento. No añade atomicidad entre dos llamadas, no impide que otro trabajo del main actor se cuele durante un `await` y no hace seguro un método `nonisolated`.

> **Importante:** En las plataformas de Apple, el main actor usa el main thread como executor. La garantía que añade `@MainActor` es aislamiento y serialización del acceso al estado, no que cualquier código que se ejecute en el main thread sea correcto.
{: .doc-callout .doc-callout--important}

## Dónde termina la garantía

El compilador solo puede proteger lo que alcanza a ver. Hay varios puntos en los que la promesa se queda corta o depende de una decisión tuya.

### `nonisolated`

Un método `nonisolated` no tiene aislamiento estático de actor. Puede ejecutarse en cualquier contexto, pero no puede tocar estado aislado directamente:

```swift
@MainActor
final class LabelModel {
    private(set) var name = "Ana"

    nonisolated func label() -> String {
        "Perfil"
    }
}
```

`label()` es seguro porque no lee `name`. Si intentas leerlo desde ahí, el compilador te obliga a cruzar la frontera de forma explícita: hacer el método `async` y usar `await`, o recurrir a `assumeIsolated` si puedes demostrar que ya estás en el main actor. No es una fuga: es una frontera.

### `init`

El `init` de una clase `@MainActor` está aislado por defecto. Si lo marcas como `nonisolated`, puedes construir la instancia desde cualquier contexto. El init puede inicializar las propiedades y ejecutar código nonisolated, pero no puede llamar a métodos aislados al main actor. A partir de ahí, los métodos y el estado aislado siguen necesitando el main actor:

```swift
@MainActor
final class InitModel {
    private(set) var name: String

    nonisolated init(name: String) {
        self.name = name
    }

    func updateName(_ newName: String) {
        name = newName
    }
}
```

Un `nonisolated init` no expone el estado: solo permite construir la instancia fuera del actor. El estado sigue protegido.

### Modos de lenguaje y `strict concurrency`

En el modo de lenguaje Swift 5, la comprobación de concurrencia no es completa por defecto. `@MainActor` se sigue aplicando, pero las fronteras de `Sendable` y las llamadas a código sin anotar no siempre se diagnostican como errores. En el modo de lenguaje Swift 6, la comprobación completa convierte esas violaciones en errores.

Si el proyecto sigue en el modo de lenguaje Swift 5, no asumas que el compilador está verificando todas las fronteras. Y si actualizas al modo Swift 6, prepárate para encontrar llamadas que llevaban tiempo mal anotadas.

### `@preconcurrency`, `@unchecked Sendable` y callbacks sin anotar

`@preconcurrency` se aplica a las importaciones de módulos antiguos para rebajar la severidad de los diagnósticos. No hace que el módulo sea seguro. `@unchecked Sendable` es una promesa tuya: el compilador deja de verificar los requisitos de `Sendable`. Por su parte, los callbacks de Objective-C o de frameworks antiguos no siempre están anotados con el actor correcto.

En esos puntos no hay una garantía rota por arte de magia: hay una frontera que el compilador no puede demostrar. Tú tienes que cerrarla.

### `MainActor.assumeIsolated`

`MainActor.assumeIsolated` es una herramienta síncrona para cuando ya sabes que estás en el main actor, pero el compilador no puede demostrarlo. Con el `ProfileModel` inicial:

```swift
func legacyCallback(_ model: ProfileModel) {
    MainActor.assumeIsolated {
        model.updateName("Bea")
    }
}
```

No es un “quizá”. Comprueba que la ejecución esté en el executor del main actor y, si no lo está, termina con un fatal error. Úsalo solo cuando el contrato del callback garantice que ya estás en el main actor. Si no tienes esa prueba, vuelve al actor de forma normal:

```swift
func legacyCallback(_ model: ProfileModel) {
    Task { @MainActor in
        model.updateName("Bea")
    }
}
```

> **Nota:** `MainActor.assumeIsolated` no comprueba “más o menos”: comprueba que estés en el executor del main actor y falla si te equivocas. Es una afirmación, no una red de seguridad.
{: .doc-callout .doc-callout--note}

## Reentrancia: el main actor no te da exclusividad

El main actor serializa trabajos, no funciones `async` completas. Cuando una función se suspende en un `await` y se reanuda en el main actor, lo hace como un trabajo nuevo. Entre la suspensión y la reanudación puede colarse otro turno del run loop, otro evento u otra tarea.

Ahí aparece la reentrancia. Un ejemplo mínimo:

```swift
import Foundation

@MainActor
final class StepModel {
    var step = 0

    func run() async {
        step = 1
        print("before await:", step)
        await Task.yield()
        print("after await:", step)
    }

    func advance() {
        step = 2
        print("advanced:", step)
    }
}

@main
struct ReentrancyDemo {
    @MainActor
    static func main() async {
        let model = StepModel()
        let task = Task { @MainActor in
            await model.run()
        }

        await Task.yield()
        model.advance()
        await task.value
    }
}
```

En mi ejecución con Swift 6.0, la salida es:

```text
before await: 1
advanced: 2
after await: 2
```

`run()` no perdió el aislamiento. Siguió en el main actor. Lo que ocurrió es que, mientras estaba suspendido, `advance()` pudo ejecutarse y cambiar el estado. Al reanudarse, `run()` se encontró con un valor distinto.

> **Importante:** El main actor serializa trabajos, no funciones `async` completas. Cada reanudación en el main actor se ejecuta como un trabajo nuevo; entre la suspensión y la reanudación puede ejecutarse otro turno del run loop.
{: .doc-callout .doc-callout--important}

El matiz está en el `await`: no es “cada `await`”, sino cada reanudación que vuelve al main actor. Un `await` que no suspende no abre la puerta a otro trabajo.

## Por qué no mezclar mecanismos

La reentrancia explica por qué el estado puede cambiar entre dos tramos de una función. El orden explica por qué dos formas de volver al main actor no son equivalentes.

Hay varias formas de volver al main actor, y no son intercambiables:

- **`DispatchQueue.main.async`:** ejecuta el bloque en la main queue. No propaga valores task-local y no es estructurado.
- **`Task { @MainActor in ... }`:** se ejecuta en el main actor. Puede heredar la prioridad y los valores task-local del contexto; si guardas la tarea, puedes pedir su cancelación, pero sigue siendo una tarea no estructurada.
- **`Task.detached { @MainActor in ... }`:** el cuerpo se ejecuta en el main actor gracias a `@MainActor`, pero la tarea está desacoplada; no hereda el contexto del actor ni los valores task-local.
- **`await MainActor.run { ... }`:** ejecuta el bloque en el main actor sin crear una tarea nueva; si no estás ya en el actor, la función se suspende y se reanuda después.

`DispatchQueue.main.async` pertenece a GCD. No participa de la estructura de tareas de Swift, no propaga valores task-local y no comparte las garantías de orden de las tareas de Swift. `Task { @MainActor in ... }` crea una tarea y puede heredar contexto. `Task.detached` rompe ese vínculo a propósito. `MainActor.run` es una forma explícita de ejecutar un bloque en el main actor dentro de una función `async`.

> **Importante:** `Task.detached` no vuelve al main actor por sí solo. Si no añades `@MainActor` o `MainActor.run`, se ejecuta fuera del main actor. No existe una API llamada `async main detach`.
{: .doc-callout .doc-callout--important}

El problema de mezclarlos no es que uno sea mejor que otro, sino que no comparten el mismo mecanismo de planificación ni las mismas garantías de orden. No hay una garantía de orden entre un `DispatchQueue.main.async` y un `Task { @MainActor in }`. Si además hay un `await MainActor.run` en medio, el orden puede cambiar otra vez.

## Swift 6.2: qué cambia y qué sigue siendo opt-in

Swift 6.2 añadió dos piezas que afectan directamente a este problema.

La primera es el **aislamiento por defecto en `MainActor`**. Con `-default-isolation MainActor` —o la opción equivalente en Xcode— las declaraciones sin anotar de un módulo quedan aisladas al main actor. Los proyectos nuevos de Xcode 26 suelen venir con ese ajuste. Es cómodo para una app con mucha UI, pero es una decisión por módulo: una librería compartida o una capa de red puede que no quiera ese valor por defecto.

La segunda es el comportamiento `nonisolated(nonsending)`. Con el *upcoming feature* `NonisolatedNonsendingByDefault` —que se activa con el ajuste Approachable Concurrency— las funciones `async` no aisladas se ejecutan por defecto en el actor de quien las llama; si quien llama no está aislado, usan el executor global. Si las llamas desde el main actor, se quedan en el main actor. Para forzar que salgan a un executor global, usa `@concurrent`.

```swift
import Foundation

struct MetadataLoader: Sendable {
    nonisolated func load() async -> String {
        // Swift 6.2 + NonisolatedNonsendingByDefault:
        // si se llama desde el main actor, se queda en el main actor.
        "metadata"
    }

    @concurrent
    func decode() async -> Data {
        // Siempre sale al executor global.
        Data()
    }
}
```

Ese fragmento requiere Swift 6.2; el comportamiento de `load()` requiere además `NonisolatedNonsendingByDefault`. No compila con Swift 6.0. Lo importante es la idea: con esta característica, `nonisolated` ya no significa automáticamente “fuera del actor de quien llama”. Si quieres salir, pide `@concurrent`.

## Reglas prácticas

No hay una única forma correcta, pero sí una buena disciplina:

- **Una convención por módulo.** Si el módulo usa la concurrencia de Swift, vuelve al main actor con `Task { @MainActor in }` o `await MainActor.run`. Si integra código GCD, aísla ese código en un adaptador y no lo repartas por todas partes.
- **Aísla en el tipo, no en cada llamada.** Marca el view model como `@MainActor` y deja que el compilador compruebe sus accesos. No llenes cada método de `MainActor.run`.
- **Revalida después de un `await`.** El estado que leíste antes de suspender puede haber cambiado. Si la operación depende de una versión concreta del estado, compruébalo al volver.
- **No uses `@unchecked Sendable` para callar al compilador.** Si lo necesitas, documenta por qué el tipo es seguro y qué invariante mantiene.
- **Reserva `assumeIsolated` para callbacks que ya se ejecutan en el main actor.** Si no puedes demostrarlo, usa un salto normal al actor.
- **Evita `Task.detached` salvo que quieras perder el contexto.** Para trabajo que debe salir del main actor, `@concurrent` suele expresar mejor la intención.

## Conclusión

`@MainActor` es una gran herramienta para el estado de la UI. También es una fuente de bugs sutiles cuando se confunde aislamiento con seguridad total.

El compilador te dice dónde puedes tocar el estado. No te dice cuándo, ni en qué orden, ni qué ha cambiado mientras esperabas. Esa parte sigue siendo diseño de concurrencia.

Si tienes que recordar una frase: **`@MainActor` garantiza aislamiento, no inmunidad**.

## Referencias

- [MainActor](https://developer.apple.com/documentation/swift/mainactor)
- [`MainActor.assumeIsolated`](https://developer.apple.com/documentation/swift/mainactor/assumeisolated%28_%3Afile%3Aline%3A%29)
- [Swift 6.2 released](https://www.swift.org/blog/swift-6.2-released/)
- [SE-0461: Run nonisolated async functions on the caller's actor by default](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0461-async-function-isolation.md)
- [SE-0466: Control default actor isolation inference](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0466-control-default-actor-isolation.md)
- [nonisolated(nonsending) by default](https://docs.swift.org/compiler/documentation/diagnostics/nonisolated-nonsending-by-default/)
- [WWDC25: Embracing Swift concurrency](https://developer.apple.com/videos/play/wwdc2025/268/)

</div>

<div class="lang-en" lang="en" markdown="1">

`@MainActor` is one of those annotations you learn in five minutes and misunderstand for months. The usual line — "add `@MainActor` and it runs on the main thread" — is a good approximation, but it mixes two ideas: the isolation mechanism and the place where the code ends up running.

On Apple platforms, the main actor uses the main thread as its executor. That is not a minor detail. Still, the compiler's guarantee is more specific: isolated state is only touched from code isolated to the main actor. It does not mean your code is safe in every sense, or that the state will be the same after an `await`.

## What it really guarantees

`@MainActor` is a global actor. When you annotate a type, a property, or a function, the compiler checks that access happens from code isolated to that actor:

```swift
@MainActor
final class ProfileModel {
    private(set) var name = "Ana"

    func updateName(_ newName: String) {
        name = newName
    }
}

func updateFromAnywhere(_ model: ProfileModel) async {
    await model.updateName("Bea")
}
```

`updateFromAnywhere` can be called from any context: the `await` ensures that `updateName` runs on the main actor. Inside the method, access to `name` is serialized, so no two main actor jobs touch it at the same time.

That is the guarantee: isolation. It does not add atomicity across two calls, it does not prevent another main actor job from slipping in during an `await`, and it does not make a `nonisolated` method safe.

> **Important:** On Apple platforms, the main actor uses the main thread as its executor. The guarantee `@MainActor` adds is isolation and serialization of access to state, not that any code running on the main thread is correct.
{: .doc-callout .doc-callout--important}

## Where the guarantee ends

The compiler can only protect what it can see. There are several places where the promise falls short or depends on a decision you make.

### `nonisolated`

A `nonisolated` method has no static actor isolation. It can run in any context, but it cannot directly touch isolated state:

```swift
@MainActor
final class LabelModel {
    private(set) var name = "Ana"

    nonisolated func label() -> String {
        "Profile"
    }
}
```

`label()` is safe because it does not read `name`. If you try to read it from there, the compiler forces you to cross the boundary explicitly: make the method `async` and use `await`, or use `assumeIsolated` if you can prove you are already on the main actor. It is not a leak; it is a boundary.

### `init`

A `@MainActor` class's `init` is isolated by default. If you mark it `nonisolated`, you can construct the instance from any context. The init can initialize properties and run nonisolated code, but it cannot call methods isolated to the main actor. From that point on, the isolated methods and state still need the main actor:

```swift
@MainActor
final class InitModel {
    private(set) var name: String

    nonisolated init(name: String) {
        self.name = name
    }

    func updateName(_ newName: String) {
        name = newName
    }
}
```

A `nonisolated init` does not expose the state: it only lets you construct the instance outside the actor. The state remains protected.

### Language modes and strict concurrency

In Swift 5 language mode, concurrency checking is incomplete by default. `@MainActor` is still enforced, but `Sendable` boundaries and calls into unannotated code are not always diagnosed as errors. In Swift 6 language mode, complete concurrency checking turns those violations into errors.

If the project is still in Swift 5 language mode, do not assume the compiler is verifying every boundary. And if you upgrade to Swift 6 language mode, expect to find calls that have been misannotated for a while.

### `@preconcurrency`, `@unchecked Sendable`, and unannotated callbacks

`@preconcurrency` is applied to imports from older modules to soften diagnostics. It does not make the module safe. `@unchecked Sendable` is your promise: the compiler stops checking the `Sendable` requirements. Callbacks from Objective-C or older frameworks, meanwhile, are not always annotated with the right actor.

At those points the guarantee is not broken by magic: there is a boundary the compiler cannot prove. You have to close it.

### `MainActor.assumeIsolated`

`MainActor.assumeIsolated` is a synchronous tool for when you already know you are on the main actor, but the compiler cannot prove it. With the original `ProfileModel`:

```swift
func legacyCallback(_ model: ProfileModel) {
    MainActor.assumeIsolated {
        model.updateName("Bea")
    }
}
```

It is not a guess: it checks that execution is on the main actor's executor and, if not, stops with a fatal error. Use it only when the callback contract guarantees you are already on the main actor. If you cannot prove that, return to the actor normally:

```swift
func legacyCallback(_ model: ProfileModel) {
    Task { @MainActor in
        model.updateName("Bea")
    }
}
```

> **Note:** `MainActor.assumeIsolated` does not check "roughly": it checks that you are on the main actor's executor and fails if you are wrong. It is an assertion, not a safety net.
{: .doc-callout .doc-callout--note}

## Reentrancy: the main actor does not give you exclusivity

The main actor serializes jobs, not complete `async` functions. When a function suspends at an `await` and resumes on the main actor, it does so as a new job. Another run loop turn, another event, or another task can slip in between suspension and resumption.

That is where reentrancy appears. A minimal example:

```swift
import Foundation

@MainActor
final class StepModel {
    var step = 0

    func run() async {
        step = 1
        print("before await:", step)
        await Task.yield()
        print("after await:", step)
    }

    func advance() {
        step = 2
        print("advanced:", step)
    }
}

@main
struct ReentrancyDemo {
    @MainActor
    static func main() async {
        let model = StepModel()
        let task = Task { @MainActor in
            await model.run()
        }

        await Task.yield()
        model.advance()
        await task.value
    }
}
```

In my run with Swift 6.0, the output is:

```text
before await: 1
advanced: 2
after await: 2
```

`run()` did not lose isolation. It stayed on the main actor. What happened is that, while it was suspended, `advance()` was able to run and change the state. When `run()` resumed, it found a different value.

> **Important:** The main actor serializes jobs, not complete `async` functions. Every resumption on the main actor runs as a new job; another run loop turn can run between suspension and resumption.
{: .doc-callout .doc-callout--important}

The nuance is in the `await`: it is not every `await`, but every resumption that returns to the main actor. An `await` that does not suspend does not open the door to another job.

## Why not mix mechanisms

Reentrancy explains why state can change between two stretches of a function. Ordering explains why two ways of returning to the main actor are not equivalent.

There are several ways to return to the main actor, and they are not interchangeable:

- **`DispatchQueue.main.async`:** runs the block on the main queue. It does not propagate task-local values and is not structured.
- **`Task { @MainActor in ... }`:** runs on the main actor. It may inherit priority and task-local values from the context; if you keep the task, you can request its cancellation, but it is still an unstructured task.
- **`Task.detached { @MainActor in ... }`:** the body runs on the main actor through `@MainActor`, but the task is detached; it does not inherit the actor context or task-local values.
- **`await MainActor.run { ... }`:** runs the closure on the main actor without creating a new task; if you are not already on the actor, the function suspends and resumes afterward.

`DispatchQueue.main.async` belongs to GCD. It does not participate in Swift's task structure, does not propagate task-local values, and does not share Swift tasks' ordering guarantees. `Task { @MainActor in ... }` creates a task and can inherit context. `Task.detached` deliberately breaks that link. `MainActor.run` is an explicit way to run a closure on the main actor inside an `async` function.

> **Important:** `Task.detached` does not return to the main actor by itself. If you do not add `@MainActor` or `MainActor.run`, it runs outside the main actor. There is no API called `async main detach`.
{: .doc-callout .doc-callout--important}

The problem with mixing them is not that one is better than another, but that they do not share the same scheduling mechanism or the same ordering guarantees. There is no ordering guarantee between a `DispatchQueue.main.async` and a `Task { @MainActor in }`. Add an `await MainActor.run` in the middle, and the order can change again.

## Swift 6.2: what changes and what stays opt-in

Swift 6.2 added two pieces that directly affect this problem.

The first is **default isolation on `MainActor`**. With `-default-isolation MainActor` — or the equivalent Xcode setting — unannotated declarations in a module become isolated to the main actor. New Xcode 26 projects often start with that setting. It is convenient for a UI-heavy app, but it is a per-module decision: a shared library or a networking layer may not want that default.

The second is the `nonisolated(nonsending)` behavior. With the `NonisolatedNonsendingByDefault` upcoming feature — enabled by the Approachable Concurrency setting — nonisolated `async` functions run on the caller's actor by default; if the caller is not isolated, they use the global executor. If you call them from the main actor, they stay on the main actor. To force them onto a global executor, use `@concurrent`.

```swift
import Foundation

struct MetadataLoader: Sendable {
    nonisolated func load() async -> String {
        // Swift 6.2 + NonisolatedNonsendingByDefault:
        // if called from the main actor, it stays on the main actor.
        "metadata"
    }

    @concurrent
    func decode() async -> Data {
        // Always leaves for the global executor.
        Data()
    }
}
```

That snippet requires Swift 6.2; the behavior of `load()` also requires `NonisolatedNonsendingByDefault`. It does not compile with Swift 6.0. The key idea is this: with this feature, `nonisolated` no longer automatically means "off the caller's actor". If you want to leave, ask for `@concurrent`.

## Practical rules

There is no single correct way, but there is good discipline:

- **One convention per module.** If the module uses Swift concurrency, return to the main actor with `Task { @MainActor in }` or `await MainActor.run`. If it integrates GCD code, isolate that code in an adapter instead of spreading it everywhere.
- **Isolate at the type level, not at every call.** Mark the view model as `@MainActor` and let the compiler check its accesses. Do not fill every method with `MainActor.run`.
- **Revalidate after an `await`.** The state you read before suspending may have changed. If the operation depends on a specific version of the state, check it when you return.
- **Do not use `@unchecked Sendable` to silence the compiler.** If you need it, document why the type is safe and which invariant it maintains.
- **Reserve `assumeIsolated` for callbacks that already run on the main actor.** If you cannot prove it, use a normal hop to the actor.
- **Avoid `Task.detached` unless you really want to lose context.** For work that must leave the main actor, `@concurrent` usually expresses the intent better.

## Conclusion

`@MainActor` is a great tool for UI state. It is also a source of subtle bugs when isolation is confused with total safety.

The compiler tells you where you can touch state. It does not tell you when, in what order, or what changed while you were waiting. That part is still concurrency design.

If you have to remember one sentence: **`@MainActor` guarantees isolation, not immunity**.

## References

- [MainActor](https://developer.apple.com/documentation/swift/mainactor)
- [`MainActor.assumeIsolated`](https://developer.apple.com/documentation/swift/mainactor/assumeisolated%28_%3Afile%3Aline%3A%29)
- [Swift 6.2 released](https://www.swift.org/blog/swift-6.2-released/)
- [SE-0461: Run nonisolated async functions on the caller's actor by default](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0461-async-function-isolation.md)
- [SE-0466: Control default actor isolation inference](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0466-control-default-actor-isolation.md)
- [nonisolated(nonsending) by default](https://docs.swift.org/compiler/documentation/diagnostics/nonisolated-nonsending-by-default/)
- [WWDC25: Embracing Swift concurrency](https://developer.apple.com/videos/play/wwdc2025/268/)

</div>
